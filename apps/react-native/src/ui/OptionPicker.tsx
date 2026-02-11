import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check } from 'phosphor-react-native';
import { colors, fontSize } from '../lib/theme';
import { BottomSheet } from './BottomSheet';

export interface OptionPickerOption {
  value: number;
  label: string;
}

interface OptionPickerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  options: OptionPickerOption[];
  selected?: number;
  onSelect: (value: number) => void;
  /** Show a "None" option at the top to clear the value (sets value to 0) */
  allowClear?: boolean;
}

export const OptionPicker: React.FC<OptionPickerProps> = ({
  open,
  onClose,
  title,
  options,
  selected,
  onSelect,
  allowClear = true,
}) => {
  const handleSelect = (value: number) => {
    onSelect(value);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={styles.title}>{title}</Text>

      {allowClear && (
        <TouchableOpacity
          style={styles.option}
          onPress={() => handleSelect(0)}
          activeOpacity={0.7}
        >
          <Text style={[styles.optionText, (!selected || selected === 0) && styles.optionTextActive]}>
            Not set
          </Text>
          {(!selected || selected === 0) ? (
            <Check size={20} color={colors.accentBlue} weight="bold" />
          ) : null}
        </TouchableOpacity>
      )}

      {options.map((opt) => {
        const isActive = selected === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={styles.option}
            onPress={() => handleSelect(opt.value)}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
              {opt.label}
            </Text>
            {isActive ? (
              <Check size={20} color={colors.accentBlue} weight="bold" />
            ) : null}
          </TouchableOpacity>
        );
      })}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  optionText: {
    fontSize: fontSize.base,
    color: colors.textPrimary,
  },
  optionTextActive: {
    color: colors.accentBlue,
    fontWeight: '600',
  },
});
