/**
 * OnboardingScreen — 7-step wizard shown after passkey creation.
 *
 * Steps: Name → Basics → Languages (Speak) → Languages (Learning) → Location → Music → Avatar → Complete
 *
 * On-chain operations via Lit WebView bridge (naga-dev):
 * - Name: registerHeavenName via heaven-claim-name Lit Action
 * - Basics + Languages: setProfile via heaven-set-profile Lit Action
 * - Location: setTextRecord via heaven-set-records Lit Action
 * - Music/Avatar: local only (no on-chain target)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { CaretLeft, CheckCircle, X } from 'phosphor-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../lib/theme';
import { useAuth } from '../providers/AuthProvider';
import { useLit } from '../providers/LitProvider';
import { NameStep } from '../components/onboarding/NameStep';
import { BasicsStep, type BasicsData, type BasicsDraft } from '../components/onboarding/BasicsStep';
import { LanguagesStep, type LanguageEntry, type LanguagesData } from '../components/onboarding/LanguagesStep';
import { LocationStep, type LocationDraft } from '../components/onboarding/LocationStep';
import { MusicStep, type PopularArtist } from '../components/onboarding/MusicStep';
import { AvatarStep } from '../components/onboarding/AvatarStep';
import {
  checkNameAvailable,
  registerHeavenName,
  setProfile,
  setTextRecord,
  computeNode,
} from '../lib/heaven-onchain';

type OnboardingStep =
  | 'name'
  | 'basics'
  | 'languagesSpeak'
  | 'languagesLearn'
  | 'location'
  | 'music'
  | 'avatar'
  | 'complete';

const STEP_FLOW: OnboardingStep[] = [
  'name',
  'basics',
  'languagesSpeak',
  'languagesLearn',
  'location',
  'music',
  'avatar',
];

const STEP_INDEX: Record<OnboardingStep, number> = {
  name: 0,
  basics: 1,
  languagesSpeak: 2,
  languagesLearn: 3,
  location: 4,
  music: 5,
  avatar: 6,
  complete: 7,
};

const STEP_TITLES: Record<string, { title: string; subtitle: string }> = {
  name: {
    title: 'Choose your name',
    subtitle: 'Your profile will be publicly accessible on this domain. Choose wisely.',
  },
  basics: {
    title: 'A bit about you',
    subtitle: 'Helps us match you with the right people.',
  },
  languagesSpeak: {
    title: 'Languages you speak',
    subtitle: 'Add languages and your proficiency levels.',
  },
  languagesLearn: {
    title: "Languages you're learning",
    subtitle: 'Add languages and your current proficiency levels.',
  },
  location: {
    title: 'Where are you?',
    subtitle: 'Helps connect you with people nearby.',
  },
  music: {
    title: 'Your music taste',
    subtitle: 'Pick some artists you love. This helps us personalize your experience.',
  },
  avatar: {
    title: 'Add a profile photo',
    subtitle: 'We strongly recommend using an anime photo.',
  },
};

interface OnboardingScreenProps {
  onComplete: () => void;
  onLogout?: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete, onLogout }) => {
  const insets = useSafeAreaInsets();
  const { pkpInfo, createAuthContext, signMessage } = useAuth();
  const { bridge } = useLit();

  const [step, setStep] = useState<OnboardingStep>('name');
  const [claimedName, setClaimedName] = useState('');

  // Step state
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [basicsDraft, setBasicsDraft] = useState<BasicsDraft>({ age: '', gender: '' });
  const [basicsSubmitting, setBasicsSubmitting] = useState(false);
  const [basicsError, setBasicsError] = useState<string | null>(null);
  const [spokenLanguages, setSpokenLanguages] = useState<LanguageEntry[]>([]);
  const [learningLanguages, setLearningLanguages] = useState<LanguageEntry[]>([]);
  const [languagesSubmitting, setLanguagesSubmitting] = useState(false);
  const [languagesError, setLanguagesError] = useState<string | null>(null);
  const [locationDraft, setLocationDraft] = useState<LocationDraft>({ query: '', selectedLabel: '' });
  const [locationSubmitting, setLocationSubmitting] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedArtistMbids, setSelectedArtistMbids] = useState<string[]>([]);
  const [musicSubmitting, setMusicSubmitting] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarSubmitting, setAvatarSubmitting] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Stored basics data (needed when we combine with languages for on-chain call)
  const basicsDataRef = useRef<BasicsData | null>(null);

  const address = pkpInfo?.ethAddress as string | undefined;
  const storageKeyFor = useCallback((suffix: string) => {
    const userKey = address?.toLowerCase() ?? 'unknown';
    return `heaven:${userKey}:${suffix}`;
  }, [address]);

  // Ensure auth context is ready for Lit operations
  const authInitRef = useRef(false);
  useEffect(() => {
    if (authInitRef.current || !pkpInfo?.ethAddress) return;
    authInitRef.current = true;
    createAuthContext().catch((err) => {
      console.warn('[Onboarding] Auth context init failed (will retry on each step):', err?.message);
    });
  }, [pkpInfo?.ethAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Name step ────────────────────────────────────────────────

  const handleCheckNameAvailability = useCallback(async (name: string): Promise<boolean> => {
    try {
      return await checkNameAvailable(name);
    } catch (err) {
      console.error('[Onboarding] Name availability check failed:', err);
      return true;
    }
  }, []);

  const handleClaim = useCallback(async (name: string): Promise<boolean> => {
    setClaiming(true);
    setClaimError(null);
    try {
      if (name.length < 5) {
        setClaimError('Name must be at least 5 characters.');
        return false;
      }

      const available = await handleCheckNameAvailability(name);
      if (!available) {
        setClaimError('This name is not available. Try another one.');
        return false;
      }

      // Register on-chain via Lit Action
      if (bridge && pkpInfo?.ethAddress && pkpInfo?.pubkey) {
        try {
          await createAuthContext();
          console.log('[Onboarding] Registering .heaven name on-chain:', name);
          const result = await registerHeavenName(
            name,
            pkpInfo.ethAddress as `0x${string}`,
            bridge,
            pkpInfo.pubkey,
            signMessage,
          );
          if (!result.success) {
            console.error('[Onboarding] Name registration failed:', result.error);
            setClaimError(result.error || 'Failed to register name on-chain.');
            return false;
          }
          console.log('[Onboarding] Name registered on-chain:', result.txHash);
        } catch (err: any) {
          console.error('[Onboarding] Name registration error:', err);
          setClaimError(`On-chain registration failed: ${err?.message || 'Unknown error'}`);
          return false;
        }
      } else {
        console.warn('[Onboarding] Lit bridge not ready — saving name locally only');
      }

      setClaimedName(name);
      await AsyncStorage.setItem(storageKeyFor('username'), name);
      setStep('basics');
      return true;
    } catch (err: any) {
      console.error('[Onboarding] Claim error:', err);
      setClaimError(err?.message || 'Something went wrong.');
      return false;
    } finally {
      setClaiming(false);
    }
  }, [storageKeyFor, handleCheckNameAvailability, bridge, pkpInfo, createAuthContext, signMessage]);

  // ── Basics step ──────────────────────────────────────────────

  const handleBasicsContinue = useCallback(async (data: BasicsData): Promise<boolean | void> => {
    setBasicsSubmitting(true);
    setBasicsError(null);
    try {
      setBasicsDraft({
        age: data.age == null ? '' : String(data.age),
        gender: data.gender,
      });
      basicsDataRef.current = data;
      await AsyncStorage.setItem(storageKeyFor('profile'), JSON.stringify(data));
      console.log('[Onboarding] Profile saved (local):', data);
      setStep('languagesSpeak');
    } catch (err: any) {
      console.error('[Onboarding] Basics save error:', err);
      setBasicsError(err?.message || 'Failed to save. Please try again.');
      return false;
    } finally {
      setBasicsSubmitting(false);
    }
  }, [storageKeyFor]);

  // ── Languages steps ─────────────────────────────────────────

  const handleLanguagesSpeakContinue = useCallback(() => {
    setLanguagesError(null);
    setStep('languagesLearn');
  }, []);

  const handleLanguagesSpeakSkip = useCallback(() => {
    setSpokenLanguages([]);
    setLanguagesError(null);
    setStep('languagesLearn');
  }, []);

  /**
   * Submit profile on-chain after learning languages are done.
   * Combines basics + spoken + learning into a single setProfile call.
   */
  const submitProfileOnChain = useCallback(async (
    speaks: LanguageEntry[],
    learns: LanguageEntry[],
  ) => {
    if (!bridge || !pkpInfo?.ethAddress || !pkpInfo?.pubkey) {
      console.warn('[Onboarding] Lit bridge not ready — skipping on-chain profile');
      return;
    }

    const basics = basicsDataRef.current;
    const allLanguages = [
      ...speaks.map((l) => ({ code: l.code, proficiency: l.proficiency })),
      ...learns.map((l) => ({ code: l.code, proficiency: l.proficiency })),
    ];

    try {
      await createAuthContext();
      console.log('[Onboarding] Setting profile on-chain...');
      const result = await setProfile(
        {
          age: basics?.age ?? undefined,
          gender: basics?.gender ?? undefined,
          languages: allLanguages.length > 0 ? allLanguages : undefined,
        },
        pkpInfo.ethAddress as `0x${string}`,
        bridge,
        pkpInfo.pubkey,
        signMessage,
      );
      if (!result.success) {
        console.error('[Onboarding] setProfile failed:', result.error);
        throw new Error(result.error || 'Failed to set profile on-chain');
      }
      console.log('[Onboarding] Profile set on-chain:', result.txHash);
    } catch (err: any) {
      console.error('[Onboarding] Profile on-chain error:', err);
      throw err;
    }
  }, [bridge, pkpInfo, createAuthContext, signMessage]);

  const handleLanguagesLearnContinue = useCallback(async () => {
    setLanguagesSubmitting(true);
    setLanguagesError(null);
    try {
      const data: LanguagesData = {
        speaks: spokenLanguages,
        learning: learningLanguages,
      };
      await AsyncStorage.setItem(storageKeyFor('languages'), JSON.stringify(data));
      console.log('[Onboarding] Languages saved (local):', data);

      // Submit profile on-chain (basics + languages combined)
      try {
        await submitProfileOnChain(spokenLanguages, learningLanguages);
      } catch (err: any) {
        // Don't block onboarding on profile failure — user can fix via profile edit later
        console.warn('[Onboarding] On-chain profile failed, continuing anyway:', err?.message);
      }

      setStep('location');
    } catch (err: any) {
      console.error('[Onboarding] Languages save error:', err);
      setLanguagesError(err?.message || 'Failed to save. Please try again.');
    } finally {
      setLanguagesSubmitting(false);
    }
  }, [storageKeyFor, spokenLanguages, learningLanguages, submitProfileOnChain]);

  const handleLanguagesLearnSkip = useCallback(async () => {
    setLanguagesSubmitting(true);
    setLanguagesError(null);
    try {
      const data: LanguagesData = {
        speaks: spokenLanguages,
        learning: [],
      };
      await AsyncStorage.setItem(storageKeyFor('languages'), JSON.stringify(data));
      console.log('[Onboarding] Learning languages skipped');

      // Submit profile on-chain (basics + spoken languages only)
      try {
        await submitProfileOnChain(spokenLanguages, []);
      } catch (err: any) {
        console.warn('[Onboarding] On-chain profile failed, continuing anyway:', err?.message);
      }

      setStep('location');
    } catch (err: any) {
      console.error('[Onboarding] Languages save error:', err);
      setLanguagesError(err?.message || 'Failed to save. Please try again.');
    } finally {
      setLanguagesSubmitting(false);
    }
  }, [storageKeyFor, spokenLanguages, submitProfileOnChain]);

  // ── Location step ───────────────────────────────────────────

  const handleLocationContinue = useCallback(async (location: string) => {
    setLocationSubmitting(true);
    setLocationError(null);
    try {
      setLocationDraft({ query: location, selectedLabel: location });
      await AsyncStorage.setItem(storageKeyFor('location'), location);
      console.log('[Onboarding] Location saved (local):', location);

      // Set text record on-chain if we have a claimed name
      if (bridge && pkpInfo?.pubkey && claimedName) {
        try {
          await createAuthContext();
          const node = computeNode(claimedName);
          console.log('[Onboarding] Setting location record on-chain...');
          const result = await setTextRecord(node, 'heaven.location', location, bridge, pkpInfo.pubkey, signMessage);
          if (!result.success) {
            console.warn('[Onboarding] setTextRecord failed:', result.error);
          } else {
            console.log('[Onboarding] Location record set on-chain:', result.txHash);
          }
        } catch (err: any) {
          console.warn('[Onboarding] Location record on-chain failed, continuing:', err?.message);
        }
      }

      setStep('music');
    } catch (err: any) {
      console.error('[Onboarding] Location save error:', err);
      setLocationError(err?.message || 'Failed to save. Please try again.');
    } finally {
      setLocationSubmitting(false);
    }
  }, [storageKeyFor, bridge, pkpInfo, claimedName, createAuthContext, signMessage]);

  // ── Music step ───────────────────────────────────────────────

  const handleMusicContinue = useCallback(async (artists: PopularArtist[]) => {
    setMusicSubmitting(true);
    setMusicError(null);
    try {
      const mbids = artists.map((a) => a.mbid);
      setSelectedArtistMbids(mbids);
      if (artists.length > 0) {
        await AsyncStorage.setItem(storageKeyFor('favoriteArtists'), JSON.stringify(mbids));
        console.log('[Onboarding] Music preferences saved:', artists.length, 'artists');
      }
      setStep('avatar');
    } catch (err: any) {
      console.error('[Onboarding] Music save error:', err);
      setMusicError(err?.message || 'Failed to save. Please try again.');
    } finally {
      setMusicSubmitting(false);
    }
  }, [storageKeyFor]);

  // ── Avatar step ──────────────────────────────────────────────

  const completeOnboarding = useCallback(async () => {
    const key = address
      ? `heaven:onboarding:${address.toLowerCase()}`
      : 'heaven:onboarding:unknown';
    await AsyncStorage.setItem(key, 'complete');
    setStep('complete');
    setTimeout(() => onComplete(), 1500);
  }, [address, onComplete]);

  const handleAvatarFinish = useCallback(async (avatarUri: string | null) => {
    setAvatarError(null);
    setAvatarSubmitting(true);
    try {
      setAvatarUri(avatarUri);
      if (avatarUri) {
        await AsyncStorage.setItem(storageKeyFor('avatarUri'), avatarUri);
        console.log('[Onboarding] Avatar saved (local):', avatarUri);
      }
      await completeOnboarding();
    } catch (err: any) {
      setAvatarError(err?.message || 'Failed to finish setup. Please try again.');
    } finally {
      setAvatarSubmitting(false);
    }
  }, [completeOnboarding, storageKeyFor]);

  // ── Render ───────────────────────────────────────────────────

  const stepInfo = STEP_TITLES[step];
  const currentIndex = STEP_INDEX[step];
  const canGoBack = step !== 'name' && step !== 'complete';

  const handleBack = useCallback(() => {
    const current = STEP_FLOW.indexOf(step);
    if (current > 0) {
      setStep(STEP_FLOW[current - 1]);
    }
  }, [step]);

  return (
    <View style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.container,
            {
              paddingTop: insets.top + 12,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          {step === 'complete' ? (
            <View style={styles.completeContainer}>
              <View style={styles.successCircle}>
                <CheckCircle size={48} color={colors.success} weight="fill" />
              </View>
              <Text style={styles.completeTitle}>You're all set!</Text>
              <Text style={styles.completeSubtitle}>
                Welcome to Heaven{claimedName ? `, ${claimedName}.heaven` : ''}
              </Text>
            </View>
          ) : (
            <>
              {/* Header: back + progress + close */}
              <View style={styles.headerRow}>
                <TouchableOpacity
                  style={[styles.headerControl, styles.headerControlLeft, !canGoBack && styles.headerControlDisabled]}
                  onPress={handleBack}
                  disabled={!canGoBack}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <CaretLeft size={20} color={colors.textMuted} weight="bold" />
                </TouchableOpacity>
                <View style={styles.headerProgressWrap}>
                  <View style={styles.headerProgressTrack}>
                    <View
                      style={[
                        styles.headerProgressFill,
                        { width: `${((currentIndex + 1) / STEP_FLOW.length) * 100}%` },
                      ]}
                    />
                  </View>
                </View>
                {onLogout ? (
                  <TouchableOpacity
                    style={[styles.headerControl, styles.headerControlRight]}
                    onPress={() => Alert.alert(
                      'Sign out?',
                      'You can resume onboarding next time you sign in.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Sign out', style: 'destructive', onPress: onLogout },
                      ],
                    )}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <X size={20} color={colors.textMuted} weight="bold" />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.headerSpacer} />
                )}
              </View>

              {/* Title */}
              <Text style={styles.title}>{stepInfo?.title}</Text>
              <Text style={styles.subtitle}>{stepInfo?.subtitle}</Text>

              {/* Step body */}
              <View style={styles.stepBody}>
                {step === 'name' && (
                  <NameStep
                    initialName={claimedName}
                    onClaim={handleClaim}
                    onCheckAvailability={handleCheckNameAvailability}
                    claiming={claiming}
                    error={claimError}
                  />
                )}
                {step === 'basics' && (
                  <BasicsStep
                    value={basicsDraft}
                    onChange={setBasicsDraft}
                    onContinue={handleBasicsContinue}
                    submitting={basicsSubmitting}
                    error={basicsError}
                  />
                )}
                {step === 'languagesSpeak' && (
                  <LanguagesStep
                    mode="speak"
                    entries={spokenLanguages}
                    onChange={setSpokenLanguages}
                    onContinue={handleLanguagesSpeakContinue}
                    onSkip={handleLanguagesSpeakSkip}
                    submitting={false}
                    error={null}
                  />
                )}
                {step === 'languagesLearn' && (
                  <LanguagesStep
                    mode="learn"
                    entries={learningLanguages}
                    excludeCodes={spokenLanguages.map((l) => l.code)}
                    onChange={setLearningLanguages}
                    onContinue={() => { void handleLanguagesLearnContinue(); }}
                    onSkip={() => { void handleLanguagesLearnSkip(); }}
                    submitting={languagesSubmitting}
                    error={languagesError}
                  />
                )}
                {step === 'location' && (
                  <LocationStep
                    value={locationDraft}
                    onChange={setLocationDraft}
                    onContinue={handleLocationContinue}
                    submitting={locationSubmitting}
                    error={locationError}
                  />
                )}
                {step === 'music' && (
                  <MusicStep
                    selectedMbids={selectedArtistMbids}
                    onSelectionChange={setSelectedArtistMbids}
                    onContinue={handleMusicContinue}
                    submitting={musicSubmitting}
                    error={musicError}
                  />
                )}
                {step === 'avatar' && (
                  <AvatarStep
                    claimedName={claimedName}
                    avatarUri={avatarUri}
                    onAvatarUriChange={setAvatarUri}
                    onFinish={handleAvatarFinish}
                    submitting={avatarSubmitting}
                    error={avatarError}
                  />
                )}
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerSpacer: {
    width: 40,
  },
  headerProgressWrap: {
    flex: 1,
    paddingHorizontal: 8,
  },
  headerProgressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 9999,
    backgroundColor: colors.borderDefault,
    overflow: 'hidden',
  },
  headerProgressFill: {
    height: '100%',
    borderRadius: 9999,
    backgroundColor: colors.accentBlue,
  },
  headerControl: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerControlLeft: {
    alignItems: 'flex-start',
  },
  headerControlRight: {
    alignItems: 'flex-end',
  },
  headerControlDisabled: {
    opacity: 0.35,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'left',
    marginTop: 16,
    lineHeight: 34,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 17,
    textAlign: 'left',
    marginTop: 6,
    marginBottom: 32,
    lineHeight: 24,
  },
  stepBody: {
    flex: 1,
    paddingTop: 16,
  },
  completeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeTitle: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
  completeSubtitle: {
    color: colors.textSecondary,
    fontSize: 16,
  },
});
