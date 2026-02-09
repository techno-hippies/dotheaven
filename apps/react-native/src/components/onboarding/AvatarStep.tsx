import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { colors, radii } from '../../lib/theme';
import { Button, ErrorBanner } from '../../ui';

interface AvatarStepProps {
  claimedName: string;
  avatarUri: string | null;
  onAvatarUriChange: (uri: string | null) => void;
  onFinish: (avatarUri: string | null) => Promise<void>;
  submitting: boolean;
  error: string | null;
}

/**
 * AvatarStep — local picker version.
 *
 * Uses a local image URI so onboarding is not blocked by Lit/IPFS availability.
 */
export const AvatarStep: React.FC<AvatarStepProps> = ({
  claimedName,
  avatarUri,
  onAvatarUriChange,
  onFinish,
  submitting,
  error,
}) => {
  const handlePickImage = useCallback(async () => {
    if (submitting) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;
      const selected = result.assets?.[0];
      if (selected?.uri) {
        onAvatarUriChange(selected.uri);
      }
    } catch (pickError) {
      console.warn('[Onboarding] Avatar pick failed:', pickError);
    }
  }, [submitting, onAvatarUriChange]);

  const handleFinish = useCallback(() => {
    void onFinish(avatarUri);
  }, [avatarUri, onFinish]);

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        {/* Tappable avatar circle */}
        <TouchableOpacity
          style={styles.uploadTap}
          onPress={() => { void handlePickImage(); }}
          activeOpacity={0.85}
          disabled={submitting}
        >
          <View style={styles.uploadArea}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.placeholder}>
                <Text style={styles.initial}>
                  {claimedName ? claimedName.charAt(0).toUpperCase() : '?'}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomSection}>
        {/* Error */}
        {error && (
          <ErrorBanner message={error} />
        )}

        {/* Finish button */}
        <Button
          variant="default"
          size="md"
          fullWidth
          onPress={handleFinish}
          disabled={submitting}
          loading={submitting}
        >
          Finish
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
  topSection: {
    alignItems: 'center',
    paddingTop: 8,
  },
  uploadTap: {
    borderRadius: 9999,
  },
  uploadArea: {
    width: 176,
    height: 176,
    borderRadius: 88,
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
    borderWidth: 2,
    borderColor: colors.borderDefault,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  initial: {
    fontSize: 56,
    fontWeight: '700',
    color: colors.textMuted,
  },
  bottomSection: {
    marginTop: 'auto',
    width: '100%',
    gap: 12,
  },
});
