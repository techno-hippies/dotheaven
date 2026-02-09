import React from 'react';
import { ChatCircle } from 'phosphor-react-native';
import { PlaceholderScreen } from './PlaceholderScreen';

export const ChatScreen: React.FC = () => (
  <PlaceholderScreen
    title="Chat"
    subtitle="Encrypted peer-to-peer messaging"
    IconComponent={ChatCircle}
  />
);
