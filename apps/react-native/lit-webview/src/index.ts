import { createLitClient } from '@lit-protocol/lit-client';
import { nagaDev } from '@lit-protocol/networks';
import { createAuthManager, storagePlugins, WebAuthnAuthenticator } from '@lit-protocol/auth';
import type { LitClient } from '@lit-protocol/lit-client';
import { Buffer } from 'buffer';
import { hashMessage, toBytes } from 'viem';

// Ensure Buffer is available for WebAuthn decoding helpers.
(globalThis as any).Buffer = Buffer;

// ============================================================================
// Type definitions for the bridge protocol
// ============================================================================

interface BridgeRequest {
  id: string;
  op: string;
  payload?: any;
}

interface BridgeResponse {
  id: string;
  ok: boolean;
  result?: any;
  error?: string;
}

function toJsonSafeValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
  }
  return value;
}

function stringifyJsonSafe(value: unknown): string {
  return JSON.stringify(value, (_key, v) => toJsonSafeValue(v));
}

function addMessageListener(handler: (event: MessageEvent) => void): void {
  window.addEventListener('message', handler as any);
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('message', handler as any);
  }
}

// ============================================================================
// Storage bridge - proxies to native secure storage
// ============================================================================

class NativeStoragePlugin {
  private pendingRequests = new Map<string, { resolve: (value: string | null) => void; reject: (error: Error) => void }>();

  constructor() {
    // Listen for storage responses from native
    addMessageListener((event) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.type === 'storageResponse') {
          const pending = this.pendingRequests.get(data.id);
          if (pending) {
            this.pendingRequests.delete(data.id);
            if (data.ok) {
              pending.resolve(data.value);
            } else {
              pending.reject(new Error(data.error || 'Storage operation failed'));
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse storage response:', e);
      }
    });
  }

  async getItem(key: string): Promise<string | null> {
    const id = `storage-${Date.now()}-${Math.random()}`;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.postToNative({ type: 'storageGet', id, key });
      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Storage get timeout'));
        }
      }, 5000);
    });
  }

  async setItem(key: string, value: string): Promise<void> {
    const id = `storage-${Date.now()}-${Math.random()}`;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: () => resolve(), reject });
      this.postToNative({ type: 'storageSet', id, key, value });
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Storage set timeout'));
        }
      }, 5000);
    });
  }

  async removeItem(key: string): Promise<void> {
    const id = `storage-${Date.now()}-${Math.random()}`;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: () => resolve(), reject });
      this.postToNative({ type: 'storageRemove', id, key });
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Storage remove timeout'));
        }
      }, 5000);
    });
  }

  private postToNative(message: any): void {
    if ((window as any).ReactNativeWebView) {
      (window as any).ReactNativeWebView.postMessage(stringifyJsonSafe(message));
    } else {
      // Fallback for testing in browser
      console.log('[NativeStorage]', message);
    }
  }
}

// ============================================================================
// Lit Engine - singleton instances
// ============================================================================

let litClient: LitClient | null = null;
let authManager: ReturnType<typeof createAuthManager> | null = null;
let lastAuthContext: any = null;
let lastAuthParams: { authData: any; pkpPublicKey: string; authConfig: any } | null = null;
let lastPasskeyContext: { expectedRpId?: string; allowNonCanonicalRp?: boolean } | null = null;
let isInitialized = false;
let initPromise: Promise<void> | null = null;
const LIT_CONNECT_TIMEOUT_MS = 60_000;
const LIT_INIT_MAX_ATTEMPTS = 3;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

/** Ensure 0x prefix — used for auth manager APIs (createPkpAuthContext, etc.) */
function ensurePkpPublicKeyPrefix(publicKey: unknown): string {
  const value = String(publicKey ?? '');
  if (value.startsWith('0x') || value.startsWith('0X')) {
    return value;
  }
  return `0x${value}`;
}

/** Strip 0x prefix — used for Lit Action jsParams (signAndCombineEcdsa expects bare hex) */
function stripPkpPublicKeyPrefix(publicKey: unknown): string {
  const value = String(publicKey ?? '');
  if (value.startsWith('0x') || value.startsWith('0X')) {
    return value.slice(2);
  }
  return value;
}

function normalizeExecuteJsParams(jsParams: unknown): Record<string, unknown> {
  if (!jsParams || typeof jsParams !== 'object') {
    return {};
  }

  const normalized = { ...(jsParams as Record<string, unknown>) };
  // Lit Action signAndCombineEcdsa expects bare hex (no 0x prefix)
  if (typeof normalized.publicKey === 'string') {
    normalized.publicKey = stripPkpPublicKeyPrefix(normalized.publicKey);
  }
  if (typeof normalized.userPkpPublicKey === 'string') {
    normalized.userPkpPublicKey = stripPkpPublicKeyPrefix(normalized.userPkpPublicKey);
  }
  return normalized;
}

function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value);
}

function hostMatchesRpId(hostname: string, rpId: string): boolean {
  if (!hostname || !rpId) return false;
  const normalizedHost = hostname.toLowerCase();
  const normalizedRpId = rpId.toLowerCase();
  return (
    normalizedHost === normalizedRpId ||
    normalizedHost.endsWith(`.${normalizedRpId}`)
  );
}

function assertPasskeyRpContext(op: string, payload: any): {
  currentHost: string;
  expectedRpId: string;
  allowNonCanonicalRp: boolean;
} {
  const currentHost = String(window.location.hostname || '').toLowerCase();
  const expectedRpIdRaw = String(payload?.expectedRpId || '').trim();
  const expectedRpId = expectedRpIdRaw.toLowerCase();
  const allowNonCanonicalRp = payload?.allowNonCanonicalRp === true;

  if (!expectedRpId) {
    return { currentHost, expectedRpId: '', allowNonCanonicalRp };
  }

  const isMatch = hostMatchesRpId(currentHost, expectedRpId);
  console.log(
    `[Lit] ${op}: passkey context host=${currentHost}, expectedRpId=${expectedRpId}, match=${isMatch}`,
  );

  if (!isMatch && !allowNonCanonicalRp) {
    throw new Error(
      `Passkey RP mismatch: current WebView host "${currentHost}" does not match expected RP ID "${expectedRpId}". ` +
      'Load the Lit auth WebView from your canonical HTTPS domain or set EXPO_PUBLIC_ALLOW_NON_CANONICAL_PASSKEY_RP=1 for temporary testing.',
    );
  }

  return { currentHost, expectedRpId, allowNonCanonicalRp };
}

function normalizeAuthConfigDomain(rawAuthConfig: unknown): {
  authConfig: any;
  domainRaw: string;
  domainResolved?: string;
  domainHostname?: string;
  domainParseError?: string;
} {
  const authConfig: any =
    rawAuthConfig && typeof rawAuthConfig === 'object'
      ? { ...(rawAuthConfig as Record<string, unknown>) }
      : {};
  const domainRaw = typeof authConfig.domain === 'string' ? authConfig.domain.trim() : '';

  if (!domainRaw) {
    return { authConfig, domainRaw: '' };
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(domainRaw)
    ? domainRaw
    : `https://${domainRaw}`;

  try {
    const parsed = new URL(withScheme);
    const domainResolved = parsed.origin;
    const domainHostname = parsed.hostname.toLowerCase();
    authConfig.domain = domainHostname;
    return { authConfig, domainRaw, domainResolved, domainHostname };
  } catch (error) {
    return {
      authConfig,
      domainRaw,
      domainParseError: getErrorMessage(error),
    };
  }
}

function toEcdsa65ByteSignature(sig: any): string {
  if (!sig || typeof sig !== 'object') {
    throw new Error('No signature object returned from Lit executeJs');
  }

  const strip0x = (hex: string): string => (hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex);

  if (typeof sig.r === 'string' && typeof sig.s === 'string') {
    const r = strip0x(sig.r).padStart(64, '0');
    const s = strip0x(sig.s).padStart(64, '0');
    const recoveryIdRaw = Number(sig.recid ?? sig.recoveryId ?? sig.v ?? 0);
    const v = (recoveryIdRaw >= 27 ? recoveryIdRaw : recoveryIdRaw + 27).toString(16).padStart(2, '0');
    return `0x${r}${s}${v}`;
  }

  if (typeof sig.signature === 'string') {
    const compactSig = strip0x(sig.signature);
    if (compactSig.length === 130) {
      return `0x${compactSig}`;
    }
    if (compactSig.length >= 128) {
      const rPlusS = compactSig.slice(0, 128);
      const recoveryIdRaw = Number(sig.recid ?? sig.recoveryId ?? sig.v ?? 0);
      const v = (recoveryIdRaw >= 27 ? recoveryIdRaw : recoveryIdRaw + 27).toString(16).padStart(2, '0');
      return `0x${rPlusS}${v}`;
    }
  }

  throw new Error('Unrecognized signature format. Keys: ' + Object.keys(sig).join(','));
}

function assertValid65ByteSignatureHex(signature: string): void {
  if (!isHex(signature) || signature.length !== 132) {
    throw new Error(`Invalid ECDSA signature produced by bridge (length=${signature?.length ?? 0})`);
  }
}

function isRecoverableAuthContextError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("can't get auth context") ||
    message.includes('invalidauthsig') ||
    message.includes('auth_sig passed is invalid') ||
    message.includes('session key signing') ||
    message.includes('signature error') ||
    message.includes('session expired') ||
    message.includes('credential public key cbor') ||
    message.includes('failed to decode cbor encoded cose key')
  );
}

function isMissingPersonalSignScopeError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('nodeauthsigscopetoolimited') ||
    (message.includes('required scope [2]') && message.includes('pkp is not authorized')) ||
    message.includes('missing required personal-sign scope')
  );
}

async function refreshWebAuthnAuthData(passkeyContext?: {
  expectedRpId?: string;
  allowNonCanonicalRp?: boolean;
}): Promise<{
  authMethodType: number;
  authMethodId: string;
  accessToken?: string;
}> {
  assertPasskeyRpContext('refreshWebAuthnAuthData', passkeyContext || {});
  const refreshed = await WebAuthnAuthenticator.authenticate();
  return {
    authMethodType: Number((refreshed as any).authMethodType),
    authMethodId: String((refreshed as any).authMethodId),
    accessToken: (refreshed as any).accessToken == null ? undefined : String((refreshed as any).accessToken),
  };
}

function isHandshakeTimeoutError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('could not handshake with nodes') ||
    message.includes('handshake with nodes after timeout')
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function initLit(): Promise<void> {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log('[Lit] Initializing Lit client...');
      let initError: unknown;
      for (let attempt = 1; attempt <= LIT_INIT_MAX_ATTEMPTS; attempt++) {
        try {
          litClient = await createLitClient({
            network: nagaDev,
            connectTimeout: LIT_CONNECT_TIMEOUT_MS,
          } as any);
          initError = undefined;
          break;
        } catch (error) {
          initError = error;
          const isLast = attempt === LIT_INIT_MAX_ATTEMPTS;
          if (!isHandshakeTimeoutError(error) || isLast) {
            throw error;
          }
          const backoffMs = attempt * 1500;
          console.warn(
            `[Lit] Handshake attempt ${attempt}/${LIT_INIT_MAX_ATTEMPTS} failed; retrying in ${backoffMs}ms...`,
            getErrorMessage(error),
          );
          await sleep(backoffMs);
        }
      }
      if (!litClient && initError) {
        throw initError;
      }

      console.log('[Lit] Creating auth manager with localStorage...');
      authManager = createAuthManager({
        storage: storagePlugins.localStorage({
          appName: 'heaven',
          networkName: 'naga-dev',
        }),
      });

      isInitialized = true;
      console.log('[Lit] Initialization complete');
    } catch (error) {
      console.error('[Lit] Initialization failed:', error);
      // Allow future requests to attempt a fresh initialization again.
      initPromise = null;
      isInitialized = false;
      throw error;
    }
  })();

  return initPromise;
}

// ============================================================================
// Cloud content fetch/decrypt helpers
// ============================================================================

const ALGO_AES_GCM_256 = 1;

interface ParsedContentHeader {
  litCiphertext: string;
  litDataToEncryptHash: string;
  algo: number;
  iv: Uint8Array;
  audioLen: number;
  audioOffset: number;
}

function buildContentUrl(
  datasetOwner: string,
  pieceCid: string,
  network: 'calibration' | 'mainnet' = 'mainnet',
  gatewayUrl?: string,
): string {
  const isFilecoinPieceCid =
    pieceCid.startsWith('baga') ||
    pieceCid.startsWith('bafy') ||
    pieceCid.startsWith('Qm');

  if (isFilecoinPieceCid) {
    const host = network === 'mainnet' ? 'filbeam.io' : 'calibration.filbeam.io';
    return `https://${datasetOwner}.${host}/${pieceCid}`;
  }

  const normalizedGateway = String(gatewayUrl || 'https://gateway.s3-node-1.load.network').replace(/\/+$/, '');
  return `${normalizedGateway}/resolve/${pieceCid}`;
}

function parseContentHeader(blob: Uint8Array): ParsedContentHeader {
  if (blob.length < 10) {
    throw new Error(`Blob too small to contain a valid header (${blob.length} bytes)`);
  }

  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  let offset = 0;

  const ctLen = view.getUint32(offset);
  offset += 4;
  if (ctLen === 0 || offset + ctLen > blob.length) {
    throw new Error(`Invalid litCiphertext length: ${ctLen}`);
  }
  const litCiphertext = new TextDecoder().decode(blob.subarray(offset, offset + ctLen));
  offset += ctLen;

  if (offset + 4 > blob.length) throw new Error('Blob truncated before dataToEncryptHash length');
  const hashLen = view.getUint32(offset);
  offset += 4;
  if (hashLen === 0 || offset + hashLen > blob.length) {
    throw new Error(`Invalid dataToEncryptHash length: ${hashLen}`);
  }
  const litDataToEncryptHash = new TextDecoder().decode(blob.subarray(offset, offset + hashLen));
  offset += hashLen;

  if (offset + 2 > blob.length) throw new Error('Blob truncated before algo/ivLen');
  const algo = blob[offset];
  offset += 1;

  const ivLen = blob[offset];
  offset += 1;
  if (ivLen === 0 || offset + ivLen > blob.length) {
    throw new Error(`Invalid IV length: ${ivLen}`);
  }
  const iv = blob.subarray(offset, offset + ivLen);
  offset += ivLen;

  if (offset + 4 > blob.length) throw new Error('Blob truncated before audioLen');
  const audioLen = view.getUint32(offset);
  offset += 4;
  if (audioLen === 0 || offset + audioLen > blob.length) {
    throw new Error(`Invalid audioLen: ${audioLen} (available: ${blob.length - offset})`);
  }

  return { litCiphertext, litDataToEncryptHash, algo, iv, audioLen, audioOffset: offset };
}

async function decryptAesGcmContent(blob: Uint8Array, keyBase64: string): Promise<Uint8Array> {
  const header = parseContentHeader(blob);
  if (header.algo !== ALGO_AES_GCM_256) {
    throw new Error(`Unsupported encryption algorithm: ${header.algo}`);
  }

  const rawKey = new Uint8Array(Buffer.from(keyBase64, 'base64'));
  if (rawKey.length !== 32) {
    throw new Error(`Invalid AES key length: ${rawKey.length}`);
  }

  const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
  rawKey.fill(0);

  const encryptedAudio = blob.subarray(header.audioOffset, header.audioOffset + header.audioLen);
  const ivBuffer = header.iv.buffer.slice(
    header.iv.byteOffset,
    header.iv.byteOffset + header.iv.byteLength,
  ) as ArrayBuffer;
  const encryptedAudioBuffer = encryptedAudio.buffer.slice(
    encryptedAudio.byteOffset,
    encryptedAudio.byteOffset + encryptedAudio.byteLength,
  ) as ArrayBuffer;
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    key,
    encryptedAudioBuffer,
  );
  return new Uint8Array(decrypted);
}

function sniffAudioMime(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return 'audio/mpeg'; // MP3 (ID3)
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg'; // MP3 frame sync
  }
  if (bytes.length >= 4 && bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) {
    return 'audio/flac';
  }
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return 'audio/ogg';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    return 'audio/wav';
  }
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return 'audio/mp4'; // m4a/mp4 container
  }
  return undefined;
}

// ============================================================================
// Bridge protocol handler
// ============================================================================

function reply(msg: BridgeResponse): void {
  const message = stringifyJsonSafe(msg);
  if ((window as any).ReactNativeWebView) {
    (window as any).ReactNativeWebView.postMessage(message);
  } else {
    // Fallback for browser testing
    console.log('[Bridge Reply]', msg);
  }
}

async function handleBridgeMessage(event: MessageEvent): Promise<void> {
  let request: BridgeRequest;

  try {
    request = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
  } catch (e) {
    console.error('[Bridge] Failed to parse request:', e);
    return;
  }

  const { id, op, payload } = request;

  // Handle ping without initialization
  if (op === 'ping') {
    return reply({
      id,
      ok: true,
      result: {
        isSecureContext: window.isSecureContext,
        hasCrypto: !!globalThis.crypto,
        hasSubtle: !!globalThis.crypto?.subtle,
        userAgent: navigator.userAgent,
        timestamp: Date.now()
      }
    });
  }

  try {
    // Only initialize Lit node client for operations that need node connectivity.
    const requiresLitInit = op === 'encrypt' ||
      op === 'decrypt' ||
      op === 'viewPKPsByAuthData' ||
      op === 'createAuthContext' ||
      op === 'signMessage' ||
      op === 'executeLitAction' ||
      op === 'fetchAndDecryptContent';
    if (requiresLitInit) {
      await initLit();
    }

    switch (op) {
      case 'encrypt': {
        if (!litClient) throw new Error('Lit client not initialized');
        const result = await litClient.encrypt(payload);
        return reply({ id, ok: true, result });
      }

      case 'decrypt': {
        if (!litClient) throw new Error('Lit client not initialized');
        const result = await litClient.decrypt(payload);
        return reply({ id, ok: true, result });
      }

      case 'getAuthContext': {
        return reply({ id, ok: true, result: lastAuthContext });
      }

      case 'setAuthContext': {
        lastAuthContext = payload;
        return reply({ id, ok: true, result: { success: true } });
      }

      case 'registerAndMintPKP': {
        console.log('[Lit] Registering WebAuthn credential and minting PKP...');

        const { currentHost, expectedRpId, allowNonCanonicalRp } = assertPasskeyRpContext(
          'registerAndMintPKP',
          payload || {},
        );
        lastPasskeyContext = { expectedRpId, allowNonCanonicalRp };

        const authServiceBaseUrl = payload.authServiceBaseUrl;
        const username = payload.username || 'Heaven';
        const rpName = payload.rpName || 'Heaven';
        const scopes = payload.scopes || ['sign-anything'];

        // Step 1: Get registration options from auth service
        const opts = await WebAuthnAuthenticator.getRegistrationOptions({
          username,
          authServiceBaseUrl,
        });
        const requestedRpId = String(opts?.rp?.id || '').toLowerCase();
        console.log(
          '[Lit] registerAndMintPKP: registration rp.id=' +
          (requestedRpId || '(missing)') +
          ', host=' +
          currentHost,
        );
        if (expectedRpId && requestedRpId && requestedRpId !== expectedRpId) {
          console.warn(
            '[Lit] registerAndMintPKP: auth service returned rp.id=' +
            requestedRpId +
            ' but expectedRpId=' +
            expectedRpId,
          );
        }

        // Step 2: Override rp.name so the passkey dialog shows our app name
        if (opts.rp) {
          (opts.rp as any).name = rpName;
        }

        // Step 3: Prompt user to create passkey
        const { startRegistration } = await import('@simplewebauthn/browser');
        const attResp = await startRegistration(opts);

        // Step 4: Extract public key + compute auth method ID
        const authMethodPubkey = WebAuthnAuthenticator.getPublicKeyFromRegistration(attResp);
        const authMethodId = await WebAuthnAuthenticator.authMethodId({
          authMethodType: 3, // WebAuthn
          accessToken: JSON.stringify(attResp),
        });

        // Step 5: Mint PKP via auth service
        const mintBody = {
          authMethodType: 3,
          authMethodId,
          pubkey: authMethodPubkey,
          scopes,
        };

        const mintRes = await fetch(`${authServiceBaseUrl}/pkp/mint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mintBody),
        });

        if (mintRes.status !== 202) {
          const errBody = await mintRes.text();
          throw new Error(`PKP mint failed: ${mintRes.status} ${errBody}`);
        }

        const { jobId } = await mintRes.json();

        // Step 6: Poll for mint completion
        let pkpData: any = null;
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 3000));
          const statusRes = await fetch(`${authServiceBaseUrl}/status/${jobId}`);
          const status = await statusRes.json();
          if (status.state === 'completed' && status.returnValue) {
            pkpData = status.returnValue.data;
            break;
          }
          if (status.state === 'failed' || status.state === 'error') {
            throw new Error(`PKP mint job failed: ${JSON.stringify(status)}`);
          }
        }

        if (!pkpData) throw new Error('PKP mint timed out');

        console.log('[Lit] PKP minted:', pkpData);

        // Step 7: Authenticate with the newly created passkey to get a valid accessToken.
        // Registration attestation ≠ authentication assertion — the Lit SDK needs
        // an assertion response (from authenticate()) to create auth contexts.
        console.log('[Lit] Authenticating with new passkey...');
        const postMintAuth = await WebAuthnAuthenticator.authenticate();
        console.log('[Lit] Post-mint authentication successful');

        return reply({ id, ok: true, result: {
          pkpInfo: pkpData,
          webAuthnPublicKey: authMethodPubkey,
          authData: {
            authMethodType: postMintAuth.authMethodType,
            authMethodId: postMintAuth.authMethodId,
            accessToken: postMintAuth.accessToken,
          }
        }});
      }

      case 'authenticate': {
        console.log('[Lit] Authenticating with existing WebAuthn credential...');
        const { expectedRpId, allowNonCanonicalRp } = assertPasskeyRpContext(
          'authenticate',
          payload || {},
        );
        lastPasskeyContext = { expectedRpId, allowNonCanonicalRp };
        const authData = await WebAuthnAuthenticator.authenticate();
        console.log('[Lit] Authentication successful');
        return reply({ id, ok: true, result: authData });
      }

      case 'viewPKPsByAuthData': {
        if (!litClient) throw new Error('Lit client not initialized');
        console.log('[Lit] Viewing PKPs by auth data...');
        const result = await litClient.viewPKPsByAuthData({
          authData: payload.authData,
          pagination: payload.pagination || { limit: 5, offset: 0 }
        });
        console.log('[Lit] Found PKPs:', result);
        return reply({ id, ok: true, result });
      }

      case 'createAuthContext': {
        if (!authManager || !litClient) throw new Error('Lit/Auth manager not initialized');
        console.log('[Lit] Creating auth context...');
        const normalizedPkpPublicKey = ensurePkpPublicKeyPrefix(payload.pkpPublicKey);
        const disableWebViewReauth = payload?.disableWebViewReauth === true;
        const normalizedAuthConfig = normalizeAuthConfigDomain(payload?.authConfig);
        const authConfigForRequest = normalizedAuthConfig.authConfig;
        console.log('[Lit] createAuthContext webview origin=', window.location.origin);
        console.log('[Lit] createAuthContext domain=', normalizedAuthConfig.domainRaw || '(missing)');
        if (normalizedAuthConfig.domainResolved) {
          console.log('[Lit] createAuthContext domain origin=', normalizedAuthConfig.domainResolved);
          console.log('[Lit] createAuthContext domain hostname=', normalizedAuthConfig.domainHostname);
        } else if (normalizedAuthConfig.domainParseError) {
          console.warn('[Lit] createAuthContext domain parse failed:', normalizedAuthConfig.domainParseError);
        }

        // Store the original parameters for future re-authentication
        lastAuthParams = {
          authData: payload.authData,
          pkpPublicKey: normalizedPkpPublicKey,
          authConfig: authConfigForRequest,
        };
        let effectiveAuthData = payload.authData;
        let refreshedAuthData: any | undefined;

        const createWithAuthData = async (authData: any) => {
          return authManager!.createPkpAuthContext({
            authData,
            pkpPublicKey: normalizedPkpPublicKey,
            authConfig: authConfigForRequest,
            litClient: litClient!,
          });
        };

        let authContext: any;
        try {
          authContext = await createWithAuthData(effectiveAuthData);
        } catch (error) {
          if (isMissingPersonalSignScopeError(error)) {
            throw error;
          }
          if (!isRecoverableAuthContextError(error)) {
            throw error;
          }
          if (disableWebViewReauth) {
            console.warn(
              '[Lit] createAuthContext recoverable failure; skipping WebView re-authentication because browser auth flow is enabled.',
            );
            throw error;
          }

          console.warn('[Lit] createAuthContext failed with stale auth data; re-authenticating WebAuthn and retrying...');
          refreshedAuthData = await refreshWebAuthnAuthData(lastPasskeyContext || undefined);
          effectiveAuthData = refreshedAuthData;
          if (lastAuthParams) {
            lastAuthParams.authData = effectiveAuthData;
          }
          authContext = await createWithAuthData(effectiveAuthData);
        }

        // Do NOT override authNeededCallback — the SDK's default from
        // createPkpAuthContext knows how to generate session sigs lazily.
        // Just wrap it with logging (do NOT replace lastAuthContext with the
        // callback's return value — it returns an AuthSig, not a full context).
        const sdkCallback = authContext.authNeededCallback;
        if (sdkCallback) {
          const wrappedCallback = async (...args: any[]) => {
            console.log('[Lit] SDK authNeededCallback triggered (generating session sigs)...');
            const result = await sdkCallback(...args);
            console.log('[Lit] SDK authNeededCallback returned:', typeof result);
            return result;
          };
          authContext.authNeededCallback = wrappedCallback;
        }

        lastAuthContext = authContext;
        console.log('[Lit] Auth context created, keys:', Object.keys(authContext).join(','));
        console.log('[Lit] Auth context hasSessionSigs:', !!authContext.sessionSigs, ', hasAuthNeededCallback:', !!authContext.authNeededCallback);
        // Don't send authContext back (contains non-serializable functions)
        // Just confirm success - WebView will use lastAuthContext for future operations
        return reply({ id, ok: true, result: { success: true, refreshedAuthData } });
      }

      case 'signMessage': {
        if (!litClient || !authManager) throw new Error('Lit client not initialized');
        // Lit Action signing APIs expect bare hex (no 0x prefix)
        const normalizedPublicKey = stripPkpPublicKeyPrefix(payload.publicKey);
        console.log('[Lit] signMessage: publicKey=' + normalizedPublicKey.slice(0, 12) + '..., message=' + String(payload.message).slice(0, 40));
        console.log('[Lit] signMessage: lastAuthContext exists=' + !!lastAuthContext + ', hasSessionSigs=' + !!lastAuthContext?.sessionSigs);

        // Always use the stored lastAuthContext — payload.authContext is typically
        // just { success: true } from the native side (auth context lives in WebView)
        let authContext = lastAuthContext;
        if (!authContext) throw new Error('No auth context available. Call createAuthContext first.');

        // Build an EIP-191 digest client-side and sign that digest with signEcdsa.
        // This avoids malformed personal-sign responses observed in some SDK/runtime combos.
        const ethSignedHash = hashMessage(String(payload.message));
        const toSign = Array.from(toBytes(ethSignedHash));

        const litActionCode = `(async () => {
          const digest = new Uint8Array(jsParams.toSign);
          console.log('[LitAction] signEcdsa publicKey=' + jsParams.publicKey.slice(0, 12) + '..., digestBytes=' + digest.length);
          await Lit.Actions.signEcdsa({
            toSign: digest,
            publicKey: jsParams.publicKey,
            sigName: "sig",
          });
        })();`;

        console.log('[Lit] signMessage: calling executeJs...');
        const signResult = await litClient.executeJs({
          code: litActionCode,
          authContext,
          jsParams: {
            toSign,
            publicKey: normalizedPublicKey,
          },
        });
        console.log('[Lit] signMessage: executeJs returned, signatures keys:', Object.keys(signResult.signatures || {}));

        const sig = signResult.signatures?.sig;
        if (!sig) throw new Error('No signature returned. signResult keys: ' + Object.keys(signResult || {}));

        console.log('[Lit] signMessage: sig object keys:', Object.keys(sig).join(','));

        const signature = toEcdsa65ByteSignature(sig);
        assertValid65ByteSignatureHex(signature);
        console.log('[Lit] signMessage: assembled signature length:', signature.length);

        console.log('[Lit] Message signed');
        return reply({ id, ok: true, result: { signature } });
      }

      case 'executeLitAction': {
        if (!litClient || !authManager) throw new Error('Lit client not initialized');
        const actionId = payload.ipfsId || '(inline code)';
        console.log('[Lit] executeLitAction:', actionId);
        console.log('[Lit] executeLitAction: lastAuthContext exists=' + !!lastAuthContext);

        // Always use stored lastAuthContext — payload.authContext is just { success: true }
        let authContext = lastAuthContext;
        if (!authContext) throw new Error('No auth context available');

        // If authNeededCallback is missing (shouldn't happen now), re-create
        // the auth context from stored params so the SDK can generate session sigs.
        if (!authContext.authNeededCallback) {
          console.warn('[Lit] executeLitAction: authContext missing authNeededCallback — re-creating from stored params');
          if (lastAuthParams) {
            authContext = await authManager!.createPkpAuthContext({
              authData: lastAuthParams.authData,
              pkpPublicKey: lastAuthParams.pkpPublicKey,
              authConfig: lastAuthParams.authConfig,
              litClient: litClient!,
            });
            lastAuthContext = authContext;
          } else {
            console.error('[Lit] executeLitAction: no stored auth params to re-create context');
          }
        }

        const normalizedJsParams = normalizeExecuteJsParams(payload.jsParams);
        console.log('[Lit] executeLitAction: jsParams keys=' + Object.keys(normalizedJsParams).join(','));
        if (normalizedJsParams.publicKey) {
          console.log('[Lit] executeLitAction: publicKey=' + String(normalizedJsParams.publicKey).slice(0, 12) + '...');
        }
        if (normalizedJsParams.userPkpPublicKey) {
          console.log('[Lit] executeLitAction: userPkpPublicKey=' + String(normalizedJsParams.userPkpPublicKey).slice(0, 12) + '...');
        }

        const execParams: any = {
          authContext,
          jsParams: normalizedJsParams,
        };

        if (payload.ipfsId) {
          execParams.ipfsId = payload.ipfsId;
        } else if (payload.code) {
          execParams.code = payload.code;
        } else {
          throw new Error('Either ipfsId or code is required');
        }

        console.log('[Lit] executeLitAction: calling litClient.executeJs...');
        try {
          const execResult = await litClient.executeJs(execParams);
          const responseLength = typeof execResult.response === 'string'
            ? execResult.response.length
            : JSON.stringify(execResult.response ?? '').length;
          console.log('[Lit] executeLitAction: success, response length=' + responseLength);
          return reply({ id, ok: true, result: execResult });
        } catch (execErr: any) {
          console.error('[Lit] executeLitAction: executeJs threw:', execErr?.message || execErr);
          console.error('[Lit] executeLitAction: error stack:', execErr?.stack?.slice(0, 500));
          throw execErr;
        }
      }

      case 'fetchAndDecryptContent': {
        if (!litClient || !authManager) throw new Error('Lit client not initialized');

        const datasetOwner = String(payload?.datasetOwner || '');
        const pieceCid = String(payload?.pieceCid || '');
        const contentId = String(payload?.contentId || '').toLowerCase();
        const requestedAlgo = Number(payload?.algo ?? ALGO_AES_GCM_256);
        const network = payload?.network === 'calibration' ? 'calibration' : 'mainnet';
        const contentDecryptCid = String(payload?.contentDecryptCid || '');
        const userPkpPublicKey = stripPkpPublicKeyPrefix(payload?.userPkpPublicKey || '');
        const isFilecoinPieceCid =
          pieceCid.startsWith('baga') ||
          pieceCid.startsWith('bafy') ||
          pieceCid.startsWith('Qm');

        if (!pieceCid) throw new Error('Missing pieceCid');
        if (isFilecoinPieceCid && !datasetOwner) throw new Error('Missing datasetOwner for Filecoin piece CID');
        if (!userPkpPublicKey) throw new Error('Missing userPkpPublicKey');
        if (!contentId || !/^0x[0-9a-fA-F]{64}$/.test(contentId)) {
          throw new Error(`Invalid contentId: "${contentId}"`);
        }

        const sourceUrl = buildContentUrl(datasetOwner, pieceCid, network, payload?.gatewayUrl);
        console.log('[Lit] fetchAndDecryptContent: fetching', sourceUrl);
        const response = await fetch(sourceUrl);
        if (!response.ok) {
          throw new Error(`Cloud fetch failed: ${response.status} ${response.statusText}`);
        }
        const blob = new Uint8Array(await response.arrayBuffer());
        console.log('[Lit] fetchAndDecryptContent: fetched bytes=' + blob.length + ', algo=' + requestedAlgo);

        // Plaintext mode (algo=0) skips Lit key decryption.
        if (requestedAlgo === 0) {
          const mimeType = sniffAudioMime(blob);
          const audioBase64 = Buffer.from(blob).toString('base64');
          return reply({
            id,
            ok: true,
            result: {
              audioBase64,
              bytes: blob.length,
              mimeType,
              sourceUrl,
            },
          });
        }

        if (!contentDecryptCid) {
          throw new Error('Missing contentDecryptCid');
        }

        let authContext = lastAuthContext;
        if (!authContext) {
          throw new Error('No auth context available. Call createAuthContext first.');
        }

        // Re-create stale auth context if callback is missing.
        if (!authContext.authNeededCallback) {
          if (lastAuthParams) {
            authContext = await authManager.createPkpAuthContext({
              authData: lastAuthParams.authData,
              pkpPublicKey: lastAuthParams.pkpPublicKey,
              authConfig: lastAuthParams.authConfig,
              litClient,
            });
            lastAuthContext = authContext;
          } else {
            throw new Error('Auth context missing callback and no stored auth params to recover');
          }
        }

        const header = parseContentHeader(blob);
        if (header.algo !== ALGO_AES_GCM_256) {
          throw new Error(`Unsupported encrypted content algorithm: ${header.algo}`);
        }

        const timestamp = Date.now();
        const nonce = crypto.randomUUID();
        const decryptResult = await litClient.executeJs({
          ipfsId: contentDecryptCid,
          authContext,
          jsParams: {
            userPkpPublicKey,
            contentId,
            ciphertext: header.litCiphertext,
            dataToEncryptHash: header.litDataToEncryptHash,
            decryptCid: contentDecryptCid,
            timestamp,
            nonce,
          },
        });

        const decryptResponse = typeof decryptResult.response === 'string'
          ? JSON.parse(decryptResult.response)
          : decryptResult.response;
        if (!decryptResponse?.success) {
          throw new Error(`Content decrypt failed: ${decryptResponse?.error || 'unknown error'}`);
        }

        let decryptedPayload: { key?: string; contentId?: string };
        try {
          decryptedPayload = JSON.parse(String(decryptResponse.decryptedPayload || '{}'));
        } catch {
          throw new Error('Decrypted payload is not valid JSON');
        }

        if (!decryptedPayload.key) {
          throw new Error('Decrypted payload missing AES key');
        }
        if (
          decryptedPayload.contentId &&
          String(decryptedPayload.contentId).toLowerCase() !== contentId
        ) {
          throw new Error(
            `Content ID mismatch: payload=${decryptedPayload.contentId}, requested=${contentId}`,
          );
        }

        const audioBytes = await decryptAesGcmContent(blob, decryptedPayload.key);
        const mimeType = sniffAudioMime(audioBytes);
        const audioBase64 = Buffer.from(audioBytes).toString('base64');
        console.log(
          '[Lit] fetchAndDecryptContent: decrypted bytes=' +
          audioBytes.length +
          ', mime=' +
          (mimeType || 'unknown'),
        );

        return reply({
          id,
          ok: true,
          result: {
            audioBase64,
            bytes: audioBytes.length,
            mimeType,
            sourceUrl,
          },
        });
      }

      default:
        return reply({ id, ok: false, error: `Unknown operation: ${op}` });
    }
  } catch (error: any) {
    console.error(`[Bridge] Operation ${op} failed:`, error);
    return reply({
      id,
      ok: false,
      error: error?.message || String(error)
    });
  }
}

// ============================================================================
// Startup checks and initialization
// ============================================================================

function checkEnvironment(): void {
  console.log('[Lit] Environment check:');
  console.log('  isSecureContext:', window.isSecureContext);
  console.log('  origin:', window.location.origin);
  console.log('  hostname:', window.location.hostname);
  console.log('  crypto:', !!globalThis.crypto);
  console.log('  crypto.subtle:', !!globalThis.crypto?.subtle);
  console.log('  userAgent:', navigator.userAgent);

  if (!window.isSecureContext || !globalThis.crypto?.subtle) {
    const error = new Error(
      'WebCrypto unavailable: need a secure context + crypto.subtle. ' +
      `isSecureContext=${window.isSecureContext}, ` +
      `crypto.subtle=${!!globalThis.crypto?.subtle}`
    );
    console.error(error);

    // Report error to native
    if ((window as any).ReactNativeWebView) {
      (window as any).ReactNativeWebView.postMessage(stringifyJsonSafe({
        type: 'error',
        error: error.message
      }));
    }
    throw error;
  }
}

// ============================================================================
// Entry point
// ============================================================================

try {
  checkEnvironment();
  addMessageListener(handleBridgeMessage);
  console.log('[Lit] Bridge ready, waiting for messages...');

  // Signal ready to native
  if ((window as any).ReactNativeWebView) {
    (window as any).ReactNativeWebView.postMessage(stringifyJsonSafe({
      type: 'ready',
      timestamp: Date.now()
    }));
  }
} catch (error) {
  console.error('[Lit] Failed to start:', error);
}
