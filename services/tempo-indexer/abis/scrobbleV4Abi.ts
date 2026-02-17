export const scrobbleV4Abi = [
  {
    type: "event",
    name: "TrackRegistered",
    anonymous: false,
    inputs: [
      { indexed: true, name: "trackId", type: "bytes32" },
      { indexed: true, name: "kind", type: "uint8" },
      { indexed: false, name: "payload", type: "bytes32" },
      { indexed: true, name: "metaHash", type: "bytes32" },
      { indexed: false, name: "registeredAt", type: "uint64" },
      { indexed: false, name: "durationSec", type: "uint32" },
    ],
  },
  {
    type: "event",
    name: "TrackCoverSet",
    anonymous: false,
    inputs: [
      { indexed: true, name: "trackId", type: "bytes32" },
      { indexed: false, name: "coverCid", type: "string" },
    ],
  },
  {
    type: "event",
    name: "TrackUpdated",
    anonymous: false,
    inputs: [
      { indexed: true, name: "trackId", type: "bytes32" },
      { indexed: true, name: "metaHash", type: "bytes32" },
    ],
  },
  {
    type: "event",
    name: "Scrobbled",
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: true, name: "trackId", type: "bytes32" },
      { indexed: false, name: "timestamp", type: "uint64" },
    ],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "getTrack",
    inputs: [{ name: "trackId", type: "bytes32" }],
    outputs: [
      { name: "title", type: "string" },
      { name: "artist", type: "string" },
      { name: "album", type: "string" },
      { name: "kind", type: "uint8" },
      { name: "payload", type: "bytes32" },
      { name: "registeredAt", type: "uint64" },
      { name: "coverCid", type: "string" },
      { name: "durationSec", type: "uint32" },
    ],
  },
] as const;
