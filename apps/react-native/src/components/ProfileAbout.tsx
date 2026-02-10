import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  GlobeSimple,
  GraduationCap,
  Heart,
  Lightning,
  LinkSimple,
  Translate,
  TwitterLogo,
  GithubLogo,
  TelegramLogo,
} from 'phosphor-react-native';
import { colors, fontSize, radii } from '../lib/theme';
import { Card } from '../ui';
import type { ProfileData } from '../lib/profile';
import { getLanguageName, proficiencyLabel } from '../lib/heaven-constants';

// ── Sub-components ────────────────────────────────────────────────

const Row: React.FC<{ label: string; value?: string }> = ({ label, value }) => {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
};

const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
}> = ({ icon, title }) => (
  <View style={styles.sectionHeader}>
    {icon}
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>
);

// ── Main component ────────────────────────────────────────────────

export const ProfileAbout: React.FC<{ profile: ProfileData }> = ({ profile }) => {
  const hasLanguages = profile.languages && profile.languages.length > 0;
  const hasEducation = profile.school || profile.degree || profile.fieldBucket || profile.profession || profile.industry;
  const hasDating = profile.relationshipStatus || profile.heightCm || profile.relocate ||
    profile.sexuality || profile.ethnicity || profile.datingStyle ||
    profile.children || profile.wantsChildren || profile.lookingFor;
  const hasLifestyle = profile.hobbies || profile.skills || profile.drinking ||
    profile.smoking || profile.drugs || profile.religion || profile.pets || profile.diet;
  const hasLinks = profile.url || profile.twitter || profile.github || profile.telegram;

  const hasAnySections = hasLanguages || hasEducation || hasDating || hasLifestyle || hasLinks;
  if (!hasAnySections) return null;

  return (
    <View style={styles.container}>
      {/* Languages */}
      {hasLanguages ? (
        <Card style={styles.card}>
          <View style={styles.cardInner}>
            <SectionHeader
              icon={<Translate size={16} color={colors.accentBlue} />}
              title="Languages"
            />
            <View style={styles.langList}>
              {profile.languages!.map((entry) => (
                <View key={entry.code} style={styles.langChip}>
                  <Text style={styles.langName}>{getLanguageName(entry.code)}</Text>
                  <Text style={styles.langProf}>{proficiencyLabel(entry.proficiency)}</Text>
                </View>
              ))}
            </View>
          </View>
        </Card>
      ) : null}

      {/* Education & Career */}
      {hasEducation ? (
        <Card style={styles.card}>
          <View style={styles.cardInner}>
            <SectionHeader
              icon={<GraduationCap size={16} color={colors.accentBlue} />}
              title="Education & Career"
            />
            <Row label="School" value={profile.school} />
            <Row label="Degree" value={profile.degree} />
            <Row label="Field" value={profile.fieldBucket} />
            <Row label="Profession" value={profile.profession} />
            <Row label="Industry" value={profile.industry} />
          </View>
        </Card>
      ) : null}

      {/* Dating */}
      {hasDating ? (
        <Card style={styles.card}>
          <View style={styles.cardInner}>
            <SectionHeader
              icon={<Heart size={16} color={colors.accentCoral} />}
              title="Dating"
            />
            <Row label="Status" value={profile.relationshipStatus} />
            <Row label="Height" value={profile.heightCm ? `${profile.heightCm} cm` : undefined} />
            <Row label="Flexibility" value={profile.relocate} />
            <Row label="Sexuality" value={profile.sexuality} />
            <Row label="Ethnicity" value={profile.ethnicity} />
            <Row label="Style" value={profile.datingStyle} />
            <Row label="Children" value={profile.children} />
            <Row label="Wants Children" value={profile.wantsChildren} />
            <Row label="Looking For" value={profile.lookingFor} />
          </View>
        </Card>
      ) : null}

      {/* Lifestyle */}
      {hasLifestyle ? (
        <Card style={styles.card}>
          <View style={styles.cardInner}>
            <SectionHeader
              icon={<Lightning size={16} color={colors.accentPurple} />}
              title="Lifestyle"
            />
            <Row label="Hobbies" value={profile.hobbies} />
            <Row label="Skills" value={profile.skills} />
            <Row label="Drinking" value={profile.drinking} />
            <Row label="Smoking" value={profile.smoking} />
            <Row label="Drugs" value={profile.drugs} />
            <Row label="Religion" value={profile.religion} />
            <Row label="Pets" value={profile.pets} />
            <Row label="Diet" value={profile.diet} />
          </View>
        </Card>
      ) : null}

      {/* Links */}
      {hasLinks ? (
        <Card style={styles.card}>
          <View style={styles.cardInner}>
            <SectionHeader
              icon={<LinkSimple size={16} color={colors.accentBlue} />}
              title="Links"
            />
            {profile.url ? (
              <LinkRow
                icon={<GlobeSimple size={14} color={colors.textMuted} />}
                label={profile.url.replace(/^https?:\/\//, '')}
                url={profile.url}
              />
            ) : null}
            {profile.twitter ? (
              <LinkRow
                icon={<TwitterLogo size={14} color={colors.textMuted} />}
                label={`@${profile.twitter}`}
                url={`https://x.com/${profile.twitter}`}
              />
            ) : null}
            {profile.github ? (
              <LinkRow
                icon={<GithubLogo size={14} color={colors.textMuted} />}
                label={profile.github}
                url={`https://github.com/${profile.github}`}
              />
            ) : null}
            {profile.telegram ? (
              <LinkRow
                icon={<TelegramLogo size={14} color={colors.textMuted} />}
                label={`@${profile.telegram}`}
                url={`https://t.me/${profile.telegram}`}
              />
            ) : null}
          </View>
        </Card>
      ) : null}
    </View>
  );
};

const LinkRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  url: string;
}> = ({ icon, label, url }) => (
  <TouchableOpacity
    style={styles.linkRow}
    onPress={() => {
      const href = url.startsWith('http') ? url : `https://${url}`;
      Linking.openURL(href).catch(() => {});
    }}
    activeOpacity={0.7}
  >
    {icon}
    <Text style={styles.linkText} numberOfLines={1}>{label}</Text>
  </TouchableOpacity>
);

// ── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    gap: 12,
    paddingTop: 4,
  },
  card: {},
  cardInner: {
    padding: 16,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  rowLabel: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    flex: 1,
  },
  rowValue: {
    fontSize: fontSize.base,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'right',
  },
  langList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  langName: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  langProf: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  linkText: {
    fontSize: fontSize.base,
    color: colors.accentBlue,
    flex: 1,
  },
});
