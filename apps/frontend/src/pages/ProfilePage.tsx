import { type Component, createSignal } from 'solid-js'
import { createQuery } from '@tanstack/solid-query'
import { ProfilePage, type ProfileTab, type ProfileScrobble } from '../components/profile'
import { useAuth } from '../providers'
import { fetchScrobbleEntries, getProfile, setProfile, setTextRecord, setTextRecords, computeNode, getTextRecord, checkNameAvailable, registerHeavenName } from '../lib/heaven'
import { uploadAvatar } from '../lib/heaven/avatar'
import type { ProfileInput } from '../lib/heaven'

function formatTimeAgo(ts: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts * 1000).toLocaleDateString()
}

export const MyProfilePage: Component = () => {
  const auth = useAuth()
  const [activeTab, setActiveTab] = createSignal<ProfileTab>('activity')
  const [heavenName, setHeavenName] = createSignal<string | null>(localStorage.getItem('heaven:username'))
  const [nameClaiming, setNameClaiming] = createSignal(false)
  const [nameClaimError, setNameClaimError] = createSignal<string | null>(null)

  const address = () => auth.pkpAddress()

  const scrobblesQuery = createQuery(() => ({
    queryKey: ['scrobbles', address()],
    queryFn: () => fetchScrobbleEntries(address()!),
    get enabled() { return !!address() },
  }))

  const profileQuery = createQuery(() => ({
    queryKey: ['profile', address()],
    queryFn: async () => {
      const profile = await getProfile(address()!)

      // Fetch avatar/cover from RecordsV1 if user has a name
      const username = localStorage.getItem('heaven:username')
      if (username) {
        try {
          const node = computeNode(username)
          const [avatar, cover] = await Promise.all([
            getTextRecord(node, 'avatar').catch(() => ''),
            getTextRecord(node, 'cover').catch(() => ''),
          ])
          if (profile) {
            if (avatar) profile.avatar = avatar
            if (cover) profile.coverPhoto = cover
          }
        } catch (e) {
          console.warn('[ProfilePage] Failed to fetch records:', e)
        }
      }

      return profile
    },
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

  const displayName = () => {
    const profile = profileQuery.data
    if (profile?.displayName) return profile.displayName
    return 'My Profile'
  }

  const handleName = () => {
    const addr = auth.pkpAddress()
    if (!addr) return '@unknown'
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const handleCheckNameAvailability = async (name: string): Promise<boolean> => {
    return checkNameAvailable(name)
  }

  const handleClaimName = async (name: string): Promise<boolean> => {
    const pkpInfoData = auth.pkpInfo()
    const addr = auth.pkpAddress()
    if (!pkpInfoData || !addr) return false

    setNameClaiming(true)
    setNameClaimError(null)
    try {
      const authContext = await auth.getAuthContext()
      const result = await registerHeavenName(name, addr, authContext, pkpInfoData.publicKey)
      if (result.success) {
        setHeavenName(name)
        localStorage.setItem('heaven:username', name)
        return true
      } else {
        setNameClaimError(result.error || 'Registration failed')
        return false
      }
    } catch (err: any) {
      setNameClaimError(err?.message || 'Registration failed')
      return false
    } finally {
      setNameClaiming(false)
    }
  }

  const handleProfileSave = async (data: ProfileInput) => {
    const addr = auth.pkpAddress()
    const pkpInfoData = auth.pkpInfo()

    if (!addr || !pkpInfoData) {
      throw new Error('Not authenticated')
    }

    // Get auth context for Lit Action execution (retry on stale session)
    let authContext = await auth.getAuthContext()

    // Upload avatar to IPFS if a new file was selected
    if (data.avatarFile) {
      console.log('[ProfilePage] Uploading avatar to IPFS...')
      const uploadResult = await uploadAvatar(
        data.avatarFile,
        pkpInfoData.publicKey,
        authContext,
        { skipStyleCheck: true },
      )
      if (!uploadResult.success || !uploadResult.avatarCID) {
        throw new Error(uploadResult.error || 'Avatar upload failed')
      }
      console.log('[ProfilePage] Avatar uploaded:', uploadResult.avatarCID)
      const avatarURI = `ipfs://${uploadResult.avatarCID}`
      data.avatar = avatarURI
      delete data.avatarFile

    }

    // Upload cover photo to IPFS if a new file was selected
    if (data.coverFile) {
      console.log('[ProfilePage] Uploading cover photo to IPFS...')
      const uploadResult = await uploadAvatar(
        data.coverFile,
        pkpInfoData.publicKey,
        authContext,
        { skipStyleCheck: true },
      )
      if (!uploadResult.success || !uploadResult.avatarCID) {
        throw new Error(uploadResult.error || 'Cover photo upload failed')
      }
      console.log('[ProfilePage] Cover uploaded:', uploadResult.avatarCID)
      data.coverPhoto = `ipfs://${uploadResult.avatarCID}`
      delete data.coverFile
    }

    // Store avatar/cover CIDs in RecordsV1 (ENS-compatible) if user has a name
    const username = localStorage.getItem('heaven:username')
    if (username) {
      const recordKeys: string[] = []
      const recordValues: string[] = []

      if (data.avatar && data.avatar.startsWith('ipfs://')) {
        recordKeys.push('avatar')
        recordValues.push(data.avatar)
      }
      if (data.coverPhoto && data.coverPhoto.startsWith('ipfs://')) {
        recordKeys.push('cover')
        recordValues.push(data.coverPhoto)
      }

      if (recordKeys.length > 0) {
        const node = computeNode(username)
        console.log('[ProfilePage] Setting records on node:', node, recordKeys)
        const recordResult = recordKeys.length === 1
          ? await setTextRecord(node, recordKeys[0], recordValues[0], pkpInfoData.publicKey, authContext)
          : await setTextRecords(node, recordKeys, recordValues, pkpInfoData.publicKey, authContext)
        if (!recordResult.success) {
          console.warn('[ProfilePage] Failed to set records:', recordResult.error)
        } else {
          console.log('[ProfilePage] Records set:', recordResult.txHash)
        }
      }
    }

    console.log('[ProfilePage] Saving profile:', data)
    let result: Awaited<ReturnType<typeof setProfile>>
    try {
      result = await setProfile(data, addr, authContext, pkpInfoData.publicKey)
    } catch (err: any) {
      // Retry once on Lit session/signature errors
      if (/[Ss]ignature error/.test(err?.message || '')) {
        console.warn('[ProfilePage] Signature error, refreshing auth context and retrying...')
        const { clearAuthContext } = await import('../lib/lit')
        clearAuthContext()
        authContext = await auth.getAuthContext()
        result = await setProfile(data, addr, authContext, pkpInfoData.publicKey)
      } else {
        throw err
      }
    }

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
        heavenName={heavenName()}
        onClaimName={handleClaimName}
        onCheckNameAvailability={handleCheckNameAvailability}
        nameClaiming={nameClaiming()}
        nameClaimError={nameClaimError()}
      />
    </div>
  )
}
