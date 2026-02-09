import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { Select, type SelectOption } from './select'
import { createSignal } from 'solid-js'

const meta: Meta<typeof Select> = {
  title: 'Primitives/Select',
  argTypes: {
    placeholder: { control: 'text' },
    disabled: { control: 'boolean' },
    error: { control: 'text' },
  },
}

export default meta
type Story = StoryObj<typeof Select>

const FRUIT_OPTIONS: SelectOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'blueberry', label: 'Blueberry' },
  { value: 'grapes', label: 'Grapes' },
  { value: 'pineapple', label: 'Pineapple' },
  { value: 'strawberry', label: 'Strawberry' },
  { value: 'mango', label: 'Mango' },
  { value: 'orange', label: 'Orange' },
]

const LANGUAGE_OPTIONS: SelectOption[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ru', label: 'Russian' },
]

export const Default: Story = {
  render: () => {
    const [value, setValue] = createSignal('')

    return (
      <div class="max-w-md p-8">
        <Select
          options={FRUIT_OPTIONS}
          value={value()}
          onChange={setValue}
          placeholder="Select a fruit..."
        />
        <div class="mt-4 p-3 bg-[var(--bg-highlight)] rounded-md">
          <p class="text-base text-[var(--text-secondary)] mb-1">Selected value:</p>
          <p class="text-base text-[var(--text-primary)] font-medium">
            {value() || 'None'}
          </p>
        </div>
      </div>
    )
  },
}

export const WithLabel: Story = {
  render: () => {
    const [value, setValue] = createSignal('')

    return (
      <div class="max-w-md p-8">
        <div class="flex flex-col gap-1.5">
          <label class="text-base font-medium text-[var(--text-secondary)]">
            Favorite fruit
          </label>
          <Select
            options={FRUIT_OPTIONS}
            value={value()}
            onChange={setValue}
            placeholder="Select a fruit..."
          />
        </div>
      </div>
    )
  },
}

export const PreSelected: Story = {
  render: () => {
    const [value, setValue] = createSignal('blueberry')

    return (
      <div class="max-w-md p-8">
        <Select
          options={FRUIT_OPTIONS}
          value={value()}
          onChange={setValue}
          placeholder="Select a fruit..."
        />
        <div class="mt-4 p-3 bg-[var(--bg-highlight)] rounded-md">
          <p class="text-base text-[var(--text-secondary)] mb-1">Selected value:</p>
          <p class="text-base text-[var(--text-primary)] font-medium">{value()}</p>
        </div>
      </div>
    )
  },
}

export const WithError: Story = {
  render: () => {
    const [value, setValue] = createSignal('')

    return (
      <div class="max-w-md p-8">
        <div class="flex flex-col gap-1.5">
          <label class="text-base font-medium text-[var(--text-secondary)]">
            Favorite fruit
          </label>
          <Select
            options={FRUIT_OPTIONS}
            value={value()}
            onChange={setValue}
            placeholder="Select a fruit..."
            error="Please select a fruit"
          />
        </div>
      </div>
    )
  },
}

export const Disabled: Story = {
  render: () => {
    const [value, setValue] = createSignal('banana')

    return (
      <div class="max-w-md p-8">
        <Select
          options={FRUIT_OPTIONS}
          value={value()}
          onChange={setValue}
          placeholder="Select a fruit..."
          disabled
        />
      </div>
    )
  },
}

export const Languages: Story = {
  render: () => {
    const [value, setValue] = createSignal('')

    return (
      <div class="max-w-md p-8">
        <div class="flex flex-col gap-1.5">
          <label class="text-base font-medium text-[var(--text-secondary)]">
            Native language
          </label>
          <Select
            options={LANGUAGE_OPTIONS}
            value={value()}
            onChange={setValue}
            placeholder="Select..."
          />
        </div>
      </div>
    )
  },
}

export const TwoSelects: Story = {
  render: () => {
    const [nativeLang, setNativeLang] = createSignal('')
    const [targetLang, setTargetLang] = createSignal('')

    return (
      <div class="max-w-md p-8">
        <div class="flex gap-3">
          <div class="flex flex-col gap-1.5 flex-1">
            <label class="text-base font-medium text-[var(--text-secondary)]">
              Native language
            </label>
            <Select
              options={LANGUAGE_OPTIONS}
              value={nativeLang()}
              onChange={setNativeLang}
              placeholder="Select..."
            />
          </div>

          <div class="flex flex-col gap-1.5 flex-1">
            <label class="text-base font-medium text-[var(--text-secondary)]">Learning</label>
            <Select
              options={LANGUAGE_OPTIONS}
              value={targetLang()}
              onChange={setTargetLang}
              placeholder="Select..."
            />
          </div>
        </div>

        <div class="mt-4 p-3 bg-[var(--bg-highlight)] rounded-md">
          <p class="text-base text-[var(--text-secondary)] mb-2">Selection:</p>
          <p class="text-base text-[var(--text-primary)]">
            Native: {nativeLang() || 'None'}
          </p>
          <p class="text-base text-[var(--text-primary)]">
            Learning: {targetLang() || 'None'}
          </p>
        </div>
      </div>
    )
  },
}

export const WithDisabledOptions: Story = {
  render: () => {
    const [value, setValue] = createSignal('')

    const options: SelectOption[] = [
      { value: 'apple', label: 'Apple' },
      { value: 'banana', label: 'Banana' },
      { value: 'blueberry', label: 'Blueberry' },
      { value: 'grapes', label: 'Grapes (out of stock)', disabled: true },
      { value: 'pineapple', label: 'Pineapple' },
      { value: 'strawberry', label: 'Strawberry (out of stock)', disabled: true },
    ]

    return (
      <div class="max-w-md p-8">
        <div class="flex flex-col gap-1.5">
          <label class="text-base font-medium text-[var(--text-secondary)]">
            Available fruits
          </label>
          <Select
            options={options}
            value={value()}
            onChange={setValue}
            placeholder="Select a fruit..."
          />
        </div>
      </div>
    )
  },
}
