import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { ScrobblesPage } from './ScrobblesPage'
import { MockAuthProvider } from '../providers/__mocks__/AuthContext'
import type { ScrobbleEntry } from '../lib/heaven'

const meta = {
  title: 'Pages/ScrobblesPage',
  component: ScrobblesPage,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ScrobblesPage>

export default meta
type Story = StoryObj<typeof meta>

// Mock scrobble data
const mockVerifiedScrobbles: ScrobbleEntry[] = [
  {
    id: '1',
    identifier: '7b8f8b3e-1c7a-4d4e-9b5a-3f2e1d9c8b7a',
    kind: 'mbid',
    status: 'verified',
    playedAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    txHash: '0x1234567890abcdef',
    title: 'The Sign (with CamelPhat)',
    artist: 'Anyma, CamelPhat',
    album: 'Genesys',
    albumCover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop',
  },
  {
    id: '2',
    identifier: '0x1234567890123456789012345678901234567890',
    kind: 'ipId',
    status: 'verified',
    playedAt: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
    txHash: '0xabcdef1234567890',
    title: 'Inner Light',
    artist: 'Elderbrook, Bob Moses',
    album: 'Inner Light',
    albumCover: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=100&h=100&fit=crop',
  },
  {
    id: '3',
    identifier: '9c8e7d6f-2b3a-4c5d-8e9f-1a2b3c4d5e6f',
    kind: 'mbid',
    status: 'verified',
    playedAt: Math.floor(Date.now() / 1000) - 86400, // 1 day ago
    txHash: '0xfedcba0987654321',
    title: 'On My Knees',
    artist: 'RÜFÜS DU SOL',
    album: 'Surrender',
    albumCover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop',
  },
]

const mockUnidentifiedScrobbles: ScrobbleEntry[] = [
  {
    id: '4',
    identifier: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    kind: 'meta',
    status: 'unidentified',
    playedAt: Math.floor(Date.now() / 1000) - 1800, // 30 min ago
    txHash: '0x9876543210fedcba',
  },
  {
    id: '5',
    identifier: '0x1111111111111111111111111111111111111111111111111111111111111111',
    kind: 'meta',
    status: 'unidentified',
    playedAt: Math.floor(Date.now() / 1000) - 5400, // 90 min ago
    txHash: '0x2222222222222222',
  },
]

const mockMixedScrobbles: ScrobbleEntry[] = [
  ...mockVerifiedScrobbles.slice(0, 2),
  ...mockUnidentifiedScrobbles.slice(0, 1),
  mockVerifiedScrobbles[2],
  mockUnidentifiedScrobbles[1],
]

// Mock the fetchScrobbleEntries function in window
function setupMockFetch(entries: ScrobbleEntry[], userAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e') {
  // Override fetch for the Goldsky endpoint
  const originalFetch = window.fetch
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('goldsky.com')) {
      // Return mock data
      await new Promise((resolve) => setTimeout(resolve, 500)) // Simulate network delay
      return new Response(
        JSON.stringify({
          data: {
            scrobbles: entries.filter((e) => e.kind !== 'meta').map((e) => ({
              id: e.id,
              user: userAddress.toLowerCase(),
              scrobbleId: e.id,
              identifier: e.identifier,
              kind: e.kind === 'mbid' ? 1 : 2,
              timestamp: String(e.playedAt),
              blockNumber: '12345',
              blockTimestamp: String(e.playedAt),
              transactionHash: e.txHash,
            })),
            scrobbleMetaEntries: entries.filter((e) => e.kind === 'meta').map((e) => ({
              id: e.id,
              user: userAddress.toLowerCase(),
              scrobbleId: e.id,
              metaHash: e.identifier,
              timestamp: String(e.playedAt),
              blockNumber: '12345',
              blockTimestamp: String(e.playedAt),
              transactionHash: e.txHash,
            })),
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    return originalFetch(input, init)
  }
}

export const Default: Story = {
  render: () => {
    setupMockFetch(mockMixedScrobbles)
    return (
      <MockAuthProvider>
        <ScrobblesPage />
      </MockAuthProvider>
    )
  },
}

export const VerifiedOnly: Story = {
  render: () => {
    setupMockFetch(mockVerifiedScrobbles)
    return (
      <MockAuthProvider>
        <ScrobblesPage />
      </MockAuthProvider>
    )
  },
}

export const UnidentifiedOnly: Story = {
  render: () => {
    setupMockFetch(mockUnidentifiedScrobbles)
    return (
      <MockAuthProvider>
        <ScrobblesPage />
      </MockAuthProvider>
    )
  },
}

export const Empty: Story = {
  render: () => {
    setupMockFetch([])
    return (
      <MockAuthProvider>
        <ScrobblesPage />
      </MockAuthProvider>
    )
  },
}

export const Loading: Story = {
  render: () => {
    // Mock a never-resolving fetch to show loading state
    window.fetch = async () => {
      await new Promise(() => {}) // Never resolves
      return new Response('{}')
    }
    return (
      <MockAuthProvider>
        <ScrobblesPage />
      </MockAuthProvider>
    )
  },
}

export const LongHistory: Story = {
  render: () => {
    // Create a long list by repeating the mixed scrobbles
    const longList = [
      ...mockMixedScrobbles,
      ...mockMixedScrobbles.map((s, i) => ({ ...s, id: `${s.id}-dup1-${i}`, playedAt: s.playedAt - 86400 })),
      ...mockMixedScrobbles.map((s, i) => ({ ...s, id: `${s.id}-dup2-${i}`, playedAt: s.playedAt - 172800 })),
      ...mockMixedScrobbles.map((s, i) => ({ ...s, id: `${s.id}-dup3-${i}`, playedAt: s.playedAt - 259200 })),
    ]
    setupMockFetch(longList)
    return (
      <MockAuthProvider>
        <ScrobblesPage />
      </MockAuthProvider>
    )
  },
}
