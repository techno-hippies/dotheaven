#!/usr/bin/env bun

/**
 * Add PKP permission for a Lit Action CID
 *
 * Usage:
 *   bun scripts/add-permission.ts <cid>
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLitClient } from '@lit-protocol/lit-client';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Env } from '../tests/shared/env';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '../');

const chronicleYellowstone = {
  id: 175188,
  name: 'Chronicle Yellowstone',
  nativeCurrency: { name: 'tstLPX', symbol: 'tstLPX', decimals: 18 },
  rpcUrls: { default: { http: ['https://yellowstone-rpc.litprotocol.com'] } },
};

async function main() {
  const cid = process.argv[2];
  if (!cid || cid.startsWith('--')) {
    console.error('❌ Usage: bun scripts/add-permission.ts <cid>');
    process.exit(1);
  }

  let privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ PRIVATE_KEY not found');
    process.exit(1);
  }
  if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;

  const pkpPath = join(ROOT_DIR, `output/pkp-${Env.name}.json`);
  if (!existsSync(pkpPath)) {
    console.error(`❌ PKP file not found: output/pkp-${Env.name}.json`);
    process.exit(1);
  }
  const pkpCreds = JSON.parse(readFileSync(pkpPath, 'utf-8'));

  console.log(`🔑 Add PKP Permission`);
  console.log(`   Env: ${Env.name}`);
  console.log(`   PKP: ${pkpCreds.ethAddress}`);
  console.log(`   CID: ${cid}`);

  console.log('\n🔌 Connecting to Lit Protocol...');
  const litClient = await createLitClient({ network: Env.litNetwork });

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: chronicleYellowstone,
    transport: http(),
  });

  try {
    console.log('📝 Adding permission...');
    const pkpPermissionsManager = await litClient.getPKPPermissionsManager({
      pkpIdentifier: { tokenId: pkpCreds.tokenId },
      account: walletClient.account,
    });

    await pkpPermissionsManager.addPermittedAction({
      ipfsId: cid,
      scopes: ['sign-anything'],
    });

    console.log('\n✅ Permission added!');
    console.log('\n⚠️  Next: bun scripts/encrypt-key.ts');
  } finally {
    await litClient.disconnect();
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
