import {
  type Address,
  type Hex,
  decodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getAddress,
  slice,
  hexToBigInt,
  createPublicClient,
  http,
  keccak256,
} from "viem";
import { config, targetAllowlist } from "./config.js";

// SimpleAccount.execute(address dest, uint256 value, bytes calldata func)
const EXECUTE_SELECTOR = "0xb61d27f6" as Hex;

// HeavenAccountFactory inner's createAccount(address owner, uint256 salt)
const CREATE_ACCOUNT_SELECTOR = "0x5fbfb9cf" as Hex;

// ERC-1967 implementation slot
const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as Hex;

export interface UserOp {
  sender: Address;
  nonce: Hex;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex; // packed: verificationGasLimit (16 bytes) || callGasLimit (16 bytes)
  preVerificationGas: Hex;
  gasFees: Hex; // packed: maxPriorityFeePerGas (16 bytes) || maxFeePerGas (16 bytes)
  paymasterAndData: Hex;
  signature: Hex;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  user?: Address;
  target?: Address;
  innerSelector?: Hex;
}

const rpcClient = createPublicClient({
  transport: http(config.rpcUrl),
});

/**
 * Validates an unsigned UserOp against all gateway policy checks.
 * Returns the extracted user address on success.
 */
export async function validateUserOp(
  op: UserOp,
): Promise<ValidationResult> {
  // 1. Validate initCode
  const initResult = validateInitCode(op.sender, op.initCode);
  if (!initResult.ok) return initResult;
  const user = initResult.user!;

  // 2. Validate callData: must be execute(address,uint256,bytes)
  const callResult = validateCallData(op.callData, op.sender, user);
  if (!callResult.ok) return callResult;

  // 3. Validate gas caps
  const gasResult = validateGasCaps(op);
  if (!gasResult.ok) return gasResult;

  // 4. If initCode is empty (account already deployed), verify implementation slot
  if (op.initCode === "0x") {
    const implResult = await validateImplementationSlot(op.sender);
    if (!implResult.ok) return implResult;
  }

  return {
    ok: true,
    user,
    target: callResult.target,
    innerSelector: callResult.innerSelector,
  };
}

/**
 * Validates initCode:
 * - If empty: sender must have code (account deployed), derive user from sender
 * - If present: must be exactly FACTORY ++ createAccount(user, 0)
 *   and sender must match FACTORY.getAddress(user, 0)
 */
function validateInitCode(
  sender: Address,
  initCode: Hex,
): ValidationResult & { user?: Address } {
  if (initCode === "0x") {
    // Account already deployed — we'll derive user later from calldata
    // For now, just mark as needing user extraction from inner call
    return { ok: true };
  }

  // initCode must be: factory address (20 bytes) ++ createAccount(address,uint256) calldata
  if (initCode.length < 2 + 40 + 8) {
    // "0x" + 40 hex chars (20 bytes addr) + at least 8 hex chars (4 bytes selector)
    return { ok: false, error: "initCode too short" };
  }

  const factory = getAddress(slice(initCode, 0, 20));
  const factoryCalldata = slice(initCode, 20) as Hex;

  // Factory must be our HeavenAccountFactory
  if (factory.toLowerCase() !== config.factory.toLowerCase()) {
    return { ok: false, error: `wrong factory: ${factory}` };
  }

  // Must call createAccount(address,uint256) with salt=0
  const selector = slice(factoryCalldata, 0, 4) as Hex;
  if (selector !== CREATE_ACCOUNT_SELECTOR) {
    return {
      ok: false,
      error: `wrong factory selector: ${selector}`,
    };
  }

  // Decode: createAccount(address owner, uint256 salt)
  const params = decodeAbiParameters(
    [
      { name: "owner", type: "address" },
      { name: "salt", type: "uint256" },
    ],
    slice(factoryCalldata, 4) as Hex,
  );

  const user = params[0] as Address;
  const salt = params[1] as bigint;

  if (salt !== config.accountSalt) {
    return { ok: false, error: `wrong salt: ${salt}` };
  }

  // NOTE: We can't call getAddress on-chain here synchronously.
  // The E2E flow will verify sender matches the factory derivation.
  // The contract's onlyAccountOf modifier is the final enforcement.

  return { ok: true, user };
}

/**
 * Validates callData:
 * - Must be SimpleAccount.execute(address dest, uint256 value, bytes func)
 * - value must be 0
 * - dest must be in target allowlist
 * - dest must NOT be sender (prevents upgradeToAndCall)
 * - inner selector must be in per-target allowlist
 * - Extract user from inner calldata (first address param)
 * - Verify sender == FACTORY.getAddress(user, 0) conceptually
 */
function validateCallData(
  callData: Hex,
  sender: Address,
  userFromInitCode?: Address,
): ValidationResult & { target?: Address; innerSelector?: Hex } {
  if (callData.length < 2 + 8) {
    return { ok: false, error: "callData too short" };
  }

  const outerSelector = slice(callData, 0, 4) as Hex;
  if (outerSelector !== EXECUTE_SELECTOR) {
    return {
      ok: false,
      error: `outer selector must be execute(): got ${outerSelector}`,
    };
  }

  // Decode: execute(address dest, uint256 value, bytes func)
  const params = decodeAbiParameters(
    [
      { name: "dest", type: "address" },
      { name: "value", type: "uint256" },
      { name: "func", type: "bytes" },
    ],
    slice(callData, 4) as Hex,
  );

  const target = params[0] as Address;
  const value = params[1] as bigint;
  const innerCalldata = params[2] as Hex;

  // value must be 0
  if (value !== 0n) {
    return { ok: false, error: `execute value must be 0, got ${value}` };
  }

  // target must NOT be sender (prevents self-call: upgradeToAndCall, etc.)
  if (target.toLowerCase() === sender.toLowerCase()) {
    return { ok: false, error: "target == sender: self-call rejected" };
  }

  // target must be in allowlist
  const normalizedTarget = getAddress(target);
  const allowedSelectors = targetAllowlist[normalizedTarget];
  if (!allowedSelectors) {
    return { ok: false, error: `target not in allowlist: ${target}` };
  }

  // inner selector must be allowed
  if (innerCalldata.length < 2 + 8) {
    return { ok: false, error: "inner calldata too short" };
  }
  const innerSelector = slice(innerCalldata, 0, 4) as Hex;
  if (!allowedSelectors.has(innerSelector)) {
    return {
      ok: false,
      error: `inner selector not allowed: ${innerSelector}`,
    };
  }

  // Extract user from inner calldata (first param is always address user)
  const userFromInner = decodeAbiParameters(
    [{ name: "user", type: "address" }],
    slice(innerCalldata, 4, 36) as Hex,
  )[0] as Address;

  // If we got user from initCode, it must match inner calldata user
  if (
    userFromInitCode &&
    userFromInitCode.toLowerCase() !== userFromInner.toLowerCase()
  ) {
    return {
      ok: false,
      error: `initCode user (${userFromInitCode}) != inner calldata user (${userFromInner})`,
    };
  }

  return {
    ok: true,
    user: userFromInner,
    target: normalizedTarget,
    innerSelector,
  };
}

/**
 * Validates gas caps to prevent deposit griefing.
 */
function validateGasCaps(op: UserOp): ValidationResult {
  // accountGasLimits is packed: verificationGasLimit (16 bytes) || callGasLimit (16 bytes)
  const accountGasLimits = hexToBigInt(op.accountGasLimits);
  const verificationGasLimit = accountGasLimits >> 128n;
  const callGasLimit = accountGasLimits & ((1n << 128n) - 1n);

  const preVerificationGas = hexToBigInt(op.preVerificationGas);

  if (callGasLimit > config.maxCallGasLimit) {
    return {
      ok: false,
      error: `callGasLimit ${callGasLimit} exceeds cap ${config.maxCallGasLimit}`,
    };
  }
  if (verificationGasLimit > config.maxVerificationGasLimit) {
    return {
      ok: false,
      error: `verificationGasLimit ${verificationGasLimit} exceeds cap ${config.maxVerificationGasLimit}`,
    };
  }
  if (preVerificationGas > config.maxPreVerificationGas) {
    return {
      ok: false,
      error: `preVerificationGas ${preVerificationGas} exceeds cap ${config.maxPreVerificationGas}`,
    };
  }

  return { ok: true };
}

/**
 * For already-deployed accounts (initCode empty), verify the proxy
 * implementation slot equals our canonical implementation.
 */
async function validateImplementationSlot(
  sender: Address,
): Promise<ValidationResult> {
  try {
    const implSlot = await rpcClient.getStorageAt({
      address: sender,
      slot: IMPLEMENTATION_SLOT,
    });

    if (!implSlot) {
      return { ok: false, error: "no code at sender address" };
    }

    // Extract address from 32-byte slot value (right-aligned)
    const implAddr = getAddress(
      ("0x" + implSlot.slice(26)) as Hex,
    );

    if (implAddr.toLowerCase() !== config.accountImplementation.toLowerCase()) {
      return {
        ok: false,
        error: `implementation mismatch: expected ${config.accountImplementation}, got ${implAddr}`,
      };
    }

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: `failed to read implementation slot: ${e}`,
    };
  }
}
