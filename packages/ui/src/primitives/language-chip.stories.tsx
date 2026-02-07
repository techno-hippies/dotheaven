import type { Meta, StoryObj } from 'storybook-solidjs'
import { LanguageChip } from './language-chip'
import { PROFICIENCY } from '../data/languages'

const meta: Meta<typeof LanguageChip> = {
  title: 'Primitives/LanguageChip',
  component: LanguageChip,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ padding: '20px', background: 'var(--bg-page)' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof LanguageChip>

// ── Basic Examples ──────────────────────────────────────────────────────────

export const Native: Story = {
  args: {
    language: 'English',
    proficiency: PROFICIENCY.NATIVE,
  },
}

export const C2: Story = {
  args: {
    language: 'French',
    proficiency: PROFICIENCY.C2,
  },
}

export const C1: Story = {
  args: {
    language: 'German',
    proficiency: PROFICIENCY.C1,
  },
}

export const B2: Story = {
  args: {
    language: 'Spanish',
    proficiency: PROFICIENCY.B2,
  },
}

export const B1: Story = {
  args: {
    language: 'Italian',
    proficiency: PROFICIENCY.B1,
  },
}

export const A2: Story = {
  args: {
    language: 'Japanese',
    proficiency: PROFICIENCY.A2,
  },
}

export const A1: Story = {
  args: {
    language: 'Korean',
    proficiency: PROFICIENCY.A1,
  },
}

// ── Size Variants ──────────────────────────────────────────────────────────

export const SmallSize: Story = {
  args: {
    language: 'English',
    proficiency: PROFICIENCY.NATIVE,
    size: 'sm',
  },
}

export const MediumSize: Story = {
  args: {
    language: 'English',
    proficiency: PROFICIENCY.NATIVE,
    size: 'md',
  },
}

// ── All Levels Comparison ───────────────────────────────────────────────────

export const AllLevels: StoryObj = {
  render: () => (
    <div class="flex flex-col gap-3">
      <h3 class="text-sm font-semibold text-[var(--text-muted)] mb-1">
        All Proficiency Levels
      </h3>
      <div class="flex flex-col gap-2">
        <LanguageChip language="English" proficiency={PROFICIENCY.NATIVE} size="sm" />
        <LanguageChip language="French" proficiency={PROFICIENCY.C2} size="sm" />
        <LanguageChip language="German" proficiency={PROFICIENCY.C1} size="sm" />
        <LanguageChip language="Spanish" proficiency={PROFICIENCY.B2} size="sm" />
        <LanguageChip language="Italian" proficiency={PROFICIENCY.B1} size="sm" />
        <LanguageChip language="Japanese" proficiency={PROFICIENCY.A2} size="sm" />
        <LanguageChip language="Korean" proficiency={PROFICIENCY.A1} size="sm" />
      </div>
    </div>
  ),
}

// ── Multiple Languages (inline) ──────────────────────────────────────────────

export const MultipleLanguages: StoryObj = {
  render: () => (
    <div class="flex flex-wrap gap-2" style={{ 'max-width': '400px' }}>
      <LanguageChip language="English" proficiency={PROFICIENCY.NATIVE} size="sm" />
      <LanguageChip language="German" proficiency={PROFICIENCY.NATIVE} size="sm" />
      <LanguageChip language="Spanish" proficiency={PROFICIENCY.B2} size="sm" />
      <LanguageChip language="French" proficiency={PROFICIENCY.B1} size="sm" />
      <LanguageChip language="Japanese" proficiency={PROFICIENCY.A2} size="sm" />
      <LanguageChip language="Korean" proficiency={PROFICIENCY.A1} size="sm" />
    </div>
  ),
}
