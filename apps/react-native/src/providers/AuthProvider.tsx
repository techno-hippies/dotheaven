import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoCrypto from 'expo-crypto';
import { hashMessage, keccak256, toBytes } from 'viem';
import { useLitBridge } from './LitProvider';
import { AUTH_CONFIG } from '../lib/auth-config';

const STORAGE_KEY_PKP = 'heaven:pkpInfo';
const STORAGE_KEY_AUTH = 'heaven:authData';

export interface PKPInfo {
  pubkey: string;
  ethAddress?: string;
  tokenId?: string;
}

export interface AuthData {
  authMethodType: number;
  authMethodId: string;
  accessToken?: string;
}

function normalizeBigInts(value: unknown): unknown {
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeBigInts(item));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalizeBigInts(v)]);
    return Object.fromEntries(entries);
  }

  return value;
}

function normalizeAuthData(raw: unknown): AuthData {
  const normalized = normalizeBigInts(raw) as Record<string, unknown> | null;
  const authMethodType = Number(normalized?.authMethodType);
  if (!Number.isFinite(authMethodType)) {
    throw new Error('Invalid auth method type returned from auth bridge');
  }

  const authMethodId = String(normalized?.authMethodId ?? '');
  const accessToken = normalized?.accessToken == null ? undefined : String(normalized.accessToken);

  return {
    authMethodType,
    authMethodId,
    accessToken,
  };
}

function normalizePkpInfo(raw: unknown): PKPInfo {
  const normalized = normalizeBigInts(raw) as Record<string, unknown> | null;
  const rawPubkey = String(normalized?.pubkey ?? normalized?.publicKey ?? '');
  if (!rawPubkey) {
    throw new Error('Missing PKP public key');
  }
  // Keep the 0x prefix — the WebView bridge normalizes it internally when needed,
  // but ethers@5 arrayify() (used during auth context creation) requires it.
  const pubkey = rawPubkey.startsWith('0x') || rawPubkey.startsWith('0X')
    ? rawPubkey
    : `0x${rawPubkey}`;

  return {
    pubkey,
    ethAddress: normalized?.ethAddress == null ? undefined : String(normalized.ethAddress),
    tokenId: normalized?.tokenId == null ? undefined : String(normalized.tokenId),
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && typeof (error as any).message === 'string') {
    return (error as any).message;
  }
  return String(error);
}

function isStaleAuthContextError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('no auth context') ||
    message.includes('invalidauthsig') ||
    message.includes('auth_sig passed is invalid') ||
    message.includes("can't get auth context") ||
    message.includes('invalid blockhash') ||
    message.includes('session key signing') ||
    message.includes('signature error') ||
    message.includes('session expired')
  );
}

function isWebAuthnRpHashMismatchError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('relying party id hash does not match') ||
    message.includes('passkey assertion payload mismatch')
  );
}

function isPersonalSignScopeError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('nodeauthsigscopetoolimited') ||
    (message.includes('required scope [2]') && message.includes('pkp is not authorized'))
  );
}

function isPersonalSignRuntimeError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("reading 'split'") ||
    message.includes('cannot read properties of undefined') ||
    message.includes('invalid ecdsa signature') ||
    message.includes('invalid signature produced by bridge')
  );
}

function isPasskeyRpMismatchError(error: unknown): boolean {
  return getErrorMessage(error).includes('Passkey RP mismatch');
}

function parseLitSignature(sig: any): string {
  if (!sig) {
    throw new Error('No signature returned from PKP signer');
  }

  const strip0x = (hex: string): string => (hex.startsWith('0x') ? hex.slice(2) : hex);

  let r: string;
  let s: string;
  let recid: number;

  if (sig.r && sig.s) {
    r = strip0x(sig.r).padStart(64, '0');
    s = strip0x(sig.s).padStart(64, '0');
    recid = Number(sig.recid ?? sig.recoveryId ?? 0);
  } else if (sig.signature) {
    const sigHex = strip0x(sig.signature);
    r = sigHex.slice(0, 64).padStart(64, '0');
    s = sigHex.slice(64, 128).padStart(64, '0');
    recid = Number(sig.recid ?? sig.recoveryId ?? 0);
  } else {
    throw new Error(`Unknown Lit signature format: ${JSON.stringify(sig)}`);
  }

  const v = recid >= 27 ? recid : recid + 27;
  const vHex = v.toString(16).padStart(2, '0');
  const signature = `0x${r}${s}${vHex}`;
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error(`Invalid ECDSA signature produced by bridge (length=${signature.length})`);
  }
  return signature;
}

type CreateAuthContextOptions = {
  forceRefresh?: boolean;
};

type BrowserAuthMode = 'signin' | 'register';

interface BrowserAuthPayload {
  pkpPublicKey?: string;
  pkpAddress?: string;
  pkpTokenId?: string;
  authMethodType?: number | string;
  authMethodId?: string;
  accessToken?: string;
  isNewUser?: boolean | string;
  error?: string;
}

function parseBooleanLike(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function decodeBase64UrlUtf8(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  if (typeof globalThis.atob === 'function') {
    return decodeURIComponent(
      Array.prototype.map
        .call(globalThis.atob(padded), (char: string) =>
          `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`,
        )
        .join(''),
    );
  }
  throw new Error('Missing base64 decoder in runtime');
}

function hostMatchesRpId(hostname: string, rpId: string): boolean {
  const normalizedHost = String(hostname || '').toLowerCase();
  const normalizedRp = String(rpId || '').toLowerCase();
  if (!normalizedHost || !normalizedRp) return false;
  return normalizedHost === normalizedRp || normalizedHost.endsWith(`.${normalizedRp}`);
}

function toRpIdHost(domainOrRpId: string): string {
  const trimmed = String(domainOrRpId || '').trim();
  if (!trimmed) {
    throw new Error('Missing passkey RP domain');
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withScheme);
  if (!parsed.hostname) {
    throw new Error(`Invalid passkey RP domain: "${domainOrRpId}"`);
  }
  return parsed.hostname.toLowerCase();
}

function assertCanonicalLitWebViewForBrowserPasskeyFlow(): void {
  if (AUTH_CONFIG.authFlow !== 'browser') return;
  if (AUTH_CONFIG.allowNonCanonicalPasskeyRp) return;
  if (AUTH_CONFIG.litWebViewMatchesPasskeyRp) return;

  const host = AUTH_CONFIG.litWebViewHost || '(missing)';
  throw new Error(
    `Passkey RP mismatch: configured Lit WebView host "${host}" does not match passkey RP "${AUTH_CONFIG.passkeyRpId}". ` +
    `Set EXPO_PUBLIC_LIT_WEBVIEW_URL=${AUTH_CONFIG.canonicalLitWebViewUrl}`,
  );
}

function inspectWebAuthnAccessToken(accessToken: string): {
  rawId?: string;
  originHost?: string;
  derivedAuthMethodId?: string;
  authenticatorRpIdHashHex?: string;
} {
  try {
    const parsed = JSON.parse(accessToken) as any;
    const rawId = typeof parsed?.rawId === 'string' ? parsed.rawId : undefined;
    const clientDataJsonB64 = parsed?.response?.clientDataJSON;
    const authenticatorDataB64 = parsed?.response?.authenticatorData;
    let originHost: string | undefined;
    let authenticatorRpIdHashHex: string | undefined;

    if (typeof clientDataJsonB64 === 'string' && clientDataJsonB64.length > 0) {
      const clientDataJson = decodeBase64UrlUtf8(clientDataJsonB64);
      const clientData = JSON.parse(clientDataJson) as { origin?: string };
      if (typeof clientData?.origin === 'string') {
        originHost = new URL(clientData.origin).hostname.toLowerCase();
      }
    }

    if (typeof authenticatorDataB64 === 'string' && authenticatorDataB64.length > 0) {
      const normalized = authenticatorDataB64.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      if (typeof globalThis.atob === 'function') {
        const decoded = globalThis.atob(padded);
        if (decoded.length >= 32) {
          let hashHex = '';
          for (let i = 0; i < 32; i += 1) {
            hashHex += decoded.charCodeAt(i).toString(16).padStart(2, '0');
          }
          authenticatorRpIdHashHex = hashHex;
        }
      }
    }

    const derivedAuthMethodId =
      typeof rawId === 'string' && rawId.length > 0
        ? keccak256(toBytes(`${rawId}:lit`))
        : undefined;

    return { rawId, originHost, derivedAuthMethodId, authenticatorRpIdHashHex };
  } catch (error) {
    console.warn('[Auth] Failed to inspect WebAuthn access token:', error);
    return {};
  }
}

function parseBrowserAuthPayloadFromUrl(url: string): BrowserAuthPayload {
  const parsed = new URL(url);
  const directPayload = parsed.searchParams.get('payload');
  if (directPayload) {
    try {
      return JSON.parse(directPayload) as BrowserAuthPayload;
    } catch (error) {
      throw new Error(`Invalid auth callback payload JSON: ${String(error)}`);
    }
  }

  return {
    pkpPublicKey: parsed.searchParams.get('pkpPublicKey') || undefined,
    pkpAddress: parsed.searchParams.get('pkpAddress') || undefined,
    pkpTokenId: parsed.searchParams.get('pkpTokenId') || undefined,
    authMethodType: parsed.searchParams.get('authMethodType') || undefined,
    authMethodId: parsed.searchParams.get('authMethodId') || undefined,
    accessToken: parsed.searchParams.get('accessToken') || undefined,
    isNewUser: parsed.searchParams.get('isNewUser') || undefined,
    error: parsed.searchParams.get('error') || undefined,
  };
}

function buildBrowserAuthUrl(mode: BrowserAuthMode): string {
  const params = new URLSearchParams({
    callback: AUTH_CONFIG.authCallbackUrl,
    mode,
    transport: 'redirect',
    source: 'react-native',
  });
  const separator = AUTH_CONFIG.authPageUrl.includes('?') ? '&' : '?';
  return `${AUTH_CONFIG.authPageUrl}${separator}${params.toString()}`;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  isNewUser: boolean;
  pkpInfo: PKPInfo | null;
  authData: AuthData | null;
  register: () => Promise<void>;
  authenticate: () => Promise<void>;
  createAuthContext: (options?: CreateAuthContextOptions) => Promise<any>;
  /** Sign an arbitrary message using the PKP. Returns hex-encoded signature. */
  signMessage: (message: string) => Promise<string>;
  completeOnboarding: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { bridge, isReady } = useLitBridge();
  const [pkpInfo, setPkpInfo] = useState<PKPInfo | null>(null);
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);
  const authContextCacheRef = useRef<{
    pkpPubkey: string;
    authMethodId: string;
    accessToken?: string;
    authContext: any;
  } | null>(null);

  // Restore persisted auth on mount + check onboarding status
  useEffect(() => {
    (async () => {
      try {
        const [storedPkp, storedAuth] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_PKP),
          AsyncStorage.getItem(STORAGE_KEY_AUTH),
        ]);
        if (storedPkp) {
          const pkp = normalizePkpInfo(JSON.parse(storedPkp));
          setPkpInfo(pkp);

          // Check if onboarding was completed
          if (pkp.ethAddress) {
            const onboardingStatus = await AsyncStorage.getItem(
              `heaven:onboarding:${pkp.ethAddress.toLowerCase()}`
            );
            if (onboardingStatus !== 'complete') {
              // User registered but didn't finish onboarding
              setIsNewUser(true);
            }
          }
        }
        if (storedAuth) {
          setAuthData(normalizeAuthData(JSON.parse(storedAuth)));
        }
      } catch (err) {
        console.error('[Auth] Failed to restore:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const cached = authContextCacheRef.current;
    if (!cached || !pkpInfo || !authData) {
      authContextCacheRef.current = null;
      return;
    }
    if (
      cached.pkpPubkey !== pkpInfo.pubkey ||
      cached.authMethodId !== authData.authMethodId ||
      cached.accessToken !== authData.accessToken
    ) {
      authContextCacheRef.current = null;
    }
  }, [pkpInfo?.pubkey, authData?.authMethodId, authData?.accessToken]);

  const persistAuth = async (pkp: PKPInfo | null, auth: AuthData | null) => {
    if (pkp) {
      await AsyncStorage.setItem(STORAGE_KEY_PKP, JSON.stringify(normalizeBigInts(pkp)));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY_PKP);
    }
    if (auth) {
      await AsyncStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(normalizeBigInts(auth)));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY_AUTH);
    }
  };

  const runBrowserPasskeyAuth = useCallback(async (mode: BrowserAuthMode) => {
    const authUrl = buildBrowserAuthUrl(mode);
    console.log('[Auth] Starting browser passkey flow:', mode, authUrl);
    const result = await WebBrowser.openAuthSessionAsync(authUrl, AUTH_CONFIG.authCallbackUrl);

    if (result.type !== 'success' || !('url' in result) || !result.url) {
      throw new Error(
        result.type === 'cancel' || result.type === 'dismiss'
          ? 'Authentication cancelled'
          : 'Authentication did not complete',
      );
    }

    const payload = parseBrowserAuthPayloadFromUrl(result.url);
    if (payload.error) {
      throw new Error(payload.error);
    }

    const pkp = normalizePkpInfo({
      pubkey: payload.pkpPublicKey,
      ethAddress: payload.pkpAddress,
      tokenId: payload.pkpTokenId,
    });
    const auth = normalizeAuthData({
      authMethodType: payload.authMethodType,
      authMethodId: payload.authMethodId,
      accessToken: payload.accessToken,
    });
    const accessTokenInfo =
      auth.authMethodType === 3 && auth.accessToken
        ? inspectWebAuthnAccessToken(auth.accessToken)
        : {};
    const derivedAuthMethodId = accessTokenInfo.derivedAuthMethodId;
    if (derivedAuthMethodId && derivedAuthMethodId.toLowerCase() !== auth.authMethodId.toLowerCase()) {
      console.warn('[Auth] Browser callback authMethodId mismatch; using value derived from accessToken rawId.', {
        received: auth.authMethodId.slice(0, 18),
        derived: derivedAuthMethodId.slice(0, 18),
      });
      auth.authMethodId = derivedAuthMethodId;
    }

    if (accessTokenInfo.originHost && accessTokenInfo.authenticatorRpIdHashHex) {
      ExpoCrypto.digestStringAsync(
        ExpoCrypto.CryptoDigestAlgorithm.SHA256,
        accessTokenInfo.originHost,
        { encoding: ExpoCrypto.CryptoEncoding.HEX },
      )
        .then((expected) => {
          console.log('[Auth] WebAuthn token RP hash check:', {
            originHost: accessTokenInfo.originHost,
            authenticatorRpIdHashHex: accessTokenInfo.authenticatorRpIdHashHex,
            expectedRpIdHashHex: expected,
            match:
              accessTokenInfo.authenticatorRpIdHashHex?.toLowerCase() === expected.toLowerCase(),
          });
        })
        .catch((error) => {
          console.warn('[Auth] Failed to compute expected RP hash for callback token:', error);
        });
    }

    console.log('[Auth] Browser callback payload summary:', {
      mode,
      tokenId: pkp.tokenId,
      authMethodType: auth.authMethodType,
      authMethodId: String(auth.authMethodId || '').slice(0, 18),
      accessTokenOriginHost: accessTokenInfo.originHost,
      accessTokenAuthenticatorRpIdHash: accessTokenInfo.authenticatorRpIdHashHex,
      isNewUser: parseBooleanLike(payload.isNewUser) || mode === 'register',
    });

    return {
      pkp,
      auth,
      isNewUser: parseBooleanLike(payload.isNewUser) || mode === 'register',
    };
  }, []);

  const register = useCallback(async () => {
    if (AUTH_CONFIG.authFlow !== 'browser' && (!bridge || !isReady)) {
      Alert.alert('Not Ready', 'Lit engine is still loading. Please wait a moment and try again.');
      return;
    }

    try {
      let pkp: PKPInfo;
      let auth: AuthData;
      let shouldShowOnboarding = true;

      if (AUTH_CONFIG.authFlow === 'browser') {
        const result = await runBrowserPasskeyAuth('register');
        pkp = result.pkp;
        auth = result.auth;
        shouldShowOnboarding = result.isNewUser;
      } else {
        const result = await bridge!.sendRequest('registerAndMintPKP', {
          authServiceBaseUrl: AUTH_CONFIG.authServiceBaseUrl,
          scopes: ['sign-anything', 'personal-sign'],
          expectedRpId: AUTH_CONFIG.passkeyRpId,
          allowNonCanonicalRp: AUTH_CONFIG.allowNonCanonicalPasskeyRp,
        }, 120000);

        pkp = normalizePkpInfo(result.pkpInfo);
        auth = normalizeAuthData(result.authData);
      }

      authContextCacheRef.current = null;
      setPkpInfo(pkp);
      setAuthData(auth);
      await persistAuth(pkp, auth);
      setIsNewUser(shouldShowOnboarding);
    } catch (err: any) {
      console.error('[Auth] Registration failed:', err);
      if (isPasskeyRpMismatchError(err)) {
        Alert.alert(
          'Passkey Domain Mismatch',
          `Passkey auth must run on ${AUTH_CONFIG.passkeyRpId}. Current WebView host is not allowed.`,
        );
      } else {
        Alert.alert('Registration Failed', err?.message || 'Something went wrong');
      }
    }
  }, [bridge, isReady, runBrowserPasskeyAuth]);

  const authenticate = useCallback(async () => {
    if (AUTH_CONFIG.authFlow !== 'browser' && (!bridge || !isReady)) {
      Alert.alert('Not Ready', 'Lit engine is still loading. Please wait a moment and try again.');
      return;
    }

    try {
      let pkp: PKPInfo | null = null;
      let auth: AuthData;

      if (AUTH_CONFIG.authFlow === 'browser') {
        const result = await runBrowserPasskeyAuth('signin');
        pkp = result.pkp;
        auth = result.auth;
      } else {
        const result = await bridge!.sendRequest('authenticate', {
          authServiceBaseUrl: AUTH_CONFIG.authServiceBaseUrl,
          expectedRpId: AUTH_CONFIG.passkeyRpId,
          allowNonCanonicalRp: AUTH_CONFIG.allowNonCanonicalPasskeyRp,
        }, 120000);
        auth = normalizeAuthData(result);
      }

      authContextCacheRef.current = null;
      setAuthData(auth);

      if (!pkp) {
        if (!bridge) {
          throw new Error('Missing PKP in auth callback and Lit bridge is unavailable');
        }
        // Look up PKPs for this auth
        const pkpsResult = await bridge.sendRequest('viewPKPsByAuthData', {
          authData: { authMethodType: auth.authMethodType, authMethodId: auth.authMethodId },
          pagination: { limit: 1, offset: 0 },
        });

        if (pkpsResult.pkps?.length > 0) {
          pkp = normalizePkpInfo(pkpsResult.pkps[0]);
        }
      }

      if (pkp) {
        setPkpInfo(pkp);
        await persistAuth(pkp, auth);
      } else {
        await persistAuth(null, auth);
      }

      Alert.alert('Welcome back', 'You are now logged in.');
    } catch (err: any) {
      console.error('[Auth] Authentication failed:', err);
      if (isPasskeyRpMismatchError(err)) {
        Alert.alert(
          'Passkey Domain Mismatch',
          `Passkey auth must run on ${AUTH_CONFIG.passkeyRpId}. Current WebView host is not allowed.`,
        );
      } else {
        Alert.alert('Login Failed', err?.message || 'Something went wrong');
      }
    }
  }, [bridge, isReady, runBrowserPasskeyAuth]);

  const createAuthCtxInternal = useCallback(async (forceRefresh: boolean = false) => {
    if (!bridge || !isReady || !authData || !pkpInfo) {
      throw new Error('Not authenticated');
    }

    assertCanonicalLitWebViewForBrowserPasskeyFlow();

    const createAuthContextWithData = async (auth: AuthData) => {
      const domainHost = toRpIdHost(AUTH_CONFIG.passkeyRpId);
      const webAuthnTokenInfo =
        auth.authMethodType === 3 && auth.accessToken
          ? inspectWebAuthnAccessToken(auth.accessToken)
          : {};
      const authDataForRequest: AuthData = { ...auth };

      if (
        webAuthnTokenInfo.derivedAuthMethodId &&
        webAuthnTokenInfo.derivedAuthMethodId.toLowerCase() !== auth.authMethodId.toLowerCase()
      ) {
        console.warn('[Auth] Correcting cached authMethodId from WebAuthn accessToken rawId before createAuthContext.');
        authDataForRequest.authMethodId = webAuthnTokenInfo.derivedAuthMethodId;
      }

      if (
        webAuthnTokenInfo.originHost &&
        !hostMatchesRpId(webAuthnTokenInfo.originHost, AUTH_CONFIG.passkeyRpId)
      ) {
        throw new Error(
          `Passkey assertion origin mismatch (got ${webAuthnTokenInfo.originHost}, expected ${AUTH_CONFIG.passkeyRpId}). Please sign in again and choose the ${AUTH_CONFIG.passkeyRpId} passkey.`,
        );
      }

      let expectedRpHashHex: string | undefined;
      if (webAuthnTokenInfo.originHost) {
        expectedRpHashHex = await ExpoCrypto.digestStringAsync(
          ExpoCrypto.CryptoDigestAlgorithm.SHA256,
          webAuthnTokenInfo.originHost,
          { encoding: ExpoCrypto.CryptoEncoding.HEX },
        );
      }

      if (
        webAuthnTokenInfo.authenticatorRpIdHashHex &&
        expectedRpHashHex &&
        webAuthnTokenInfo.authenticatorRpIdHashHex.toLowerCase() !== expectedRpHashHex.toLowerCase()
      ) {
        throw new Error(
          `Passkey assertion payload mismatch: clientData origin=${webAuthnTokenInfo.originHost} but authenticatorData rpIdHash differs. Please sign in again and choose the correct dotheaven.org passkey.`,
        );
      }

      console.log('[Auth] createAuthContext request summary:', {
        tokenId: pkpInfo.tokenId,
        pkpPubkey: String(pkpInfo.pubkey || '').slice(0, 18),
        authMethodType: authDataForRequest.authMethodType,
        authMethodId: String(authDataForRequest.authMethodId || '').slice(0, 18),
        authConfigDomain: domainHost,
        accessTokenOriginHost: webAuthnTokenInfo.originHost,
        accessTokenAuthenticatorRpIdHash: webAuthnTokenInfo.authenticatorRpIdHashHex,
        expectedRpIdHash: expectedRpHashHex,
      });

      const result = await bridge.sendRequest('createAuthContext', {
        authData: authDataForRequest,
        pkpPublicKey: pkpInfo.pubkey,
        disableWebViewReauth: AUTH_CONFIG.authFlow === 'browser',
        authConfig: {
          resources: [
            ['lit-action-execution', '*'],
            ['pkp-signing', '*'],
            ['access-control-condition-decryption', '*'],
          ],
          expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
          statement: 'Execute Lit Actions and sign messages',
          domain: domainHost,
        },
      }, 120000);

      if (!result?.success) {
        throw new Error('Auth context creation failed');
      }

      let effectiveAuth = auth;
      if (result?.refreshedAuthData) {
        effectiveAuth = normalizeAuthData(result.refreshedAuthData);
        setAuthData(effectiveAuth);
        await persistAuth(pkpInfo, effectiveAuth);
      } else if (authDataForRequest.authMethodId !== auth.authMethodId) {
        effectiveAuth = authDataForRequest;
        setAuthData(effectiveAuth);
        await persistAuth(pkpInfo, effectiveAuth);
      }

      // Auth context is kept in WebView's lastAuthContext (not returned here)
      // Cache the auth parameters so we know when to refresh
      authContextCacheRef.current = {
        pkpPubkey: pkpInfo.pubkey,
        authMethodId: effectiveAuth.authMethodId,
        accessToken: effectiveAuth.accessToken,
        authContext: null, // Not used - WebView manages the context
      };

      return result;
    };

    const cached = authContextCacheRef.current;
    if (
      !forceRefresh &&
      cached &&
      cached.pkpPubkey === pkpInfo.pubkey &&
      cached.authMethodId === authData.authMethodId &&
      cached.accessToken === authData.accessToken
    ) {
      // Auth context already set in WebView - just return success
      return { success: true };
    }

    try {
      return await createAuthContextWithData(authData);
    } catch (error) {
      if (isWebAuthnRpHashMismatchError(error)) {
        if (AUTH_CONFIG.authFlow === 'browser' && !forceRefresh) {
          console.warn('[Auth] RP hash mismatch detected; requesting one explicit browser sign-in retry.');
          const refreshedAuth = (await runBrowserPasskeyAuth('signin')).auth;
          authContextCacheRef.current = null;
          setAuthData(refreshedAuth);
          await persistAuth(pkpInfo, refreshedAuth);
          try {
            return await createAuthContextWithData(refreshedAuth);
          } catch (retryError) {
            if (!isWebAuthnRpHashMismatchError(retryError)) {
              throw retryError;
            }
          }
        }
        throw new Error(
          `Passkey verification failed (RP hash mismatch). Please sign in again and select the passkey stored for ${AUTH_CONFIG.passkeyRpId}.`,
        );
      }
      if (isPersonalSignScopeError(error)) {
        console.warn('[Auth] Missing personal-sign scope for cached auth; clearing local auth state.');
        authContextCacheRef.current = null;
        setPkpInfo(null);
        setAuthData(null);
        setIsNewUser(false);
        await persistAuth(null, null);
        throw new Error(
          'This passkey account is missing required signing scope. Please register again to migrate your PKP.',
        );
      }
      if (!isStaleAuthContextError(error)) {
        throw error;
      }

      console.warn('[Auth] Auth context stale, re-authenticating to refresh access token...');
      const refreshedAuth = AUTH_CONFIG.authFlow === 'browser'
        ? (await runBrowserPasskeyAuth('signin')).auth
        : normalizeAuthData(
            await bridge.sendRequest('authenticate', {
              authServiceBaseUrl: AUTH_CONFIG.authServiceBaseUrl,
              expectedRpId: AUTH_CONFIG.passkeyRpId,
              allowNonCanonicalRp: AUTH_CONFIG.allowNonCanonicalPasskeyRp,
            }, 120000),
          );
      authContextCacheRef.current = null;
      setAuthData(refreshedAuth);
      await persistAuth(pkpInfo, refreshedAuth);

      return createAuthContextWithData(refreshedAuth);
    }
  }, [bridge, isReady, authData, pkpInfo, runBrowserPasskeyAuth]);

  const createAuthCtx = useCallback(async (options?: CreateAuthContextOptions) => {
    return createAuthCtxInternal(options?.forceRefresh === true);
  }, [createAuthCtxInternal]);

  const signMessage = useCallback(async (message: string): Promise<string> => {
    if (!bridge || !isReady || !pkpInfo) {
      throw new Error('Not authenticated or Lit engine not ready');
    }

    const signWithRawEcdsa = async (authContext: any): Promise<string> => {
      const ethSignedHash = hashMessage(message);
      const toSign = Array.from(toBytes(ethSignedHash));
      const litActionCode = `(async () => {
        const toSign = new Uint8Array(jsParams.toSign);
        await Lit.Actions.signEcdsa({
          toSign,
          publicKey: jsParams.publicKey,
          sigName: "sig",
        });
      })();`;

      const result = await bridge.sendRequest('executeLitAction', {
        authContext,
        code: litActionCode,
        jsParams: {
          toSign,
          publicKey: pkpInfo.pubkey,
        },
      }, 60000);

      return parseLitSignature(result?.signatures?.sig);
    };

    const signWithContext = async (authContext: any) =>
      bridge.sendRequest('signMessage', {
        message,
        publicKey: pkpInfo.pubkey,
        authContext,
      }, 60000);

    let authCtx = await createAuthCtxInternal(false);
    let result: any;

    try {
      result = await signWithContext(authCtx);
      if (!result?.signature) {
        throw new Error('No signature returned from PKP signer');
      }
      if (!/^0x[0-9a-fA-F]{130}$/.test(String(result.signature))) {
        throw new Error(`Invalid ECDSA signature produced by bridge (length=${String(result.signature).length})`);
      }
      return result.signature;
    } catch (error) {
      if (isPersonalSignScopeError(error) || isPersonalSignRuntimeError(error)) {
        console.warn('[Auth] Personal-sign failed; using raw ECDSA signing fallback.');
        try {
          return await signWithRawEcdsa(authCtx);
        } catch (fallbackErr) {
          if (!isStaleAuthContextError(fallbackErr)) {
            throw fallbackErr;
          }
          authContextCacheRef.current = null;
          authCtx = await createAuthCtxInternal(true);
          return signWithRawEcdsa(authCtx);
        }
      }

      if (!isStaleAuthContextError(error)) {
        throw error;
      }

      authContextCacheRef.current = null;
      authCtx = await createAuthCtxInternal(true);
      try {
        result = await signWithContext(authCtx);
        if (!result?.signature) {
          throw new Error('No signature returned from PKP signer');
        }
        if (!/^0x[0-9a-fA-F]{130}$/.test(String(result.signature))) {
          throw new Error(`Invalid ECDSA signature produced by bridge (length=${String(result.signature).length})`);
        }
        return result.signature;
      } catch (retryErr) {
        if (!isPersonalSignScopeError(retryErr) && !isPersonalSignRuntimeError(retryErr)) {
          throw retryErr;
        }
        console.warn('[Auth] Personal-sign still failing after refresh; using raw ECDSA signing fallback.');
        return signWithRawEcdsa(authCtx);
      }
    }
  }, [bridge, isReady, pkpInfo, createAuthCtxInternal]);

  const completeOnboarding = useCallback(() => {
    setIsNewUser(false);
  }, []);

  const logout = useCallback(async () => {
    if (bridge && isReady) {
      try {
        await bridge.sendRequest('setAuthContext', null);
      } catch (err) {
        console.warn('[Auth] Failed to clear bridge auth context during logout:', err);
      }
    }
    authContextCacheRef.current = null;
    setPkpInfo(null);
    setAuthData(null);
    setIsNewUser(false);
    await persistAuth(null, null);
  }, [bridge, isReady]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!pkpInfo && !!authData,
        isLoading,
        isNewUser,
        pkpInfo,
        authData,
        register,
        authenticate,
        createAuthContext: createAuthCtx,
        signMessage,
        completeOnboarding,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
