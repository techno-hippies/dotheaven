import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';
import { BottomTabBar, type TabItem } from './BottomTabBar';

const defaultTabs: TabItem[] = [
  { key: 'Home', label: 'Home', icon: 'home' },
  { key: 'Community', label: 'Community', icon: 'community' },
  { key: 'Music', label: 'Music', icon: 'music' },
  { key: 'Chat', label: 'Chat', icon: 'chat' },
  { key: 'Schedule', label: 'Schedule', icon: 'schedule' },
  { key: 'Wallet', label: 'Wallet', icon: 'wallet' },
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
    activeTab: 'Home',
    onTabPress: (key: string) => console.log('tab pressed:', key),
  },
};

export default meta;
type Story = StoryObj<typeof BottomTabBar>;

export const HomeActive: Story = {};

export const CommunityActive: Story = {
  args: { activeTab: 'Community' },
};

export const MusicActive: Story = {
  args: { activeTab: 'Music' },
};

export const ChatActive: Story = {
  args: { activeTab: 'Chat' },
};

export const ScheduleActive: Story = {
  args: { activeTab: 'Schedule' },
};

export const WalletActive: Story = {
  args: { activeTab: 'Wallet' },
};
