#!/usr/bin/env bun

/**
 * Add deployer EOA as auth method on the sponsor PKP
 *
 * Required for tests: the deployer EOA must be a permitted auth method
 * with sign-anything scope on the sponsor PKP to create auth contexts.
 *
 * Usage:
 *   LIT_NETWORK=naga-test bun scripts/add-auth-method.ts
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLitClient } from '@lit-protocol/lit-client';
import { createWalletClient, http, getAddress, stringToBytes, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Env } from '../tests/shared/env';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '../');

const AUTH_METHOD_TYPE_ETH_WALLET = 1;

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

  const pkpPath = join(ROOT_DIR, `output/pkp-${Env.name}.json`);
  if (!existsSync(pkpPath)) {
    console.error(`PKP file not found: output/pkp-${Env.name}.json`);
    process.exit(1);
  }
  const pkpCreds = JSON.parse(readFileSync(pkpPath, 'utf-8'));

  console.log(`Add Auth Method to Sponsor PKP`);
  console.log(`=`.repeat(50));
  console.log(`   Env: ${Env.name}`);
  console.log(`   PKP: ${pkpCreds.ethAddress}`);
  console.log(`   EOA: ${account.address}`);

  console.log('\nConnecting to Lit Protocol...');
  const litClient = await createLitClient({ network: Env.litNetwork });

  const walletClient = createWalletClient({
    account,
    chain: chronicleYellowstone,
    transport: http(),
  });

  try {
    const permissionsManager = await litClient.getPKPPermissionsManager({
      pkpIdentifier: { tokenId: pkpCreds.tokenId },
      account: walletClient.account,
    });

    // The Lit SDK derives authMethodId for ETH wallets as:
    //   keccak256(stringToBytes(`${checksumAddress}:lit`))
    // We must match this format when registering on-chain.
    const checksumAddress = getAddress(account.address);
    const authMethodId = keccak256(stringToBytes(`${checksumAddress}:lit`));
    console.log(`   Checksum addr: ${checksumAddress}`);
    console.log(`   Auth method ID: ${authMethodId}`);

    console.log('Adding deployer EOA as auth method with sign-anything scope...');
    await permissionsManager.addPermittedAuthMethod({
      authMethodType: AUTH_METHOD_TYPE_ETH_WALLET,
      authMethodId,
      userPubkey: '0x',
      scopes: ['sign-anything'],
    });

    console.log(`Done. ${account.address} can now create auth contexts on PKP ${pkpCreds.ethAddress}`);
  } finally {
    await litClient.disconnect();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
