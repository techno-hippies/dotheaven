#!/usr/bin/env bun

/**
 * Deposit tstLPX into Lit Protocol's payment system for the deployer wallet.
 *
 * The deployer wallet owns the sponsor PKP. When Lit Actions execute
 * signAndCombineEcdsa via the sponsor PKP, the owner gets charged.
 *
 * Usage:
 *   LIT_NETWORK=naga-test bun scripts/deposit-payment.ts            # Deposit 5 tstLPX (default)
 *   LIT_NETWORK=naga-test bun scripts/deposit-payment.ts 2          # Deposit 2 tstLPX
 *   LIT_NETWORK=naga-test bun scripts/deposit-payment.ts --check    # Check balance only
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLitClient } from '@lit-protocol/lit-client';
import { createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Env } from '../tests/shared/env';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '../');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const amountArg = args.find(a => !a.startsWith('--'));
const depositAmount = amountArg ? parseFloat(amountArg) : 5;

const chronicleYellowstone = {
  id: 175188,
  name: 'Chronicle Yellowstone',
  nativeCurrency: { name: 'tstLPX', symbol: 'tstLPX', decimals: 18 },
  rpcUrls: { default: { http: ['https://yellowstone-rpc.litprotocol.com'] } },
};

async function main() {
  let privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('PRIVATE_KEY not found');
    process.exit(1);
  }
  if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  console.log(`Lit Payment Deposit`);
  console.log(`=`.repeat(50));
  console.log(`   Env: ${Env.name}`);
  console.log(`   Wallet: ${account.address}`);

  if (!checkOnly) {
    console.log(`   Amount: ${depositAmount} tstLPX`);
  }

  console.log('\nConnecting to Lit Protocol...');
  const litClient = await createLitClient({ network: Env.litNetwork });

  const walletClient = createWalletClient({
    account,
    chain: chronicleYellowstone,
    transport: http(),
  });

  try {
    const paymentManager = await litClient.getPaymentManager({
      account: walletClient.account,
    });

    if (checkOnly) {
      console.log('\nChecking payment status...');
      // Try to set a restriction to see current state (idempotent)
      try {
        await paymentManager.setRestriction({
          totalMaxPrice: '1000000000000000000',
          requestsPerPeriod: '1000',
          periodSeconds: '86400',
        });
        console.log('Restriction is set (1 tstLPX/day, 1000 req/day)');
      } catch (e: any) {
        console.log(`Restriction status: ${e.message}`);
      }
      return;
    }

    // Set restriction first (idempotent)
    console.log('\nSetting spending restriction...');
    try {
      await paymentManager.setRestriction({
        totalMaxPrice: parseEther(`${depositAmount}`).toString(),
        requestsPerPeriod: '5000',
        periodSeconds: '86400',
      });
      console.log(`   Restriction: ${depositAmount} tstLPX/day, 5000 req/day`);
    } catch (e: any) {
      console.log(`   Restriction already set or updated: ${e.message}`);
    }

    // Deposit
    console.log(`\nDepositing ${depositAmount} tstLPX...`);
    await paymentManager.deposit({
      amountInLitkey: `${depositAmount}`,
    });
    console.log(`   Deposited ${depositAmount} tstLPX`);

    // Also delegate payment for the sponsor PKP address
    const pkpPath = join(ROOT_DIR, `output/pkp-${Env.name}.json`);
    if (existsSync(pkpPath)) {
      const pkpCreds = JSON.parse(readFileSync(pkpPath, 'utf-8'));
      console.log(`\nDelegating payment for sponsor PKP ${pkpCreds.ethAddress}...`);
      try {
        await paymentManager.delegatePaymentsBatch({
          userAddresses: [pkpCreds.ethAddress],
        });
        console.log(`   Delegated for ${pkpCreds.ethAddress}`);
      } catch (e: any) {
        console.log(`   Delegation: ${e.message}`);
      }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Done. Deposited ${depositAmount} tstLPX for ${account.address}`);

  } finally {
    await litClient.disconnect();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
