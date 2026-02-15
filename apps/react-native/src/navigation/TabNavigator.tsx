import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedScreen } from '../screens/FeedScreen';
import { CommunityScreen } from '../screens/CommunityScreen';
import { MusicScreen } from '../screens/MusicScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { ScheduleScreen } from '../screens/ScheduleScreen';
import { WalletScreen } from '../screens/WalletScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { PlayerScreen } from '../screens/PlayerScreen';
import { PublicProfileScreen } from '../screens/PublicProfileScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RoomScreen } from '../screens/RoomScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { PlaylistScreen } from '../screens/PlaylistScreen';
import { ArtistScreen } from '../screens/ArtistScreen';
import { ComposeScreen } from '../screens/ComposeScreen';
import { BottomTabBar, type TabItem } from '../components/BottomTabBar';
import { MiniPlayer } from '../components/MiniPlayer';
import { SideMenuDrawer } from '../components/SideMenuDrawer';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { useAuth } from '../providers/AuthProvider';
import { DrawerContext } from './DrawerContext';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../lib/theme';

export type RootStackParamList = {
  Tabs: undefined;
  Player: undefined;
  Profile: undefined;
  EditProfile: undefined;
  PublicProfile: { address: string };
  Search: undefined;
  Playlist: { playlistId: string };
  Artist: { mbid?: string; artistName?: string };
  Compose: undefined;
  Room: {
    mode: 'create' | 'join';
    roomId?: string;
    visibility?: 'open' | 'private';
    ai_enabled?: boolean;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const TABS: TabItem[] = [
  { key: 'Home', label: 'Home', icon: 'home' },
  { key: 'Community', label: 'Community', icon: 'community' },
  { key: 'Music', label: 'Music', icon: 'music' },
  { key: 'Chat', label: 'Chat', icon: 'chat' },
  { key: 'Schedule', label: 'Schedule', icon: 'schedule' },
  { key: 'Wallet', label: 'Wallet', icon: 'wallet' },
];

const TabsNavigator: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { isAuthenticated, isNewUser, logout, register, authenticate, completeOnboarding } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const openDrawer = useCallback(() => setDrawerOpen(true), []);

  const handleMiniPlayerPress = useCallback(() => {
    navigation.navigate('Player');
  }, [navigation]);

  return (
    <DrawerContext.Provider value={{ open: openDrawer }}>
      <View style={styles.root}>
        <Tab.Navigator
          screenOptions={{ headerShown: false }}
          tabBar={({ state, descriptors, navigation }) => {
            const focusedRoute = state.routes[state.index];
            const focusedOptions = descriptors[focusedRoute.key]?.options;
            const tabBarStyle = (focusedOptions as any)?.tabBarStyle;
            if (tabBarStyle?.display === 'none') {
              // Hide the bottom tab bar, but keep the mini player visible in chat detail.
              return (
                <View style={{ backgroundColor: colors.bgSurface, paddingBottom: insets.bottom }}>
                  <TouchableOpacity activeOpacity={0.9} onPress={handleMiniPlayerPress}>
                    <MiniPlayer />
                  </TouchableOpacity>
                </View>
              );
            }

            return (
              <>
                <TouchableOpacity activeOpacity={0.9} onPress={handleMiniPlayerPress}>
                  <MiniPlayer />
                </TouchableOpacity>
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
          onLogout={logout}
          onSignUp={register}
          onSignIn={authenticate}
          onProfile={() => navigation.navigate('Profile')}
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

export const TabNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabsNavigator} />
      <Stack.Screen
        name="Player"
        component={PlayerScreen}
        options={{
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="Compose"
        component={ComposeScreen}
        options={{
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="PublicProfile"
        component={PublicProfileScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Search"
        component={SearchScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Playlist"
        component={PlaylistScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Artist"
        component={ArtistScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Room"
        component={RoomScreen}
        options={{
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
        }}
      />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
