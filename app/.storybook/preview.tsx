import type { Preview } from 'storybook-solidjs-vite'
import '../src/index.css'

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'light', value: '#faf8f5' },
        { name: 'dark', value: '#0a0a0a' },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}

export default preview
