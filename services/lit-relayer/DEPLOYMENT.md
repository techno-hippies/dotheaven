# Deploying the Lit Relayer

## Current Status

The relayer is currently deployed at: `https://lit-sponsorship-api.vercel.app`

Both **karaoke-school** and **dotheaven** use this same relayer URL.

## To Deploy Your Own Instance

### 1. Prepare Relayer Wallet

```bash
# Generate a new private key (or use existing)
# Fund it with tstLPX on Chronicle Yellowstone
# Faucet: https://chronicle-yellowstone-faucet.getlit.dev/
```

### 2. Set Environment Variables

Create `.env` in `services/lit-relayer/`:

```bash
LIT_RELAYER_PRIVATE_KEY=0x...
LIT_NETWORK=naga-test   # or naga-dev (free but less stable)
```

### 3. Install Vercel CLI

```bash
bun add -g vercel
vercel login
```

### 4. Deploy

```bash
cd services/lit-relayer
bun run build    # Bundle the API for Vercel
bun run deploy   # Deploy to Vercel
```

### 5. Configure Vercel Environment

In Vercel dashboard, add environment variables:
- `LIT_RELAYER_PRIVATE_KEY`
- `LIT_NETWORK`

### 6. Update Frontend

Update `apps/frontend/src/lib/lit/auth-eoa.ts`:

```typescript
const LIT_SPONSORSHIP_API_URL =
  import.meta.env.VITE_LIT_SPONSORSHIP_API_URL || 'https://YOUR-DEPLOYMENT.vercel.app'
```

Or set in `.env`:

```bash
VITE_LIT_SPONSORSHIP_API_URL=https://YOUR-DEPLOYMENT.vercel.app
```

## Testing Locally

```bash
cd services/lit-relayer
bun run dev
```

The API will be available at `http://localhost:3000/api/mint-user-pkp`

Test with:

```bash
curl -X POST http://localhost:3000/api/mint-user-pkp \
  -H "Content-Type: application/json" \
  -d '{"userAddress":"0x03626B945ec2713Ea50AcE6b42a6f8650E0611B5"}'
```

## Monitoring

Monitor your deployment at:
- Vercel Dashboard: https://vercel.com/dashboard
- Function Logs: Check Vercel logs for each request
- Wallet Balance: Monitor Chronicle Yellowstone balance to ensure relayer has funds

## Costs

- **naga-dev**: Free - no gas costs
- **naga-test**: Requires tstLPX tokens (testnet)
- **Production**: Will require real tokens when mainnet launches

## Security Notes

- Never commit `.env` files
- Rotate relayer private key periodically
- Monitor for abuse (implement rate limiting if needed)
- Use separate relayer wallets for dev/prod
