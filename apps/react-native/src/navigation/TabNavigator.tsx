import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { FeedScreen } from '../screens/FeedScreen';
import { CommunityScreen } from '../screens/CommunityScreen';
import { MusicScreen } from '../screens/MusicScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { ScheduleScreen } from '../screens/ScheduleScreen';
import { WalletScreen } from '../screens/WalletScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { BottomTabBar, type TabItem } from '../components/BottomTabBar';
import { MiniPlayer } from '../components/MiniPlayer';
import { SideMenuDrawer } from '../components/SideMenuDrawer';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { useAuth } from '../providers/AuthProvider';

const Tab = createBottomTabNavigator();

const TABS: TabItem[] = [
  { key: 'Home', label: 'Home', icon: 'home' },
  { key: 'Community', label: 'Community', icon: 'community' },
  { key: 'Music', label: 'Music', icon: 'music' },
  { key: 'Chat', label: 'Chat', icon: 'chat' },
  { key: 'Schedule', label: 'Schedule', icon: 'schedule' },
  { key: 'Wallet', label: 'Wallet', icon: 'wallet' },
];

// Shared context so FeedScreen can open the drawer
export const DrawerContext = React.createContext<{ open: () => void }>({ open: () => {} });

export const TabNavigator: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { isAuthenticated, isNewUser, pkpInfo, logout, register, authenticate, completeOnboarding } = useAuth();

  const openDrawer = useCallback(() => setDrawerOpen(true), []);

  const shortAddress = pkpInfo?.ethAddress
    ? `${pkpInfo.ethAddress.slice(0, 6)}...${pkpInfo.ethAddress.slice(-4)}`
    : pkpInfo?.pubkey
      ? `${pkpInfo.pubkey.slice(0, 10)}...${pkpInfo.pubkey.slice(-8)}`
      : undefined;

  return (
    <DrawerContext.Provider value={{ open: openDrawer }}>
      <View style={styles.root}>
        <Tab.Navigator
          screenOptions={{ headerShown: false }}
          tabBar={({ state, descriptors, navigation }) => {
            const focusedRoute = state.routes[state.index];
            const focusedOptions = descriptors[focusedRoute.key]?.options;
            const tabBarStyle = (focusedOptions as any)?.tabBarStyle;
            if (tabBarStyle?.display === 'none') return null;

            return (
              <>
                <MiniPlayer />
                <BottomTabBar
                  tabs={TABS}
                  activeTab={focusedRoute.name}
                  onTabPress={(key) => navigation.navigate(key)}
                />
              </>
            );
          }}
        >
          <Tab.Screen name="Home" component={FeedScreen} />
          <Tab.Screen name="Community" component={CommunityScreen} />
          <Tab.Screen name="Music" component={MusicScreen} />
          <Tab.Screen name="Chat" component={ChatScreen} />
          <Tab.Screen name="Schedule" component={ScheduleScreen} />
          <Tab.Screen name="Wallet" component={WalletScreen} />
        </Tab.Navigator>

        {/* Drawer renders above everything */}
        <SideMenuDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          isAuthenticated={isAuthenticated}
          displayName={shortAddress}
          onLogout={logout}
          onSignUp={register}
          onSignIn={authenticate}
          onSettings={() => setSettingsOpen(true)}
        />

        {/* Settings overlay */}
        {settingsOpen && (
          <View style={StyleSheet.absoluteFill}>
            <SettingsScreen onBack={() => setSettingsOpen(false)} />
          </View>
        )}

        {/* Onboarding overlay — shown after registration */}
        {isNewUser && (
          <View style={StyleSheet.absoluteFill}>
            <OnboardingScreen onComplete={completeOnboarding} onLogout={logout} />
          </View>
        )}
      </View>
    </DrawerContext.Provider>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
