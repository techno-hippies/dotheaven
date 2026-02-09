import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fontSize as fs } from '../lib/theme';

export interface Tab {
  key: string;
  label: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabPress: (key: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({ tabs, activeTab, onTabPress }) => (
  <View style={styles.tabRow}>
    {tabs.map((tab) => {
      const isActive = tab.key === activeTab;
      return (
        <TouchableOpacity
          key={tab.key}
          style={styles.tabButton}
          onPress={() => onTabPress(tab.key)}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
            {tab.label}
          </Text>
          {isActive && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    position: 'relative',
    paddingHorizontal: 8,
  },
  tabText: {
    fontSize: fs.base,
    fontWeight: '500',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.textPrimary,
  },
  tabIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: colors.accentBlue,
  },
});
