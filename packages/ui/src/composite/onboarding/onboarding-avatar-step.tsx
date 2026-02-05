import type { Component } from 'solid-js'
import { createSignal, Show } from 'solid-js'
import { cn } from '../../lib/utils'
import { Button } from '../../primitives'

export interface OnboardingAvatarStepProps {
  class?: string
  /** The name that was just claimed */
  claimedName?: string
  /** Called when user uploads an avatar. Return false to prevent advancing. */
  onUpload?: (file: File) => Promise<boolean | void> | boolean | void
  /** Called when user imports an external avatar URL (e.g. from ENS) */
  onImportAvatar?: (uri: string) => Promise<boolean | void> | boolean | void
  /** Whether upload is in progress */
  uploading?: boolean
  /** Error message to display (e.g. style check rejection) */
  error?: string | null
  /** Pre-resolved ENS avatar URL for display */
  ensAvatar?: string | null
  /** Raw ENSIP-12 avatar record for storage (e.g. eip155:1/erc721:0x…/123) */
  ensAvatarRecord?: string | null
  /** ENS name for display */
  ensName?: string | null
}

/**
 * OnboardingAvatarStep - Second step: upload a profile photo
 *
 * Features:
 * - Drag & drop or click to upload
 * - Preview before confirming
 * - Skip option
 * - Shows claimed name context
 */
export const OnboardingAvatarStep: Component<OnboardingAvatarStepProps> = (props) => {
  const [preview, setPreview] = createSignal<string | null>(null)
  const [selectedFile, setSelectedFile] = createSignal<File | null>(null)
  const [dragOver, setDragOver] = createSignal(false)
  let fileInputRef: HTMLInputElement | undefined

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    setSelectedFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files[0]
    if (file) handleFile(file)
  }

  const handleInputChange = (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) handleFile(file)
  }

  const clearPreview = () => {
    setPreview(null)
    setSelectedFile(null)
    if (fileInputRef) fileInputRef.value = ''
  }

  return (
    <div class={cn('flex flex-col items-center gap-6 w-full', props.class)}>
      {/* Upload area */}
      <div class="flex flex-col items-center gap-4">
        <div
          class={cn(
            'w-40 h-40 rounded-full overflow-hidden cursor-pointer transition-all',
            'border-2 border-dashed',
            preview()
              ? 'border-transparent'
              : dragOver()
                ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10'
                : 'border-[var(--bg-highlight-hover)] bg-[var(--bg-elevated)] hover:border-[var(--accent-blue)]/50',
            'flex items-center justify-center'
          )}
          onClick={() => fileInputRef?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Show
            when={preview()}
            fallback={
              <div class="flex flex-col items-center gap-2 text-[var(--text-muted)]">
                <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                </svg>
                <span class="text-sm font-medium">Upload photo</span>
              </div>
            }
          >
            <img src={preview()!} alt="Preview" class="w-full h-full object-cover" />
          </Show>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          class="hidden"
          onChange={handleInputChange}
        />

        {/* Change/remove when preview exists */}
        <Show when={preview()}>
          <div class="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef?.click()}
              class="text-sm text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] transition-colors"
            >
              Change photo
            </button>
            <span class="text-[var(--text-muted)]">·</span>
            <button
              type="button"
              onClick={clearPreview}
              class="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              Remove
            </button>
          </div>
        </Show>
      </div>

      {/* ENS avatar import option */}
      <Show when={props.ensAvatar && !preview()}>
        <button
          type="button"
          class={cn(
            'flex items-center gap-3 w-full p-3 rounded-md transition-colors',
            'bg-[var(--bg-elevated)] hover:bg-[var(--bg-highlight)]',
            'text-left'
          )}
          onClick={() => {
            if (props.ensAvatar) {
              setPreview(props.ensAvatar)
              // Mark as ENS import (no file selected)
              setSelectedFile(null)
            }
          }}
        >
          <img
            src={props.ensAvatar!}
            alt="ENS avatar"
            class="w-12 h-12 rounded-full object-cover shrink-0"
          />
          <div class="min-w-0">
            <span class="text-sm font-medium text-[var(--text-primary)] block">
              Use your ENS avatar
            </span>
            <Show when={props.ensName}>
              <span class="text-xs text-[var(--text-muted)] block truncate">
                {props.ensName}
              </span>
            </Show>
          </div>
        </button>
      </Show>

      {/* Error message */}
      <Show when={props.error}>
        <div class="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--accent-coral)]/10 text-[var(--accent-coral)] text-sm w-full">
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
          </svg>
          <span>{props.error}</span>
        </div>
      </Show>

      {/* Actions */}
      <div class="w-full flex flex-col gap-3">
        <Button
          class="w-full h-12 text-lg"
          disabled={!preview() || props.uploading}
          loading={props.uploading}
          onClick={() => {
            const file = selectedFile()
            if (file) {
              props.onUpload?.(file)
            } else if (preview() && props.ensAvatar) {
              // ENS avatar import — store raw ENSIP-12 record if available, else resolved URL
              props.onImportAvatar?.(props.ensAvatarRecord || props.ensAvatar)
            }
          }}
        >
          {props.uploading ? 'Uploading...' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
