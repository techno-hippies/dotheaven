import { type Component, createSignal, createEffect } from 'solid-js'
import { createQuery } from '@tanstack/solid-query'
import { ProfilePage, type ProfileTab, type ProfileScrobble } from '../components/profile'
import { useAuth } from '../providers'
import { fetchScrobbleEntries, getProfile, setProfile, type ProfileInput } from '../lib/heaven'

function formatTimeAgo(ts: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts * 1000).toLocaleDateString()
}

// Local storage key for username cache
const USERNAME_CACHE_KEY = 'heaven:username'

export const MyProfilePage: Component = () => {
  console.log('[ProfilePage] Component mounting...')

  // Immediately check localStorage before anything else
  console.log('[ProfilePage] Direct localStorage check:')
  try {
    const directCheck = localStorage.getItem('heaven:username')
    console.log('  heaven:username =', directCheck)

    // Show ALL keys that contain 'heaven'
    const allKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) allKeys.push(key)
    }
    console.log('  All localStorage keys:', allKeys)
  } catch (e) {
    console.error('[ProfilePage] localStorage error:', e)
  }

  const auth = useAuth()
  const [activeTab, setActiveTab] = createSignal<ProfileTab>('activity')
  const [username, setUsername] = createSignal<string | null>(null)

  const address = () => auth.pkpAddress()

  const scrobblesQuery = createQuery(() => ({
    queryKey: ['scrobbles', address()],
    queryFn: () => fetchScrobbleEntries(address()!),
    get enabled() { return !!address() },
  }))

  const profileQuery = createQuery(() => ({
    queryKey: ['profile', address()],
    queryFn: () => getProfile(address()!),
    get enabled() { return !!address() },
  }))

  const scrobbles = (): ProfileScrobble[] => {
    const entries = scrobblesQuery.data ?? []
    return entries.map((e) => ({
      id: e.id,
      title: e.title,
      artist: e.artist,
      album: e.album,
      trackId: e.trackId,
      timestamp: formatTimeAgo(e.playedAt),
    }))
  }

  console.log('[ProfilePage] Initial pkpAddress:', auth.pkpAddress())

  // Load username from cache when authenticated
  createEffect(() => {
    const addr = auth.pkpAddress()
    console.log('[Profile] Address changed:', addr)

    if (!addr) {
      console.log('[Profile] No address, clearing username')
      setUsername(null)
      return
    }

    // Try to load from localStorage
    try {
      const cached = localStorage.getItem(USERNAME_CACHE_KEY)
      console.log('[Profile] localStorage value:', cached)

      // Debug: show ALL localStorage keys with 'heaven' prefix
      const allHeavenKeys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.includes('heaven')) {
          allHeavenKeys.push(`${key}: ${localStorage.getItem(key)?.substring(0, 50)}`)
        }
      }
      console.log('[Profile] All heaven localStorage keys:', allHeavenKeys)

      if (cached) {
        console.log('[Profile] Setting username from cache:', cached)
        setUsername(cached)
      } else {
        console.log('[Profile] No cached username found for address:', addr)
        console.log('[Profile] User will see "My Profile" instead of their username')
      }
    } catch (e) {
      console.error('[Profile] Failed to load username:', e)
    }
  })

  const displayName = () => {
    const name = username()
    if (name) return `${name}.heaven`
    return 'My Profile'
  }

  const handleName = () => {
    const name = username()
    if (name) return `@${name}`

    const addr = auth.pkpAddress()
    if (!addr) return '@unknown'
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const handleProfileSave = async (data: ProfileInput) => {
    const addr = auth.pkpAddress()
    const pkpInfoData = auth.pkpInfo()

    if (!addr || !pkpInfoData) {
      throw new Error('Not authenticated')
    }

    // Get auth context for Lit Action execution
    const authContext = await auth.getAuthContext()

    console.log('[ProfilePage] Saving profile:', data)
    const result = await setProfile(data, addr, authContext, pkpInfoData.publicKey)

    if (!result.success) {
      throw new Error(result.error || 'Failed to save profile')
    }

    console.log('[ProfilePage] Profile saved successfully:', result)

    // Refetch profile data after successful save
    profileQuery.refetch()
  }

  return (
    <div class="h-full overflow-y-auto">
      <ProfilePage
        username={handleName()}
        displayName={displayName()}
        stats={{
          followers: 0,
          following: 0,
          likes: 0,
        }}
        isOwnProfile={true}
        activeTab={activeTab()}
        onTabChange={setActiveTab}
        scrobbles={scrobbles()}
        scrobblesLoading={scrobblesQuery.isLoading}
        profileData={profileQuery.data || null}
        profileLoading={profileQuery.isLoading}
        onProfileSave={handleProfileSave}
      />
    </div>
  )
}
