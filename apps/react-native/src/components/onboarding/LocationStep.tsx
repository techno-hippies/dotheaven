import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { colors, radii } from '../../lib/theme';
import { Button, ErrorBanner } from '../../ui';

interface LocationStepProps {
  value: LocationDraft;
  onChange: (value: LocationDraft) => void;
  onContinue: (location: string) => void;
  submitting: boolean;
  error: string | null;
}

export interface LocationDraft {
  query: string;
  selectedLabel: string;
}

interface LocationResult {
  label: string;
  osm_id: number;
  lat: number;
  lng: number;
}

// ── Photon location search ─────────────────────────────────────

const US_STATE_ABBR: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
  'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
  'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
  'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
  'District of Columbia': 'DC',
};

const COUNTRY_ABBR: Record<string, string> = {
  'United States': 'US', 'United States of America': 'US',
  'United Kingdom': 'UK', 'Great Britain': 'UK',
  'Canada': 'CA', 'Australia': 'AU', 'New Zealand': 'NZ',
  'Germany': 'DE', 'France': 'FR', 'Spain': 'ES', 'Italy': 'IT',
  'Netherlands': 'NL', 'Belgium': 'BE', 'Switzerland': 'CH', 'Austria': 'AT',
  'Sweden': 'SE', 'Norway': 'NO', 'Denmark': 'DK', 'Finland': 'FI',
  'Poland': 'PL', 'Ireland': 'IE', 'Portugal': 'PT', 'Greece': 'GR',
  'Japan': 'JP', 'China': 'CN', 'India': 'IN', 'Brazil': 'BR', 'Mexico': 'MX',
};

const ALLOWED_TYPES = new Set([
  'city', 'town', 'village', 'municipality', 'suburb', 'district', 'borough', 'neighbourhood',
]);

let lastRequestTime = 0;

async function searchPhoton(query: string): Promise<LocationResult[]> {
  if (!query || query.length < 2) return [];

  const now = Date.now();
  const wait = 1000 - (now - lastRequestTime);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestTime = Date.now();

  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Heaven/1.0' } });
  if (!res.ok) throw new Error(`Photon API error: ${res.status}`);

  const data = await res.json();
  const results: LocationResult[] = [];

  for (const feature of data.features || []) {
    const props = feature.properties || {};
    const type = props.type || props.osm_value || '';
    if (!ALLOWED_TYPES.has(type)) continue;

    const [lng, lat] = feature.geometry?.coordinates || [0, 0];
    const parts: string[] = [];
    if (props.name) parts.push(props.name);
    if (props.state && props.state !== props.name) {
      parts.push(US_STATE_ABBR[props.state] || props.state);
    }
    if (props.country) {
      parts.push(COUNTRY_ABBR[props.country] || props.country);
    }

    const label = parts.join(', ');
    if (!label || !lat || !lng) continue;

    results.push({ label, osm_id: props.osm_id || 0, lat, lng });
    if (results.length >= 6) break;
  }

  return results;
}

// ── Component ──────────────────────────────────────────────────

export const LocationStep: React.FC<LocationStepProps> = ({
  value,
  onChange,
  onContinue,
  submitting,
  error,
}) => {
  const [results, setResults] = useState<LocationResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  const handleChange = useCallback((text: string) => {
    onChange({ query: text, selectedLabel: '' });

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    const nextRequestSeq = ++requestSeqRef.current;
    const queryForRequest = text;
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await searchPhoton(queryForRequest);
        if (requestSeqRef.current !== nextRequestSeq) return;
        setResults(r);
      } catch (err) {
        console.warn('[Location] Search failed:', err);
        if (requestSeqRef.current !== nextRequestSeq) return;
        setResults([]);
      } finally {
        if (requestSeqRef.current !== nextRequestSeq) return;
        setSearching(false);
      }
    }, 300);
  }, [onChange]);

  const handleSelect = useCallback((result: LocationResult) => {
    onChange({ query: result.label, selectedLabel: result.label });
    setResults([]);
    Keyboard.dismiss();
  }, [onChange]);

  const handleClear = useCallback(() => {
    requestSeqRef.current += 1;
    onChange({ query: '', selectedLabel: '' });
    setResults([]);
    setSearching(false);
  }, [onChange]);

  useEffect(() => {
    return () => {
      requestSeqRef.current += 1;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <View style={styles.container}>
      {/* Search input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={value.query}
          onChangeText={handleChange}
          placeholder="e.g. Tokyo, New York, London"
          placeholderTextColor={colors.textMuted}
          autoFocus
          editable={!submitting}
        />
        {searching && (
          <ActivityIndicator size="small" color={colors.textMuted} style={styles.spinner} />
        )}
        {!searching && value.query.length > 0 && (
          <TouchableOpacity onPress={handleClear} style={styles.clearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Results dropdown */}
      {results.length > 0 && (
        <View style={styles.dropdown}>
          <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
            {results.map((result) => (
              <TouchableOpacity
                key={`${result.osm_id}-${result.label}`}
                style={styles.resultItem}
                onPress={() => handleSelect(result)}
              >
                <Text style={styles.pin}>📍</Text>
                <Text style={styles.resultText} numberOfLines={1}>{result.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.attribution}>
            <Text style={styles.attributionText}>Data © OpenStreetMap contributors</Text>
          </View>
        </View>
      )}

      {/* Error */}
      {error && (
        <ErrorBanner message={error} />
      )}

      {/* Spacer to push buttons down */}
      <View style={styles.spacer} />

      {/* Continue button */}
      <Button
        variant="default"
        size="md"
        fullWidth
        onPress={() => onContinue(value.selectedLabel)}
        disabled={!value.selectedLabel || submitting}
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
    gap: 12,
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
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: 0,
  },
  spinner: {
    marginLeft: 8,
  },
  clearBtn: {
    marginLeft: 8,
    padding: 4,
  },
  clearText: {
    color: colors.textMuted,
    fontSize: 16,
  },
  dropdown: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    overflow: 'hidden',
  },
  resultsList: {
    maxHeight: 280,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderDefault,
  },
  pin: {
    fontSize: 16,
  },
  resultText: {
    color: colors.textPrimary,
    fontSize: 16,
    flex: 1,
  },
  attribution: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
  },
  attributionText: {
    color: colors.textMuted,
    fontSize: 15,
  },
  spacer: {
    flex: 1,
  },
});
