/**
 * LitProvider - React Context provider for Lit Protocol
 *
 * Provides the Lit bridge instance throughout the app and manages
 * the headless WebView lifecycle.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LitBridge, type SecureStorage } from '../services/LitBridge';
import { LitWebView } from '../components/LitWebView';

// Async Storage adapter for secure storage
const createSecureStorage = (): SecureStorage => ({
  async getItem(key: string) {
    return AsyncStorage.getItem(`lit:${key}`);
  },
  async setItem(key: string, value: string) {
    await AsyncStorage.setItem(`lit:${key}`, value);
  },
  async removeItem(key: string) {
    await AsyncStorage.removeItem(`lit:${key}`);
  }
});

export interface LitContextValue {
  bridge: LitBridge | null;
  isReady: boolean;
  error: Error | null;
}

const LitContext = createContext<LitContextValue>({
  bridge: null,
  isReady: false,
  error: null
});

export interface LitProviderProps {
  children: React.ReactNode;
  debug?: boolean;
}

export const LitProvider: React.FC<LitProviderProps> = ({ children, debug = false }) => {
  const [bridge] = useState(() => new LitBridge(createSecureStorage()));
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleReady = useCallback(() => {
    setIsReady(true);
    setError(null);
  }, []);

  const handleError = useCallback((err: Error) => {
    setError(err);
    setIsReady(false);
  }, []);

  useEffect(() => {
    return () => {
      bridge.destroy();
    };
  }, [bridge]);

  return (
    <LitContext.Provider value={{ bridge, isReady, error }}>
      <LitWebView
        bridge={bridge}
        onReady={handleReady}
        onError={handleError}
        debug={debug}
      />
      {children}
    </LitContext.Provider>
  );
};

/**
 * Hook to access the Lit bridge from any component
 */
export const useLit = (): LitContextValue => {
  const context = useContext(LitContext);
  if (!context) {
    throw new Error('useLit must be used within a LitProvider');
  }
  return context;
};

/**
 * Hook with loading state helper
 */
export const useLitBridge = () => {
  const { bridge, isReady, error } = useLit();

  const waitForReady = useCallback(async () => {
    if (isReady && bridge) return bridge;
    if (error) throw error;
    if (!bridge) throw new Error('Bridge not initialized');
    await bridge.waitForReady();
    return bridge;
  }, [bridge, isReady, error]);

  return {
    bridge,
    isReady,
    error,
    waitForReady
  };
};
