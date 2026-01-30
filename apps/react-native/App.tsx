import React from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { LitProvider } from './src/providers/LitProvider';
import { AuthProvider } from './src/providers/AuthProvider';
import { PlayerProvider } from './src/providers/PlayerProvider';
import { TabNavigator } from './src/navigation/TabNavigator';
import { MiniPlayer } from './src/components/MiniPlayer';

const DarkTheme = {
  dark: true,
  colors: {
    primary: '#8fb8e0',
    background: '#1a1625',
    card: '#1f1b2e',
    text: '#f0f0f5',
    border: '#2d2645',
    notification: '#8fb8e0',
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
    <LitProvider>
      <AuthProvider>
        <PlayerProvider>
          <NavigationContainer theme={DarkTheme}>
            <View style={{ flex: 1 }}>
              <TabNavigator />
              <MiniPlayer />
            </View>
          </NavigationContainer>
          <StatusBar style="light" />
        </PlayerProvider>
      </AuthProvider>
    </LitProvider>
  );
}
