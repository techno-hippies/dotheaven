import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { Switch, type SwitchProps } from './switch'

const meta: Meta<SwitchProps> = {
  title: 'Primitives/Switch',
  component: Switch,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ padding: '2rem', background: 'var(--bg-surface)', 'border-radius': '6px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta

export const Default: StoryObj = {
  render: () => <Switch label="Airplane mode" />,
}

export const WithDescription: StoryObj = {
  render: () => (
    <Switch
      label="Airplane mode"
      description="Disable all network connections"
    />
  ),
}

export const Checked: StoryObj = {
  render: () => <Switch label="Notifications" defaultChecked />,
}

export const Disabled: StoryObj = {
  render: () => (
    <div class="flex flex-col gap-4">
      <Switch label="Disabled (off)" disabled />
      <Switch label="Disabled (on)" disabled defaultChecked />
    </div>
  ),
}

export const Controlled: StoryObj = {
  render: () => {
    const [checked, setChecked] = createSignal(false)
    return (
      <div class="flex flex-col gap-4">
        <Switch
          label="Dark mode"
          checked={checked()}
          onChange={setChecked}
        />
        <p class="text-base text-[var(--text-secondary)]">
          Dark mode is {checked() ? 'enabled' : 'disabled'}
        </p>
      </div>
    )
  },
}

export const AllVariants: StoryObj = {
  name: 'All Variants',
  render: () => (
    <div class="flex flex-col gap-4">
      <Switch label="Simple switch" />
      <Switch label="With description" description="Additional helper text" />
      <Switch label="Checked by default" defaultChecked />
      <Switch label="Disabled switch" disabled />
    </div>
  ),
}
