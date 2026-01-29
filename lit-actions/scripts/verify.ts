#!/usr/bin/env bun

/**
 * Verify Lit Action configuration
 *
 * Usage:
 *   bun scripts/verify.ts
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Env } from '../tests/shared/env';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '../');

function main() {
  console.log('🔍 Verify Lit Actions Configuration');
  console.log(`   Env: ${Env.name}`);
  console.log('');

  let hasErrors = false;

  // Check CIDs
  const cidPath = join(ROOT_DIR, `cids/${Env.keyEnv}.json`);
  if (!existsSync(cidPath)) {
    console.log(`❌ CID file not found: cids/${Env.keyEnv}.json`);
    hasErrors = true;
  } else {
    const cids = JSON.parse(readFileSync(cidPath, 'utf-8'));
    console.log('📂 CIDs:');
    for (const [action, cid] of Object.entries(cids)) {
      if (cid) {
        console.log(`   ✅ ${action}: ${cid}`);
      } else {
        console.log(`   ❌ ${action}: (empty)`);
        hasErrors = true;
      }
    }
  }
  console.log('');

  // Check keys (only actions that require keys)
  const actions = [
    { name: 'songUpload', keys: ['filebase_api_key_songUpload.json'] },
    { name: 'lyricsAlignment', keys: ['elevenlabs_api_key_lyricsAlignment.json'] },
    { name: 'translateLyrics', keys: ['openrouter_api_key_translateLyrics.json'] },
  ];

  console.log('🔑 Encrypted Keys:');
  for (const action of actions) {
    if (action.keys.length === 0) {
      console.log(`   ✅ ${action.name}: no keys required`);
      continue;
    }

    const keysDir = join(ROOT_DIR, 'keys', Env.keyEnv, action.name);
    if (!existsSync(keysDir)) {
      console.log(`   ❌ ${action.name}: keys/${Env.keyEnv}/${action.name}/ not found`);
      hasErrors = true;
      continue;
    }

    for (const keyFileName of action.keys) {
      const keyFile = join(keysDir, keyFileName);
      if (!existsSync(keyFile)) {
        console.log(`   ❌ ${action.name}: ${keyFileName} not found`);
        hasErrors = true;
      }
    }
  }
  console.log('');

  // Check PKP
  const pkpPath = join(ROOT_DIR, `output/pkp-${Env.name}.json`);
  console.log('🔐 PKP:');
  if (!existsSync(pkpPath)) {
    console.log(`   ❌ output/pkp-${Env.name}.json not found`);
    hasErrors = true;
  } else {
    const pkp = JSON.parse(readFileSync(pkpPath, 'utf-8'));
    console.log(`   ✅ ${pkp.ethAddress}`);
    console.log(`      Token ID: ${pkp.tokenId}`);
  }
  console.log('');

  if (hasErrors) {
    console.log('❌ Configuration has errors');
    process.exit(1);
  } else {
    console.log('✅ Configuration OK');
  }
}

main();
