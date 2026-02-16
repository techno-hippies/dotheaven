# ============================================================================
# Heaven x402 Facilitator (Rust, x402-rs) — single EigenCompute container
#
# Base Sepolia only settlement (Exact EIP-3009 USDC).
#
# Build context: repo root
# Expects services/x402-facilitator-rs/ to be provided as a named build context.
# Use from the repo root:
#   docker build -f services/x402-facilitator-rs/Dockerfile \
#     --build-context facilitator=services/x402-facilitator-rs \
#     -t heaven-x402-facilitator .
# ============================================================================

FROM --platform=linux/amd64 rust:1.88-bookworm AS build

WORKDIR /build
COPY --from=facilitator Cargo.lock /build/Cargo.lock
COPY --from=facilitator Cargo.toml /build/Cargo.toml
COPY --from=facilitator vendor /build/vendor
COPY --from=facilitator src /build/src

RUN cargo build --release --locked

FROM --platform=linux/amd64 debian:bookworm-slim AS runtime

WORKDIR /app
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates tini && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /build/target/release/heaven-x402-facilitator /app/heaven-x402-facilitator
COPY --from=facilitator start.sh /app/start.sh
COPY --from=facilitator .env.example /app/.env.example
COPY --from=facilitator Caddyfile /app/Caddyfile

RUN chmod +x /app/start.sh

ENV FACILITATOR_HOST=0.0.0.0
ENV FACILITATOR_PORT=8080
# Run the app on an internal port. EigenCloud's TLS proxy (Caddyfile + tls-keygen)
# should terminate HTTPS on 443 and reverse_proxy to APP_PORT inside the container.
EXPOSE 8080

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/start.sh"]
