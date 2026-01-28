import type { Meta, StoryObj } from 'storybook-solidjs'
import { VerticalVideoFeed } from './VerticalVideoFeed'
import { VideoPlaybackProvider } from './VideoPlaybackContext'
import type { VideoPostData } from './types'

const meta: Meta<typeof VerticalVideoFeed> = {
  title: 'Feed/VerticalVideoFeed',
  component: VerticalVideoFeed,
  decorators: [
    (Story) => (
      <VideoPlaybackProvider>
        <div class="h-screen w-full bg-[var(--bg-page)]">
          <Story />
        </div>
      </VideoPlaybackProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof VerticalVideoFeed>

// Sample video data
const sampleVideos: VideoPostData[] = [
  {
    id: '1',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnailUrl: 'https://picsum.photos/seed/video1/450/800',
    username: 'musicfan42',
    userAvatar: 'https://picsum.photos/seed/user1/100/100',
    caption: 'Vibing to this amazing track 🎵✨ The bassline is incredible!',
    trackTitle: 'Midnight Echoes',
    trackArtist: 'Synthwave Dreams',
    trackCoverUrl: 'https://picsum.photos/seed/album1/100/100',
    likes: 12400,
    comments: 342,
    shares: 89,
    isLiked: false,
    canInteract: true,
  },
  {
    id: '2',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    thumbnailUrl: 'https://picsum.photos/seed/video2/450/800',
    username: 'djmaster',
    userAvatar: 'https://picsum.photos/seed/user2/100/100',
    caption: 'New remix dropping soon! 🔥 What do you think?',
    trackTitle: 'Electric Dreams',
    trackArtist: 'Neon Pulse',
    trackCoverUrl: 'https://picsum.photos/seed/album2/100/100',
    likes: 8700,
    comments: 156,
    shares: 234,
    isLiked: true,
    canInteract: true,
  },
  {
    id: '3',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnailUrl: 'https://picsum.photos/seed/video3/450/800',
    username: 'beatmaker',
    caption: 'Making beats at 3am hits different 🌙',
    trackTitle: 'Late Night Sessions',
    trackArtist: 'Lo-Fi Collective',
    trackCoverUrl: 'https://picsum.photos/seed/album3/100/100',
    likes: 5200,
    comments: 98,
    shares: 45,
    isLiked: false,
    canInteract: true,
  },
  {
    id: '4',
    thumbnailUrl: 'https://picsum.photos/seed/video4/450/800',
    username: 'vinylcollector',
    userAvatar: 'https://picsum.photos/seed/user4/100/100',
    caption: 'Found this gem at the record store today! 📀',
    trackTitle: 'Retro Groove',
    trackArtist: 'Vinyl Masters',
    likes: 3100,
    comments: 67,
    shares: 23,
    isLiked: false,
    canInteract: true,
  },
]

export const Default: Story = {
  args: {
    videos: sampleVideos,
    hasMore: true,
    onLikeClick: (id) => console.log('Like clicked:', id),
    onCommentClick: (id) => console.log('Comment clicked:', id),
    onShareClick: (id) => console.log('Share clicked:', id),
    onProfileClick: (username) => console.log('Profile clicked:', username),
    onTrackClick: (id) => console.log('Track clicked:', id),
    onLoadMore: () => console.log('Load more triggered'),
    onVideoViewed: (id) => console.log('Video viewed:', id),
  },
}

export const Loading: Story = {
  args: {
    videos: [],
    isLoading: true,
  },
}

export const Empty: Story = {
  args: {
    videos: [],
    isLoading: false,
  },
}

export const SingleVideo: Story = {
  args: {
    videos: [sampleVideos[0]],
    hasMore: false,
  },
}
