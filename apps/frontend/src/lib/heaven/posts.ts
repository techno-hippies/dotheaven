/**
 * Posts — fetch posts from the dotheaven-activity subgraph + translate via Lit Action.
 *
 * Posts are created via PostsV1, engagement (likes, comments, translations, flags)
 * via EngagementV2. Both are indexed by the same subgraph.
 *
 * Translation flow:
 * 1. User clicks "Translate" on a post
 * 2. Frontend signs EIP-191 message authorizing the translation
 * 3. Lit Action calls LLM for translation, then broadcasts EngagementV2.translateFor()
 * 4. Subgraph indexes the TranslationAdded event
 * 5. All users see the cached translation for that language going forward
 */

import { SUBGRAPH_ACTIVITY } from '@heaven/core'
import { getLitClient } from '../lit/client'
import { POST_TRANSLATE_V1_CID } from '../lit/action-cids'
import type { PKPAuthContext } from '../lit/types'
import { getPrimaryName } from './registry'
import { resolveAvatarUri } from './avatar-resolver'

// ── Types ──────────────────────────────────────────────────────────

interface PostGQL {
  id: string              // postId (bytes32 hex)
  creator: string         // address
  contentType: number     // 0=text, 1=photo
  metadataUri: string     // IPFS URI
  ipfsHash: string | null
  isAdult: boolean
  likeCount: number
  commentCount: number
  flagCount: number
  blockTimestamp: string   // unix seconds
  transactionHash: string
  translations: TranslationGQL[]
}

interface TranslationGQL {
  langCode: string
  text: string
  translator: string
}

export interface FeedPostData {
  postId: string
  creator: string
  contentType: number
  metadataUri: string
  ipfsHash: string | null
  isAdult: boolean
  likeCount: number
  commentCount: number
  flagCount: number
  blockTimestamp: number
  transactionHash: string
  /** Post text (fetched from IPFS metadata) */
  text?: string
  /** ISO 639-1 language code detected at post creation (e.g. "en", "ja") */
  language?: string
  /** Photo URLs if contentType=1 */
  photoUrls?: string[]
  /** Translations keyed by ISO 639-1 code */
  translations: Record<string, string>
  /** Author display name (resolved from heaven name) */
  authorName: string
  /** Author handle (heaven name or shortened address) */
  authorHandle: string
  /** Author avatar URL */
  authorAvatarUrl?: string
}

export interface TranslateResult {
  success: boolean
  translatedText?: string
  txHash?: string
  error?: string
}

// ── Subgraph queries ──────────────────────────────────────────────

export async function fetchFeedPosts(opts: {
  first?: number
  skip?: number
} = {}): Promise<FeedPostData[]> {
  const first = opts.first ?? 50
  const skip = opts.skip ?? 0

  const query = `{
    posts(
      orderBy: blockTimestamp
      orderDirection: desc
      first: ${first}
      skip: ${skip}
    ) {
      id
      creator
      contentType
      metadataUri
      ipfsHash
      isAdult
      likeCount
      commentCount
      flagCount
      blockTimestamp
      transactionHash
      translations {
        langCode
        text
        translator
      }
    }
  }`

  const res = await fetch(SUBGRAPH_ACTIVITY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Activity subgraph query failed: ${res.status}`)
  const json = await res.json()

  const posts: PostGQL[] = json.data?.posts ?? []
  if (posts.length === 0) return []

  // Resolve metadata + author info in parallel
  return Promise.all(posts.map(resolvePost))
}

export async function fetchPost(postId: string): Promise<FeedPostData | null> {
  const query = `{
    post(id: "${postId}") {
      id
      creator
      contentType
      metadataUri
      ipfsHash
      isAdult
      likeCount
      commentCount
      flagCount
      blockTimestamp
      transactionHash
      translations {
        langCode
        text
        translator
      }
    }
  }`

  const res = await fetch(SUBGRAPH_ACTIVITY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) return null
  const json = await res.json()
  const post: PostGQL | null = json.data?.post
  if (!post) return null
  return resolvePost(post)
}

export async function fetchPostComments(postId: string): Promise<Array<{
  id: string
  author: string
  text: string
  blockTimestamp: number
}>> {
  const query = `{
    comments(
      where: { postId: "${postId}" }
      orderBy: blockTimestamp
      orderDirection: asc
      first: 100
    ) {
      id
      author
      text
      blockTimestamp
    }
  }`

  const res = await fetch(SUBGRAPH_ACTIVITY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) return []
  const json = await res.json()
  return (json.data?.comments ?? []).map((c: any) => ({
    ...c,
    blockTimestamp: parseInt(c.blockTimestamp),
  }))
}

// ── Post resolution ───────────────────────────────────────────────

interface IPAMetadata {
  title?: string
  description?: string
  text?: string
  image?: string
  mediaUrl?: string
  language?: string
  attributes?: Array<{ key: string; value: string }>
}

async function resolvePost(p: PostGQL): Promise<FeedPostData> {
  const addr = p.creator.toLowerCase() as `0x${string}`

  // Build translations map
  const translations: Record<string, string> = {}
  for (const t of p.translations) {
    translations[t.langCode] = t.text
  }

  // Resolve author name + avatar in parallel with metadata
  const [authorInfo, metadata] = await Promise.all([
    resolveAuthor(addr),
    p.ipfsHash ? fetchIPAMetadata(p.ipfsHash).catch(() => null) : null,
  ])

  // Extract text, language, and photos from metadata
  let text: string | undefined
  let language: string | undefined
  let photoUrls: string[] | undefined

  if (metadata) {
    // Text posts store content in `text`, photo posts in `description`
    text = metadata.text || metadata.description
    language = metadata.language
    const imageUrl = metadata.image || metadata.mediaUrl
    if (imageUrl) {
      const url = imageUrl.startsWith('ipfs://')
        ? `https://heaven.myfilebase.com/ipfs/${imageUrl.slice(7)}`
        : imageUrl
      photoUrls = [url]
    }
  }

  return {
    postId: p.id,
    creator: p.creator,
    contentType: p.contentType,
    metadataUri: p.metadataUri,
    ipfsHash: p.ipfsHash,
    isAdult: p.isAdult,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    flagCount: p.flagCount,
    blockTimestamp: parseInt(p.blockTimestamp),
    transactionHash: p.transactionHash,
    text,
    language,
    photoUrls,
    translations,
    authorName: authorInfo.name,
    authorHandle: authorInfo.handle,
    authorAvatarUrl: authorInfo.avatarUrl,
  }
}

async function resolveAuthor(addr: `0x${string}`): Promise<{
  name: string
  handle: string
  avatarUrl?: string
}> {
  try {
    const primaryName = await getPrimaryName(addr)
    if (primaryName?.label) {
      // Try to resolve avatar
      let avatarUrl: string | undefined
      try {
        const { getTextRecord, getPrimaryNode } = await import('./registry')
        const node = await getPrimaryNode(addr)
        if (node && node !== '0x' + '0'.repeat(64)) {
          const avatar = await getTextRecord(node as `0x${string}`, 'avatar').catch(() => '')
          if (avatar) {
            const resolved = await resolveAvatarUri(avatar).catch(() => null)
            avatarUrl = resolved ?? undefined
          }
        }
      } catch { /* degrade gracefully */ }
      return {
        name: primaryName.label,
        handle: `${primaryName.label}.heaven`,
        avatarUrl,
      }
    }
  } catch { /* degrade gracefully */ }

  return {
    name: shortenAddress(addr),
    handle: shortenAddress(addr),
  }
}

async function fetchIPAMetadata(ipfsHash: string): Promise<IPAMetadata | null> {
  const url = `https://heaven.myfilebase.com/ipfs/${ipfsHash}`
  const res = await fetch(url)
  if (!res.ok) return null
  return res.json()
}

// ── Translation via Lit Action ────────────────────────────────────

/** Language code → display name mapping for Lit Action */
const LANG_NAMES: Record<string, string> = {
  en: 'English', ja: 'Japanese', es: 'Spanish', fr: 'French',
  de: 'German', zh: 'Chinese', ko: 'Korean', pt: 'Portuguese',
  it: 'Italian', ru: 'Russian', ar: 'Arabic', hi: 'Hindi',
  nl: 'Dutch', sv: 'Swedish', pl: 'Polish', tr: 'Turkish',
  th: 'Thai', vi: 'Vietnamese', id: 'Indonesian', uk: 'Ukrainian',
}

/**
 * Detect the source language name from the post text (best guess).
 * Falls back to "English" if we can't determine.
 */
function detectSourceLang(text: string): string {
  // Simple heuristic: check for CJK characters
  if (/[\u3000-\u9fff\uf900-\ufaff]/.test(text)) {
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'Japanese'
    if (/[\uac00-\ud7af]/.test(text)) return 'Korean'
    return 'Chinese'
  }
  if (/[\u0600-\u06ff]/.test(text)) return 'Arabic'
  if (/[\u0900-\u097f]/.test(text)) return 'Hindi'
  if (/[\u0e00-\u0e7f]/.test(text)) return 'Thai'
  if (/[\u0400-\u04ff]/.test(text)) return 'Russian'
  return 'English'
}

/**
 * Compute SHA-256 hex digest of a string (browser-native).
 */
async function sha256Hex(message: string): Promise<string> {
  const encoder = new TextEncoder()
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(message))
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Translate a post via the Post Translate Lit Action.
 *
 * Flow:
 * 1. Sign EIP-191 message: "heaven:translate-post:{postId}:{textHash}:{targetLang}:{timestamp}:{nonce}"
 * 2. Execute Lit Action → LLM translates → sponsor PKP broadcasts EngagementV2.translateFor()
 * 3. Return translated text + txHash
 */
export async function translatePost(
  postId: string,
  originalText: string,
  targetLang: string,
  signMessage: (message: string) => Promise<string>,
  authContext: PKPAuthContext,
  pkpPublicKey: string,
): Promise<TranslateResult> {
  const litClient = await getLitClient()

  const timestamp = Date.now()
  const nonce = Math.random().toString(36).slice(2)
  const textHash = await sha256Hex(originalText)

  // Sign the authorization message
  const message = `heaven:translate-post:${postId}:${textHash}:${targetLang}:${timestamp}:${nonce}`
  const signature = await signMessage(message)

  const targetLangName = LANG_NAMES[targetLang] || targetLang
  const sourceLang = detectSourceLang(originalText)

  const result = await litClient.executeJs({
    ipfsId: POST_TRANSLATE_V1_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      postId,
      originalText,
      sourceLang,
      targetLang,
      targetLangName,
      signature,
      timestamp,
      nonce,
    },
  })

  const response = JSON.parse(result.response as string)
  return {
    success: response.success,
    translatedText: response.translatedText,
    txHash: response.txHash,
    error: response.error,
  }
}

/**
 * Get user's browser language as 2-letter ISO 639-1 code.
 */
export function getUserLang(): string {
  const lang = navigator.language || 'en'
  return lang.split('-')[0].toLowerCase()
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}
