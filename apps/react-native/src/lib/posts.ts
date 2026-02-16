/**
 * Posts data layer — fetch posts from dotheaven-activity subgraph.
 * Port of apps/web/src/lib/heaven/posts.ts (read-only parts).
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { NativeModules, Platform } from 'react-native';
import {
  MEGA_RPC,
  IPFS_GATEWAY,
  REGISTRY_V1,
  RECORDS_V1,
  ZERO_HASH,
  resolveIpfsOrHttpUri,
} from './heaven-constants';

// ── Constants ─────────────────────────────────────────────────────

const ACTIVITY_ENDPOINT =
  'https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/14.0.0/gn';

const registryAbi = parseAbi([
  'function primaryName(address) external view returns (string label, bytes32 parentNode)',
  'function primaryNode(address) external view returns (bytes32)',
]);

const recordsAbi = parseAbi([
  'function text(bytes32 node, string calldata key) external view returns (string)',
]);

// Singleton RPC client
let _client: ReturnType<typeof createPublicClient> | null = null;
function getClient() {
  if (!_client) {
    _client = createPublicClient({
      transport: http(MEGA_RPC),
    });
  }
  return _client;
}

// ── Types ─────────────────────────────────────────────────────────

interface PostGQL {
  id: string;
  creator: string;
  contentType: number;
  metadataUri: string;
  ipfsHash: string | null;
  isAdult: boolean;
  likeCount: number;
  commentCount: number;
  flagCount: number;
  blockTimestamp: string;
  transactionHash: string;
  translations: Array<{ langCode: string; text: string; translator: string }>;
}

export interface FeedPostData {
  postId: string;
  creator: string;
  contentType: number;
  text?: string;
  language?: string;
  photoUrls?: string[];
  likeCount: number;
  commentCount: number;
  blockTimestamp: number;
  transactionHash: string;
  translations: Record<string, string>;
  authorName: string;
  authorHandle: string;
  authorAvatarUrl?: string;
}

// ── Fetch posts ───────────────────────────────────────────────────

export async function fetchFeedPosts(opts: { first?: number } = {}): Promise<FeedPostData[]> {
  const first = opts.first ?? 50;

  const query = `{
    posts(
      orderBy: blockTimestamp
      orderDirection: desc
      first: ${first}
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
  }`;

  const res = await fetch(ACTIVITY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Subgraph query failed: ${res.status}`);
  const json = await res.json();
  const posts: PostGQL[] = json.data?.posts ?? [];
  if (posts.length === 0) return [];

  return Promise.all(posts.map(resolvePost));
}

// ── Resolve individual post ───────────────────────────────────────

async function resolvePost(p: PostGQL): Promise<FeedPostData> {
  const addr = p.creator.toLowerCase() as `0x${string}`;

  const translations: Record<string, string> = {};
  for (const t of p.translations) {
    translations[t.langCode] = t.text;
  }

  const [authorInfo, metadata] = await Promise.all([
    resolveAuthor(addr),
    p.ipfsHash ? fetchIPFSMetadata(p.ipfsHash).catch(() => null) : null,
  ]);

  let text: string | undefined;
  let language: string | undefined;
  let photoUrls: string[] | undefined;

  if (metadata) {
    text = metadata.text || metadata.description;
    language = metadata.language;
    const imageUrl = metadata.image || metadata.mediaUrl;
    if (imageUrl) {
      const url = imageUrl.startsWith('ipfs://')
        ? `${IPFS_GATEWAY}${imageUrl.slice(7)}`
        : imageUrl;
      photoUrls = [url];
    }
  }

  return {
    postId: p.id,
    creator: p.creator,
    contentType: p.contentType,
    text,
    language,
    photoUrls,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    blockTimestamp: parseInt(p.blockTimestamp),
    transactionHash: p.transactionHash,
    translations,
    authorName: authorInfo.name,
    authorHandle: authorInfo.handle,
    authorAvatarUrl: authorInfo.avatarUrl,
  };
}

// ── Author resolution ─────────────────────────────────────────────

async function resolveAuthor(addr: `0x${string}`): Promise<{
  name: string;
  handle: string;
  avatarUrl?: string;
}> {
  try {
    const client = getClient();
    const [label] = await client.readContract({
      address: REGISTRY_V1,
      abi: registryAbi,
      functionName: 'primaryName',
      args: [addr],
    });

    if (label) {
      let avatarUrl: string | undefined;
      try {
        const node = await client.readContract({
          address: REGISTRY_V1,
          abi: registryAbi,
          functionName: 'primaryNode',
          args: [addr],
        });
        if (node && node !== ZERO_HASH) {
          const avatar = await client.readContract({
            address: RECORDS_V1,
            abi: recordsAbi,
            functionName: 'text',
            args: [node, 'avatar'],
          }).catch(() => '');
          if (avatar) {
            avatarUrl = resolveAvatarUri(avatar);
          }
        }
      } catch {}
      return { name: label, handle: `${label}.heaven`, avatarUrl };
    }
  } catch {}

  return {
    name: `${addr.slice(0, 6)}...${addr.slice(-4)}`,
    handle: `${addr.slice(0, 6)}...${addr.slice(-4)}`,
  };
}

function resolveAvatarUri(uri: string): string | undefined {
  return resolveIpfsOrHttpUri(uri);
}

// ── IPFS metadata ─────────────────────────────────────────────────

interface IPFSMetadata {
  title?: string;
  description?: string;
  text?: string;
  image?: string;
  mediaUrl?: string;
  language?: string;
}

async function fetchIPFSMetadata(ipfsHash: string): Promise<IPFSMetadata | null> {
  try {
    const res = await fetch(`${IPFS_GATEWAY}${ipfsHash}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────

export function getUserLang(): string {
  try {
    if (Platform.OS === 'ios') {
      const locale = NativeModules.SettingsManager?.settings?.AppleLocale
        || NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
        || 'en';
      return locale.split(/[-_]/)[0].toLowerCase();
    }
    const locale = NativeModules.I18nManager?.localeIdentifier || 'en';
    return locale.split(/[-_]/)[0].toLowerCase();
  } catch {
    return 'en';
  }
}

export function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(ts * 1000).toLocaleDateString();
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
