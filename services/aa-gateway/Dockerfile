# ============================================================================
# Heaven AA Gateway + Alto Bundler — single EigenCompute container
#
# Build context: services/aa-gateway/
# Expects services/alto/ to be available at ../alto relative to build context.
# Use from the repo root:
#   docker build -f services/aa-gateway/Dockerfile \
#     --build-context alto=services/alto \
#     --build-context gateway=services/aa-gateway \
#     -t heaven-aa .
# ============================================================================

# ── Stage 1: Build Alto contracts with Foundry ──────────────────────────────
FROM --platform=linux/amd64 ghcr.io/foundry-rs/foundry:v1.1.0 AS contracts

WORKDIR /build
USER root

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/* && \
    corepack enable

COPY --from=alto package.json pnpm-lock.yaml pnpm-workspace.yaml .gitmodules ./
COPY --from=alto contracts ./contracts

RUN pnpm install --frozen-lockfile --no-optional
RUN pnpm run build:contracts

# ── Stage 2: Build Alto TypeScript ──────────────────────────────────────────
FROM --platform=linux/amd64 node:20-bookworm-slim AS alto-build

WORKDIR /app

RUN npm install -g typescript && corepack enable

COPY --from=alto package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=alto . .
COPY --from=contracts /build/src/contracts ./src/contracts

RUN pnpm install --frozen-lockfile --no-optional
RUN pnpm build

# ── Stage 3: Runtime — Bun (gateway) + Node (Alto) ─────────────────────────
FROM --platform=linux/amd64 node:20-bookworm-slim AS runtime

USER root
WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl unzip tini && \
    rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# ── Copy built Alto ─────────────────────────────────────────────────────────
COPY --from=alto-build /app /app/alto

# ── Copy and install gateway ────────────────────────────────────────────────
COPY --from=gateway package.json /app/gateway/package.json
COPY --from=gateway src /app/gateway/src
COPY --from=gateway tsconfig.json /app/gateway/tsconfig.json

WORKDIR /app/gateway
RUN bun install --production

# ── Copy env defaults (overridden by EigenCloud KMS if set) ───────────────
COPY --from=gateway .env /app/gateway/.env
# ── Copy Caddyfile for EigenCloud TLS proxy ────────────────────────────────
COPY --from=gateway Caddyfile /app/Caddyfile

# ── Entrypoint ──────────────────────────────────────────────────────────────
COPY --from=gateway start.sh /app/start.sh
RUN chmod +x /app/start.sh

WORKDIR /app
EXPOSE 3337

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/start.sh"]
