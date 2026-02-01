import { type Component, splitProps } from 'solid-js'
import { FileField } from '@kobalte/core/file-field'
import { cn } from '../lib/utils'

const UploadIcon = () => (
  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
)

const TrashIcon = () => (
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

export interface FileInputProps {
  /** Label text */
  label?: string
  /** Description text */
  description?: string
  /** Error message */
  errorMessage?: string
  /** Validation state */
  validationState?: 'valid' | 'invalid'
  /** Allow multiple files */
  multiple?: boolean
  /** Maximum number of files */
  maxFiles?: number
  /** Maximum file size in bytes */
  maxFileSize?: number
  /** Minimum file size in bytes */
  minFileSize?: number
  /** Accepted file types (e.g., "image/*", "audio/*", ".mp3,.wav") */
  accept?: string | string[]
  /** Allow drag and drop */
  allowDragAndDrop?: boolean
  /** Disabled state */
  disabled?: boolean
  /** Name for form submission */
  name?: string
  /** File accept callback */
  onFileAccept?: (files: File[]) => void
  /** File reject callback */
  onFileReject?: (files: any[]) => void
  /** File change callback */
  onFileChange?: (details: any) => void
  /** Custom validation function */
  validateFile?: (file: File) => any[] | null
  /** Additional class for root */
  class?: string
  /** Trigger button text */
  triggerText?: string
  /** Dropzone text */
  dropzoneText?: string
}


/**
 * FileInput - File upload component with drag-and-drop support
 *
 * Features:
 * - Single or multiple file uploads
 * - Drag and drop support
 * - File size validation
 * - File type filtering
 * - Image preview
 * - Matches Heaven design system
 */
export const FileInput: Component<FileInputProps> = (props) => {
  const [local, others] = splitProps(props, [
    'class',
    'label',
    'description',
    'errorMessage',
    'validationState',
    'triggerText',
    'dropzoneText',
  ])

  return (
    <FileField
      class={cn('flex flex-col gap-2', local.class)}
      validationState={local.validationState}
      {...others}
    >
      {local.label && (
        <FileField.Label class="text-sm font-medium text-[var(--text-primary)]">
          {local.label}
        </FileField.Label>
      )}

      <FileField.Dropzone
        class={cn(
          'relative flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-md',
          'bg-[var(--bg-highlight)] border-2 border-dashed border-[var(--bg-highlight-hover)]',
          'transition-colors cursor-pointer',
          'hover:bg-[var(--bg-highlight-hover)] hover:border-[var(--accent-blue)]/50',
          'data-[dragging]:bg-[var(--bg-highlight-hover)] data-[dragging]:border-[var(--accent-blue)]',
          'data-[invalid]:border-[var(--accent-coral)]',
          'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed'
        )}
      >
        <UploadIcon />
        <p class="text-sm text-[var(--text-secondary)] text-center">
          {local.dropzoneText || 'Drop your files here or'}
        </p>
        <FileField.Trigger
          class={cn(
            'px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer',
            'bg-[var(--accent-blue)] text-white',
            'hover:bg-[var(--accent-blue-hover)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none'
          )}
        >
          {local.triggerText || 'Choose files'}
        </FileField.Trigger>
      </FileField.Dropzone>

      <FileField.HiddenInput />

      <FileField.ItemList class="flex flex-col gap-2">
        {() => (
          <FileField.Item
            class={cn(
              'flex items-center gap-3 p-3 rounded-md',
              'bg-[var(--bg-surface)] border border-[var(--bg-highlight)]'
            )}
          >
            <FileField.ItemPreviewImage class="w-12 h-12 rounded-md object-cover bg-[var(--bg-elevated)]" />

            <div class="flex-1 min-w-0">
              <FileField.ItemName class="text-sm font-medium text-[var(--text-primary)] truncate block" />
              <FileField.ItemSize
                precision={1}
                class="text-xs text-[var(--text-muted)]"
              />
            </div>

            <FileField.ItemDeleteTrigger
              class={cn(
                'p-2 rounded-md text-[var(--text-muted)] transition-colors',
                'hover:bg-[var(--bg-highlight)] hover:text-[var(--accent-coral)]',
                'focus:outline-none focus:ring-2 focus:ring-[var(--accent-coral)]/20'
              )}
              aria-label="Remove file"
            >
              <TrashIcon />
            </FileField.ItemDeleteTrigger>
          </FileField.Item>
        )}
      </FileField.ItemList>

      {local.description && (
        <FileField.Description class="text-sm text-[var(--text-secondary)]">
          {local.description}
        </FileField.Description>
      )}

      {local.errorMessage && (
        <FileField.ErrorMessage class="text-sm text-[var(--accent-coral)]">
          {local.errorMessage}
        </FileField.ErrorMessage>
      )}
    </FileField>
  )
}
