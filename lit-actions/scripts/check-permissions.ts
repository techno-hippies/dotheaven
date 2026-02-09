#!/usr/bin/env bun

/**
 * Check what permissions exist on the sponsor PKP
 *
 * Usage:
 *   LIT_NETWORK=naga-test bun scripts/check-permissions.ts
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
  let privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) { console.error('PRIVATE_KEY not found'); process.exit(1); }
  if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const pkpPath = join(ROOT_DIR, `output/pkp-${Env.name}.json`);
  const pkpCreds = JSON.parse(readFileSync(pkpPath, 'utf-8'));

  console.log(`Check PKP Permissions`);
  console.log(`=`.repeat(50));
  console.log(`   Env: ${Env.name}`);
  console.log(`   PKP: ${pkpCreds.ethAddress}`);
  console.log(`   Token ID: ${pkpCreds.tokenId}`);

  console.log('\nConnecting to Lit Protocol...');
  const litClient = await createLitClient({ network: Env.litNetwork });

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

    console.log('\nFetching permissions context...');
    const ctx = await pkpPermissionsManager.getPermissionsContext();

    console.log('\n--- Permitted Addresses ---');
    console.log(ctx.addresses);

    console.log('\n--- Permitted Actions (IPFS CIDs) ---');
    console.log(ctx.actions);

    console.log('\n--- Permitted Auth Methods ---');
    for (const am of ctx.authMethods) {
      const safe: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(am)) {
        safe[k] = typeof v === 'bigint' ? v.toString() : v;
      }
      console.log(JSON.stringify(safe));
    }

    // Check specific CIDs
    const cids: Record<string, string> = Env.cids as any;
    const entries = Object.entries(cids).filter(([_, cid]) => cid && cid.startsWith('Qm'));

    console.log('\n--- CID Permission Check ---');
    for (const [name, cid] of entries) {
      const isPermitted = await pkpPermissionsManager.isPermittedAction({ ipfsId: cid });
      console.log(`   ${name}: ${isPermitted ? 'YES' : 'NO'} (${cid.slice(0, 12)}...)`);
    }

    // Raw contract read: check scopes bitmap for each action
    console.log('\n--- Raw Scope Bitmaps (via getPermittedAuthMethodScopes) ---');
    // Auth method type 2 = IPFS CID (Lit Action)
    for (const [name, cid] of entries.slice(0, 3)) {
      try {
        const scopes = await pkpPermissionsManager.getPermittedAuthMethodScopes({
          authMethodType: 2,
          authMethodId: cid,
        });
        console.log(`   ${name}: scopes=${JSON.stringify(scopes)}`);
      } catch (e: any) {
        console.log(`   ${name}: ERROR ${e.message?.slice(0, 60)}`);
      }
    }

  } finally {
    await litClient.disconnect();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
