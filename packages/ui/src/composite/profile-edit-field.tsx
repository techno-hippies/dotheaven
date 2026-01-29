import type { Component } from 'solid-js'
import { Switch, Match } from 'solid-js'
import { cn } from '../lib/utils'
import { TextField } from '../primitives'

export type ProfileEditFieldType = 'text' | 'number' | 'select' | 'multi-select' | 'tags'

export interface SelectOption {
  value: string
  label: string
}

export interface ProfileEditFieldProps {
  class?: string
  label: string
  value?: string | number | string[]
  type?: ProfileEditFieldType
  placeholder?: string
  options?: SelectOption[]
  disabled?: boolean
  required?: boolean
  onChange?: (value: string | number | string[]) => void
}

/**
 * ProfileEditField - Editable field for profile editing
 *
 * Supports multiple input types:
 * - text: Standard text input
 * - number: Number input for age, height, etc.
 * - select: Single-choice dropdown
 * - multi-select: Multiple choice (chips)
 * - tags: Free-form tags/chips input
 *
 * Matches the InfoCardRow layout but with form inputs
 */
export const ProfileEditField: Component<ProfileEditFieldProps> = (props) => {
  const fieldType = () => props.type ?? 'text'

  return (
    <div class={cn('flex items-center justify-between gap-4', props.class)}>
      {/* Label - matches InfoCardRow label styling */}
      <label class="text-base text-[var(--text-secondary)] min-w-[140px] flex-shrink-0">
        {props.label}
        {props.required && <span class="text-[var(--accent-coral)] ml-1">*</span>}
      </label>

      {/* Input - matches InfoCardRow value position */}
      <div class="flex-1 min-w-0">
        <Switch>
          <Match when={fieldType() === 'text'}>
            <TextField
              value={props.value as string}
              placeholder={props.placeholder}
              disabled={props.disabled}
              required={props.required}
              onChange={(val) => props.onChange?.(val)}
              inputClass="text-right"
            />
          </Match>

          <Match when={fieldType() === 'number'}>
            <input
              type="number"
              value={props.value as number}
              placeholder={props.placeholder}
              disabled={props.disabled}
              required={props.required}
              onInput={(e) => props.onChange?.(parseInt(e.currentTarget.value) || 0)}
              class={cn(
                'w-full px-4 py-2.5 rounded-lg text-right',
                'bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base',
                'placeholder:text-[var(--text-muted)] outline-none',
                'border border-transparent',
                'focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20',
                'transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            />
          </Match>

          <Match when={fieldType() === 'select'}>
            <select
              value={props.value as string}
              disabled={props.disabled}
              required={props.required}
              onChange={(e) => props.onChange?.(e.currentTarget.value)}
              class={cn(
                'w-full px-4 py-2.5 rounded-lg text-right',
                'bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base',
                'outline-none cursor-pointer',
                'border border-transparent',
                'focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20',
                'transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <option value="">Select...</option>
              {props.options?.map((opt) => (
                <option value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Match>

          <Match when={fieldType() === 'multi-select'}>
            <MultiSelectInput
              value={props.value as string[] || []}
              options={props.options || []}
              disabled={props.disabled}
              onChange={(val) => props.onChange?.(val)}
            />
          </Match>

          <Match when={fieldType() === 'tags'}>
            <TagsInput
              value={props.value as string[] || []}
              placeholder={props.placeholder}
              disabled={props.disabled}
              onChange={(val) => props.onChange?.(val)}
            />
          </Match>
        </Switch>
      </div>
    </div>
  )
}

/**
 * MultiSelectInput - Chip-based multi-select for predefined options
 */
const MultiSelectInput: Component<{
  value: string[]
  options: SelectOption[]
  disabled?: boolean
  onChange: (value: string[]) => void
}> = (props) => {
  const toggleOption = (optionValue: string) => {
    if (props.disabled) return

    const newValue = props.value.includes(optionValue)
      ? props.value.filter((v) => v !== optionValue)
      : [...props.value, optionValue]

    props.onChange(newValue)
  }

  return (
    <div class="flex flex-wrap gap-2">
      {props.options.map((opt) => {
        const isSelected = props.value.includes(opt.value)
        return (
          <button
            type="button"
            onClick={() => toggleOption(opt.value)}
            disabled={props.disabled}
            class={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              'border',
              isSelected
                ? 'bg-[var(--accent-blue)] text-white border-[var(--accent-blue)]'
                : 'bg-[var(--bg-highlight)] text-[var(--text-primary)] border-transparent hover:border-[var(--accent-blue)]',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * TagsInput - Free-form tags input with chips
 */
const TagsInput: Component<{
  value: string[]
  placeholder?: string
  disabled?: boolean
  onChange: (value: string[]) => void
}> = (props) => {
  let inputRef: HTMLInputElement | undefined

  const addTag = () => {
    if (!inputRef || props.disabled) return

    const newTag = inputRef.value.trim()
    if (newTag && !props.value.includes(newTag)) {
      props.onChange([...props.value, newTag])
      inputRef.value = ''
    }
  }

  const removeTag = (tag: string) => {
    if (props.disabled) return
    props.onChange(props.value.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  return (
    <div class="flex flex-col gap-2">
      {/* Existing tags */}
      {props.value.length > 0 && (
        <div class="flex flex-wrap gap-2">
          {props.value.map((tag) => (
            <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--accent-blue)] text-white text-sm">
              <span>{tag}</span>
              <button
                type="button"
                onClick={() => removeTag(tag)}
                disabled={props.disabled}
                class="hover:opacity-70 transition-opacity disabled:cursor-not-allowed"
              >
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input for new tags */}
      <div class="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          placeholder={props.placeholder ?? 'Add tag...'}
          disabled={props.disabled}
          onKeyDown={handleKeyDown}
          class={cn(
            'flex-1 px-4 py-2.5 rounded-lg',
            'bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base',
            'placeholder:text-[var(--text-muted)] outline-none',
            'border border-transparent',
            'focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20',
            'transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        />
        <button
          type="button"
          onClick={addTag}
          disabled={props.disabled}
          class={cn(
            'px-4 py-2.5 rounded-lg font-medium',
            'bg-[var(--accent-blue)] text-white',
            'hover:bg-[var(--accent-blue-hover)] transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          Add
        </button>
      </div>
    </div>
  )
}
