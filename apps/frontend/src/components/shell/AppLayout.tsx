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
import { Show, createMemo } from 'solid-js'
import { useLocation, useNavigate } from '@solidjs/router'
import { useIsMobile } from '@heaven/ui'
import {
  AppShell,
  Header,
  RightPanel,
  MobileFooter,
  MiniPlayer,
  SidePlayer,
} from '@heaven/ui'
import type { MobileFooterTab } from '@heaven/ui'

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
const LibraryIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V62.25l112-28V134.08A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69ZM52,216a20,20,0,1,1,20-20A20,20,0,0,1,52,216Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,184Z" />
  </svg>
)
const LibraryFillIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V98.75l112-28v69.33A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69Z" />
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
const ProfileIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z" />
  </svg>
)
const ProfileFillIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z" />
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
import { AppSidebar, HeaderActions } from '.'
import { Toaster } from '../Toaster'
import { UploadQueue } from '../UploadQueue'
import { AddToPlaylistDialog } from '../AddToPlaylistDialog'
import { usePlayer } from '../../providers'
import { usePlaylistDialog, buildMenuActions } from '../../hooks/useTrackListActions'

export const AppLayout: ParentComponent = (props) => {
  const player = usePlayer()
  const location = useLocation()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const isChat = createMemo(() => location.pathname.startsWith('/chat'))
  const isPost = createMemo(() => location.pathname.startsWith('/post/'))

  // Playlist dialog for SidePlayer menu
  const plDialog = usePlaylistDialog()
  const sidePlayerMenu = buildMenuActions(plDialog)
  // Hide global header on mobile when in chat or post view (they have their own headers)
  const showGlobalHeader = createMemo(() => !isMobile() || (!isChat() && !isPost()))

  // Mobile footer tabs
  const mobileFooterTabs: MobileFooterTab[] = [
    { id: 'home', icon: <HomeIcon />, activeIcon: <HomeFillIcon />, label: 'Home' },
    { id: 'music', icon: <LibraryIcon />, activeIcon: <LibraryFillIcon />, label: 'Music' },
    { id: 'chat', icon: <ChatIcon />, activeIcon: <ChatFillIcon />, label: 'Chat' },
    { id: 'wallet', icon: <WalletIcon />, activeIcon: <WalletFillIcon />, label: 'Wallet' },
    { id: 'profile', icon: <ProfileIcon />, activeIcon: <ProfileFillIcon />, label: 'Profile' },
  ]

  // Determine active tab from current route
  const activeTab = createMemo(() => {
    const path = location.pathname
    if (path === '/') return 'home'
    if (path.startsWith('/music')) return 'music'
    if (path.startsWith('/chat')) return 'chat'
    if (path.startsWith('/wallet')) return 'wallet'
    if (path.startsWith('/profile') || path.startsWith('/u/')) return 'profile'
    return 'home'
  })

  // Handle mobile tab navigation
  const handleTabPress = (tabId: string) => {
    switch (tabId) {
      case 'home': navigate('/'); break
      case 'music': navigate('/music'); break
      case 'chat': navigate('/chat'); break
      case 'wallet': navigate('/wallet'); break
      case 'profile': navigate('/profile'); break
    }
  }

  return (
    <AppShell
      header={
        <Show when={showGlobalHeader()}>
          <Header
            rightSlot={<HeaderActions />}
          />
        </Show>
      }
      sidebar={<AppSidebar />}
      rightPanel={isChat() ? undefined :
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
        <Show when={!isPost()}>
          <MobileFooter
            tabs={mobileFooterTabs}
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
    </AppShell>
  )
}
