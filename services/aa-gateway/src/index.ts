import {
  type Address,
  type Hex,
  slice,
  hexToBigInt,
  toHex,
  pad,
  createPublicClient,
  http,
} from "viem";
import { getUserOperationHash } from "viem/account-abstraction";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";
import { validateUserOp, type UserOp } from "./validation.js";
import { signPaymasterData } from "./paymaster.js";

/** Check Bearer token if GATEWAY_API_KEY is configured. */
function checkAuth(req: Request): Response | null {
  if (!config.gatewayApiKey) return null; // auth disabled
  const auth = req.headers.get("authorization");
  if (!auth || auth !== `Bearer ${config.gatewayApiKey}`) {
    return corsJson({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function corsJson(data: unknown, init?: ResponseInit): Response {
  const res = Response.json(data, init);
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

const server = Bun.serve({
  port: config.port,
  async fetch(req) {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    // Health check (no auth required)
    if (url.pathname === "/health" && req.method === "GET") {
      return corsJson({
        ok: true,
        chainId: config.chainId,
        entryPoint: config.entryPoint,
        factory: config.factory,
        paymaster: config.paymaster,
        paymasterSigner: paymasterSignerFromKey ?? undefined,
        paymasterSignerOnChain: paymasterSignerOnChain ?? undefined,
        paymasterSignerMatch: paymasterSignerMatch ?? undefined,
        rpcUrl: config.rpcUrl,
        bundlerUrl: config.bundlerUrl,
      });
    }

    // POST /quotePaymaster — validate unsigned UserOp, return paymasterAndData
    if (url.pathname === "/quotePaymaster" && req.method === "POST") {
      const authErr = checkAuth(req);
      if (authErr) return authErr;
      return handleQuotePaymaster(req);
    }

    // POST /sendUserOp — re-validate signed UserOp, forward to bundler
    if (url.pathname === "/sendUserOp" && req.method === "POST") {
      const authErr = checkAuth(req);
      if (authErr) return authErr;
      return handleSendUserOp(req);
    }

    return corsJson({ error: "not found" }, { status: 404 });
  },
});

console.log(`AA Gateway listening on port ${config.port}`);
console.log(`  Chain ID: ${config.chainId}`);
console.log(`  Factory: ${config.factory}`);
console.log(`  Paymaster: ${config.paymaster}`);
console.log(`  ScrobbleV4: ${config.scrobbleV4}`);
console.log(`  Bundler: ${config.bundlerUrl}`);
console.log(`  Auth: ${config.gatewayApiKey ? "enabled" : "disabled (no GATEWAY_API_KEY)"}`);

// ── Paymaster signer sanity check ─────────────────────────────────────────
const rpcClient = createPublicClient({
  transport: http(config.rpcUrl),
});

let paymasterSignerFromKey: Address | null = null;
let paymasterSignerOnChain: Address | null = null;
let paymasterSignerMatch: boolean | null = null;

async function initPaymasterSignerCheck(): Promise<void> {
  try {
    if (config.paymasterSignerKey) {
      paymasterSignerFromKey = privateKeyToAccount(
        config.paymasterSignerKey,
      ).address;
      console.log(`  Paymaster signer (from key): ${paymasterSignerFromKey}`);
    }
  } catch (err) {
    console.warn("[paymaster] Failed to derive signer from key:", err);
  }

  try {
    paymasterSignerOnChain = await rpcClient.readContract({
      address: config.paymaster,
      abi: [
        {
          name: "verifyingSigner",
          type: "function",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "address" }],
        },
      ],
      functionName: "verifyingSigner",
    });
    console.log(
      `  Paymaster verifyingSigner (on-chain): ${paymasterSignerOnChain}`,
    );
  } catch (err) {
    console.warn("[paymaster] Failed to read verifyingSigner:", err);
  }

  if (paymasterSignerFromKey && paymasterSignerOnChain) {
    paymasterSignerMatch =
      paymasterSignerFromKey.toLowerCase() ===
      paymasterSignerOnChain.toLowerCase();
    if (!paymasterSignerMatch) {
      console.error(
        `[paymaster] SIGNER MISMATCH: key=${paymasterSignerFromKey} on-chain=${paymasterSignerOnChain}`,
      );
    }
  }
}

void initPaymasterSignerCheck();

// ── Step 1: Quote Paymaster ─────────────────────────────────────────────

async function handleQuotePaymaster(req: Request): Promise<Response> {
  let body: { userOp: UserOp; userOpHash?: Hex };
  try {
    body = await req.json();
  } catch {
    return corsJson({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.userOp) {
    return corsJson({ error: "missing userOp" }, { status: 400 });
  }

  const op = body.userOp;
  const clientUserOpHash = body.userOpHash;

  // Validate
  const result = await validateUserOp(op);
  if (!result.ok) {
    console.log(`[quotePaymaster] REJECTED: ${result.error}`);
    return corsJson({ error: result.error }, { status: 403 });
  }

  console.log(
    `[quotePaymaster] OK: user=${result.user} target=${result.target} selector=${result.innerSelector}`,
  );

  // Sign paymaster approval
  try {
    const { paymasterAndData, validUntil, validAfter } =
      await signPaymasterData(op);

    return corsJson({
      paymasterAndData,
      validUntil,
      validAfter,
    });
  } catch (e) {
    console.error("[quotePaymaster] signing error:", e);
    return corsJson(
      { error: "paymaster signing failed" },
      { status: 500 },
    );
  }
}

// ── Step 2: Send UserOp ─────────────────────────────────────────────────

async function handleSendUserOp(req: Request): Promise<Response> {
  let body: { userOp: UserOp; userOpHash?: Hex };
  try {
    body = await req.json();
  } catch {
    return corsJson({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.userOp) {
    return corsJson({ error: "missing userOp" }, { status: 400 });
  }

  const op = body.userOp;
  const clientUserOpHash = body.userOpHash;

  // Re-validate (defense-in-depth — all checks except impl slot to keep it fast)
  // We create a copy without paymasterAndData for validation
  const validationOp = { ...op, paymasterAndData: "0x" as `0x${string}` };
  const result = await validateUserOp(validationOp);
  if (!result.ok) {
    console.log(`[sendUserOp] REJECTED: ${result.error}`);
    return corsJson({ error: result.error }, { status: 403 });
  }

  // Verify paymasterAndData starts with our paymaster address
  if (
    !op.paymasterAndData ||
    op.paymasterAndData.length < 42 ||
    op.paymasterAndData.slice(0, 42).toLowerCase() !==
      config.paymaster.toLowerCase()
  ) {
    return corsJson(
      { error: "paymasterAndData does not reference our paymaster" },
      { status: 403 },
    );
  }

  // Verify signature is present
  if (!op.signature || op.signature === "0x") {
    return corsJson(
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
  let factory: Hex | null = null;
  let factoryData: Hex | null = null;
  if (op.initCode && op.initCode !== "0x" && op.initCode.length > 42) {
    factory = slice(op.initCode, 0, 20) as Hex;
    factoryData = slice(op.initCode, 20) as Hex;
  }

  // paymasterAndData → paymaster + paymasterVerificationGasLimit + paymasterPostOpGasLimit + paymasterData
  // Layout: paymaster(20) + paymasterVerificationGasLimit(16) + paymasterPostOpGasLimit(16) + paymasterData
  let paymaster: Hex | null = null;
  let paymasterVerificationGasLimit: Hex | null = null;
  let paymasterPostOpGasLimit: Hex | null = null;
  let paymasterData: Hex | null = null;
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
    const bundlerUserOp = {
      sender: op.sender,
      nonce: op.nonce,
      callData: op.callData,
      callGasLimit,
      verificationGasLimit,
      preVerificationGas: op.preVerificationGas,
      maxFeePerGas,
      maxPriorityFeePerGas,
      signature: op.signature,
      // Always include v0.7 fields (null when unused) so the bundler
      // classifies this as a v0.7 UserOperation.
      factory,
      factoryData,
      paymaster,
      paymasterVerificationGasLimit,
      paymasterPostOpGasLimit,
      paymasterData,
    }

  let computedUserOpHash: Hex | null = null
  if (clientUserOpHash) {
    try {
      const debugUserOp = {
        ...bundlerUserOp,
        factory: bundlerUserOp.factory ?? undefined,
        factoryData: bundlerUserOp.factoryData ?? undefined,
        paymaster: bundlerUserOp.paymaster ?? undefined,
        paymasterVerificationGasLimit: bundlerUserOp.paymasterVerificationGasLimit ?? undefined,
        paymasterPostOpGasLimit: bundlerUserOp.paymasterPostOpGasLimit ?? undefined,
        paymasterData: bundlerUserOp.paymasterData ?? undefined,
      }
      computedUserOpHash = getUserOperationHash({
        chainId: config.chainId,
        entryPointAddress: config.entryPoint,
        entryPointVersion: "0.7",
        userOperation: debugUserOp as any,
      })
      const match = computedUserOpHash.toLowerCase() === clientUserOpHash.toLowerCase()
      if (!match) {
        return corsJson(
          {
            error: "userOpHash mismatch",
            clientUserOpHash,
            computedUserOpHash,
          },
          { status: 400 },
        )
      }
    } catch (err) {
      console.warn("[sendUserOp] Failed to compute userOpHash:", err)
    }
  }

  if (process.env.DEBUG_USEROP === "1") {
    const redacted = {
      ...bundlerUserOp,
      signature: op.signature ? `${op.signature.slice(0, 12)}...` : op.signature,
      factoryData: factoryData ? `${factoryData.slice(0, 12)}...` : factoryData,
      paymasterData: paymasterData ? `${paymasterData.slice(0, 12)}...` : paymasterData,
    }
    console.log("[sendUserOp] bundler userOp (redacted):", JSON.stringify(redacted))
    if (clientUserOpHash && computedUserOpHash) {
      const match = computedUserOpHash.toLowerCase() === clientUserOpHash.toLowerCase()
      console.log(
        `[sendUserOp] userOpHash client=${clientUserOpHash} computed=${computedUserOpHash} match=${match}`,
      )
    }
  }

    const bundlerResponse = await fetch(config.bundlerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendUserOperation",
        params: [bundlerUserOp, config.entryPoint],
      }),
    });

    const bundlerResult = await bundlerResponse.json();

    if (bundlerResult.error) {
      console.error("[sendUserOp] bundler error:", bundlerResult.error);
      return corsJson(
        { error: "bundler rejected", detail: bundlerResult.error },
        { status: 502 },
      );
    }

    console.log(
      `[sendUserOp] SUCCESS: userOpHash=${bundlerResult.result}`,
    );
    return corsJson({ userOpHash: bundlerResult.result });
  } catch (e) {
    console.error("[sendUserOp] bundler unreachable:", e);
    return corsJson(
      { error: "bundler unreachable" },
      { status: 502 },
    );
  }
}
