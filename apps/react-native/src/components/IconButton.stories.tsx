import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';
import { Play, Heart, PaperPlaneTilt, DotsThree, X } from 'phosphor-react-native';
import { IconButton } from './IconButton';

const meta: Meta<typeof IconButton> = {
  title: 'Primitives/IconButton',
  component: IconButton,
  decorators: [
    (Story) => (
      <View style={{ padding: 20, gap: 12, flexDirection: 'row', alignItems: 'center' }}>
        <Story />
      </View>
    ),
  ],
  args: {
    accessibilityLabel: 'Action',
    onPress: () => console.log('pressed'),
  },
};

export default meta;
type Story = StoryObj<typeof IconButton>;

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: <Heart size={20} color="#b8b8d0" />,
    accessibilityLabel: 'Like',
  },
};

export const Soft: Story = {
  args: {
    variant: 'soft',
    children: <DotsThree size={20} color="#b8b8d0" />,
    accessibilityLabel: 'More',
  },
};

export const Default: Story = {
  args: {
    variant: 'default',
    children: <X size={20} color="#f0f0f5" />,
    accessibilityLabel: 'Close',
  },
};

export const PlayButton: Story = {
  args: {
    variant: 'play',
    size: 'lg',
    children: <Play size={24} color="#000000" weight="fill" />,
    accessibilityLabel: 'Play',
  },
};

export const SendButton: Story = {
  args: {
    variant: 'send',
    size: 'xl',
    children: <PaperPlaneTilt size={20} color="#ffffff" weight="fill" />,
    accessibilityLabel: 'Send',
  },
};

export const SendDisabled: Story = {
  args: {
    variant: 'send',
    size: 'xl',
    disabled: true,
    children: <PaperPlaneTilt size={20} color="#7878a0" weight="fill" />,
    accessibilityLabel: 'Send',
  },
};

export const AllVariants: Story = {
  render: () => (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <IconButton variant="ghost" accessibilityLabel="Ghost">
        <Heart size={20} color="#b8b8d0" />
      </IconButton>
      <IconButton variant="soft" accessibilityLabel="Soft">
        <DotsThree size={20} color="#b8b8d0" />
      </IconButton>
      <IconButton variant="default" accessibilityLabel="Default">
        <X size={20} color="#f0f0f5" />
      </IconButton>
      <IconButton variant="play" size="lg" accessibilityLabel="Play">
        <Play size={24} color="#000000" weight="fill" />
      </IconButton>
      <IconButton variant="send" size="xl" accessibilityLabel="Send">
        <PaperPlaneTilt size={20} color="#ffffff" weight="fill" />
      </IconButton>
    </View>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <IconButton variant="default" size="md" accessibilityLabel="md">
        <X size={20} color="#f0f0f5" />
      </IconButton>
      <IconButton variant="default" size="lg" accessibilityLabel="lg">
        <X size={24} color="#f0f0f5" />
      </IconButton>
      <IconButton variant="default" size="xl" accessibilityLabel="xl">
        <X size={20} color="#f0f0f5" />
      </IconButton>
    </View>
  ),
};
