import type { Component } from 'solid-js'
import { splitProps } from 'solid-js'
import { FileField as KFileField } from '@kobalte/core/file-field'
import type { FileRejection, Details } from '@kobalte/core/file-field'
import { cn } from '../lib/classnames'
import { Upload, X } from '../icons'

export type { FileRejection, Details }

export interface FileFieldProps {
  /** Allow multiple files */
  multiple?: boolean
  /** Max number of files */
  maxFiles?: number
  /** Accepted MIME types (e.g. "image/*", ["image/png", "image/jpeg"]) */
  accept?: string | string[]
  /** Enable drag and drop (default: true) */
  allowDragAndDrop?: boolean
  /** Max file size in bytes */
  maxFileSize?: number
  /** Label text */
  label?: string
  /** Description / helper text */
  description?: string
  /** Error message */
  errorMessage?: string
  /** Validation state */
  validationState?: 'valid' | 'invalid'
  /** Disabled */
  disabled?: boolean
  /** Dropzone placeholder text */
  placeholder?: string
  /** Trigger button text */
  triggerText?: string
  /** Called when files are accepted */
  onFileAccept?: (files: File[]) => void
  /** Called when files are rejected */
  onFileReject?: (files: FileRejection[]) => void
  /** Called when file list changes */
  onFileChange?: (details: Details) => void
  /** Custom file validator */
  validate?: (file: File) => import('@kobalte/core/file-field').FileError[] | null
  /** Container class */
  class?: string
  /** Dropzone class */
  dropzoneClass?: string
  /** Compact mode — inline strip instead of tall dropzone */
  compact?: boolean
}

export const FileField: Component<FileFieldProps> = (props) => {
  const [local, rest] = splitProps(props, [
    'multiple', 'maxFiles', 'accept', 'allowDragAndDrop', 'maxFileSize',
    'label', 'description', 'errorMessage', 'validationState', 'disabled',
    'placeholder', 'triggerText', 'onFileAccept', 'onFileReject', 'onFileChange',
    'validate', 'class', 'dropzoneClass', 'compact',
  ])

  return (
    <KFileField
      multiple={local.multiple}
      maxFiles={local.maxFiles}
      accept={local.accept}
      allowDragAndDrop={local.allowDragAndDrop ?? true}
      maxFileSize={local.maxFileSize}
      validationState={local.validationState}
      disabled={local.disabled}
      onFileAccept={local.onFileAccept}
      onFileReject={local.onFileReject}
      onFileChange={local.onFileChange}
      validate={local.validate}
      class={cn('flex flex-col gap-1.5', local.class)}
      {...rest}
    >
      {local.label && (
        <KFileField.Label class="text-base font-medium text-[var(--text-primary)]">
          {local.label}
        </KFileField.Label>
      )}

      <KFileField.Dropzone
        class={cn(
          'group flex items-center justify-center border-2 border-dashed rounded-md transition-colors cursor-pointer',
          'border-[var(--border-default)] bg-[var(--bg-elevated)]',
          'hover:border-[var(--accent-blue)]/50 hover:bg-[var(--bg-highlight)]',
          'data-[dragging=true]:border-[var(--accent-blue)] data-[dragging=true]:bg-[var(--accent-blue)]/5',
          'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
          local.compact ? 'gap-3 px-4 py-3' : 'flex-col gap-2 p-6',
          local.dropzoneClass,
        )}
      >
        <Upload class={cn('text-[var(--text-muted)] group-hover:text-[var(--accent-blue)] transition-colors', local.compact ? 'w-5 h-5' : 'w-8 h-8')} />
        <span class={cn('text-[var(--text-muted)]', local.compact ? 'text-base' : 'text-base text-center')}>
          {local.placeholder ?? 'Drop files here or'}
        </span>
        <KFileField.Trigger
          class={cn(
            'text-base font-medium text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] transition-colors cursor-pointer',
            'hover:underline',
          )}
        >
          {local.triggerText ?? 'browse'}
        </KFileField.Trigger>
      </KFileField.Dropzone>

      <KFileField.HiddenInput />

      <KFileField.ItemList class="flex flex-col gap-2">
        {(_file) => (
          <KFileField.Item class="flex items-center gap-3 px-3 py-2 rounded-md bg-[var(--bg-elevated)]">
            <KFileField.ItemPreview type="image/*">
              <KFileField.ItemPreviewImage class="w-10 h-10 rounded object-cover flex-shrink-0" />
            </KFileField.ItemPreview>
            <div class="flex-1 min-w-0 flex flex-col">
              <KFileField.ItemName class="text-base text-[var(--text-primary)] truncate" />
              <KFileField.ItemSize precision={1} class="text-xs text-[var(--text-muted)]" />
            </div>
            <KFileField.ItemDeleteTrigger
              class={cn(
                'rounded-full p-1.5 text-[var(--text-muted)] cursor-pointer transition-colors',
                'hover:text-[var(--text-primary)] hover:bg-[var(--bg-highlight)]',
              )}
            >
              <X class="w-4 h-4" />
            </KFileField.ItemDeleteTrigger>
          </KFileField.Item>
        )}
      </KFileField.ItemList>

      {local.description && (
        <KFileField.Description class="text-xs text-[var(--text-muted)]">
          {local.description}
        </KFileField.Description>
      )}

      {local.errorMessage && (
        <KFileField.ErrorMessage class="text-xs text-red-400">
          {local.errorMessage}
        </KFileField.ErrorMessage>
      )}
    </KFileField>
  )
}
