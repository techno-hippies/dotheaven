import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { Checkbox, type CheckboxProps } from './checkbox'

const meta: Meta<CheckboxProps> = {
  title: 'Primitives/Checkbox',
  component: Checkbox,
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
  render: () => <Checkbox label="Accept terms and conditions" />,
}

export const WithDescription: StoryObj = {
  render: () => (
    <Checkbox
      label="Subscribe to newsletter"
      description="Get weekly updates about new features"
    />
  ),
}

export const Checked: StoryObj = {
  render: () => <Checkbox label="Remember me" defaultChecked />,
}

export const Disabled: StoryObj = {
  render: () => (
    <div class="flex flex-col gap-4">
      <Checkbox label="Disabled (unchecked)" disabled />
      <Checkbox label="Disabled (checked)" disabled defaultChecked />
    </div>
  ),
}

export const Controlled: StoryObj = {
  render: () => {
    const [checked, setChecked] = createSignal(false)
    return (
      <div class="flex flex-col gap-4">
        <Checkbox
          label="I agree to the terms"
          checked={checked()}
          onChange={setChecked}
        />
        <p class="text-base text-[var(--text-secondary)]">
          Terms {checked() ? 'accepted' : 'not accepted'}
        </p>
      </div>
    )
  },
}

export const MultipleCheckboxes: StoryObj = {
  name: 'Multiple Checkboxes',
  render: () => (
    <div class="flex flex-col gap-3">
      <div class="text-base font-medium text-[var(--text-primary)] mb-1">Select your interests:</div>
      <Checkbox label="Music" />
      <Checkbox label="Movies" />
      <Checkbox label="Sports" />
      <Checkbox label="Travel" />
    </div>
  ),
}

export const AllVariants: StoryObj = {
  name: 'All Variants',
  render: () => (
    <div class="flex flex-col gap-4">
      <Checkbox label="Simple checkbox" />
      <Checkbox label="With description" description="Additional helper text" />
      <Checkbox label="Checked by default" defaultChecked />
      <Checkbox label="Disabled checkbox" disabled />
    </div>
  ),
}
