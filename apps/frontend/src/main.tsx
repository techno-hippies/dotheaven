/* @refresh reload */
import { render } from 'solid-js/web'
import { PlatformProvider } from '@heaven/platform'
import { platform } from '@heaven/platform'
import '@heaven/ui/styles'
import '@fontsource/geist/400.css'
import '@fontsource/geist/500.css'
import '@fontsource/geist/600.css'
import '@fontsource/geist/700.css'
import { App } from './App'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element not found')
}

render(
  () => (
    <PlatformProvider platform={platform}>
      <App />
    </PlatformProvider>
  ),
  root
)
