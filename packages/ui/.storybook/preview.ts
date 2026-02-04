import '../src/styles/index.css'
import type { Preview } from 'storybook-solidjs-vite'

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
