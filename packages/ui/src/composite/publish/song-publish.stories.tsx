import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import {
  SongPublishForm,
  type SongFormData,
  type PublishStep,
  type SongPublishFormProps,
} from './song-publish-form'

const defaultFormData: SongFormData = {
  title: '',
  artist: '',
  genre: '',
  primaryLanguage: '',
  secondaryLanguage: '',
  lyrics: '',
  coverFile: null,
  audioFile: null,
  instrumentalFile: null,
  canvasFile: null,
  license: 'non-commercial',
  revShare: 10,
  mintingFee: '0',
  attestation: false,
}

const filledFormData: SongFormData = {
  title: 'Midnight in Seoul',
  artist: 'YUNA',
  genre: 'kpop',
  primaryLanguage: 'ko',
  secondaryLanguage: 'en',
  lyrics: `[Verse 1]
서울의 밤하늘 아래 걸어가
Neon lights reflecting in my eyes
이 도시의 리듬 속에서 살아가
Every heartbeat synchronized

[Chorus]
Midnight in Seoul, we come alive
Dancing through the city lights
Midnight in Seoul, we're feeling right
Lost in the music tonight

[Verse 2]
골목길을 지나 카페 불빛이
Whispers of a melody so sweet
음악이 흐르는 이 순간이
Makes my heart skip a beat

[Chorus]
Midnight in Seoul, we come alive
Dancing through the city lights`,
  coverFile: null,
  audioFile: null,
  instrumentalFile: null,
  canvasFile: null,
  license: 'commercial-remix',
  revShare: 15,
  mintingFee: '0',
  attestation: true,
}

const meta: Meta = {
  title: 'Publish/SongPublishForm',
  parameters: { layout: 'fullscreen' },
}

export default meta

// ── Step 1: Song ──────────────────────────────────────────────────

export const SongEmpty: StoryObj = {
  name: '1. Song (Empty)',
  render: () => (
    <SongPublishForm
      step="song"
      formData={defaultFormData}
      onFormChange={() => {}}
      onNext={() => alert('Next')}
      onBack={() => {}}
      onPublish={() => {}}
    />
  ),
}

export const SongFilled: StoryObj = {
  name: '1b. Song (Filled)',
  render: () => (
    <SongPublishForm
      step="song"
      formData={{
        ...filledFormData,
        audioFile: new File([''], 'midnight-seoul.mp3', { type: 'audio/mpeg' }),
        instrumentalFile: new File([''], 'midnight-seoul-inst.mp3', { type: 'audio/mpeg' }),
      }}
      onFormChange={() => {}}
      onNext={() => alert('Next')}
      onBack={() => {}}
      onPublish={() => {}}
    />
  ),
}

// ── Step 2: Canvas ────────────────────────────────────────────────

export const CanvasEmpty: StoryObj = {
  name: '2. Canvas (Empty)',
  render: () => (
    <SongPublishForm
      step="canvas"
      formData={{ ...filledFormData }}
      onFormChange={() => {}}
      onNext={() => alert('Next')}
      onBack={() => alert('Back')}
      onSkip={() => alert('Skip')}
      onPublish={() => {}}
    />
  ),
}

export const CanvasWithVideo: StoryObj = {
  name: '2b. Canvas (With Video)',
  render: () => (
    <SongPublishForm
      step="canvas"
      formData={{
        ...filledFormData,
        canvasFile: new File([''], 'canvas-loop.mp4', { type: 'video/mp4' }),
      }}
      onFormChange={() => {}}
      onNext={() => alert('Next')}
      onBack={() => alert('Back')}
      onSkip={() => alert('Skip')}
      onPublish={() => {}}
    />
  ),
}

// ── Step 3: Details ───────────────────────────────────────────────

export const DetailsEmpty: StoryObj = {
  name: '3. Details (Empty)',
  render: () => (
    <SongPublishForm
      step="details"
      formData={defaultFormData}
      onFormChange={() => {}}
      onNext={() => alert('Next')}
      onBack={() => alert('Back')}
      onPublish={() => {}}
    />
  ),
}

export const DetailsFilled: StoryObj = {
  name: '3b. Details (K-Pop Bilingual)',
  render: () => (
    <SongPublishForm
      step="details"
      formData={filledFormData}
      onFormChange={() => {}}
      onNext={() => alert('Next')}
      onBack={() => alert('Back')}
      onPublish={() => {}}
    />
  ),
}

// ── Step 4: License & Publish ─────────────────────────────────────

export const LicenseNonCommercial: StoryObj = {
  name: '4. License (Non-Commercial)',
  render: () => (
    <SongPublishForm
      step="license"
      formData={{ ...filledFormData, license: 'non-commercial', attestation: false }}
      onFormChange={() => {}}
      onNext={() => {}}
      onBack={() => alert('Back')}
      onPublish={() => alert('Publish!')}
    />
  ),
}

export const LicenseCommercialRemix: StoryObj = {
  name: '4b. License (Commercial Remix)',
  render: () => (
    <SongPublishForm
      step="license"
      formData={filledFormData}
      onFormChange={() => {}}
      onNext={() => {}}
      onBack={() => alert('Back')}
      onPublish={() => alert('Publish!')}
    />
  ),
}

// ── Terminal states ───────────────────────────────────────────────

export const Publishing25: StoryObj = {
  name: '5a. Publishing (25%)',
  render: () => (
    <SongPublishForm
      step="publishing"
      formData={filledFormData}
      onFormChange={() => {}}
      onNext={() => {}}
      onBack={() => {}}
      onPublish={() => {}}
      progress={25}
    />
  ),
}

export const Publishing70: StoryObj = {
  name: '5b. Publishing (70%)',
  render: () => (
    <SongPublishForm
      step="publishing"
      formData={filledFormData}
      onFormChange={() => {}}
      onNext={() => {}}
      onBack={() => {}}
      onPublish={() => {}}
      progress={70}
    />
  ),
}

export const Success: StoryObj = {
  name: '6. Success',
  render: () => (
    <SongPublishForm
      step="success"
      formData={filledFormData}
      onFormChange={() => {}}
      onNext={() => {}}
      onBack={() => {}}
      onPublish={() => {}}
      onDone={() => alert('Done!')}
      result={{
        ipId: '0x1234567890abcdef1234567890abcdef12345678',
        tokenId: '42',
        audioCid: 'QmXnhhG1zLnVP8dbBKjVqWYJtiXvNc7VmdGSLqN6TKszXR',
        instrumentalCid: 'QmYvozSnK3tGhPCmqNe2ixqUFckhtv5oCnzGGPxadKFmR7',
      }}
    />
  ),
}

export const Error: StoryObj = {
  name: '7. Error',
  render: () => (
    <SongPublishForm
      step="error"
      formData={filledFormData}
      onFormChange={() => {}}
      onNext={() => {}}
      onBack={() => alert('Try again')}
      onPublish={() => {}}
      error="Failed to upload to IPFS: Filebase returned 503 Service Unavailable"
    />
  ),
}

// ── Interactive demo ───────────────────────────────────────────────

export const Interactive: StoryObj = {
  name: 'Interactive Demo',
  render: () => {
    const [step, setStep] = createSignal<PublishStep>('song')
    const [formData, setFormData] = createSignal<SongFormData>({ ...defaultFormData })
    const [progress, setProgress] = createSignal(0)

    const handleFormChange = (data: Partial<SongFormData>) => {
      setFormData((prev) => ({ ...prev, ...data }))
    }

    const steps: PublishStep[] = ['song', 'canvas', 'details', 'license']

    const handleNext = () => {
      const idx = steps.indexOf(step())
      if (idx < steps.length - 1) setStep(steps[idx + 1])
    }

    const handleBack = () => {
      if (step() === 'error') { setStep('license'); return }
      const idx = steps.indexOf(step())
      if (idx > 0) setStep(steps[idx - 1])
    }

    const handleSkip = () => {
      // Canvas skip goes to details
      if (step() === 'canvas') setStep('details')
    }

    const handlePublish = () => {
      setStep('publishing')
      setProgress(0)

      const stages = [10, 25, 40, 55, 70, 85, 95, 100]
      let i = 0
      const tick = setInterval(() => {
        setProgress(stages[i])
        i++
        if (i >= stages.length) {
          clearInterval(tick)
          setTimeout(() => setStep('success'), 500)
        }
      }, 600)
    }

    return (
      <SongPublishForm
        step={step()}
        formData={formData()}
        onFormChange={handleFormChange}
        onNext={handleNext}
        onBack={handleBack}
        onSkip={handleSkip}
        onPublish={handlePublish}
        onDone={() => { setStep('song'); setFormData({ ...defaultFormData }) }}
        progress={progress()}
        result={{
          ipId: '0xabcdef1234567890abcdef1234567890abcdef12',
          tokenId: '7',
          audioCid: 'QmXnhhG1zLnVP8dbBKjVqWYJtiXvNc7VmdGSLqN6TKszXR',
          instrumentalCid: 'QmYvozSnK3tGhPCmqNe2ixqUFckhtv5oCnzGGPxadKFmR7',
        }}
      />
    )
  },
}
