import { type Address, type Hex } from "viem";

export const config = {
  port: Number(process.env.PORT ?? 3337),
  rpcUrl: process.env.RPC_URL ?? "https://carrot.megaeth.com/rpc",
  bundlerUrl: process.env.BUNDLER_URL ?? "http://127.0.0.1:4337",
  chainId: Number(process.env.CHAIN_ID ?? 6343),

  // Deployed contracts
  entryPoint: (process.env.ENTRYPOINT ??
    "0x0000000071727De22E5E9d8BAf0edAc6f37da032") as Address,
  factory: (process.env.HEAVEN_FACTORY ??
    "0xB66BF4066F40b36Da0da34916799a069CBc79408") as Address,
  paymaster: (process.env.HEAVEN_PAYMASTER ??
    "0xEb3C4c145AE16d7cC044657D1632ef08d6B2D5d9") as Address,
  scrobbleV4: (process.env.SCROBBLE_V4 ??
    "0xD41a8991aDF67a1c4CCcb5f7Da6A01a601eC3F37") as Address,
  accountImplementation: (process.env.ACCOUNT_IMPLEMENTATION ??
    "0xA17Fd81A1fFEC9f5694343dd4BFe29847B0eb9E7") as Address,

  // Paymaster signer
  paymasterSignerKey: (process.env.PAYMASTER_SIGNER_KEY ?? "") as Hex,

  // Gas caps (generous for MegaEVM — gas costs differ from EVM)
  maxCallGasLimit: BigInt(process.env.MAX_CALL_GAS_LIMIT ?? 5_000_000),
  maxVerificationGasLimit: BigInt(
    process.env.MAX_VERIFICATION_GAS_LIMIT ?? 3_000_000,
  ),
  maxPreVerificationGas: BigInt(
    process.env.MAX_PRE_VERIFICATION_GAS ?? 500_000,
  ),

  // Paymaster validity window
  paymasterValiditySeconds: Number(
    process.env.PAYMASTER_VALIDITY_SECONDS ?? 180,
  ),

  // Account salt (always 0 in Heaven)
  accountSalt: 0n,
} as const;

// Target allowlist: which contracts the SimpleAccount can call
// Maps target address → set of allowed 4-byte selectors
export const targetAllowlist: Record<Address, Set<Hex>> = {
  [config.scrobbleV4]: new Set([
    "0xe5e0042c", // scrobbleBatch(address,bytes32[],uint64[])
    "0xebce6686", // registerAndScrobbleBatch(address,uint8[],bytes32[],string[],string[],string[],bytes32[],uint64[])
  ]),
};
