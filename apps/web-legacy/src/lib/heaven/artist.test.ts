import { describe, expect, test } from 'bun:test'
import {
  payloadToMbid,
  mbidToPayload,
  normalizeArtistName,
  splitArtistNames,
  artistMatchesTarget,
} from './artist'

describe('artist matching helpers', () => {
  test('normalizeArtistName folds case, punctuation, and accents', () => {
    expect(normalizeArtistName('Beyoncé')).toBe('beyonce')
    expect(normalizeArtistName('Jay-Z')).toBe('jay z')
    expect(normalizeArtistName('  The   Weeknd ')).toBe('the weeknd')
  })

  test('splitArtistNames handles common separators', () => {
    const parts = splitArtistNames('Kanye West, Kid Cudi & Ty Dolla $ign')
    expect(parts).toContain('kanye west')
    expect(parts).toContain('kid cudi')
    expect(parts).toContain('ty dolla sign')
  })

  test('artistMatchesTarget matches contributors', () => {
    const jay = normalizeArtistName('Jay-Z')
    const kid = normalizeArtistName('Kid Cudi')
    const kanye = normalizeArtistName('Kanye West')

    expect(artistMatchesTarget('Kanye West feat. Jay-Z', jay)).toBe(true)
    expect(artistMatchesTarget('Kanye West & Kid Cudi', kid)).toBe(true)
    expect(artistMatchesTarget('Kanye West', kanye)).toBe(true)
    expect(artistMatchesTarget('Kanye West', jay)).toBe(false)
  })
})

describe('MBID payload codec', () => {
  test('round-trips MBID -> payload -> MBID', () => {
    const mbid = 'f27ec8db-af05-4f36-916e-3571f4e088df'
    const payload = mbidToPayload(mbid)
    expect(payloadToMbid(payload)).toBe(mbid)
  })

  test('payloadToMbid returns null for empty payloads', () => {
    expect(payloadToMbid('0x' + '0'.repeat(64))).toBeNull()
  })
})
