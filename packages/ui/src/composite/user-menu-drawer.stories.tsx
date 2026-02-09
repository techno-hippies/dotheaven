import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { UserMenuDrawer } from './user-menu-drawer'

const meta: Meta<typeof UserMenuDrawer> = {
  title: 'Composite/UserMenuDrawer',
  component: UserMenuDrawer,
  args: {
    open: true,
    onOpenChange: () => {},
    displayName: 'alice',
    username: 'alice.heaven',
    onSettings: () => console.log('Settings clicked'),
    onLogout: () => console.log('Logout clicked'),
  },
}

export default meta
type Story = StoryObj<typeof UserMenuDrawer>

export const Default: Story = {
  args: {
    avatarUrl: 'https://placewaifu.com/image/200/200',
  },
}

export const WithoutAvatar: Story = {
  args: {
    avatarUrl: undefined,
  },
}

export const LongAddress: Story = {
  args: {
    displayName: 'My Profile',
    username: '0x1234567890abcdef1234567890abcdef12345678',
    avatarUrl: undefined,
  },
}
