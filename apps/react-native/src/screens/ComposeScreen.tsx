import React, { useState, useRef, useEffect } from 'react';
import {
  Alert,
  Image as RNImage,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Image, MusicNotes } from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/TabNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useProfile } from '../hooks/useProfile';
import { Avatar } from '../ui/Avatar';
import { IconButton } from '../ui/IconButton';
import { colors, fontSize } from '../lib/theme';

type ComposeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Compose'>;
};

const MAX_PHOTOS = 4;

export const ComposeScreen: React.FC<ComposeScreenProps> = ({ navigation }) => {
  const { isAuthenticated, pkpInfo } = useAuth();
  const { profile } = useProfile({
    enabled: isAuthenticated,
    address: pkpInfo?.ethAddress,
  });

  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [posting, setPosting] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Auto-focus the text input on mount
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  const canPost = text.trim().length > 0 || photos.length > 0;

  const handlePickPhoto = async () => {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert('Limit reached', `You can attach up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setPhotos((prev) => [...prev, ...result.assets].slice(0, MAX_PHOTOS));
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePost = async () => {
    if (!canPost) return;
    setPosting(true);

    // TODO: Wire to post-register-v1 Lit Action
    console.log('Post:', text, photos.length ? `${photos.length} photos` : '');

    // Simulate brief delay then close
    setTimeout(() => {
      setPosting(false);
      navigation.goBack();
    }, 300);
  };

  const handleSongPress = () => {
    // TODO: Wire to song picker
    Alert.alert('Coming Soon', 'Song attachment will be available soon.');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <IconButton
            variant="ghost"
            size="md"
            onPress={() => navigation.goBack()}
            accessibilityLabel="Close"
          >
            <X size={24} color={colors.textPrimary} />
          </IconButton>

          <Text style={styles.headerTitle}>New Post</Text>

          <TouchableOpacity
            style={[styles.postButton, !canPost && styles.postButtonDisabled]}
            onPress={handlePost}
            disabled={!canPost || posting}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.postButtonText,
                !canPost && styles.postButtonTextDisabled,
              ]}
            >
              {posting ? 'Posting...' : 'Post'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Compose area */}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.composeRow}>
            <Avatar src={profile?.avatarUrl} size="lg" />
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              value={text}
              onChangeText={setText}
              placeholder="What's on your mind?"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
              autoFocus={false}
            />
          </View>

          {/* Photo previews */}
          {photos.length > 0 && (
            <View style={styles.photoGrid}>
              {photos.map((photo, index) => (
                <View key={photo.uri} style={styles.photoThumb}>
                  <RNImage
                    source={{ uri: photo.uri }}
                    style={styles.photoImage}
                  />
                  <TouchableOpacity
                    style={styles.photoRemove}
                    onPress={() => handleRemovePhoto(index)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={16} color={colors.white} weight="bold" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Bottom toolbar */}
        <View style={styles.toolbar}>
          <View style={styles.toolbarActions}>
            <IconButton
              variant="soft"
              size="md"
              onPress={handlePickPhoto}
              accessibilityLabel="Add photo"
              disabled={photos.length >= MAX_PHOTOS}
            >
              <Image
                size={20}
                color={
                  photos.length >= MAX_PHOTOS
                    ? colors.textMuted
                    : colors.accentBlue
                }
              />
            </IconButton>

            <IconButton
              variant="soft"
              size="md"
              onPress={handleSongPress}
              accessibilityLabel="Attach song"
            >
              <MusicNotes size={20} color={colors.accentBlue} />
            </IconButton>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  postButton: {
    backgroundColor: colors.accentBlue,
    borderRadius: 9999,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  postButtonDisabled: {
    opacity: 0.4,
  },
  postButtonText: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.white,
  },
  postButtonTextDisabled: {
    color: colors.white,
  },

  // Compose
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  composeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  textInput: {
    flex: 1,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
    minHeight: 120,
    padding: 0,
    lineHeight: 26,
  },

  // Photo grid
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
    paddingLeft: 60, // Aligned with text (avatar 48 + gap 12)
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
  },
  photoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Toolbar
  toolbar: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toolbarActions: {
    flexDirection: 'row',
    gap: 4,
  },
});
