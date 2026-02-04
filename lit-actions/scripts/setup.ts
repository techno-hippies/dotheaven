#!/usr/bin/env bun

/**
 * Complete Lit Action Setup Pipeline
 *
 * Orchestrates the full deployment workflow:
 * 1. Upload Lit Action to IPFS via Filebase
 * 2. Add PKP permission for the new CID
 * 3. Re-encrypt API keys with the new CID
 *
 * Usage:
 *   bun scripts/setup.ts songUpload         # Full setup for song upload action
 *   bun scripts/setup.ts lyricsAlignment    # Full setup for lyrics alignment
 *   bun scripts/setup.ts translateLyrics    # Full setup for translation
 *   bun scripts/setup.ts --dry-run          # Preview without changes
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLitClient } from '@lit-protocol/lit-client';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Env } from '../tests/shared/env';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '../');

// Chronicle Yellowstone chain (for PKP permissions)
const chronicleYellowstone = {
  id: 175188,
  name: 'Chronicle Yellowstone',
  nativeCurrency: { name: 'tstLPX', symbol: 'tstLPX', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://yellowstone-rpc.litprotocol.com'] },
  },
};

// Action definitions
interface ActionDef {
  name: string;
  path: string;
  displayName: string;
  keys: { name: string; envVar: string }[];
}

const ACTIONS: Record<string, ActionDef> = {
  storyRegisterSponsor: {
    name: 'storyRegisterSponsor',
    path: 'actions/story-register-sponsor-v1.js',
    displayName: 'Story Register Sponsor v1',
    keys: [], // No encrypted keys — sponsor PKP pays gas directly
  },
  songPublish: {
    name: 'songPublish',
    path: 'actions/song-publish-v1.js',
    displayName: 'Song Publish v1',
    keys: [
      { name: 'filebase_api_key', envVar: 'FILEBASE_SONGS_BUCKET_API_KEY' },
      { name: 'elevenlabs_api_key', envVar: 'ELEVENLABS_API_KEY' },
      { name: 'openrouter_api_key', envVar: 'OPENROUTER_API_KEY' },
    ],
  },
  avatarUpload: {
    name: 'avatarUpload',
    path: 'actions/avatar-upload-v1.js',
    displayName: 'Avatar Upload v1',
    keys: [
      { name: 'filebase_api_key', envVar: 'FILEBASE_SONGS_BUCKET_API_KEY' },
      { name: 'openrouter_api_key', envVar: 'OPENROUTER_API_KEY' },
    ],
  },
  heavenClaimName: {
    name: 'heavenClaimName',
    path: 'actions/heaven-claim-name-v1.js',
    displayName: 'Heaven Claim Name v1',
    keys: [], // No encrypted keys — sponsor PKP pays gas directly
  },
  heavenSetProfile: {
    name: 'heavenSetProfile',
    path: 'actions/heaven-set-profile-v1.js',
    displayName: 'Heaven Set Profile v1',
    keys: [], // No encrypted keys — sponsor PKP pays gas directly
  },
  lyricsTranslate: {
    name: 'lyricsTranslate',
    path: 'actions/lyrics-translate-v1.js',
    displayName: 'Lyrics Translate v1',
    keys: [
      { name: 'filebase_api_key', envVar: 'FILEBASE_SONGS_BUCKET_API_KEY' },
      { name: 'openrouter_api_key', envVar: 'OPENROUTER_API_KEY' },
    ],
  },
  scrobbleSubmitV3: {
    name: 'scrobbleSubmitV3',
    path: 'actions/scrobble-submit-v3.js',
    displayName: 'Scrobble Submit v3',
    keys: [
      { name: 'filebase_covers_key', envVar: 'FILEBASE_COVERS_KEY' },
    ],
  },
  playlistV1: {
    name: 'playlistV1',
    path: 'actions/playlist-v1.js',
    displayName: 'Playlist v1',
    keys: [
      { name: 'filebase_covers_key', envVar: 'FILEBASE_COVERS_KEY' },
    ],
  },
  heavenSetRecords: {
    name: 'heavenSetRecords',
    path: 'actions/heaven-set-records-v1.js',
    displayName: 'Heaven Set Records v1',
    keys: [], // No encrypted keys — sponsor PKP pays gas directly
  },
  contentRegisterV1: {
    name: 'contentRegisterV1',
    path: 'actions/content-register-v1.js',
    displayName: 'Content Register v1',
    keys: [], // No encrypted keys — sponsor PKP pays gas directly
  },
  contentAccessV1: {
    name: 'contentAccessV1',
    path: 'actions/content-access-v1.js',
    displayName: 'Content Access v1',
    keys: [], // No encrypted keys — sponsor PKP pays gas directly
  },
  contentDecryptV1: {
    name: 'contentDecryptV1',
    path: 'actions/content-decrypt-v1.js',
    displayName: 'Content Decrypt v1',
    keys: [], // No encrypted keys — Lit Action only
  },
  postCreateV1: {
    name: 'postCreateV1',
    path: 'actions/post-create-v1.js',
    displayName: 'Post Create v1',
    keys: [
      { name: 'filebase_api_key', envVar: 'FILEBASE_SONGS_BUCKET_API_KEY' },
      { name: 'openrouter_api_key', envVar: 'OPENROUTER_API_KEY' },
      { name: 'fal_api_key', envVar: 'FAL_KEY' },
    ],
  },
  postTextV1: {
    name: 'postTextV1',
    path: 'actions/post-text-v1.js',
    displayName: 'Post Text v1',
    keys: [
      { name: 'filebase_api_key', envVar: 'FILEBASE_SONGS_BUCKET_API_KEY' },
    ],
  },
  linkEoaV1: {
    name: 'linkEoaV1',
    path: 'actions/link-eoa-v1.js',
    displayName: 'Link EOA v1',
    keys: [], // No encrypted keys — sponsor PKP pays gas directly
  },
  postRegisterV1: {
    name: 'postRegisterV1',
    path: 'actions/post-register-v1.js',
    displayName: 'Post Register v1',
    keys: [
      { name: 'filebase_api_key', envVar: 'FILEBASE_SONGS_BUCKET_API_KEY' },
      { name: 'openrouter_api_key', envVar: 'OPENROUTER_API_KEY' },
    ],
  },
  photoRevealV1: {
    name: 'photoRevealV1',
    path: 'actions/photo-reveal-v1.js',
    displayName: 'Photo Reveal v1',
    keys: [], // No encrypted keys — watermark secret is hardcoded seed, decryption uses Lit ACLs
  },
};

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const actionArg = args.find(a => !a.startsWith('--'));

function log(msg: string, type: 'info' | 'success' | 'error' | 'warn' | 'step' = 'info') {
  const prefixes: Record<string, string> = {
    info: '   ',
    success: '   OK: ',
    error: '   ERR: ',
    warn: '   WARN: ',
    step: '\n=> '
  };
  console.log(`${prefixes[type]}${msg}`);
}

async function uploadAction(action: ActionDef, filebaseKey: string): Promise<string> {
  const fullPath = join(ROOT_DIR, action.path);
  const jsCode = readFileSync(fullPath, 'utf-8');
  const fileName = `${action.displayName.replace(/\s+/g, '-')}.js`;

  log(`Uploading ${action.path} (${jsCode.length} bytes)...`, 'info');

  // Filebase S3-compatible IPFS upload
  // The key is base64 encoded: "accessKey:secretKey:bucketName"
  const decoded = Buffer.from(filebaseKey, 'base64').toString('utf-8');
  const [accessKey, secretKey, bucket] = decoded.split(':');

  if (!accessKey || !secretKey || !bucket) {
    throw new Error('Invalid FILEBASE_API_KEY format. Expected base64(accessKey:secretKey:bucket)');
  }

  // Use Filebase's S3 API to upload
  const endpoint = 's3.filebase.com';
  const region = 'us-east-1';
  const service = 's3';

  // Create AWS Signature V4
  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = `/${bucket}/${fileName}`;
  const canonicalQueryString = '';
  const payloadHash = await sha256(jsCode);
  const canonicalHeaders = [
    `host:${endpoint}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join('\n');

  const signingKey = await getSignatureKey(secretKey, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  const authorizationHeader = [
    `${algorithm} Credential=${accessKey}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  const response = await fetch(`https://${endpoint}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      'Authorization': authorizationHeader,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'Content-Type': 'text/javascript',
    },
    body: jsCode,
  });

  if (!response.ok) {
    throw new Error(`Filebase upload failed: ${response.status} ${await response.text()}`);
  }

  // Get CID from response header
  const cid = response.headers.get('x-amz-meta-cid');
  if (!cid) {
    throw new Error('No CID returned from Filebase. Check bucket IPFS settings.');
  }

  return cid;
}

// AWS Signature V4 helpers
async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

async function hmacHex(key: ArrayBuffer | Uint8Array, message: string): Promise<string> {
  const sig = await hmac(key, message);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const kDate = await hmac(encoder.encode('AWS4' + key), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

async function addPermission(
  cid: string,
  pkpCreds: any,
  litClient: any,
  walletClient: any
): Promise<void> {
  const pkpPermissionsManager = await litClient.getPKPPermissionsManager({
    pkpIdentifier: { tokenId: pkpCreds.tokenId },
    account: walletClient.account,
  });

  await pkpPermissionsManager.addPermittedAction({
    ipfsId: cid,
    scopes: ['sign-anything'],
  });
}

async function encryptKeys(
  action: ActionDef,
  cid: string,
  litClient: any
): Promise<void> {
  if (action.keys.length === 0) {
    log('No keys configured for this action', 'info');
    return;
  }

  const outputDir = join(ROOT_DIR, 'keys', Env.keyEnv, action.name);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const accessControlConditions = [
    {
      conditionType: 'evmBasic',
      contractAddress: '',
      standardContractType: '',
      chain: 'ethereum',
      method: '',
      parameters: [':currentActionIpfsId'],
      returnValueTest: {
        comparator: '=',
        value: cid,
      },
    },
  ];

  for (const keyDef of action.keys) {
    const value = process.env[keyDef.envVar];
    if (!value) {
      log(`Skipping ${keyDef.name} (${keyDef.envVar} not set)`, 'warn');
      continue;
    }

    const encrypted = await litClient.encrypt({
      dataToEncrypt: value,
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

    const filePath = join(outputDir, `${keyDef.name}_${action.name}.json`);
    writeFileSync(filePath, JSON.stringify(outputData, null, 2));
    log(`Encrypted ${keyDef.name}`, 'info');
  }
}

async function setupAction(action: ActionDef, ctx: {
  filebaseKey: string;
  pkpCreds: any;
  litClient: any;
  walletClient: any;
}): Promise<string> {
  log(`Setup ${action.displayName}`, 'step');

  // Step 1: Upload
  log('Uploading to IPFS...', 'info');
  const cid = dryRun ? 'QmDRYRUN' : await uploadAction(action, ctx.filebaseKey);
  log(`CID: ${cid}`, 'success');

  // Step 2: Update CID file
  const cidPath = join(ROOT_DIR, `cids/${Env.keyEnv}.json`);
  const cids = existsSync(cidPath) ? JSON.parse(readFileSync(cidPath, 'utf-8')) : {};
  const oldCid = cids[action.name];
  cids[action.name] = cid;
  if (!dryRun) {
    writeFileSync(cidPath, JSON.stringify(cids, null, 2) + '\n');
  }
  if (oldCid && oldCid !== cid) {
    log(`Updated cids/${Env.keyEnv}.json: ${oldCid.slice(0, 12)}... -> ${cid.slice(0, 12)}...`, 'info');
  }

  // Step 3: Add PKP permission
  log('Adding PKP permission...', 'info');
  if (!dryRun) {
    await addPermission(cid, ctx.pkpCreds, ctx.litClient, ctx.walletClient);
  }
  log('Permission added', 'success');

  // Step 4: Encrypt keys
  if (action.keys.length > 0) {
    log('Encrypting keys...', 'info');
    if (!dryRun) {
      await encryptKeys(action, cid, ctx.litClient);
    }
    log('Keys encrypted', 'success');
  } else {
    log('No keys to encrypt for this action', 'info');
  }

  return cid;
}

async function main() {
  // Determine which action to setup
  if (!actionArg || !ACTIONS[actionArg]) {
    console.error('Usage: bun scripts/setup.ts <action> [--dry-run]');
    console.error('   Available actions:', Object.keys(ACTIONS).join(', '));
    process.exit(1);
  }

  const action = ACTIONS[actionArg];

  console.log('Lit Action Setup');
  console.log('='.repeat(50));
  console.log(`   Env: ${Env.name}`);
  console.log(`   Action: ${action.name}`);
  if (dryRun) {
    console.log('   Mode: DRY RUN (no changes)');
  }

  // Check required env vars
  const FILEBASE_KEY = process.env.FILEBASE_API_KEY;
  if (!FILEBASE_KEY) {
    console.error('\nFILEBASE_API_KEY not found');
    process.exit(1);
  }

  let privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('\nPRIVATE_KEY not found');
    process.exit(1);
  }
  if (!privateKey.startsWith('0x')) {
    privateKey = '0x' + privateKey;
  }

  // Load PKP credentials
  const pkpPath = join(ROOT_DIR, `output/pkp-${Env.name}.json`);
  if (!existsSync(pkpPath)) {
    console.error(`\nPKP file not found: output/pkp-${Env.name}.json`);
    console.error('   Run: bun scripts/mint-pkp.ts first');
    process.exit(1);
  }
  const pkpCreds = JSON.parse(readFileSync(pkpPath, 'utf-8'));
  console.log(`   PKP: ${pkpCreds.ethAddress}`);

  // Connect to Lit
  console.log('\nConnecting to Lit Protocol...');
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log('Connected');

  // Create wallet client
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: chronicleYellowstone,
    transport: http(),
  });

  const ctx = { filebaseKey: FILEBASE_KEY, pkpCreds, litClient, walletClient };

  try {
    const cid = await setupAction(action, ctx);

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('Setup Complete');
    console.log('='.repeat(50));
    console.log(`   ${action.name}: ${cid}`);

    if (dryRun) {
      console.log('\nDRY RUN - no changes were made');
    } else {
      console.log('\nNext steps:');
      let step = 1;
      console.log(`   ${step++}. Update clients to use new CID: ${cid}`);
      if (action.keys.length > 0) {
        console.log(`   ${step++}. Copy encrypted keys from keys/${Env.keyEnv}/${action.name}/`);
      }
      console.log(`   ${step++}. Test the Lit Action execution`);
    }

  } finally {
    await litClient.disconnect();
  }
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
