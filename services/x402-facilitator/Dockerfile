# ============================================================================
# Heaven x402 Facilitator (Exact EIP-3009 USDC) — Bun HTTP server
#
# Designed to be deployed as an external facilitator for session-voice.
# ============================================================================

FROM --platform=linux/amd64 node:20-bookworm-slim AS runtime

USER root
WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl tini && \
    rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

COPY package.json /app/package.json
COPY tsconfig.json /app/tsconfig.json
COPY src /app/src
COPY start.sh /app/start.sh
COPY Caddyfile /app/Caddyfile
COPY .env.example /app/.env.example

WORKDIR /app
RUN bun install --production

RUN chmod +x /app/start.sh

ENV FACILITATOR_HOST=0.0.0.0
ENV FACILITATOR_PORT=3340
EXPOSE 3340

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/start.sh"]

