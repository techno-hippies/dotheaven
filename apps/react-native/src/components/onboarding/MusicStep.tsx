import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { CheckCircle } from 'phosphor-react-native';
import { colors, radii } from '../../lib/theme';
import { Button, ErrorBanner } from '../../ui';

export interface MusicStepProps {
  selectedMbids: string[];
  onSelectionChange: (selectedMbids: string[]) => void;
  onContinue: (artists: PopularArtist[]) => void;
  submitting: boolean;
  error: string | null;
}

export interface PopularArtist {
  mbid: string;
  name: string;
  genres?: string[];
}

const MIN_ARTISTS = 3;

export const POPULAR_ARTISTS: PopularArtist[] = [
  { mbid: 'f27ec8db-af05-4f36-916e-3571f4e088df', name: 'Michael Jackson', genres: ['Pop', 'R&B'] },
  { mbid: '164f0d73-1234-4e2c-8743-d77bf2191051', name: 'Kanye West', genres: ['Hip-Hop', 'Rap'] },
  { mbid: '20244d07-534f-4eff-b4d4-930878889f84', name: 'Taylor Swift', genres: ['Pop', 'Country'] },
  { mbid: 'e0140a67-e4d1-4f13-8a01-364355f95571', name: 'Kendrick Lamar', genres: ['Hip-Hop', 'Rap'] },
  { mbid: 'b8a7c51f-362c-4dcb-a259-bc6f0d2e85ff', name: 'Drake', genres: ['Hip-Hop', 'R&B'] },
  { mbid: '73e5e69d-3554-40d8-8571-ac1fca428388', name: 'The Weeknd', genres: ['R&B', 'Pop'] },
  { mbid: 'a74b1b7f-71a5-4011-9441-d0b5e4122711', name: 'Radiohead', genres: ['Alt Rock', 'Electronic'] },
  { mbid: '65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab', name: 'Metallica', genres: ['Metal', 'Rock'] },
  { mbid: '9c9f1380-2516-4fc9-a3e6-f9f61571db18', name: 'Muse', genres: ['Alt Rock', 'Electronic'] },
  { mbid: 'cc197bad-dc9c-440d-a5b5-d52ba2e14234', name: 'Coldplay', genres: ['Alt Rock', 'Pop'] },
  { mbid: '5b11f4ce-a62d-471e-81fc-a69a8278c7da', name: 'Nirvana', genres: ['Grunge', 'Rock'] },
  { mbid: 'a466c2a2-6517-42fb-a160-1087c3bafd9f', name: 'Tyler, the Creator', genres: ['Hip-Hop', 'Alt'] },
  { mbid: '859d0860-d480-4efd-970c-c05d5f1776b8', name: 'Beyonce', genres: ['R&B', 'Pop'] },
  { mbid: '122d63fc-8671-43e4-9752-34e846d62a9c', name: 'Billie Eilish', genres: ['Pop', 'Alt'] },
  { mbid: 'b071f9fa-14b0-4217-8e97-eb41da73f598', name: 'Frank Ocean', genres: ['R&B', 'Alt'] },
  { mbid: '8538e728-ca0b-4321-b7e5-cff6565dd4c0', name: 'Depeche Mode', genres: ['Synth-Pop', 'Electronic'] },
  { mbid: '9efff43b-3b29-4082-824e-bc82f646f93d', name: 'Daft Punk', genres: ['Electronic', 'House'] },
  { mbid: 'ada7a83c-e3e1-40f1-93f9-3f73571f7e73', name: 'Queen', genres: ['Rock', 'Classic'] },
  { mbid: '83d91898-7763-47d7-b03b-b92132375c47', name: 'Pink Floyd', genres: ['Prog Rock', 'Psych'] },
  { mbid: 'e795e03d-b5d5-4a5f-834d-162cfb308a2c', name: 'Ariana Grande', genres: ['Pop', 'R&B'] },
  { mbid: 'c8b03190-306c-4120-bb0b-6f2ebfc06ea9', name: 'The Beatles', genres: ['Rock', 'Pop'] },
  { mbid: '66fc5bf8-daa4-4241-b378-9bc9077571d1', name: 'Fleetwood Mac', genres: ['Rock', 'Pop'] },
  { mbid: '8bfac288-ccc5-448d-9573-c33ea2aa5c30', name: 'Red Hot Chili Peppers', genres: ['Rock', 'Funk'] },
  { mbid: 'a3cb23fc-acd3-4ce0-8f36-1e5aa6a18432', name: 'U2', genres: ['Rock', 'Alt Rock'] },
  // Cantopop / Mandopop
  { mbid: '11111111-1111-4111-8111-000000000001', name: 'Jay Chou', genres: ['Mandopop'] },
  { mbid: '11111111-1111-4111-8111-000000000002', name: 'JJ Lin', genres: ['Mandopop'] },
  { mbid: '11111111-1111-4111-8111-000000000003', name: 'G.E.M.', genres: ['Cantopop', 'Mandopop'] },
  { mbid: '11111111-1111-4111-8111-000000000004', name: 'Eason Chan', genres: ['Cantopop'] },
  { mbid: '11111111-1111-4111-8111-000000000005', name: 'Faye Wong', genres: ['Cantopop', 'Mandopop'] },
  { mbid: '11111111-1111-4111-8111-000000000006', name: 'Teresa Teng', genres: ['Mandopop'] },
  { mbid: '11111111-1111-4111-8111-000000000007', name: 'Mayday', genres: ['Mandopop Rock'] },
  // K-pop
  { mbid: '11111111-1111-4111-8111-000000000008', name: 'BTS', genres: ['K-pop'] },
  { mbid: '11111111-1111-4111-8111-000000000009', name: 'BLACKPINK', genres: ['K-pop'] },
  { mbid: '11111111-1111-4111-8111-000000000010', name: 'TWICE', genres: ['K-pop'] },
  { mbid: '11111111-1111-4111-8111-000000000011', name: 'NewJeans', genres: ['K-pop'] },
  { mbid: '11111111-1111-4111-8111-000000000012', name: 'EXO', genres: ['K-pop'] },
  { mbid: '11111111-1111-4111-8111-000000000013', name: 'SEVENTEEN', genres: ['K-pop'] },
  { mbid: '11111111-1111-4111-8111-000000000014', name: 'IU', genres: ['K-pop'] },
  { mbid: '11111111-1111-4111-8111-000000000015', name: 'Stray Kids', genres: ['K-pop'] },
  { mbid: '11111111-1111-4111-8111-000000000016', name: 'Red Velvet', genres: ['K-pop'] },
  { mbid: '11111111-1111-4111-8111-000000000017', name: 'BIGBANG', genres: ['K-pop'] },
  // Additional global artists
  { mbid: '11111111-1111-4111-8111-000000000018', name: 'Bad Bunny', genres: ['Latin Trap', 'Reggaeton'] },
  { mbid: '11111111-1111-4111-8111-000000000019', name: 'Karol G', genres: ['Reggaeton', 'Latin Pop'] },
  { mbid: '11111111-1111-4111-8111-000000000020', name: 'Ed Sheeran', genres: ['Pop'] },
  { mbid: '11111111-1111-4111-8111-000000000021', name: 'Rihanna', genres: ['Pop', 'R&B'] },
  { mbid: '11111111-1111-4111-8111-000000000022', name: 'Justin Bieber', genres: ['Pop'] },
  { mbid: '11111111-1111-4111-8111-000000000023', name: 'Eminem', genres: ['Hip-Hop', 'Rap'] },
  { mbid: '11111111-1111-4111-8111-000000000024', name: 'Post Malone', genres: ['Hip-Hop', 'Pop'] },
  { mbid: '11111111-1111-4111-8111-000000000025', name: 'Bruno Mars', genres: ['Pop', 'R&B'] },
  { mbid: '11111111-1111-4111-8111-000000000026', name: 'Lady Gaga', genres: ['Pop'] },
  { mbid: '11111111-1111-4111-8111-000000000027', name: 'SZA', genres: ['R&B'] },
  { mbid: '11111111-1111-4111-8111-000000000028', name: 'Adele', genres: ['Pop', 'Soul'] },
  { mbid: '11111111-1111-4111-8111-000000000029', name: 'Travis Scott', genres: ['Hip-Hop', 'Rap'] },
  { mbid: '11111111-1111-4111-8111-000000000030', name: 'Lana Del Rey', genres: ['Alt Pop'] },
  { mbid: '11111111-1111-4111-8111-000000000031', name: 'Doja Cat', genres: ['Pop', 'Hip-Hop'] },
  { mbid: '11111111-1111-4111-8111-000000000032', name: 'Olivia Rodrigo', genres: ['Pop'] },
  { mbid: '11111111-1111-4111-8111-000000000033', name: 'Tame Impala', genres: ['Psychedelic Pop', 'Indie'] },
  // More classics
  { mbid: '11111111-1111-4111-8111-000000000034', name: 'The Rolling Stones', genres: ['Rock', 'Classic'] },
  { mbid: '11111111-1111-4111-8111-000000000035', name: 'David Bowie', genres: ['Rock', 'Art Pop'] },
  { mbid: '11111111-1111-4111-8111-000000000036', name: 'Led Zeppelin', genres: ['Hard Rock', 'Classic'] },
  { mbid: '11111111-1111-4111-8111-000000000037', name: 'Elton John', genres: ['Pop Rock', 'Classic'] },
];

export const MusicStep: React.FC<MusicStepProps> = ({
  selectedMbids,
  onSelectionChange,
  onContinue,
  submitting,
  error,
}) => {
  const selected = useMemo(() => new Set(selectedMbids), [selectedMbids]);

  const toggleArtist = useCallback((mbid: string) => {
    const next = new Set(selected);
    if (next.has(mbid)) {
      next.delete(mbid);
    } else {
      next.add(mbid);
    }
    onSelectionChange(Array.from(next));
  }, [selected, onSelectionChange]);

  const canContinue = selectedMbids.length >= MIN_ARTISTS;

  const handleContinue = useCallback(() => {
    const artists = POPULAR_ARTISTS.filter((a) => selected.has(a.mbid));
    onContinue(artists);
  }, [selected, onContinue]);

  return (
    <View style={styles.container}>
      {/* Manual artist picker */}
      <View style={styles.headerRow}>
        <Text style={styles.label}>Pick artists you like</Text>
        <Text style={styles.counter}>
          {selectedMbids.length}/{MIN_ARTISTS} selected
        </Text>
      </View>

      <ScrollView style={styles.gridScroll} contentContainerStyle={styles.grid}>
        {POPULAR_ARTISTS.map((artist) => {
          const isSelected = selected.has(artist.mbid);
          return (
            <TouchableOpacity
              key={artist.mbid}
              style={[styles.artistCard, isSelected && styles.artistCardSelected]}
              onPress={() => toggleArtist(artist.mbid)}
              activeOpacity={0.7}
            >
              <View style={[styles.avatar, isSelected && styles.avatarSelected]}>
                <Text style={styles.avatarText}>
                  {artist.name.charAt(0).toUpperCase()}
                </Text>
              </View>

              <Text
                style={[styles.artistName, isSelected && styles.artistNameSelected]}
                numberOfLines={2}
              >
                {artist.name}
              </Text>

              {isSelected && (
                <View style={styles.checkIcon}>
                  <CheckCircle size={20} color={colors.accentBlue} weight="fill" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Error */}
      {error && (
        <ErrorBanner message={error} />
      )}

      {/* Continue button */}
      <Button
        variant="default"
        size="md"
        fullWidth
        onPress={handleContinue}
        disabled={!canContinue || submitting}
        loading={submitting}
      >
        {canContinue ? 'Continue' : `Pick ${MIN_ARTISTS - selectedMbids.length} more`}
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  label: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
  counter: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'right',
  },
  gridScroll: {
    flex: 1,
    width: '100%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    paddingBottom: 8,
  },
  artistCard: {
    width: '32%',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurface,
  },
  artistCardSelected: {
    backgroundColor: colors.bgHighlightHover,
    borderWidth: 2,
    borderColor: colors.accentBlue,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSelected: {
    borderWidth: 2,
    borderColor: colors.accentBlue,
  },
  avatarText: {
    color: colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
  },
  artistName: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 2,
  },
  artistNameSelected: {
    color: colors.textPrimary,
  },
  checkIcon: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
});
