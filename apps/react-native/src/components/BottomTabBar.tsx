import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { House, UsersThree, MusicNote, ChatCircle, CalendarBlank, Wallet } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../lib/theme';

export interface TabItem {
  key: string;
  label: string;
  icon: 'home' | 'community' | 'music' | 'chat' | 'schedule' | 'wallet';
}

interface BottomTabBarProps {
  tabs: TabItem[];
  activeTab: string;
  onTabPress: (key: string) => void;
}

const ICON_MAP = {
  home: House,
  community: UsersThree,
  music: MusicNote,
  chat: ChatCircle,
  schedule: CalendarBlank,
  wallet: Wallet,
} as const;

export const BottomTabBar: React.FC<BottomTabBarProps> = ({ tabs, activeTab, onTabPress }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        const Icon = ICON_MAP[tab.icon];
        const color = isActive ? colors.textPrimary : colors.textMuted;
        const weight = isActive ? 'fill' : 'regular';

        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.7}
          >
            <View style={styles.iconWrap}>
              <Icon size={24} color={color} weight={weight} />
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: 8,
    paddingHorizontal: 2,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  iconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
