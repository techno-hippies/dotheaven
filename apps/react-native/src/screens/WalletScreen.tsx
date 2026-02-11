import React, { useContext } from 'react';
import {
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Path, SvgProps, Text as SvgText } from 'react-native-svg';
import { Copy, Fingerprint, Key, SignIn, Wallet } from 'phosphor-react-native';
import { MobileHeader } from '../components/MobileHeader';
import { useAuth } from '../providers/AuthProvider';
import { DrawerContext } from '../navigation/DrawerContext';
import { colors, spacing, fontSize, radii } from '../lib/theme';
import { Button } from '../ui';

// ── Coin icons ─────────────────────────────────────────────────────

const ICON_SIZE = 40;
const BADGE_SIZE = 18;

const EthereumIcon: React.FC<{ size?: number }> = ({ size = ICON_SIZE }) => (
  <Svg viewBox="0 0 32 32" width={size} height={size}>
    <G fill="none" fillRule="evenodd">
      <Circle cx="16" cy="16" r="16" fill="#627EEA" />
      <G fill="#FFF" fillRule="nonzero">
        <Path fillOpacity={0.602} d="M16.498 4v8.87l7.497 3.35z" />
        <Path d="M16.498 4L9 16.22l7.498-3.35z" />
        <Path fillOpacity={0.602} d="M16.498 21.968v6.027L24 17.616z" />
        <Path d="M16.498 27.995v-6.028L9 17.616z" />
        <Path fillOpacity={0.2} d="M16.498 20.573l7.497-4.353-7.497-3.348z" />
        <Path fillOpacity={0.602} d="M9 16.22l7.498 4.353v-7.701z" />
      </G>
    </G>
  </Svg>
);

const MegaETHIcon: React.FC<{ size?: number }> = ({ size = BADGE_SIZE }) => (
  <Svg viewBox="0 0 100 100" width={size} height={size}>
    <Circle cx="50" cy="50" r="50" fill="#000" />
    <Circle cx="50" cy="50" r="45" fill="transparent" stroke="#fff" strokeWidth="3" />
    <SvgText
      x="50"
      y="65"
      fontFamily="Arial, sans-serif"
      fontSize="48"
      fontWeight="bold"
      fill="#fff"
      textAnchor="middle"
    >
      M
    </SvgText>
    <Circle cx="40" cy="75" r="3" fill="#fff" />
    <Circle cx="60" cy="75" r="3" fill="#fff" />
  </Svg>
);

// PNG coin images
const filecoinImg = require('../../assets/coins/filecoin.png');
const usdfcImg = require('../../assets/coins/usdfc.png');
const usdmImg = require('../../assets/coins/usdm.png');

// ── Asset config ───────────────────────────────────────────────────

interface AssetConfig {
  id: string;
  name: string;
  symbol: string;
  balance: string;
  balanceUSD: string;
  icon: 'eth' | 'filecoin' | 'usdfc' | 'usdm';
  chainBadge: 'eth' | 'filecoin' | 'megaeth';
}

const ASSETS: AssetConfig[] = [
  {
    id: 'fil-mainnet',
    name: 'FIL',
    symbol: 'Filecoin',
    balance: '0.0000',
    balanceUSD: '$0.00',
    icon: 'filecoin',
    chainBadge: 'filecoin',
  },
  {
    id: 'usdfc-filecoin',
    name: 'USDFC',
    symbol: 'Filecoin',
    balance: '0.0000',
    balanceUSD: '$0.00',
    icon: 'usdfc',
    chainBadge: 'filecoin',
  },
  {
    id: 'eth-sepolia',
    name: 'ETH',
    symbol: 'Ethereum',
    balance: '0.0000',
    balanceUSD: '$0.00',
    icon: 'eth',
    chainBadge: 'eth',
  },
  {
    id: 'eth-megaeth',
    name: 'ETH',
    symbol: 'MegaETH',
    balance: '0.0000',
    balanceUSD: '$0.00',
    icon: 'eth',
    chainBadge: 'megaeth',
  },
  {
    id: 'usdm-megaeth',
    name: 'USDM',
    symbol: 'MegaETH',
    balance: '0.0000',
    balanceUSD: '$0.00',
    icon: 'usdm',
    chainBadge: 'megaeth',
  },
];

// ── Icon renderers ─────────────────────────────────────────────────

function renderIcon(type: AssetConfig['icon'], size: number) {
  switch (type) {
    case 'eth':
      return <EthereumIcon size={size} />;
    case 'filecoin':
      return <Image source={filecoinImg} style={{ width: size, height: size, borderRadius: size / 2 }} />;
    case 'usdfc':
      return <Image source={usdfcImg} style={{ width: size, height: size, borderRadius: size / 2 }} />;
    case 'usdm':
      return <Image source={usdmImg} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
}

function renderBadge(type: AssetConfig['chainBadge']) {
  switch (type) {
    case 'eth':
      return <EthereumIcon size={BADGE_SIZE} />;
    case 'filecoin':
      return <Image source={filecoinImg} style={{ width: BADGE_SIZE, height: BADGE_SIZE, borderRadius: BADGE_SIZE / 2 }} />;
    case 'megaeth':
      return <MegaETHIcon size={BADGE_SIZE} />;
  }
}

// ── Asset row ──────────────────────────────────────────────────────

const AssetRow: React.FC<{ asset: AssetConfig }> = ({ asset }) => (
  <View style={styles.assetRow}>
    <View style={styles.iconContainer}>
      {renderIcon(asset.icon, ICON_SIZE)}
      <View style={styles.badgeContainer}>
        {renderBadge(asset.chainBadge)}
      </View>
    </View>
    <View style={styles.assetInfo}>
      <Text style={styles.assetName}>{asset.name}</Text>
      <Text style={styles.assetSymbol}>{asset.symbol}</Text>
    </View>
    <View style={styles.assetBalance}>
      <Text style={styles.balanceUsd}>{asset.balanceUSD}</Text>
      <Text style={styles.balanceAmount}>{asset.balance}</Text>
    </View>
  </View>
);

// ── Main component ─────────────────────────────────────────────────

export const WalletScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, pkpInfo, register, authenticate } = useAuth();
  const drawer = useContext(DrawerContext);

  const address = pkpInfo?.ethAddress ?? '';
  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : '';

  const handleCopyAddress = () => {
    if (address) {
      Alert.alert('Wallet Address', address);
    }
  };

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <MobileHeader title="Wallet" isAuthenticated={false} onAvatarPress={drawer.open} />
        <View style={styles.centered}>
          <View style={styles.welcomeIcon}>
            <Wallet size={48} color={colors.textMuted} weight="light" />
          </View>
          <Text style={styles.welcomeTitle}>Wallet</Text>
          <Text style={styles.welcomeSubtitle}>
            Sign in to view your on-chain assets and transaction history.
          </Text>
          <View style={styles.authButtons}>
            <Button
              variant="default"
              size="md"
              fullWidth
              onPress={register}
              leftIcon={<Key size={18} color={colors.white} weight="fill" />}
            >
              Sign Up
            </Button>
            <Button
              variant="secondary"
              size="md"
              fullWidth
              onPress={authenticate}
              leftIcon={<SignIn size={18} color={colors.textPrimary} />}
            >
              I have an account
            </Button>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MobileHeader title="Wallet" isAuthenticated onAvatarPress={drawer.open} />

      <FlatList
        data={ASSETS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AssetRow asset={item} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* Balance section */}
            <View style={styles.balanceSection}>
              <Text style={styles.balanceLabel}>Total Balance</Text>
              <Text style={styles.totalBalance}>$0.00</Text>

              {/* Address row */}
              <TouchableOpacity
                style={styles.addressRow}
                onPress={handleCopyAddress}
                activeOpacity={0.7}
              >
                <Text style={styles.addressText}>{shortAddress}</Text>
                <Copy size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Assets header */}
            <Text style={styles.assetsTitle}>Assets</Text>
          </>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  welcomeIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  welcomeTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  authButtons: {
    width: '100%',
    gap: 12,
  },
  listContent: {
    paddingBottom: 140,
  },
  balanceSection: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 4,
  },
  balanceLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  totalBalance: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.full,
  },
  addressText: {
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
    color: colors.textMuted,
  },
  assetsTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  iconContainer: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    position: 'relative',
  },
  badgeContainer: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.bgPage,
    overflow: 'hidden',
  },
  assetInfo: {
    flex: 1,
    gap: 2,
  },
  assetName: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  assetSymbol: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  assetBalance: {
    alignItems: 'flex-end',
    gap: 2,
  },
  balanceUsd: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  balanceAmount: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
});
