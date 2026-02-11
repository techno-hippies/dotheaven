import React, { useCallback, useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  View,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ScrollView,
  type ViewStyle,
} from 'react-native';
import { X } from 'phosphor-react-native';
import { colors } from '../lib/theme';
import { IconButton } from './IconButton';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Show drag handle at top (default: true) */
  showHandle?: boolean;
  /** Footer content that stays sticky at the bottom (outside scroll area) */
  footer?: React.ReactNode;
  /** Additional styles for the content container */
  contentStyle?: ViewStyle;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  open,
  onClose,
  children,
  showHandle = true,
  footer,
  contentStyle,
}) => {
  // Close on back button press (Android)
  useEffect(() => {
    if (!open) return;
    // You can add BackHandler listener here if needed
  }, [open]);

  const handleOverlayPress = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior="padding"
      >
        {/* Overlay */}
        <Pressable style={styles.overlay} onPress={handleOverlayPress} />

        {/* Sheet content */}
        <View style={[styles.sheet, contentStyle]}>
          {/* Drag handle */}
          {showHandle && (
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>
          )}

          {/* Close button - top right */}
          <View style={styles.closeButton}>
            <IconButton
              variant="ghost"
              size="md"
              onPressIn={onClose}
              accessibilityLabel="Close"
            >
              <X size={20} color={colors.textSecondary} />
            </IconButton>
          </View>

          {/* Content wrapper with padding - scrollable */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {/* Footer - sticky at bottom, outside scroll area */}
          {footer && (
            <View style={styles.footer}>
              {footer}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    backgroundColor: colors.bgSurface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.borderSubtle,
    maxHeight: '94%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  handleContainer: {
    paddingTop: 12,
    paddingBottom: 4,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: `${colors.textMuted}4D`, // 30% opacity
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
  },
  scrollView: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
  },
  footer: {
    flexShrink: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
});
