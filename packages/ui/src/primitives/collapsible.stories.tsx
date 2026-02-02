import type { Meta, StoryObj } from 'storybook-solidjs'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './collapsible'

const meta: Meta<typeof Collapsible> = {
  title: 'Primitives/Collapsible',
  component: Collapsible,
  decorators: [
    (Story) => (
      <div class="p-6 bg-[var(--bg-page)] min-h-[200px] w-80">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof Collapsible>

export const Default: Story = {
  render: () => (
    <Collapsible defaultOpen>
      <CollapsibleTrigger class="flex items-center justify-between w-full px-3 py-2 rounded-md text-[var(--text-primary)]">
        <span>Uploads (3)</span>
        <svg
          class="w-4 h-4 text-[var(--text-muted)] transition-transform group-data-[expanded]:rotate-180"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </CollapsibleTrigger>
      <CollapsibleContent class="mt-1">
        <div class="px-3 py-2 text-[var(--text-secondary)]">
          Content goes here
        </div>
      </CollapsibleContent>
    </Collapsible>
  ),
}

export const Collapsed: Story = {
  render: () => (
    <Collapsible>
      <CollapsibleTrigger class="flex items-center justify-between w-full px-3 py-2 rounded-md text-[var(--text-primary)]">
        <span>Click to expand</span>
        <svg
          class="w-4 h-4 text-[var(--text-muted)] transition-transform group-data-[expanded]:rotate-180"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div class="px-3 py-2 text-[var(--text-secondary)]">
          Hidden content revealed!
        </div>
      </CollapsibleContent>
    </Collapsible>
  ),
}
