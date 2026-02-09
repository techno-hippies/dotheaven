import React from 'react';
import { Wallet } from 'phosphor-react-native';
import { PlaceholderScreen } from './PlaceholderScreen';

export const WalletScreen: React.FC = () => (
  <PlaceholderScreen
    title="Wallet"
    subtitle="On-chain assets and transaction history"
    IconComponent={Wallet}
  />
);
