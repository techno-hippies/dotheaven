import { type Component, Show, For } from 'solid-js'
import { useParams } from '@solidjs/router'
import { createQuery } from '@tanstack/solid-query'
import { MediaHeader, TrackList, PlayButton } from '@heaven/ui'
import { fetchArtistPageData, artistTracksToTracks } from '../lib/heaven'
import { useTrackPlayback, usePlaylistDialog, buildMenuActions } from '../hooks/useTrackListActions'
import { AddToPlaylistDialog } from '../components/AddToPlaylistDialog'

export const ArtistPage: Component = () => {
  const params = useParams<{ mbid: string }>()

  const playback = useTrackPlayback()
  const plDialog = usePlaylistDialog()
  const menuActions = buildMenuActions(plDialog)

  const query = createQuery(() => ({
    queryKey: ['artist', params.mbid],
    queryFn: () => fetchArtistPageData(params.mbid),
    enabled: !!params.mbid,
    staleTime: 5 * 60_000, // artist data is fairly stable
  }))

  const info = () => query.data?.info ?? null
  const tracks = () => query.data ? artistTracksToTracks(query.data.tracks) : []
  const totalScrobbles = () => query.data?.totalScrobbles ?? 0
  const uniqueListeners = () => query.data?.uniqueListeners ?? 0

  const handlePlay = () => {
    playback.playFirst(tracks())
  }

  const imageUrl = () => {
    const i = info()
    if (!i) return undefined
    // Use Wikimedia Commons image if available from MusicBrainz links
    if (i.links.image) return i.links.image
    return undefined
  }

  return (
    <Show when={!query.isLoading} fallback={
      <div class="h-full flex items-center justify-center">
        <p class="text-[var(--text-muted)]">Loading...</p>
      </div>
    }>
      <Show when={info()} fallback={
        <div class="h-full flex items-center justify-center">
          <Show when={query.isFetching} fallback={
            <p class="text-[var(--text-muted)]">Artist not found</p>
          }>
            <div class="flex items-center gap-3 text-[var(--text-muted)]">
              <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Loading artist...</span>
            </div>
          </Show>
        </div>
      }>
        {(artist) => (
          <div class="h-full overflow-y-auto">
            <MediaHeader
              type="artist"
              title={artist().name}
              description={artist().disambiguation ?? undefined}
              coverSrc={imageUrl()}
              stats={{
                songCount: tracks().length || undefined,
                followers: uniqueListeners() || undefined,
              }}
              actionsSlot={
                <div class="flex items-center gap-4">
                  <Show when={tracks().length > 0}>
                    <PlayButton onClick={handlePlay} aria-label="Play artist" />
                  </Show>
                </div>
              }
            />

            {/* Artist details section */}
            <div class="px-4 md:px-8 pb-4">
              {/* Genres */}
              <Show when={artist().genres.length > 0}>
                <div class="flex flex-wrap gap-2 mb-4">
                  <For each={artist().genres}>
                    {(genre) => (
                      <span class="px-3 py-1 rounded-md bg-[var(--bg-highlight)] text-[var(--text-secondary)] text-sm">
                        {genre}
                      </span>
                    )}
                  </For>
                </div>
              </Show>

              {/* Meta row: country, type, life span */}
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-muted)] mb-4">
                <Show when={artist().type}>
                  <span>{artist().type}</span>
                </Show>
                <Show when={artist().area || artist().country}>
                  <span>{artist().area ?? artist().country}</span>
                </Show>
                <Show when={artist().lifeSpan?.begin}>
                  <span>
                    {artist().lifeSpan!.begin}
                    {artist().lifeSpan?.ended && artist().lifeSpan?.end
                      ? ` \u2013 ${artist().lifeSpan!.end}`
                      : ' \u2013 present'}
                  </span>
                </Show>
                <Show when={totalScrobbles() > 0}>
                  <span>{totalScrobbles().toLocaleString()} scrobbles</span>
                </Show>
              </div>

              {/* External links */}
              <Show when={Object.keys(artist().links).length > 0}>
                <div class="flex flex-wrap gap-3 mb-6">
                  <For each={Object.entries(artist().links)}>
                    {([key, url]) => (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-sm text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] hover:underline"
                      >
                        {linkLabel(key)}
                      </a>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            {/* Track list */}
            <Show when={tracks().length > 0} fallback={
              <div class="px-8 py-12 text-center">
                <p class="text-[var(--text-muted)] text-lg">No scrobbles found</p>
                <p class="text-[var(--text-muted)] text-sm mt-2">
                  Scrobble tracks by this artist to see them here
                </p>
              </div>
            }>
              <div class="px-4 md:px-8 pb-2">
                <h2 class="text-lg font-semibold text-[var(--text-primary)] mb-2">
                  Popular tracks
                </h2>
              </div>
              <TrackList
                tracks={tracks()}
                activeTrackId={playback.activeTrackId()}
                selectedTrackId={playback.selectedTrackId()}
                onTrackClick={(track) => playback.select(track)}
                onTrackPlay={(track) => playback.play(track)}
                showScrobbleStatus
                menuActions={menuActions}
              />
            </Show>
          </div>
        )}
      </Show>
      <AddToPlaylistDialog
        open={plDialog.open()}
        onOpenChange={plDialog.setOpen}
        track={plDialog.track()}
      />
    </Show>
  )
}

function linkLabel(key: string): string {
  const labels: Record<string, string> = {
    website: 'Website',
    wikidata: 'Wikidata',
    spotify: 'Spotify',
    soundcloud: 'SoundCloud',
    twitter: 'X/Twitter',
    instagram: 'Instagram',
    facebook: 'Facebook',
    image: 'Image',
  }
  return labels[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}
