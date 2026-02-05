import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { PillGroup } from './pill-group'

const meta = {
  title: 'Primitives/PillGroup',
  component: PillGroup,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
      values: [{ name: 'dark', value: '#171717' }],
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PillGroup>

export default meta
type Story = StoryObj<typeof meta>

const GENDER_OPTIONS = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'nonbinary', label: 'Non-binary' },
  { value: 'other', label: 'Other' },
] as const

const TAG_OPTIONS = [
  { value: 'pop', label: 'Pop' },
  { value: 'rock', label: 'Rock' },
  { value: 'jazz', label: 'Jazz' },
  { value: 'electronic', label: 'Electronic' },
  { value: 'hiphop', label: 'Hip-Hop' },
  { value: 'classical', label: 'Classical' },
] as const

export const SingleSelection: Story = {
  name: 'Single Selection (Gender)',
  render: () => {
    const [selected, setSelected] = createSignal('')
    return (
      <div class="flex flex-col gap-4 w-96">
        <label class="text-sm font-medium text-[var(--text-secondary)]">Gender</label>
        <PillGroup
          options={GENDER_OPTIONS}
          value={selected()}
          onChange={(val) => setSelected(selected() === val ? '' : val)}
        />
        <p class="text-sm text-[var(--text-muted)]">
          Selected: {selected() || 'none'}
        </p>
      </div>
    )
  },
}

export const MultipleSelection: Story = {
  name: 'Multiple Selection (Tags)',
  render: () => {
    const [selected, setSelected] = createSignal<string[]>([])

    const handleChange = (value: string) => {
      setSelected((prev) =>
        prev.includes(value)
          ? prev.filter((v) => v !== value)
          : [...prev, value]
      )
    }

    return (
      <div class="flex flex-col gap-4 w-[500px]">
        <label class="text-sm font-medium text-[var(--text-secondary)]">
          Music Genres (select multiple)
        </label>
        <PillGroup
          options={TAG_OPTIONS}
          value={selected()}
          onChange={handleChange}
          multiple
        />
        <p class="text-sm text-[var(--text-muted)]">
          Selected: {selected().length ? selected().join(', ') : 'none'}
        </p>
      </div>
    )
  },
}

export const Disabled: Story = {
  args: {
    options: GENDER_OPTIONS,
    value: 'woman',
    disabled: true,
  },
}

export const PreSelected: Story = {
  name: 'Pre-selected Value',
  args: {
    options: GENDER_OPTIONS,
    value: 'nonbinary',
    onChange: (val) => console.log('Selected:', val),
  },
}
