import { Show, For, type Component, type JSX, createSignal, createMemo } from 'solid-js'
import {
  AlbumCover,
  Avatar,
  ProfileInfoSection,
  ProfileAboutSidebar,
  Scheduler,
  type ProfileInput,
  type EnsProfile,
  type VerificationData,
  type TimeSlot,
  type SessionSlotData,
  type SessionRequestData,
  type DayAvailability,
  type SchedulerTimeSlot,
} from '@heaven/ui'
import { ProfileHeader, type ProfileHeaderProps } from './profile-header'
import { ProfileTabs, type ProfileTab } from './profile-tabs'

export interface ProfileScrobble {
  id: string
  title: string
  artist: string
  album: string
  timestamp: string
  trackId: string
  coverUrl?: string
  durationSec?: number
}

export interface ProfilePageProps extends Omit<ProfileHeaderProps, 'class' | 'isEditing' | 'isSaving' | 'onEditClick' | 'onSaveClick' | 'onWalletClick'> {
  activeTab: ProfileTab
  /** Content rendered inside the Wallet tab */
  walletSlot?: JSX.Element
  onTabChange?: (tab: ProfileTab) => void
  scrobbles?: ProfileScrobble[]
  scrobblesLoading?: boolean
  onScrobbleClick?: (scrobble: ProfileScrobble) => void
  onArtistClick?: (artist: string) => void
  onTrackClick?: (trackId: string) => void
  // Profile editing (only shown on own profile)
  profileData?: ProfileInput | null
  profileLoading?: boolean
  onProfileSave?: (data: ProfileInput) => Promise<void>
  // Heaven name
  heavenName?: string | null
  onClaimName?: (name: string) => Promise<boolean>
  onCheckNameAvailability?: (name: string) => Promise<boolean>
  nameClaiming?: boolean
  nameClaimError?: string | null
  // ENS/wallet avatar import
  eoaAddress?: `0x${string}` | null
  ensProfile?: EnsProfile | null
  ensLoading?: boolean
  onImportAvatar?: (uri: string) => void
  // Verification (Self.xyz)
  verification?: VerificationData
  // Schedule
  scheduleBasePrice?: string
  scheduleAccepting?: boolean
  scheduleAvailability?: TimeSlot[]
  scheduleSlots?: SessionSlotData[]
  scheduleSlotsLoading?: boolean
  scheduleRequests?: SessionRequestData[]
  scheduleRequestsLoading?: boolean
  onSetBasePrice?: (priceEth: string) => void
  onToggleAccepting?: (accepting: boolean) => void
  onAvailabilityChange?: (slots: TimeSlot[]) => void
  onCancelSlot?: (slotId: number) => void
  onBookSlot?: (slotId: number) => void
  onAcceptRequest?: (requestId: number) => void
  onDeclineRequest?: (requestId: number) => void
  onRequestCustomTime?: (params: { windowStart: number; windowEnd: number; durationMins: number; amountEth: string }) => void
}

/**
 * Convert contract SessionSlotData[] to Scheduler's DayAvailability[]
 */
function slotsToAvailability(slots: SessionSlotData[]): DayAvailability[] {
  const byDate = new Map<string, SchedulerTimeSlot[]>()

  for (const slot of slots) {
    if (slot.status !== 'open') continue
    const d = new Date(slot.startTime * 1000)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const startH = String(d.getHours()).padStart(2, '0')
    const startM = String(d.getMinutes()).padStart(2, '0')
    const end = new Date((slot.startTime + slot.durationMins * 60) * 1000)
    const endH = String(end.getHours()).padStart(2, '0')
    const endM = String(end.getMinutes()).padStart(2, '0')

    const arr = byDate.get(dateStr) || []
    arr.push({
      startTime: `${startH}:${startM}`,
      endTime: `${endH}:${endM}`,
      isBooked: false,
    })
    byDate.set(dateStr, arr)
  }

  // Also add booked slots so they show as unavailable
  for (const slot of slots) {
    if (slot.status !== 'booked') continue
    const d = new Date(slot.startTime * 1000)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const startH = String(d.getHours()).padStart(2, '0')
    const startM = String(d.getMinutes()).padStart(2, '0')
    const end = new Date((slot.startTime + slot.durationMins * 60) * 1000)
    const endH = String(end.getHours()).padStart(2, '0')
    const endM = String(end.getMinutes()).padStart(2, '0')

    const arr = byDate.get(dateStr) || []
    arr.push({
      startTime: `${startH}:${startM}`,
      endTime: `${endH}:${endM}`,
      isBooked: true,
    })
    byDate.set(dateStr, arr)
  }

  return Array.from(byDate.entries())
    .map(([date, slots]) => ({ date, slots: slots.sort((a, b) => a.startTime.localeCompare(b.startTime)) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Find the matching SessionSlotData by date + time
 */
function findSlotByDateTime(slots: SessionSlotData[], date: string, startTime: string): SessionSlotData | undefined {
  return slots.find(s => {
    const d = new Date(s.startTime * 1000)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    return dateStr === date && `${h}:${m}` === startTime
  })
}

/**
 * Music tab — scrobble dashboard with KPI strip, two-column layout (recent feed + sidebar tops)
 */
interface TopArtistEntry { artist: string; count: number; coverUrl?: string }
interface TopTrackEntry { title: string; artist: string; count: number; coverUrl?: string; trackId: string }
interface TopAlbumEntry { album: string; artist: string; count: number; coverUrl?: string }

const formatHours = (totalSec: number) => {
  const h = Math.floor(totalSec / 3600)
  if (h < 1) return `${Math.round(totalSec / 60)}m`
  return `${h.toLocaleString()}h`
}

const MusicTabContent: Component<{
  scrobbles: ProfileScrobble[]
  onArtistClick?: (artist: string) => void
  onTrackClick?: (trackId: string) => void
}> = (tabProps) => {
  const totalSec = createMemo(() => {
    let sum = 0
    for (const s of tabProps.scrobbles) sum += s.durationSec || 0
    return sum
  })

  const uniqueArtists = createMemo(() => new Set(tabProps.scrobbles.map(s => s.artist)).size)
  const uniqueTracks = createMemo(() => new Set(tabProps.scrobbles.map(s => `${s.title}|||${s.artist}`)).size)

  const topArtists = createMemo<TopArtistEntry[]>(() => {
    const map = new Map<string, { count: number; coverUrl?: string }>()
    for (const s of tabProps.scrobbles) {
      const entry = map.get(s.artist) || { count: 0 }
      entry.count++
      if (!entry.coverUrl && s.coverUrl) entry.coverUrl = s.coverUrl
      map.set(s.artist, entry)
    }
    return [...map.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([a, d]) => ({ artist: a, ...d }))
  })

  const topTracks = createMemo<TopTrackEntry[]>(() => {
    const map = new Map<string, TopTrackEntry>()
    for (const s of tabProps.scrobbles) {
      const key = `${s.title}|||${s.artist}`
      const entry = map.get(key) || { title: s.title, artist: s.artist, count: 0, trackId: s.trackId }
      entry.count++
      if (!entry.coverUrl && s.coverUrl) entry.coverUrl = s.coverUrl
      map.set(key, entry)
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5)
  })

  const topAlbums = createMemo<TopAlbumEntry[]>(() => {
    const map = new Map<string, TopAlbumEntry>()
    for (const s of tabProps.scrobbles) {
      if (!s.album) continue
      const key = `${s.album}|||${s.artist}`
      const entry = map.get(key) || { album: s.album, artist: s.artist, count: 0 }
      entry.count++
      if (!entry.coverUrl && s.coverUrl) entry.coverUrl = s.coverUrl
      map.set(key, entry)
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5)
  })

  /* Consistent row: rank (w-6, center) + image (w-12 h-12) + text (flex-1 min-w-0) + meta (right) */
  const rowClass = 'flex items-center gap-3 h-[56px] border-b border-[var(--border-subtle)] hover:bg-[var(--bg-highlight)] transition-colors cursor-pointer'
  const rankClass = 'text-base text-[var(--text-muted)] w-6 text-center flex-shrink-0'
  const titleClass = 'text-base font-medium text-[var(--text-primary)] truncate'
  const subClass = 'text-base text-[var(--text-muted)] truncate'
  const metaClass = 'text-base text-[var(--text-muted)] flex-shrink-0'

  return (
    <div class="space-y-6">
      {/* KPI Strip */}
      <div style={{ display: 'grid', 'grid-template-columns': 'repeat(4, 1fr)', gap: '0.75rem' }}>
        <div class="rounded-md bg-[var(--bg-surface)] px-4 py-3 text-center">
          <div class="text-xl font-bold text-[var(--text-primary)]">{tabProps.scrobbles.length.toLocaleString()}</div>
          <div class="text-base text-[var(--text-muted)]">scrobbles</div>
        </div>
        <div class="rounded-md bg-[var(--bg-surface)] px-4 py-3 text-center">
          <div class="text-xl font-bold text-[var(--text-primary)]">{formatHours(totalSec())}</div>
          <div class="text-base text-[var(--text-muted)]">listened</div>
        </div>
        <div class="rounded-md bg-[var(--bg-surface)] px-4 py-3 text-center">
          <div class="text-xl font-bold text-[var(--text-primary)]">{uniqueArtists().toLocaleString()}</div>
          <div class="text-base text-[var(--text-muted)]">artists</div>
        </div>
        <div class="rounded-md bg-[var(--bg-surface)] px-4 py-3 text-center">
          <div class="text-xl font-bold text-[var(--text-primary)]">{uniqueTracks().toLocaleString()}</div>
          <div class="text-base text-[var(--text-muted)]">tracks</div>
        </div>
      </div>

      {/* 2x2 grid */}
      <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '1.5rem' }}>
        {/* Top Artists — rank + avatar + name + count */}
        <div>
          <h3 class="text-base font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1">Top Artists</h3>
          <For each={topArtists()}>
            {(entry, i) => (
              <div class={rowClass} onClick={() => tabProps.onArtistClick?.(entry.artist)}>
                <span class={rankClass}>{i() + 1}</span>
                <Avatar src={entry.coverUrl} alt={entry.artist} size="lg" />
                <div class="flex-1 min-w-0">
                  <div class={titleClass}>{entry.artist}</div>
                </div>
                <span class={metaClass}>{entry.count}</span>
              </div>
            )}
          </For>
        </div>

        {/* Top Tracks — rank + cover + title/artist + count */}
        <div>
          <h3 class="text-base font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1">Top Tracks</h3>
          <For each={topTracks()}>
            {(track, i) => (
              <div class={rowClass} onClick={() => tabProps.onTrackClick?.(track.trackId)}>
                <span class={rankClass}>{i() + 1}</span>
                <AlbumCover src={track.coverUrl} alt={track.title} class="w-12 h-12 flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class={titleClass}>{track.title}</div>
                  <div class={subClass}>{track.artist}</div>
                </div>
                <span class={metaClass}>{track.count}</span>
              </div>
            )}
          </For>
        </div>

        {/* Top Albums — rank + cover + album/artist + count */}
        <div>
          <h3 class="text-base font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1">Top Albums</h3>
          <For each={topAlbums()}>
            {(album, i) => (
              <div class={rowClass} onClick={() => tabProps.onArtistClick?.(album.artist)}>
                <span class={rankClass}>{i() + 1}</span>
                <AlbumCover src={album.coverUrl} alt={album.album} class="w-12 h-12 flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class={titleClass}>{album.album}</div>
                  <div class={subClass}>{album.artist}</div>
                </div>
                <span class={metaClass}>{album.count}</span>
              </div>
            )}
          </For>
        </div>

        {/* Recent — rank + cover + title/artist + timestamp */}
        <div>
          <h3 class="text-base font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1">Recent</h3>
          <For each={tabProps.scrobbles.slice(0, 10)}>
            {(scrobble, i) => (
              <div class={rowClass} onClick={() => tabProps.onTrackClick?.(scrobble.trackId)}>
                <span class={rankClass}>{i() + 1}</span>
                <AlbumCover src={scrobble.coverUrl} alt={scrobble.album || scrobble.title} class="w-12 h-12 flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class={titleClass}>{scrobble.title}</div>
                  <div class={subClass}>{scrobble.artist}</div>
                </div>
                <span class={metaClass}>{scrobble.timestamp}</span>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}

/**
 * Public-facing scheduler view: calendar + time slots + booking confirmation
 */
const PublicSchedulerView: Component<{
  slots?: SessionSlotData[]
  slotsLoading?: boolean
  basePrice?: string
  onBookSlot?: (slotId: number) => void
}> = (props) => {
  const [selectedDate, setSelectedDate] = createSignal<string>('')
  const [selectedSlot, setSelectedSlot] = createSignal<SchedulerTimeSlot | null>(null)
  const [isBooking, setIsBooking] = createSignal(false)

  const availability = createMemo(() => slotsToAvailability(props.slots || []))

  const handleBook = async (date: string, slot: SchedulerTimeSlot) => {
    const allSlots = props.slots || []
    const match = findSlotByDateTime(allSlots, date, slot.startTime)
    if (!match) return

    setIsBooking(true)
    try {
      props.onBookSlot?.(match.id)
    } finally {
      setIsBooking(false)
      setSelectedSlot(null)
    }
  }

  return (
    <div class="max-w-[900px]">
      <Show when={props.basePrice && props.basePrice !== '0.0'}>
        <div class="mb-4 px-4 py-3 rounded-md bg-[var(--bg-surface)] text-base text-[var(--text-secondary)]">
          Base session price: <span class="font-semibold text-[var(--text-primary)]">{props.basePrice} ETH</span>
        </div>
      </Show>

      <Show
        when={!props.slotsLoading}
        fallback={
          <div class="py-12 text-center text-[var(--text-muted)]">Loading schedule...</div>
        }
      >
        <Show
          when={availability().length > 0}
          fallback={
            <div class="py-12 text-center text-[var(--text-muted)]">
              <p class="text-lg font-medium mb-2">No available slots</p>
              <p class="text-base">This host hasn't set up their schedule yet.</p>
            </div>
          }
        >
          <Scheduler
            availability={availability()}
            selectedDate={selectedDate()}
            selectedSlot={selectedSlot()}
            onDateSelect={setSelectedDate}
            onSlotSelect={setSelectedSlot}
            onBook={handleBook}
            isBooking={isBooking()}
            teacherTimezone={Intl.DateTimeFormat().resolvedOptions().timeZone}
          />
        </Show>
      </Show>
    </div>
  )
}

/**
 * ProfilePage - Complete profile page with header, tabs, and content
 *
 * Features:
 * - ProfileHeader with banner, avatar, stats
 * - ProfileTabs navigation
 * - Content area that switches based on active tab
 * - Video grid for Videos tab
 * - Placeholder states for other tabs
 */
export const ProfilePage: Component<ProfilePageProps> = (props) => {
  const [isEditing, setIsEditing] = createSignal(false)
  const [isSaving, setIsSaving] = createSignal(false)

  const handleEditClick = () => setIsEditing(true)

  const handleSaveClick = async () => {
    setIsSaving(true)
  }

  return (
    <div class="bg-[var(--bg-page)] min-h-screen">
        <ProfileHeader
          username={props.username}
          displayName={props.displayName}
          avatarUrl={props.avatarUrl}
          nationalityCode={props.nationalityCode}
          bannerGradient={props.bannerGradient}
          bannerUrl={props.profileData?.coverPhoto || props.ensProfile?.header || undefined}
          bio={props.profileData?.bio}
          url={props.profileData?.url}
          twitter={props.profileData?.twitter}
          github={props.profileData?.github}
          telegram={props.profileData?.telegram}
          verificationState={props.verificationState}
          isFollowing={props.isFollowing}
          isOwnProfile={props.isOwnProfile}
          followerCount={props.followerCount}
          followingCount={props.followingCount}
          onFollowerCountClick={props.onFollowerCountClick}
          onFollowingCountClick={props.onFollowingCountClick}
          isEditing={isEditing()}
          isSaving={isSaving()}
          onFollowClick={props.onFollowClick}
          onMessageClick={props.onMessageClick}
          onAvatarClick={props.onAvatarClick}
          onEditClick={handleEditClick}
          onSaveClick={handleSaveClick}
          onVerifyClick={props.onVerifyClick}
        />

        <div class="max-w-4xl mx-auto px-4 md:px-8">
        <ProfileTabs
          activeTab={props.activeTab}
          onTabChange={props.onTabChange}
        />

        <div class="py-4 md:py-8">
          {/* About Tab — full-width profile details */}
          <Show when={props.activeTab === 'about'}>
            <Show
              when={!props.profileLoading}
              fallback={
                <div class="py-12 text-center text-[var(--text-muted)]">
                  Loading profile...
                </div>
              }
            >
              {/* Editing mode: full-width form */}
              <Show when={isEditing()}>
                <div class="max-w-[600px]">
                  <ProfileInfoSection
                    profile={props.profileData || {}}
                    isOwnProfile={props.isOwnProfile}
                    isEditing={isEditing()}
                    isSaving={isSaving()}
                    onSave={props.onProfileSave}
                    setIsEditing={setIsEditing}
                    setIsSaving={setIsSaving}
                    heavenName={props.heavenName}
                    onClaimName={props.onClaimName}
                    onCheckNameAvailability={props.onCheckNameAvailability}
                    nameClaiming={props.nameClaiming}
                    nameClaimError={props.nameClaimError}
                    eoaAddress={props.eoaAddress}
                    ensProfile={props.ensProfile}
                    ensLoading={props.ensLoading}
                    onImportAvatar={props.onImportAvatar}
                    verification={props.verification}
                  />
                </div>
              </Show>

              {/* View mode: full-width about cards */}
              <Show when={!isEditing()}>
                <div class="max-w-[600px]">
                  <ProfileAboutSidebar profile={props.profileData || {}} />
                </div>
              </Show>
            </Show>
          </Show>

          {/* Posts Tab — activity/scrobbles feed */}
          <Show when={props.activeTab === 'posts'}>
            <Show when={props.scrobblesLoading}>
              <div class="py-12 text-center text-[var(--text-muted)]">
                Loading activity...
              </div>
            </Show>
            <Show when={!props.scrobblesLoading && (!props.scrobbles || props.scrobbles.length === 0)}>
              <div class="py-12 text-center text-[var(--text-muted)]">
                <svg class="w-16 h-16 mx-auto mb-3 opacity-40" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M212.92,25.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,64V174.08A36,36,0,1,0,88,204V70.25l112-28v99.83A36,36,0,1,0,216,172V32A8,8,0,0,0,212.92,25.69ZM52,224a20,20,0,1,1,20-20A20,20,0,0,1,52,224Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,192Z" />
                </svg>
                <p class="text-base">No posts yet</p>
              </div>
            </Show>
            <Show when={!props.scrobblesLoading && props.scrobbles && props.scrobbles.length > 0}>
              <div class="divide-y divide-[var(--border-subtle)] max-w-[600px]">
                <For each={props.scrobbles}>
                  {(scrobble) => (
                    <div class="flex items-center gap-4 py-3 px-4">
                      <AlbumCover
                        src={scrobble.coverUrl}
                        alt={scrobble.album || scrobble.title}
                        class="w-14 h-14 flex-shrink-0"
                      />
                      <div class="flex-1 min-w-0">
                        <div class="text-base font-semibold text-[var(--text-primary)] truncate">{scrobble.title}</div>
                        <div class="text-base text-[var(--text-muted)] truncate">
                          {[scrobble.artist, scrobble.album].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <span class="text-base text-[var(--text-muted)] flex-shrink-0">{scrobble.timestamp}</span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>

          {/* Music Tab — Last.fm-style scrobble history */}
          <Show when={props.activeTab === 'music'}>
            <Show when={props.scrobblesLoading}>
              <div class="py-12 text-center text-[var(--text-muted)]">
                Loading music...
              </div>
            </Show>
            <Show when={!props.scrobblesLoading && (!props.scrobbles || props.scrobbles.length === 0)}>
              <div class="py-12 text-center text-[var(--text-muted)]">
                <svg class="w-16 h-16 mx-auto mb-3 opacity-40" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M212.92,25.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,64V174.08A36,36,0,1,0,88,204V70.25l112-28v99.83A36,36,0,1,0,216,172V32A8,8,0,0,0,212.92,25.69ZM52,224a20,20,0,1,1,20-20A20,20,0,0,1,52,224Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,192Z" />
                </svg>
                <p class="text-base">No scrobbles yet</p>
              </div>
            </Show>
            <Show when={!props.scrobblesLoading && props.scrobbles && props.scrobbles.length > 0}>
              <MusicTabContent
                scrobbles={props.scrobbles!}
                onArtistClick={props.onArtistClick}
                onTrackClick={props.onTrackClick}
              />
            </Show>
          </Show>

          {/* Wallet Tab — rendered without parent padding for edge-to-edge parity with /wallet */}
          <Show when={props.activeTab === 'wallet'}>
            <div class="-mx-4 md:-mx-8">
              {props.walletSlot}
            </div>
          </Show>

          {/* Schedule Tab — always shows the booking calendar (Scheduler) */}
          <Show when={props.activeTab === 'schedule'}>
            <PublicSchedulerView
              slots={props.scheduleSlots}
              slotsLoading={props.scheduleSlotsLoading}
              basePrice={props.scheduleBasePrice}
              onBookSlot={props.isOwnProfile ? undefined : props.onBookSlot}
            />
          </Show>

        </div>
        </div>
    </div>
  )
}
