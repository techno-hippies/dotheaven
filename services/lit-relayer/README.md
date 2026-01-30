# Lit PKP Relayer Service

Vercel-hosted relayer API that sponsors PKP minting for Heaven users. The relayer pays gas costs on Chronicle Yellowstone, making authentication completely free for end users.

## Features

- **Free PKP minting** - Relayer pays gas on Chronicle testnet
- **EOA auth method** - User's wallet address added with `sign-anything` scope
- **Idempotent** - Returns existing PKP if user already registered
- **CORS-enabled** - Works from any origin

## Endpoints

### POST `/api/mint-user-pkp`

Mints a PKP for a user's EOA address.

**Request:**
```json
{
  "userAddress": "0x03626B945ec2713Ea50AcE6b42a6f8650E0611B5"
}
```

**Response:**
```json
{
  "success": true,
  "existing": false,
  "pkpTokenId": "123456",
  "pkpPublicKey": "0x04...",
  "pkpEthAddress": "0x59bA1D3988c80d2f2a21a5De1f3272a82A304dD5"
}
```

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment

Create `.env` file:

```bash
# Relayer wallet private key (needs tstLPX on Chronicle Yellowstone)
# Get test tokens: https://chronicle-yellowstone-faucet.getlit.dev/
LIT_RELAYER_PRIVATE_KEY=0x...

# Network (naga-dev is free, naga-test requires payment delegation)
LIT_NETWORK=naga-dev
```

### 3. Fund Relayer Wallet

1. Get Chronicle Yellowstone address from private key
2. Visit [Chronicle Yellowstone Faucet](https://chronicle-yellowstone-faucet.getlit.dev/)
3. Request test tstLPX tokens

### 4. Deploy to Vercel

```bash
# Login to Vercel
vercel login

# Deploy
bun run deploy
```

Set environment variables in Vercel dashboard:
- `LIT_RELAYER_PRIVATE_KEY`
- `LIT_NETWORK`

## Development

```bash
# Run locally
bun run dev

# Test endpoint
curl -X POST http://localhost:3000/api/mint-user-pkp \
  -H "Content-Type: application/json" \
  -d '{"userAddress":"0x03626B945ec2713Ea50AcE6b42a6f8650E0611B5"}'
```

## Security Notes

- **naga-dev is free** - No payment delegation needed
- **naga-test requires payment** - Need to deposit tstLPX to payment manager
- **Rate limiting** - Consider adding rate limits in production
- **Private key security** - Never commit `.env` or expose relayer key

## Architecture

```
User (EOA) → Frontend → Relayer API → Lit Protocol
                ↓                           ↓
         SIWE signature              Mint PKP + Add Auth Method
                                    (Relayer pays gas)
```

1. User connects wallet (no network switch needed)
2. Frontend calls relayer API with user's address
3. Relayer checks if PKP exists, mints if not
4. Relayer adds user's EOA as auth method with `sign-anything` scope
5. User signs SIWE message to prove ownership (no gas)
6. User can now use PKP for signing
