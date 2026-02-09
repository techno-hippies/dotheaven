import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { AuthCard, type AuthStatus } from './auth-card'

const meta: Meta<typeof AuthCard> = {
  title: 'Layout/AuthCard',
  component: AuthCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story: any) => (
      <div class="p-8 min-h-[600px] flex items-center justify-center">
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
    tagline: 'Karaoke to learn a language, make friends, and date.',
    onSignIn: () => console.log('Sign in clicked'),
    onRegister: () => console.log('Register clicked'),
    onConnectWallet: () => console.log('Connect wallet clicked'),
  },
}

export const IdlePasskeyOnly: Story = {
  args: {
    status: 'idle',
    logoSrc: '/images/heaven.png',
    tagline: 'Karaoke to learn a language, make friends, and date.',
    onSignIn: () => console.log('Sign in clicked'),
    onRegister: () => console.log('Register clicked'),
  },
}

export const Authenticating: Story = {
  args: {
    status: 'authenticating',
    authMode: 'signin',
    authMethod: 'passkey',
    logoSrc: '/images/heaven.png',
  },
}

export const AuthenticatingRegister: Story = {
  args: {
    status: 'authenticating',
    authMode: 'register',
    authMethod: 'passkey',
    logoSrc: '/images/heaven.png',
  },
}

export const AuthenticatingWallet: Story = {
  args: {
    status: 'authenticating',
    authMode: 'signin',
    authMethod: 'eoa',
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
    authMethod: 'passkey',
    logoSrc: '/images/heaven.png',
    onRetry: () => console.log('Retry clicked'),
    onBack: () => console.log('Back clicked'),
  },
}

export const ErrorWallet: Story = {
  args: {
    status: 'error',
    error: 'No wallet extension found. Please install MetaMask or another Ethereum wallet.',
    authMode: 'signin',
    authMethod: 'eoa',
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
    authMethod: 'passkey',
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
    onConnectWallet: () => console.log('Connect wallet clicked'),
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
    onConnectWallet: () => console.log('Connect wallet clicked'),
  },
}

/**
 * Interactive demo showing all states
 */
export const Interactive: Story = {
  render: () => {
    const [status, setStatus] = createSignal<AuthStatus>('idle')
    const [authMode, setAuthMode] = createSignal<'signin' | 'register'>('signin')
    const [authMethod, setAuthMethod] = createSignal<'passkey' | 'eoa'>('passkey')
    const [error, setError] = createSignal<string | null>(null)

    const simulateAuth = (mode: 'signin' | 'register', method: 'passkey' | 'eoa' = 'passkey') => {
      setAuthMode(mode)
      setAuthMethod(method)
      setStatus('authenticating')
      setError(null)

      setTimeout(() => {
        if (Math.random() > 0.5) {
          setStatus('success')
        } else {
          setError(method === 'eoa'
            ? 'User rejected the signature request.'
            : mode === 'signin'
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
          authMethod={authMethod()}
          error={error()}
          logoSrc="/images/heaven.png"
          onSignIn={() => simulateAuth('signin', 'passkey')}
          onRegister={() => simulateAuth('register', 'passkey')}
          onConnectWallet={() => simulateAuth('signin', 'eoa')}
          onRetry={() => simulateAuth(authMode(), authMethod())}
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
