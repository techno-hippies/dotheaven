import { index, onchainTable } from "ponder";

export const track = onchainTable(
  "track",
  (t) => ({
    id: t.text().primaryKey(),
    title: t.text().notNull(),
    artist: t.text().notNull(),
    album: t.text().notNull(),
    kind: t.integer().notNull(),
    payload: t.hex().notNull(),
    metaHash: t.hex().notNull(),
    coverCid: t.text(),
    durationSec: t.integer().notNull(),
    registeredAt: t.integer().notNull(),
  }),
  (table) => ({
    artistIdx: index("track_artist_idx").on(table.artist),
  }),
);

export const scrobble = onchainTable(
  "scrobble",
  (t) => ({
    id: t.text().primaryKey(),
    user: t.hex().notNull(),
    trackId: t.text().notNull(),
    timestamp: t.integer().notNull(),
    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.integer().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    userTimestampIdx: index("scrobble_user_timestamp_idx").on(
      table.user,
      table.timestamp,
    ),
    trackIdx: index("scrobble_track_idx").on(table.trackId),
  }),
);
