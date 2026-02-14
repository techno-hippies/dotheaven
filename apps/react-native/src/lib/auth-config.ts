import { Platform } from 'react-native';

const DEFAULT_AUTH_SERVICE_BASE_URL = 'https://naga-dev-auth-service.getlit.dev';
const DEFAULT_PASSKEY_RP_ID = 'dotheaven.org';
const DEFAULT_LIT_WEBVIEW_PATH = '/lit-bundle/index.html';
const DEFAULT_AUTH_PAGE_URL = 'https://dotheaven.org/#/auth';
const DEFAULT_AUTH_CALLBACK_URL = 'heaven://auth-callback';
const DEFAULT_LIT_NETWORK = 'naga-dev';
const DEFAULT_LIT_RPC_URL = 'https://yellowstone-rpc.litprotocol.com';
// Default to the Rust-native Lit engine on Android (no WebView).
// Keep WebView as the default for iOS until native passkeys are implemented there.
const DEFAULT_LIT_ENGINE = Platform.OS === 'android' ? 'rust' : 'webview';

function cleanEnv(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeHostname(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeRpId(value: string): string {
  const trimmed = normalizeHostname(value);
  if (!trimmed) return '';

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return trimmed;
  }
}

function hostMatchesRpId(hostname: string, rpId: string): boolean {
  const normalizedHost = normalizeHostname(hostname);
  const normalizedRpId = normalizeRpId(rpId);
  if (!normalizedHost || !normalizedRpId) return false;
  return normalizedHost === normalizedRpId || normalizedHost.endsWith(`.${normalizedRpId}`);
}

function parseHostnameFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function getCanonicalLitWebViewUrl(passkeyRpId: string): string {
  return `https://${normalizeRpId(passkeyRpId)}${DEFAULT_LIT_WEBVIEW_PATH}`;
}

const configuredPasskeyRpId =
  normalizeRpId(cleanEnv(process.env.EXPO_PUBLIC_PASSKEY_RP_ID) || DEFAULT_PASSKEY_RP_ID);
const configuredLitWebViewUrl =
  cleanEnv(process.env.EXPO_PUBLIC_LIT_WEBVIEW_URL) || getCanonicalLitWebViewUrl(configuredPasskeyRpId);
const configuredLitWebViewHost = parseHostnameFromUrl(configuredLitWebViewUrl);
const explicitAllowNonCanonical = cleanEnv(process.env.EXPO_PUBLIC_ALLOW_NON_CANONICAL_PASSKEY_RP);

export const AUTH_CONFIG = {
  authServiceBaseUrl: cleanEnv(process.env.EXPO_PUBLIC_LIT_AUTH_SERVICE_URL) || DEFAULT_AUTH_SERVICE_BASE_URL,
  passkeyRpId: configuredPasskeyRpId,
  canonicalLitWebViewUrl: getCanonicalLitWebViewUrl(configuredPasskeyRpId),
  litWebViewUrl: configuredLitWebViewUrl,
  litWebViewHost: configuredLitWebViewHost,
  litWebViewMatchesPasskeyRp:
    configuredLitWebViewHost != null
      ? hostMatchesRpId(configuredLitWebViewHost, configuredPasskeyRpId)
      : false,
  authPageUrl: cleanEnv(process.env.EXPO_PUBLIC_AUTH_PAGE_URL) || DEFAULT_AUTH_PAGE_URL,
  authCallbackUrl: cleanEnv(process.env.EXPO_PUBLIC_AUTH_CALLBACK_URL) || DEFAULT_AUTH_CALLBACK_URL,
  authFlow: cleanEnv(process.env.EXPO_PUBLIC_AUTH_FLOW) || 'browser',
  litNetwork: cleanEnv(process.env.EXPO_PUBLIC_LIT_NETWORK) || DEFAULT_LIT_NETWORK,
  litRpcUrl: cleanEnv(process.env.EXPO_PUBLIC_LIT_RPC_URL) || DEFAULT_LIT_RPC_URL,
  litEngine: cleanEnv(process.env.EXPO_PUBLIC_LIT_ENGINE) || DEFAULT_LIT_ENGINE,
  allowNonCanonicalPasskeyRp: (() => {
    if (explicitAllowNonCanonical != null) {
      return explicitAllowNonCanonical === '1';
    }
    // Fail closed by default: keep passkey RP canonical unless explicitly overridden.
    return false;
  })(),
};
