#!/usr/bin/env bun

/**
 * Delegate Lit payment sponsorship for one or more user addresses.
 *
 * Usage:
 *   LIT_NETWORK=naga-test bun scripts/delegate-users.ts 0xUser1 0xUser2
 */

import { createLitClient } from '@lit-protocol/lit-client';
import { createWalletClient, http, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Env } from '../tests/shared/env';

const chronicleYellowstone = {
  id: 175188,
  name: 'Chronicle Yellowstone',
  nativeCurrency: { name: 'tstLPX', symbol: 'tstLPX', decimals: 18 },
  rpcUrls: { default: { http: ['https://yellowstone-rpc.litprotocol.com'] } },
};

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: LIT_NETWORK=naga-test bun scripts/delegate-users.ts 0xUser1 [0xUser2 ...]');
    process.exit(1);
  }

  let privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('PRIVATE_KEY not found');
    process.exit(1);
  }
  if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const addresses = args.map(a => getAddress(a));

  console.log('Delegate Users');
  console.log('='.repeat(50));
  console.log(`   Env: ${Env.name}`);
  console.log(`   Payer: ${account.address}`);
  console.log(`   Users: ${addresses.join(', ')}`);

  const litClient = await createLitClient({ network: Env.litNetwork });
  const walletClient = createWalletClient({
    account,
    chain: chronicleYellowstone,
    transport: http(),
  });

  try {
    const paymentManager = await litClient.getPaymentManager({ account: walletClient.account });
    await paymentManager.delegatePaymentsBatch({ userAddresses: addresses });
    console.log('Delegation submitted successfully');
  } finally {
    await litClient.disconnect();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

