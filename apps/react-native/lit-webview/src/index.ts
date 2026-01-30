import { createLitClient } from '@lit-protocol/lit-client';
import { nagaDev } from '@lit-protocol/networks';
import { createAuthManager, type AuthManager, WebAuthnAuthenticator } from '@lit-protocol/auth';
import type { LitClient } from '@lit-protocol/lit-client';
import { Buffer } from 'buffer';

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
      (window as any).ReactNativeWebView.postMessage(JSON.stringify(message));
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
let authManager: AuthManager | null = null;
let isInitialized = false;
let initPromise: Promise<void> | null = null;

async function initLit(): Promise<void> {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log('[Lit] Initializing Lit client...');
      litClient = await createLitClient({ network: nagaDev });

      console.log('[Lit] Creating auth manager with native storage...');
      const storage = new NativeStoragePlugin();
      authManager = createAuthManager({
        storage: {
          async getItem(key: string) {
            return storage.getItem(key);
          },
          async setItem(key: string, value: string) {
            await storage.setItem(key, value);
          },
          async removeItem(key: string) {
            await storage.removeItem(key);
          }
        } as any,
      });

      isInitialized = true;
      console.log('[Lit] Initialization complete');
    } catch (error) {
      console.error('[Lit] Initialization failed:', error);
      throw error;
    }
  })();

  return initPromise;
}

// ============================================================================
// Bridge protocol handler
// ============================================================================

function reply(msg: BridgeResponse): void {
  const message = JSON.stringify(msg);
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
    // Initialize Lit for all other operations
    await initLit();

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
        if (!authManager) throw new Error('Auth manager not initialized');
        const result = await authManager.getAuthContext();
        return reply({ id, ok: true, result });
      }

      case 'setAuthContext': {
        if (!authManager) throw new Error('Auth manager not initialized');
        await authManager.setAuthContext(payload);
        return reply({ id, ok: true, result: { success: true } });
      }

      case 'registerAndMintPKP': {
        if (!litClient) throw new Error('Lit client not initialized');
        console.log('[Lit] Registering WebAuthn credential and minting PKP...');
        const result = await WebAuthnAuthenticator.registerAndMintPKP({
          authServiceBaseUrl: payload.authServiceBaseUrl,
          scopes: payload.scopes || ['sign-anything'],
        });
        console.log('[Lit] PKP minted:', result.pkpInfo);
        return reply({ id, ok: true, result: {
          pkpInfo: result.pkpInfo,
          webAuthnPublicKey: result.webAuthnPublicKey,
          authData: {
            authMethodType: 8, // WebAuthn
            authMethodId: result.webAuthnPublicKey
          }
        }});
      }

      case 'authenticate': {
        console.log('[Lit] Authenticating with existing WebAuthn credential...');
        const authData = await WebAuthnAuthenticator.authenticate({
          authServiceBaseUrl: payload.authServiceBaseUrl,
        });
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
        const authContext = await authManager.createPkpAuthContext({
          authData: payload.authData,
          pkpPublicKey: payload.pkpPublicKey,
          authConfig: payload.authConfig,
          litClient: litClient,
        });
        console.log('[Lit] Auth context created');
        return reply({ id, ok: true, result: { success: true, authContext } });
      }

      case 'signMessage': {
        if (!litClient || !authManager) throw new Error('Lit client not initialized');
        console.log('[Lit] Signing message with PKP...');

        // Get or create auth context
        let authContext = payload.authContext;
        if (!authContext) {
          authContext = await authManager.getAuthContext();
        }
        if (!authContext) throw new Error('No auth context available. Call createAuthContext first.');

        const litActionCode = `(async () => {
          const sigShare = await Lit.Actions.ethPersonalSignMessageEcdsa({
            message: jsParams.message,
            publicKey: jsParams.publicKey,
            sigName: "sig",
          });
        })();`;

        const signResult = await litClient.executeJs({
          code: litActionCode,
          authContext,
          jsParams: {
            message: payload.message,
            publicKey: payload.publicKey,
          },
        });

        const sig = signResult.signatures?.sig;
        if (!sig) throw new Error('No signature returned');

        const r = sig.r.startsWith('0x') ? sig.r.slice(2) : sig.r;
        const s = sig.s.startsWith('0x') ? sig.s.slice(2) : sig.s;
        const v = ((sig.recid ?? sig.recoveryId ?? 0) + 27).toString(16).padStart(2, '0');
        const signature = `0x${r}${s}${v}`;

        console.log('[Lit] Message signed');
        return reply({ id, ok: true, result: { signature } });
      }

      case 'executeLitAction': {
        if (!litClient || !authManager) throw new Error('Lit client not initialized');
        console.log('[Lit] Executing Lit Action:', payload.ipfsId || '(inline)');

        let authContext = payload.authContext;
        if (!authContext) {
          authContext = await authManager.getAuthContext();
        }
        if (!authContext) throw new Error('No auth context available');

        const execParams: any = {
          authContext,
          jsParams: payload.jsParams || {},
        };

        if (payload.ipfsId) {
          execParams.ipfsId = payload.ipfsId;
        } else if (payload.code) {
          execParams.code = payload.code;
        } else {
          throw new Error('Either ipfsId or code is required');
        }

        const execResult = await litClient.executeJs(execParams);
        console.log('[Lit] Lit Action executed');
        return reply({ id, ok: true, result: execResult });
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
      (window as any).ReactNativeWebView.postMessage(JSON.stringify({
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
    (window as any).ReactNativeWebView.postMessage(JSON.stringify({
      type: 'ready',
      timestamp: Date.now()
    }));
  }
} catch (error) {
  console.error('[Lit] Failed to start:', error);
}
