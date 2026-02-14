import { AUTH_CONFIG } from '../lib/auth-config';
import type { FetchAndDecryptContentParams, FetchAndDecryptContentResult } from './LitBridge';
import type { LitBridgeApi } from './LitBridgeApi';
import {
  litRustClearAuthContext,
  litRustCreateAuthContextFromPasskeyCallback,
  litRustExecuteJs,
  litRustFetchAndDecryptContent,
  litRustHealthcheck,
  litRustSignMessage,
  litRustTestConnect,
  litRustViewPKPsByAuthData,
} from './LitRustNative';
import {
  authenticateWithNativePasskey,
  registerAndMintPKPWithNativePasskey,
} from './native-passkey-auth';

function toJsonSafeValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
  }
  return value;
}

function jsonStringifySafe(value: unknown): string {
  return JSON.stringify(value, (_key, v) => toJsonSafeValue(v));
}

function strip0x(hex: string): string {
  return hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timeout: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(`Request timeout: ${label}`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Native (no WebView) Lit bridge backed by `lit-rust-sdk`.
 *
 * AuthContext (session key pair) is cached inside Rust to avoid exposing the
 * secret key over the JS bridge.
 */
export class LitRustBridge implements LitBridgeApi {
  private readonly network: string;
  private readonly rpcUrl: string;
  private readonly initPromise: Promise<void>;

  constructor(opts?: { network?: string; rpcUrl?: string }) {
    this.network = opts?.network || AUTH_CONFIG.litNetwork;
    this.rpcUrl = opts?.rpcUrl || AUTH_CONFIG.litRpcUrl;
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    await litRustHealthcheck();
    // Warm the handshake so first auth-context creation is faster.
    await litRustTestConnect(this.network, this.rpcUrl);
  }

  async waitForReady(timeoutMs: number = 10000): Promise<void> {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Rust bridge ready timeout')), timeoutMs),
    );
    await Promise.race([this.initPromise, timeout]);
  }

  async sendRequest<T = any>(op: string, payload?: any, timeoutMs: number = 30000): Promise<T> {
    await this.waitForReady();

    const run = async (): Promise<any> => {
      switch (op) {
        case 'ping': {
          const result = await litRustTestConnect(this.network, this.rpcUrl);
          return {
            isSecureContext: true,
            hasCrypto: true,
            hasSubtle: true,
            userAgent: 'native-rust',
            timestamp: Date.now(),
            lit: result,
          };
        }

        case 'registerAndMintPKP': {
          const authServiceBaseUrl = String(payload?.authServiceBaseUrl || AUTH_CONFIG.authServiceBaseUrl);
          const expectedRpId = String(payload?.expectedRpId || AUTH_CONFIG.passkeyRpId);
          const scopes = Array.isArray(payload?.scopes) ? payload.scopes : undefined;
          const username = payload?.username == null ? undefined : String(payload.username);
          const rpName = payload?.rpName == null ? undefined : String(payload.rpName);

          return registerAndMintPKPWithNativePasskey({
            network: this.network,
            rpcUrl: this.rpcUrl,
            authServiceBaseUrl,
            expectedRpId,
            scopes,
            username,
            rpName,
          });
        }

        case 'authenticate': {
          const expectedRpId = String(payload?.expectedRpId || AUTH_CONFIG.passkeyRpId);
          return authenticateWithNativePasskey({ expectedRpId });
        }

        case 'viewPKPsByAuthData': {
          const authData = payload?.authData || {};
          const authMethodType = Number(authData.authMethodType);
          const authMethodId = String(authData.authMethodId || '');
          const pagination = payload?.pagination || {};
          const limit = Number(pagination.limit ?? 5);
          const offset = Number(pagination.offset ?? 0);

          return litRustViewPKPsByAuthData(
            this.network,
            this.rpcUrl,
            authMethodType,
            authMethodId,
            limit,
            offset,
          );
        }

        case 'createAuthContext': {
          const authData = payload?.authData || {};
          const pkpPublicKey = String(payload?.pkpPublicKey || '');
          const authMethodType = Number(authData.authMethodType);
          const authMethodId = String(authData.authMethodId || '');
          const accessToken = String(authData.accessToken || '');
          if (!accessToken) {
            throw new Error('accessToken cannot be empty');
          }

          const authConfigJson = jsonStringifySafe(payload?.authConfig || {});
          const ctx = await litRustCreateAuthContextFromPasskeyCallback(
            this.network,
            this.rpcUrl,
            pkpPublicKey,
            authMethodType,
            authMethodId,
            accessToken,
            authConfigJson,
          );

          return { success: true, context: ctx };
        }

        case 'executeLitAction': {
          const code = payload?.code == null ? '' : String(payload.code);
          const ipfsId = payload?.ipfsId == null ? '' : String(payload.ipfsId);
          const rawJsParams = payload?.jsParams;
          const normalizedJsParams =
            rawJsParams && typeof rawJsParams === 'object'
              ? { ...(rawJsParams as Record<string, unknown>) }
              : null;
          // Lit Action signing APIs expect bare hex (no 0x prefix), matching the WebView bridge.
          if (normalizedJsParams && typeof normalizedJsParams.publicKey === 'string') {
            normalizedJsParams.publicKey = strip0x(normalizedJsParams.publicKey);
          }
          if (normalizedJsParams && typeof normalizedJsParams.userPkpPublicKey === 'string') {
            normalizedJsParams.userPkpPublicKey = strip0x(normalizedJsParams.userPkpPublicKey);
          }
          const jsParamsJson = normalizedJsParams ? jsonStringifySafe(normalizedJsParams) : '';
          const useSingleNode = payload?.useSingleNode === true;

          return litRustExecuteJs(
            this.network,
            this.rpcUrl,
            code,
            ipfsId,
            jsParamsJson,
            useSingleNode,
          );
        }

        case 'signMessage': {
          const message = payload?.message == null ? '' : String(payload.message);
          const publicKey = payload?.publicKey == null ? '' : String(payload.publicKey);
          return litRustSignMessage(this.network, this.rpcUrl, message, publicKey);
        }

        case 'setAuthContext': {
          // WebView bridge uses this for logout (`setAuthContext(null)`).
          if (payload == null) {
            await litRustClearAuthContext();
            return { success: true };
          }
          throw new Error('setAuthContext is not supported for LitRustBridge');
        }

        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    };

    return withTimeout(run(), timeoutMs, op) as Promise<T>;
  }

  async fetchAndDecryptContent(
    params: FetchAndDecryptContentParams,
  ): Promise<FetchAndDecryptContentResult> {
    await this.waitForReady();
    const paramsJson = jsonStringifySafe(params);
    return litRustFetchAndDecryptContent(this.network, this.rpcUrl, paramsJson);
  }

  destroy(): void {
    void litRustClearAuthContext().catch(() => {
      // ignore cleanup errors
    });
  }
}
