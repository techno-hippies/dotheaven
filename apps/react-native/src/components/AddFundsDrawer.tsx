import React, { useState, useMemo } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { colors, fontSize } from '../lib/theme';

interface AddFundsDrawerProps {
  open: boolean;
  onClose: () => void;
  currentBalance: string;
  /** Current days remaining — used with balance to compute estimate for new deposits */
  daysRemaining: number | null;
  /** Current balance as a number (for computing ratio) */
  balanceNum: number;
  /** Monthly storage cost (e.g. "$0.12") */
  monthlyCost?: string;
  loading: boolean;
  onDeposit: (amount: string) => void;
}

interface StorageBreakdownProps {
  balance: string;
  monthlyCost?: string;
  daysRemaining: number | null;
}

const StorageBreakdown: React.FC<StorageBreakdownProps> = ({
  balance,
  monthlyCost,
  daysRemaining,
}) => {
  const daysColor = useMemo(() => {
    if (daysRemaining == null) return colors.textPrimary;
    if (daysRemaining < 7) return '#fbbf24'; // amber-400
    if (daysRemaining > 30) return '#4ade80'; // green-400
    return colors.textPrimary;
  }, [daysRemaining]);

  const formatDays = () => {
    if (daysRemaining == null) return '—';
    return daysRemaining.toLocaleString();
  };

  return (
    <View style={styles.breakdownGrid}>
      <View style={styles.breakdownCard}>
        <Text style={styles.breakdownValue}>{balance}</Text>
        <Text style={styles.breakdownLabel}>Balance</Text>
      </View>
      <View style={styles.breakdownCard}>
        <Text style={styles.breakdownValue}>{monthlyCost || '—'}</Text>
        <Text style={styles.breakdownLabel}>Monthly</Text>
      </View>
      <View style={styles.breakdownCard}>
        <Text style={[styles.breakdownValue, { color: daysColor }]}>
          {formatDays()}
        </Text>
        <Text style={styles.breakdownLabel}>Days Left</Text>
      </View>
    </View>
  );
};

export const AddFundsDrawer: React.FC<AddFundsDrawerProps> = ({
  open,
  onClose,
  currentBalance,
  daysRemaining,
  monthlyCost,
  loading,
  onDeposit,
}) => {
  const [amount, setAmount] = useState('5.00');

  const handleSubmit = () => {
    const val = amount.trim();
    if (!val || parseFloat(val) <= 0) return;
    onDeposit(val);
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      footer={
        <Button
          variant="default"
          size="lg"
          onPress={handleSubmit}
          loading={loading}
          style={styles.depositButton}
        >
          Deposit
        </Button>
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Add Funds</Text>
        <Text style={styles.description}>
          Deposit USDFC for cross-device encrypted storage.
        </Text>
      </View>

      {/* Storage Breakdown */}
      <StorageBreakdown
        balance={currentBalance}
        monthlyCost={monthlyCost}
        daysRemaining={daysRemaining}
      />

      {/* Amount Input */}
      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>Amount</Text>
        <View style={styles.inputWrapper}>
          <Text style={styles.dollarSign}>$</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
        </View>
        <Text style={styles.balanceText}>Balance: {currentBalance}</Text>
      </View>

    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingTop: 16,
    paddingBottom: 20,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  description: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  breakdownGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  breakdownCard: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: colors.bgElevated,
    padding: 14,
  },
  breakdownValue: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  breakdownLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 4,
  },
  inputSection: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: fontSize.lg,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 10,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.bgPage,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    paddingHorizontal: 20,
    gap: 6,
  },
  dollarSign: {
    fontSize: fontSize.xl,
    color: colors.textMuted,
  },
  input: {
    flex: 1,
    fontSize: fontSize.xl,
    color: colors.textPrimary,
    padding: 0,
    margin: 0,
  },
  balanceText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    marginTop: 8,
  },
  depositButton: {
    width: '100%',
  },
});
