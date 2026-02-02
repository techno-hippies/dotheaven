import '../src/styles/index.css'

// Set Storybook canvas background to match app
if (typeof document !== 'undefined') {
  document.documentElement.style.setProperty('background', 'var(--bg-page, #1a1625)')
  document.body.style.background = 'var(--bg-page, #1a1625)'
}

export const parameters = {
  backgrounds: { disable: true },
}
