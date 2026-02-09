import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { CheckCircle, XCircle } from 'phosphor-react-native';
import { colors, radii } from '../../lib/theme';
import { Button, ErrorBanner } from '../../ui';

interface NameStepProps {
  initialName?: string;
  onClaim: (name: string) => Promise<boolean>;
  onCheckAvailability: (name: string) => Promise<boolean>;
  claiming: boolean;
  error: string | null;
}

type AvailabilityStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
const MIN_NAME_LENGTH = 5;

/**
 * Sanitize: lowercase, alphanumeric + hyphens, max 32 chars
 */
function sanitizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 32);
}

export const NameStep: React.FC<NameStepProps> = ({
  initialName,
  onClaim,
  onCheckAvailability,
  claiming,
  error,
}) => {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<AvailabilityStatus>('idle');
  const requestSeqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof initialName !== 'string') return;
    const sanitized = sanitizeName(initialName);
    setName(sanitized);
    if (sanitized.length >= MIN_NAME_LENGTH) {
      setStatus('available');
    } else {
      setStatus(sanitized.length > 0 ? 'invalid' : 'idle');
    }
  }, [initialName]);

  const handleChange = useCallback((raw: string) => {
    const sanitized = sanitizeName(raw);
    setName(sanitized);
    requestSeqRef.current += 1;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (sanitized.length < MIN_NAME_LENGTH) {
      setStatus(sanitized.length > 0 ? 'invalid' : 'idle');
      return;
    }

    const nextSeq = requestSeqRef.current;
    setStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const available = await onCheckAvailability(sanitized);
        if (requestSeqRef.current !== nextSeq) return;
        setStatus(available ? 'available' : 'taken');
      } catch {
        if (requestSeqRef.current !== nextSeq) return;
        setStatus('idle');
      }
    }, 350);
  }, [onCheckAvailability]);

  const handleClaim = useCallback(() => {
    if (status === 'available' && name.length >= MIN_NAME_LENGTH && !claiming) {
      onClaim(name);
    }
  }, [name, status, claiming, onClaim]);

  useEffect(() => () => {
    requestSeqRef.current += 1;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const statusColor =
    status === 'available' ? colors.success :
    status === 'taken' ? colors.accentCoral :
    status === 'invalid' ? colors.textMuted :
    colors.textMuted;

  const statusText =
    status === 'checking' ? 'Checking...' :
    status === 'available' ? 'Available!' :
    status === 'taken' ? 'Already taken' :
    status === 'invalid' || status === 'idle' ? `Minimum ${MIN_NAME_LENGTH}+ characters` :
    '';

  return (
    <View style={styles.container}>
      {/* Name input with .heaven suffix */}
      <View style={styles.inputRow}>
        <Text style={styles.prefix}>https://</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={handleChange}
          placeholder="yourname"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          editable={!claiming}
        />
        <Text style={styles.suffix}>.heaven</Text>
      </View>

      {/* Status indicator */}
      <View style={styles.statusRow}>
        {status === 'checking' && (
          <ActivityIndicator size="small" color={colors.accentBlue} />
        )}
        {statusText !== '' && status !== 'checking' && (
          <View style={styles.statusContent}>
            {status === 'available' && (
              <CheckCircle size={18} color={colors.success} weight="fill" />
            )}
            {status === 'taken' && (
              <XCircle size={18} color={colors.accentCoral} weight="fill" />
            )}
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusText}
            </Text>
          </View>
        )}
      </View>

      {/* Error */}
      {error && (
        <ErrorBanner message={error} style={styles.errorBanner} />
      )}

      {/* Claim button */}
      <Button
        variant="default"
        size="md"
        fullWidth
        onPress={handleClaim}
        disabled={status !== 'available' || claiming}
        loading={claiming}
      >
        Claim
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 0,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderRadius: radii.full,
    paddingHorizontal: 16,
    height: 48,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    marginBottom: 12,
  },
  prefix: {
    color: colors.textMuted,
    fontSize: 16,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: 0,
  },
  suffix: {
    color: colors.textMuted,
    fontSize: 16,
  },
  statusRow: {
    minHeight: 24,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 15,
  },
  errorBanner: {
    marginBottom: 12,
  },
});
