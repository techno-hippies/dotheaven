import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { OnboardingNameStep } from './onboarding-name-step'
import { OnboardingAvatarStep } from './onboarding-avatar-step'
import { OnboardingBasicsStep } from './onboarding-basics-step'
import { OnboardingFlow } from './onboarding-flow'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from './dialog'
import { Button } from '../primitives/button'

const meta = {
  title: 'Composite/OnboardingFlow',
  component: OnboardingFlow,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
      values: [{ name: 'dark', value: '#1a1625' }],
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof OnboardingFlow>

export default meta

// ─── Full Flow (Dialog) ─────────────────────────────────────────────

export const Default: StoryObj<typeof meta> = {
  name: 'Full Flow (Dialog)',
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Onboarding</Button>
        <OnboardingFlow
          open={open()}
          onOpenChange={setOpen}
          onComplete={(data) => {
            console.log('Onboarding complete:', data)
            setTimeout(() => setOpen(false), 1500)
          }}
        />
      </>
    )
  },
}

export const StartAtBasics: StoryObj<typeof meta> = {
  name: 'Start at Basics Step',
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Onboarding</Button>
        <OnboardingFlow
          open={open()}
          onOpenChange={setOpen}
          initialStep="basics"
          onComplete={(data) => {
            console.log('Onboarding complete:', data)
            setTimeout(() => setOpen(false), 1500)
          }}
        />
      </>
    )
  },
}

export const StartAtAvatar: StoryObj<typeof meta> = {
  name: 'Start at Avatar Step',
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Onboarding</Button>
        <OnboardingFlow
          open={open()}
          onOpenChange={setOpen}
          initialStep="avatar"
          avatarStepProps={{ claimedName: 'alice' }}
          onComplete={(data) => {
            console.log('Onboarding complete:', data)
            setTimeout(() => setOpen(false), 1500)
          }}
        />
      </>
    )
  },
}

export const CompleteState: StoryObj<typeof meta> = {
  name: 'Complete State',
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Onboarding</Button>
        <OnboardingFlow
          open={open()}
          onOpenChange={setOpen}
          initialStep="complete"
          onComplete={(data) => console.log('Complete:', data)}
        />
      </>
    )
  },
}

// ─── Individual Steps (in Dialog context) ───────────────────────────

export const NameStepInDialog: StoryObj<typeof meta> = {
  name: 'Name Step (in Dialog)',
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Name Step</Button>
        <Dialog open={open()} onOpenChange={setOpen}>
          <DialogContent class="max-w-md">
            <DialogHeader>
              <DialogTitle>Choose your name</DialogTitle>
              <DialogDescription>
                This is your identity on Heaven. It's how people find and message you.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <OnboardingNameStep
                onClaim={(name) => console.log('Claimed:', name)}
              />
            </DialogBody>
          </DialogContent>
        </Dialog>
      </>
    )
  },
}

export const NameTaken: StoryObj<typeof meta> = {
  name: 'Name Step (All Taken)',
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Name Step</Button>
        <Dialog open={open()} onOpenChange={setOpen}>
          <DialogContent class="max-w-md">
            <DialogHeader>
              <DialogTitle>Choose your name</DialogTitle>
              <DialogDescription>
                This is your identity on Heaven. It's how people find and message you.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <OnboardingNameStep
                onCheckAvailability={async () => false}
                onClaim={(name) => console.log('Claimed:', name)}
              />
            </DialogBody>
          </DialogContent>
        </Dialog>
      </>
    )
  },
}

export const BasicsStepInDialog: StoryObj<typeof meta> = {
  name: 'Basics Step (in Dialog)',
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Basics Step</Button>
        <Dialog open={open()} onOpenChange={setOpen}>
          <DialogContent class="max-w-md">
            <DialogHeader>
              <DialogTitle>A bit about you</DialogTitle>
              <DialogDescription>
                Helps us match your timezone and language preferences.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <OnboardingBasicsStep
                claimedName="alice"
                onContinue={(data) => console.log('Basics:', data)}
                onSkip={() => console.log('Skipped')}
              />
            </DialogBody>
          </DialogContent>
        </Dialog>
      </>
    )
  },
}

export const BasicsStepWithError: StoryObj<typeof meta> = {
  name: 'Basics Step (Error)',
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Basics Step</Button>
        <Dialog open={open()} onOpenChange={setOpen}>
          <DialogContent class="max-w-md">
            <DialogHeader>
              <DialogTitle>A bit about you</DialogTitle>
              <DialogDescription>
                Helps us match your timezone and language preferences.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <OnboardingBasicsStep
                claimedName="alice"
                error="Failed to save profile. Please try again."
                onContinue={(data) => console.log('Basics:', data)}
                onSkip={() => console.log('Skipped')}
              />
            </DialogBody>
          </DialogContent>
        </Dialog>
      </>
    )
  },
}

export const AvatarStepInDialog: StoryObj<typeof meta> = {
  name: 'Avatar Step (in Dialog)',
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Avatar Step</Button>
        <Dialog open={open()} onOpenChange={setOpen}>
          <DialogContent class="max-w-md">
            <DialogHeader>
              <DialogTitle>Add a profile photo</DialogTitle>
              <DialogDescription>
                Looking good, alice.heaven. Add a photo so people recognize you.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <OnboardingAvatarStep
                claimedName="alice"
                onUpload={(file) => console.log('Upload:', file.name)}
                onSkip={() => console.log('Skipped')}
              />
            </DialogBody>
          </DialogContent>
        </Dialog>
      </>
    )
  },
}

export const AvatarStepTooLarge: StoryObj<typeof meta> = {
  name: 'Avatar Step (Image Too Large)',
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Avatar Step</Button>
        <Dialog open={open()} onOpenChange={setOpen}>
          <DialogContent class="max-w-md">
            <DialogHeader>
              <DialogTitle>Add a profile photo</DialogTitle>
              <DialogDescription>
                Looking good, alice.heaven. Add a photo so people recognize you.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <OnboardingAvatarStep
                claimedName="alice"
                error="Image is too large (4.2 MB). Please use an image under 2 MB."
                onUpload={(file) => console.log('Upload:', file.name)}
                onSkip={() => console.log('Skipped')}
              />
            </DialogBody>
          </DialogContent>
        </Dialog>
      </>
    )
  },
}

export const AvatarStepStyleRejected: StoryObj<typeof meta> = {
  name: 'Avatar Step (Style Rejected)',
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Avatar Step</Button>
        <Dialog open={open()} onOpenChange={setOpen}>
          <DialogContent class="max-w-md">
            <DialogHeader>
              <DialogTitle>Add a profile photo</DialogTitle>
              <DialogDescription>
                Looking good, alice.heaven. Add a photo so people recognize you.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <OnboardingAvatarStep
                claimedName="alice"
                error="Only anime, cartoon, or illustrated avatars are allowed. Please choose a different image."
                onUpload={(file) => console.log('Upload:', file.name)}
                onSkip={() => console.log('Skipped')}
              />
            </DialogBody>
          </DialogContent>
        </Dialog>
      </>
    )
  },
}

export const AvatarStepNetworkError: StoryObj<typeof meta> = {
  name: 'Avatar Step (Network Error)',
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Avatar Step</Button>
        <Dialog open={open()} onOpenChange={setOpen}>
          <DialogContent class="max-w-md">
            <DialogHeader>
              <DialogTitle>Add a profile photo</DialogTitle>
              <DialogDescription>
                Looking good, alice.heaven. Add a photo so people recognize you.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <OnboardingAvatarStep
                claimedName="alice"
                error="Network error uploading image. Please try a smaller file or check your connection."
                onUpload={(file) => console.log('Upload:', file.name)}
                onSkip={() => console.log('Skipped')}
              />
            </DialogBody>
          </DialogContent>
        </Dialog>
      </>
    )
  },
}
