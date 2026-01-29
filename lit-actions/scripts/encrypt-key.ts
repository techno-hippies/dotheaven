#!/usr/bin/env bun

/**
 * Encrypt API keys for Lit Actions
 *
 * Usage:
 *   bun scripts/encrypt-key.ts --action=survey
 */

import { createLitClient } from '@lit-protocol/lit-client';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Env } from '../tests/shared/env';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '../');

const args = process.argv.slice(2);
const actionArg = args.find(a => a.startsWith('--action='))?.split('=')[1] || 'survey';

const TASKS: Record<string, { keys: { name: string; envVar: string }[] }> = {
  survey: {
    keys: [],
  },
};

async function main() {
  const task = TASKS[actionArg];
  if (!task) {
    console.error('❌ Unknown action:', actionArg);
    process.exit(1);
  }

  if (task.keys.length === 0) {
    console.log(`ℹ️  No keys configured for action "${actionArg}". Nothing to encrypt.`);
    return;
  }

  // Load CID
  const cidPath = join(ROOT_DIR, `cids/${Env.keyEnv}.json`);
  const cids = existsSync(cidPath) ? JSON.parse(readFileSync(cidPath, 'utf-8')) : {};
  const cid = cids[actionArg];

  if (!cid) {
    console.error(`❌ No CID found for ${actionArg}. Run upload-action.ts first.`);
    process.exit(1);
  }

  // Check env vars
  for (const key of task.keys) {
    if (!process.env[key.envVar]) {
      console.error(`❌ Missing ${key.envVar}`);
      process.exit(1);
    }
  }

  console.log('🔐 Encrypt Keys');
  console.log(`   Env: ${Env.name}`);
  console.log(`   Action: ${actionArg}`);
  console.log(`   CID: ${cid}`);

  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log('🔌 Connected to Lit
');

  const outputDir = join(ROOT_DIR, 'keys', Env.keyEnv, actionArg);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const accessControlConditions = [{
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':currentActionIpfsId'],
    returnValueTest: { comparator: '=', value: cid },
  }];

  for (const keyDef of task.keys) {
    console.log(`   🔑 Encrypting ${keyDef.name}...`);
    const encrypted = await litClient.encrypt({
      dataToEncrypt: process.env[keyDef.envVar]!,
      unifiedAccessControlConditions: accessControlConditions,
      chain: 'ethereum',
    });

    const outputData = {
      ciphertext: encrypted.ciphertext,
      dataToEncryptHash: encrypted.dataToEncryptHash,
      accessControlConditions,
      encryptedAt: new Date().toISOString(),
      cid,
    };

    const fileName = `${keyDef.name}_${actionArg}.json`;
    writeFileSync(join(outputDir, fileName), JSON.stringify(outputData, null, 2));
    console.log(`      ✅ keys/${Env.keyEnv}/${actionArg}/${fileName}`);
  }

  await litClient.disconnect();
  console.log('\n✨ Done!');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
