import { type Component, Show } from 'solid-js'
import { usePlatform } from 'virtual:heaven-platform'
import {
  RightPanel,
  Avatar,
  IconButton,
  Button,
  AppShell,
  Header,
  MusicPlayer,
} from '@heaven/ui'
import { AppSidebar } from './components/shell'
import { VerticalVideoFeed, VideoPlaybackProvider, type VideoPostData } from './components/feed'
import { useAuth } from './providers'
import { useNavigate } from '@solidjs/router'

const BellIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

const WalletIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
  </svg>
)

// Placeholder feed videos
const feedVideos: VideoPostData[] = [
  {
    id: '1',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnailUrl: 'https://picsum.photos/seed/heaven1/450/800',
    username: 'synthwave_dreams',
    userAvatar: 'https://picsum.photos/seed/user1/100/100',
    caption: 'Late night coding sessions hit different with this track 🎵✨',
    trackTitle: 'Neon Dreams',
    trackArtist: 'Synthwave Collective',
    trackCoverUrl: 'https://picsum.photos/seed/album1/100/100',
    likes: 4200,
    comments: 89,
    shares: 23,
    isLiked: false,
    canInteract: true,
  },
  {
    id: '2',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    thumbnailUrl: 'https://picsum.photos/seed/heaven2/450/800',
    username: 'lofi_producer',
    userAvatar: 'https://picsum.photos/seed/user2/100/100',
    caption: 'New beat dropping soon 🔥 What do you think?',
    trackTitle: 'Midnight Rain',
    trackArtist: 'Lo-Fi Beats',
    trackCoverUrl: 'https://picsum.photos/seed/album2/100/100',
    likes: 1850,
    comments: 42,
    shares: 15,
    isLiked: true,
    canInteract: true,
  },
]

export const App: Component = () => {
  const platform = usePlatform()
  const auth = useAuth()
  const navigate = useNavigate()
  const handleLogin = () => {
    auth.loginWithPasskey()
  }

  const handleRegister = () => {
    auth.registerWithPasskey()
  }

  return (
    <AppShell
      header={
        <Header
          rightSlot={
            <div class="flex items-center gap-3">
              <Show
                when={auth.isAuthenticated()}
                fallback={
                  <Show
                    when={auth.isAuthenticating()}
                    fallback={
                      <>
                        <Button variant="secondary" onClick={handleLogin}>
                          Login
                        </Button>
                        <Button variant="default" onClick={handleRegister}>
                          Sign Up
                        </Button>
                      </>
                    }
                  >
                    {/* Tauri: auth happens in browser, show waiting message */}
                    <Show when={platform.isTauri}>
                      <span class="text-sm text-[var(--text-secondary)]">
                        Complete sign-in in browser...
                      </span>
                      <Button variant="secondary" onClick={() => auth.cancelAuth()}>
                        Cancel
                      </Button>
                    </Show>
                    {/* Web: auth happens in-page via WebAuthn prompt, show spinner */}
                    <Show when={!platform.isTauri}>
                      <span class="text-sm text-[var(--text-secondary)]">
                        Authenticating...
                      </span>
                    </Show>
                  </Show>
                }
              >
                <IconButton variant="ghost" size="md" aria-label="Notifications">
                  <BellIcon />
                </IconButton>
                <IconButton
                  variant="ghost"
                  size="md"
                  aria-label="Wallet"
                  onClick={() => navigate('/wallet')}
                >
                  <WalletIcon />
                </IconButton>
                <button
                  onClick={() => navigate('/profile')}
                  class="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  title={`Signed in as ${auth.pkpAddress()?.slice(0, 6)}...${auth.pkpAddress()?.slice(-4)}`}
                >
                  <Avatar size="sm" class="cursor-pointer" />
                </button>
              </Show>
            </div>
          }
        />
      }
      sidebar={<AppSidebar />}
      rightPanel={
        <RightPanel>
          <div class="p-4">
            <h3 class="text-base font-semibold text-[var(--text-primary)] mb-4">Now Playing</h3>
            <div class="aspect-square bg-[var(--bg-highlight)] rounded-lg mb-4" />
            <p class="text-lg font-semibold text-[var(--text-primary)]">Neon Dreams</p>
            <p class="text-base text-[var(--text-secondary)]">Synthwave Collective</p>
          </div>
        </RightPanel>
      }
      footer={
        <MusicPlayer
          title="Neon Dreams"
          artist="Synthwave Collective"
          currentTime="2:47"
          duration="4:39"
          progress={58}
          isPlaying
        />
      }
    >
      <VideoPlaybackProvider>
        <VerticalVideoFeed
          videos={feedVideos}
          onLikeClick={(id) => console.log('Like:', id)}
          onCommentClick={(id) => console.log('Comment:', id)}
          onShareClick={(id) => console.log('Share:', id)}
          onProfileClick={(username) => console.log('Profile:', username)}
          onTrackClick={(id) => console.log('Track:', id)}
        />
      </VideoPlaybackProvider>
    </AppShell>
  )
}
