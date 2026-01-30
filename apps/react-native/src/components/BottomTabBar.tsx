import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { House, MagnifyingGlass, MusicNotes, ChatCircle, User } from 'phosphor-react-native';

export interface TabItem {
  key: string;
  label: string;
  icon: 'home' | 'search' | 'music' | 'messages' | 'profile';
}

interface BottomTabBarProps {
  tabs: TabItem[];
  activeTab: string;
  onTabPress: (key: string) => void;
}

const ICON_MAP = {
  home: House,
  search: MagnifyingGlass,
  music: MusicNotes,
  messages: ChatCircle,
  profile: User,
} as const;

export const BottomTabBar: React.FC<BottomTabBarProps> = ({ tabs, activeTab, onTabPress }) => {
  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        const Icon = ICON_MAP[tab.icon];
        const color = isActive ? '#8fb8e0' : '#7878a0';
        const weight = isActive ? 'fill' : 'regular';

        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.7}
          >
            <Icon size={24} color={color} weight={weight} />
            <Text style={[styles.label, { color }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#1f1b2e',
    borderTopWidth: 1,
    borderTopColor: '#2d2645',
    paddingBottom: 8,
    paddingTop: 8,
    height: 60,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
  },
});
