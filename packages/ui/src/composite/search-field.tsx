import { type Component } from 'solid-js'
import { Search } from '@kobalte/core/search'
import { cn } from '../lib/utils'
import { AlbumCover } from './album-cover'
import { Spinner } from '../primitives'

const SearchIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z" />
  </svg>
)

export interface SearchOption {
  id: string
  title: string
  subtitle?: string
  image?: string
  type?: 'song' | 'artist' | 'album' | 'playlist'
}

export interface SearchFieldProps {
  /** Search options to display */
  options?: SearchOption[]
  /** Placeholder text */
  placeholder?: string
  /** Change handler for search input */
  onInputChange?: (value: string) => void
  /** Selection handler */
  onChange?: (option: SearchOption | null) => void
  /** Whether suggestions are loading */
  loading?: boolean
  /** Debounce time in milliseconds */
  debounce?: number
  /** Additional class for container */
  class?: string
  /** Additional class for input */
  inputClass?: string
  /** Whether to show the dropdown inline (like command menu) */
  inline?: boolean
  /** Custom empty state message */
  emptyMessage?: string
  /** Section title (e.g., "Recent searches") */
  sectionTitle?: string
}

/**
 * SearchField - Search input with dropdown suggestions
 *
 * Features:
 * - Built with Kobalte Search component
 * - Supports images, subtitles, and verification badges
 * - Debounced input
 * - Loading state
 * - Can be inline (command menu style) or dropdown
 * - Fully accessible
 */
export const SearchField: Component<SearchFieldProps> = (props) => {
  return (
    <Search
      open={props.inline ? true : undefined}
      options={props.options || []}
      onInputChange={props.onInputChange}
      onChange={props.onChange}
      optionValue="id"
      optionLabel="title"
      placeholder={props.placeholder || 'Search...'}
      debounceOptionsMillisecond={props.debounce || 300}
      triggerMode="input"
      class={cn('relative', props.class)}
      itemComponent={(itemProps) => (
        <Search.Item
          item={itemProps.item}
          class={cn(
            'flex items-center gap-3 px-4 py-3 cursor-pointer rounded-md',
            'hover:bg-[var(--bg-highlight)] transition-colors',
            'data-[highlighted]:bg-[var(--bg-highlight)]'
          )}
        >
          {itemProps.item.rawValue.image && (
            <AlbumCover
              src={itemProps.item.rawValue.image}
              alt={itemProps.item.rawValue.title}
              size="md"
            />
          )}
          <div class="flex-1 min-w-0">
            <Search.ItemLabel class="text-base font-medium text-[var(--text-primary)] truncate">
              {itemProps.item.rawValue.title}
            </Search.ItemLabel>
            {itemProps.item.rawValue.subtitle && (
              <Search.ItemDescription class="text-sm text-[var(--text-secondary)] truncate">
                {itemProps.item.rawValue.subtitle}
              </Search.ItemDescription>
            )}
          </div>
        </Search.Item>
      )}
    >
      <Search.Control
        class={cn(
          'flex items-center gap-3 bg-[var(--bg-highlight)] rounded-md px-4 py-2.5 w-full',
          'border border-transparent',
          'focus-within:border-[var(--accent-blue)] focus-within:ring-2 focus-within:ring-[var(--accent-blue)]/20',
          'transition-colors',
          props.inputClass
        )}
      >
        <Search.Indicator
          class="flex items-center justify-center flex-shrink-0"
          loadingComponent={
            <Search.Icon class="text-[var(--text-muted)]">
              <Spinner size="sm" />
            </Search.Icon>
          }
        >
          <Search.Icon class="text-[var(--text-muted)]">
            <SearchIcon />
          </Search.Icon>
        </Search.Indicator>
        <Search.Input
          class={cn(
            'flex-1 bg-transparent text-base text-[var(--text-primary)]',
            'placeholder:text-[var(--text-muted)] outline-none'
          )}
        />
      </Search.Control>

      {props.inline ? (
        <div class="mt-2">
          {props.sectionTitle && (
            <div class="px-4 py-3">
              <h3 class="text-lg font-bold text-white">{props.sectionTitle}</h3>
            </div>
          )}
          <Search.Listbox class="space-y-1" />
          <Search.NoResult class="px-4 py-8 text-center text-[var(--text-secondary)]">
            {props.emptyMessage || 'No results found'}
          </Search.NoResult>
        </div>
      ) : (
        <Search.Portal>
          <Search.Content
            class={cn(
              'w-[var(--kb-popper-anchor-width)] mt-2',
              'bg-[var(--bg-surface)] rounded-md border border-[var(--border-default)]',
              'shadow-xl overflow-hidden',
              'data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[expanded]:zoom-in-95',
              'data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95'
            )}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {props.sectionTitle && (
              <div class="px-4 py-3 border-b border-[var(--border-default)]">
                <h3 class="text-lg font-bold text-white">{props.sectionTitle}</h3>
              </div>
            )}
            <Search.Listbox class="max-h-[400px] overflow-y-auto" />
            <Search.NoResult class="px-4 py-8 text-center text-[var(--text-secondary)]">
              {props.emptyMessage || 'No results found'}
            </Search.NoResult>
          </Search.Content>
        </Search.Portal>
      )}
    </Search>
  )
}
