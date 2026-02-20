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

## Deploy Tempo music-social subgraph

From repo root:

```bash
cd subgraphs/music-social
bun run build:tempo:local
bun run create:tempo:local || true
bun run deploy:tempo:local
```

If `graph create` returns `EPERM`, create the subgraph with Graph Node JSON-RPC and deploy again:

```bash
curl -sS -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"subgraph_create","params":{"name":"dotheaven/music-social-tempo"}}' \
  http://localhost:8020/
cd subgraphs/music-social
bun run deploy:tempo:local
```

Optional explicit version label:

```bash
cd subgraphs/music-social
VERSION_LABEL=local-$(date +%Y%m%d-%H%M%S) bun run deploy:tempo:local
```

Subgraph URL:

`http://localhost:8000/subgraphs/name/dotheaven/music-social-tempo`

Quick health check:

```bash
curl -sS -H 'content-type: application/json' \
  --data '{"query":"{ _meta { block { number hash } } tracks(first:1){id} scrobbles(first:1){id} contentEntries(first:1){id} follows(first:1){id} }"}' \
  http://localhost:8000/subgraphs/name/dotheaven/music-social-tempo
```

Parity check (local vs named tunnel vs Goldsky):

```bash
services/graph-node-tempo/check-music-social-parity.sh
```

## Expose GraphQL with Cloudflare Tunnel (quick, no dashboard)

```bash
./tunnel-quick.sh
```

Keep `5001` and `8020` private (local/SSH-forward only).

This prints a temporary public URL like:

`https://<random>.trycloudflare.com/subgraphs/name/dotheaven/music-social-tempo`

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

`https://graph.<your-domain>/subgraphs/name/dotheaven/music-social-tempo`

## Preventing 530 / 1033 outages (named tunnel)

Cloudflare `530` with body `error code: 1033` means the hostname route exists, but no active tunnel connector is attached.

### 1) Run cloudflared as a persistent user service

Create `~/.config/systemd/user/cloudflared-heaven-graph.service`:

```ini
[Unit]
Description=Cloudflared tunnel for graph.<your-domain>
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/home/<user>/.local/bin/cloudflared tunnel --config /home/<user>/.cloudflared/config.yml run heaven-graph
Restart=always
RestartSec=5s

[Install]
WantedBy=default.target
```

Enable and start:

```bash
systemctl --user daemon-reload
systemctl --user enable --now cloudflared-heaven-graph.service
systemctl --user status cloudflared-heaven-graph.service --no-pager
```

### 2) Verify tunnel + GraphQL in one minute

```bash
cloudflared tunnel info heaven-graph
curl -sS -i -H 'content-type: application/json' \
  --data '{"query":"{__typename}"}' \
  https://graph.<your-domain>/subgraphs/name/dotheaven/music-social-tempo
```

Healthy state:
- `cloudflared tunnel info` shows at least one `CONNECTOR ID`.
- GraphQL endpoint returns HTTP `200` and JSON (not `530`).

### 3) If you see `530` again

Run in this order:

```bash
systemctl --user restart cloudflared-heaven-graph.service
systemctl --user status cloudflared-heaven-graph.service --no-pager
journalctl --user -u cloudflared-heaven-graph.service -n 120 --no-pager
cloudflared tunnel info heaven-graph
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

If the tunnel is connected but queries still fail, the issue is likely in Graph Node/subgraph deployment rather than Cloudflare routing.
