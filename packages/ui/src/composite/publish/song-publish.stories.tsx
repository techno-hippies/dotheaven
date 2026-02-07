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
  album: '',
  genre: '',
  primaryLanguage: '',
  secondaryLanguage: '',
  lyrics: '',
  coverFile: null,
  audioFile: null,
  instrumentalFile: null,
  previewStart: 0,
  previewEnd: 30,
  license: 'non-commercial',
  revShare: 10,
  mintingFee: '0',
  attestation: false,
}

const filledFormData: SongFormData = {
  title: 'Midnight in Seoul',
  artist: 'YUNA',
  album: 'Neon Dreams',
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
  previewStart: 45,
  previewEnd: 75,
  license: 'commercial-remix',
  revShare: 15,
  mintingFee: '0',
  attestation: true,
}

const meta: Meta = {
  title: 'Publish/SongPublishForm',
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: '520px', background: 'var(--bg-page)', padding: '24px', 'border-radius': '6px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta

// ── Static step stories ────────────────────────────────────────────

export const UploadEmpty: StoryObj = {
  name: '1. Upload (Empty)',
  render: () => (
    <SongPublishForm
      step="upload"
      formData={defaultFormData}
      onFormChange={() => {}}
      onNext={() => alert('Next')}
      onBack={() => {}}
      onPublish={() => {}}
      copyrightCheck={{ status: 'idle' }}
    />
  ),
}

export const UploadChecking: StoryObj = {
  name: '1b. Upload (Checking)',
  render: () => (
    <SongPublishForm
      step="upload"
      formData={{ ...defaultFormData, audioFile: new File([''], 'song.mp3', { type: 'audio/mpeg' }) }}
      onFormChange={() => {}}
      onNext={() => {}}
      onBack={() => {}}
      onPublish={() => {}}
      copyrightCheck={{ status: 'checking' }}
    />
  ),
}

export const UploadClear: StoryObj = {
  name: '1c. Upload (Clear)',
  render: () => (
    <SongPublishForm
      step="upload"
      formData={{ ...defaultFormData, audioFile: new File([''], 'midnight-seoul.mp3', { type: 'audio/mpeg' }) }}
      onFormChange={() => {}}
      onNext={() => alert('Next')}
      onBack={() => {}}
      onPublish={() => {}}
      copyrightCheck={{ status: 'clear' }}
    />
  ),
}

export const UploadWithInstrumental: StoryObj = {
  name: '1c2. Upload (With Instrumental)',
  render: () => (
    <SongPublishForm
      step="upload"
      formData={{
        ...defaultFormData,
        audioFile: new File([''], 'midnight-seoul.mp3', { type: 'audio/mpeg' }),
        instrumentalFile: new File([''], 'midnight-seoul-instrumental.mp3', { type: 'audio/mpeg' }),
      }}
      onFormChange={() => {}}
      onNext={() => alert('Next')}
      onBack={() => {}}
      onPublish={() => {}}
      copyrightCheck={{ status: 'clear' }}
    />
  ),
}

export const UploadMatch: StoryObj = {
  name: '1d. Upload (Copyright Match)',
  render: () => (
    <SongPublishForm
      step="upload"
      formData={{ ...defaultFormData, audioFile: new File([''], 'stolen-song.mp3', { type: 'audio/mpeg' }) }}
      onFormChange={() => {}}
      onNext={() => {}}
      onBack={() => {}}
      onPublish={() => {}}
      copyrightCheck={{ status: 'match', matchInfo: '"Shape of You" by Ed Sheeran (AcoustID 98% match)' }}
    />
  ),
}

export const DetailsEmpty: StoryObj = {
  name: '2. Details (Empty)',
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
  name: '2b. Details (Filled)',
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

export const LyricsEmpty: StoryObj = {
  name: '3. Lyrics (Empty)',
  render: () => (
    <SongPublishForm
      step="lyrics"
      formData={defaultFormData}
      onFormChange={() => {}}
      onNext={() => alert('Next')}
      onBack={() => alert('Back')}
      onPublish={() => {}}
    />
  ),
}

export const LyricsFilled: StoryObj = {
  name: '3b. Lyrics (K-Pop Bilingual)',
  render: () => (
    <SongPublishForm
      step="lyrics"
      formData={filledFormData}
      onFormChange={() => {}}
      onNext={() => alert('Next')}
      onBack={() => alert('Back')}
      onPublish={() => {}}
    />
  ),
}

export const LicenseNonCommercial: StoryObj = {
  name: '4. License (Non-Commercial)',
  render: () => (
    <SongPublishForm
      step="license"
      formData={{ ...filledFormData, license: 'non-commercial', attestation: false }}
      onFormChange={() => {}}
      onNext={() => alert('Next')}
      onBack={() => alert('Back')}
      onPublish={() => {}}
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
      onNext={() => alert('Review')}
      onBack={() => alert('Back')}
      onPublish={() => {}}
    />
  ),
}

export const Review: StoryObj = {
  name: '5. Review',
  render: () => (
    <SongPublishForm
      step="review"
      formData={filledFormData}
      onFormChange={() => {}}
      onNext={() => {}}
      onBack={() => alert('Back')}
      onPublish={() => alert('Publish!')}
    />
  ),
}

export const Publishing25: StoryObj = {
  name: '6a. Publishing (25%)',
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
  name: '6b. Publishing (70%)',
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
  name: '7. Success',
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
  name: '8. Error',
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
    const [step, setStep] = createSignal<PublishStep>('upload')
    const [formData, setFormData] = createSignal<SongFormData>({ ...defaultFormData })
    const [copyrightCheck, setCopyrightCheck] = createSignal<SongPublishFormProps['copyrightCheck']>({ status: 'idle' })
    const [progress, setProgress] = createSignal(0)

    const handleFormChange = (data: Partial<SongFormData>) => {
      setFormData((prev) => ({ ...prev, ...data }))

      // Simulate AcoustID check when audio file is selected
      if (data.audioFile) {
        setCopyrightCheck({ status: 'checking' })
        setTimeout(() => setCopyrightCheck({ status: 'clear' }), 1500)
      }
    }

    const steps: PublishStep[] = ['upload', 'details', 'lyrics', 'license', 'review']

    const handleNext = () => {
      const idx = steps.indexOf(step())
      if (idx < steps.length - 1) setStep(steps[idx + 1])
    }

    const handleBack = () => {
      if (step() === 'error') { setStep('review'); return }
      const idx = steps.indexOf(step())
      if (idx > 0) setStep(steps[idx - 1])
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
        onPublish={handlePublish}
        onDone={() => { setStep('upload'); setFormData({ ...defaultFormData }); setCopyrightCheck({ status: 'idle' }) }}
        copyrightCheck={copyrightCheck()}
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
