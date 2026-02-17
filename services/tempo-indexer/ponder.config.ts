import { createConfig } from "ponder";
import { scrobbleV4Abi } from "./abis/scrobbleV4Abi";

const DEFAULT_RPC_URL = "https://rpc.moderato.tempo.xyz";
const DEFAULT_SCROBBLE_V4_ADDRESS =
  "0x0541443C41a6F923D518Ac23921778e2Ea102891";
const DEFAULT_SCROBBLE_V4_START_BLOCK = 5_198_164;

const scrobbleV4StartBlock = Number.parseInt(
  process.env.SCROBBLE_V4_START_BLOCK ??
    String(DEFAULT_SCROBBLE_V4_START_BLOCK),
  10,
);

if (!Number.isFinite(scrobbleV4StartBlock) || scrobbleV4StartBlock < 0) {
  throw new Error("Invalid SCROBBLE_V4_START_BLOCK");
}

export default createConfig({
  database: {
    kind: "pglite",
    directory: process.env.PONDER_PGLITE_DIR ?? ".ponder/pglite",
  },
  chains: {
    tempoModerato: {
      id: 42431,
      rpc:
        process.env.PONDER_RPC_URL_42431 ??
        process.env.PONDER_RPC_URL ??
        DEFAULT_RPC_URL,
    },
  },
  contracts: {
    ScrobbleV4: {
      chain: "tempoModerato",
      abi: scrobbleV4Abi,
      address: (process.env.SCROBBLE_V4_ADDRESS ??
        DEFAULT_SCROBBLE_V4_ADDRESS) as `0x${string}`,
      startBlock: scrobbleV4StartBlock,
    },
  },
});
