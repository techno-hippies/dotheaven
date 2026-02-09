import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { RoomPanel, type RoomPanelProps } from './room-panel'
import { RoomParticipants } from './room-participants'
import { CreateRoomDrawer } from './create-room-drawer'
import { Button } from '../../primitives/button'

const meta: Meta = {
  title: 'Room/Room',
  parameters: { layout: 'centered' },
}

export default meta

// ── Sample data ─────────────────────────────────────────────────────

const sampleParticipants = [
  { id: '1', name: 'camille', avatarUrl: 'https://placewaifu.com/image/110', isOnStage: true, isSpeaking: true },
  { id: '2', name: 'erik', avatarUrl: 'https://placewaifu.com/image/111', isOnStage: true, isSpeaking: false },
  { id: '3', name: 'AI', avatarUrl: 'https://placewaifu.com/image/120', isOnStage: true, isSpeaking: false },
  { id: '4', name: 'yuki', avatarUrl: 'https://placewaifu.com/image/112', isOnStage: false },
  { id: '5', name: 'matheus', avatarUrl: 'https://placewaifu.com/image/113', isOnStage: false },
  { id: '6', name: 'sophie', avatarUrl: 'https://placewaifu.com/image/114', isOnStage: false },
  { id: '7', name: 'hana', avatarUrl: 'https://placewaifu.com/image/115', isOnStage: false },
  { id: '8', name: 'luca', avatarUrl: 'https://placewaifu.com/image/116', isOnStage: false },
]

const sampleSong = {
  title: 'Bohemian Rhapsody',
  artist: 'Queen',
  coverUrl: 'https://placewaifu.com/image/48',
  elapsed: '1:47',
}

const sampleLyrics = [
  { text: 'Is this the real life?', state: 'past' as const },
  { text: 'Is this just fantasy?', state: 'past' as const },
  { text: 'Caught in a landslide', state: 'current' as const },
  { text: 'No escape from reality', state: 'upcoming' as const },
  { text: 'Open your eyes', state: 'upcoming' as const },
  { text: 'Look up to the skies and see', state: 'upcoming' as const },
]

const sampleLyricsWithTranslation = [
  { text: 'Is this the real life?', state: 'past' as const },
  { text: 'Is this just fantasy?', state: 'past' as const },
  { text: 'Caught in a landslide', state: 'current' as const, translation: '陷入山崩' },
  { text: 'No escape from reality', state: 'upcoming' as const },
  { text: 'Open your eyes', state: 'upcoming' as const },
  { text: 'Look up to the skies and see', state: 'upcoming' as const },
]

const noop = () => {}

// ── Host Stories ────────────────────────────────────────────────────

export const MobileRoom: StoryObj = {
  name: 'Host — Mobile',
  render: () => (
    <div style={{ width: '390px', height: '844px', overflow: 'hidden' }}>
      <RoomPanel
        role="host"
        size="compact"
        duration="12:34"
        song={sampleSong}
        lyrics={sampleLyrics}
        participants={sampleParticipants}
        onSettingsClick={noop}
        onClose={noop}
        onSongPickerClick={() => console.log('Song picker')}
        onMicToggle={() => console.log('Mic toggle')}
        onParticipantClick={(id) => console.log('Participant:', id)}
      />
    </div>
  ),
}

export const DesktopRoom: StoryObj = {
  name: 'Host — Desktop',
  render: () => (
    <div style={{ width: '800px', height: '900px', overflow: 'hidden' }}>
      <RoomPanel
        role="host"
        size="full"
        duration="12:34"
        song={sampleSong}
        lyrics={sampleLyrics}
        participants={sampleParticipants}
        onSettingsClick={noop}
        onClose={noop}
        onSongPickerClick={() => console.log('Song picker')}
        onMicToggle={() => console.log('Mic toggle')}
        onParticipantClick={(id) => console.log('Participant:', id)}
      />
    </div>
  ),
}

// ── Viewer Stories ──────────────────────────────────────────────────

export const ViewerMobile: StoryObj = {
  name: 'Viewer — Mobile',
  render: () => (
    <div style={{ width: '390px', height: '844px', overflow: 'hidden' }}>
      <RoomPanel
        role="viewer"
        size="compact"
        song={sampleSong}
        lyrics={sampleLyrics}
        participants={sampleParticipants}
        onClose={noop}
        onReact={(e) => console.log('React:', e)}

        onRequestStage={() => console.log('Request stage')}
        onParticipantClick={(id) => console.log('Participant:', id)}
      />
    </div>
  ),
}

export const ViewerWithTranslation: StoryObj = {
  name: 'Viewer — Translation (Mandarin)',
  render: () => (
    <div style={{ width: '390px', height: '844px', overflow: 'hidden' }}>
      <RoomPanel
        role="viewer"
        size="compact"
        song={sampleSong}
        lyrics={sampleLyricsWithTranslation}
        participants={sampleParticipants}
        onClose={noop}
        onReact={(e) => console.log('React:', e)}

        onRequestStage={() => console.log('Request stage')}
        onParticipantClick={(id) => console.log('Participant:', id)}
      />
    </div>
  ),
}

export const ViewerDesktop: StoryObj = {
  name: 'Viewer — Desktop',
  render: () => (
    <div style={{ width: '800px', height: '900px', overflow: 'hidden' }}>
      <RoomPanel
        role="viewer"
        size="full"
        song={sampleSong}
        lyrics={sampleLyricsWithTranslation}
        participants={sampleParticipants}
        onClose={noop}
        onReact={(e) => console.log('React:', e)}

        onRequestStage={() => console.log('Request stage')}
        onParticipantClick={(id) => console.log('Participant:', id)}
      />
    </div>
  ),
}

// ── Other Stories ───────────────────────────────────────────────────

export const NoSong: StoryObj = {
  name: 'No Song Playing',
  render: () => (
    <div style={{ width: '390px', height: '844px', overflow: 'hidden' }}>
      <RoomPanel
        role="host"
        size="compact"
        duration="0:00"
        participants={sampleParticipants.slice(0, 3)}
        onSettingsClick={noop}
        onClose={noop}
        onSongPickerClick={noop}
        onMicToggle={noop}
      />
    </div>
  ),
}

export const MicMuted: StoryObj = {
  name: 'Host — Mic Muted',
  render: () => (
    <div style={{ width: '390px', height: '844px', overflow: 'hidden' }}>
      <RoomPanel
        role="host"
        size="compact"
        duration="5:21"
        song={sampleSong}
        lyrics={sampleLyrics}
        participants={sampleParticipants.slice(0, 4)}
        isMuted
        onSettingsClick={noop}
        onClose={noop}
        onSongPickerClick={noop}
        onMicToggle={noop}
      />
    </div>
  ),
}

export const ParticipantsOnly: StoryObj = {
  name: 'Participants Row',
  render: () => (
    <div style={{ padding: '2rem', background: 'var(--bg-surface)', 'border-radius': '6px' }}>
      <div class="flex flex-col gap-6">
        <div>
          <p class="text-base text-[var(--text-secondary)] mb-3">Stage + Audience (with overflow)</p>
          <RoomParticipants
            participants={sampleParticipants}
            maxVisibleAudience={3}
            onParticipantClick={(id) => console.log('Click:', id)}
          />
        </div>
        <div>
          <p class="text-base text-[var(--text-secondary)] mb-3">Stage only (host + AI)</p>
          <RoomParticipants
            participants={[
              { id: '1', name: 'camille', avatarUrl: 'https://placewaifu.com/image/110', isOnStage: true, isSpeaking: true },
              { id: '3', name: 'AI', avatarUrl: 'https://placewaifu.com/image/120', isOnStage: true },
            ]}
          />
        </div>
        <div>
          <p class="text-base text-[var(--text-secondary)] mb-3">Full room (no overflow)</p>
          <RoomParticipants
            participants={sampleParticipants.slice(0, 6)}
            maxVisibleAudience={5}
          />
        </div>
      </div>
    </div>
  ),
}

export const CreateRoom: StoryObj = {
  name: 'Create Room Drawer',
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <div style={{ width: '390px', height: '844px', position: 'relative', background: 'var(--bg-page)' }}>
        <div class="p-4">
          <Button variant="default" onClick={() => setOpen(true)}>Create a Room</Button>
        </div>
        <CreateRoomDrawer
          open={open()}
          onOpenChange={setOpen}
          onGoLive={(opts) => console.log('Go Live:', opts)}
        />
      </div>
    )
  },
}
