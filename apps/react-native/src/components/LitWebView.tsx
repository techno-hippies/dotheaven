/**
 * LitWebView - Headless WebView component for Lit Protocol
 *
 * This component renders an invisible WebView that runs the Lit Protocol
 * browser engine. It stays mounted and hidden, providing Lit functionality
 * to the rest of the app.
 */

import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import WebView from 'react-native-webview';
import type { LitBridge } from '../services/LitBridge';

export interface LitWebViewProps {
  bridge: LitBridge;
  onReady?: () => void;
  onError?: (error: Error) => void;
  debug?: boolean;
}

export const LitWebView: React.FC<LitWebViewProps> = ({
  bridge,
  onReady,
  onError,
  debug = false
}) => {
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    if (webViewRef.current) {
      bridge.setWebView(webViewRef.current);
    }

    return () => {
      bridge.setWebView(null);
    };
  }, [bridge]);

  // Wait for ready signal
  useEffect(() => {
    bridge.waitForReady(15000)
      .then(() => {
        console.log('[LitWebView] Engine ready');
        onReady?.();
      })
      .catch((error) => {
        console.error('[LitWebView] Failed to initialize:', error);
        onError?.(error);
      });
  }, [bridge, onReady, onError]);

  // Determine the source URL
  const sourceUri = Platform.select({
    android: 'https://appassets.androidplatform.net/assets/lit-bundle/index.html',
    ios: 'https://appassets.androidplatform.net/assets/lit-bundle/index.html', // Will need adjustment for iOS
    default: 'about:blank'
  });
  const allowedPrefix = 'https://appassets.androidplatform.net/assets/';

  // Inject console forwarder so WebView logs appear in Metro
  const consoleForwarder = `
    (function() {
      var origLog = console.log;
      var origWarn = console.warn;
      var origError = console.error;
      function fwd(level, args) {
        try {
          var msg = Array.prototype.map.call(args, function(a) {
            return typeof a === 'object' ? JSON.stringify(a) : String(a);
          }).join(' ');
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'console', level: level, message: msg }));
          }
        } catch(e) {}
        return msg;
      }
      console.log = function() { fwd('log', arguments); origLog.apply(console, arguments); };
      console.warn = function() { fwd('warn', arguments); origWarn.apply(console, arguments); };
      console.error = function() { fwd('error', arguments); origError.apply(console, arguments); };
    })();
    true;
  `;

  return (
    <View style={debug ? styles.debugContainer : styles.hiddenContainer} pointerEvents="none">
      <WebView
        ref={webViewRef}
        source={{ uri: sourceUri }}
        injectedJavaScriptBeforeContentLoaded={consoleForwarder}
        onMessage={(event) => bridge.handleMessage(event)}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('[LitWebView] WebView error:', nativeEvent);
          onError?.(new Error(nativeEvent.description || 'WebView error'));
        }}
        onHttpError={(syntheticEvent) => {
          console.error('[LitWebView] HTTP error:', syntheticEvent.nativeEvent);
        }}
        onLoadStart={() => console.log('[LitWebView] Load started')}
        onLoadEnd={() => console.log('[LitWebView] Load ended')}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url === 'about:blank') return true;
          // Only allow loading from our asset origin
          const allowed = request.url.startsWith(allowedPrefix);
          if (!allowed) {
            console.warn('[LitWebView] Blocked navigation to:', request.url);
          }
          return allowed;
        }}
        // Enable JavaScript
        javaScriptEnabled={true}
        // Disable user interaction
        scrollEnabled={false}
        // Security settings
        allowsInlineMediaPlayback={false}
        mediaPlaybackRequiresUserAction={true}
        // Performance
        androidLayerType="hardware"
        // Debug settings
        {...(debug && {
          style: styles.debugWebView
        })}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  hiddenContainer: {
    position: 'absolute',
    left: -10000,
    top: -10000,
    width: 1,
    height: 1,
    opacity: 0,
  },
  debugContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    borderTopWidth: 2,
    borderTopColor: '#4ade80',
    backgroundColor: '#1a1625',
  },
  debugWebView: {
    flex: 1,
    backgroundColor: 'transparent',
  }
});
