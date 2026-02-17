# Tempo Indexer (Ponder)

Tempo Moderato scrobble indexer backed by [Ponder](https://ponder.sh), used as an interim replacement for missing managed subgraph support on Tempo testnet.

## Indexed Contract

- `ScrobbleV4` on Tempo Moderato (`chainId 42431`)
- Default address: `0x0541443C41a6F923D518Ac23921778e2Ea102891`
- Default start block: `5198164`

## Endpoints

- `GET /health`
- `GET /scrobbles/:address?limit=100`
- `POST /graphql`

`/scrobbles/:address` returns:

```json
{
  "items": [
    {
      "id": "event-id",
      "trackId": "0x...",
      "timestamp": 1771270000,
      "blockTimestamp": 1771270000,
      "blockNumber": 5212345,
      "transactionHash": "0x...",
      "track": {
        "id": "0x...",
        "title": "Track title",
        "artist": "Artist",
        "album": "Album",
        "coverCid": "bafy..."
      }
    }
  ]
}
```

## Local Run

```bash
cd services/tempo-indexer
cp .env.local.example .env.local
bun install
bun run dev
```

By default Ponder serves on `http://localhost:42069`.

## Notes

- Use an Alchemy Tempo Moderato URL for faster/stabler indexing:
  - `PONDER_RPC_URL_42431=https://tempo-moderato.g.alchemy.com/v2/<api-key>`
- This service is intended for dev/staging until managed indexing on the target Tempo network is available.

## Deploy to Fly.io

`fly.toml` and `Dockerfile` are included.

```bash
cd services/tempo-indexer

# First time only
fly auth login
fly apps create heaven-tempo-indexer
fly volumes create ponder_data --region iad --size 20

# Required secret
fly secrets set PONDER_RPC_URL_42431=https://tempo-moderato.g.alchemy.com/v2/<api-key>

# Optional overrides
# fly secrets set SCROBBLE_V4_ADDRESS=0x0541443C41a6F923D518Ac23921778e2Ea102891
# fly secrets set SCROBBLE_V4_START_BLOCK=5198164
# fly secrets set DATABASE_SCHEMA=tempo_indexer

fly deploy
```

After deploy:

```bash
fly status
fly logs
```
