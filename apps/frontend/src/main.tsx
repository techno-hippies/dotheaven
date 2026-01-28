/* @refresh reload */
import { Buffer } from 'buffer'
// Polyfill Buffer for Lit SDK (web only)
if (typeof window !== 'undefined' && !window.Buffer) {
  ;(window as any).Buffer = Buffer
}

import { render } from 'solid-js/web'
import { HashRouter, Route } from '@solidjs/router'
import { PlatformProvider, platform } from 'virtual:heaven-platform'
import { AuthProvider } from './providers'
import './styles/index.css'
import '@fontsource/geist/400.css'
import '@fontsource/geist/500.css'
import '@fontsource/geist/600.css'
import '@fontsource/geist/700.css'
import { App } from './App'
import { AuthPage } from './pages/AuthPage'
import { MyProfilePage } from './pages/ProfilePage'
import { LikedSongsPage } from './pages/LikedSongsPage'
import { ChatPage } from './pages/ChatPage'
import { WalletPage } from './pages/WalletPage'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element not found')
}

render(
  () => (
    <PlatformProvider platform={platform}>
      <AuthProvider>
        <HashRouter>
          <Route path="/" component={App} />
          <Route path="/auth" component={AuthPage} />
          <Route path="/profile" component={MyProfilePage} />
          <Route path="/liked-songs" component={LikedSongsPage} />
          <Route path="/chat/:username" component={ChatPage} />
          <Route path="/wallet" component={WalletPage} />
        </HashRouter>
      </AuthProvider>
    </PlatformProvider>
  ),
  root
)
