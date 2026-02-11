import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretLeft, CaretRight } from 'phosphor-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/TabNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useLit } from '../providers/LitProvider';
import { colors, fontSize, radii } from '../lib/theme';
import { Button, BottomSheet, IconButton, OptionPicker, Spinner, TextField } from '../ui';
import { fetchProfile, type ProfileData } from '../lib/profile';
import {
  setProfile as setProfileOnChain,
  setTextRecord,
  computeNode,
  getPrimaryName,
  type SetProfileData,
} from '../lib/heaven-onchain';
import {
  NUM_TO_GENDER_LABEL,
  NUM_TO_RELOCATE,
  NUM_TO_DEGREE,
  NUM_TO_FIELD,
  NUM_TO_PROFESSION,
  NUM_TO_INDUSTRY,
  NUM_TO_RELATIONSHIP,
  NUM_TO_SEXUALITY,
  NUM_TO_ETHNICITY,
  NUM_TO_DATING_STYLE,
  NUM_TO_CHILDREN,
  NUM_TO_WANTS_CHILDREN,
  NUM_TO_DRINKING,
  NUM_TO_SMOKING,
  NUM_TO_DRUGS,
  NUM_TO_LOOKING_FOR,
  NUM_TO_RELIGION,
  NUM_TO_PETS,
  NUM_TO_DIET,
  toOptions,
  getLanguageName,
  proficiencyLabel,
  type LanguageEntry,
} from '../lib/heaven-constants';
import { LanguagesStep } from '../components/onboarding/LanguagesStep';
import { LocationStep, type LocationDraft } from '../components/onboarding/LocationStep';

// ── Types ─────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

interface EditState {
  bio: string;
  url: string;
  twitter: string;
  github: string;
  telegram: string;
  age: string;
  heightCm: string;
  school: string;
  location: string;
  gender: number;
  relocate: number;
  degree: number;
  fieldBucket: number;
  profession: number;
  industry: number;
  relationshipStatus: number;
  sexuality: number;
  ethnicity: number;
  datingStyle: number;
  children: number;
  wantsChildren: number;
  drinking: number;
  smoking: number;
  drugs: number;
  lookingFor: number;
  religion: number;
  pets: number;
  diet: number;
  languages: LanguageEntry[];
}

type PickerField =
  | 'gender' | 'relocate' | 'degree' | 'fieldBucket' | 'profession' | 'industry'
  | 'relationshipStatus' | 'sexuality' | 'ethnicity' | 'datingStyle' | 'children'
  | 'wantsChildren' | 'drinking' | 'smoking' | 'drugs' | 'lookingFor' | 'religion'
  | 'pets' | 'diet';

type TextSheetField = 'bio' | 'url' | 'twitter' | 'github' | 'telegram' | 'age' | 'heightCm' | 'school';

// ── Options ───────────────────────────────────────────────────────

const PICKER_OPTIONS: Record<PickerField, { title: string; options: { value: number; label: string }[] }> = {
  gender: { title: 'Gender', options: toOptions(NUM_TO_GENDER_LABEL) },
  relocate: { title: 'Flexibility', options: toOptions(NUM_TO_RELOCATE) },
  degree: { title: 'Degree', options: toOptions(NUM_TO_DEGREE) },
  fieldBucket: { title: 'Field of Study', options: toOptions(NUM_TO_FIELD) },
  profession: { title: 'Profession', options: toOptions(NUM_TO_PROFESSION) },
  industry: { title: 'Industry', options: toOptions(NUM_TO_INDUSTRY) },
  relationshipStatus: { title: 'Relationship Status', options: toOptions(NUM_TO_RELATIONSHIP) },
  sexuality: { title: 'Sexuality', options: toOptions(NUM_TO_SEXUALITY) },
  ethnicity: { title: 'Ethnicity', options: toOptions(NUM_TO_ETHNICITY) },
  datingStyle: { title: 'Dating Style', options: toOptions(NUM_TO_DATING_STYLE) },
  children: { title: 'Children', options: toOptions(NUM_TO_CHILDREN) },
  wantsChildren: { title: 'Wants Children', options: toOptions(NUM_TO_WANTS_CHILDREN) },
  drinking: { title: 'Drinking', options: toOptions(NUM_TO_DRINKING) },
  smoking: { title: 'Smoking', options: toOptions(NUM_TO_SMOKING) },
  drugs: { title: 'Drugs', options: toOptions(NUM_TO_DRUGS) },
  lookingFor: { title: 'Looking For', options: toOptions(NUM_TO_LOOKING_FOR) },
  religion: { title: 'Religion', options: toOptions(NUM_TO_RELIGION) },
  pets: { title: 'Pets', options: toOptions(NUM_TO_PETS) },
  diet: { title: 'Diet', options: toOptions(NUM_TO_DIET) },
};

const ENUM_DISPLAY: Record<PickerField, Record<number, string>> = {
  gender: NUM_TO_GENDER_LABEL,
  relocate: NUM_TO_RELOCATE,
  degree: NUM_TO_DEGREE,
  fieldBucket: NUM_TO_FIELD,
  profession: NUM_TO_PROFESSION,
  industry: NUM_TO_INDUSTRY,
  relationshipStatus: NUM_TO_RELATIONSHIP,
  sexuality: NUM_TO_SEXUALITY,
  ethnicity: NUM_TO_ETHNICITY,
  datingStyle: NUM_TO_DATING_STYLE,
  children: NUM_TO_CHILDREN,
  wantsChildren: NUM_TO_WANTS_CHILDREN,
  drinking: NUM_TO_DRINKING,
  smoking: NUM_TO_SMOKING,
  drugs: NUM_TO_DRUGS,
  lookingFor: NUM_TO_LOOKING_FOR,
  religion: NUM_TO_RELIGION,
  pets: NUM_TO_PETS,
  diet: NUM_TO_DIET,
};

const TEXT_FIELD_CONFIG: Record<TextSheetField, { title: string; placeholder: string; multiline?: boolean; keyboardType?: 'default' | 'number-pad'; maxLength?: number }> = {
  bio: { title: 'Bio', placeholder: 'Tell people about yourself...', multiline: true, maxLength: 300 },
  url: { title: 'Website', placeholder: 'https://your-site.com' },
  twitter: { title: 'X / Twitter', placeholder: 'username' },
  github: { title: 'GitHub', placeholder: 'username' },
  telegram: { title: 'Telegram', placeholder: 'username' },
  age: { title: 'Age', placeholder: 'Your age', keyboardType: 'number-pad', maxLength: 3 },
  heightCm: { title: 'Height (cm)', placeholder: 'Height in cm', keyboardType: 'number-pad', maxLength: 3 },
  school: { title: 'School', placeholder: 'University or school name' },
};

// ── Helpers ───────────────────────────────────────────────────────

function initState(profile: ProfileData | null): EditState {
  return {
    bio: profile?.bio ?? '',
    url: profile?.url ?? '',
    twitter: profile?.twitter ?? '',
    github: profile?.github ?? '',
    telegram: profile?.telegram ?? '',
    age: profile?.age ? String(profile.age) : '',
    heightCm: profile?.heightCm ? String(profile.heightCm) : '',
    school: profile?.school ?? '',
    location: profile?.location ?? '',
    gender: profile?.raw?.gender ?? 0,
    relocate: profile?.raw?.relocate ?? 0,
    degree: profile?.raw?.degree ?? 0,
    fieldBucket: profile?.raw?.fieldBucket ?? 0,
    profession: profile?.raw?.profession ?? 0,
    industry: profile?.raw?.industry ?? 0,
    relationshipStatus: profile?.raw?.relationshipStatus ?? 0,
    sexuality: profile?.raw?.sexuality ?? 0,
    ethnicity: profile?.raw?.ethnicity ?? 0,
    datingStyle: profile?.raw?.datingStyle ?? 0,
    children: profile?.raw?.children ?? 0,
    wantsChildren: profile?.raw?.wantsChildren ?? 0,
    drinking: profile?.raw?.drinking ?? 0,
    smoking: profile?.raw?.smoking ?? 0,
    drugs: profile?.raw?.drugs ?? 0,
    lookingFor: profile?.raw?.lookingFor ?? 0,
    religion: profile?.raw?.religion ?? 0,
    pets: profile?.raw?.pets ?? 0,
    diet: profile?.raw?.diet ?? 0,
    languages: profile?.languages ? [...profile.languages] : [],
  };
}

function formatLangSummary(entries: LanguageEntry[]): string {
  if (!entries.length) return '';
  return entries.map((e) => `${getLanguageName(e.code)} (${proficiencyLabel(e.proficiency)})`).join(', ');
}

function getNativeLanguages(entries: LanguageEntry[]): LanguageEntry[] {
  return entries.filter((e) => e.proficiency === 7);
}

function getLearningLanguages(entries: LanguageEntry[]): LanguageEntry[] {
  return entries.filter((e) => e.proficiency > 0 && e.proficiency < 7);
}

// ── Sub-components ────────────────────────────────────────────────

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <Text style={styles.sectionHeader}>{title}</Text>
);

const FieldRow: React.FC<{
  label: string;
  value?: string;
  onPress: () => void;
}> = ({ label, value, onPress }) => (
  <TouchableOpacity style={styles.fieldRow} onPress={onPress} activeOpacity={0.7}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={styles.fieldRight}>
      <Text style={styles.fieldValue} numberOfLines={1}>
        {value || 'Not set'}
      </Text>
      <CaretRight size={16} color={colors.textMuted} />
    </View>
  </TouchableOpacity>
);

// ── Main Component ────────────────────────────────────────────────

export const EditProfileScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { pkpInfo, createAuthContext, signMessage } = useAuth();
  const { bridge } = useLit();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [state, setState] = useState<EditState>(initState(null));

  // Sheet state
  const [activePicker, setActivePicker] = useState<PickerField | null>(null);
  const [activeTextField, setActiveTextField] = useState<TextSheetField | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const [showNativeLanguages, setShowNativeLanguages] = useState(false);
  const [showLearningLanguages, setShowLearningLanguages] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [locationDraft, setLocationDraft] = useState<LocationDraft>({ query: '', selectedLabel: '' });

  // Load profile
  useEffect(() => {
    if (!pkpInfo?.ethAddress) return;
    fetchProfile(pkpInfo.ethAddress as `0x${string}`)
      .then((data) => {
        setProfile(data);
        setState(initState(data));
      })
      .catch((err) => console.error('[EditProfile] Load failed:', err))
      .finally(() => setLoading(false));
  }, [pkpInfo?.ethAddress]);

  // ── Text field sheet ──────────────────────────────────────────

  const openTextField = useCallback((field: TextSheetField) => {
    setTextDraft(state[field]);
    setActiveTextField(field);
  }, [state]);

  const commitTextField = useCallback(() => {
    if (activeTextField) {
      setState((s) => ({ ...s, [activeTextField]: textDraft }));
    }
    setActiveTextField(null);
  }, [activeTextField, textDraft]);

  // ── Picker ──────────────────────────────────────────────────

  const handlePickerSelect = useCallback((value: number) => {
    if (activePicker) {
      setState((s) => ({ ...s, [activePicker]: value }));
    }
  }, [activePicker]);

  // ── Location ──────────────────────────────────────────────────

  const openLocation = useCallback(() => {
    setLocationDraft({ query: state.location, selectedLabel: state.location });
    setShowLocation(true);
  }, [state.location]);

  const handleLocationSelect = useCallback((location: string) => {
    setState((s) => ({ ...s, location }));
    setShowLocation(false);
  }, []);

  // ── Languages ─────────────────────────────────────────────────

  const nativeEntries = getNativeLanguages(state.languages);
  const learningEntries = getLearningLanguages(state.languages);
  const nativeCodes = nativeEntries.map((e) => e.code);
  const learningCodes = learningEntries.map((e) => e.code);

  const handleNativeChange = useCallback((entries: LanguageEntry[]) => {
    setState((s) => {
      const learning = getLearningLanguages(s.languages);
      return { ...s, languages: [...entries, ...learning] };
    });
  }, []);

  const handleLearningChange = useCallback((entries: LanguageEntry[]) => {
    setState((s) => {
      const native = getNativeLanguages(s.languages);
      return { ...s, languages: [...native, ...entries] };
    });
  }, []);

  // ── Save ──────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!pkpInfo?.ethAddress || !pkpInfo?.pubkey || !bridge) {
      Alert.alert('Error', 'Not authenticated');
      return;
    }

    setSaving(true);
    try {
      await createAuthContext();
      const address = pkpInfo.ethAddress as `0x${string}`;

      // 1. Save ProfileV2 (structured data)
      const profileData: SetProfileData = {
        age: parseInt(state.age, 10) || undefined,
        genderNum: state.gender,
        heightCm: parseInt(state.heightCm, 10) || undefined,
        languages: state.languages.length > 0 ? state.languages : undefined,
        relocate: state.relocate,
        degree: state.degree,
        fieldBucket: state.fieldBucket,
        profession: state.profession,
        industry: state.industry,
        relationshipStatus: state.relationshipStatus,
        sexuality: state.sexuality,
        ethnicity: state.ethnicity,
        datingStyle: state.datingStyle,
        children: state.children,
        wantsChildren: state.wantsChildren,
        drinking: state.drinking,
        smoking: state.smoking,
        drugs: state.drugs,
        lookingFor: state.lookingFor,
        religion: state.religion,
        pets: state.pets,
        diet: state.diet,
      };

      const profileResult = await setProfileOnChain(
        profileData,
        address,
        bridge,
        pkpInfo.pubkey,
        signMessage,
      );
      if (!profileResult.success) {
        Alert.alert('Error', profileResult.error || 'Failed to save profile');
        setSaving(false);
        return;
      }

      // 2. Save RecordsV1 (text records) — only changed keys
      const primaryName = await getPrimaryName(address);
      if (primaryName?.label) {
        const node = computeNode(primaryName.label);

        const textRecords: [string, string, string | undefined][] = [
          ['description', state.bio, profile?.bio],
          ['heaven.location', state.location, profile?.location],
          ['url', state.url, profile?.url],
          ['com.twitter', state.twitter, profile?.twitter],
          ['com.github', state.github, profile?.github],
          ['org.telegram', state.telegram, profile?.telegram],
          ['heaven.school', state.school, profile?.school],
        ];

        for (const [key, newVal, oldVal] of textRecords) {
          if (newVal !== (oldVal ?? '')) {
            try {
              await setTextRecord(node, key, newVal, bridge, pkpInfo.pubkey, signMessage);
            } catch (err: any) {
              console.warn(`[EditProfile] Failed to save record ${key}:`, err?.message);
            }
          }
        }
      }

      Alert.alert('Saved', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      console.error('[EditProfile] Save error:', err);
      Alert.alert('Error', err?.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }, [pkpInfo, bridge, createAuthContext, signMessage, state, profile, navigation]);

  // ── Render ──────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Spinner label="Loading profile..." />
      </View>
    );
  }

  const activePickerConfig = activePicker ? PICKER_OPTIONS[activePicker] : null;
  const activeTextConfig = activeTextField ? TEXT_FIELD_CONFIG[activeTextField] : null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <IconButton variant="ghost" size="md" accessibilityLabel="Back" onPress={() => navigation.goBack()}>
          <CaretLeft size={20} color={colors.textPrimary} weight="bold" />
        </IconButton>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Edit Profile</Text>
        </View>
        <Button
          variant="default"
          size="sm"
          onPress={handleSave}
          disabled={saving}
          loading={saving}
        >
          Save
        </Button>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Bio & Links */}
        <SectionHeader title="Bio & Links" />
        <View style={styles.card}>
          <FieldRow label="Bio" value={state.bio} onPress={() => openTextField('bio')} />
          <FieldRow label="Website" value={state.url} onPress={() => openTextField('url')} />
          <FieldRow label="X / Twitter" value={state.twitter} onPress={() => openTextField('twitter')} />
          <FieldRow label="GitHub" value={state.github} onPress={() => openTextField('github')} />
          <FieldRow label="Telegram" value={state.telegram} onPress={() => openTextField('telegram')} />
        </View>

        {/* Basics */}
        <SectionHeader title="Basics" />
        <View style={styles.card}>
          <FieldRow label="Age" value={state.age || undefined} onPress={() => openTextField('age')} />
          <FieldRow label="Gender" value={ENUM_DISPLAY.gender[state.gender]} onPress={() => setActivePicker('gender')} />
          <FieldRow label="Location" value={state.location || undefined} onPress={openLocation} />
        </View>

        {/* Languages */}
        <SectionHeader title="Languages" />
        <View style={styles.card}>
          <FieldRow
            label="Native"
            value={formatLangSummary(nativeEntries)}
            onPress={() => setShowNativeLanguages(true)}
          />
          <FieldRow
            label="Learning"
            value={formatLangSummary(learningEntries)}
            onPress={() => setShowLearningLanguages(true)}
          />
        </View>

        {/* Education & Career */}
        <SectionHeader title="Education & Career" />
        <View style={styles.card}>
          <FieldRow label="School" value={state.school || undefined} onPress={() => openTextField('school')} />
          <FieldRow label="Degree" value={ENUM_DISPLAY.degree[state.degree]} onPress={() => setActivePicker('degree')} />
          <FieldRow label="Field of Study" value={ENUM_DISPLAY.fieldBucket[state.fieldBucket]} onPress={() => setActivePicker('fieldBucket')} />
          <FieldRow label="Profession" value={ENUM_DISPLAY.profession[state.profession]} onPress={() => setActivePicker('profession')} />
          <FieldRow label="Industry" value={ENUM_DISPLAY.industry[state.industry]} onPress={() => setActivePicker('industry')} />
        </View>

        {/* Dating */}
        <SectionHeader title="Dating" />
        <View style={styles.card}>
          <FieldRow label="Relationship Status" value={ENUM_DISPLAY.relationshipStatus[state.relationshipStatus]} onPress={() => setActivePicker('relationshipStatus')} />
          <FieldRow label="Height" value={state.heightCm ? `${state.heightCm} cm` : undefined} onPress={() => openTextField('heightCm')} />
          <FieldRow label="Flexibility" value={ENUM_DISPLAY.relocate[state.relocate]} onPress={() => setActivePicker('relocate')} />
          <FieldRow label="Looking For" value={ENUM_DISPLAY.lookingFor[state.lookingFor]} onPress={() => setActivePicker('lookingFor')} />
          <FieldRow label="Sexuality" value={ENUM_DISPLAY.sexuality[state.sexuality]} onPress={() => setActivePicker('sexuality')} />
          <FieldRow label="Ethnicity" value={ENUM_DISPLAY.ethnicity[state.ethnicity]} onPress={() => setActivePicker('ethnicity')} />
          <FieldRow label="Dating Style" value={ENUM_DISPLAY.datingStyle[state.datingStyle]} onPress={() => setActivePicker('datingStyle')} />
          <FieldRow label="Children" value={ENUM_DISPLAY.children[state.children]} onPress={() => setActivePicker('children')} />
          <FieldRow label="Wants Children" value={ENUM_DISPLAY.wantsChildren[state.wantsChildren]} onPress={() => setActivePicker('wantsChildren')} />
        </View>

        {/* Lifestyle */}
        <SectionHeader title="Lifestyle" />
        <View style={styles.card}>
          <FieldRow label="Drinking" value={ENUM_DISPLAY.drinking[state.drinking]} onPress={() => setActivePicker('drinking')} />
          <FieldRow label="Smoking" value={ENUM_DISPLAY.smoking[state.smoking]} onPress={() => setActivePicker('smoking')} />
          <FieldRow label="Drugs" value={ENUM_DISPLAY.drugs[state.drugs]} onPress={() => setActivePicker('drugs')} />
          <FieldRow label="Religion" value={ENUM_DISPLAY.religion[state.religion]} onPress={() => setActivePicker('religion')} />
          <FieldRow label="Pets" value={ENUM_DISPLAY.pets[state.pets]} onPress={() => setActivePicker('pets')} />
          <FieldRow label="Diet" value={ENUM_DISPLAY.diet[state.diet]} onPress={() => setActivePicker('diet')} />
        </View>
      </ScrollView>

      {/* Enum Picker */}
      {activePickerConfig && (
        <OptionPicker
          open={!!activePicker}
          onClose={() => setActivePicker(null)}
          title={activePickerConfig.title}
          options={activePickerConfig.options}
          selected={activePicker ? state[activePicker] : undefined}
          onSelect={handlePickerSelect}
        />
      )}

      {/* Text Field Sheet */}
      <BottomSheet
        open={!!activeTextField}
        onClose={() => setActiveTextField(null)}
        footer={
          <Button variant="default" size="md" fullWidth onPress={commitTextField}>
            Done
          </Button>
        }
      >
        {activeTextConfig && (
          <View style={styles.textSheetContent}>
            <Text style={styles.textSheetTitle}>{activeTextConfig.title}</Text>
            <TextField
              value={textDraft}
              onChangeText={setTextDraft}
              placeholder={activeTextConfig.placeholder}
              keyboardType={activeTextConfig.keyboardType}
              maxLength={activeTextConfig.maxLength}
              multiline={activeTextConfig.multiline}
              autoFocus
              inputContainerStyle={activeTextConfig.multiline ? styles.textArea : undefined}
              inputStyle={activeTextConfig.multiline ? styles.textAreaInput : undefined}
            />
            {activeTextField === 'bio' && (
              <Text style={styles.charCount}>{textDraft.length}/300</Text>
            )}
          </View>
        )}
      </BottomSheet>

      {/* Native Languages Sheet */}
      <BottomSheet
        open={showNativeLanguages}
        onClose={() => setShowNativeLanguages(false)}
        footer={
          <Button variant="default" size="md" fullWidth onPress={() => setShowNativeLanguages(false)}>
            Done
          </Button>
        }
      >
        <Text style={styles.textSheetTitle}>Native Languages</Text>
        <LanguagesStep
          mode="speak"
          entries={nativeEntries}
          excludeCodes={learningCodes}
          onChange={handleNativeChange}
          onContinue={() => setShowNativeLanguages(false)}
          submitting={false}
          error={null}
        />
      </BottomSheet>

      {/* Learning Languages Sheet */}
      <BottomSheet
        open={showLearningLanguages}
        onClose={() => setShowLearningLanguages(false)}
        footer={
          <Button variant="default" size="md" fullWidth onPress={() => setShowLearningLanguages(false)}>
            Done
          </Button>
        }
      >
        <Text style={styles.textSheetTitle}>Learning Languages</Text>
        <LanguagesStep
          mode="learn"
          entries={learningEntries}
          excludeCodes={nativeCodes}
          onChange={handleLearningChange}
          onContinue={() => setShowLearningLanguages(false)}
          submitting={false}
          error={null}
        />
      </BottomSheet>

      {/* Location Sheet */}
      <BottomSheet
        open={showLocation}
        onClose={() => setShowLocation(false)}
      >
        <Text style={styles.textSheetTitle}>Location</Text>
        <LocationStep
          value={locationDraft}
          onChange={setLocationDraft}
          onContinue={handleLocationSelect}
          submitting={false}
          error={null}
        />
      </BottomSheet>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sectionHeader: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  fieldLabel: {
    fontSize: fontSize.base,
    color: colors.textPrimary,
    fontWeight: '500',
    flex: 1,
  },
  fieldRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-end',
  },
  fieldValue: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    maxWidth: '85%',
  },
  textSheetContent: {
    gap: 12,
  },
  textSheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  textArea: {
    borderRadius: radii.lg,
    minHeight: 120,
    alignItems: 'flex-start',
  },
  textAreaInput: {
    textAlignVertical: 'top',
    paddingTop: 12,
    paddingBottom: 12,
  },
  charCount: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    textAlign: 'right',
  },
});
