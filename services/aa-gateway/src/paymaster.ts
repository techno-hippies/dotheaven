import {
  type Address,
  type Hex,
  encodeAbiParameters,
  keccak256,
  toHex,
  pad,
  concat,
  hexToBigInt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";
import type { UserOp } from "./validation.js";

const signerAccount = privateKeyToAccount(config.paymasterSignerKey);

// Paymaster gas limits for v0.7 paymasterAndData
const PAYMASTER_VERIFICATION_GAS_LIMIT = 200_000n;
const PAYMASTER_POST_OP_GAS_LIMIT = 50_000n;

/**
 * VerifyingPaymaster v0.7 getHash() — exact reproduction of on-chain logic.
 *
 * From VerifyingPaymaster.sol:
 *   keccak256(abi.encode(
 *       sender,
 *       userOp.nonce,
 *       keccak256(userOp.initCode),
 *       keccak256(userOp.callData),
 *       userOp.accountGasLimits,
 *       uint256(bytes32(userOp.paymasterAndData[20:52])),  // gas limits
 *       userOp.preVerificationGas,
 *       userOp.gasFees,
 *       block.chainid,
 *       address(this),
 *       validUntil,
 *       validAfter
 *   ))
 *
 * Note: paymasterAndData[20:52] = paymasterVerificationGasLimit(16) ++ paymasterPostOpGasLimit(16)
 * This is known at signing time because we set these values ourselves.
 */
export function getPaymasterHash(
  op: UserOp,
  validUntil: number,
  validAfter: number,
): Hex {
  // paymasterAndData[20:52] as uint256 — the 32 bytes of gas limits
  // We know these values because we set them ourselves
  const paymasterGasBytes = concat([
    pad(toHex(PAYMASTER_VERIFICATION_GAS_LIMIT), { size: 16 }),
    pad(toHex(PAYMASTER_POST_OP_GAS_LIMIT), { size: 16 }),
  ]);
  const paymasterGasUint256 = hexToBigInt(paymasterGasBytes as Hex);

  // Single flat abi.encode matching the contract exactly
  const encoded = encodeAbiParameters(
    [
      { type: "address" },  // sender
      { type: "uint256" },  // nonce
      { type: "bytes32" },  // keccak256(initCode)
      { type: "bytes32" },  // keccak256(callData)
      { type: "bytes32" },  // accountGasLimits
      { type: "uint256" },  // uint256(bytes32(paymasterAndData[20:52]))
      { type: "uint256" },  // preVerificationGas
      { type: "bytes32" },  // gasFees
      { type: "uint256" },  // block.chainid
      { type: "address" },  // address(this)
      { type: "uint48" },   // validUntil
      { type: "uint48" },   // validAfter
    ],
    [
      op.sender,
      hexToBigInt(op.nonce),
      keccak256(op.initCode),
      keccak256(op.callData),
      op.accountGasLimits as `0x${string}`,
      paymasterGasUint256,
      hexToBigInt(op.preVerificationGas),
      op.gasFees as `0x${string}`,
      BigInt(config.chainId),
      config.paymaster,
      validUntil,
      validAfter,
    ],
  );

  return keccak256(encoded);
}

/**
 * Signs a UserOp approval and returns the paymasterAndData bytes.
 *
 * paymasterAndData layout (VerifyingPaymaster v0.7):
 *   [0:20]   paymaster address
 *   [20:36]  paymasterVerificationGasLimit (uint128, big-endian)
 *   [36:52]  paymasterPostOpGasLimit (uint128, big-endian)
 *   [52:]    paymasterData = abi.encode(validUntil, validAfter) ++ signature
 *
 * parsePaymasterAndData reads:
 *   (validUntil, validAfter) = abi.decode(paymasterAndData[52:], (uint48, uint48))
 *   signature = paymasterAndData[52+64:]   (SIGNATURE_OFFSET = VALID_TIMESTAMP_OFFSET + 64)
 *
 * So paymasterData is: 32 bytes (validUntil padded) + 32 bytes (validAfter padded) + 65 bytes signature
 */
export async function signPaymasterData(
  op: UserOp,
): Promise<{ paymasterAndData: Hex; validUntil: number; validAfter: number }> {
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now - 60; // allow 60s clock skew
  const validUntil = now + config.paymasterValiditySeconds;

  const hash = getPaymasterHash(op, validUntil, validAfter);
  const signature = await signerAccount.signMessage({
    message: { raw: hash },
  });

  // Build paymasterAndData:
  // paymaster (20) + verificationGasLimit (16) + postOpGasLimit (16) + abi.encode(validUntil, validAfter) + signature
  const paymasterVerificationGasLimit = pad(toHex(PAYMASTER_VERIFICATION_GAS_LIMIT), { size: 16 });
  const paymasterPostOpGasLimit = pad(toHex(PAYMASTER_POST_OP_GAS_LIMIT), { size: 16 });

  // abi.encode(uint48 validUntil, uint48 validAfter) — each padded to 32 bytes
  const encodedTimestamps = encodeAbiParameters(
    [{ type: "uint48" }, { type: "uint48" }],
    [validUntil, validAfter],
  );

  const paymasterAndData = concat([
    config.paymaster,
    paymasterVerificationGasLimit,
    paymasterPostOpGasLimit,
    encodedTimestamps,
    signature,
  ]);

  return { paymasterAndData, validUntil, validAfter };
}
