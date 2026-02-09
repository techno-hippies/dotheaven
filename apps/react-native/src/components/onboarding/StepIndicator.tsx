import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../../lib/theme';

interface StepIndicatorProps {
  steps: number;
  currentStep: number; // 0-indexed
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({ steps, currentStep }) => {
  return (
    <View style={styles.container}>
      {Array.from({ length: steps }, (_, i) => {
        const isCompleted = i < currentStep;
        const isActive = i === currentStep;
        const isFuture = i > currentStep;

        return (
          <React.Fragment key={i}>
            {/* Connecting line (before each step except first) */}
            {i > 0 && (
              <View
                style={[
                  styles.line,
                  isCompleted || isActive
                    ? styles.lineActive
                    : styles.lineFuture,
                ]}
              />
            )}

            {/* Step dot */}
            <View
              style={[
                styles.dot,
                isCompleted && styles.dotCompleted,
                isActive && styles.dotActive,
                isFuture && styles.dotFuture,
              ]}
            />
          </React.Fragment>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  line: {
    height: 2,
    width: 18,
  },
  lineActive: {
    backgroundColor: colors.accentBlue,
  },
  lineFuture: {
    backgroundColor: colors.borderDefault,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 9999,
  },
  dotCompleted: {
    backgroundColor: colors.accentBlue,
  },
  dotActive: {
    backgroundColor: colors.accentBlue,
  },
  dotFuture: {
    backgroundColor: colors.borderDefault,
  },
});
