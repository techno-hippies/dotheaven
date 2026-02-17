# Graph Node (Tempo Moderato)

Self-hosted Graph Node stack for indexing Tempo Moderato with subgraph-compatible tooling.

## Start stack

```bash
cd services/graph-node-tempo
cp .env.example .env
docker compose up -d
```

If you already started with an older Postgres volume, reset this stack once so Postgres is re-initialized with locale `C` (required by Graph Node):

```bash
docker compose down -v
docker compose up -d
```

This starts:

- GraphQL query endpoint: `http://localhost:8000`
- Admin/deploy endpoint: `http://localhost:8020`
- IPFS API: `http://localhost:5001`

The stack includes a small local RPC shim (`rpc-shim.ts`) between Graph Node and Tempo RPC.
It patches Tempo `0x76` transaction objects to include `value: "0x0"` when missing, which avoids Graph Node decode failures.

## Deploy Tempo activity subgraph

From repo root:

```bash
cd subgraphs/activity-feed
bun run build:tempo:local
bun run create:tempo:local || true
bun run deploy:tempo:local
```

Optional explicit version label:

```bash
cd subgraphs/activity-feed
VERSION_LABEL=local-$(date +%Y%m%d-%H%M%S) bun run deploy:tempo:local
```

Subgraph URL:

`http://localhost:8000/subgraphs/name/dotheaven/activity-feed-tempo`

## Expose GraphQL with Cloudflare Tunnel (quick, no dashboard)

```bash
./tunnel-quick.sh
```

Keep `5001` and `8020` private (local/SSH-forward only).

This prints a temporary public URL like:

`https://<random>.trycloudflare.com/subgraphs/name/dotheaven/activity-feed-tempo`

## Stable Cloudflare Tunnel (named + your domain)

The steps below need your Cloudflare account/domain context (this is the only part that cannot be fully automated without your login).

```bash
cloudflared tunnel login
cloudflared tunnel create heaven-graph
cloudflared tunnel route dns heaven-graph graph.<your-domain>
```

Then copy `cloudflared.config.example.yml` to `~/.cloudflared/config.yml`, replace placeholders, and run:

```bash
./tunnel-named.sh heaven-graph
```

Then your endpoint is:

`https://graph.<your-domain>/subgraphs/name/dotheaven/activity-feed-tempo`
