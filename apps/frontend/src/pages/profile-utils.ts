import type { ProfileInput } from '@heaven/ui'
import type { TranslationKey } from '@heaven/i18n'
import { isAddress, zeroAddress } from 'viem'
import { computeNode, getTextRecord, getAddr, resolveEnsName, getPrimaryName, resolveAvatarUri, resolveIpfsUri } from '../lib/heaven'

// ── Types ──

export type ParsedProfileId =
  | { type: 'address'; address: `0x${string}` }
  | { type: 'heaven'; label: string }
  | { type: 'ens'; name: string }
  | { type: 'hns'; name: string; tld: string }
  | { type: 'unknown'; input: string }

export type ResolvedProfileId = {
  type: ParsedProfileId['type']
  address: `0x${string}`
  label?: string
  name?: string
  node?: `0x${string}`
}

// ── Helpers ──

export function formatTimeAgo(ts: number, t?: (key: TranslationKey, ...args: any[]) => string): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ts
  if (t) {
    if (diff < 60) return t('time.justNow')
    if (diff < 3600) return t('time.minutesAgo', { count: Math.floor(diff / 60) })
    if (diff < 86400) return t('time.hoursAgo', { count: Math.floor(diff / 3600) })
    if (diff < 604800) return t('time.daysAgo', { count: Math.floor(diff / 86400) })
  } else {
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  }
  return new Date(ts * 1000).toLocaleDateString()
}

export const FILEBASE_GATEWAY = 'https://heaven.myfilebase.com/ipfs'

export const isValidCid = (cid: string | undefined | null): cid is string =>
  !!cid && (cid.startsWith('Qm') || cid.startsWith('bafy'))

export function parseProfileId(rawId: string | undefined): ParsedProfileId {
  const id = (rawId ?? '').trim()
  if (!id) return { type: 'unknown', input: '' }

  if (isAddress(id, { strict: false })) {
    return { type: 'address', address: id as `0x${string}` }
  }

  const lower = id.toLowerCase()
  if (lower.includes('.')) {
    if (lower.endsWith('.eth')) {
      return { type: 'ens', name: id }
    }
    if (lower.endsWith('.heaven')) {
      const label = lower.slice(0, -'.heaven'.length)
      return { type: 'heaven', label }
    }
    const tld = lower.slice(lower.lastIndexOf('.') + 1)
    return { type: 'hns', name: id, tld }
  }

  return { type: 'heaven', label: lower }
}

export async function resolveProfileId(parsed: ParsedProfileId): Promise<ResolvedProfileId> {
  switch (parsed.type) {
    case 'address': {
      const reverse = await getPrimaryName(parsed.address).catch(() => null)
      if (reverse) {
        return { type: 'address', address: parsed.address, label: reverse.label, node: reverse.node }
      }
      return { type: 'address', address: parsed.address }
    }
    case 'ens': {
      const address = await resolveEnsName(parsed.name)
      if (!address) {
        throw new Error(`ENS name not found: ${parsed.name}`)
      }
      return { type: 'ens', address, name: parsed.name }
    }
    case 'heaven': {
      const label = parsed.label.toLowerCase()
      if (!label) {
        throw new Error('Invalid Heaven name')
      }
      const node = computeNode(label)
      const address = await getAddr(node)
      if (!address || address === zeroAddress) {
        throw new Error(`Heaven name not found: ${label}.heaven`)
      }
      return { type: 'heaven', address, label, node }
    }
    case 'hns':
      throw new Error(`Unsupported TLD: .${parsed.tld}`)
    default:
      throw new Error('Invalid profile identifier')
  }
}

export async function applyHeavenRecords(profile: ProfileInput, node: `0x${string}`): Promise<ProfileInput> {
  const enriched: ProfileInput = { ...profile }
  const [avatar, header, description, url, twitter, github, telegram, , , location, school] = await Promise.all([
    getTextRecord(node, 'avatar').catch(() => ''),
    getTextRecord(node, 'header').catch(() => ''),
    getTextRecord(node, 'description').catch(() => ''),
    getTextRecord(node, 'url').catch(() => ''),
    getTextRecord(node, 'com.twitter').catch(() => ''),
    getTextRecord(node, 'com.github').catch(() => ''),
    getTextRecord(node, 'org.telegram').catch(() => ''),
    getTextRecord(node, 'heaven.hobbies').catch(() => ''),
    getTextRecord(node, 'heaven.skills').catch(() => ''),
    getTextRecord(node, 'heaven.location').catch(() => ''),
    getTextRecord(node, 'heaven.school').catch(() => ''),
  ])

  if (avatar) {
    const resolved = await resolveAvatarUri(avatar)
    enriched.avatar = resolved || resolveIpfsUri(avatar)
  }
  if (header) enriched.coverPhoto = resolveIpfsUri(header)
  if (description) enriched.bio = description
  if (url) enriched.url = url
  if (twitter) enriched.twitter = twitter
  if (github) enriched.github = github
  if (telegram) enriched.telegram = telegram

  if (location) enriched.locationCityId = location
  if (school) enriched.school = school

  return enriched
}
