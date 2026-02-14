import type {
  FetchAndDecryptContentParams,
  FetchAndDecryptContentResult,
} from './LitBridge';

/**
 * Shared bridge interface implemented by both:
 * - WebView LitBridge (browser SDK running in headless WebView)
 * - LitRustBridge (native Rust Lit SDK)
 */
export interface LitBridgeApi {
  waitForReady(timeoutMs?: number): Promise<void>;
  sendRequest<T = any>(op: string, payload?: any, timeoutMs?: number): Promise<T>;
  fetchAndDecryptContent(
    params: FetchAndDecryptContentParams,
  ): Promise<FetchAndDecryptContentResult>;
  destroy(): void;
}

