import type { Meta, StoryObj } from 'storybook-solidjs'
import { FeedPost } from './feed-post'

const meta: Meta<typeof FeedPost> = {
  title: 'Composite/FeedPost',
  component: FeedPost,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: '560px', background: 'var(--bg-page)', 'border-radius': '6px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof FeedPost>

// ── Shared data ────────────────────────────────────────────────────────

const author = {
  authorName: 'Yuki',
  authorHandle: 'yuki.heaven',
  authorAvatarUrl: 'https://placewaifu.com/image/100',
  timestamp: '2h ago',
}

// ── Text Only ──────────────────────────────────────────────────────────

export const TextOnly: Story = {
  args: {
    ...author,
    text: 'Just discovered this amazing album. The production quality is insane, every track flows into the next perfectly. Highly recommend giving it a full listen with headphones.',
    likes: 42,
    comments: 7,
  },
}

// ── Single Photo: Landscape (16:9) ────────────────────────────────────

export const PhotoLandscape: Story = {
  args: {
    ...author,
    text: 'Sunset vibes',
    media: {
      type: 'photo',
      items: [{ url: 'https://placewaifu.com/image/800/450', aspect: 'landscape' }],
    },
    likes: 234,
    comments: 18,
  },
}

// ── Single Photo: Portrait (3:4) ──────────────────────────────────────

export const PhotoPortrait: Story = {
  args: {
    ...author,
    text: 'New fit check',
    media: {
      type: 'photo',
      items: [{ url: 'https://placewaifu.com/image/400/533', aspect: 'portrait' }],
    },
    likes: 189,
    comments: 24,
  },
}

// ── Single Photo: Square (1:1) ────────────────────────────────────────

export const PhotoSquare: Story = {
  args: {
    ...author,
    text: 'Album art appreciation post',
    media: {
      type: 'photo',
      items: [{ url: 'https://placewaifu.com/image/500', aspect: 'square' }],
    },
    likes: 97,
    comments: 11,
  },
}

// ── Photo Grid: 2 images ──────────────────────────────────────────────

export const PhotoGrid2: Story = {
  args: {
    ...author,
    text: 'Concert was incredible last night',
    media: {
      type: 'photo',
      items: [
        { url: 'https://placewaifu.com/image/400/400' },
        { url: 'https://placewaifu.com/image/401/401' },
      ],
    },
    likes: 312,
    comments: 45,
  },
}

// ── Photo Grid: 3 images ──────────────────────────────────────────────

export const PhotoGrid3: Story = {
  args: {
    ...author,
    text: 'Photo dump from the weekend',
    media: {
      type: 'photo',
      items: [
        { url: 'https://placewaifu.com/image/500/500' },
        { url: 'https://placewaifu.com/image/300/300' },
        { url: 'https://placewaifu.com/image/301/301' },
      ],
    },
    likes: 156,
    comments: 22,
  },
}

// ── Photo Grid: 4+ images with overflow ───────────────────────────────

export const PhotoGrid5: Story = {
  name: 'Photo Grid (5+ with overflow)',
  args: {
    ...author,
    text: 'Festival highlights - so many good moments',
    media: {
      type: 'photo',
      items: [
        { url: 'https://placewaifu.com/image/400/400' },
        { url: 'https://placewaifu.com/image/401/401' },
        { url: 'https://placewaifu.com/image/402/402' },
        { url: 'https://placewaifu.com/image/403/403' },
        { url: 'https://placewaifu.com/image/404/404' },
        { url: 'https://placewaifu.com/image/405/405' },
      ],
    },
    likes: 891,
    comments: 67,
  },
}

// ── Video: Landscape ──────────────────────────────────────────────────

export const VideoLandscape: Story = {
  args: {
    ...author,
    text: 'Check out this live performance',
    media: {
      type: 'video',
      src: '',
      thumbnailUrl: 'https://placewaifu.com/image/800/450',
      aspect: 'landscape',
    },
    likes: 1200,
    comments: 89,
  },
}

// ── Video: Portrait (9:16 TikTok-style) ───────────────────────────────

export const VideoPortrait: Story = {
  args: {
    ...author,
    text: 'POV: discovering a new genre',
    media: {
      type: 'video',
      src: '',
      thumbnailUrl: 'https://placewaifu.com/image/270/480',
      aspect: 'portrait',
    },
    likes: 5400,
    comments: 312,
  },
}

// ── Video: Square ─────────────────────────────────────────────────────

export const VideoSquare: Story = {
  args: {
    ...author,
    text: 'Looping this forever',
    media: {
      type: 'video',
      src: '',
      thumbnailUrl: 'https://placewaifu.com/image/500/500',
      aspect: 'square',
    },
    likes: 678,
    comments: 34,
  },
}

// ── Liked state ───────────────────────────────────────────────────────

export const Liked: Story = {
  args: {
    ...author,
    text: 'This post has been liked',
    isLiked: true,
    likes: 100,
    comments: 10,
  },
}

// ── ENS name ──────────────────────────────────────────────────────────

export const EnsName: Story = {
  args: {
    ...author,
    authorName: 'Vitalik',
    authorHandle: 'vitalik.eth',
    text: 'Names can also be .eth or any other suffix',
    likes: 999,
    comments: 42,
  },
}

// ── Feed scroll (multiple posts) ──────────────────────────────────────

export const FeedScroll: StoryObj = {
  decorators: [
    (Story) => (
      <div style={{ width: '560px', height: '700px', overflow: 'auto', background: 'var(--bg-page)' }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <div class="divide-y divide-[var(--bg-highlight)]">
      <FeedPost
        {...author}
        text="Just discovered this amazing album. The production quality is insane."
        likes={42}
        comments={7}
      />
      <FeedPost
        authorName="Miku"
        authorHandle="miku.heaven"
        authorAvatarUrl="https://placewaifu.com/image/101"
        timestamp="4h ago"
        text="Sunset vibes"
        media={{ type: 'photo', items: [{ url: 'https://placewaifu.com/image/800/450', aspect: 'landscape' }] }}
        likes={234}
        comments={18}
      />
      <FeedPost
        authorName="Rei"
        authorHandle="rei.heaven"
        authorAvatarUrl="https://placewaifu.com/image/102"
        timestamp="6h ago"
        text="New album art is so good"
        media={{ type: 'photo', items: [{ url: 'https://placewaifu.com/image/500', aspect: 'square' }] }}
        likes={28}
        comments={3}
        isLiked
      />
      <FeedPost
        authorName="Asuka"
        authorHandle="asuka.eth"
        authorAvatarUrl="https://placewaifu.com/image/103"
        timestamp="8h ago"
        text="POV: discovering a new genre"
        media={{ type: 'video', src: '', thumbnailUrl: 'https://placewaifu.com/image/270/480', aspect: 'portrait' }}
        likes={5400}
        comments={312}
      />
      <FeedPost
        authorName="Sakura"
        authorHandle="sakura.heaven"
        authorAvatarUrl="https://placewaifu.com/image/104"
        timestamp="1d ago"
        text="Concert was incredible"
        media={{ type: 'photo', items: [
          { url: 'https://placewaifu.com/image/400/400' },
          { url: 'https://placewaifu.com/image/401/401' },
          { url: 'https://placewaifu.com/image/402/402' },
        ]}}
        likes={156}
        comments={22}
      />
    </div>
  ),
}
