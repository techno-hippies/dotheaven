import { type Component, createSignal, createEffect, Show, createMemo, onCleanup, onMount } from 'solid-js'
import { Button } from '@heaven/ui'
import { useNavigate, useParams } from '@solidjs/router'
import { createQuery } from '@tanstack/solid-query'
import { ProfilePage, type ProfileTab, type ProfileScrobble } from '../components/profile'
import { useAuth } from '../providers'
import { useI18n } from '@heaven/i18n/solid'
import { openAuthDialog } from '../lib/auth-dialog'
import { fetchScrobbleEntries, getProfile, setProfile, setTextRecord, setTextRecords, computeNode, checkNameAvailable, registerHeavenName, getEnsProfile, getPrimaryName, getVerificationStatus, buildSelfVerifyLink, syncVerificationToMegaEth, getHostBasePrice, getHostOpenSlots, getSlot, SlotStatus } from '../lib/heaven'
import {
  initSessionService,
  setBasePrice as setBasePriceTx,
  cancelSlot as cancelSlotTx,
  bookSlot as bookSlotTx,
  createRequest as createRequestTx,
} from '../lib/session-service'
import { uploadAvatar } from '../lib/heaven/avatar'
import { getFollowState, getFollowCounts, toggleFollow } from '../lib/heaven/follow'
import { type ProfileInput, type VerificationState, type VerifyStep, type VerificationData, type TimeSlot, type SessionSlotData, getTagLabel, VerifyIdentityDialog, alpha3ToAlpha2 } from '@heaven/ui'
import { publicProfile, peerChat } from '@heaven/core'
import { parseTagCsv } from '../lib/heaven/profile'
import { parseEther, type Address } from 'viem'
import { formatTimeAgo, parseProfileId, resolveProfileId, applyHeavenRecords } from './profile-utils'
import { resolveCoverUrl } from '../lib/heaven/cover-ref'
import { ProfileWalletTab } from './ProfileWalletTab'
import { ProfileSkeleton } from './ProfileSkeleton'

export const MyProfilePage: Component = () => {
  const auth = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = createSignal<ProfileTab>('posts')
  const [heavenName, setHeavenName] = createSignal<string | null>(localStorage.getItem('heaven:username'))
  const [nameClaiming, setNameClaiming] = createSignal(false)
  const [nameClaimError, setNameClaimError] = createSignal<string | null>(null)

  const address = () => auth.pkpAddress()

  // Initialize session service for escrow transactions
  onMount(() => {
    initSessionService({
      getAuthContext: () => auth.getAuthContext(),
      getPkp: () => auth.pkpInfo(),
    })
  })

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

  // ── Schedule state ──
  const [scheduleAvailability, setScheduleAvailability] = createSignal<TimeSlot[]>(
    JSON.parse(localStorage.getItem('heaven:schedule:availability') || '[]')
  )
  const [scheduleAccepting, setScheduleAccepting] = createSignal(
    localStorage.getItem('heaven:schedule:accepting') === 'true'
  )

  // Persist availability to localStorage
  createEffect(() => {
    localStorage.setItem('heaven:schedule:availability', JSON.stringify(scheduleAvailability()))
  })
  createEffect(() => {
    localStorage.setItem('heaven:schedule:accepting', String(scheduleAccepting()))
  })

  // Fetch host base price from contract
  const basePriceQuery = createQuery(() => ({
    queryKey: ['hostBasePrice', address()],
    queryFn: () => getHostBasePrice(address()! as Address),
    get enabled() { return !!address() },
    staleTime: 1000 * 60 * 5,
  }))

  // Fetch open slots for this host
  const slotsQuery = createQuery(() => ({
    queryKey: ['hostSlots', address()],
    queryFn: async () => {
      const slots = await getHostOpenSlots(address()! as Address)
      return slots.map((s): SessionSlotData => ({
        id: s.id,
        startTime: s.startTime,
        durationMins: s.durationMins,
        priceEth: s.priceEth,
        status: s.status === SlotStatus.Open ? 'open' : s.status === SlotStatus.Booked ? 'booked' : s.status === SlotStatus.Cancelled ? 'cancelled' : 'settled',
      }))
    },
    get enabled() { return !!address() },
    staleTime: 1000 * 60 * 2,
  }))

  const handleSetBasePrice = async (priceEth: string) => {
    try {
      await setBasePriceTx(priceEth)
      basePriceQuery.refetch()
    } catch (err) {
      console.error('[Schedule] setBasePrice failed:', err)
    }
  }

  const handleCancelSlot = async (slotId: number) => {
    try {
      await cancelSlotTx(slotId)
      slotsQuery.refetch()
    } catch (err) {
      console.error('[Schedule] cancelSlot failed:', err)
    }
  }

  const myFollowCountsQuery = createQuery(() => ({
    queryKey: ['followCounts', address()],
    queryFn: () => getFollowCounts(address()! as Address),
    get enabled() { return !!address() },
    staleTime: 1000 * 60,
  }))

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
    staleTime: 1000 * 60 * 30,
  }))

  // Handle importing an avatar URI from ENS (stores as ENSIP-12 ref or URL)
  const [importedAvatarUri, setImportedAvatarUri] = createSignal<string | null>(null)

  const handleImportAvatar = (uri: string) => {
    setImportedAvatarUri(uri)
  }

  // ---- Verification (Self.xyz) ----
  const verificationQuery = createQuery(() => ({
    queryKey: ['verification', address()],
    queryFn: () => getVerificationStatus(address()! as `0x${string}`),
    get enabled() { return !!address() },
    staleTime: 1000 * 60 * 5,
  }))

  const verificationState = (): VerificationState => {
    const v = verificationQuery.data
    if (!v) return 'none'
    return v.verified ? 'verified' : 'none'
  }

  const verificationData = (): VerificationData | undefined => {
    const v = verificationQuery.data
    if (!v?.verified) return undefined
    return { verified: true, nationality: v.nationality }
  }

  const [verifyDialogOpen, setVerifyDialogOpen] = createSignal(false)
  const [verifyStep, setVerifyStep] = createSignal<VerifyStep>('qr')
  const [verifyLink, setVerifyLink] = createSignal<string | undefined>()
  const [verifyLinkLoading, setVerifyLinkLoading] = createSignal(false)
  const [verifyError, setVerifyError] = createSignal<string | undefined>()

  let pollTimer: ReturnType<typeof setInterval> | undefined

  onCleanup(() => { if (pollTimer) clearInterval(pollTimer) })

  const handleVerifyClick = async () => {
    setVerifyStep('qr')
    setVerifyLink(undefined)
    setVerifyError(undefined)
    setVerifyDialogOpen(true)
    setVerifyLinkLoading(true)

    try {
      const VERIFIER = import.meta.env.VITE_SELF_VERIFIER_CELO
      console.log('[Verify] VITE_SELF_VERIFIER_CELO =', VERIFIER)
      if (!VERIFIER) throw new Error('Verifier contract not configured')

      const link = await buildSelfVerifyLink({
        contractAddress: VERIFIER,
        userAddress: address()! as `0x${string}`,
        scope: 'heaven-profile-verify',
      })
      console.log('[Verify] Self link:', link)
      setVerifyLink(link)
      setVerifyLinkLoading(false)

      // Stay on QR step — poll in background while user scans
      pollTimer = setInterval(async () => {
        try {
          const status = await getVerificationStatus(address()! as `0x${string}`, { skipCache: true })
          if (status.verified) {
            clearInterval(pollTimer!)
            pollTimer = undefined

            // Mirror to MegaETH
            if (status.mirrorStale) {
              setVerifyStep('mirroring')
              try {
                const authCtx = await auth.getAuthContext()
                await syncVerificationToMegaEth(address()! as `0x${string}`, authCtx)
              } catch (e) {
                console.warn('[Verify] Mirror sync failed (non-fatal):', e)
              }
            }

            setVerifyStep('success')
            verificationQuery.refetch()
          }
        } catch {
          // polling error, keep trying
        }
      }, 5000)
    } catch (err: any) {
      setVerifyLinkLoading(false)
      setVerifyStep('error')
      setVerifyError(err?.message || 'Failed to start verification')
    }
  }

  const handleVerifyRetry = () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = undefined }
    handleVerifyClick()
  }

  const handleVerifyDialogChange = (open: boolean) => {
    setVerifyDialogOpen(open)
    if (!open && pollTimer) {
      clearInterval(pollTimer)
      pollTimer = undefined
    }
  }

  const scrobbles = (): ProfileScrobble[] => {
    const entries = scrobblesQuery.data ?? []
    return entries.map((e) => ({
      id: e.id,
      title: e.title,
      artist: e.artist,
      album: e.album,
      trackId: e.trackId,
      timestamp: formatTimeAgo(e.playedAt, t),
      durationSec: e.durationSec,
      coverUrl: resolveCoverUrl(e.coverCid, { width: 96, height: 96, format: 'webp', quality: 80 }),
    }))
  }

  const displayName = () => {
    const profile = profileQuery.data
    if (profile?.displayName) return profile.displayName
    const hn = heavenName()
    if (hn) return hn
    const ens = ensQuery.data
    if (ens?.name) return ens.name
    return t('profile.myProfile')
  }

  const handleName = () => {
    const hn = heavenName()
    if (hn) return `${hn}.heaven`
    const ens = ensQuery.data
    if (ens?.name) return ens.name
    const addr = auth.eoaAddress() ?? auth.pkpAddress()
    if (!addr) return 'unknown'
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
      throw new Error(t('profile.claimNameFirst'))
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

  // Nationality: prefer verified (alpha-3 → alpha-2), fall back to self-reported
  const nationalityCode = () => {
    const v = verificationQuery.data
    if (v?.verified && v.nationality) {
      return alpha3ToAlpha2(v.nationality) ?? v.nationality.slice(0, 2).toUpperCase()
    }
    return profileQuery.data?.nationality || undefined
  }

  const initialLoading = () => profileQuery.isLoading || ensQuery.isLoading

  return (
    <div class="h-full overflow-y-auto">
      <Show
        when={auth.isAuthenticated()}
        fallback={
          <div class="flex flex-col items-center justify-center min-h-[60vh] gap-6 py-8">
            <div class="w-20 h-20 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center">
              <svg class="w-10 h-10 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 256 256">
                <path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z" />
              </svg>
            </div>
            <div class="text-center">
              <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-2">{t('profile.yourProfile')}</h2>
              <p class="text-base text-[var(--text-secondary)] mb-6">{t('profile.signUpPrompt')}</p>
              <Button size="lg" onClick={() => openAuthDialog()}>
                {t('auth.signUp')}
              </Button>
            </div>
          </div>
        }
      >
        <Show when={!initialLoading()} fallback={<ProfileSkeleton />}>
        <ProfilePage
          username={handleName()}
          displayName={displayName()}
          avatarUrl={profileQuery.data?.avatar || ensQuery.data?.avatar || undefined}
          nationalityCode={nationalityCode()}
          isOwnProfile={true}
          followerCount={myFollowCountsQuery.data?.followers}
          followingCount={myFollowCountsQuery.data?.following}
          onFollowerCountClick={() => { const id = heavenName() ? `${heavenName()}.heaven` : address(); if (id) navigate(`/u/${id}/followers`) }}
          onFollowingCountClick={() => { const id = heavenName() ? `${heavenName()}.heaven` : address(); if (id) navigate(`/u/${id}/following`) }}
          verificationState={verificationState()}
          onVerifyClick={handleVerifyClick}
          walletSlot={address() ? <ProfileWalletTab address={address()!} /> : undefined}
          activeTab={activeTab()}
          onTabChange={setActiveTab}
          scrobbles={scrobbles()}
          scrobblesLoading={scrobblesQuery.isLoading}
          onArtistClick={(artist) => navigate(`/artist/${encodeURIComponent(artist)}`)}
          onTrackClick={(trackId) => console.log('[Profile] track click:', trackId)}
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
          verification={verificationData()}
          scheduleBasePrice={basePriceQuery.data}
          scheduleAccepting={scheduleAccepting()}
          scheduleAvailability={scheduleAvailability()}
          scheduleSlots={slotsQuery.data}
          scheduleSlotsLoading={slotsQuery.isLoading}
          onSetBasePrice={handleSetBasePrice}
          onToggleAccepting={setScheduleAccepting}
          onAvailabilityChange={setScheduleAvailability}
          onCancelSlot={handleCancelSlot}
        />
        <VerifyIdentityDialog
          open={verifyDialogOpen()}
          onOpenChange={handleVerifyDialogChange}
          verifyLink={verifyLink()}
          linkLoading={verifyLinkLoading()}
          step={verifyStep()}
          errorMessage={verifyError()}
          onRetry={handleVerifyRetry}
        />
        </Show>
      </Show>
    </div>
  )
}

export const PublicProfilePage: Component = () => {
  const params = useParams()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = createSignal<ProfileTab>('posts')

  // Canonicalize bare heaven labels → /u/label.heaven
  createEffect(() => {
    const id = (params.id ?? '').trim().toLowerCase()
    if (id && !id.includes('.') && !id.startsWith('0x')) {
      navigate(publicProfile(`${id}.heaven`), { replace: true })
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

  // Schedule data for public profile
  const publicBasePriceQuery = createQuery(() => ({
    queryKey: ['hostBasePrice', address()],
    queryFn: () => getHostBasePrice(address()! as Address),
    get enabled() { return !!address() },
    staleTime: 1000 * 60 * 5,
  }))

  const publicSlotsQuery = createQuery(() => ({
    queryKey: ['hostSlots', address()],
    queryFn: async () => {
      const slots = await getHostOpenSlots(address()! as Address)
      return slots.map((s): SessionSlotData => ({
        id: s.id,
        startTime: s.startTime,
        durationMins: s.durationMins,
        priceEth: s.priceEth,
        status: s.status === SlotStatus.Open ? 'open' : s.status === SlotStatus.Booked ? 'booked' : s.status === SlotStatus.Cancelled ? 'cancelled' : 'settled',
      }))
    },
    get enabled() { return !!address() },
    staleTime: 1000 * 60 * 2,
  }))

  const handleBookSlot = async (slotId: number) => {
    try {
      const slot = await getSlot(slotId)
      const priceWei = parseEther(slot.priceEth)
      await bookSlotTx(slotId, priceWei)
      publicSlotsQuery.refetch()
    } catch (err) {
      console.error('[Schedule] bookSlot failed:', err)
    }
  }

  const handleRequestCustomTime = async (params: { windowStart: number; windowEnd: number; durationMins: number; amountEth: string }) => {
    const hostAddr = address()
    if (!hostAddr) return
    try {
      await createRequestTx({
        hostTarget: hostAddr as `0x${string}`,
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
        durationMins: params.durationMins,
        expiry: Math.floor(Date.now() / 1000) + 86400 * 7,
        amountWei: parseEther(params.amountEth),
      })
      publicSlotsQuery.refetch()
    } catch (err) {
      console.error('[Schedule] createRequest failed:', err)
    }
  }

  // ── Follow state ──────────────────────────────────────────────────
  const auth = useAuth()
  const myAddress = () => auth.pkpAddress()

  const followStateQuery = createQuery(() => ({
    queryKey: ['followState', myAddress(), address()],
    queryFn: () => getFollowState(myAddress()! as Address, address()! as Address),
    get enabled() { return !!myAddress() && !!address() && myAddress() !== address() },
    staleTime: 1000 * 30,
  }))

  const followCountsQuery = createQuery(() => ({
    queryKey: ['followCounts', address()],
    queryFn: () => getFollowCounts(address()! as Address),
    get enabled() { return !!address() },
    staleTime: 1000 * 60,
  }))

  const handleFollowClick = async () => {
    const target = address()
    const pkp = auth.pkpInfo()
    if (!target || !pkp) {
      openAuthDialog()
      return
    }
    const action = followStateQuery.data ? 'unfollow' : 'follow'
    try {
      const result = await toggleFollow(
        target,
        action,
        (msg: string) => auth.signMessage(msg),
        auth.getAuthContext(),
        pkp.publicKey,
      )
      if (result.success) {
        followStateQuery.refetch()
        followCountsQuery.refetch()
      } else {
        console.error('[Follow] failed:', result.error)
      }
    } catch (err) {
      console.error('[Follow] error:', err)
    }
  }

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

  const publicVerificationQuery = createQuery(() => ({
    queryKey: ['verification', address()],
    queryFn: () => getVerificationStatus(address()! as `0x${string}`),
    get enabled() { return !!address() },
    staleTime: 1000 * 60 * 5,
  }))

  const publicVerificationData = (): VerificationData | undefined => {
    const v = publicVerificationQuery.data
    if (!v?.verified) return undefined
    return { verified: true, nationality: v.nationality }
  }

  const scrobbles = (): ProfileScrobble[] => {
    const entries = scrobblesQuery.data ?? []
    return entries.map((e) => ({
      id: e.id,
      title: e.title,
      artist: e.artist,
      album: e.album,
      trackId: e.trackId,
      timestamp: formatTimeAgo(e.playedAt, t),
      durationSec: e.durationSec,
      coverUrl: resolveCoverUrl(e.coverCid, { width: 96, height: 96, format: 'webp', quality: 80 }),
    }))
  }

  const displayName = () => {
    const profile = profileQuery.data
    if (profile?.displayName) return profile.displayName
    const resolved = resolvedQuery.data
    if (resolved?.label) return resolved.label
    if (resolved?.name) return resolved.name
    const ens = ensProfileQuery.data
    if (ens?.name) return ens.name
    if (resolved?.address) {
      return `${resolved.address.slice(0, 6)}...${resolved.address.slice(-4)}`
    }
    return t('nav.profile')
  }

  const handleName = () => {
    const resolved = resolvedQuery.data
    if (!resolved) return 'unknown'
    if (resolved.label) return `${resolved.label}.heaven`
    if (resolved.name) return resolved.name
    if (resolved.address) return `${resolved.address.slice(0, 6)}...${resolved.address.slice(-4)}`
    return 'unknown'
  }

  // Nationality: prefer verified (alpha-3 → alpha-2), fall back to self-reported
  const publicNationalityCode = () => {
    const v = publicVerificationQuery.data
    if (v?.verified && v.nationality) {
      return alpha3ToAlpha2(v.nationality) ?? v.nationality.slice(0, 2).toUpperCase()
    }
    return profileQuery.data?.nationality || undefined
  }

  const initialLoading = () => resolvedQuery.isLoading || (address() && (profileQuery.isLoading || ensProfileQuery.isLoading))

  return (
    <div class="h-full overflow-y-auto">
      <Show
        when={!resolvedQuery.isError}
        fallback={
          <div class="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-6">
            <div class="text-center text-[var(--text-secondary)]">
              <div class="text-xl font-semibold text-[var(--text-primary)] mb-2">{t('profile.notFound')}</div>
              <div class="text-base">{(resolvedQuery.error as Error | undefined)?.message || t('profile.unableToResolve')}</div>
            </div>
          </div>
        }
      >
        <Show when={!initialLoading()} fallback={<ProfileSkeleton />}>
          <ProfilePage
            username={handleName()}
            displayName={displayName()}
            avatarUrl={profileQuery.data?.avatar || ensProfileQuery.data?.avatar || undefined}
            nationalityCode={publicNationalityCode()}
            isOwnProfile={false}
            isFollowing={followStateQuery.data ?? false}
            onFollowClick={handleFollowClick}
            followerCount={followCountsQuery.data?.followers}
            followingCount={followCountsQuery.data?.following}
            onFollowerCountClick={() => { const a = address(); if (a) navigate(`/u/${params.id}/followers`) }}
            onFollowingCountClick={() => { const a = address(); if (a) navigate(`/u/${params.id}/following`) }}
            walletSlot={address() ? <ProfileWalletTab address={address()!} /> : undefined}
            activeTab={activeTab()}
            onTabChange={setActiveTab}
            scrobbles={scrobbles()}
            scrobblesLoading={scrobblesQuery.isLoading}
            onArtistClick={(artist) => navigate(`/artist/${encodeURIComponent(artist)}`)}
            onTrackClick={(trackId) => console.log('[Profile] track click:', trackId)}
            profileData={profileQuery.data || null}
            profileLoading={profileQuery.isLoading}
            heavenName={resolvedQuery.data?.label ?? null}
            ensProfile={ensProfileQuery.data}
            ensLoading={ensProfileQuery.isLoading}
            verification={publicVerificationData()}
            scheduleBasePrice={publicBasePriceQuery.data}
            scheduleSlots={publicSlotsQuery.data}
            scheduleSlotsLoading={publicSlotsQuery.isLoading}
            onBookSlot={handleBookSlot}
            onRequestCustomTime={handleRequestCustomTime}
            onMessageClick={() => {
              const addr = address()
              if (addr) {
                navigate(peerChat(addr))
              }
            }}
          />
        </Show>
      </Show>
    </div>
  )
}
