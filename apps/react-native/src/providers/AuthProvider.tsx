import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { useLitBridge } from './LitProvider';

const AUTH_SERVICE_BASE_URL = 'https://naga-dev-auth-service.getlit.dev';
const APP_SCHEME = 'litrnpoc';
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

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  pkpInfo: PKPInfo | null;
  authData: AuthData | null;
  register: () => Promise<void>;
  authenticate: () => Promise<void>;
  createAuthContext: () => Promise<any>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { bridge, isReady } = useLitBridge();
  const [pkpInfo, setPkpInfo] = useState<PKPInfo | null>(null);
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore persisted auth on mount
  useEffect(() => {
    (async () => {
      try {
        const [storedPkp, storedAuth] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_PKP),
          AsyncStorage.getItem(STORAGE_KEY_AUTH),
        ]);
        if (storedPkp) setPkpInfo(JSON.parse(storedPkp));
        if (storedAuth) setAuthData(JSON.parse(storedAuth));
      } catch (err) {
        console.error('[Auth] Failed to restore:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const persistAuth = async (pkp: PKPInfo | null, auth: AuthData | null) => {
    if (pkp) {
      await AsyncStorage.setItem(STORAGE_KEY_PKP, JSON.stringify(pkp));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY_PKP);
    }
    if (auth) {
      await AsyncStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(auth));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY_AUTH);
    }
  };

  const register = useCallback(async () => {
    if (!bridge || !isReady) throw new Error('Lit bridge not ready');

    const result = await bridge.sendRequest('registerAndMintPKP', {
      authServiceBaseUrl: AUTH_SERVICE_BASE_URL,
      scopes: ['sign-anything'],
    }, 120000);

    const pkp: PKPInfo = result.pkpInfo;
    const auth: AuthData = result.authData || {
      authMethodType: 8,
      authMethodId: result.webAuthnPublicKey,
    };

    setPkpInfo(pkp);
    setAuthData(auth);
    await persistAuth(pkp, auth);
  }, [bridge, isReady]);

  const authenticate = useCallback(async () => {
    if (!bridge || !isReady) throw new Error('Lit bridge not ready');

    const result = await bridge.sendRequest('authenticate', {
      authServiceBaseUrl: AUTH_SERVICE_BASE_URL,
    }, 120000);

    const auth: AuthData = {
      authMethodType: result.authMethodType,
      authMethodId: result.authMethodId,
      accessToken: result.accessToken,
    };
    setAuthData(auth);

    // Look up PKPs for this auth
    const pkpsResult = await bridge.sendRequest('viewPKPsByAuthData', {
      authData: { authMethodType: auth.authMethodType, authMethodId: auth.authMethodId },
      pagination: { limit: 1, offset: 0 },
    });

    if (pkpsResult.pkps?.length > 0) {
      const pkp: PKPInfo = { pubkey: pkpsResult.pkps[0].pubkey };
      setPkpInfo(pkp);
      await persistAuth(pkp, auth);
    } else {
      await persistAuth(null, auth);
    }
  }, [bridge, isReady]);

  const createAuthCtx = useCallback(async () => {
    if (!bridge || !isReady || !authData || !pkpInfo) {
      throw new Error('Not authenticated');
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

    return result.authContext;
  }, [bridge, isReady, authData, pkpInfo]);

  const logout = useCallback(async () => {
    setPkpInfo(null);
    setAuthData(null);
    await persistAuth(null, null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!pkpInfo && !!authData,
        isLoading,
        pkpInfo,
        authData,
        register,
        authenticate,
        createAuthContext: createAuthCtx,
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
