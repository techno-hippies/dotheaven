import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal, Show } from 'solid-js'
import { CommunityFeed } from './community-feed'
import type { CommunityCardProps } from './community-card'
import { CommunityFilterDialog, countActiveFilters, type CommunityFilters } from './community-filter'
import { Button } from '../../primitives/button'
import { TextField } from '../../primitives/text-field'
import { Sliders, MagnifyingGlass } from '../../icons'

const meta: Meta<typeof CommunityFeed> = {
  title: 'Community/CommunityFeed',
  component: CommunityFeed,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ height: '100vh', background: 'var(--bg-page)' }} class="flex flex-col">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof CommunityFeed>

// ── Sample data ─────────────────────────────────────────────────────────

const sampleMembers: CommunityCardProps[] = [
  {
    name: 'Matthias',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face',
    nationalityCode: 'DE',
    online: true,
    age: 28,
    gender: 'M',
    verified: 'verified',
    location: 'Berlin, Germany',
  },
  {
    name: 'Hannah',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face',
    nationalityCode: 'US',
    age: 24,
    gender: 'F',
    verified: 'verified',
    location: 'New York, USA',
  },
  {
    name: 'Eduardo',
    avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&h=200&fit=crop&crop=face',
    nationalityCode: 'BR',
    online: true,
    age: 31,
    gender: 'M',
    location: 'Madrid, Spain',
  },
  {
    name: 'Mia',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=face',
    nationalityCode: 'CA',
    age: 22,
    location: 'Toronto, Canada',
  },
  {
    name: 'Liam',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face',
    nationalityCode: 'GB',
    online: true,
    age: 29,
    gender: 'M',
    location: 'London, UK',
  },
  {
    name: 'Sakura',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&crop=face',
    nationalityCode: 'JP',
    age: 21,
    gender: 'F',
    verified: 'verified',
    location: 'Tokyo, Japan',
  },
]

// ── Default ─────────────────────────────────────────────────────────

export const Default: Story = {
  args: {
    members: sampleMembers,
  },
}

// ── Empty state ─────────────────────────────────────────────────────────

export const Empty: Story = {
  args: {
    members: [],
  },
}

// ── Loading state ───────────────────────────────────────────────────────

export const Loading: Story = {
  args: {
    members: [],
    isLoading: true,
  },
}

// ── With search bar + filter button (interactive) ───────────────────────

export const WithSearchAndFilter: Story = {
  decorators: [
    () => {
      const [query, setQuery] = createSignal('')
      const [filterOpen, setFilterOpen] = createSignal(false)
      const [filters, setFilters] = createSignal<CommunityFilters>({})
      const activeCount = () => countActiveFilters(filters())

      const filtered = () => {
        const q = query().toLowerCase().trim()
        if (!q) return sampleMembers
        return sampleMembers.filter(
          (m) =>
            m.name?.toLowerCase().includes(q) ||
            m.location?.toLowerCase().includes(q),
        )
      }

      return (
        <div style={{ height: '100vh', background: 'var(--bg-page)' }} class="flex flex-col">
          <div class="flex items-center gap-2 px-4 pt-4 pb-2">
            <TextField
              value={query()}
              onChange={setQuery}
              placeholder="Search people..."
              icon={<MagnifyingGlass class="w-4 h-4" />}
              class="flex-1"
            />
            <div class="relative flex-shrink-0">
              <Button
                variant="secondary"
                icon={<Sliders />}
                onClick={() => setFilterOpen(true)}
                class="h-12"
              >
                Filter
              </Button>
              <Show when={activeCount() > 0}>
                <span class="absolute -top-0.5 -right-1.5 w-4 h-4 bg-[var(--accent-coral)] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {activeCount()}
                </span>
              </Show>
            </div>
          </div>
          <CommunityFeed members={filtered()} />
          <CommunityFilterDialog
            open={filterOpen()}
            onOpenChange={setFilterOpen}
            filters={filters()}
            onFiltersChange={setFilters}
          />
        </div>
      )
    },
  ],
}
