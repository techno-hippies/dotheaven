/**
 * CommunityFilterSheet — bottom sheet filter for community member discovery.
 * Matches the web CommunityFilterDialog UI with gender, language, and toggle filters.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { CaretDown, Check } from 'phosphor-react-native';
import { colors, fontSize, radii } from '../lib/theme';
import { BottomSheet, Button } from '../ui';

// ── Filter types ──────────────────────────────────────────────────

export interface CommunityFilters {
  gender?: string;
  nativeLanguage?: string;
  learningLanguage?: string;
  sameCity?: boolean;
  verified?: boolean;
}

export function countActiveFilters(filters: CommunityFilters): number {
  let count = 0;
  if (filters.gender) count++;
  if (filters.nativeLanguage) count++;
  if (filters.learningLanguage) count++;
  if (filters.sameCity) count++;
  if (filters.verified) count++;
  return count;
}

// ── Option data ───────────────────────────────────────────────────

interface PickerOption {
  value: string;
  label: string;
}

const GENDER_OPTIONS: PickerOption[] = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'non-binary', label: 'Non-binary' },
  { value: 'trans-woman', label: 'Trans woman' },
  { value: 'trans-man', label: 'Trans man' },
  { value: 'intersex', label: 'Intersex' },
  { value: 'other', label: 'Other' },
];

const LANGUAGE_OPTIONS: PickerOption[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Mandarin Chinese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
  { value: 'bn', label: 'Bengali' },
  { value: 'pa', label: 'Punjabi' },
  { value: 'jv', label: 'Javanese' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'tr', label: 'Turkish' },
  { value: 'pl', label: 'Polish' },
  { value: 'nl', label: 'Dutch' },
  { value: 'sv', label: 'Swedish' },
  { value: 'no', label: 'Norwegian' },
  { value: 'da', label: 'Danish' },
  { value: 'fi', label: 'Finnish' },
  { value: 'cs', label: 'Czech' },
  { value: 'el', label: 'Greek' },
  { value: 'he', label: 'Hebrew' },
  { value: 'th', label: 'Thai' },
  { value: 'id', label: 'Indonesian' },
  { value: 'ms', label: 'Malay' },
  { value: 'tl', label: 'Tagalog' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'ro', label: 'Romanian' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'fa', label: 'Persian (Farsi)' },
  { value: 'ur', label: 'Urdu' },
  { value: 'sw', label: 'Swahili' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' },
  { value: 'ca', label: 'Catalan' },
];

// ── Inline option picker ──────────────────────────────────────────

interface OptionPickerProps {
  label: string;
  options: PickerOption[];
  value?: string;
  onChange: (value: string | undefined) => void;
}

/**
 * OptionPicker — a label with the currently selected value displayed as a tappable row.
 * Tapping expands an inline list of options. "Any" is always the first option.
 */
const OptionPicker: React.FC<OptionPickerProps> = ({ label, options, value, onChange }) => {
  const [expanded, setExpanded] = useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? 'Any';

  return (
    <View style={pickerStyles.container}>
      <Pressable
        style={pickerStyles.header}
        onPress={() => setExpanded((e) => !e)}
      >
        <Text style={pickerStyles.label}>{label}</Text>
        <View style={pickerStyles.valueRow}>
          <Text style={[pickerStyles.valueText, value && pickerStyles.valueActive]}>
            {selectedLabel}
          </Text>
          <CaretDown
            size={14}
            color={colors.textMuted}
            style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
          />
        </View>
      </Pressable>

      {expanded && (
        <View style={pickerStyles.optionsList}>
          {/* "Any" option */}
          <Pressable
            style={[pickerStyles.option, !value && pickerStyles.optionSelected]}
            onPress={() => { onChange(undefined); setExpanded(false); }}
          >
            <Text style={[pickerStyles.optionText, !value && pickerStyles.optionTextSelected]}>
              Any
            </Text>
            {!value && <Check size={16} color={colors.accentBlue} />}
          </Pressable>
          {options.map((opt) => (
            <Pressable
              key={opt.value}
              style={[pickerStyles.option, value === opt.value && pickerStyles.optionSelected]}
              onPress={() => { onChange(opt.value); setExpanded(false); }}
            >
              <Text style={[pickerStyles.optionText, value === opt.value && pickerStyles.optionTextSelected]}>
                {opt.label}
              </Text>
              {value === opt.value && <Check size={16} color={colors.accentBlue} />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
};

const pickerStyles = StyleSheet.create({
  container: {
    gap: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  label: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  valueText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  valueActive: {
    color: colors.accentBlue,
  },
  optionsList: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    marginBottom: 8,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  optionSelected: {
    backgroundColor: `${colors.accentBlue}15`,
  },
  optionText: {
    fontSize: fontSize.base,
    color: colors.textPrimary,
  },
  optionTextSelected: {
    color: colors.accentBlue,
    fontWeight: '600',
  },
});

// ── Toggle row ────────────────────────────────────────────────────

interface ToggleRowProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, value, onChange }) => (
  <View style={toggleStyles.row}>
    <Text style={toggleStyles.label}>{label}</Text>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: colors.bgElevated, true: colors.accentBlue }}
      thumbColor={colors.white}
    />
  </View>
);

const toggleStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  label: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});

// ── Main component ────────────────────────────────────────────────

interface CommunityFilterSheetProps {
  open: boolean;
  onClose: () => void;
  filters: CommunityFilters;
  onFiltersChange: (filters: CommunityFilters) => void;
}

export const CommunityFilterSheet: React.FC<CommunityFilterSheetProps> = ({
  open,
  onClose,
  filters,
  onFiltersChange,
}) => {
  const [local, setLocal] = useState<CommunityFilters>(filters);

  // Sync local state when sheet opens
  useEffect(() => {
    if (open) setLocal(filters);
  }, [open, filters]);

  const hasFilters =
    !!(local.gender || local.nativeLanguage || local.learningLanguage || local.sameCity || local.verified);

  const handleApply = useCallback(() => {
    onFiltersChange(local);
    onClose();
  }, [local, onFiltersChange, onClose]);

  const handleReset = useCallback(() => {
    const empty: CommunityFilters = {};
    setLocal(empty);
    onFiltersChange(empty);
    onClose();
  }, [onFiltersChange, onClose]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      footer={
        <View style={footerStyles.container}>
          {hasFilters && (
            <Button
              variant="secondary"
              size="lg"
              onPress={handleReset}
              style={footerStyles.button}
            >
              Reset
            </Button>
          )}
          <Button
            variant="default"
            size="lg"
            onPress={handleApply}
            style={footerStyles.button}
          >
            Apply
          </Button>
        </View>
      }
    >
      <Text style={sheetStyles.title}>Filter Members</Text>

      <OptionPicker
        label="Gender"
        options={GENDER_OPTIONS}
        value={local.gender}
        onChange={(v) => setLocal((f) => ({ ...f, gender: v }))}
      />

      <View style={sheetStyles.separator} />

      <OptionPicker
        label="Native Language"
        options={LANGUAGE_OPTIONS}
        value={local.nativeLanguage}
        onChange={(v) => setLocal((f) => ({ ...f, nativeLanguage: v }))}
      />

      <View style={sheetStyles.separator} />

      <OptionPicker
        label="Learning Language"
        options={LANGUAGE_OPTIONS}
        value={local.learningLanguage}
        onChange={(v) => setLocal((f) => ({ ...f, learningLanguage: v }))}
      />

      <View style={sheetStyles.separator} />

      <ToggleRow
        label="Same City"
        value={local.sameCity ?? false}
        onChange={(v) => setLocal((f) => ({ ...f, sameCity: v || undefined }))}
      />

      <View style={sheetStyles.separator} />

      <ToggleRow
        label="Verified"
        value={local.verified ?? false}
        onChange={(v) => setLocal((f) => ({ ...f, verified: v || undefined }))}
      />
    </BottomSheet>
  );
};

const sheetStyles = StyleSheet.create({
  title: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
});

const footerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
  },
});
