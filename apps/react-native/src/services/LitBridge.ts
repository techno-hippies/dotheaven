/**
 * LitBridge - React Native bridge to Lit Protocol WebView engine
 *
 * Manages communication between React Native and the embedded WebView
 * running Lit Protocol browser packages.
 */

import type { WebView } from 'react-native-webview';

export interface BridgeRequest {
  id: string;
  op: string;
  payload?: any;
}

export interface BridgeResponse {
  id: string;
  ok: boolean;
  result?: any;
  error?: string;
}

export interface StorageRequest {
  type: 'storageGet' | 'storageSet' | 'storageRemove';
  id: string;
  key: string;
  value?: string;
}

export interface LitEncryptParams {
  dataToEncrypt: string | Uint8Array;
  accessControlConditions?: any[];
  evmContractConditions?: any[];
  solRpcConditions?: any[];
  unifiedAccessControlConditions?: any[];
}

export interface LitDecryptParams {
  ciphertext: string;
  dataToEncryptHash: string;
  accessControlConditions?: any[];
  evmContractConditions?: any[];
  solRpcConditions?: any[];
  unifiedAccessControlConditions?: any[];
  authContext: any;
}

/**
 * Storage provider interface for native secure storage
 */
export interface SecureStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * LitBridge manages the WebView bridge and request/response flow
 */
export class LitBridge {
  private webViewRef: WebView | null = null;
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private requestCounter = 0;
  private isReady = false;
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private storage: SecureStorage;

  constructor(storage: SecureStorage) {
    this.storage = storage;
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  /**
   * Set the WebView reference (call this from the WebView component)
   */
  setWebView(webView: WebView | null): void {
    this.webViewRef = webView;
  }

  /**
   * Wait for the WebView engine to be ready
   */
  async waitForReady(timeoutMs: number = 10000): Promise<void> {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('WebView ready timeout')), timeoutMs)
    );
    await Promise.race([this.readyPromise, timeout]);
  }

  /**
   * Handle messages received from the WebView
   */
  handleMessage(event: any): void {
    try {
      const data = typeof event.nativeEvent.data === 'string'
        ? JSON.parse(event.nativeEvent.data)
        : event.nativeEvent.data;

      console.log('[LitBridge] Received:', data.type || data.op, data);

      // Handle special message types
      if (data.type === 'ready') {
        this.isReady = true;
        this.readyResolve();
        console.log('[LitBridge] WebView engine ready');
        return;
      }

      if (data.type === 'error') {
        console.error('[LitBridge] WebView error:', data.error);
        return;
      }

      // Handle storage requests from WebView
      if (data.type?.startsWith('storage')) {
        this.handleStorageRequest(data);
        return;
      }

      // Handle operation responses
      const pending = this.pendingRequests.get(data.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(data.id);

        if (data.ok) {
          pending.resolve(data.result);
        } else {
          pending.reject(new Error(data.error || 'Operation failed'));
        }
      }
    } catch (error) {
      console.error('[LitBridge] Failed to handle message:', error);
    }
  }

  /**
   * Handle storage requests from WebView (proxy to native secure storage)
   */
  private async handleStorageRequest(request: StorageRequest): Promise<void> {
    try {
      let value: string | null = null;

      switch (request.type) {
        case 'storageGet':
          value = await this.storage.getItem(request.key);
          break;
        case 'storageSet':
          if (request.value !== undefined) {
            await this.storage.setItem(request.key, request.value);
          }
          break;
        case 'storageRemove':
          await this.storage.removeItem(request.key);
          break;
      }

      this.postToWebView({
        type: 'storageResponse',
        id: request.id,
        ok: true,
        value
      });
    } catch (error: any) {
      this.postToWebView({
        type: 'storageResponse',
        id: request.id,
        ok: false,
        error: error?.message || 'Storage operation failed'
      });
    }
  }

  /**
   * Send a request to the WebView and wait for response
   * Made public for generic operations like WebAuthn
   */
  async sendRequest<T = any>(op: string, payload?: any, timeoutMs: number = 30000): Promise<T> {
    if (!this.webViewRef) {
      throw new Error('WebView not initialized');
    }

    if (!this.isReady && op !== 'ping') {
      await this.waitForReady();
    }

    const id = `req-${++this.requestCounter}-${Date.now()}`;
    const request: BridgeRequest = { id, op, payload };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${op}`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.postToWebView(request);
    });
  }

  /**
   * Post a message to the WebView
   */
  private postToWebView(message: any): void {
    if (this.webViewRef) {
      this.webViewRef.postMessage(JSON.stringify(message));
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Ping the WebView to check environment
   */
  async ping(): Promise<{
    isSecureContext: boolean;
    hasCrypto: boolean;
    hasSubtle: boolean;
    userAgent: string;
    timestamp: number;
  }> {
    return this.sendRequest('ping');
  }

  /**
   * Encrypt data using Lit Protocol
   */
  async encrypt(params: LitEncryptParams): Promise<{
    ciphertext: string;
    dataToEncryptHash: string;
  }> {
    return this.sendRequest('encrypt', params, 60000);
  }

  /**
   * Decrypt data using Lit Protocol
   */
  async decrypt(params: LitDecryptParams): Promise<{
    decryptedData: string | Uint8Array;
  }> {
    return this.sendRequest('decrypt', params, 60000);
  }

  /**
   * Get the current auth context
   */
  async getAuthContext(): Promise<any> {
    return this.sendRequest('getAuthContext');
  }

  /**
   * Set the auth context (from wallet signature)
   */
  async setAuthContext(authContext: any): Promise<void> {
    await this.sendRequest('setAuthContext', authContext);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Clear all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Bridge destroyed'));
    }
    this.pendingRequests.clear();
    this.webViewRef = null;
    this.isReady = false;
  }
}
