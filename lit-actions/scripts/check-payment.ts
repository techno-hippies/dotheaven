#!/usr/bin/env bun

/**
 * Check payment balance and delegation status on naga-test
 */

import { createLitClient } from '@lit-protocol/lit-client';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Env } from '../tests/shared/env';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '../');

async function main() {
  let privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) { console.error('PRIVATE_KEY not found'); process.exit(1); }
  if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  console.log('Payment Status Check');
  console.log('='.repeat(50));
  console.log(`   Env: ${Env.name}`);
  console.log(`   Payer: ${account.address}`);

  const litClient = await createLitClient({ network: Env.litNetwork });
  const paymentManager = await litClient.getPaymentManager({ account });

  // Balance for deployer
  try {
    const balance = await paymentManager.getBalance({ userAddress: account.address });
    console.log('\n--- Deployer Balance ---');
    console.log(JSON.stringify(balance, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  } catch(e: any) {
    console.log('getBalance error:', e.message?.slice(0, 200));
  }

  // Restriction
  try {
    const restriction = await paymentManager.getRestriction({ payerAddress: account.address });
    console.log('\n--- Restriction ---');
    console.log(JSON.stringify(restriction, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  } catch(e: any) {
    console.log('getRestriction error:', e.message?.slice(0, 200));
  }

  // PKP info
  const pkpPath = join(ROOT_DIR, `output/pkp-${Env.name}.json`);
  if (existsSync(pkpPath)) {
    const pkpCreds = JSON.parse(readFileSync(pkpPath, 'utf-8'));
    console.log(`\n--- Sponsor PKP ---`);
    console.log(`   Address: ${pkpCreds.ethAddress}`);

    // PKP balance
    try {
      const pkpBalance = await paymentManager.getBalance({ userAddress: pkpCreds.ethAddress });
      console.log(`   PKP Balance: ${JSON.stringify(pkpBalance, (_, v) => typeof v === 'bigint' ? v.toString() : v)}`);
    } catch(e: any) {
      console.log(`   PKP getBalance error: ${e.message?.slice(0, 200)}`);
    }
  }

  await litClient.disconnect();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
