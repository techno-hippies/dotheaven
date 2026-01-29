#!/usr/bin/env bun

/**
 * Deploy SPG NFT Collection on Story Aeneid
 *
 * Creates an SPG NFT collection via RegistrationWorkflows.createCollection().
 * The resulting contract address is used by story-register-sponsor-v1.js.
 *
 * Usage:
 *   bun scripts/deploy-spg-nft.ts
 */

import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '../');

// Story Aeneid Testnet
const storyAeneid = defineChain({
  id: 1315,
  name: 'Story Aeneid',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://aeneid.storyrpc.io'] },
  },
  blockExplorers: {
    default: { name: 'Story Explorer', url: 'https://aeneid.storyscan.xyz' },
  },
});

const REGISTRATION_WORKFLOWS = '0xbe39E1C756e921BD25DF86e7AAa31106d1eb0424';
const WIP_TOKEN = '0x1514000000000000000000000000000000000000';

const abi = parseAbi([
  'function createCollection((string name, string symbol, string baseURI, string contractURI, uint32 maxSupply, uint256 mintFee, address mintFeeToken, address mintFeeRecipient, address owner, bool mintOpen, bool isPublicMinting) spgNftInitParams) external returns (address spgNftContract)',
]);

async function main() {
  let privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    // Try loading from .env
    const { default: dotenv } = await import('dotenv');
    dotenv.config({ path: join(ROOT_DIR, '.env') });
    privateKey = process.env.PRIVATE_KEY;
  }

  if (!privateKey) {
    console.error('PRIVATE_KEY not found');
    process.exit(1);
  }
  if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log('Deploy SPG NFT Collection');
  console.log('='.repeat(50));
  console.log(`   Chain:    Story Aeneid (1315)`);
  console.log(`   Deployer: ${account.address}`);
  console.log(`   Contract: ${REGISTRATION_WORKFLOWS}`);

  const publicClient = createPublicClient({
    chain: storyAeneid,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: storyAeneid,
    transport: http(),
  });

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`   Balance:  ${(Number(balance) / 1e18).toFixed(4)} IP`);

  if (balance === 0n) {
    console.error('\nNo IP tokens. Fund this address on Story Aeneid first.');
    console.error('Faucet: https://aeneid.storyrpc.io/faucet or Story Discord');
    process.exit(1);
  }

  console.log('\nDeploying collection...');

  const hash = await walletClient.writeContract({
    address: REGISTRATION_WORKFLOWS,
    abi,
    functionName: 'createCollection',
    args: [{
      name: 'Heaven Songs',
      symbol: 'HVNSONG',
      baseURI: '',
      contractURI: '',
      maxSupply: 1000000,
      mintFee: 0n,
      mintFeeToken: WIP_TOKEN,
      mintFeeRecipient: account.address,
      owner: account.address,
      mintOpen: true,
      isPublicMinting: true, // Allow periphery contracts (LicenseAttachmentWorkflows) to mint
    }],
  });

  console.log(`   TX Hash:  ${hash}`);
  console.log('   Waiting for confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`   Block:    ${receipt.blockNumber}`);
  console.log(`   Status:   ${receipt.status}`);

  if (receipt.status !== 'success') {
    console.error('\nTransaction failed!');
    process.exit(1);
  }

  // The SPG NFT contract address is returned from the function call.
  // It's also emitted in a log. Let's check logs for the created contract.
  // The createCollection returns the address, but we need to decode it from logs.
  // Typically the first log contains the new contract address.
  let spgNftContract: string | null = null;

  // Look for the contract address in logs
  for (const log of receipt.logs) {
    // The SPGNFTBeacon proxy creation typically emits an event with the new address
    // Check for addresses in topics that aren't known contracts
    if (log.address && log.address.toLowerCase() !== REGISTRATION_WORKFLOWS.toLowerCase()) {
      // This is likely the new SPG NFT contract
      spgNftContract = log.address;
      break;
    }
  }

  // If we couldn't find it from logs, try decoding the return value via trace
  if (!spgNftContract) {
    // Fallback: look at all log addresses
    const uniqueAddresses = [...new Set(receipt.logs.map(l => l.address))];
    const newAddresses = uniqueAddresses.filter(
      a => a.toLowerCase() !== REGISTRATION_WORKFLOWS.toLowerCase()
    );
    if (newAddresses.length > 0) {
      spgNftContract = newAddresses[0];
    }
  }

  if (!spgNftContract) {
    console.error('\nCould not determine SPG NFT contract address from logs.');
    console.error('Check the transaction on the explorer:');
    console.error(`   https://aeneid.storyscan.xyz/tx/${hash}`);
    console.log('\nLogs:');
    for (const log of receipt.logs) {
      console.log(`   ${log.address} | topics: ${log.topics.length}`);
    }
    process.exit(1);
  }

  console.log(`\n   SPG NFT Contract: ${spgNftContract}`);

  // Save to output file
  const outputPath = join(ROOT_DIR, 'output/spg-nft-aeneid.json');
  const output = {
    contract: spgNftContract,
    txHash: hash,
    blockNumber: Number(receipt.blockNumber),
    deployer: account.address,
    chainId: 1315,
    name: 'Heaven Songs',
    symbol: 'HVNSONG',
    deployedAt: new Date().toISOString(),
  };
  writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`   Saved to: output/spg-nft-aeneid.json`);

  console.log('\n' + '='.repeat(50));
  console.log('Next steps:');
  console.log(`   1. Update SPG_NFT_CONTRACT in actions/story-register-sponsor-v1.js:`);
  console.log(`      const SPG_NFT_CONTRACT = "${spgNftContract}";`);
  console.log(`   2. Fund sponsor PKP with Story Aeneid IP tokens`);
  console.log(`   3. Run: bun scripts/setup.ts storyRegisterSponsor`);
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
