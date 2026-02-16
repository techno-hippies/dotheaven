# x402-facilitator

This project is forked from [x402-rs](https://github.com/x402-rs/x402-rs).

Our goal is to maintain a stable version and extend the functionality of the original x402 facilitator for production use, including support for additional blockchains and tokens, as well as enhanced observability features, while ensuring compatibility with the x402 protocol.

===

# x402-rs

> A Rust-based implementation of the x402 protocol.

This repository provides:

- `x402-rs` (current crate):
  - Core protocol types, facilitator traits, and logic for on-chain payment verification and settlement
  - Facilitator binary - production-grade HTTP server to verify and settle x402 payments

## About x402

The [x402 protocol](https://docs.cdp.coinbase.com/x402/docs/overview) is a proposed standard for making blockchain payments directly through HTTP using native `402 Payment Required` status code.

Servers declare payment requirements for specific routes. Clients send cryptographically signed payment payloads. Facilitators verify and settle payments on-chain.

## Facilitator

The `x402-rs` crate (this repo) provides a runnable x402 facilitator binary. The _Facilitator_ role simplifies adoption of x402 by handling:
- **Payment verification**: Confirming that client-submitted payment payloads match the declared requirements.
- **Payment settlement**: Submitting validated payments to the blockchain and monitoring their confirmation.

By using a Facilitator, servers (sellers) do not need to:
- Connect directly to a blockchain.
- Implement complex cryptographic or blockchain-specific payment logic.

Instead, they can rely on the Facilitator to perform verification and settlement, reducing operational overhead and accelerating x402 adoption.
The Facilitator **never holds user funds**. It acts solely as a stateless verification and execution layer for signed payment payloads.

For a detailed overview of the x402 payment flow and Facilitator role, see the [x402 protocol documentation](https://docs.cdp.coinbase.com/x402/docs/overview).

### Usage

#### 1. Provide environment variables

Create a `.env` file or set environment variables directly. Example `.env`:

```dotenv
HOST=0.0.0.0
PORT=8080
RPC_URL_BASE_SEPOLIA=https://sepolia.base.org
RPC_URL_BASE=https://mainnet.base.org
SIGNER_TYPE=private-key
EVM_PRIVATE_KEY=0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef
SOLANA_PRIVATE_KEY=6ASf5EcmmEHTgDJ4X4ZT5vT6iHVJBXPg5AN5YoTCpGWt
RUST_LOG=info
```

**Important:**
The supported networks are determined by which RPC URLs you provide:
- If you set only `RPC_URL_BASE_SEPOLIA`, then only Base Sepolia network is supported.
- If you set both `RPC_URL_BASE_SEPOLIA` and `RPC_URL_BASE`, then both Base Sepolia and Base Mainnet are supported.
- If an RPC URL for a network is missing, that network will not be available for settlement or verification.

#### 2. Build and Run with Docker

Build a Docker image locally:
```shell
docker build -t x402-rs .
docker run --env-file .env -p 8080:8080 x402-rs
```

The container:
* Exposes port `8080` (or a port you configure with `PORT` environment variable).
* Starts on http://localhost:8080 by default.
* Requires minimal runtime dependencies (based on `debian:bullseye-slim`).

#### 3. Point your application to your Facilitator

If you are building an x402-powered application, update the Facilitator URL to point to your self-hosted instance.

> ℹ️ **Tip:** For production deployments, ensure your Facilitator is reachable via HTTPS and protect it against public abuse.

<details>
<summary>If you use Hono and x402-hono</summary>
From [x402.org Quickstart for Sellers](https://x402.gitbook.io/x402/getting-started/quickstart-for-sellers):

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { paymentMiddleware } from "x402-hono";

const app = new Hono();

// Configure the payment middleware
app.use(paymentMiddleware(
  "0xYourAddress", // Your receiving wallet address
  {
    "/protected-route": {
      price: "$0.10",
      network: "base-sepolia",
      config: {
        description: "Access to premium content",
      }
    }
  },
  {
    url: "http://your-validator.url/", // 👈 Your self-hosted Facilitator
  }
));

// Implement your protected route
app.get("/protected-route", (c) => {
  return c.json({ message: "This content is behind a paywall" });
});

serve({
  fetch: app.fetch,
  port: 3000
});
```

</details>

### Configuration

The service reads configuration via `.env` file or directly through environment variables.

Available variables:

* `RUST_LOG`: Logging level (e.g., `info`, `debug`, `trace`),
* `HOST`: HTTP host to bind to (default: `0.0.0.0`),
* `PORT`: HTTP server port (default: `8080`),
* `SIGNER_TYPE` (required): Type of signer to use. Only `private-key` is supported now,
* `EVM_PRIVATE_KEY` (required): Private key in hex for EVM networks, like `0xdeadbeef...`,
* `SOLANA_PRIVATE_KEY` (required): Private key in hex for Solana networks, like `0xdeadbeef...`,
* `RPC_URL_BASE_SEPOLIA`: Ethereum RPC endpoint for Base Sepolia testnet,
* `RPC_URL_BASE`: Ethereum RPC endpoint for Base mainnet,
* `RPC_URL_AVALANCHE_FUJI`: Ethereum RPC endpoint for Avalanche Fuji testnet,
* `RPC_URL_AVALANCHE`: Ethereum RPC endpoint for Avalanche C-Chain mainnet.
* `RPC_URL_SOLANA`: RPC endpoint for Solana mainnet.
* `RPC_URL_SOLANA_DEVNET`: RPC endpoint for Solana devnet.
* `RPC_URL_POLYGON`: RPC endpoint for Polygon mainnet.
* `RPC_URL_POLYGON_AMOY`: RPC endpoint for Polygon Amoy testnet.
* `RPC_URL_SEI`: RPC endpoint for Sei mainnet.
* `RPC_URL_SEI_TESTNET`: RPC endpoint for Sei testnet.


### Observability

The facilitator emits [OpenTelemetry](https://opentelemetry.io)-compatible traces and metrics to standard endpoints,
making it easy to integrate with tools like Honeycomb, Prometheus, Grafana, and others.
Tracing spans are annotated with HTTP method, status code, URI, latency, other request and process metadata.

To enable tracing and metrics export, set the appropriate `OTEL_` environment variables:

```dotenv
# For Honeycomb, for example:
# Endpoint URL for sending OpenTelemetry traces and metrics
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io:443
# Comma-separated list of key=value pairs to add as headers
OTEL_EXPORTER_OTLP_HEADERS=x-honeycomb-team=your_api_key,x-honeycomb-dataset=x402-rs
# Export protocol to use for telemetry. Supported values: `http/protobuf` (default), `grpc`
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

The service automatically detects and initializes exporters if `OTEL_EXPORTER_OTLP_*` variables are provided.

### Supported Networks

The Facilitator supports different networks based on the environment variables you configure:

| Network                   | Environment Variable     | Supported if Set | Notes                            |
|:--------------------------|:-------------------------|:-----------------|:---------------------------------|
| Base Sepolia Testnet      | `RPC_URL_BASE_SEPOLIA`   | ✅                | Testnet, Recommended for testing |
| Base Mainnet              | `RPC_URL_BASE`           | ✅                | Mainnet                          |
| XDC Mainnet               | `RPC_URL_XDC`            | ✅                | Mainnet                          |
| Avalanche Fuji Testnet    | `RPC_URL_AVALANCHE_FUJI` | ✅                | Testnet                          |
| Avalanche C-Chain Mainnet | `RPC_URL_AVALANCHE`      | ✅                | Mainnet                          |
| Polygon Amoy Testnet      | `RPC_URL_POLYGON_AMOY`   | ✅                | Testnet                          |
| Polygon Mainnet           | `RPC_URL_POLYGON`        | ✅                | Mainnet                          |
| Sei Testnet               | `RPC_URL_SEI_TESTNET`    | ✅                | Testnet                          |
| Sei Mainnet               | `RPC_URL_SEI`            | ✅                | Mainnet                          |
| Solana Mainnet            | `RPC_URL_SOLANA`         | ✅                | Mainnet                          |
| Solana Devnet             | `RPC_URL_SOLANA_DEVNET`  | ✅                | Testnet, Recommended for testing |

- If you provide say only `RPC_URL_BASE_SEPOLIA`, only **Base Sepolia** will be available.
- If you provide `RPC_URL_BASE_SEPOLIA`, `RPC_URL_BASE`, and other env variables on the list, then all the specified networks will be supported.

> ℹ️ **Tip:** For initial development and testing, you can start with Base Sepolia only.

### Development

Prerequisites:
- Rust 1.80+
- `cargo` and a working toolchain

Build locally:
```shell
cargo build
```
Run:
```shell
cargo run
```

## Related Resources

* [x402 Protocol Documentation](https://x402.org)
* [x402 Overview by Coinbase](https://docs.cdp.coinbase.com/x402/docs/overview)
* [Facilitator Documentation by Coinbase](https://docs.cdp.coinbase.com/x402/docs/facilitator)

## Contributions and feedback welcome!
Feel free to open issues or pull requests to improve x402 support in the Rust ecosystem.

## License

[Apache-2.0](LICENSE)
