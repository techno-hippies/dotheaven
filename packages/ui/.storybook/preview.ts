import '../src/styles/index.css'
import type { Preview } from 'storybook-solidjs-vite'

// Set Storybook canvas background to match app (neutral-900)
if (typeof document !== 'undefined') {
  document.documentElement.style.background = '#171717'
  document.body.style.background = '#171717'
}

const preview: Preview = {
  parameters: {
    backgrounds: {
      disable: true,
      default: 'dark',
      values: [
        {
          name: 'dark',
          value: '#171717',
        },
      ],
    },
    layout: 'fullscreen',
  },
}

export default preview
