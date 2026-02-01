import { type Component, createSignal, createEffect, Show, createMemo } from 'solid-js'
import { useNavigate, useParams } from '@solidjs/router'
import { createQuery } from '@tanstack/solid-query'
import { ProfilePage, type ProfileTab, type ProfileScrobble } from '../components/profile'
import { useAuth } from '../providers'
import { fetchScrobbleEntries, getProfile, setProfile, setTextRecord, setTextRecords, computeNode, getTextRecord, checkNameAvailable, registerHeavenName, resolveAvatarUri, resolveIpfsUri, getEnsProfile, getAddr, resolveEnsName, getPrimaryName } from '../lib/heaven'
import { uploadAvatar } from '../lib/heaven/avatar'
import { type ProfileInput, getTagLabel } from '@heaven/ui'
import { parseTagCsv } from '../lib/heaven/profile'
import { isAddress, zeroAddress } from 'viem'

function formatTimeAgo(ts: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts * 1000).toLocaleDateString()
}

type ParsedProfileId =
  | { type: 'address'; address: `0x${string}` }
  | { type: 'heaven'; label: string }
  | { type: 'ens'; name: string }
  | { type: 'hns'; name: string; tld: string }
  | { type: 'unknown'; input: string }

type ResolvedProfileId = {
  type: ParsedProfileId['type']
  address: `0x${string}`
  label?: string
  name?: string
  node?: `0x${string}`
}

function parseProfileId(rawId: string | undefined): ParsedProfileId {
  const id = (rawId ?? '').trim()
  if (!id) return { type: 'unknown', input: '' }

  if (isAddress(id, { strict: false })) {
    return { type: 'address', address: id as `0x${string}` }
  }

  const lower = id.toLowerCase()
  if (lower.includes('.')) {
    if (lower.endsWith('.eth')) {
      return { type: 'ens', name: id }
    }
    if (lower.endsWith('.heaven')) {
      const label = lower.slice(0, -'.heaven'.length)
      return { type: 'heaven', label }
    }
    const tld = lower.slice(lower.lastIndexOf('.') + 1)
    return { type: 'hns', name: id, tld }
  }

  return { type: 'heaven', label: lower }
}

async function resolveProfileId(parsed: ParsedProfileId): Promise<ResolvedProfileId> {
  switch (parsed.type) {
    case 'address': {
      // Try reverse lookup to get their primary heaven name + node
      const reverse = await getPrimaryName(parsed.address).catch(() => null)
      if (reverse) {
        return { type: 'address', address: parsed.address, label: reverse.label, node: reverse.node }
      }
      return { type: 'address', address: parsed.address }
    }
    case 'ens': {
      const address = await resolveEnsName(parsed.name)
      if (!address) {
        throw new Error(`ENS name not found: ${parsed.name}`)
      }
      return { type: 'ens', address, name: parsed.name }
    }
    case 'heaven': {
      const label = parsed.label.toLowerCase()
      if (!label) {
        throw new Error('Invalid Heaven name')
      }
      const node = computeNode(label)
      const address = await getAddr(node)
      if (!address || address === zeroAddress) {
        throw new Error(`Heaven name not found: ${label}.heaven`)
      }
      return { type: 'heaven', address, label, node }
    }
    case 'hns':
      throw new Error(`Unsupported TLD: .${parsed.tld}`)
    default:
      throw new Error('Invalid profile identifier')
  }
}

async function applyHeavenRecords(profile: ProfileInput, node: `0x${string}`): Promise<ProfileInput> {
  const enriched: ProfileInput = { ...profile }
  const [avatar, header, description, url, twitter, github, telegram, , , location, school] = await Promise.all([
    getTextRecord(node, 'avatar').catch(() => ''),
    getTextRecord(node, 'header').catch(() => ''),
    getTextRecord(node, 'description').catch(() => ''),
    getTextRecord(node, 'url').catch(() => ''),
    getTextRecord(node, 'com.twitter').catch(() => ''),
    getTextRecord(node, 'com.github').catch(() => ''),
    getTextRecord(node, 'org.telegram').catch(() => ''),
    getTextRecord(node, 'heaven.hobbies').catch(() => ''),   // display-only, IDs from ProfileV1
    getTextRecord(node, 'heaven.skills').catch(() => ''),    // display-only, IDs from ProfileV1
    getTextRecord(node, 'heaven.location').catch(() => ''),
    getTextRecord(node, 'heaven.school').catch(() => ''),
  ])

  // Resolve avatar URI (supports ipfs://, https://, eip155: NFT refs)
  if (avatar) {
    const resolved = await resolveAvatarUri(avatar)
    enriched.avatar = resolved || resolveIpfsUri(avatar)
  }
  if (header) enriched.coverPhoto = resolveIpfsUri(header)
  if (description) enriched.bio = description
  if (url) enriched.url = url
  if (twitter) enriched.twitter = twitter
  if (github) enriched.github = github
  if (telegram) enriched.telegram = telegram

  // RecordsV1 labels (heaven.hobbies/heaven.skills) are display-only.
  if (location) enriched.locationCityId = location
  if (school) enriched.school = school

  return enriched
}

export const MyProfilePage: Component = () => {
  const auth = useAuth()
  const [activeTab, setActiveTab] = createSignal<ProfileTab>('about')
  const [heavenName, setHeavenName] = createSignal<string | null>(localStorage.getItem('heaven:username'))
  const [nameClaiming, setNameClaiming] = createSignal(false)
  const [nameClaimError, setNameClaimError] = createSignal<string | null>(null)

  const address = () => auth.pkpAddress()

  // On-chain reverse lookup: discover heaven name even if localStorage is empty (cross-client)
  const primaryNameQuery = createQuery(() => ({
    queryKey: ['primaryName', address()],
    queryFn: () => getPrimaryName(address()! as `0x${string}`),
    get enabled() { return !!address() },
    staleTime: 1000 * 60 * 5,
  }))

  // Sync on-chain result into heavenName signal + localStorage
  createEffect(() => {
    const result = primaryNameQuery.data
    if (result?.label && !heavenName()) {
      setHeavenName(result.label)
      localStorage.setItem('heaven:username', result.label)
    }
  })

  const resolvedNode = () => {
    const hn = heavenName()
    if (hn) return computeNode(hn)
    const primary = primaryNameQuery.data
    if (primary?.node) return primary.node
    return null
  }

  const scrobblesQuery = createQuery(() => ({
    queryKey: ['scrobbles', address()],
    queryFn: () => fetchScrobbleEntries(address()!),
    get enabled() { return !!address() },
  }))

  const profileQuery = createQuery(() => ({
    queryKey: ['profile', address(), resolvedNode()],
    queryFn: async () => {
      let profile = (await getProfile(address()!)) ?? ({} as ProfileInput)

      const node = resolvedNode()
      if (node) {
        try {
          profile = await applyHeavenRecords(profile, node as `0x${string}`)
        } catch (e) {
          console.warn('[ProfilePage] Failed to fetch records:', e)
        }
      }

      return profile
    },
    get enabled() { return !!address() },
  }))

  // Fetch ENS profile for EOA users (enables "import from wallet" avatar)
  const eoaAddr = () => auth.eoaAddress()
  const ensQuery = createQuery(() => ({
    queryKey: ['ensProfile', eoaAddr()],
    queryFn: () => getEnsProfile(eoaAddr()!),
    get enabled() { return !!eoaAddr() },
    staleTime: 1000 * 60 * 30, // 30 min cache
  }))

  // Handle importing an avatar URI from ENS (stores as ENSIP-12 ref or URL)
  const [importedAvatarUri, setImportedAvatarUri] = createSignal<string | null>(null)

  const handleImportAvatar = (uri: string) => {
    setImportedAvatarUri(uri)
  }

  const FILEBASE_GATEWAY = 'https://heaven.myfilebase.com/ipfs'

  const scrobbles = (): ProfileScrobble[] => {
    const entries = scrobblesQuery.data ?? []
    return entries.map((e) => ({
      id: e.id,
      title: e.title,
      artist: e.artist,
      album: e.album,
      trackId: e.trackId,
      timestamp: formatTimeAgo(e.playedAt),
      coverUrl: e.coverCid
        ? `${FILEBASE_GATEWAY}/${e.coverCid}?img-width=96&img-height=96&img-format=webp&img-quality=80`
        : undefined,
    }))
  }

  const displayName = () => {
    const profile = profileQuery.data
    if (profile?.displayName) return profile.displayName
    const hn = heavenName()
    if (hn) return hn
    const ens = ensQuery.data
    if (ens?.name) return ens.name
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

    const draft: ProfileInput = { ...data }

    // Get auth context for Lit Action execution (retry on stale session)
    let authContext = await auth.getAuthContext()

    const username = heavenName()
    const wantsRecords = Boolean(
      draft.avatarFile ||
      draft.coverFile ||
      draft.bio !== undefined ||
      draft.url !== undefined ||
      draft.twitter !== undefined ||
      draft.github !== undefined ||
      draft.telegram !== undefined
    )
    if (wantsRecords && !username) {
      throw new Error('Claim a Heaven name before editing your profile.')
    }

    let updatedAvatar = false
    let updatedCover = false

    // If user imported an avatar URI from ENS/wallet, use it directly (no upload)
    const imported = importedAvatarUri()
    if (imported && !draft.avatarFile) {
      console.log('[ProfilePage] Using imported avatar URI:', imported)
      draft.avatar = imported
      updatedAvatar = true
      setImportedAvatarUri(null)
    }

    // Upload avatar to IPFS if a new file was selected
    if (draft.avatarFile) {
      console.log('[ProfilePage] Uploading avatar to IPFS...')
      const uploadResult = await uploadAvatar(
        draft.avatarFile,
        pkpInfoData.publicKey,
        authContext,
      )
      if (!uploadResult.success || !uploadResult.avatarCID) {
        throw new Error(uploadResult.error || 'Avatar upload failed')
      }
      console.log('[ProfilePage] Avatar uploaded:', uploadResult.avatarCID)
      const avatarURI = `ipfs://${uploadResult.avatarCID}`
      draft.avatar = avatarURI
      delete draft.avatarFile
      updatedAvatar = true

    }

    // Upload cover photo to IPFS if a new file was selected
    if (draft.coverFile) {
      console.log('[ProfilePage] Uploading cover photo to IPFS...')
      const uploadResult = await uploadAvatar(
        draft.coverFile,
        pkpInfoData.publicKey,
        authContext,
        { skipStyleCheck: true },
      )
      if (!uploadResult.success || !uploadResult.avatarCID) {
        throw new Error(uploadResult.error || 'Cover photo upload failed')
      }
      console.log('[ProfilePage] Cover uploaded:', uploadResult.avatarCID)
      draft.coverPhoto = `ipfs://${uploadResult.avatarCID}`
      delete draft.coverFile
      updatedCover = true
    }

    // Store all text records in RecordsV1 (ENS-compatible keys) if user has a name
    if (username) {
      const recordKeys: string[] = []
      const recordValues: string[] = []

      if (updatedAvatar && draft.avatar) {
        recordKeys.push('avatar')
        recordValues.push(draft.avatar)
      }
      if (updatedCover && draft.coverPhoto) {
        recordKeys.push('header')
        recordValues.push(draft.coverPhoto)
      }

      // Convert tag IDs to display labels for RecordsV1
      const hobbyIds = parseTagCsv(draft.hobbiesCommit)
      const skillIds = parseTagCsv(draft.skillsCommit)
      const hobbyLabels = hobbyIds.length ? hobbyIds.map(id => getTagLabel(id)).join(', ') : undefined
      const skillLabels = skillIds.length ? skillIds.map(id => getTagLabel(id)).join(', ') : undefined

      // Social/bio fields — always write if present (empty string clears the record)
      const socialRecords: [string, string | undefined][] = [
        ['description', draft.bio],
        ['url', draft.url],
        ['com.twitter', draft.twitter],
        ['com.github', draft.github],
        ['org.telegram', draft.telegram],
        ['heaven.hobbies', hobbyLabels],
        ['heaven.skills', skillLabels],
        ['heaven.location', draft.locationCityId],
        ['heaven.school', draft.school],
      ]
      console.log('[ProfilePage] Social/commit records to save:', Object.fromEntries(socialRecords))
      for (const [key, value] of socialRecords) {
        if (value !== undefined) {
          recordKeys.push(key)
          recordValues.push(value)
        }
      }

      if (recordKeys.length > 0) {
        const node = computeNode(username)
        console.log('[ProfilePage] Setting records on node:', node, recordKeys)
        let recordResult = recordKeys.length === 1
          ? await setTextRecord(node, recordKeys[0], recordValues[0], pkpInfoData.publicKey, authContext)
          : await setTextRecords(node, recordKeys, recordValues, pkpInfoData.publicKey, authContext)
        if (!recordResult.success && /signature/i.test(recordResult.error || '')) {
          console.warn('[ProfilePage] Signature error, refreshing auth context and retrying record set...')
          const { clearAuthContext } = await import('../lib/lit')
          clearAuthContext()
          authContext = await auth.getAuthContext()
          recordResult = recordKeys.length === 1
            ? await setTextRecord(node, recordKeys[0], recordValues[0], pkpInfoData.publicKey, authContext)
            : await setTextRecords(node, recordKeys, recordValues, pkpInfoData.publicKey, authContext)
        }
        if (!recordResult.success) {
          throw new Error(recordResult.error || 'Failed to set ENS records')
        }
        console.log('[ProfilePage] Records set:', recordResult.txHash)
      }
    }

    // These fields are stored in RecordsV1 only, not ProfileV1.
    delete draft.avatar
    delete draft.coverPhoto
    delete draft.bio
    delete draft.url
    delete draft.twitter
    delete draft.github
    delete draft.telegram

    console.log('[ProfilePage] Saving profile:', draft)
    let result: Awaited<ReturnType<typeof setProfile>>
    try {
      result = await setProfile(draft, addr, authContext, pkpInfoData.publicKey)
    } catch (err: any) {
      // Retry once on Lit session/signature errors
      if (/[Ss]ignature error/.test(err?.message || '')) {
        console.warn('[ProfilePage] Signature error, refreshing auth context and retrying...')
        const { clearAuthContext } = await import('../lib/lit')
        clearAuthContext()
        authContext = await auth.getAuthContext()
        result = await setProfile(draft, addr, authContext, pkpInfoData.publicKey)
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

  const initialLoading = () => profileQuery.isLoading || ensQuery.isLoading

  return (
    <div class="h-full overflow-y-auto">
      <Show when={!initialLoading()} fallback={<ProfileSkeleton />}>
      <ProfilePage
        username={handleName()}
        displayName={displayName()}
        avatarUrl={profileQuery.data?.avatar || ensQuery.data?.avatar}
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
        eoaAddress={eoaAddr()}
        ensProfile={ensQuery.data}
        ensLoading={ensQuery.isLoading}
        onImportAvatar={handleImportAvatar}
      />
      </Show>
    </div>
  )
}

const ProfileSkeleton: Component = () => (
  <div class="bg-[var(--bg-page)] min-h-screen animate-pulse">
    {/* Banner */}
    <div class="h-48 w-full bg-[var(--bg-elevated)]" />
    <div class="px-8 pb-6">
      {/* Avatar */}
      <div class="-mt-20 mb-4">
        <div class="w-28 h-28 rounded-full bg-[var(--bg-highlight)]" />
      </div>
      {/* Name */}
      <div class="mb-4">
        <div class="h-7 w-48 bg-[var(--bg-highlight)] rounded-md mb-2" />
        <div class="h-5 w-32 bg-[var(--bg-elevated)] rounded-md" />
      </div>
      {/* Stats */}
      <div class="flex gap-6">
        <div class="h-5 w-24 bg-[var(--bg-elevated)] rounded-md" />
        <div class="h-5 w-24 bg-[var(--bg-elevated)] rounded-md" />
        <div class="h-5 w-24 bg-[var(--bg-elevated)] rounded-md" />
      </div>
    </div>
    {/* Tabs */}
    <div class="flex gap-6 px-8 border-b border-[var(--bg-highlight)]">
      <div class="h-10 w-20 bg-[var(--bg-elevated)] rounded-md" />
      <div class="h-10 w-20 bg-[var(--bg-elevated)] rounded-md" />
      <div class="h-10 w-20 bg-[var(--bg-elevated)] rounded-md" />
    </div>
  </div>
)

export const PublicProfilePage: Component = () => {
  const params = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = createSignal<ProfileTab>('about')

  // Canonicalize bare heaven labels → /u/label.heaven
  createEffect(() => {
    const id = (params.id ?? '').trim().toLowerCase()
    if (id && !id.includes('.') && !id.startsWith('0x')) {
      navigate(`/u/${id}.heaven`, { replace: true })
    }
  })

  const parsed = createMemo(() => parseProfileId(params.id))

  const resolvedQuery = createQuery(() => ({
    queryKey: ['profileResolve', params.id],
    queryFn: () => resolveProfileId(parsed()),
    get enabled() { return !!params.id },
  }))

  const address = () => resolvedQuery.data?.address
  const node = () => resolvedQuery.data?.node

  const scrobblesQuery = createQuery(() => ({
    queryKey: ['scrobbles', address()],
    queryFn: () => fetchScrobbleEntries(address()!),
    get enabled() { return !!address() },
  }))

  const profileQuery = createQuery(() => ({
    queryKey: ['profile', address(), node()],
    queryFn: async () => {
      let profile = (await getProfile(address()!)) ?? ({} as ProfileInput)

      if (node()) {
        try {
          profile = await applyHeavenRecords(profile, node()!)
        } catch (err) {
          console.warn('[PublicProfilePage] Failed to fetch records:', err)
        }
      }

      return profile
    },
    get enabled() { return !!address() },
  }))

  const ensProfileQuery = createQuery(() => ({
    queryKey: ['ensProfile', address()],
    queryFn: () => getEnsProfile(address()!),
    get enabled() { return !!address() },
    staleTime: 1000 * 60 * 30,
  }))

  const FILEBASE_GATEWAY = 'https://heaven.myfilebase.com/ipfs'

  const scrobbles = (): ProfileScrobble[] => {
    const entries = scrobblesQuery.data ?? []
    return entries.map((e) => ({
      id: e.id,
      title: e.title,
      artist: e.artist,
      album: e.album,
      trackId: e.trackId,
      timestamp: formatTimeAgo(e.playedAt),
      coverUrl: e.coverCid
        ? `${FILEBASE_GATEWAY}/${e.coverCid}?img-width=96&img-height=96&img-format=webp&img-quality=80`
        : undefined,
    }))
  }

  const displayName = () => {
    const profile = profileQuery.data
    if (profile?.displayName) return profile.displayName
    const resolved = resolvedQuery.data
    // Prefer heaven label from any resolution type (including address reverse lookup)
    if (resolved?.label) return resolved.label
    if (resolved?.name) return resolved.name
    const ens = ensProfileQuery.data
    if (ens?.name) return ens.name
    if (resolved?.address) {
      return `${resolved.address.slice(0, 6)}...${resolved.address.slice(-4)}`
    }
    return 'Profile'
  }

  const handleName = () => {
    const resolved = resolvedQuery.data
    if (!resolved) return '@unknown'
    if (resolved.label) return `${resolved.label}.heaven`
    if (resolved.name) return resolved.name
    if (resolved.address) return `${resolved.address.slice(0, 6)}...${resolved.address.slice(-4)}`
    return '@unknown'
  }

  const initialLoading = () => resolvedQuery.isLoading || (address() && (profileQuery.isLoading || ensProfileQuery.isLoading))

  return (
    <div class="h-full overflow-y-auto">
      <Show
        when={!resolvedQuery.isError}
        fallback={
          <div class="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-6">
            <div class="text-center text-[var(--text-secondary)]">
              <div class="text-xl font-semibold text-[var(--text-primary)] mb-2">Profile not found</div>
              <div class="text-sm">{(resolvedQuery.error as Error | undefined)?.message || 'Unable to resolve this profile.'}</div>
            </div>
          </div>
        }
      >
        <Show when={!initialLoading()} fallback={<ProfileSkeleton />}>
          <ProfilePage
            username={handleName()}
            displayName={displayName()}
            avatarUrl={profileQuery.data?.avatar || ensProfileQuery.data?.avatar || undefined}
            stats={{
              followers: 0,
              following: 0,
              likes: 0,
            }}
            isOwnProfile={false}
            activeTab={activeTab()}
            onTabChange={setActiveTab}
            scrobbles={scrobbles()}
            scrobblesLoading={scrobblesQuery.isLoading}
            profileData={profileQuery.data || null}
            profileLoading={profileQuery.isLoading}
            heavenName={resolvedQuery.data?.label ?? null}
            ensProfile={ensProfileQuery.data}
            ensLoading={ensProfileQuery.isLoading}
          />
        </Show>
      </Show>
    </div>
  )
}
