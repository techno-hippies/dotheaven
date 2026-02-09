import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { colors } from '../../lib/theme';
import { Button, ErrorBanner, Pill, TextField } from '../../ui';

interface BasicsStepProps {
  value: BasicsDraft;
  onChange: (value: BasicsDraft) => void;
  onContinue: (data: BasicsData) => Promise<boolean | void>;
  submitting: boolean;
  error: string | null;
}

export interface BasicsData {
  age: number | null;
  gender: string;
}

export interface BasicsDraft {
  age: string;
  gender: string;
}

const GENDERS = [
  { key: 'woman', label: 'Woman' },
  { key: 'man', label: 'Man' },
  { key: 'non-binary', label: 'Non-binary' },
  { key: 'other', label: 'Other' },
];

// ── Component ──────────────────────────────────────────────────

export const BasicsStep: React.FC<BasicsStepProps> = ({
  value,
  onChange,
  onContinue,
  submitting,
  error,
}) => {
  const age = value.age;
  const gender = value.gender;

  const ageNum = parseInt(age, 10);
  const isValid = !isNaN(ageNum) && ageNum >= 13 && ageNum <= 120 && gender !== '';

  const handleContinue = useCallback(() => {
    if (!isValid || submitting) return;
    onContinue({ age: ageNum, gender });
  }, [isValid, submitting, ageNum, gender, onContinue]);

  return (
    <View style={styles.container}>
      {/* Age */}
      <View style={styles.field}>
        <TextField
          label="Age"
          value={age}
          onChangeText={(nextAge) => onChange({ ...value, age: nextAge })}
          placeholder="Your age"
          keyboardType="number-pad"
          maxLength={3}
          editable={!submitting}
        />
      </View>

      {/* Gender */}
      <View style={styles.field}>
        <Text style={styles.label}>Gender</Text>
        <View style={styles.pillRow}>
          {GENDERS.map((g) => (
            <Pill
              key={g.key}
              label={g.label}
              selected={gender === g.key}
              onPress={() => {
                onChange({ ...value, gender: g.key });
                Keyboard.dismiss();
              }}
              disabled={submitting}
            />
          ))}
        </View>
      </View>

      {/* Error */}
      {error && (
        <ErrorBanner message={error} />
      )}

      {/* Spacer */}
      <View style={styles.spacer} />

      {/* Continue */}
      <Button
        variant="default"
        size="md"
        fullWidth
        onPress={handleContinue}
        disabled={!isValid || submitting}
        loading={submitting}
      >
        Continue
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 20,
  },
  field: {
    gap: 8,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  spacer: {
    flex: 1,
  },
});
