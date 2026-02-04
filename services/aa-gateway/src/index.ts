import { type Hex, slice, hexToBigInt, toHex, pad } from "viem";
import { config } from "./config.js";
import { validateUserOp, type UserOp } from "./validation.js";
import { signPaymasterData } from "./paymaster.js";

const server = Bun.serve({
  port: config.port,
  async fetch(req) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/health" && req.method === "GET") {
      return Response.json({ ok: true, chainId: config.chainId });
    }

    // POST /quotePaymaster — validate unsigned UserOp, return paymasterAndData
    if (url.pathname === "/quotePaymaster" && req.method === "POST") {
      return handleQuotePaymaster(req);
    }

    // POST /sendUserOp — re-validate signed UserOp, forward to bundler
    if (url.pathname === "/sendUserOp" && req.method === "POST") {
      return handleSendUserOp(req);
    }

    return Response.json({ error: "not found" }, { status: 404 });
  },
});

console.log(`AA Gateway listening on port ${config.port}`);
console.log(`  Chain ID: ${config.chainId}`);
console.log(`  Factory: ${config.factory}`);
console.log(`  Paymaster: ${config.paymaster}`);
console.log(`  ScrobbleV4: ${config.scrobbleV4}`);
console.log(`  Bundler: ${config.bundlerUrl}`);

// ── Step 1: Quote Paymaster ─────────────────────────────────────────────

async function handleQuotePaymaster(req: Request): Promise<Response> {
  let body: { userOp: UserOp };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.userOp) {
    return Response.json({ error: "missing userOp" }, { status: 400 });
  }

  const op = body.userOp;

  // Validate
  const result = await validateUserOp(op);
  if (!result.ok) {
    console.log(`[quotePaymaster] REJECTED: ${result.error}`);
    return Response.json({ error: result.error }, { status: 403 });
  }

  console.log(
    `[quotePaymaster] OK: user=${result.user} target=${result.target} selector=${result.innerSelector}`,
  );

  // Sign paymaster approval
  try {
    const { paymasterAndData, validUntil, validAfter } =
      await signPaymasterData(op);

    return Response.json({
      paymasterAndData,
      validUntil,
      validAfter,
    });
  } catch (e) {
    console.error("[quotePaymaster] signing error:", e);
    return Response.json(
      { error: "paymaster signing failed" },
      { status: 500 },
    );
  }
}

// ── Step 2: Send UserOp ─────────────────────────────────────────────────

async function handleSendUserOp(req: Request): Promise<Response> {
  let body: { userOp: UserOp };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.userOp) {
    return Response.json({ error: "missing userOp" }, { status: 400 });
  }

  const op = body.userOp;

  // Re-validate (defense-in-depth — all checks except impl slot to keep it fast)
  // We create a copy without paymasterAndData for validation
  const validationOp = { ...op, paymasterAndData: "0x" as `0x${string}` };
  const result = await validateUserOp(validationOp);
  if (!result.ok) {
    console.log(`[sendUserOp] REJECTED: ${result.error}`);
    return Response.json({ error: result.error }, { status: 403 });
  }

  // Verify paymasterAndData starts with our paymaster address
  if (
    !op.paymasterAndData ||
    op.paymasterAndData.length < 42 ||
    op.paymasterAndData.slice(0, 42).toLowerCase() !==
      config.paymaster.toLowerCase()
  ) {
    return Response.json(
      { error: "paymasterAndData does not reference our paymaster" },
      { status: 403 },
    );
  }

  // Verify signature is present
  if (!op.signature || op.signature === "0x") {
    return Response.json(
      { error: "missing user signature" },
      { status: 400 },
    );
  }

  console.log(
    `[sendUserOp] forwarding: user=${result.user} sender=${op.sender}`,
  );

  // Unpack v0.7 packed fields into the RPC format Alto expects
  // accountGasLimits: verificationGasLimit (16 bytes) || callGasLimit (16 bytes)
  const accountGasLimitsBn = hexToBigInt(op.accountGasLimits);
  const verificationGasLimit = toHex(accountGasLimitsBn >> 128n);
  const callGasLimit = toHex(accountGasLimitsBn & ((1n << 128n) - 1n));

  // gasFees: maxPriorityFeePerGas (16 bytes) || maxFeePerGas (16 bytes)
  const gasFeesBn = hexToBigInt(op.gasFees);
  const maxPriorityFeePerGas = toHex(gasFeesBn >> 128n);
  const maxFeePerGas = toHex(gasFeesBn & ((1n << 128n) - 1n));

  // initCode → factory + factoryData
  let factory: Hex | undefined;
  let factoryData: Hex | undefined;
  if (op.initCode && op.initCode !== "0x" && op.initCode.length > 42) {
    factory = slice(op.initCode, 0, 20) as Hex;
    factoryData = slice(op.initCode, 20) as Hex;
  }

  // paymasterAndData → paymaster + paymasterVerificationGasLimit + paymasterPostOpGasLimit + paymasterData
  // Layout: paymaster(20) + paymasterVerificationGasLimit(16) + paymasterPostOpGasLimit(16) + paymasterData
  let paymaster: Hex | undefined;
  let paymasterVerificationGasLimit: Hex | undefined;
  let paymasterPostOpGasLimit: Hex | undefined;
  let paymasterData: Hex | undefined;
  if (op.paymasterAndData && op.paymasterAndData !== "0x" && op.paymasterAndData.length > 42) {
    paymaster = slice(op.paymasterAndData, 0, 20) as Hex;
    // bytes 20-36: paymasterVerificationGasLimit (16 bytes = uint128)
    paymasterVerificationGasLimit = toHex(hexToBigInt(slice(op.paymasterAndData, 20, 36) as Hex));
    // bytes 36-52: paymasterPostOpGasLimit (16 bytes = uint128)
    paymasterPostOpGasLimit = toHex(hexToBigInt(slice(op.paymasterAndData, 36, 52) as Hex));
    // bytes 52+: paymasterData
    paymasterData = slice(op.paymasterAndData, 52) as Hex;
  }

  // Forward to bundler via JSON-RPC (unpacked v0.7 format)
  try {
    const bundlerResponse = await fetch(config.bundlerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendUserOperation",
        params: [
          {
            sender: op.sender,
            nonce: op.nonce,
            callData: op.callData,
            callGasLimit,
            verificationGasLimit,
            preVerificationGas: op.preVerificationGas,
            maxFeePerGas,
            maxPriorityFeePerGas,
            signature: op.signature,
            ...(factory ? { factory, factoryData } : {}),
            ...(paymaster ? { paymaster, paymasterVerificationGasLimit, paymasterPostOpGasLimit, paymasterData } : {}),
          },
          config.entryPoint,
        ],
      }),
    });

    const bundlerResult = await bundlerResponse.json();

    if (bundlerResult.error) {
      console.error("[sendUserOp] bundler error:", bundlerResult.error);
      return Response.json(
        { error: "bundler rejected", detail: bundlerResult.error },
        { status: 502 },
      );
    }

    console.log(
      `[sendUserOp] SUCCESS: userOpHash=${bundlerResult.result}`,
    );
    return Response.json({ userOpHash: bundlerResult.result });
  } catch (e) {
    console.error("[sendUserOp] bundler unreachable:", e);
    return Response.json(
      { error: "bundler unreachable" },
      { status: 502 },
    );
  }
}
