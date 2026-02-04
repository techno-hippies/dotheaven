/**
 * E2E test: Full UserOp flow against MegaETH testnet.
 *
 * 1. Compute sender = FACTORY.getAddress(user, 0)
 * 2. Build unsigned UserOp calling ScrobbleV4.registerAndScrobbleBatch()
 * 3. POST /quotePaymaster → get paymasterAndData
 * 4. Compute userOpHash and sign with test EOA
 * 5. POST /sendUserOp → forward to bundler
 * 6. Poll for receipt and verify Scrobbled event
 *
 * Usage:
 *   bun run src/e2e-test.ts
 */

import {
  type Address,
  type Hex,
  createPublicClient,
  http,
  encodeFunctionData,
  encodeAbiParameters,
  keccak256,
  pad,
  toHex,
  concat,
  hexToBigInt,
  parseAbiItem,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ── Config ──────────────────────────────────────────────────────────────

const RPC_URL = "https://carrot.megaeth.com/rpc";
const GATEWAY_URL = "http://127.0.0.1:3337";
const CHAIN_ID = 6343;

// Deployed contracts
const ENTRYPOINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as Address;
const FACTORY = "0xB66BF4066F40b36Da0da34916799a069CBc79408" as Address;
const SCROBBLE_V4 = "0xD41a8991aDF67a1c4CCcb5f7Da6A01a601eC3F37" as Address;

// Test user — use a fresh throwaway key
// In production this is the user's PKP. For testing, just a random EOA.
const TEST_USER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const testUser = privateKeyToAccount(TEST_USER_KEY);
const USER_EOA = testUser.address;

const client = createPublicClient({ transport: http(RPC_URL) });

// ── ABIs ────────────────────────────────────────────────────────────────

const factoryAbi = [
  {
    name: "getAddress",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "uint256" },
    ],
    outputs: [{ type: "address" }],
  },
] as const;

const executeAbi = [
  {
    name: "execute",
    type: "function",
    inputs: [
      { name: "dest", type: "address" },
      { name: "value", type: "uint256" },
      { name: "func", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const scrobbleAbi = [
  {
    name: "registerAndScrobbleBatch",
    type: "function",
    inputs: [
      { name: "user", type: "address" },
      { name: "regKinds", type: "uint8[]" },
      { name: "regPayloads", type: "bytes32[]" },
      { name: "titles", type: "string[]" },
      { name: "artists", type: "string[]" },
      { name: "albums", type: "string[]" },
      { name: "trackIds", type: "bytes32[]" },
      { name: "timestamps", type: "uint64[]" },
    ],
    outputs: [],
  },
] as const;

const entryPointAbi = [
  {
    name: "getNonce",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "sender", type: "address" },
      { name: "key", type: "uint192" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getUserOpHash",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "userOp",
        type: "tuple",
        components: [
          { name: "sender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "initCode", type: "bytes" },
          { name: "callData", type: "bytes" },
          { name: "accountGasLimits", type: "bytes32" },
          { name: "preVerificationGas", type: "uint256" },
          { name: "gasFees", type: "bytes32" },
          { name: "paymasterAndData", type: "bytes" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [{ type: "bytes32" }],
  },
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────

function packUints(high128: bigint, low128: bigint): Hex {
  return pad(toHex((high128 << 128n) | low128), { size: 32 });
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== AA E2E Test ===");
  console.log(`User EOA: ${USER_EOA}`);

  // 1. Get sender (user's SimpleAccount address)
  const sender = (await client.readContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: "getAddress",
    args: [USER_EOA, 0n],
  })) as Address;
  console.log(`Sender (SimpleAccount): ${sender}`);

  // 2. Check if account is already deployed
  const code = await client.getCode({ address: sender });
  const needsInit = !code || code === "0x";
  console.log(`Account deployed: ${!needsInit}`);

  // 3. Build initCode (if needed)
  let initCode: Hex = "0x";
  if (needsInit) {
    const createAccountCalldata = encodeFunctionData({
      abi: [
        {
          name: "createAccount",
          type: "function",
          inputs: [
            { name: "owner", type: "address" },
            { name: "salt", type: "uint256" },
          ],
          outputs: [{ type: "address" }],
        },
      ],
      functionName: "createAccount",
      args: [USER_EOA, 0n],
    });
    initCode = concat([FACTORY, createAccountCalldata]);
    console.log(`initCode: ${initCode.slice(0, 50)}...`);
  }

  // 4. Get nonce from EntryPoint
  const nonce = await client.readContract({
    address: ENTRYPOINT,
    abi: entryPointAbi,
    functionName: "getNonce",
    args: [sender, 0n],
  });
  console.log(`Nonce: ${nonce}`);

  // 5. Build inner calldata: registerAndScrobbleBatch
  //    Register one track + scrobble it
  const payload = keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "string" }, { type: "string" }],
      ["E2E Test Song", "E2E Artist", "E2E Album"],
    ),
  );
  const trackId = keccak256(
    encodeAbiParameters(
      [{ type: "uint8" }, { type: "bytes32" }],
      [3, payload],
    ),
  );
  const timestamp = BigInt(Math.floor(Date.now() / 1000));

  const innerCalldata = encodeFunctionData({
    abi: scrobbleAbi,
    functionName: "registerAndScrobbleBatch",
    args: [
      USER_EOA, // user
      [3], // regKinds
      [payload], // regPayloads
      ["E2E Test Song"], // titles
      ["E2E Artist"], // artists
      ["E2E Album"], // albums
      [trackId], // trackIds
      [timestamp], // timestamps
    ],
  });

  // 6. Build outer calldata: execute(ScrobbleV4, 0, innerCalldata)
  const callData = encodeFunctionData({
    abi: executeAbi,
    functionName: "execute",
    args: [SCROBBLE_V4, 0n, innerCalldata],
  });

  // 7. Pack gas params
  // MegaETH has ~0.001 gwei gas price
  const verificationGasLimit = 2_000_000n; // MegaEVM needs ~1.65M for proxy deploy + init
  const callGasLimit = 2_000_000n;
  const maxPriorityFeePerGas = 1_000_000n; // 0.001 gwei
  const maxFeePerGas = 2_000_000n;
  const preVerificationGas = 100_000n;

  const accountGasLimits = packUints(verificationGasLimit, callGasLimit);
  const gasFees = packUints(maxPriorityFeePerGas, maxFeePerGas);

  // 8. Build unsigned UserOp
  const userOp = {
    sender,
    nonce: toHex(nonce),
    initCode,
    callData,
    accountGasLimits,
    preVerificationGas: toHex(preVerificationGas),
    gasFees,
    paymasterAndData: "0x" as Hex,
    signature: "0x" as Hex,
  };

  console.log("\n--- Step 1: POST /quotePaymaster ---");
  const quoteRes = await fetch(`${GATEWAY_URL}/quotePaymaster`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userOp }),
  });

  if (!quoteRes.ok) {
    const err = await quoteRes.json();
    console.error("Quote failed:", err);
    process.exit(1);
  }

  const quoteData = (await quoteRes.json()) as {
    paymasterAndData: Hex;
    validUntil: number;
    validAfter: number;
  };
  console.log(
    `paymasterAndData: ${quoteData.paymasterAndData.slice(0, 60)}...`,
  );
  console.log(
    `validity: ${quoteData.validAfter} → ${quoteData.validUntil}`,
  );

  // 9. Attach paymasterAndData
  userOp.paymasterAndData = quoteData.paymasterAndData;

  // 10. Compute userOpHash and sign
  //     userOpHash = keccak256(abi.encode(keccak256(pack(userOp)), entryPoint, chainId))
  //     For v0.7 EntryPoint, use the on-chain getUserOpHash
  console.log("\n--- Step 2: Sign UserOp ---");

  const userOpHash = (await client.readContract({
    address: ENTRYPOINT,
    abi: entryPointAbi,
    functionName: "getUserOpHash",
    args: [
      {
        sender: userOp.sender,
        nonce: BigInt(userOp.nonce),
        initCode: userOp.initCode,
        callData: userOp.callData,
        accountGasLimits: userOp.accountGasLimits as `0x${string}`,
        preVerificationGas: BigInt(userOp.preVerificationGas),
        gasFees: userOp.gasFees as `0x${string}`,
        paymasterAndData: userOp.paymasterAndData,
        signature: "0x",
      },
    ],
  })) as Hex;

  console.log(`userOpHash: ${userOpHash}`);

  // Sign: toEthSignedMessageHash(userOpHash) — matches SimpleAccount._validateSignature
  const signature = await testUser.signMessage({
    message: { raw: userOpHash as `0x${string}` },
  });
  userOp.signature = signature;
  console.log(`signature: ${signature.slice(0, 20)}...`);

  // 11. POST /sendUserOp
  console.log("\n--- Step 3: POST /sendUserOp ---");
  const sendRes = await fetch(`${GATEWAY_URL}/sendUserOp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userOp }),
  });

  const sendData = await sendRes.json();
  if (!sendRes.ok) {
    console.error("Send failed:", sendData);
    process.exit(1);
  }

  console.log(`userOpHash (from bundler): ${sendData.userOpHash}`);

  // 12. Poll for receipt
  console.log("\n--- Step 4: Polling for receipt ---");
  let receipt = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    try {
      const pollRes = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getUserOperationReceipt",
          params: [sendData.userOpHash],
        }),
      });
      const pollData = (await pollRes.json()) as any;
      if (pollData.result) {
        receipt = pollData.result;
        break;
      }
    } catch {
      // RPC may not support this method — fall back to tx receipt
    }

    // Fallback: check if the account got created (for first-time ops)
    if (needsInit) {
      const newCode = await client.getCode({ address: sender });
      if (newCode && newCode !== "0x") {
        console.log(`  Account deployed at ${sender}!`);
      }
    }

    process.stdout.write(".");
  }

  if (receipt) {
    console.log("\nReceipt received!");
    console.log(`  success: ${receipt.success}`);
    console.log(`  actualGasCost: ${receipt.actualGasCost}`);
    console.log(`  logs: ${receipt.logs?.length ?? 0}`);
  } else {
    console.log(
      "\nNo receipt after 60s — check bundler logs for the tx hash.",
    );
  }

  // 13. Verify track was registered
  console.log("\n--- Step 5: Verify on-chain state ---");
  try {
    const isRegistered = await client.readContract({
      address: SCROBBLE_V4,
      abi: [
        {
          name: "isRegistered",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "trackId", type: "bytes32" }],
          outputs: [{ type: "bool" }],
        },
      ],
      functionName: "isRegistered",
      args: [trackId],
    });
    console.log(`Track registered: ${isRegistered}`);
  } catch (e) {
    console.log(`Track check failed (expected if op hasn't landed yet): ${e}`);
  }

  console.log("\n=== E2E Test Complete ===");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
