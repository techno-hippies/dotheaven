import type { Component } from 'solid-js'
import { createSignal } from 'solid-js'
import { Tabs } from '@heaven/ui'

export const NotificationsPage: Component = () => {
  const [activeTab, setActiveTab] = createSignal('all')

  return (
    <div class="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div class="sticky top-0 z-10 bg-[var(--bg-page)] border-b border-[var(--bg-highlight)]">
        <div class="px-4 pt-4 pb-2">
          <h1 class="text-xl font-bold text-[var(--text-primary)]">Notifications</h1>
        </div>
        <div class="px-4 pb-1">
          <Tabs
            tabs={[
              { id: 'all', label: 'All' },
              { id: 'mentions', label: 'Mentions' },
              { id: 'follows', label: 'Follows' },
            ]}
            activeTab={activeTab()}
            onTabChange={setActiveTab}
          />
        </div>
      </div>

      {/* Empty state placeholder */}
      <div class="flex-1 flex items-center justify-center px-4">
        <div class="text-center">
          <svg class="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)]" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          <p class="text-[var(--text-secondary)] text-sm">No notifications yet</p>
          <p class="text-[var(--text-muted)] text-xs mt-1">When someone interacts with you, it'll show up here</p>
        </div>
      </div>
    </div>
  )
}
