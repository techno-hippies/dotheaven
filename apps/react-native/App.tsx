import React from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LitProvider } from './src/providers/LitProvider';
import { AuthProvider } from './src/providers/AuthProvider';
import { PlayerProvider } from './src/providers/PlayerProvider';
import { XMTPProvider } from './src/providers/XMTPProvider';
import { TabNavigator } from './src/navigation/TabNavigator';
import { colors } from './src/lib/theme';

const DarkTheme = {
  dark: true,
  colors: {
    primary: colors.accentBlue,
    background: colors.bgPage,
    card: colors.bgSurface,
    text: colors.textPrimary,
    border: colors.borderSubtle,
    notification: colors.accentBlue,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' as const },
    medium: { fontFamily: 'System', fontWeight: '500' as const },
    bold: { fontFamily: 'System', fontWeight: '700' as const },
    heavy: { fontFamily: 'System', fontWeight: '900' as const },
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <LitProvider debug>
        <AuthProvider>
          <XMTPProvider>
            <PlayerProvider>
              <NavigationContainer theme={DarkTheme}>
                <View style={{ flex: 1, backgroundColor: colors.bgPage }}>
                  <TabNavigator />
                </View>
              </NavigationContainer>
              <StatusBar style="light" />
            </PlayerProvider>
          </XMTPProvider>
        </AuthProvider>
      </LitProvider>
    </SafeAreaProvider>
  );
}
