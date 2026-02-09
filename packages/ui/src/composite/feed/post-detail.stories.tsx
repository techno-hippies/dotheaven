import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { PostDetailView } from './post-detail'

const meta: Meta<typeof PostDetailView> = {
  title: 'Feed/PostDetail',
  component: PostDetailView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ width: '560px', height: '700px', background: 'var(--bg-page)', margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof PostDetailView>

const noop = () => {}

const basePost = {
  authorName: 'Yuki',
  authorHandle: 'yuki.heaven',
  authorAvatarUrl: 'https://placewaifu.com/image/100',
  authorNationalityCode: 'JP',
  timestamp: '2h ago',
  likes: 42,
  comments: 7,
  reposts: 3,
  onLike: noop,
  onComment: noop,
  onRepost: noop,
  onQuote: noop,
  onCopyLink: noop,
  onSendViaChat: noop,
}

const sampleComments = [
  { authorName: 'Miku', avatarSrc: 'https://placewaifu.com/image/101', children: 'This is so good! Love the vibe.' },
  { authorName: 'Rei', avatarSrc: 'https://placewaifu.com/image/102', children: 'Totally agree, the production is next level.' },
  { authorName: 'Asuka', avatarSrc: 'https://placewaifu.com/image/103', children: 'Added to my playlist immediately.' },
]

export const Default: Story = {
  args: {
    post: {
      ...basePost,
      text: 'Just discovered this amazing album. The production quality is insane, every track flows into the next perfectly. Highly recommend giving it a full listen with headphones.',
    },
    comments: sampleComments,
    onBack: () => console.log('back'),
    onSubmitComment: (text) => console.log('comment:', text),
  },
}

export const WithMedia: Story = {
  args: {
    post: {
      ...basePost,
      text: 'Sunset vibes from the rooftop',
      media: { type: 'photo', items: [{ url: 'https://placewaifu.com/image/800/450', aspect: 'landscape' as const }] },
      likes: 234,
      comments: 18,
    },
    comments: sampleComments,
    onBack: () => console.log('back'),
    onSubmitComment: (text) => console.log('comment:', text),
  },
}

export const NoComments: Story = {
  args: {
    post: {
      ...basePost,
      text: 'Found this hidden gem on a random playlist. No idea who this artist is but the vocals are haunting. Anyone know them?',
      likes: 14,
      comments: 0,
    },
    comments: [],
    onBack: () => console.log('back'),
    onSubmitComment: (text) => console.log('comment:', text),
  },
}

export const Mobile: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '375px', height: '667px', background: 'var(--bg-page)', margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    post: {
      ...basePost,
      text: 'Just discovered this amazing album. The production quality is insane!',
      likes: 42,
      comments: 3,
    },
    comments: sampleComments.slice(0, 2),
    onBack: () => console.log('back'),
    onSubmitComment: (text) => console.log('comment:', text),
  },
}
