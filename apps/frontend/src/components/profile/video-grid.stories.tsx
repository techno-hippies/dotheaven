import type { Meta, StoryObj } from 'storybook-solidjs'
import { VideoGrid } from './video-grid'

const meta = {
  title: 'Components/VideoGrid',
  component: VideoGrid,
  tags: ['autodocs'],
  argTypes: {
    onVideoClick: { action: 'video clicked' },
  },
} satisfies Meta<typeof VideoGrid>

export default meta
type Story = StoryObj<typeof meta>

const mockVideos = [
  { id: '1', thumbnailUrl: 'https://picsum.photos/seed/video1/450/800', viewCount: '38.9K' },
  { id: '2', thumbnailUrl: 'https://picsum.photos/seed/video2/450/800', viewCount: '447K' },
  { id: '3', thumbnailUrl: 'https://picsum.photos/seed/video3/450/800', viewCount: '13.1K' },
  { id: '4', thumbnailUrl: 'https://picsum.photos/seed/video4/450/800', viewCount: '17.5K' },
  { id: '5', thumbnailUrl: 'https://picsum.photos/seed/video5/450/800', viewCount: '10.3K' },
  { id: '6', thumbnailUrl: 'https://picsum.photos/seed/video6/450/800', viewCount: '20.9K' },
  { id: '7', thumbnailUrl: 'https://picsum.photos/seed/video7/450/800', viewCount: '16.4K' },
  { id: '8', thumbnailUrl: 'https://picsum.photos/seed/video8/450/800', viewCount: '12.3K' },
  { id: '9', thumbnailUrl: 'https://picsum.photos/seed/video9/450/800', viewCount: '19.8K' },
]

export const Default: Story = {
  args: {
    videos: mockVideos,
  },
}

export const FewVideos: Story = {
  args: {
    videos: mockVideos.slice(0, 3),
  },
}

export const ManyVideos: Story = {
  args: {
    videos: [
      ...mockVideos,
      { id: '10', thumbnailUrl: 'https://picsum.photos/seed/video10/450/800', viewCount: '6.9M' },
      { id: '11', thumbnailUrl: 'https://picsum.photos/seed/video11/450/800', viewCount: '25.2K' },
      { id: '12', thumbnailUrl: 'https://picsum.photos/seed/video12/450/800', viewCount: '8.7K' },
      { id: '13', thumbnailUrl: 'https://picsum.photos/seed/video13/450/800', viewCount: '31.4K' },
      { id: '14', thumbnailUrl: 'https://picsum.photos/seed/video14/450/800', viewCount: '15.9K' },
      { id: '15', thumbnailUrl: 'https://picsum.photos/seed/video15/450/800', viewCount: '42.1K' },
    ],
  },
}

export const Empty: Story = {
  args: {
    videos: [],
  },
  render: (args: any) => (
    <div class="min-h-[400px] bg-[var(--bg-page)] p-6 rounded-md">
      <VideoGrid {...args} />
      <div class="text-center text-[var(--text-secondary)] mt-8">
        No videos yet
      </div>
    </div>
  ),
}
