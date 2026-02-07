import type { Meta, StoryObj } from 'storybook-solidjs'
import { SideMenuDrawer } from './side-menu-drawer'

const meta: Meta<typeof SideMenuDrawer> = {
  title: 'Composite/SideMenuDrawer',
  component: SideMenuDrawer,
  args: {
    open: true,
    onOpenChange: () => {},
    logoSrc: '/images/heaven.png',
  },
}

export default meta
type Story = StoryObj<typeof SideMenuDrawer>

export const Authenticated: Story = {
  args: {
    isAuthenticated: true,
    avatarUrl: 'https://placewaifu.com/image/200/200',
    displayName: 'alice',
    username: 'alice.heaven',
    onSettings: () => console.log('Settings'),
    onWallet: () => console.log('Wallet'),
    onLogout: () => console.log('Logout'),
  },
}

export const Unauthenticated: Story = {
  args: {
    isAuthenticated: false,
    onSettings: () => console.log('Settings'),
    onWallet: () => console.log('Wallet'),
  },
}

export const NoAvatar: Story = {
  args: {
    isAuthenticated: true,
    displayName: 'bob',
    username: 'bob.heaven',
    onSettings: () => console.log('Settings'),
    onWallet: () => console.log('Wallet'),
    onLogout: () => console.log('Logout'),
  },
}

export const LongAddress: Story = {
  args: {
    isAuthenticated: true,
    displayName: 'My Profile',
    username: '0x1234567890abcdef1234567890abcdef12345678',
    onSettings: () => console.log('Settings'),
    onWallet: () => console.log('Wallet'),
    onLogout: () => console.log('Logout'),
  },
}
