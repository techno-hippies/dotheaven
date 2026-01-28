import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { AuthCard, type AuthStatus } from './auth-card'

const meta: Meta<typeof AuthCard> = {
  title: 'Layout/AuthCard',
  component: AuthCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
      values: [{ name: 'dark', value: 'var(--bg-page)' }],
    },
  },
  decorators: [
    (Story) => (
      <div class="p-8 min-h-[600px] flex items-center justify-center bg-[var(--bg-page)]">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof AuthCard>

export const Idle: Story = {
  args: {
    status: 'idle',
    logoSrc: '/images/heaven.png',
    onSignIn: () => console.log('Sign in clicked'),
    onRegister: () => console.log('Register clicked'),
  },
}

export const Authenticating: Story = {
  args: {
    status: 'authenticating',
    authMode: 'signin',
    logoSrc: '/images/heaven.png',
  },
}

export const AuthenticatingRegister: Story = {
  args: {
    status: 'authenticating',
    authMode: 'register',
    logoSrc: '/images/heaven.png',
  },
}

export const Success: Story = {
  args: {
    status: 'success',
    logoSrc: '/images/heaven.png',
  },
}

export const Error: Story = {
  args: {
    status: 'error',
    error: 'No passkey found for this device. Please register first.',
    authMode: 'signin',
    logoSrc: '/images/heaven.png',
    onRetry: () => console.log('Retry clicked'),
    onBack: () => console.log('Back clicked'),
  },
}

export const ErrorRegistration: Story = {
  args: {
    status: 'error',
    error: 'Registration was cancelled by the user.',
    authMode: 'register',
    logoSrc: '/images/heaven.png',
    onRetry: () => console.log('Retry clicked'),
    onBack: () => console.log('Back clicked'),
  },
}

export const NoLogo: Story = {
  args: {
    status: 'idle',
    appName: 'Heaven',
    onSignIn: () => console.log('Sign in clicked'),
    onRegister: () => console.log('Register clicked'),
  },
}

export const CustomBranding: Story = {
  args: {
    status: 'idle',
    appName: 'MyApp',
    tagline: 'Your gateway to the future',
    logoSrc: '/images/heaven.png',
    onSignIn: () => console.log('Sign in clicked'),
    onRegister: () => console.log('Register clicked'),
  },
}

/**
 * Interactive demo showing all states
 */
export const Interactive: Story = {
  render: () => {
    const [status, setStatus] = createSignal<AuthStatus>('idle')
    const [authMode, setAuthMode] = createSignal<'signin' | 'register'>('signin')
    const [error, setError] = createSignal<string | null>(null)

    const simulateAuth = (mode: 'signin' | 'register') => {
      setAuthMode(mode)
      setStatus('authenticating')
      setError(null)

      // Simulate auth delay
      setTimeout(() => {
        // 50% chance of success
        if (Math.random() > 0.5) {
          setStatus('success')
        } else {
          setError(mode === 'signin'
            ? 'No passkey found for this device.'
            : 'Registration was cancelled.')
          setStatus('error')
        }
      }, 2000)
    }

    return (
      <div class="space-y-4">
        <AuthCard
          status={status()}
          authMode={authMode()}
          error={error()}
          logoSrc="/images/heaven.png"
          onSignIn={() => simulateAuth('signin')}
          onRegister={() => simulateAuth('register')}
          onRetry={() => simulateAuth(authMode())}
          onBack={() => setStatus('idle')}
        />
        <div class="flex gap-2 justify-center">
          <button
            class="px-3 py-1 text-xs bg-[var(--bg-highlight)] rounded"
            onClick={() => setStatus('idle')}
          >
            Reset
          </button>
        </div>
      </div>
    )
  },
}
