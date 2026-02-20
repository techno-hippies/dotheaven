import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { LiveRoomsRow } from './LiveRoomsRow'

const meta: Meta<typeof LiveRoomsRow> = {
  title: 'Web New/LiveRoomsRow',
  component: LiveRoomsRow,
}

export default meta

type Story = StoryObj<typeof meta>

export const Loading: Story = {
  args: {
    rooms: [],
    isLoading: true,
    error: null,
  },
}

export const Empty: Story = {
  args: {
    rooms: [],
    isLoading: false,
    error: null,
  },
}

export const LiveRooms: Story = {
  args: {
    isLoading: false,
    error: null,
    rooms: [
      {
        roomId: 'a9f8e9f6-2222-4444-9999-c1b61f730001',
        title: 'Synthwave Sunrise',
        hostWallet: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        listenerCount: 128,
        audienceMode: 'free',
        watchUrl: 'https://voice-control-plane.deletion-backup782.workers.dev/duet/a9f8e9f6-2222-4444-9999-c1b61f730001/watch',
      },
      {
        roomId: 'db9af0f8-2222-4444-9999-c1b61f730002',
        title: 'Lo-fi Night Session',
        hostWallet: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
        listenerCount: 42,
        audienceMode: 'ticketed',
        watchUrl: 'https://voice-control-plane.deletion-backup782.workers.dev/duet/db9af0f8-2222-4444-9999-c1b61f730002/watch',
      },
    ],
  },
}
