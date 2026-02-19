import type { Preview } from 'storybook-solidjs-vite'
import '../src/styles/index.css'

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'app-bg',
      values: [{ name: 'app-bg', value: '#111314' }],
    },
    layout: 'centered',
  },
}

export default preview
