import React from 'react';
import { View } from 'react-native';
import type { Preview } from '@storybook/react';

const preview: Preview = {
  decorators: [
    (Story) => (
      <View style={{ flex: 1, backgroundColor: '#1a1625', padding: 16, minHeight: '100%' }}>
        <Story />
      </View>
    ),
  ],
};

export default preview;
