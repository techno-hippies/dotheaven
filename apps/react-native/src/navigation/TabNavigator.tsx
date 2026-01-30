import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MusicScreen } from '../screens/MusicScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';
import { BottomTabBar, type TabItem } from '../components/BottomTabBar';

const Tab = createBottomTabNavigator();

const HomeScreen = () => <PlaceholderScreen title="Home" icon="home-outline" />;
const SearchScreen = () => <PlaceholderScreen title="Search" icon="search-outline" />;
const MessagesScreen = () => <PlaceholderScreen title="Messages" icon="chatbubble-outline" />;

const TABS: TabItem[] = [
  { key: 'Home', label: 'Home', icon: 'home' },
  { key: 'Search', label: 'Search', icon: 'search' },
  { key: 'Music', label: 'Music', icon: 'music' },
  { key: 'Messages', label: 'Messages', icon: 'messages' },
  { key: 'Profile', label: 'Profile', icon: 'profile' },
];

export const TabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <BottomTabBar
          tabs={TABS}
          activeTab={state.routes[state.index].name}
          onTabPress={(key) => navigation.navigate(key)}
        />
      )}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Music" component={MusicScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};
