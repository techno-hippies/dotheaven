import { describe, expect, test } from "bun:test";
import {
  decodeAbiParameters,
  hexToBigInt,
  slice,
  toHex,
  type Hex,
  recoverMessageAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Set deterministic env before importing paymaster/config.
process.env.PAYMASTER_SIGNER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
process.env.CHAIN_ID = "1";
process.env.HEAVEN_PAYMASTER = "0x1000000000000000000000000000000000000001";
process.env.PAYMASTER_VALIDITY_SECONDS = "180";

const { getPaymasterHash, signPaymasterData } = await import("./paymaster.js");

const PAYMASTER = "0x1000000000000000000000000000000000000001" as const;
const SIGNER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

const packUint128Pair = (hi: bigint, lo: bigint): Hex =>
  toHex((hi << 128n) | lo, { size: 32 });

type UserOp = {
  sender: Hex;
  nonce: Hex;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex;
  preVerificationGas: Hex;
  gasFees: Hex;
  paymasterAndData: Hex;
  signature: Hex;
};

const userOp: UserOp = {
  sender: "0x1111111111111111111111111111111111111111",
  nonce: "0x01",
  initCode: "0x1234",
  callData: "0xabcd",
  accountGasLimits: packUint128Pair(300_000n, 500_000n),
  preVerificationGas: toHex(21_000n),
  gasFees: packUint128Pair(2n, 10n),
  paymasterAndData: "0x",
  signature: "0x",
};

describe("paymaster hashing", () => {
  test("getPaymasterHash matches frozen test vector", () => {
    const hash = getPaymasterHash(userOp, 1_700_000_100, 1_700_000_000);
    expect(hash).toBe(
      "0x071e90f7a3bb4c6366fe4d4a5a056c8786f8557cdc2ca867d248e09fdaf056c3",
    );
  });
});

describe("paymasterAndData layout", () => {
  test("signPaymasterData encodes timestamps and signature offsets correctly", async () => {
    const originalNow = Date.now;
    Date.now = () => 1_700_000_000_000;
    try {
      const { paymasterAndData, validUntil, validAfter } =
        await signPaymasterData(userOp);

      expect(validAfter).toBe(1_700_000_000 - 60);
      expect(validUntil).toBe(1_700_000_000 + 180);

      // 20 + 16 + 16 + 64 + 65 = 181 bytes
      expect(paymasterAndData.length).toBe(2 + 181 * 2);

      const paymaster = slice(paymasterAndData, 0, 20) as Hex;
      expect(paymaster.toLowerCase()).toBe(PAYMASTER.toLowerCase());

      const verificationGas = hexToBigInt(
        slice(paymasterAndData, 20, 36) as Hex,
      );
      const postOpGas = hexToBigInt(slice(paymasterAndData, 36, 52) as Hex);
      expect(verificationGas).toBe(200_000n);
      expect(postOpGas).toBe(50_000n);

      const encodedTimestamps = slice(paymasterAndData, 52, 116) as Hex;
      const [decodedUntil, decodedAfter] = decodeAbiParameters(
        [{ type: "uint48" }, { type: "uint48" }],
        encodedTimestamps,
      ) as [bigint | number, bigint | number];
      expect(BigInt(decodedUntil)).toBe(BigInt(validUntil));
      expect(BigInt(decodedAfter)).toBe(BigInt(validAfter));

      const signature = slice(paymasterAndData, 116) as Hex;
      expect(signature.length).toBe(2 + 65 * 2);

      const recovered = await recoverMessageAddress({
        message: { raw: getPaymasterHash(userOp, validUntil, validAfter) },
        signature,
      });
      expect(recovered.toLowerCase()).toBe(
        privateKeyToAccount(SIGNER_KEY).address.toLowerCase(),
      );
    } finally {
      Date.now = originalNow;
    }
  });
});
