import type { Meta, StoryObj } from 'storybook-solidjs'
import { VideoThumbnail } from './video-thumbnail'

const meta = {
  title: 'Components/VideoThumbnail',
  component: VideoThumbnail,
  tags: ['autodocs'],
  decorators: [
    (Story: any) => (
      <div class="max-w-[280px] mx-auto">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    onClick: { action: 'clicked' },
  },
} satisfies Meta<typeof VideoThumbnail>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    thumbnailUrl: 'https://picsum.photos/seed/video1/450/800',
    viewCount: '38.9K',
  },
}

export const HighViews: Story = {
  args: {
    thumbnailUrl: 'https://picsum.photos/seed/video2/450/800',
    viewCount: '2.4M',
  },
}

export const LowViews: Story = {
  args: {
    thumbnailUrl: 'https://picsum.photos/seed/video3/450/800',
    viewCount: '1.2K',
  },
}

// Show multiple thumbnails in a grid to demonstrate usage
export const InGrid: Story = {
  render: () => (
    <div class="grid grid-cols-3 gap-2 max-w-2xl">
      <VideoThumbnail thumbnailUrl="https://picsum.photos/seed/grid1/450/800" viewCount="38.9K" />
      <VideoThumbnail thumbnailUrl="https://picsum.photos/seed/grid2/450/800" viewCount="447K" />
      <VideoThumbnail thumbnailUrl="https://picsum.photos/seed/grid3/450/800" viewCount="13.1K" />
      <VideoThumbnail thumbnailUrl="https://picsum.photos/seed/grid4/450/800" viewCount="17.5K" />
      <VideoThumbnail thumbnailUrl="https://picsum.photos/seed/grid5/450/800" viewCount="10.3K" />
      <VideoThumbnail thumbnailUrl="https://picsum.photos/seed/grid6/450/800" viewCount="20.9K" />
    </div>
  ),
}
