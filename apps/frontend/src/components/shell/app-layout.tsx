/**
 * AppLayout — shared layout wrapper for all routes.
 *
 * Renders AppShell (header, sidebar, right panel, footer with MusicPlayer)
 * and an <Outlet /> for child route content. This stays mounted across
 * navigation so the music player persists.
 *
 * Mobile layout: MiniPlayer + MobileFooter instead of sidebar/right panel.
 */

import type { ParentComponent } from 'solid-js'
import { Show, createMemo, createEffect } from 'solid-js'
import { useLocation, useNavigate } from '@solidjs/router'
import {
  HOME, WALLET, SCHEDULE, CHAT, SEARCH, MUSIC, ONBOARDING, SETTINGS,
} from '@heaven/core'
import { useI18n } from '@heaven/i18n/solid'
import { useAuth } from '../../providers'
import { useOnboardingStatus } from '../../hooks/useOnboardingStatus'
import {
  AppShell,
  RightPanel,
  MobileFooter,
  MiniPlayer,
  SidePlayer,
  SideMenuDrawer,
} from '@heaven/ui'
import type { MobileFooterTab } from '@heaven/ui'
import type { ProfileInput } from '@heaven/ui'

// Mobile footer icons (Phosphor, 256x256 viewBox)
const HomeIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z" />
  </svg>
)
const HomeFillIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M224,115.55V208a16,16,0,0,1-16,16H168a16,16,0,0,1-16-16V168a8,8,0,0,0-8-8H112a8,8,0,0,0-8,8v40a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V115.55a16,16,0,0,1,5.17-11.78l80-75.48a16,16,0,0,1,21.66,0l80,75.48A16,16,0,0,1,224,115.55Z" />
  </svg>
)
const CommunityIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M244.8,150.4a8,8,0,0,1-11.2-1.6A51.6,51.6,0,0,0,192,128a8,8,0,0,1-7.37-4.89,8,8,0,0,1,0-6.22A8,8,0,0,1,192,112a24,24,0,1,0-23.24-30,8,8,0,1,1-15.5-4A40,40,0,1,1,219,117.51a67.94,67.94,0,0,1,27.43,21.68A8,8,0,0,1,244.8,150.4ZM190.92,212a8,8,0,1,1-13.84,8,57,57,0,0,0-98.16,0,8,8,0,1,1-13.84-8,72.06,72.06,0,0,1,33.74-29.92,48,48,0,1,1,58.36,0A72.06,72.06,0,0,1,190.92,212ZM128,176a32,32,0,1,0-32-32A32,32,0,0,0,128,176ZM72,120a8,8,0,0,0-8-8A24,24,0,1,1,87.24,82a8,8,0,1,0,15.5-4A40,40,0,1,0,37,117.51,67.94,67.94,0,0,0,9.6,139.19a8,8,0,1,0,12.8,9.61A51.6,51.6,0,0,1,64,128,8,8,0,0,0,72,120Z" />
  </svg>
)
const CommunityFillIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M64.12,147.8a4,4,0,0,1-4,4.2H16a8,8,0,0,1-7.8-6.17,8.35,8.35,0,0,1,1.62-6.93A67.79,67.79,0,0,1,37,117.51a40,40,0,1,1,66.46-35.8,3.94,3.94,0,0,1-2.27,4.18A64.08,64.08,0,0,0,64,144C64,145.28,64,146.54,64.12,147.8Zm182-8.91A67.76,67.76,0,0,0,219,117.51a40,40,0,1,0-66.46-35.8,3.94,3.94,0,0,0,2.27,4.18A64.08,64.08,0,0,1,192,144c0,1.28,0,2.54-.12,3.8a4,4,0,0,0,4,4.2H240a8,8,0,0,0,7.8-6.17A8.33,8.33,0,0,0,246.17,138.89Zm-89,43.18a48,48,0,1,0-58.37,0A72.13,72.13,0,0,0,65.07,212,8,8,0,0,0,72,224H184a8,8,0,0,0,6.93-12A72.15,72.15,0,0,0,157.19,182.07Z" />
  </svg>
)
const ChatIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-4-1.08,7.85,7.85,0,0,0-2.53.42L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
  </svg>
)
const ChatFillIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M232,128A104,104,0,0,1,79.12,219.82L45.07,231.17a16,16,0,0,1-20.24-20.24l11.35-34.05A104,104,0,1,1,232,128Z" />
  </svg>
)
const CalendarIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z" />
  </svg>
)
const CalendarFillIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,48H48V48H72v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24Z" />
  </svg>
)
const WalletIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M216,64H56A8,8,0,0,1,56,48H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm0,128H56a8,8,0,0,1-8-8V78.63A23.84,23.84,0,0,0,56,80H216Zm-36-60a12,12,0,1,1,12-12A12,12,0,0,1,180,132Z" />
  </svg>
)
const WalletFillIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M216,64H56a8,8,0,0,1,0-16H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm-36,80a12,12,0,1,1,12-12A12,12,0,0,1,180,144Z" />
  </svg>
)
const MusicIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V62.25l112-28V134.08A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69ZM52,216a20,20,0,1,1,20-20A20,20,0,0,1,52,216Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,184Z" />
  </svg>
)
const MusicFillIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V98.75l112-28v69.33A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69Z" />
  </svg>
)
import { useQueryClient } from '@tanstack/solid-query'
import { AppSidebar, AuthDialog } from '.'
import { authDialogOpen, setAuthDialogOpen } from '../../lib/auth-dialog'
import { userMenuOpen, setUserMenuOpen } from '../../lib/user-menu'
import { Toaster } from '../Toaster'
import { UploadQueue } from '../UploadQueue'
import { AddToPlaylistDialog } from '../AddToPlaylistDialog'
import { usePlayer } from '../../providers'
import { usePlaylistDialog, buildMenuActions, useArtistNavigation } from '../../hooks/useTrackListActions'

export const AppLayout: ParentComponent = (props) => {
  const { t } = useI18n()
  const auth = useAuth()
  const player = usePlayer()
  const location = useLocation()
  const navigate = useNavigate()
  const isChatRoute = createMemo(() => location.pathname.startsWith('/chat'))
  const isActiveChat = createMemo(() => location.pathname !== '/chat' && location.pathname.startsWith('/chat'))
  const isPost = createMemo(() => location.pathname.startsWith('/post/'))
  const isPublicProfile = createMemo(() => location.pathname.startsWith('/u/'))
  const isPlaylist = createMemo(() => location.pathname.startsWith('/playlist/'))
  const isArtist = createMemo(() => location.pathname.startsWith('/artist/'))
  const isAlbum = createMemo(() => location.pathname.startsWith('/album/'))
  // /music/:tab sub-pages (e.g. /music/shared, /music/local) — but not /music itself
  const isMusicSubPage = createMemo(() => {
    const p = location.pathname
    return p.startsWith('/music/') && p !== '/music'
  })

  // Mobile footer only on main nav pages (home, music, wallet, schedule, chat list)
  // Hidden on: sub-pages that have their own back navigation
  const showMobileNav = createMemo(() =>
    !isActiveChat() && !isPost() && !isPublicProfile() &&
    !isPlaylist() && !isArtist() && !isAlbum() && !isMusicSubPage()
  )

  // Onboarding gate: redirect authenticated users with incomplete onboarding
  const onboarding = useOnboardingStatus(() => auth.pkpAddress())

  createEffect(() => {
    if (auth.isSessionRestoring()) return
    if (!auth.isAuthenticated()) return // public access OK
    if (onboarding.status() === 'loading') return // wait for check
    if (onboarding.status() === 'needs-onboarding') {
      navigate(ONBOARDING, { replace: true })
    }
  })

  // Playlist dialog for SidePlayer menu
  const plDialog = usePlaylistDialog()
  const sidePlayerMenu = buildMenuActions(plDialog)
  const goToArtist = useArtistNavigation()
  const queryClient = useQueryClient()

  // Mobile user menu drawer (shared signal so homepage can trigger it)

  // Derive avatar URL from cached profile query (zero-cost — no extra network requests)
  const cachedAvatarUrl = createMemo(() => {
    const addr = auth.pkpAddress()
    if (!addr) return undefined
    // TanStack query cache stores profile data under ['profile', address, node]
    // We use findAll to match any query starting with ['profile', address]
    const queries = queryClient.getQueriesData<ProfileInput>({ queryKey: ['profile', addr] })
    for (const [, data] of queries) {
      if (data?.avatar) return data.avatar
    }
    return undefined
  })

  const mobileDisplayName = () => {
    const hn = localStorage.getItem('heaven:username')
    if (hn) return hn
    const addr = auth.pkpAddress()
    if (addr) return `${addr.slice(0, 6)}...${addr.slice(-4)}`
    return 'My Profile'
  }

  const mobileUsername = () => {
    const hn = localStorage.getItem('heaven:username')
    if (hn) return `${hn}.heaven`
    const addr = auth.pkpAddress()
    if (addr) return `${addr.slice(0, 6)}...${addr.slice(-4)}`
    return ''
  }

  // Mobile footer tabs
  const mobileFooterTabs = (): MobileFooterTab[] => [
    { id: 'home', icon: <HomeIcon />, activeIcon: <HomeFillIcon />, label: t('nav.feed') },
    { id: 'search', icon: <CommunityIcon />, activeIcon: <CommunityFillIcon />, label: t('nav.community') },
    { id: 'music', icon: <MusicIcon />, activeIcon: <MusicFillIcon />, label: t('nav.music') },
    { id: 'chat', icon: <ChatIcon />, activeIcon: <ChatFillIcon />, label: t('nav.chat') },
    { id: 'schedule', icon: <CalendarIcon />, activeIcon: <CalendarFillIcon />, label: t('nav.schedule') },
    { id: 'wallet', icon: <WalletIcon />, activeIcon: <WalletFillIcon />, label: t('nav.wallet') },
  ]

  // Determine active tab from current route
  const activeTab = createMemo(() => {
    const path = location.pathname
    if (path === '/') return 'home'
    if (path.startsWith('/search')) return 'search'
    if (path.startsWith('/music')) return 'music'
    if (path.startsWith('/chat')) return 'chat'
    if (path.startsWith('/wallet')) return 'wallet'
    if (path.startsWith('/schedule')) return 'schedule'
    return 'home'
  })

  // Handle mobile tab navigation
  const handleTabPress = (tabId: string) => {
    switch (tabId) {
      case 'home': navigate(HOME); break
      case 'search': navigate(SEARCH); break
      case 'music': navigate(MUSIC); break
      case 'chat': navigate(CHAT); break
      case 'wallet': navigate(WALLET); break
      case 'schedule': navigate(SCHEDULE); break
    }
  }

  return (
    <Show
      when={!auth.isSessionRestoring()}
      fallback={
        <div class="flex items-center justify-center h-screen bg-[var(--bg-page)]">
          <div class="w-6 h-6 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
        <AppShell
          sidebar={<AppSidebar compact={isChatRoute()} />}
          rightPanel={
            <RightPanel>
              <SidePlayer
                title={player.currentTrack()?.title}
                artist={player.currentTrack()?.artist}
                coverSrc={player.currentTrack()?.albumCover}
                currentTime={player.currentTimeFormatted()}
                duration={player.durationFormatted()}
                progress={player.progress()}
                isPlaying={player.isPlaying()}
                onPlayPause={player.togglePlay}
                onNext={player.playNext}
                onPrev={player.playPrev}
                onProgressChange={player.handleSeek}
                onProgressChangeStart={player.handleSeekStart}
                onProgressChangeEnd={player.handleSeekEnd}
                track={player.currentTrack() ? {
                  id: player.currentTrack()!.id,
                  title: player.currentTrack()!.title,
                  artist: player.currentTrack()!.artist,
                  album: player.currentTrack()!.album ?? '',
                  albumCover: player.currentTrack()!.albumCover,
                  duration: player.durationFormatted(),
                } : undefined}
                menuActions={player.currentTrack() ? sidePlayerMenu : undefined}
                onArtistClick={player.currentTrack() ? () => goToArtist(player.currentTrack()!) : undefined}
                noTrackText={t('music.noTrack')}
                unknownArtistText={t('music.unknownArtist')}
              />
            </RightPanel>
          }
          mobilePlayer={
            <Show when={player.currentTrack() && !isPost()}>
              <MiniPlayer
                title={player.currentTrack()?.title}
                artist={player.currentTrack()?.artist}
                coverSrc={player.currentTrack()?.albumCover}
                progress={player.progress()}
                isPlaying={player.isPlaying()}
                onPlayPause={player.togglePlay}
                onNext={player.playNext}
              />
            </Show>
          }
          mobileFooter={
            <Show when={showMobileNav()}>
              <MobileFooter
                tabs={mobileFooterTabs()}
                activeTab={activeTab()}
                onTabPress={handleTabPress}
              />
            </Show>
          }
        >
          {props.children}
          <Toaster />
          <UploadQueue />
          <AddToPlaylistDialog
            open={plDialog.open()}
            onOpenChange={plDialog.setOpen}
            track={plDialog.track()}
          />
          {/* Auth dialog - always mounted at app root level */}
          <AuthDialog open={authDialogOpen()} onOpenChange={setAuthDialogOpen} />
          {/* Mobile side menu drawer */}
          <SideMenuDrawer
            open={userMenuOpen()}
            onOpenChange={setUserMenuOpen}
            isAuthenticated={auth.isAuthenticated()}
            avatarUrl={cachedAvatarUrl()}
            settingsLabel={t('nav.settings')}
            walletLabel={t('nav.wallet')}
            logOutLabel={t('auth.logOut')}
            githubLabel={t('menu.github')}
            displayName={mobileDisplayName()}
            username={mobileUsername()}
            logoSrc={`${import.meta.env.BASE_URL}images/heaven.png`}
            onSettings={() => navigate(SETTINGS)}
            onWallet={() => navigate(WALLET)}
            onLogout={async () => {
              await auth.logout()
              navigate(HOME)
            }}
          />
        </AppShell>
    </Show>
  )
}
