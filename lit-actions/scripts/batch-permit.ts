#!/usr/bin/env bun

/**
 * Add PKP permissions for ALL CIDs in the active cids/*.json
 *
 * Usage:
 *   LIT_NETWORK=naga-test bun scripts/batch-permit.ts
 *   LIT_NETWORK=naga-test bun scripts/batch-permit.ts --dry-run
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

const dryRun = process.argv.includes('--dry-run');

async function main() {
  let privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('PRIVATE_KEY not found');
    process.exit(1);
  }
  if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;

  const pkpPath = join(ROOT_DIR, `output/pkp-${Env.name}.json`);
  if (!existsSync(pkpPath)) {
    console.error(`PKP file not found: output/pkp-${Env.name}.json`);
    process.exit(1);
  }
  const pkpCreds = JSON.parse(readFileSync(pkpPath, 'utf-8'));

  // Load all CIDs
  const cids: Record<string, string> = Env.cids as any;
  const entries = Object.entries(cids).filter(([_, cid]) => cid && cid.startsWith('Qm'));

  console.log(`Batch PKP Permission Grant`);
  console.log(`=`.repeat(50));
  console.log(`   Env: ${Env.name}`);
  console.log(`   PKP: ${pkpCreds.ethAddress}`);
  console.log(`   Actions: ${entries.length}`);
  if (dryRun) console.log(`   Mode: DRY RUN`);

  console.log('');
  for (const [name, cid] of entries) {
    console.log(`   ${name}: ${cid}`);
  }

  if (dryRun) {
    console.log('\nDry run - no changes made');
    return;
  }

  console.log('\nConnecting to Lit Protocol...');
  const litClient = await createLitClient({ network: Env.litNetwork });

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: chronicleYellowstone,
    transport: http(),
  });

  try {
    const pkpPermissionsManager = await litClient.getPKPPermissionsManager({
      pkpIdentifier: { tokenId: pkpCreds.tokenId },
      account: walletClient.account,
    });

    let ok = 0;
    let fail = 0;

    for (const [name, cid] of entries) {
      process.stdout.write(`   Adding ${name}... `);
      try {
        await pkpPermissionsManager.addPermittedAction({
          ipfsId: cid,
          scopes: ['sign-anything'],
        });
        console.log('OK');
        ok++;
      } catch (err: any) {
        // If already permitted, that's fine
        if (err.message?.includes('already permitted') || err.message?.includes('already exists')) {
          console.log('already permitted');
          ok++;
        } else {
          console.log(`FAILED: ${err.message}`);
          fail++;
        }
      }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Done: ${ok} succeeded, ${fail} failed out of ${entries.length}`);
  } finally {
    await litClient.disconnect();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
