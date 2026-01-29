import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { Checkbox } from './checkbox'
import { createSignal } from 'solid-js'

const meta = {
  title: 'Primitives/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
} satisfies Meta<typeof Checkbox>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    label: 'Accept terms and conditions',
  },
}

export const WithDescription: Story = {
  args: {
    label: 'Marketing emails',
    description: 'Receive emails about new products, features, and more.',
  },
}

export const DefaultChecked: Story = {
  args: {
    label: 'Subscribe to newsletter',
    defaultChecked: true,
  },
}

export const Disabled: Story = {
  args: {
    label: 'Disabled checkbox',
    disabled: true,
  },
}

export const DisabledChecked: Story = {
  args: {
    label: 'Disabled checked',
    defaultChecked: true,
    disabled: true,
  },
}

export const Invalid: Story = {
  args: {
    label: 'I agree to the terms',
    validationState: 'invalid',
    errorMessage: 'You must agree to continue',
  },
}

export const Controlled: Story = {
  render: () => {
    const [checked, setChecked] = createSignal(false)

    return (
      <div class="flex flex-col gap-4">
        <Checkbox
          label="Controlled checkbox"
          checked={checked()}
          onChange={setChecked}
        />
        <p class="text-sm text-[var(--text-secondary)]">
          Status: {checked() ? 'Checked' : 'Unchecked'}
        </p>
      </div>
    )
  },
}

export const Group: Story = {
  render: () => (
    <div class="flex flex-col gap-3">
      <p class="text-sm font-semibold text-[var(--text-primary)] mb-1">
        Select translations:
      </p>
      <Checkbox label="Chinese (Simplified)" defaultChecked />
      <Checkbox label="Japanese" />
      <Checkbox label="Korean" />
      <Checkbox label="Spanish" />
      <Checkbox label="French" />
    </div>
  ),
}
