import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { SettingsMenu } from './settings-menu'
import { Gear, UserCircle, Bell, SignOut, Globe, Lock, Database } from '../icons'

const meta = {
  title: 'Settings/SettingsMenu',
  component: SettingsMenu,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div class="w-[400px] bg-[var(--bg-page)] p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SettingsMenu>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    items: [
      {
        key: 'account',
        icon: UserCircle,
        label: 'Account',
        description: '0x1234...5678',
        onClick: () => console.log('Account'),
      },
      {
        key: 'identity',
        icon: Globe,
        label: 'Identity',
        value: 'samantha.heaven',
        onClick: () => console.log('Identity'),
      },
      {
        key: 'notifications',
        icon: Bell,
        label: 'Notifications',
        onClick: () => console.log('Notifications'),
      },
      {
        key: 'privacy',
        icon: Lock,
        label: 'Privacy',
        onClick: () => console.log('Privacy'),
      },
    ],
  },
}

export const WithTitle: Story = {
  args: {
    title: 'General',
    items: [
      {
        key: 'account',
        icon: UserCircle,
        label: 'Account',
        description: 'Manage your account details',
        onClick: () => console.log('Account'),
      },
      {
        key: 'identity',
        icon: Globe,
        label: 'Identity',
        value: 'samantha.heaven',
        onClick: () => console.log('Identity'),
      },
      {
        key: 'storage',
        icon: Database,
        label: 'Storage',
        value: '2.4 GB',
        onClick: () => console.log('Storage'),
      },
    ],
  },
}

export const WithDestructiveItem: Story = {
  args: {
    items: [
      {
        key: 'account',
        icon: UserCircle,
        label: 'Account',
        description: '0x1234...5678',
        onClick: () => console.log('Account'),
      },
      {
        key: 'preferences',
        icon: Gear,
        label: 'Preferences',
        onClick: () => console.log('Preferences'),
      },
      {
        key: 'logout',
        icon: SignOut,
        label: 'Log Out',
        onClick: () => console.log('Log Out'),
        destructive: true,
      },
    ],
  },
}

export const MultipleSections: Story = {
  render: () => (
    <div class="flex flex-col gap-6">
      <SettingsMenu
        title="Account"
        items={[
          {
            key: 'identity',
            icon: Globe,
            label: 'Identity',
            value: 'samantha.heaven',
            onClick: () => console.log('Identity'),
          },
          {
            key: 'privacy',
            icon: Lock,
            label: 'Privacy',
            onClick: () => console.log('Privacy'),
          },
        ]}
      />
      <SettingsMenu
        title="App"
        items={[
          {
            key: 'notifications',
            icon: Bell,
            label: 'Notifications',
            onClick: () => console.log('Notifications'),
          },
          {
            key: 'storage',
            icon: Database,
            label: 'Storage',
            value: '2.4 GB',
            onClick: () => console.log('Storage'),
          },
        ]}
      />
      <SettingsMenu
        items={[
          {
            key: 'logout',
            icon: SignOut,
            label: 'Log Out',
            onClick: () => console.log('Log Out'),
            destructive: true,
          },
        ]}
      />
    </div>
  ),
}

export const MinimalItems: Story = {
  args: {
    items: [
      {
        key: 'identity',
        icon: Globe,
        label: 'Identity',
        onClick: () => console.log('Identity'),
      },
      {
        key: 'logout',
        icon: SignOut,
        label: 'Log Out',
        onClick: () => console.log('Log Out'),
        destructive: true,
      },
    ],
  },
}
