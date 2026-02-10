import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { useLitBridge } from './LitProvider';

const AUTH_SERVICE_BASE_URL = 'https://naga-dev-auth-service.getlit.dev';
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
  const pubkey = String(normalized?.pubkey ?? normalized?.publicKey ?? '');
  if (!pubkey) {
    throw new Error('Missing PKP public key');
  }

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
    message.includes('signature error') ||
    message.includes('session expired')
  );
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  isNewUser: boolean;
  pkpInfo: PKPInfo | null;
  authData: AuthData | null;
  register: () => Promise<void>;
  authenticate: () => Promise<void>;
  createAuthContext: () => Promise<any>;
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

  const register = useCallback(async () => {
    if (!bridge || !isReady) {
      Alert.alert('Not Ready', 'Lit engine is still loading. Please wait a moment and try again.');
      return;
    }

    try {
      const result = await bridge.sendRequest('registerAndMintPKP', {
        authServiceBaseUrl: AUTH_SERVICE_BASE_URL,
        scopes: ['sign-anything'],
      }, 120000);

      const pkp = normalizePkpInfo(result.pkpInfo);
      const auth = normalizeAuthData(result.authData);

      authContextCacheRef.current = null;
      setPkpInfo(pkp);
      setAuthData(auth);
      await persistAuth(pkp, auth);
      setIsNewUser(true); // Trigger onboarding flow
    } catch (err: any) {
      console.error('[Auth] Registration failed:', err);
      Alert.alert('Registration Failed', err?.message || 'Something went wrong');
    }
  }, [bridge, isReady]);

  const authenticate = useCallback(async () => {
    if (!bridge || !isReady) {
      Alert.alert('Not Ready', 'Lit engine is still loading. Please wait a moment and try again.');
      return;
    }

    try {
      const result = await bridge.sendRequest('authenticate', {
        authServiceBaseUrl: AUTH_SERVICE_BASE_URL,
      }, 120000);

      const auth = normalizeAuthData(result);
      authContextCacheRef.current = null;
      setAuthData(auth);

      // Look up PKPs for this auth
      const pkpsResult = await bridge.sendRequest('viewPKPsByAuthData', {
        authData: { authMethodType: auth.authMethodType, authMethodId: auth.authMethodId },
        pagination: { limit: 1, offset: 0 },
      });

      if (pkpsResult.pkps?.length > 0) {
        const pkp = normalizePkpInfo(pkpsResult.pkps[0]);
        setPkpInfo(pkp);
        await persistAuth(pkp, auth);
      } else {
        await persistAuth(null, auth);
      }

      Alert.alert('Welcome back', 'You are now logged in.');
    } catch (err: any) {
      console.error('[Auth] Authentication failed:', err);
      Alert.alert('Login Failed', err?.message || 'Something went wrong');
    }
  }, [bridge, isReady]);

  const createAuthCtxInternal = useCallback(async (forceRefresh: boolean = false) => {
    if (!bridge || !isReady || !authData || !pkpInfo) {
      throw new Error('Not authenticated');
    }

    const cached = authContextCacheRef.current;
    if (
      !forceRefresh &&
      cached &&
      cached.pkpPubkey === pkpInfo.pubkey &&
      cached.authMethodId === authData.authMethodId &&
      cached.accessToken === authData.accessToken
    ) {
      return cached.authContext;
    }

    const result = await bridge.sendRequest('createAuthContext', {
      authData,
      pkpPublicKey: pkpInfo.pubkey,
      authConfig: {
        resources: [
          ['pkp-signing', '*'],
          ['lit-action-execution', '*'],
        ],
        expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        statement: '',
        domain: 'https://appassets.androidplatform.net',
      },
    }, 120000);

    if (!result?.authContext) {
      throw new Error('Auth context creation returned no authContext');
    }

    authContextCacheRef.current = {
      pkpPubkey: pkpInfo.pubkey,
      authMethodId: authData.authMethodId,
      accessToken: authData.accessToken,
      authContext: result.authContext,
    };

    return result.authContext;
  }, [bridge, isReady, authData, pkpInfo]);

  const createAuthCtx = useCallback(async () => {
    return createAuthCtxInternal(false);
  }, [createAuthCtxInternal]);

  const signMessage = useCallback(async (message: string): Promise<string> => {
    if (!bridge || !isReady || !pkpInfo) {
      throw new Error('Not authenticated or Lit engine not ready');
    }

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
    } catch (error) {
      if (!isStaleAuthContextError(error)) {
        throw error;
      }

      authContextCacheRef.current = null;
      authCtx = await createAuthCtxInternal(true);
      result = await signWithContext(authCtx);
    }

    if (!result?.signature) {
      throw new Error('No signature returned from PKP signer');
    }

    return result.signature;
  }, [bridge, isReady, pkpInfo, createAuthCtxInternal]);

  const completeOnboarding = useCallback(() => {
    setIsNewUser(false);
  }, []);

  const logout = useCallback(async () => {
    authContextCacheRef.current = null;
    setPkpInfo(null);
    setAuthData(null);
    setIsNewUser(false);
    await persistAuth(null, null);
  }, []);

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
