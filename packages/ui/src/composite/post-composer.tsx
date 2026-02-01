import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import { cn } from '../lib/utils'
import { Avatar } from '../primitives/avatar'
import { Button } from '../primitives/button'

export interface PostComposerProps {
  class?: string
  avatarUrl?: string
  placeholder?: string
  /** Action buttons below the input (photo, video, music, etc.) */
  onPhotoClick?: () => void
  onVideoClick?: () => void
  onMusicClick?: () => void
  onSubmit?: (text: string) => void
}

const PhotoIcon: Component = () => (
  <svg class="w-5 h-5" viewBox="0 0 256 256" fill="currentColor">
    <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM40,56H216V200H40ZM144,100a12,12,0,1,1,12,12A12,12,0,0,1,144,100Zm-2.34,77.66-24-24a8,8,0,0,0-11.32,0L40,220l0-20L98.34,142.34a8,8,0,0,1,11.32,0l24,24a8,8,0,0,0,11.32,0L197.66,116a8,8,0,0,1,11.32,0L216,122.34V200H52.69Z" />
  </svg>
)

const VideoIcon: Component = () => (
  <svg class="w-5 h-5" viewBox="0 0 256 256" fill="currentColor">
    <path d="M164.44,105.34l-48-32A8,8,0,0,0,104,80v64a8,8,0,0,0,12.44,6.66l48-32a8,8,0,0,0,0-13.32ZM120,129.05V95l25.58,17ZM216,40H40A16,16,0,0,0,24,56V168a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,128H40V56H216V168ZM232,200a8,8,0,0,1-8,8H32a8,8,0,0,1,0-16H224A8,8,0,0,1,232,200Z" />
  </svg>
)

const MusicIcon: Component = () => (
  <svg class="w-5 h-5" viewBox="0 0 256 256" fill="currentColor">
    <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V62.25l112-28v99.83A36,36,0,1,0,216,168V24A8,8,0,0,0,212.92,17.69ZM52,216a20,20,0,1,1,20-20A20,20,0,0,1,52,216Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,184Z" />
  </svg>
)

export const PostComposer: Component<PostComposerProps> = (props) => {
  let textareaRef: HTMLTextAreaElement | undefined

  const handleInput = () => {
    if (!textareaRef) return
    textareaRef.style.height = 'auto'
    textareaRef.style.height = textareaRef.scrollHeight + 'px'
  }

  return (
    <div class={cn('flex flex-col gap-3 p-4', props.class)}>
      {/* Input row */}
      <div class="flex items-start gap-3">
        <Avatar src={props.avatarUrl} size="md" shape="circle" />
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={props.placeholder ?? "What's on your mind?"}
          onInput={handleInput}
          class={cn(
            'flex-1 bg-transparent text-base text-[var(--text-primary)]',
            'placeholder:text-[var(--text-muted)] outline-none resize-none',
            'py-2',
          )}
        />
      </div>

      {/* Divider */}
      <div class="h-px bg-[var(--bg-highlight)]" />

      {/* Action row */}
      <div class="flex items-center gap-1">
        <Show when={props.onPhotoClick}>
          <button
            type="button"
            class="flex items-center gap-2 px-3 py-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-highlight)] cursor-pointer transition-colors"
            onClick={() => props.onPhotoClick?.()}
          >
            <PhotoIcon />
            <span class="text-base">Photo</span>
          </button>
        </Show>
        <Show when={props.onVideoClick}>
          <button
            type="button"
            class="flex items-center gap-2 px-3 py-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-highlight)] cursor-pointer transition-colors"
            onClick={() => props.onVideoClick?.()}
          >
            <VideoIcon />
            <span class="text-base">Video</span>
          </button>
        </Show>
        <Show when={props.onMusicClick}>
          <button
            type="button"
            class="flex items-center gap-2 px-3 py-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-highlight)] cursor-pointer transition-colors"
            onClick={() => props.onMusicClick?.()}
          >
            <MusicIcon />
            <span class="text-base">Music</span>
          </button>
        </Show>

        <div class="flex-1" />

        <Button size="sm" onClick={() => props.onSubmit?.(textareaRef?.value ?? '')}>
          Post
        </Button>
      </div>
    </div>
  )
}
