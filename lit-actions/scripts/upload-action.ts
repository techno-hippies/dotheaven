#!/usr/bin/env bun

/**
 * Upload a Lit Action to IPFS via Filebase
 *
 * Usage:
 *   bun scripts/upload-action.ts survey
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Env } from '../tests/shared/env';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '../');

const args = process.argv.slice(2);
const actionArg = args.find(a => !a.startsWith('--'));

const ACTIONS: Record<string, { path: string; name: string; hasKeys: boolean }> = {
  survey: {
    path: 'actions/survey-registry-sponsor-v1.js',
    name: 'Survey Registry Sponsor v1',
    hasKeys: false,
  },
};

const FILEBASE_RPC_BASE_URL = 'https://rpc.filebase.io';

function parseIpfsAddResponse(text: string): { Hash: string; Name?: string; Size?: string } {
  // IPFS /api/v0/add often returns newline-delimited JSON (NDJSON).
  const line = text.trim().split('\n').filter(Boolean).pop();
  if (!line) throw new Error('Empty response from Filebase /api/v0/add');
  try {
    return JSON.parse(line);
  } catch {
    throw new Error(`Could not parse /api/v0/add response: ${line}`);
  }
}

async function main() {
  const FILEBASE_API_KEY = process.env.FILEBASE_API_KEY;
  if (!FILEBASE_API_KEY) {
    console.error('❌ FILEBASE_API_KEY not found');
    process.exit(1);
  }

  if (!actionArg || !ACTIONS[actionArg]) {
    console.error('❌ Usage: bun scripts/upload-action.ts <action>');
    console.error('   Available:', Object.keys(ACTIONS).join(', '));
    process.exit(1);
  }

  const { path: filePath, name: actionName, hasKeys } = ACTIONS[actionArg];
  const fullPath = join(ROOT_DIR, filePath);

  if (!existsSync(fullPath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  console.log('📤 Upload Lit Action');
  console.log(`   Env: ${Env.name}`);
  console.log(`   File: ${filePath}`);

  const jsCode = readFileSync(fullPath, 'utf-8');
  console.log(`   Size: ${jsCode.length} bytes`);

  console.log('\n🚀 Uploading to IPFS via Filebase (RPC API)...');

  // /api/v0/add: upload file content
  const formData = new FormData();
  const filename = `${actionName.replace(/\s+/g, '-')}.js`;
  formData.append('file', new Blob([jsCode], { type: 'text/javascript' }), filename);

  // Optional query params:
  // - cid-version=1 for CIDv1
  // - wrap-with-directory=false to return the file CID directly
  const addUrl = `${FILEBASE_RPC_BASE_URL}/api/v0/add?cid-version=1&wrap-with-directory=false`;

  const addRes = await fetch(addUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${FILEBASE_API_KEY}` },
    body: formData,
  });

  if (!addRes.ok) {
    throw new Error(`Filebase /add failed: ${await addRes.text()}`);
  }

  const addText = await addRes.text();
  const addJson = parseIpfsAddResponse(addText);
  const cid = addJson.Hash;
  if (!cid) throw new Error(`No CID (Hash) in /add response: ${addText}`);

  // /api/v0/pin/add: ensure it remains stored (safe even if already pinned)
  console.log('📌 Pinning CID on Filebase...');
  const pinUrl = `${FILEBASE_RPC_BASE_URL}/api/v0/pin/add?arg=${encodeURIComponent(cid)}`;
  const pinRes = await fetch(pinUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${FILEBASE_API_KEY}` },
  });

  if (!pinRes.ok) {
    throw new Error(`Filebase /pin/add failed: ${await pinRes.text()}`);
  }

  console.log('\n✅ Upload successful!');
  console.log(`   CID: ${cid}`);
  console.log(`   Gateway: https://ipfs.filebase.io/ipfs/${cid}`);

  // Update CID file
  const cidPath = join(ROOT_DIR, `cids/${Env.keyEnv}.json`);
  const cids = existsSync(cidPath) ? JSON.parse(readFileSync(cidPath, 'utf-8')) : {};
  cids[actionArg] = cid;
  writeFileSync(cidPath, JSON.stringify(cids, null, 2) + '\n');
  console.log(`\n📝 Updated cids/${Env.keyEnv}.json`);

  console.log('\n⚠️  Next steps:');
  console.log(`   1. bun scripts/add-permission.ts ${cid}`);
  if (hasKeys) {
    console.log(`   2. bun scripts/encrypt-key.ts --action=${actionArg}`);
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
