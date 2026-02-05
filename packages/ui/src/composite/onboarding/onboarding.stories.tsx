import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { OnboardingNameStep } from './onboarding-name-step'
import { OnboardingAvatarStep } from './onboarding-avatar-step'
import { OnboardingBasicsStep } from './onboarding-basics-step'
import { OnboardingMusicStep, POPULAR_ARTISTS, type OnboardingArtist } from './onboarding-music-step'
import { Stepper } from '../../primitives/stepper'

const meta = {
  title: 'Onboarding/Steps',
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'dark',
      values: [{ name: 'dark', value: '#171717' }],
    },
  },
  tags: ['autodocs'],
} satisfies Meta

export default meta

// ─── Full-page layout wrapper (matches OnboardingPage.tsx) ─────────

const FullPageStep = (stepProps: {
  title: string
  subtitle: string
  stepIndex: number
  children: any
}) => (
  <div class="min-h-screen flex flex-col" style={{ background: '#171717' }}>
    <div class="flex-1 flex flex-col items-center justify-center px-6 py-16">
      <div class="w-full max-w-md">
        <Stepper steps={4} currentStep={stepProps.stepIndex} class="mb-8" />
        <h1 class="text-2xl font-bold text-[var(--text-primary)] text-center mb-1">
          {stepProps.title}
        </h1>
        <p class="text-[var(--text-secondary)] text-center mb-8">
          {stepProps.subtitle}
        </p>
        {stepProps.children}
      </div>
    </div>
  </div>
)

// ─── Name Step ──────────────────────────────────────────────────────

export const NameStep: StoryObj<typeof meta> = {
  name: 'Name Step',
  render: () => (
    <FullPageStep
      title="Choose your name"
      subtitle="This is your identity on Heaven. It's how people find and message you."
      stepIndex={0}
    >
      <OnboardingNameStep
        onClaim={(name) => console.log('Claimed:', name)}
      />
    </FullPageStep>
  ),
}

export const NameStepAllTaken: StoryObj<typeof meta> = {
  name: 'Name Step (All Taken)',
  render: () => (
    <FullPageStep
      title="Choose your name"
      subtitle="This is your identity on Heaven. It's how people find and message you."
      stepIndex={0}
    >
      <OnboardingNameStep
        onCheckAvailability={async () => false}
        onClaim={(name) => console.log('Claimed:', name)}
      />
    </FullPageStep>
  ),
}

// ─── Basics Step ────────────────────────────────────────────────────

export const BasicsStep: StoryObj<typeof meta> = {
  name: 'Basics Step',
  render: () => (
    <FullPageStep
      title="A bit about you"
      subtitle="Helps us match your timezone and language preferences."
      stepIndex={1}
    >
      <OnboardingBasicsStep
        claimedName="alice"
        onContinue={(data) => console.log('Basics:', data)}
      />
    </FullPageStep>
  ),
}

export const BasicsStepWithError: StoryObj<typeof meta> = {
  name: 'Basics Step (Error)',
  render: () => (
    <FullPageStep
      title="A bit about you"
      subtitle="Helps us match your timezone and language preferences."
      stepIndex={1}
    >
      <OnboardingBasicsStep
        claimedName="alice"
        error="Failed to save profile. Please try again."
        onContinue={(data) => console.log('Basics:', data)}
      />
    </FullPageStep>
  ),
}

// ─── Music Step ─────────────────────────────────────────────────────

export const MusicStep: StoryObj<typeof meta> = {
  name: 'Music Step',
  render: () => (
    <FullPageStep
      title="Connect Your Spotify"
      subtitle="Get matched with candidates who listen to the same music as you."
      stepIndex={2}
    >
      <OnboardingMusicStep
        claimedName="alice"
        onContinue={(data) => console.log('Music:', data)}
      />
    </FullPageStep>
  ),
}

export const MusicStepSpotifyConnected: StoryObj<typeof meta> = {
  name: 'Music Step (Spotify Connected)',
  render: () => {
    const spotifyArtists: OnboardingArtist[] = [
      { mbid: '164f0d73-1234-4e2c-8743-d77bf2191051', name: 'Kanye West', genres: ['Hip-Hop'] },
      { mbid: '73e5e69d-3554-40d8-8571-ac1fca428388', name: 'The Weeknd', genres: ['R&B'] },
      { mbid: 'b071f9fa-14b0-4217-8e97-eb41da73f598', name: 'Frank Ocean', genres: ['R&B', 'Alt'] },
      { mbid: 'a466c2a2-6517-42fb-a160-1087c3bafd9f', name: 'Tyler, the Creator', genres: ['Hip-Hop'] },
      { mbid: 'e0140a67-e4d1-4f13-8a01-364355f95571', name: 'Kendrick Lamar', genres: ['Hip-Hop'] },
      { mbid: '9efff43b-3b29-4082-824e-bc82f646f93d', name: 'Daft Punk', genres: ['Electronic'] },
      { mbid: 'b8a7c51f-362c-4dcb-a259-bc6f0d2e85ff', name: 'Drake', genres: ['Hip-Hop', 'R&B'] },
      { mbid: '8538e728-ca0b-4321-b7e5-cff6565dd4c0', name: 'Depeche Mode', genres: ['Electronic'] },
      { mbid: 'f27ec8db-af05-4f36-916e-3571f4e088df', name: 'Michael Jackson', genres: ['Pop'] },
    ]
    return (
      <FullPageStep
        title="Connect Your Spotify"
        subtitle="Get matched with candidates who listen to the same music as you."
        stepIndex={2}
      >
        <OnboardingMusicStep
          claimedName="alice"
          onConnectSpotify={async () => {
            await new Promise((r) => setTimeout(r, 1000))
            return spotifyArtists
          }}
          onContinue={(data) => console.log('Music:', data)}
        />
      </FullPageStep>
    )
  },
}

export const MusicStepWithError: StoryObj<typeof meta> = {
  name: 'Music Step (Error)',
  render: () => (
    <FullPageStep
      title="Connect Your Spotify"
      subtitle="Get matched with candidates who listen to the same music as you."
      stepIndex={2}
    >
      <OnboardingMusicStep
        claimedName="alice"
        error="Failed to connect to Spotify. Please try again."
        onContinue={(data) => console.log('Music:', data)}
      />
    </FullPageStep>
  ),
}

// ─── Avatar Step ────────────────────────────────────────────────────

export const AvatarStep: StoryObj<typeof meta> = {
  name: 'Avatar Step',
  render: () => (
    <FullPageStep
      title="Add a profile photo"
      subtitle="Looking good, alice.heaven. Add a photo so people recognize you."
      stepIndex={3}
    >
      <OnboardingAvatarStep
        claimedName="alice"
        onUpload={(file) => console.log('Upload:', file.name)}
      />
    </FullPageStep>
  ),
}

export const AvatarStepTooLarge: StoryObj<typeof meta> = {
  name: 'Avatar Step (Image Too Large)',
  render: () => (
    <FullPageStep
      title="Add a profile photo"
      subtitle="Looking good, alice.heaven. Add a photo so people recognize you."
      stepIndex={3}
    >
      <OnboardingAvatarStep
        claimedName="alice"
        error="Image is too large (4.2 MB). Please use an image under 2 MB."
        onUpload={(file) => console.log('Upload:', file.name)}
      />
    </FullPageStep>
  ),
}

export const AvatarStepStyleRejected: StoryObj<typeof meta> = {
  name: 'Avatar Step (Style Rejected)',
  render: () => (
    <FullPageStep
      title="Add a profile photo"
      subtitle="Looking good, alice.heaven. Add a photo so people recognize you."
      stepIndex={3}
    >
      <OnboardingAvatarStep
        claimedName="alice"
        error="Only anime, cartoon, or illustrated avatars are allowed. Please choose a different image."
        onUpload={(file) => console.log('Upload:', file.name)}
      />
    </FullPageStep>
  ),
}

export const AvatarStepNetworkError: StoryObj<typeof meta> = {
  name: 'Avatar Step (Network Error)',
  render: () => (
    <FullPageStep
      title="Add a profile photo"
      subtitle="Looking good, alice.heaven. Add a photo so people recognize you."
      stepIndex={3}
    >
      <OnboardingAvatarStep
        claimedName="alice"
        error="Network error uploading image. Please try a smaller file or check your connection."
        onUpload={(file) => console.log('Upload:', file.name)}
      />
    </FullPageStep>
  ),
}

// ─── Complete State ─────────────────────────────────────────────────

export const CompleteState: StoryObj<typeof meta> = {
  name: 'Complete State',
  render: () => (
    <FullPageStep
      title="You're all set!"
      subtitle="Welcome to Heaven, alice.heaven. Your identity is secured on-chain."
      stepIndex={4}
    >
      <div class="flex flex-col items-center gap-6 text-center py-8">
        <div class="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
          <svg class="w-10 h-10 text-green-400" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
          </svg>
        </div>
      </div>
    </FullPageStep>
  ),
}
