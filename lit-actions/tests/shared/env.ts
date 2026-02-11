import { nagaDev, nagaTest } from '@lit-protocol/networks';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '../../');

// Load lit-actions/.env if present
dotenv.config({ path: join(ROOT_DIR, '.env') });

// Detect Environment
const RAW_ENV = (process.env.LIT_NETWORK || 'naga-dev').toLowerCase();
const IS_TEST = RAW_ENV === 'naga-test';
const IS_DEV = RAW_ENV === 'naga-dev';

if (!IS_TEST && !IS_DEV) {
  console.warn(`Unknown LIT_NETWORK: ${RAW_ENV}. Defaulting to naga-dev.`);
}

const ENV_NAME = IS_TEST ? 'naga-test' : 'naga-dev';
const KEY_ENV = IS_TEST ? 'test' : 'dev';

// Types
interface LitEnvConfig {
  network: string;
  cidFile: string;
  pkpFile: string;
  keysDir: string;
  permissionsContract: string;
  notes?: string;
}

interface CIDs {
  songPublish: string;
  lyricsTranslate: string;
  storyRegisterSponsor: string;
  avatarUpload: string;
  heavenClaimName: string;
  heavenSetProfile: string;
  heavenSetRecords: string;
  scrobbleSubmitV3: string;
  playlistV1: string;
  contentRegisterV1: string;
  contentRegisterV2: string;
  contentAccessV1: string;
  contentDecryptV1: string;
  postCreateV1: string;
  postTextV1: string;
  followV1: string;
  likeV1: string;
  commentV1: string;
  flagV1: string;
  [key: string]: string;
}

interface EncryptedKey {
  cid: string;
  ciphertext: string;
  dataToEncryptHash: string;
  accessControlConditions: any[];
}

interface PkpCreds {
  tokenId: string;
  publicKey: string;
  ethAddress: string;
  pkpPrivateKey?: string;
  [key: string]: any;
}

// Load Configs
const litEnvsPath = join(ROOT_DIR, 'config/lit-envs.json');
const litEnvs: Record<string, LitEnvConfig> = JSON.parse(readFileSync(litEnvsPath, 'utf-8'));
const envConfig = litEnvs[ENV_NAME];

if (!envConfig) {
  throw new Error(`No config found for environment: ${ENV_NAME} in lit-envs.json`);
}

// Load CIDs
const cidPath = join(ROOT_DIR, envConfig.cidFile);
let cids: CIDs = {
  songPublish: '',
  lyricsTranslate: '',
  storyRegisterSponsor: '',
  avatarUpload: '',
  heavenClaimName: '',
  heavenSetProfile: '',
  heavenSetRecords: '',
  scrobbleSubmitV3: '',
  playlistV1: '',
  contentRegisterV1: '',
  contentRegisterV2: '',
  contentAccessV1: '',
  contentDecryptV1: '',
  postCreateV1: '',
  postTextV1: '',
  followV1: '',
  likeV1: '',
  commentV1: '',
  flagV1: '',
};
if (existsSync(cidPath)) {
  cids = JSON.parse(readFileSync(cidPath, 'utf-8'));
}

// Lit Network Object
const litNetwork = IS_TEST ? nagaTest : nagaDev;

export const Env = {
  name: ENV_NAME,
  keyEnv: KEY_ENV,
  isTest: IS_TEST,
  isDev: IS_DEV,
  litNetwork,

  // Configs
  cids,
  config: envConfig,

  // Helpers
  paths: {
    root: ROOT_DIR,
    keys: join(ROOT_DIR, 'keys', KEY_ENV),
    output: join(ROOT_DIR, 'output'),
  },

  getKeyPath(action: string, keyName: string): string {
    const fileName = `${keyName}_${action}.json`;
    return join(this.paths.keys, action, fileName);
  },

  loadKey(action: string, keyName: string): EncryptedKey {
    const path = this.getKeyPath(action, keyName);
    if (!existsSync(path)) {
      throw new Error(`Key file not found: ${path} (Env: ${ENV_NAME})`);
    }
    return JSON.parse(readFileSync(path, 'utf-8'));
  },

  getAuthStoragePath(appName: string): string {
    return join(this.paths.output, 'lit-auth', ENV_NAME, appName);
  },

  loadPkpCreds(): PkpCreds {
    const pkpPath = join(ROOT_DIR, envConfig.pkpFile);
    if (!existsSync(pkpPath)) {
      throw new Error(`PKP file not found: ${pkpPath} (Env: ${ENV_NAME})`);
    }

    const base = JSON.parse(readFileSync(pkpPath, 'utf-8')) as PkpCreds;
    const pkpPrivateKey = process.env.PKP_PRIVATE_KEY
      || process.env.PRIVATE_KEY
      || base.pkpPrivateKey;

    return {
      ...base,
      pkpPrivateKey,
    };
  },
};
