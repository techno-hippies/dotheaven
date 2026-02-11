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

async function refreshWebAuthnAuthData(): Promise<{
  authMethodType: number;
  authMethodId: string;
  accessToken?: string;
}> {
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
      op === 'executeLitAction';
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

        const authServiceBaseUrl = payload.authServiceBaseUrl;
        const username = payload.username || 'Heaven';
        const rpName = payload.rpName || 'Heaven';
        const scopes = payload.scopes || ['sign-anything'];

        // Step 1: Get registration options from auth service
        const opts = await WebAuthnAuthenticator.getRegistrationOptions({
          username,
          authServiceBaseUrl,
        });

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

        // Store the original parameters for future re-authentication
        lastAuthParams = {
          authData: payload.authData,
          pkpPublicKey: normalizedPkpPublicKey,
          authConfig: payload.authConfig,
        };
        let effectiveAuthData = payload.authData;
        let refreshedAuthData: any | undefined;

        const createWithAuthData = async (authData: any) => {
          return authManager!.createPkpAuthContext({
            authData,
            pkpPublicKey: normalizedPkpPublicKey,
            authConfig: payload.authConfig,
            litClient: litClient!,
          });
        };

        let authContext: any;
        try {
          authContext = await createWithAuthData(effectiveAuthData);
        } catch (error) {
          if (!isRecoverableAuthContextError(error)) {
            throw error;
          }

          console.warn('[Lit] createAuthContext failed with stale auth data; re-authenticating WebAuthn and retrying...');
          refreshedAuthData = await refreshWebAuthnAuthData();
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
