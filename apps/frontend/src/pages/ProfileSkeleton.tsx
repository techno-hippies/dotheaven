import type { Component } from 'solid-js'

export const ProfileSkeleton: Component = () => (
  <div class="bg-[var(--bg-page)] min-h-screen animate-pulse">
    {/* Banner */}
    <div class="h-48 w-full bg-[var(--bg-elevated)]" />
    <div class="px-8 pb-6">
      {/* Avatar */}
      <div class="-mt-20 mb-4">
        <div class="w-28 h-28 rounded-full bg-[var(--bg-highlight)]" />
      </div>
      {/* Name */}
      <div class="mb-4">
        <div class="h-7 w-48 bg-[var(--bg-highlight)] rounded-md mb-2" />
        <div class="h-5 w-32 bg-[var(--bg-elevated)] rounded-md" />
      </div>
      {/* Stats */}
      <div class="flex gap-6">
        <div class="h-5 w-24 bg-[var(--bg-elevated)] rounded-md" />
        <div class="h-5 w-24 bg-[var(--bg-elevated)] rounded-md" />
        <div class="h-5 w-24 bg-[var(--bg-elevated)] rounded-md" />
      </div>
    </div>
    {/* Tabs */}
    <div class="flex gap-6 px-8 border-b border-[var(--border-subtle)]">
      <div class="h-10 w-20 bg-[var(--bg-elevated)] rounded-md" />
      <div class="h-10 w-20 bg-[var(--bg-elevated)] rounded-md" />
      <div class="h-10 w-20 bg-[var(--bg-elevated)] rounded-md" />
    </div>
  </div>
)
