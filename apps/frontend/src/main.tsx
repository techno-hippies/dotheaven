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
import { LikedSongsPage } from './pages/LikedSongsPage'
import { FreeWeeklyPage } from './pages/FreeWeeklyPage'
import { ChatPage } from './pages/ChatPage'
import { AIChatPage } from './pages/AIChatPage'
import { WalletPage } from './pages/WalletPage'
import { PlaylistPage } from './pages/PlaylistPage'
import { ArtistPage } from './pages/ArtistPage'
import { SchedulePage } from './pages/SchedulePage'
import { ChatLayout } from './pages/ChatLayout'
// PostPage moved to legacy/ — route kept for deep-link compat
import { PostPage } from './legacy/PostPage'

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
    window.location.hash = `#/u/${label}.${tld}`
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
                {/* Standalone routes (no AppShell) */}
                <Route path="/auth" component={AuthPage} />
                <Route path="/onboarding" component={OnboardingPage} />

                {/* App routes with shared layout */}
                <Route path="/" component={AppLayout}>
                  <Route path="/" component={App} />
                  <Route path="/u/:id" component={PublicProfilePage} />
                  <Route path="/post/:id" component={PostPage} />
                  <Route path="/playlist/:id" component={PlaylistPage} />
                  <Route path="/artist/:mbid" component={ArtistPage} />
                  <Route path="/profile" component={MyProfilePage} />
                  <Route path="/music" component={LibraryPage} />
                  <Route path="/music/:tab" component={LibraryPage} />
                  <Route path="/liked-songs" component={LikedSongsPage} />
                  <Route path="/free-weekly" component={FreeWeeklyPage} />
                  <Route path="/chat" component={ChatLayout}>
                    <Route path="/" component={() => null} />
                    <Route path="/ai/:personalityId" component={AIChatPage} />
                    <Route path="/:username" component={ChatPage} />
                  </Route>
                  <Route path="/wallet" component={WalletPage} />
                  <Route path="/schedule" component={SchedulePage} />
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
