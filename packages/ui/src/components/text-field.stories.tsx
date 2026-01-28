import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { TextField, TextArea } from './text-field'
import { createSignal } from 'solid-js'

const meta: Meta<typeof TextField> = {
  title: 'UI/TextField',
  component: TextField,
  tags: ['autodocs'],
  argTypes: {
    validationState: {
      control: 'select',
      options: ['valid', 'invalid'],
    },
  },
}

export default meta
type Story = StoryObj<typeof TextField>

export const Default: Story = {
  args: {
    label: 'Email',
    placeholder: 'Enter your email',
  },
}

export const WithDescription: Story = {
  args: {
    label: 'Username',
    placeholder: 'Choose a username',
    description: 'This will be your public display name.',
  },
}

export const Required: Story = {
  args: {
    label: 'Password',
    placeholder: 'Enter password',
    required: true,
    description: 'Password must be at least 8 characters.',
  },
}

export const WithError: Story = {
  render: () => {
    const [value, setValue] = createSignal('john')
    return (
      <TextField
        label="Username"
        placeholder="Choose a username"
        value={value()}
        onChange={setValue}
        validationState={value().length < 3 ? 'invalid' : 'valid'}
        errorMessage="Username must be at least 3 characters."
      />
    )
  },
}

export const Disabled: Story = {
  args: {
    label: 'Email',
    placeholder: 'Enter your email',
    defaultValue: 'user@example.com',
    disabled: true,
  },
}

export const ReadOnly: Story = {
  args: {
    label: 'User ID',
    defaultValue: 'usr_1234567890',
    readOnly: true,
    description: 'This value cannot be changed.',
  },
}

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = createSignal('Hello')
    return (
      <div class="flex flex-col gap-4">
        <TextField
          label="Controlled Input"
          placeholder="Type something..."
          value={value()}
          onChange={setValue}
        />
        <p class="text-sm text-[var(--text-secondary)]">Current value: {value()}</p>
      </div>
    )
  },
}

export const MultilineBasic: Story = {
  render: () => (
    <TextArea
      label="Bio"
      placeholder="Tell us about yourself..."
      description="Write a short bio for your profile."
    />
  ),
}

export const MultilineAutoResize: Story = {
  render: () => (
    <TextArea
      label="Message"
      placeholder="Type a message..."
      autoResize
      description="The textarea will automatically grow as you type."
    />
  ),
}

export const MessageInputStyle: Story = {
  render: () => {
    const [value, setValue] = createSignal('')
    return (
      <div class="flex items-end gap-2 p-4 bg-[var(--bg-page)]">
        <TextArea
          placeholder="Type a message..."
          value={value()}
          onChange={setValue}
          autoResize
          class="flex-1"
          textAreaClass="min-h-[44px] max-h-[120px]"
        />
        <button
          type="button"
          class="w-11 h-11 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors flex-shrink-0"
          disabled={!value().trim()}
          onClick={() => {
            console.log('Send:', value())
            setValue('')
          }}
        >
          <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    )
  },
}

export const AllStates: Story = {
  render: () => (
    <div class="space-y-6">
      <TextField label="Normal" placeholder="Normal state" />
      <TextField
        label="With Value"
        defaultValue="Some text here"
        placeholder="With value"
      />
      <TextField
        label="Invalid"
        placeholder="Invalid state"
        validationState="invalid"
        errorMessage="This field has an error."
      />
      <TextField
        label="Disabled"
        placeholder="Disabled state"
        disabled
      />
      <TextField
        label="Read Only"
        defaultValue="Read only value"
        readOnly
      />
    </div>
  ),
}
