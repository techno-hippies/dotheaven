import type { Component, JSX } from 'solid-js'
import { IconButton, PageHeader } from '@heaven/ui'
import { ChevronLeft } from '@heaven/ui/icons'

export interface MediaBackBarProps {
  title: string
  onBack: () => void
  rightSlot?: JSX.Element
  class?: string
}

/**
 * Standard sub-page back bar used by playlist, artist, and album pages.
 */
export const MediaBackBar: Component<MediaBackBarProps> = (props) => {
  return (
    <div class={`border-b border-[var(--border-subtle)] ${props.class ?? ''}`}>
      <div class="max-w-5xl mx-auto w-full">
        <PageHeader
          compact
          class="border-b-0 bg-transparent h-16 px-4 md:px-8"
          title={props.title}
          leftSlot={
            <IconButton variant="soft" size="md" aria-label="Back" onClick={props.onBack}>
              <ChevronLeft class="w-5 h-5" />
            </IconButton>
          }
          rightSlot={props.rightSlot}
        />
      </div>
    </div>
  )
}
