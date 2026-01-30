/* @refresh reload */
import { Buffer } from 'buffer'
// Polyfill Buffer for Lit SDK (web only)
if (typeof window !== 'undefined' && !window.Buffer) {
  ;(window as any).Buffer = Buffer
}

import { render } from 'solid-js/web'
import { HashRouter, Route } from '@solidjs/router'
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import { PlatformProvider, platform } from 'virtual:heaven-platform'
import { AuthProvider, WalletProvider, XMTPProvider, PlayerProvider } from './providers'

const queryClient = new QueryClient({
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
import { MyProfilePage } from './pages/ProfilePage'
import { LibraryPage } from './pages/LibraryPage'
import { LikedSongsPage } from './pages/LikedSongsPage'
import { FreeWeeklyPage } from './pages/FreeWeeklyPage'
import { ChatPage } from './pages/ChatPage'
import { AIChatPage } from './pages/AIChatPage'
// VoiceCallPage removed - voice calls are now integrated into AIChatPage via ?call=1 param
import { WalletPage } from './pages/WalletPage'
import { PlaylistPage } from './pages/PlaylistPage'
import { SettingsPage } from './pages/SettingsPage'


const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element not found')
}

render(
  () => (
    <QueryClientProvider client={queryClient}>
    <PlatformProvider platform={platform}>
      <AuthProvider>
        <WalletProvider>
          <XMTPProvider>
            <PlayerProvider>
              <HashRouter>
                {/* Auth page is standalone (no AppShell) */}
                <Route path="/auth" component={AuthPage} />
                {/* All other routes share AppLayout (header, sidebar, player footer) */}
                <Route path="/" component={AppLayout}>
                  <Route path="/" component={App} />
                  <Route path="/profile" component={MyProfilePage} />
                  <Route path="/library" component={LibraryPage} />
                  <Route path="/liked-songs" component={LikedSongsPage} />
                  <Route path="/free-weekly" component={FreeWeeklyPage} />
                  <Route path="/chat/ai/:personalityId" component={AIChatPage} />
                  <Route path="/chat/:username" component={ChatPage} />
                  <Route path="/wallet" component={WalletPage} />
                  <Route path="/playlist/:id" component={PlaylistPage} />

                  <Route path="/settings" component={SettingsPage} />
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
