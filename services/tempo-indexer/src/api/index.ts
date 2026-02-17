import { db } from "ponder:api";
import schema from "ponder:schema";
import { client, desc, eq, graphql } from "ponder";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

app.get("/scrobbles/:user", async (c) => {
  const rawUser = c.req.param("user").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(rawUser)) {
    return c.json({ error: "Invalid user address" }, 400);
  }
  const user = rawUser as `0x${string}`;

  const limitParam = c.req.query("limit");
  const parsedLimit = Number.parseInt(limitParam ?? "100", 10);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 200)
      : 100;

  const rows = await db
    .select({
      id: schema.scrobble.id,
      trackId: schema.scrobble.trackId,
      timestamp: schema.scrobble.timestamp,
      blockTimestamp: schema.scrobble.blockTimestamp,
      blockNumber: schema.scrobble.blockNumber,
      transactionHash: schema.scrobble.transactionHash,
      title: schema.track.title,
      artist: schema.track.artist,
      album: schema.track.album,
      coverCid: schema.track.coverCid,
    })
    .from(schema.scrobble)
    .leftJoin(schema.track, eq(schema.scrobble.trackId, schema.track.id))
    .where(eq(schema.scrobble.user, user))
    .orderBy(desc(schema.scrobble.timestamp))
    .limit(limit);

  return c.json({
    items: rows.map((row) => ({
      id: row.id,
      trackId: row.trackId,
      timestamp: row.timestamp,
      blockTimestamp: row.blockTimestamp,
      blockNumber: Number(row.blockNumber),
      transactionHash: row.transactionHash,
      track: {
        id: row.trackId,
        title: row.title ?? "",
        artist: row.artist ?? "",
        album: row.album ?? "",
        coverCid: row.coverCid ?? null,
      },
    })),
  });
});

app.use("/sql/*", client({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

export default app;
