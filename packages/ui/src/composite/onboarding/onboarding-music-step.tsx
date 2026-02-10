import type { Component } from 'solid-js'
import { createSignal, Show, For, createMemo } from 'solid-js'
import { cn } from '../../lib/classnames'
import { Button } from '../../primitives'

export interface OnboardingArtist {
  /** MusicBrainz artist MBID */
  mbid: string
  /** Artist display name */
  name: string
  /** Optional image URL (e.g. from Wikidata/Spotify) */
  imageUrl?: string
  /** Genre tags */
  genres?: string[]
}

export interface OnboardingMusicData {
  /** Artists the user selected */
  artists: OnboardingArtist[]
  /** Whether they connected Spotify */
  spotifyConnected: boolean
}

export interface OnboardingMusicStepProps {
  class?: string
  /** Called when user continues. Return false to prevent advancing. */
  onContinue?: (data: OnboardingMusicData) => Promise<boolean | void> | boolean | void
  /** Whether submission is in progress */
  submitting?: boolean
  /** Error message */
  error?: string | null
  /** Pre-filled claimed name for context */
  claimedName?: string
  /** Minimum artists to select (default: 3) */
  minArtists?: number
}

/**
 * Popular artists with known MBIDs for the fallback grid.
 * These are stable MusicBrainz IDs that won't change.
 */
export const POPULAR_ARTISTS: OnboardingArtist[] = [
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
]

/**
 * OnboardingMusicStep - Collect music taste during onboarding.
 *
 * Shows a curated grid of popular artists for the user to pick from.
 */
export const OnboardingMusicStep: Component<OnboardingMusicStepProps> = (props) => {
  const [selected, setSelected] = createSignal<Set<string>>(new Set())

  const minRequired = () => props.minArtists ?? 3

  const toggleArtist = (mbid: string) => {
    const next = new Set(selected())
    if (next.has(mbid)) {
      next.delete(mbid)
    } else {
      next.add(mbid)
    }
    setSelected(next)
  }

  const selectedArtists = createMemo(() =>
    POPULAR_ARTISTS.filter((a) => selected().has(a.mbid))
  )

  const canContinue = () => selected().size >= minRequired()

  const handleContinue = () => {
    props.onContinue?.({
      artists: selectedArtists(),
      spotifyConnected: false,
    })
  }

  return (
    <div class={cn('flex flex-col gap-5 w-full', props.class)}>
      <ArtistGrid
        artists={POPULAR_ARTISTS}
        selected={selected()}
        onToggle={toggleArtist}
        label="Pick artists you like"
        selectedCount={selected().size}
        minRequired={minRequired()}
      />

      <ContinueActions
        canContinue={canContinue()}
        submitting={props.submitting}
        minRemaining={minRequired() - selected().size}
        onContinue={handleContinue}
        error={props.error}
      />
    </div>
  )
}

// ── Shared sub-components ────────────────────────────────────────────

const ArtistGrid: Component<{
  artists: OnboardingArtist[]
  selected: Set<string>
  onToggle: (mbid: string) => void
  label: string
  selectedCount: number
  minRequired: number
}> = (props) => {
  const isSelected = (mbid: string) => props.selected.has(mbid)

  return (
    <>
      <div class="flex items-center justify-between">
        <label class="text-base font-medium text-[var(--text-secondary)]">
          {props.label}
        </label>
        <span class="text-xs text-[var(--text-muted)]">
          {props.selectedCount}/{props.minRequired} selected
        </span>
      </div>

      <div class="grid grid-cols-3 gap-3 max-h-[320px] overflow-y-auto p-0.5">
        <For each={props.artists}>
          {(artist) => (
            <button
              type="button"
              class={cn(
                'relative flex flex-col items-center gap-3 p-3 rounded-md transition-all duration-150',
                'text-center cursor-pointer',
                isSelected(artist.mbid)
                  ? 'bg-[var(--bg-highlight)] ring-2 ring-[var(--accent-blue)]'
                  : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-highlight)]',
              )}
              onClick={() => props.onToggle(artist.mbid)}
            >
              <div class={cn(
                'w-16 h-16 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0',
                'bg-[var(--bg-elevated)] transition-all',
                isSelected(artist.mbid) && 'ring-2 ring-[var(--accent-blue)] ring-offset-2 ring-offset-[var(--bg-highlight)]',
              )}>
                <Show
                  when={artist.imageUrl}
                  fallback={
                    <span class="text-lg font-bold text-[var(--text-muted)]">
                      {artist.name.charAt(0).toUpperCase()}
                    </span>
                  }
                >
                  <img src={artist.imageUrl!} alt={artist.name} class="w-full h-full object-cover" />
                </Show>
              </div>

              <span class={cn(
                'mt-0.5 text-base font-medium leading-snug line-clamp-2',
                isSelected(artist.mbid) ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]',
              )}>
                {artist.name}
              </span>

              <Show when={isSelected(artist.mbid)}>
                <div class="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[var(--accent-blue)] flex items-center justify-center">
                  <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                  </svg>
                </div>
              </Show>
            </button>
          )}
        </For>
      </div>
    </>
  )
}

const ContinueActions: Component<{
  canContinue: boolean
  submitting?: boolean
  minRemaining: number
  onContinue: () => void
  error?: string | null
}> = (props) => (
  <div class="flex flex-col gap-3">
    <Show when={props.error}>
      <div class="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--accent-coral)]/10 text-[var(--accent-coral)] text-base">
        <svg class="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
        </svg>
        <span>{props.error}</span>
      </div>
    </Show>
    <Button
      class="w-full h-12 text-lg"
      disabled={!props.canContinue || props.submitting}
      loading={props.submitting}
      onClick={props.onContinue}
    >
      {props.submitting
        ? 'Saving...'
        : props.canContinue
          ? 'Continue'
          : `Pick ${props.minRemaining} more`}
    </Button>
  </div>
)
