#!/usr/bin/env bun

/**
 * Mint PKP for Heaven Lit Actions
 *
 * Prerequisites:
 * - PRIVATE_KEY set in .env (your deployer wallet)
 * - Chronicle Yellowstone testnet tokens (tstLPX)
 *   Get from: https://chronicle-yellowstone-faucet.getlit.dev/
 *
 * Usage:
 *   bun scripts/mint-pkp.ts
 */

import { createLitClient } from '@lit-protocol/lit-client';
import { createWalletClient, http, type Account, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Env } from '../tests/shared/env';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '../');

// Chronicle Yellowstone chain config (for PKP minting)
const chronicleYellowstone = defineChain({
  id: 175188,
  name: 'Chronicle Yellowstone',
  nativeCurrency: { name: 'tstLPX', symbol: 'tstLPX', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://yellowstone-rpc.litprotocol.com'] },
  },
  blockExplorers: {
    default: { name: 'Chronicle Explorer', url: 'https://yellowstone-explorer.litprotocol.com' },
  },
});

async function main() {
  console.log('Mint PKP for Heaven Lit Actions');
  console.log('='.repeat(50));
  console.log(`   Network: ${Env.name}`);

  let privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('\nPRIVATE_KEY not found in .env');
    console.error('   Create .env with: PRIVATE_KEY=0x...');
    process.exit(1);
  }
  if (!privateKey.startsWith('0x')) {
    privateKey = '0x' + privateKey;
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`   Account: ${account.address}`);

  const walletClient = createWalletClient({
    account,
    chain: chronicleYellowstone,
    transport: http(),
  });

  console.log('\nYou need tstLPX tokens to mint a PKP');
  console.log('   Get from: https://chronicle-yellowstone-faucet.getlit.dev/');

  console.log('\nConnecting to Lit Protocol...');
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log('Connected');

  console.log('\nMinting PKP with EOA (this may take a minute)...');
  const mintedPkp = await litClient.mintWithEoa({
    account: walletClient.account as Account,
  });

  if (!mintedPkp.data) {
    console.error('Failed to mint PKP');
    console.error('   Result:', mintedPkp);
    process.exit(1);
  }

  const tokenId = mintedPkp.data.tokenId;
  const publicKey = mintedPkp.data.publicKey || mintedPkp.data.pubkey;
  const ethAddress = mintedPkp.data.ethAddress;

  if (!publicKey) {
    console.log('\nDebug - Full mint result:');
    console.log(JSON.stringify(mintedPkp, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  }

  console.log('\nPKP Minted!');
  console.log(`   Token ID: ${tokenId}`);
  console.log(`   Public Key: ${publicKey}`);
  console.log(`   ETH Address: ${ethAddress}`);

  const outputDir = join(ROOT_DIR, 'output');
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  const pkpInfo = {
    tokenId: tokenId.toString(),
    publicKey,
    ethAddress,
    owner: account.address,
    network: Env.name,
    mintedAt: new Date().toISOString(),
  };

  const outputPath = join(outputDir, `pkp-${Env.name}.json`);
  await writeFile(outputPath, JSON.stringify(pkpInfo, null, 2));
  console.log(`\nSaved to: output/pkp-${Env.name}.json`);

  console.log('\nNext steps:');
  console.log('   1. Deploy Lit Actions: bun scripts/setup.ts songUpload');
  console.log(`   2. Fund the PKP on Story Aeneid: ${ethAddress}`);

  await litClient.disconnect();
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
