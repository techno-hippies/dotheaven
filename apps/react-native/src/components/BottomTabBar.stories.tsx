import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';
import { BottomTabBar, type TabItem } from './BottomTabBar';

const defaultTabs: TabItem[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'search', label: 'Search', icon: 'search' },
  { key: 'music', label: 'Music', icon: 'music' },
  { key: 'messages', label: 'Messages', icon: 'messages' },
  { key: 'profile', label: 'Profile', icon: 'profile' },
];

const meta: Meta<typeof BottomTabBar> = {
  title: 'Components/BottomTabBar',
  component: BottomTabBar,
  decorators: [
    (Story) => (
      <View style={{ width: '100%', position: 'absolute', bottom: 0 }}>
        <Story />
      </View>
    ),
  ],
  args: {
    tabs: defaultTabs,
    activeTab: 'home',
    onTabPress: (key: string) => console.log('tab pressed:', key),
  },
};

export default meta;
type Story = StoryObj<typeof BottomTabBar>;

export const HomeActive: Story = {};

export const SearchActive: Story = {
  args: { activeTab: 'search' },
};

export const MusicActive: Story = {
  args: { activeTab: 'music' },
};

export const MessagesActive: Story = {
  args: { activeTab: 'messages' },
};

export const ProfileActive: Story = {
  args: { activeTab: 'profile' },
};
