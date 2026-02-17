import { ponder } from "ponder:registry";
import { scrobble, track } from "ponder:schema";
import { scrobbleV4Abi } from "../abis/scrobbleV4Abi";

const EMPTY_BYTES32 = `0x${"0".repeat(64)}` as const;

const toNumber = (value: bigint | number): number => Number(value);
const normalizeAddress = (address: string): `0x${string}` =>
  address.toLowerCase() as `0x${string}`;

const normalizeCoverCid = (coverCid: string): string | null => {
  const trimmed = coverCid.trim();
  return trimmed.length > 0 ? trimmed : null;
};

type TrackMetadata = {
  title: string;
  artist: string;
  album: string;
  kind: number;
  payload: `0x${string}`;
  registeredAt: number;
  coverCid: string | null;
  durationSec: number;
};

const readTrackMetadata = async (
  context: {
    client: {
      readContract: (args: {
        abi: typeof scrobbleV4Abi;
        address: `0x${string}`;
        functionName: "getTrack";
        args: readonly [`0x${string}`];
      }) => Promise<readonly unknown[]>;
    };
  },
  contractAddress: `0x${string}`,
  trackId: `0x${string}`,
): Promise<TrackMetadata> => {
  const result = await context.client.readContract({
    abi: scrobbleV4Abi,
    address: contractAddress,
    functionName: "getTrack",
    args: [trackId],
  });

  const [title, artist, album, kind, payload, registeredAt, coverCid, duration] =
    result;

  return {
    title: String(title ?? ""),
    artist: String(artist ?? ""),
    album: String(album ?? ""),
    kind: toNumber(kind as bigint | number),
    payload: payload as `0x${string}`,
    registeredAt: toNumber(registeredAt as bigint | number),
    coverCid: normalizeCoverCid(String(coverCid ?? "")),
    durationSec: toNumber(duration as bigint | number),
  };
};

ponder.on("ScrobbleV4:TrackRegistered", async ({ event, context }) => {
  const metadata = await readTrackMetadata(
    context,
    event.log.address,
    event.args.trackId,
  );

  await context.db
    .insert(track)
    .values({
      id: event.args.trackId,
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      kind: metadata.kind,
      payload: metadata.payload,
      metaHash: event.args.metaHash,
      coverCid: metadata.coverCid,
      durationSec: metadata.durationSec,
      registeredAt: metadata.registeredAt,
    })
    .onConflictDoUpdate({
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      kind: metadata.kind,
      payload: metadata.payload,
      metaHash: event.args.metaHash,
      coverCid: metadata.coverCid,
      durationSec: metadata.durationSec,
      registeredAt: metadata.registeredAt,
    });
});

ponder.on("ScrobbleV4:TrackUpdated", async ({ event, context }) => {
  const metadata = await readTrackMetadata(
    context,
    event.log.address,
    event.args.trackId,
  );

  await context.db
    .insert(track)
    .values({
      id: event.args.trackId,
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      kind: metadata.kind,
      payload: metadata.payload,
      metaHash: event.args.metaHash,
      coverCid: metadata.coverCid,
      durationSec: metadata.durationSec,
      registeredAt: metadata.registeredAt,
    })
    .onConflictDoUpdate({
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      kind: metadata.kind,
      payload: metadata.payload,
      metaHash: event.args.metaHash,
      coverCid: metadata.coverCid,
      durationSec: metadata.durationSec,
      registeredAt: metadata.registeredAt,
    });
});

ponder.on("ScrobbleV4:TrackCoverSet", async ({ event, context }) => {
  await context.db
    .insert(track)
    .values({
      id: event.args.trackId,
      title: "",
      artist: "",
      album: "",
      kind: 0,
      payload: EMPTY_BYTES32,
      metaHash: EMPTY_BYTES32,
      coverCid: normalizeCoverCid(event.args.coverCid),
      durationSec: 0,
      registeredAt: toNumber(event.block.timestamp),
    })
    .onConflictDoUpdate({
      coverCid: normalizeCoverCid(event.args.coverCid),
    });
});

ponder.on("ScrobbleV4:Scrobbled", async ({ event, context }) => {
  await context.db
    .insert(track)
    .values({
      id: event.args.trackId,
      title: "",
      artist: "",
      album: "",
      kind: 0,
      payload: EMPTY_BYTES32,
      metaHash: EMPTY_BYTES32,
      coverCid: null,
      durationSec: 0,
      registeredAt: toNumber(event.block.timestamp),
    })
    .onConflictDoNothing();

  await context.db
    .insert(scrobble)
    .values({
      id: event.id,
      user: normalizeAddress(event.args.user),
      trackId: event.args.trackId,
      timestamp: toNumber(event.args.timestamp),
      blockNumber: event.block.number,
      blockTimestamp: toNumber(event.block.timestamp),
      transactionHash: event.transaction.hash,
    })
    .onConflictDoNothing();
});
