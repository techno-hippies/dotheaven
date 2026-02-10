import { type Component, createSignal, createEffect, Show, createMemo, onMount } from 'solid-js'
import { Button } from '@heaven/ui'
import { useNavigate, useParams } from '@solidjs/router'
import { createQuery } from '@tanstack/solid-query'
import { ProfilePage, type ProfileTab } from '../components/profile'
import { useAuth } from '../providers'
import { useI18n } from '@heaven/i18n/solid'
import { openAuthDialog } from '../lib/auth-dialog'
import { fetchScrobbleEntries, getProfile, computeNode, checkNameAvailable, registerHeavenName, getEnsProfile, getPrimaryName, getVerificationStatus } from '../lib/heaven'
import { initSessionService } from '../lib/session-service'
import { getFollowState, getFollowCounts, toggleFollow } from '../lib/heaven/follow'
import { type ProfileInput, type VerificationData, VerifyIdentityDialog } from '@heaven/ui'
import { publicProfile, peerChat } from '@heaven/core'
import type { Address } from 'viem'
import { mapScrobbles, resolveNationality, parseProfileId, resolveProfileId, applyHeavenRecords } from './profile-utils'
import { ProfileWalletTab } from './ProfileWalletTab'
import { ProfileSkeleton } from './ProfileSkeleton'
import { useVerification } from '../hooks/useVerification'
import { useSchedule } from '../hooks/useSchedule'
import { useProfileSave } from '../hooks/useProfileSave'

export const MyProfilePage: Component = () => {
  const auth = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = createSignal<ProfileTab>('posts')
  const [heavenName, setHeavenName] = createSignal<string | null>(localStorage.getItem('heaven:username'))
  const [nameClaiming, setNameClaiming] = createSignal(false)
  const [nameClaimError, setNameClaimError] = createSignal<string | null>(null)
  const [importedAvatarUri, setImportedAvatarUri] = createSignal<string | null>(null)

  const address = () => auth.pkpAddress()
  const eoaAddr = () => auth.eoaAddress()

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

  // ── Hooks ──
  const schedule = useSchedule(address, { isOwner: true })
  const verification = useVerification(address, auth)
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

  const { handleProfileSave } = useProfileSave({
    auth,
    heavenName,
    importedAvatarUri,
    setImportedAvatarUri,
    profileQuery,
    t,
  })

  // ── Queries ──
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

  const ensQuery = createQuery(() => ({
    queryKey: ['ensProfile', eoaAddr()],
    queryFn: () => getEnsProfile(eoaAddr()!),
    get enabled() { return !!eoaAddr() },
    staleTime: 1000 * 60 * 30,
  }))

  // ── Derived ──
  const displayName = () => {
    if (profileQuery.data?.displayName) return profileQuery.data.displayName
    const hn = heavenName()
    if (hn) return hn
    if (ensQuery.data?.name) return ensQuery.data.name
    return t('profile.myProfile')
  }

  const handleName = () => {
    const hn = heavenName()
    if (hn) return `${hn}.heaven`
    if (ensQuery.data?.name) return ensQuery.data.name
    const addr = auth.eoaAddress() ?? auth.pkpAddress()
    if (!addr) return 'unknown'
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  // ── Name claim ──
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
          nationalityCode={resolveNationality(verification.verificationQuery.data, profileQuery.data)}
          isOwnProfile={true}
          followerCount={myFollowCountsQuery.data?.followers}
          followingCount={myFollowCountsQuery.data?.following}
          onFollowerCountClick={() => { const id = heavenName() ? `${heavenName()}.heaven` : address(); if (id) navigate(`/u/${id}/followers`) }}
          onFollowingCountClick={() => { const id = heavenName() ? `${heavenName()}.heaven` : address(); if (id) navigate(`/u/${id}/following`) }}
          verificationState={verification.verificationState()}
          onVerifyClick={verification.handleVerifyClick}
          walletSlot={address() ? <ProfileWalletTab address={address()!} /> : undefined}
          activeTab={activeTab()}
          onTabChange={setActiveTab}
          scrobbles={mapScrobbles(scrobblesQuery.data ?? [], t)}
          scrobblesLoading={scrobblesQuery.isLoading}
          profileData={profileQuery.data || null}
          profileLoading={profileQuery.isLoading}
          onProfileSave={handleProfileSave}
          heavenName={heavenName()}
          onClaimName={handleClaimName}
          onCheckNameAvailability={(name: string) => checkNameAvailable(name)}
          nameClaiming={nameClaiming()}
          nameClaimError={nameClaimError()}
          eoaAddress={eoaAddr()}
          ensProfile={ensQuery.data}
          ensLoading={ensQuery.isLoading}
          onImportAvatar={(uri: string) => setImportedAvatarUri(uri)}
          verification={verification.verificationData()}
          scheduleBasePrice={schedule.basePriceQuery.data}
          scheduleAccepting={schedule.accepting()}
          scheduleAvailability={schedule.availability()}
          scheduleSlots={schedule.slotsQuery.data}
          scheduleSlotsLoading={schedule.slotsQuery.isLoading}
          onSetBasePrice={schedule.handleSetBasePrice}
          onToggleAccepting={schedule.setAccepting}
          onAvailabilityChange={schedule.setAvailability}
          onCancelSlot={schedule.handleCancelSlot}
        />
        <VerifyIdentityDialog
          open={verification.dialogOpen()}
          onOpenChange={verification.handleDialogChange}
          verifyLink={verification.link()}
          linkLoading={verification.linkLoading()}
          step={verification.step()}
          errorMessage={verification.error()}
          onRetry={verification.handleRetry}
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
  const auth = useAuth()
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
  const myAddress = () => auth.pkpAddress()

  // ── Hooks ──
  const schedule = useSchedule(address)

  // ── Queries ──
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

  // ── Handlers ──
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

  // ── Derived ──
  const displayName = () => {
    if (profileQuery.data?.displayName) return profileQuery.data.displayName
    const resolved = resolvedQuery.data
    if (resolved?.label) return resolved.label
    if (resolved?.name) return resolved.name
    if (ensProfileQuery.data?.name) return ensProfileQuery.data.name
    if (resolved?.address) return `${resolved.address.slice(0, 6)}...${resolved.address.slice(-4)}`
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
            nationalityCode={resolveNationality(publicVerificationQuery.data, profileQuery.data)}
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
            scrobbles={mapScrobbles(scrobblesQuery.data ?? [], t)}
            scrobblesLoading={scrobblesQuery.isLoading}
            profileData={profileQuery.data || null}
            profileLoading={profileQuery.isLoading}
            heavenName={resolvedQuery.data?.label ?? null}
            ensProfile={ensProfileQuery.data}
            ensLoading={ensProfileQuery.isLoading}
            verification={publicVerificationData()}
            scheduleBasePrice={schedule.basePriceQuery.data}
            scheduleSlots={schedule.slotsQuery.data}
            scheduleSlotsLoading={schedule.slotsQuery.isLoading}
            onBookSlot={schedule.handleBookSlot}
            onRequestCustomTime={schedule.handleRequestCustomTime}
            onMessageClick={() => {
              const addr = address()
              if (addr) navigate(peerChat(addr))
            }}
          />
        </Show>
      </Show>
    </div>
  )
}
