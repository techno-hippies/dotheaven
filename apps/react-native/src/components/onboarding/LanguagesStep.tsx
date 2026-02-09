import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { colors, radii } from '../../lib/theme';
import { Button, ErrorBanner } from '../../ui';

export interface LanguageEntry {
  code: string;
  proficiency: number;
}

export interface LanguagesData {
  speaks: LanguageEntry[];
  learning: LanguageEntry[];
}

interface LanguagesStepProps {
  mode: 'speak' | 'learn';
  entries: LanguageEntry[];
  excludeCodes?: string[];
  onChange: (entries: LanguageEntry[]) => void;
  onContinue: () => void;
  onSkip?: () => void;
  submitting: boolean;
  error: string | null;
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ru', label: 'Russian' },
  { code: 'tr', label: 'Turkish' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'sv', label: 'Swedish' },
  { code: 'th', label: 'Thai' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'id', label: 'Indonesian' },
  { code: 'no', label: 'Norwegian' },
  { code: 'da', label: 'Danish' },
  { code: 'fi', label: 'Finnish' },
  { code: 'cs', label: 'Czech' },
  { code: 'el', label: 'Greek' },
  { code: 'he', label: 'Hebrew' },
  { code: 'ro', label: 'Romanian' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'ms', label: 'Malay' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'sw', label: 'Swahili' },
  { code: 'bn', label: 'Bengali' },
  { code: 'ta', label: 'Tamil' },
  { code: 'ur', label: 'Urdu' },
  { code: 'fa', label: 'Persian' },
  { code: 'ca', label: 'Catalan' },
];

const PROFICIENCY_LEVELS = [
  { value: 7, label: 'Native' },
  { value: 6, label: 'C2 — Proficient' },
  { value: 5, label: 'C1 — Advanced' },
  { value: 4, label: 'B2 — Upper Intermediate' },
  { value: 3, label: 'B1 — Intermediate' },
  { value: 2, label: 'A2 — Elementary' },
  { value: 1, label: 'A1 — Beginner' },
];

const SHORT_LABELS: Record<number, string> = {
  7: 'Native',
  6: 'C2',
  5: 'C1',
  4: 'B2',
  3: 'B1',
  2: 'A2',
  1: 'A1',
};

function getLangLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase();
}

export const LanguagesStep: React.FC<LanguagesStepProps> = ({
  mode,
  entries,
  excludeCodes,
  onChange,
  onContinue,
  onSkip,
  submitting,
  error,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [showProfPicker, setShowProfPicker] = useState<number | null>(null);

  const blockedCodes = useMemo(() => {
    const set = new Set(excludeCodes ?? []);
    for (const entry of entries) set.add(entry.code);
    return set;
  }, [excludeCodes, entries]);

  const availableLanguages = useMemo(
    () => LANGUAGES.filter((l) => !blockedCodes.has(l.code)),
    [blockedCodes],
  );

  const hasAny = entries.length > 0;
  const defaultProficiency = mode === 'speak' ? 7 : 1;

  const handleAddLang = useCallback((code: string) => {
    onChange([...entries, { code, proficiency: defaultProficiency }]);
    setShowPicker(false);
  }, [entries, onChange, defaultProficiency]);

  const handleSetProficiency = useCallback((index: number, value: number) => {
    const next = [...entries];
    next[index] = { ...next[index], proficiency: value };
    onChange(next);
    setShowProfPicker(null);
  }, [entries, onChange]);

  const handleRemove = useCallback((index: number) => {
    onChange(entries.filter((_, i) => i !== index));
    setShowProfPicker(null);
  }, [entries, onChange]);

  const handlePrimary = useCallback(() => {
    if (submitting) return;
    if (!hasAny && onSkip) {
      onSkip();
      return;
    }
    onContinue();
  }, [submitting, hasAny, onSkip, onContinue]);

  const addLabel = mode === 'speak' ? 'Add a spoken language' : 'Add a learning language';

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        {entries.map((entry, index) => (
          <View key={`${mode}-${entry.code}`} style={styles.entryCard}>
            <View style={styles.entryHeader}>
              <Text style={styles.entryLang}>{getLangLabel(entry.code)}</Text>
              <TouchableOpacity
                onPress={() => handleRemove(index)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.removeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.profButton}
              onPress={() => setShowProfPicker(showProfPicker === index ? null : index)}
              activeOpacity={0.7}
            >
              <Text style={styles.profButtonText}>{SHORT_LABELS[entry.proficiency] ?? 'Set level'}</Text>
              <Text style={styles.chevron}>▼</Text>
            </TouchableOpacity>

            {showProfPicker === index && (
              <View style={styles.profDropdown}>
                {PROFICIENCY_LEVELS.map((level) => (
                  <TouchableOpacity
                    key={`${entry.code}-${level.value}`}
                    style={[styles.profItem, entry.proficiency === level.value && styles.profItemActive]}
                    onPress={() => handleSetProficiency(index, level.value)}
                  >
                    <Text
                      style={[
                        styles.profItemText,
                        entry.proficiency === level.value && styles.profItemTextActive,
                      ]}
                    >
                      {level.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ))}

        {availableLanguages.length > 0 && !showPicker && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              setShowPicker(true);
              setShowProfPicker(null);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.addButtonPlus}>+</Text>
            <Text style={styles.addButtonText}>{addLabel}</Text>
          </TouchableOpacity>
        )}

        {showPicker && (
          <View style={styles.langPickerCard}>
            <View style={styles.langPickerHeader}>
              <Text style={styles.langPickerTitle}>Select language</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Text style={styles.removeText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.langPickerScroll} nestedScrollEnabled>
              {availableLanguages.map((lang) => (
                <TouchableOpacity
                  key={`${mode}-pick-${lang.code}`}
                  style={styles.langPickerItem}
                  onPress={() => handleAddLang(lang.code)}
                >
                  <Text style={styles.langPickerItemText}>{lang.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {error && (
        <ErrorBanner message={error} />
      )}

      <Button
        variant="default"
        size="md"
        fullWidth
        onPress={handlePrimary}
        disabled={submitting}
        loading={submitting}
      >
        {hasAny || !onSkip ? 'Continue' : 'Skip for now'}
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
  },
  body: {
    flex: 1,
    gap: 12,
  },
  entryCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: 14,
    gap: 10,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  entryLang: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
  },
  removeText: {
    color: colors.textMuted,
    fontSize: 16,
  },
  profButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgHighlight,
    borderRadius: radii.full,
    paddingHorizontal: 14,
    height: 36,
  },
  profButtonText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 15,
  },
  profDropdown: {
    backgroundColor: colors.bgHighlight,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  profItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  profItemActive: {
    backgroundColor: colors.bgHighlightHover,
  },
  profItemText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  profItemTextActive: {
    color: colors.accentBlue,
    fontWeight: '600',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderStyle: 'dashed',
    paddingVertical: 14,
  },
  addButtonPlus: {
    color: colors.accentBlue,
    fontSize: 18,
    fontWeight: '600',
  },
  addButtonText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  langPickerCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    overflow: 'hidden',
  },
  langPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDefault,
  },
  langPickerTitle: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
  langPickerScroll: {
    maxHeight: 220,
  },
  langPickerItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderDefault,
  },
  langPickerItemText: {
    color: colors.textPrimary,
    fontSize: 16,
  },
});
