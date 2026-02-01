import type { Component, JSX } from 'solid-js'
import { Show, Switch, Match } from 'solid-js'
import { cn } from '../lib/utils'
import { TextField, TextArea, Select, MultiSelect, PillGroup, LocationInput, type SelectOption, type MultiSelectOption, type PillOption, type LocationResult } from '../primitives'

export interface EditableInfoCardRowProps {
  class?: string
  label: string
  value?: string
  placeholder?: string
  isEditing: boolean
  isOwnProfile?: boolean
  type?: 'text' | 'select' | 'multiselect' | 'multiselectdropdown' | 'location' | 'textarea'
  options?: SelectOption[] | MultiSelectOption[] | PillOption[]
  maxLength?: number
  icon?: JSX.Element
  onValueChange?: (value: string | string[]) => void
  onLocationChange?: (location: LocationResult) => void
}

/**
 * Editable row that switches between display and edit modes
 * Facebook mid-2010s style with "+ Add" prompts for empty fields
 */
export const EditableInfoCardRow: Component<EditableInfoCardRowProps> = (props) => {
  // Use props.value directly for controlled inputs
  const getValue = () => props.value || ''

  // Get display value (convert values to labels for select/multiselectdropdown)
  const getDisplayValue = () => {
    const value = getValue()
    if (!value) return value

    // For select: convert value to label
    if (props.type === 'select' && props.options) {
      const option = (props.options as SelectOption[])?.find(opt => opt.value === value)
      return option?.label || value
    }

    // For multiselectdropdown: convert comma-separated values to labels
    if (props.type === 'multiselectdropdown' && props.options) {
      const values = value.split(', ').filter(Boolean)
      const labels = values.map(v => {
        const option = (props.options as MultiSelectOption[])?.find(opt => opt.value === v)
        return option?.label || v
      })
      return labels.join(', ')
    }

    return value
  }

  // Handle text/textarea changes
  const handleTextChange = (newValue: string) => {
    props.onValueChange?.(newValue)
  }

  // Handle select changes - Select passes SelectOption | null
  const handleSelectChange = (option: SelectOption | null) => {
    // Extract the value from the SelectOption
    if (option && typeof option === 'object' && 'value' in option) {
      props.onValueChange?.(option.value)
    } else {
      props.onValueChange?.('')
    }
  }

  // Handle location changes - LocationInput passes LocationResult
  const handleLocationChange = (location: LocationResult | null) => {
    if (location) {
      props.onLocationChange?.(location)
      // Also update value for display
      props.onValueChange?.(location.label)
    }
  }

  // Handle multiselect pill clicks
  const handlePillClick = (pillValue: string) => {
    const current = getValue().split(', ').filter(Boolean)
    const newSelected = current.includes(pillValue)
      ? current.filter(v => v !== pillValue)
      : [...current, pillValue]

    props.onValueChange?.(newSelected)
  }

  // Handle multiselectdropdown changes (array to comma-separated string)
  const handleMultiSelectDropdownChange = (values: string[]) => {
    const joinedString = values.join(', ')
    props.onValueChange?.(joinedString)
  }

  return (
    <div class={cn('flex items-center gap-3', props.class)}>
      {/* Label (always visible) */}
      <span class="text-base text-[var(--text-secondary)] min-w-[140px] flex-shrink-0 flex items-center gap-2">
        <Show when={props.icon}>
          <span class="text-[var(--text-muted)]">{props.icon}</span>
        </Show>
        {props.label}
      </span>

      {/* Value or input field */}
      <div class="flex-1 min-w-0">
        <Show when={!props.isEditing}>
          {/* Display mode */}
          <Show
            when={props.value}
            fallback={
              <Show when={props.isOwnProfile}>
                <span class="text-base text-[var(--text-muted)] italic">
                  + Add {props.label.toLowerCase()}
                </span>
              </Show>
            }
          >
            <span class="text-base text-[var(--text-primary)]">
              {getDisplayValue()}
            </span>
          </Show>
        </Show>

        <Show when={props.isEditing}>
          {/* Edit mode - use Switch/Match for mutually exclusive rendering */}
          <Switch>
            <Match when={props.type === 'textarea'}>
              <TextArea
                value={getValue()}
                onChange={handleTextChange}
                placeholder={props.placeholder || `Enter ${props.label.toLowerCase()}`}
                textAreaClass="min-h-[80px]"
              />
            </Match>

            <Match when={props.type === 'select' && props.options}>
              <Select
                value={
                  // Find the SelectOption that matches the current value
                  (props.options as SelectOption[]).find(opt => opt.value === getValue()) || undefined
                }
                onChange={handleSelectChange}
                options={props.options as SelectOption[]}
                placeholder={props.placeholder || `Select ${props.label.toLowerCase()}`}
              />
            </Match>

            <Match when={props.type === 'multiselect' && props.options}>
              <PillGroup
                options={props.options as PillOption[]}
                value={getValue().split(', ').filter(Boolean)}
                onChange={handlePillClick}
                multiple={true}
              />
            </Match>

            <Match when={props.type === 'multiselectdropdown' && props.options}>
              <MultiSelect
                options={props.options as MultiSelectOption[]}
                value={getValue().split(', ').filter(Boolean)}
                onChange={handleMultiSelectDropdownChange}
                placeholder={props.placeholder}
              />
            </Match>

            <Match when={props.type === 'location'}>
              <LocationInput
                value={null}
                onChange={handleLocationChange}
                placeholder={props.placeholder || 'Search for a city'}
              />
            </Match>

            <Match when={!props.type || props.type === 'text'}>
              <TextField
                value={getValue()}
                onChange={handleTextChange}
                placeholder={props.placeholder || `Enter ${props.label.toLowerCase()}`}
              />
            </Match>
          </Switch>
        </Show>
      </div>
    </div>
  )
}

export interface EditableInfoCardSectionProps {
  class?: string
  title: string
  isEditing: boolean
  children: JSX.Element
}

/**
 * Section container for editable info card
 */
export const EditableInfoCardSection: Component<EditableInfoCardSectionProps> = (props) => {
  return (
    <div class={cn('flex flex-col gap-4', props.class)}>
      <h2 class="text-xl font-semibold text-[var(--text-primary)]">
        {props.title}
      </h2>
      <div class="flex flex-col gap-4">
        {props.children}
      </div>
    </div>
  )
}

export interface EditableInfoCardProps {
  class?: string
  children: JSX.Element
}

/**
 * Card container for editable profile sections
 */
export const EditableInfoCard: Component<EditableInfoCardProps> = (props) => {
  return (
    <div class={cn(
      'border-b border-[var(--bg-highlight)] pb-6 flex flex-col gap-6',
      props.class
    )}>
      {props.children}
    </div>
  )
}
