import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { PostComposer, type PostComposerProps, type PostProcessingStep } from './post-composer'
import { FeedPost } from './feed-post'

const meta: Meta<PostComposerProps> = {
  title: 'Composite/PostComposer',
  component: PostComposer,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: '600px', background: 'var(--bg-surface)', 'border-radius': '6px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta

const noop = () => {}
const AVATAR = 'https://placewaifu.com/image/100'
const NAT = 'JP'
const PHOTO = 'https://placewaifu.com/image/400/500'

// ── Basic states ───────────────────────────────────────────────────────

export const Default: StoryObj = {
  name: 'Default (empty)',
  render: () => (
    <PostComposer
      avatarUrl={AVATAR}
      nationalityCode={NAT}
      onPhotoClick={noop}
      onVideoClick={noop}
      onMusicClick={noop}
      onSubmit={noop}
    />
  ),
}

export const WithImage: StoryObj = {
  name: 'With Photo',
  render: () => (
    <PostComposer
      avatarUrl={AVATAR}
      mediaPreviewUrl={PHOTO}
      mediaType="image"
      onMediaRemove={noop}
      onPhotoClick={noop}
      onSubmit={(text, attr) => console.log('Submit:', { text, attr })}
    />
  ),
}

export const WithVideo: StoryObj = {
  name: 'With Video (shows audio attribution)',
  render: () => (
    <PostComposer
      avatarUrl={AVATAR}
      mediaPreviewUrl="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
      mediaType="video"
      onMediaRemove={noop}
      onPhotoClick={noop}
      onVideoClick={noop}
      onSubmit={(text, attr) => console.log('Submit:', { text, attr })}
    />
  ),
}

// ── Processing states ──────────────────────────────────────────────────

export const ProcessingSafety: StoryObj = {
  name: 'Processing — Checking',
  render: () => (
    <PostComposer
      avatarUrl={AVATAR}
      mediaPreviewUrl={PHOTO}
      mediaType="image"
      processing
      processingStep="safety"
    />
  ),
}

export const ProcessingConverting: StoryObj = {
  name: 'Processing — Converting',
  render: () => (
    <PostComposer
      avatarUrl={AVATAR}
      mediaPreviewUrl={PHOTO}
      mediaType="image"
      processing
      processingStep="converting"
    />
  ),
}

export const ProcessingUploading: StoryObj = {
  name: 'Processing — Uploading',
  render: () => (
    <PostComposer
      avatarUrl={AVATAR}
      mediaPreviewUrl={PHOTO}
      mediaType="image"
      processing
      processingStep="uploading"
    />
  ),
}

export const ProcessingRegistering: StoryObj = {
  name: 'Processing — Registering',
  render: () => (
    <PostComposer
      avatarUrl={AVATAR}
      mediaPreviewUrl={PHOTO}
      mediaType="image"
      processing
      processingStep="registering"
    />
  ),
}

export const ProcessingError: StoryObj = {
  name: 'Error',
  render: () => (
    <PostComposer
      avatarUrl={AVATAR}
      mediaPreviewUrl={PHOTO}
      mediaType="image"
      processingError="Image too small. Use a photo at least 512x512."
      onRetry={noop}
    />
  ),
}

export const Success: StoryObj = {
  name: 'Success',
  render: () => (
    <PostComposer
      avatarUrl={AVATAR}
      success
    />
  ),
}

// ── Interactive ────────────────────────────────────────────────────────

export const Interactive: StoryObj = {
  name: 'Interactive (Full Flow)',
  render: () => {
    const [media, setMedia] = createSignal<string | undefined>()
    const [processing, setProcessing] = createSignal(false)
    const [step, setStep] = createSignal<PostProcessingStep>('safety')
    const [error, setError] = createSignal<string | undefined>()
    const [success, setSuccess] = createSignal(false)

    const handleSubmit = (text: string, attribution?: unknown) => {
      console.log('Submit:', { text, attribution })
      setProcessing(true)
      setStep('safety')
      const steps: PostProcessingStep[] = ['safety', 'converting', 'uploading', 'registering']
      let i = 0
      const interval = setInterval(() => {
        i++
        if (i < steps.length) {
          setStep(steps[i])
        } else {
          clearInterval(interval)
          setProcessing(false)
          setSuccess(true)
          setTimeout(() => {
            setSuccess(false)
            setMedia(undefined)
          }, 2000)
        }
      }, 2000)
    }

    return (
      <PostComposer
        avatarUrl={AVATAR}
        mediaPreviewUrl={media()}
        mediaType="image"
        onPhotoClick={() => setMedia(PHOTO)}
        onMediaRemove={() => setMedia(undefined)}
        onVideoClick={noop}
        onMusicClick={noop}
        onSubmit={handleSubmit}
        processing={processing()}
        processingStep={step()}
        processingError={error()}
        onRetry={() => { setError(undefined); handleSubmit('', undefined) }}
        success={success()}
      />
    )
  },
}

// ── In Feed Context ────────────────────────────────────────────────────

export const InFeedContext: StoryObj = {
  name: 'In Feed (with posts below)',
  render: () => (
    <div style={{ width: '600px', background: 'var(--bg-page)' }}>
      <div class="bg-[var(--bg-surface)] rounded-md mb-3">
        <PostComposer
          avatarUrl={AVATAR}
          mediaPreviewUrl={PHOTO}
          mediaType="image"
          onMediaRemove={noop}
          onPhotoClick={noop}
          onVideoClick={noop}
          onMusicClick={noop}
          onSubmit={(text, attr) => console.log('Submit:', { text, attr })}
        />
      </div>
      <div class="bg-[var(--bg-surface)] rounded-md divide-y divide-[var(--bg-highlight)]">
        <FeedPost
          authorName="Yuki"
          authorHandle="yuki.heaven"
          authorAvatarUrl="https://placewaifu.com/image/100"
          timestamp="2h ago"
          text="Just discovered this amazing album."
          likes={42}
          comments={7}
          onLike={noop}
          onComment={noop}
        />
        <FeedPost
          authorName="Miku"
          authorHandle="miku.heaven"
          authorAvatarUrl="https://placewaifu.com/image/101"
          timestamp="4h ago"
          text="Sunset vibes from the rooftop"
          media={{ type: 'photo', items: [{ url: 'https://placewaifu.com/image/800/450', aspect: 'landscape' }] }}
          likes={234}
          comments={18}
          onLike={noop}
          onComment={noop}
        />
      </div>
    </div>
  ),
}
