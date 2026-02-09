import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { StorageCard, type StorageStatus } from './storage-card'
import { AddFundsDialog } from './add-funds-dialog'
import { TrackList, type Track } from './track-list'
import { Button } from '../../primitives/button'
import { IconButton } from '../../primitives/icon-button'
import { ArrowLeft } from '../../icons'

// ── Sample data ─────────────────────────────────────────────────────────

const mockTracks: Track[] = [
  { id: '1', title: 'Midnight City', artist: 'M83', album: 'Hurry Up, We\'re Dreaming', dateAdded: '2/3/2026', duration: '4:03', albumCover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop' },
  { id: '2', title: 'Intro', artist: 'The xx', album: 'xx', dateAdded: '2/1/2026', duration: '2:07', albumCover: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=100&h=100&fit=crop' },
  { id: '3', title: 'Digital Love', artist: 'Daft Punk', album: 'Discovery', dateAdded: '1/28/2026', duration: '4:58', albumCover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop' },
  { id: '4', title: 'Breathe', artist: 'Telepopmusik', album: 'Genetic World', dateAdded: '1/25/2026', duration: '4:47', albumCover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=100&h=100&fit=crop' },
  { id: '5', title: 'Teardrop', artist: 'Massive Attack', album: 'Mezzanine', dateAdded: '1/20/2026', duration: '5:29', albumCover: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=100&h=100&fit=crop' },
  { id: '6', title: 'Fade Into You', artist: 'Mazzy Star', album: 'So Tonight That I Might See', dateAdded: '1/15/2026', duration: '4:54', albumCover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop' },
  { id: '7', title: 'Glory Box', artist: 'Portishead', album: 'Dummy', dateAdded: '1/10/2026', duration: '5:01', albumCover: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=100&h=100&fit=crop' },
  { id: '8', title: 'Halcyon', artist: 'Orbital', album: 'Orbital 2', dateAdded: '1/5/2026', duration: '9:27', albumCover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop' },
]

const healthyStatus: StorageStatus = {
  balance: '$5.00',
  balanceRaw: 5000000000000000000n,
  operatorApproved: true,
  monthlyCost: '$0.12',
  daysRemaining: 1250,
  ready: true,
}

const lowBalanceStatus: StorageStatus = {
  balance: '$0.08',
  balanceRaw: 80000000000000000n,
  operatorApproved: true,
  monthlyCost: '$0.12',
  daysRemaining: 5,
  ready: true,
}

const zeroStatus: StorageStatus = {
  balance: '$0.00',
  balanceRaw: 0n,
  operatorApproved: false,
  monthlyCost: '$0.00',
  daysRemaining: 0,
  ready: false,
}

const menuActions = {
  onAddToPlaylist: (track: any) => console.log('Add to playlist:', track),
  onAddToQueue: (track: any) => console.log('Add to queue:', track),
  onGoToArtist: (track: any) => console.log('Go to artist:', track),
}

// ── Meta ────────────────────────────────────────────────────────────────

const meta = {
  title: 'Media/CloudLibrary',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta

// ── Cloud Library Page ──────────────────────────────────────────────────

/** Cloud Library — healthy storage, tracks loaded */
export const Default: StoryObj = {
  render: () => {
    const [addFundsOpen, setAddFundsOpen] = createSignal(false)

    return (
      <div class="h-screen overflow-y-auto" style={{ background: 'var(--bg-page)' }}>
        {/* Storage section — full width, no card */}
        <div class="px-6 pt-4 pb-6 ">
          <StorageCard
            status={healthyStatus}
            loading={false}
            error={null}
            onAddFunds={() => setAddFundsOpen(true)}
          />
        </div>

        {/* Track list */}
        <TrackList
          tracks={mockTracks}
          showDateAdded
          menuActions={menuActions}
          onTrackClick={(t) => console.log('click', t.title)}
          onTrackPlay={(t) => console.log('play', t.title)}
        />

        <AddFundsDialog
          open={addFundsOpen()}
          onOpenChange={setAddFundsOpen}
          currentBalance="$5.00"
          daysRemaining={1250}
          balanceNum={5}
          loading={false}
          onDeposit={(amount) => { console.log('Deposit:', amount); setAddFundsOpen(false) }}
        />
      </div>
    )
  },
}

/** Cloud Library — low balance warning */
export const LowBalance: StoryObj = {
  render: () => {
    const [addFundsOpen, setAddFundsOpen] = createSignal(false)

    return (
      <div class="h-screen overflow-y-auto" style={{ background: 'var(--bg-page)' }}>
        <div class="px-6 pt-4 pb-6 ">
          <StorageCard
            status={lowBalanceStatus}
            loading={false}
            error={null}
            onAddFunds={() => setAddFundsOpen(true)}
            footerText="Storage balance is used for Filecoin uploads. Keep at least 30 days funded to avoid interruptions."
          />
        </div>
        <TrackList
          tracks={mockTracks}
          showDateAdded
          menuActions={menuActions}
          onTrackClick={(t) => console.log('click', t.title)}
          onTrackPlay={(t) => console.log('play', t.title)}
        />
        <AddFundsDialog
          open={addFundsOpen()}
          onOpenChange={setAddFundsOpen}
          currentBalance="$0.08"
          daysRemaining={5}
          balanceNum={0.08}
          loading={false}
          onDeposit={(amount) => { console.log('Deposit:', amount); setAddFundsOpen(false) }}
        />
      </div>
    )
  },
}

/** Storage Card — low balance warning (standalone) */
export const StorageCardLowBalance: StoryObj = {
  render: () => {
    const [addFundsOpen, setAddFundsOpen] = createSignal(false)

    return (
      <div style={{ background: 'var(--bg-page)', padding: '24px', 'max-width': '640px' }}>
        <StorageCard
          status={lowBalanceStatus}
          loading={false}
          error={null}
          onAddFunds={() => setAddFundsOpen(true)}
          footerText="Storage balance is used for Filecoin uploads. Keep at least 30 days funded to avoid interruptions."
        />
        <AddFundsDialog
          open={addFundsOpen()}
          onOpenChange={setAddFundsOpen}
          currentBalance="$0.08"
          daysRemaining={5}
          balanceNum={0.08}
          loading={false}
          onDeposit={(amount) => { console.log('Deposit:', amount); setAddFundsOpen(false) }}
        />
      </div>
    )
  },
}

/** Cloud Library — mobile layout */
export const Mobile: StoryObj = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    chromatic: { viewports: [375] },
  },
  render: () => {
    const [addFundsOpen, setAddFundsOpen] = createSignal(false)

    return (
      <div class="h-screen overflow-y-auto" style={{ background: 'var(--bg-page)', 'max-width': '375px' }}>
        {/* Storage section */}
        <div class="px-4 pt-4 pb-4 ">
          <StorageCard
            status={healthyStatus}
            loading={false}
            error={null}
            onAddFunds={() => setAddFundsOpen(true)}
          />
        </div>

        {/* Track list — force compact */}
        <TrackList
          tracks={mockTracks}
          forceCompact
          menuActions={menuActions}
          onTrackClick={(t) => console.log('click', t.title)}
          onTrackPlay={(t) => console.log('play', t.title)}
        />

        <AddFundsDialog
          open={addFundsOpen()}
          onOpenChange={setAddFundsOpen}
          currentBalance="$5.00"
          daysRemaining={1250}
          balanceNum={5}
          loading={false}
          onDeposit={(amount) => { console.log('Deposit:', amount); setAddFundsOpen(false) }}
        />
      </div>
    )
  },
}

/** Cloud Library — first time, zero balance, empty track list with header */
export const FirstTime: StoryObj = {
  render: () => {
    const [addFundsOpen, setAddFundsOpen] = createSignal(false)

    return (
      <div class="h-screen overflow-y-auto" style={{ background: 'var(--bg-page)' }}>
        <div class="px-6 pt-4 pb-6 ">
          <StorageCard
            status={zeroStatus}
            loading={false}
            error={null}
            onAddFunds={() => setAddFundsOpen(true)}
          />
        </div>
        {/* Empty track list — shows header columns for affordance */}
        <TrackList
          tracks={[]}
          showDateAdded
          menuActions={menuActions}
        />
        <AddFundsDialog
          open={addFundsOpen()}
          onOpenChange={setAddFundsOpen}
          currentBalance="$0.00"
          daysRemaining={null}
          balanceNum={0}
          loading={false}
          onDeposit={(amount) => { console.log('Deposit:', amount); setAddFundsOpen(false) }}
        />
      </div>
    )
  },
}

/** Cloud Library — loading */
export const Loading: StoryObj = {
  render: () => (
    <div class="h-screen overflow-y-auto" style={{ background: 'var(--bg-page)' }}>
      <div class="px-6 pt-4 pb-6">
        <StorageCard
          status={null}
          loading={true}
          error={null}
          onAddFunds={() => {}}
        />
      </div>
    </div>
  ),
}

// ── Add Funds Dialog ────────────────────────────────────────────────────

/** Add Funds dialog (resize to mobile for drawer variant) */
export const AddFundsOpen: StoryObj = {
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <div style={{ background: 'var(--bg-page)', padding: '24px' }}>
        <Button variant="outline" onClick={() => setOpen(true)}>Open Add Funds</Button>
        <AddFundsDialog
          open={open()}
          onOpenChange={setOpen}
          currentBalance="$5.00"
          daysRemaining={1250}
          balanceNum={5}
          loading={false}
          onDeposit={(amount) => { console.log('Deposit:', amount); setOpen(false) }}
        />
      </div>
    )
  },
}

/** Add Funds — deposit in progress */
export const AddFundsLoading: StoryObj = {
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <div style={{ background: 'var(--bg-page)', padding: '24px' }}>
        <Button variant="outline" onClick={() => setOpen(true)}>Open Add Funds</Button>
        <AddFundsDialog
          open={open()}
          onOpenChange={setOpen}
          currentBalance="$0.08"
          daysRemaining={5}
          balanceNum={0.08}
          loading={true}
          onDeposit={() => {}}
        />
      </div>
    )
  },
}
