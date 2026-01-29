/* @refresh reload */
import { Buffer } from 'buffer'
// Polyfill Buffer for Lit SDK (web only)
if (typeof window !== 'undefined' && !window.Buffer) {
  ;(window as any).Buffer = Buffer
}

import { render } from 'solid-js/web'
import { HashRouter, Route } from '@solidjs/router'
import { PlatformProvider, platform } from 'virtual:heaven-platform'
import { AuthProvider, WalletProvider, XMTPProvider } from './providers'
import './styles/index.css'
import '@fontsource/geist/400.css'
import '@fontsource/geist/500.css'
import '@fontsource/geist/600.css'
import '@fontsource/geist/700.css'
import { App } from './App'
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
import { ScrobblesPage } from './pages/ScrobblesPage'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element not found')
}

render(
  () => (
    <PlatformProvider platform={platform}>
      <AuthProvider>
        <WalletProvider>
          <XMTPProvider>
            <HashRouter>
            <Route path="/" component={App} />
            <Route path="/auth" component={AuthPage} />
            <Route path="/profile" component={MyProfilePage} />
            <Route path="/library" component={LibraryPage} />
            <Route path="/liked-songs" component={LikedSongsPage} />
            <Route path="/free-weekly" component={FreeWeeklyPage} />
            <Route path="/chat/ai/:personalityId" component={AIChatPage} />
            <Route path="/chat/:username" component={ChatPage} />
            <Route path="/wallet" component={WalletPage} />
            <Route path="/playlist/:id" component={PlaylistPage} />
            <Route path="/scrobbles" component={ScrobblesPage} />
            <Route path="/settings" component={SettingsPage} />
            </HashRouter>
          </XMTPProvider>
        </WalletProvider>
      </AuthProvider>
    </PlatformProvider>
  ),
  root
)
