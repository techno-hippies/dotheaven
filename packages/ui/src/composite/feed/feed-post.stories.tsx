import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { FeedPost } from './feed-post'

const meta: Meta<typeof FeedPost> = {
  title: 'Feed/FeedPost',
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
  authorNationalityCode: 'JP',
  timestamp: '2h ago',
}

const engagement = {
  likes: 42,
  comments: 7,
  reposts: 3,
  onLike: () => console.log('like'),
  onComment: () => console.log('comment'),
  onRepost: () => console.log('repost'),
  onQuote: () => console.log('quote'),
  onCopyLink: () => console.log('copy link'),
  onSendViaChat: () => console.log('send via chat'),
  onReportPost: () => console.log('report post'),
  onBlockUser: () => console.log('block user'),
  provenance: {
    postId: '0x396123e3de35472a918dd3aebf51eeab4aa21a580f1ab290a528c56229795c04',
    ipfsHash: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
    txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    chainId: 6343,
  },
}

// ── Text Only ──────────────────────────────────────────────────────────

export const TextOnly: Story = {
  args: {
    ...author,
    ...engagement,
    text: 'Just discovered this amazing album. The production quality is insane, every track flows into the next perfectly. Highly recommend giving it a full listen with headphones.',
  },
}

// ── Single Photo: Landscape (16:9) ────────────────────────────────────

export const PhotoLandscape: Story = {
  args: {
    ...author,
    ...engagement,
    likes: 234,
    comments: 18,
    reposts: 13,
    text: 'Sunset vibes',
    media: {
      type: 'photo',
      items: [{ url: 'https://placewaifu.com/image/800/450', aspect: 'landscape' }],
    },
  },
}

// ── Single Photo: Portrait (3:4) ──────────────────────────────────────

export const PhotoPortrait: Story = {
  args: {
    ...author,
    ...engagement,
    likes: 189,
    comments: 24,
    reposts: 8,
    text: 'New fit check',
    media: {
      type: 'photo',
      items: [{ url: 'https://placewaifu.com/image/400/533', aspect: 'portrait' }],
    },
  },
}

// ── Single Photo: Square (1:1) ────────────────────────────────────────

export const PhotoSquare: Story = {
  args: {
    ...author,
    ...engagement,
    likes: 97,
    comments: 11,
    reposts: 2,
    text: 'Album art appreciation post',
    media: {
      type: 'photo',
      items: [{ url: 'https://placewaifu.com/image/500', aspect: 'square' }],
    },
  },
}

// ── Photo Grid: 2 images ──────────────────────────────────────────────

export const PhotoGrid2: Story = {
  args: {
    ...author,
    ...engagement,
    likes: 312,
    comments: 45,
    reposts: 21,
    text: 'Concert was incredible last night',
    media: {
      type: 'photo',
      items: [
        { url: 'https://placewaifu.com/image/400/400' },
        { url: 'https://placewaifu.com/image/401/401' },
      ],
    },
  },
}

// ── Photo Grid: 3 images ──────────────────────────────────────────────

export const PhotoGrid3: Story = {
  args: {
    ...author,
    ...engagement,
    likes: 156,
    comments: 22,
    reposts: 5,
    text: 'Photo dump from the weekend',
    media: {
      type: 'photo',
      items: [
        { url: 'https://placewaifu.com/image/500/500' },
        { url: 'https://placewaifu.com/image/300/300' },
        { url: 'https://placewaifu.com/image/301/301' },
      ],
    },
  },
}

// ── Photo Grid: 4+ images with overflow ───────────────────────────────

export const PhotoGrid5: Story = {
  name: 'Photo Grid (5+ with overflow)',
  args: {
    ...author,
    ...engagement,
    likes: 891,
    comments: 67,
    reposts: 34,
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
  },
}

// ── Video: Landscape ──────────────────────────────────────────────────

export const VideoLandscape: Story = {
  args: {
    ...author,
    ...engagement,
    likes: 1200,
    comments: 89,
    reposts: 56,
    text: 'Check out this live performance',
    media: {
      type: 'video',
      src: '',
      thumbnailUrl: 'https://placewaifu.com/image/800/450',
      aspect: 'landscape',
    },
  },
}

// ── Video: Portrait (9:16 TikTok-style) ───────────────────────────────

export const VideoPortrait: Story = {
  args: {
    ...author,
    ...engagement,
    likes: 5400,
    comments: 312,
    reposts: 89,
    text: 'POV: discovering a new genre',
    media: {
      type: 'video',
      src: '',
      thumbnailUrl: 'https://placewaifu.com/image/270/480',
      aspect: 'portrait',
    },
  },
}

// ── Video: Square ─────────────────────────────────────────────────────

export const VideoSquare: Story = {
  args: {
    ...author,
    ...engagement,
    likes: 678,
    comments: 34,
    reposts: 12,
    text: 'Looping this forever',
    media: {
      type: 'video',
      src: '',
      thumbnailUrl: 'https://placewaifu.com/image/500/500',
      aspect: 'square',
    },
  },
}

// ── Liked + Reposted state ───────────────────────────────────────────

export const LikedAndReposted: Story = {
  args: {
    ...author,
    ...engagement,
    text: 'This post has been liked and reposted',
    isLiked: true,
    isReposted: true,
    likes: 244,
    comments: 56,
    reposts: 13,
  },
}

// ── ENS name ──────────────────────────────────────────────────────────

export const EnsName: Story = {
  args: {
    ...author,
    ...engagement,
    authorName: 'Vitalik',
    authorHandle: 'vitalik.eth',
    text: 'Names can also be .eth or any other suffix',
    likes: 999,
    comments: 42,
    reposts: 88,
  },
}

// ── Interactive — like/repost toggle ─────────────────────────────────

export const Interactive: StoryObj = {
  render: () => {
    const [liked, setLiked] = createSignal(false)
    const [likes, setLikes] = createSignal(244)
    const [reposted, setReposted] = createSignal(false)
    const [reposts, setReposts] = createSignal(13)

    return (
      <FeedPost
        {...author}
        text={`"pick a tick" is a challenge for all price discovery mechanisms`}
        comments={56}
        likes={likes()}
        reposts={reposts()}
        isLiked={liked()}
        isReposted={reposted()}
        onLike={() => {
          setLiked(!liked())
          setLikes(l => liked() ? l + 1 : l - 1)
        }}
        onRepost={() => {
          setReposted(!reposted())
          setReposts(r => reposted() ? r + 1 : r - 1)
        }}
        onQuote={() => console.log('open quote dialog')}
        onComment={() => console.log('comment')}
        onCopyLink={() => console.log('copy link')}
        onSendViaChat={() => console.log('send via chat')}
        onMenuClick={() => console.log('menu')}
      />
    )
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
        reposts={3}
        onLike={() => {}}
        onComment={() => {}}
        onRepost={() => {}}
        onQuote={() => {}}
        onCopyLink={() => {}}
        onSendViaChat={() => {}}
      />
      <FeedPost
        authorName="Miku"
        authorHandle="miku.heaven"
        authorAvatarUrl="https://placewaifu.com/image/101"
        authorNationalityCode="KR"
        timestamp="4h ago"
        text="Sunset vibes"
        media={{ type: 'photo', items: [{ url: 'https://placewaifu.com/image/800/450', aspect: 'landscape' }] }}
        likes={234}
        comments={18}
        reposts={13}
        onLike={() => {}}
        onComment={() => {}}
        onRepost={() => {}}
        onQuote={() => {}}
        onCopyLink={() => {}}
        onSendViaChat={() => {}}
      />
      <FeedPost
        authorName="Rei"
        authorHandle="rei.heaven"
        authorAvatarUrl="https://placewaifu.com/image/102"
        authorNationalityCode="DE"
        timestamp="6h ago"
        text="New album art is so good"
        media={{ type: 'photo', items: [{ url: 'https://placewaifu.com/image/500', aspect: 'square' }] }}
        likes={28}
        comments={3}
        reposts={1}
        isLiked
        onLike={() => {}}
        onComment={() => {}}
        onRepost={() => {}}
        onQuote={() => {}}
        onCopyLink={() => {}}
        onSendViaChat={() => {}}
      />
      <FeedPost
        authorName="Asuka"
        authorHandle="asuka.eth"
        authorAvatarUrl="https://placewaifu.com/image/103"
        authorNationalityCode="US"
        timestamp="8h ago"
        text="POV: discovering a new genre"
        media={{ type: 'video', src: '', thumbnailUrl: 'https://placewaifu.com/image/270/480', aspect: 'portrait' }}
        likes={5400}
        comments={312}
        reposts={89}
        onLike={() => {}}
        onComment={() => {}}
        onRepost={() => {}}
        onQuote={() => {}}
        onCopyLink={() => {}}
        onSendViaChat={() => {}}
      />
      <FeedPost
        authorName="Sakura"
        authorHandle="sakura.heaven"
        authorAvatarUrl="https://placewaifu.com/image/104"
        authorNationalityCode="BR"
        timestamp="1d ago"
        text="Concert was incredible"
        media={{ type: 'photo', items: [
          { url: 'https://placewaifu.com/image/400/400' },
          { url: 'https://placewaifu.com/image/401/401' },
          { url: 'https://placewaifu.com/image/402/402' },
        ]}}
        likes={156}
        comments={22}
        reposts={5}
        onLike={() => {}}
        onComment={() => {}}
        onRepost={() => {}}
        onQuote={() => {}}
        onCopyLink={() => {}}
        onSendViaChat={() => {}}
      />
    </div>
  ),
}

// ── Metadata: Text Post ──────────────────────────────────────────────────

export const MetadataTextPost: Story = {
  name: 'Metadata: Text Post',
  args: {
    ...author,
    ...engagement,
    text: 'Just discovered this amazing album. The production quality is insane.',
    provenance: {
      postId: '0x396123e3de35472a918dd3aebf51eeab4aa21a580f1ab290a528c56229795c04',
      ipfsHash: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      chainId: 6343,
    },
  },
}

// ── Metadata: Photo Post with Story Protocol IP ─────────────────────────

export const MetadataPhotoWithIP: Story = {
  name: 'Metadata: Photo + Story IP',
  args: {
    ...author,
    ...engagement,
    text: 'Just finished this piece. What do you think?',
    media: {
      type: 'photo',
      items: [{ url: 'https://placewaifu.com/image/800/450', aspect: 'landscape' }],
    },
    likes: 234,
    comments: 18,
    provenance: {
      postId: '0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
      ipfsHash: 'QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX',
      txHash: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
      chainId: 6343,
      ipId: '0x1234567890abcdef1234567890abcdef12345678',
    },
  },
}

// ── Translation: Available ──────────────────────────────────────────────

export const TranslationAvailable: Story = {
  name: 'Translation: Available',
  args: {
    ...author,
    ...engagement,
    text: '今日は素晴らしいアルバムを見つけました。プロダクションの質が凄い、すべてのトラックが完璧に繋がっている。ヘッドフォンで全曲聴くことを強くお勧めします。',
    userLang: 'en',
    translations: {
      en: 'Just discovered this amazing album. The production quality is insane, every track flows into the next perfectly. Highly recommend giving it a full listen with headphones.',
      es: 'Acabo de descubrir este increíble álbum. La calidad de producción es una locura, cada pista fluye a la siguiente perfectamente. Muy recomendable escucharlo completo con audífonos.',
    },
  },
}

// ── Translation: Not Yet Translated ─────────────────────────────────────

export const TranslationUntranslated: Story = {
  name: 'Translation: Untranslated',
  args: {
    ...author,
    ...engagement,
    text: '今日は素晴らしいアルバムを見つけました。プロダクションの質が凄い。',
    userLang: 'en',
    onTranslate: (lang: string) => console.log('translate to:', lang),
  },
}

// ── Translation: In Progress ────────────────────────────────────────────

export const TranslationInProgress: Story = {
  name: 'Translation: In Progress',
  args: {
    ...author,
    ...engagement,
    text: '今日は素晴らしいアルバムを見つけました。プロダクションの質が凄い。',
    userLang: 'en',
    isTranslating: true,
    onTranslate: () => {},
  },
}

// ── Translation: Interactive Demo ───────────────────────────────────────

export const TranslationInteractive: Story = {
  name: 'Translation: Interactive',
  render: () => {
    const [translations, setTranslations] = createSignal<Record<string, string>>({})
    const [isTranslating, setIsTranslating] = createSignal(false)

    const handleTranslate = (lang: string) => {
      setIsTranslating(true)
      // Simulate LLM translation delay
      setTimeout(() => {
        setTranslations({
          ...translations(),
          [lang]: 'Just discovered this amazing album. The production quality is insane, every track flows into the next perfectly. Highly recommend giving it a full listen with headphones.',
        })
        setIsTranslating(false)
      }, 2000)
    }

    return (
      <FeedPost
        {...author}
        {...engagement}
        text="今日は素晴らしいアルバムを見つけました。プロダクションの質が凄い、すべてのトラックが完璧に繋がっている。ヘッドフォンで全曲聴くことを強くお勧めします。"
        userLang="en"
        translations={translations()}
        isTranslating={isTranslating()}
        onTranslate={handleTranslate}
      />
    )
  },
}
