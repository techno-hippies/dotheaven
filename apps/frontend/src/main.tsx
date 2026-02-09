/* @refresh reload */
import { Buffer } from 'buffer'
// Polyfill Buffer for Lit SDK (web only)
if (typeof window !== 'undefined' && !(window as any).Buffer) {
  ;(window as any).Buffer = Buffer
}

import { render } from 'solid-js/web'
import { HashRouter, Route } from '@solidjs/router'
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import { PlatformProvider, platform } from 'virtual:heaven-platform'
import { AuthProvider, WalletProvider, XMTPProvider, PlayerProvider } from './providers'
import {
  HOME, AUTH, ONBOARDING, PROFILE, WALLET, SCHEDULE, SCHEDULE_AVAILABILITY, SEARCH, SETTINGS,
  MUSIC, CHAT, ROUTE_PARAMS,
  publicProfile,
} from '@heaven/core'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, gcTime: 5 * 60_000, retry: 2 },
  },
})
import './styles/index.css'
import '@fontsource/geist/400.css'
import '@fontsource/geist/500.css'
import '@fontsource/geist/600.css'
import '@fontsource/geist/700.css'
import { App } from './App'
import { AppLayout } from './components/shell'
import { AuthPage } from './pages/AuthPage'

import { OnboardingPage } from './pages/OnboardingPage'
import { MyProfilePage, PublicProfilePage } from './pages/ProfilePage'
import { LibraryPage } from './pages/LibraryPage'
import { ChatPage } from './pages/ChatPage'
import { AIChatPage } from './pages/AIChatPage'
import { WalletPage } from './pages/WalletPage'
import { PlaylistPage } from './pages/PlaylistPage'
import { ArtistPage } from './pages/ArtistPage'
import { AlbumPage } from './pages/AlbumPage'
import { SchedulePage, ScheduleAvailabilityPage } from './pages/SchedulePage'
import { ChatLayout } from './pages/ChatLayout'
import { ClaimPage } from './pages/ClaimPage'
import { SettingsPage } from './pages/SettingsPage'
import { FeedPage } from './pages/FeedPage'
import { PostPage } from './pages/PostPage'
import { MusicPage } from './pages/MusicPage'
import { FollowListPage } from './pages/FollowListPage'
import { RoomPage } from './pages/RoomPage'

function maybeRedirectHandshakeProfile() {
  if (typeof window === 'undefined') return

  const host = window.location.hostname
  if (!host || host === 'localhost' || host === '127.0.0.1') return

  const lowerHost = host.toLowerCase()
  const supportedTlds = ['heaven', 'premium']
  const hostParts = lowerHost.split('.')
  const tld = hostParts[hostParts.length - 1]
  if (!supportedTlds.includes(tld)) return

  const label = hostParts.length >= 2 ? hostParts[hostParts.length - 2] : hostParts[0]
  if (!label) return

  const hash = window.location.hash
  if (!hash || hash === '#' || hash === '#/' || hash === '#') {
    // Use publicProfile route builder for Handshake domain redirect
    window.location.hash = `#${publicProfile(`${label}.${tld}`)}`
  }
}

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element not found')
}

maybeRedirectHandshakeProfile()

render(
  () => (
    <QueryClientProvider client={queryClient}>
    <PlatformProvider platform={platform}>
      <AuthProvider>
        <WalletProvider>
          <XMTPProvider>
            <PlayerProvider>
              <HashRouter>
                {/* Standalone routes (no AppLayout) */}
                <Route path={AUTH} component={AuthPage} />
                <Route path={ONBOARDING} component={OnboardingPage} />
                <Route path={ROUTE_PARAMS.CLAIM} component={ClaimPage} />
                <Route path={ROUTE_PARAMS.ROOM} component={RoomPage} />

                {/* App routes with shared layout */}
                <Route path={HOME} component={AppLayout}>
                  <Route path={HOME} component={FeedPage} />
                  <Route path={SEARCH} component={App} />
                  <Route path={ROUTE_PARAMS.PUBLIC_PROFILE} component={PublicProfilePage} />
                  <Route path={ROUTE_PARAMS.FOLLOWERS} component={FollowListPage} />
                  <Route path={ROUTE_PARAMS.FOLLOWING} component={FollowListPage} />
                  <Route path={ROUTE_PARAMS.POST} component={PostPage} />
                  <Route path={ROUTE_PARAMS.PLAYLIST} component={PlaylistPage} />
                  <Route path={ROUTE_PARAMS.ARTIST} component={ArtistPage} />
                  <Route path={ROUTE_PARAMS.ALBUM} component={AlbumPage} />
                  <Route path={PROFILE} component={MyProfilePage} />
                  <Route path={MUSIC} component={MusicPage} />
                  <Route path={ROUTE_PARAMS.MUSIC_TAB} component={LibraryPage} />
                  <Route path={CHAT} component={ChatLayout}>
                    <Route path={HOME} component={() => null} />
                    <Route path={ROUTE_PARAMS.AI_CHAT} component={AIChatPage} />
                    <Route path={ROUTE_PARAMS.PEER_CHAT} component={ChatPage} />
                  </Route>
                  <Route path={WALLET} component={WalletPage} />
                  <Route path={SETTINGS} component={SettingsPage} />
                  <Route path={SCHEDULE_AVAILABILITY} component={ScheduleAvailabilityPage} />
                  <Route path={SCHEDULE} component={SchedulePage} />
                </Route>
              </HashRouter>
            </PlayerProvider>
          </XMTPProvider>
        </WalletProvider>
      </AuthProvider>
    </PlatformProvider>
    </QueryClientProvider>
  ),
  root
)
