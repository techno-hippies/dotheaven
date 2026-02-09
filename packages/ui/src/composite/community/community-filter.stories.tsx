import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal, Show } from 'solid-js'
import { CommunityFilterDialog, countActiveFilters, type CommunityFilters } from './community-filter'
import { Button } from '../../primitives/button'
import { Sliders } from '../../icons'

const meta: Meta<typeof CommunityFilterDialog> = {
  title: 'Search/CommunityFilter',
  component: CommunityFilterDialog,
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof CommunityFilterDialog>

// ── Dialog open (empty) ─────────────────────────────────────────────────

export const Empty: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    filters: {},
    onFiltersChange: () => {},
  },
}

// ── With pre-applied filters ────────────────────────────────────────────

export const WithFilters: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    filters: { learningLanguage: 'ja', gender: '2' },
    onFiltersChange: () => {},
  },
}

// ── Interactive: button opens dialog ────────────────────────────────────

export const Interactive: StoryObj = {
  render: () => {
    const [open, setOpen] = createSignal(false)
    const [filters, setFilters] = createSignal<CommunityFilters>({})
    const count = () => countActiveFilters(filters())

    return (
      <div class="flex flex-col items-center gap-4 p-8">
        <div class="relative">
          <Button
            variant="secondary"
            icon={<Sliders />}
            onClick={() => setOpen(true)}
            class="h-12"
          >
            Filter
          </Button>
          <Show when={count() > 0}>
            <span class="absolute -top-0.5 -right-1.5 w-4 h-4 bg-[var(--accent-coral)] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {count()}
            </span>
          </Show>
        </div>

        <p class="text-sm text-[var(--text-muted)]">
          Active filters: {count()}
          {filters().gender && ` | Gender: ${filters().gender}`}
          {filters().nativeLanguage && ` | Native: ${filters().nativeLanguage}`}
          {filters().learningLanguage && ` | Learning: ${filters().learningLanguage}`}
          {filters().sameCity && ' | Same City'}
          {filters().verified && ' | Verified'}
        </p>

        <CommunityFilterDialog
          open={open()}
          onOpenChange={setOpen}
          filters={filters()}
          onFiltersChange={setFilters}
        />
      </div>
    )
  },
}

// ── Pre-applied: 1 default filter (language learning) ───────────────────

export const DefaultLanguageFilter: StoryObj = {
  render: () => {
    const [open, setOpen] = createSignal(false)
    const [filters, setFilters] = createSignal<CommunityFilters>({ learningLanguage: 'ja' })
    const count = () => countActiveFilters(filters())

    return (
      <div class="flex flex-col items-center gap-4 p-8">
        <p class="text-sm text-[var(--text-secondary)]">
          Simulates the default filter: user is learning Japanese
        </p>
        <div class="relative">
          <Button
            variant="secondary"
            icon={<Sliders />}
            onClick={() => setOpen(true)}
            class="h-12"
          >
            Filter
          </Button>
          <Show when={count() > 0}>
            <span class="absolute -top-0.5 -right-1.5 w-4 h-4 bg-[var(--accent-coral)] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {count()}
            </span>
          </Show>
        </div>

        <CommunityFilterDialog
          open={open()}
          onOpenChange={setOpen}
          filters={filters()}
          onFiltersChange={setFilters}
        />
      </div>
    )
  },
}
