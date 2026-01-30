import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { MultiSelect } from './multi-select'

const meta = {
  title: 'Primitives/MultiSelect',
  component: MultiSelect,
  parameters: {
    layout: 'padded',
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof MultiSelect>

export default meta
type Story = StoryObj<typeof meta>

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Mandarin' },
]

export const Default: Story = {
  render: () => {
    const [selected, setSelected] = createSignal<string[]>(['es', 'ja'])

    return (
      <div class="max-w-md p-8">
        <h3 class="text-[var(--text-primary)] text-lg font-semibold mb-4">
          Select Languages
        </h3>
        <MultiSelect
          options={languageOptions}
          value={selected()}
          onChange={setSelected}
          placeholder="Select languages..."
        />
        <div class="mt-4 text-[var(--text-secondary)]">
          <p>Selected values: {JSON.stringify(selected())}</p>
          <p>Selected count: {selected().length}</p>
        </div>
      </div>
    )
  },
}

export const Empty: Story = {
  render: () => {
    const [selected, setSelected] = createSignal<string[]>([])

    return (
      <div class="max-w-md p-8">
        <h3 class="text-[var(--text-primary)] text-lg font-semibold mb-4">
          Empty State
        </h3>
        <MultiSelect
          options={languageOptions}
          value={selected()}
          onChange={setSelected}
          placeholder="Select languages..."
        />
        <div class="mt-4 text-[var(--text-secondary)]">
          <p>Selected: {selected().length === 0 ? 'None' : selected().join(', ')}</p>
        </div>
      </div>
    )
  },
}
