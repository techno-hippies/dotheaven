import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { ClaimFlow, type ClaimState } from './claim-flow'
import type { ClaimProfileData } from './claim-profile-card'

// ── Sample data ────────────────────────────────────────────────────────

const SAMPLE_PROFILE: ClaimProfileData = {
  displayName: 'Alex Chen',
  avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face',
  source: 'dateme',
  sourceUrl: 'https://dateme.directory/alex-chen',
  age: '28',
  gender: 'M',
  location: 'San Francisco, CA',
  bio: 'Software engineer who loves hiking, board games, and making pasta from scratch. Looking for someone to explore the city with.',
  likesReceived: 3,
}

// ── Meta ───────────────────────────────────────────────────────────────

const meta: Meta<typeof ClaimFlow> = {
  title: 'Claim',
  component: ClaimFlow,
  parameters: { layout: 'fullscreen' },
}

export default meta

// ── Stories ─────────────────────────────────────────────────────────────

export const ExpiredLink: StoryObj = {
  render: () => (
    <ClaimFlow
      state="error"
      error="This claim link has expired. Please request a new one."
      onGoHome={() => console.log('Go home')}
    />
  ),
}

export const EnterCode: StoryObj = {
  render: () => (
    <ClaimFlow
      state="profile"
      profile={SAMPLE_PROFILE}
      onSubmitCode={(code) => console.log('Code submitted:', code)}
    />
  ),
}

export const InvalidCode: StoryObj = {
  render: () => (
    <ClaimFlow
      state="profile"
      profile={SAMPLE_PROFILE}
      error="Invalid code. Please try again."
      onSubmitCode={(code) => console.log('Code submitted:', code)}
    />
  ),
}

export const CreatePasskey: StoryObj = {
  render: () => (
    <ClaimFlow
      state="passkey"
      profile={SAMPLE_PROFILE}
      onCreatePasskey={() => console.log('Create passkey')}
    />
  ),
}

export const Success: StoryObj = {
  render: () => (
    <ClaimFlow
      state="success"
      profile={SAMPLE_PROFILE}
      onComplete={() => console.log('Complete → onboarding')}
    />
  ),
}

export const Interactive: StoryObj = {
  render: () => {
    const [state, setState] = createSignal<ClaimState>('profile')
    const [error, setError] = createSignal<string | undefined>()

    return (
      <ClaimFlow
        state={state()}
        profile={SAMPLE_PROFILE}
        error={error()}
        onSubmitCode={(c) => {
          setError(undefined)
          setState('checking')
          setTimeout(() => {
            if (c.toUpperCase() === 'HVN-K7X9MP') {
              setState('passkey')
            } else {
              setError('Invalid code. Try HVN-K7X9MP')
              setState('profile')
            }
          }, 1500)
        }}
        onCreatePasskey={() => {
          setState('minting')
          setTimeout(() => setState('success'), 3000)
        }}
        onComplete={() => console.log('Navigate to /onboarding')}
        onGoHome={() => console.log('Navigate to /')}
      />
    )
  },
}
