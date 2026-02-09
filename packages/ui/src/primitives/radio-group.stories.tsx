import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { RadioGroup, type RadioGroupProps } from './radio-group'

const meta: Meta<RadioGroupProps> = {
  title: 'Primitives/RadioGroup',
  component: RadioGroup,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ padding: '2rem', background: 'var(--bg-surface)', 'border-radius': '6px', 'min-width': '300px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta

const fruitOptions = [
  { value: 'apple', label: 'Apple' },
  { value: 'orange', label: 'Orange' },
  { value: 'watermelon', label: 'Watermelon' },
]

export const Default: StoryObj = {
  render: () => (
    <RadioGroup
      label="Favorite fruit"
      options={fruitOptions}
      defaultValue="orange"
    />
  ),
}

export const WithDescriptions: StoryObj = {
  render: () => (
    <RadioGroup
      label="Room visibility"
      options={[
        { value: 'open', label: 'Open', description: 'Anyone can join from Live Now' },
        { value: 'followers', label: 'Followers', description: 'Only people you follow can join' },
        { value: 'private', label: 'Private', description: 'Invite only via link' },
      ]}
      defaultValue="open"
    />
  ),
}

export const Horizontal: StoryObj = {
  render: () => (
    <RadioGroup
      label="Size"
      orientation="horizontal"
      options={[
        { value: 'sm', label: 'Small' },
        { value: 'md', label: 'Medium' },
        { value: 'lg', label: 'Large' },
      ]}
      defaultValue="md"
    />
  ),
}

export const Disabled: StoryObj = {
  render: () => (
    <RadioGroup
      label="Disabled group"
      options={fruitOptions}
      defaultValue="apple"
      disabled
    />
  ),
}

export const Controlled: StoryObj = {
  render: () => {
    const [value, setValue] = createSignal('orange')
    return (
      <div class="flex flex-col gap-4">
        <RadioGroup
          label="Favorite fruit"
          options={fruitOptions}
          value={value()}
          onChange={setValue}
        />
        <p class="text-base text-[var(--text-secondary)]">
          Selected: {value()}
        </p>
      </div>
    )
  },
}

export const WithGroupDescription: StoryObj = {
  name: 'With Group Description',
  render: () => (
    <RadioGroup
      label="Notification preference"
      description="Choose how you want to be notified"
      options={[
        { value: 'all', label: 'All notifications' },
        { value: 'mentions', label: 'Mentions only' },
        { value: 'none', label: 'None' },
      ]}
      defaultValue="all"
    />
  ),
}

export const AllVariants: StoryObj = {
  name: 'All Variants',
  render: () => (
    <div class="flex flex-col gap-8">
      <RadioGroup
        label="Vertical (default)"
        options={fruitOptions}
        defaultValue="apple"
      />
      <RadioGroup
        label="Horizontal"
        orientation="horizontal"
        options={[
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ]}
        defaultValue="yes"
      />
      <RadioGroup
        label="With descriptions"
        options={[
          { value: 'open', label: 'Open', description: 'Anyone can join' },
          { value: 'private', label: 'Private', description: 'Invite only' },
        ]}
        defaultValue="open"
      />
      <RadioGroup
        label="Disabled"
        options={fruitOptions}
        defaultValue="orange"
        disabled
      />
    </div>
  ),
}
