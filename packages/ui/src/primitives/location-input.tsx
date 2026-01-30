import { type Component, createSignal, createEffect, onCleanup, Show } from 'solid-js'
import { Combobox } from '@kobalte/core/combobox'
import { cn } from '../lib/utils'
import { Spinner } from './spinner'

export interface LocationResult {
  provider: 'photon'
  osm_type: string
  osm_id: number
  label: string
  lat: number
  lng: number
  bbox?: [number, number, number, number]
  country_code?: string
}

export interface LocationInputProps {
  value?: LocationResult | null
  onChange: (location: LocationResult | null) => void
  placeholder?: string
  class?: string
  disabled?: boolean
  error?: string | null
}

// Simple query cache
const queryCache = new Map<string, { results: LocationResult[]; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Global throttle state
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 1000 // 1 second between requests (Nominatim policy)

// Allowed place types - city-level only (no states/countries)
const ALLOWED_TYPES = new Set([
  'city',
  'town',
  'village',
  'municipality',
  'suburb',
  'district',
  'borough',
  'neighbourhood',
])

async function searchPhoton(
  query: string,
  signal: AbortSignal
): Promise<LocationResult[]> {
  // Check cache first
  const cached = queryCache.get(query)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.results
  }

  // Enforce global throttle
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    )
  }
  lastRequestTime = Date.now()

  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '10')

  const response = await fetch(url.toString(), {
    signal,
    headers: {
      'User-Agent': 'Heaven/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(`Photon API error: ${response.status}`)
  }

  const data = await response.json()

  // Filter and normalize results
  const results: LocationResult[] = []
  for (const feature of data.features || []) {
    const props = feature.properties || {}
    const type = props.type || props.osm_value || ''

    // Filter to city/town level only
    if (!ALLOWED_TYPES.has(type)) continue

    const [lng, lat] = feature.geometry?.coordinates || [0, 0]

    // Build display label (deduplicate if name == state)
    const parts: string[] = []
    if (props.name) parts.push(props.name)
    if (props.state && props.state !== props.name) parts.push(props.state)
    if (props.country) parts.push(props.country)
    const label = parts.join(', ')

    if (!label || !lat || !lng) continue

    results.push({
      provider: 'photon',
      osm_type: props.osm_type || 'node',
      osm_id: props.osm_id || 0,
      label,
      lat,
      lng,
      bbox: feature.bbox,
      country_code: props.countrycode?.toLowerCase(),
    })

    if (results.length >= 6) break
  }

  // Cache results
  queryCache.set(query, { results, timestamp: Date.now() })

  return results
}

const MapPinIcon = () => (
  <svg class="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,206c-16.53-13-72-60.75-72-118a72,72,0,0,1,144,0C200,161.23,144.53,209,128,222Zm0-150a32,32,0,1,0,32,32A32,32,0,0,0,128,72Zm0,48a16,16,0,1,1,16-16A16,16,0,0,1,128,120Z" />
  </svg>
)

const XIcon = () => (
  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
    <path d="M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z" />
  </svg>
)

/**
 * LocationInput - Autocomplete location search using OpenStreetMap/Photon API
 *
 * Features:
 * - City-level location search (filters out states/countries)
 * - Debounced search with 300ms delay
 * - In-memory cache (5 min TTL)
 * - Global throttling (1s between requests, per Nominatim policy)
 * - Returns full LocationResult with lat/lng coordinates
 * - OSM attribution footer
 */
export const LocationInput: Component<LocationInputProps> = (props) => {
  const [query, setQuery] = createSignal('')
  const [results, setResults] = createSignal<LocationResult[]>([])
  const [isLoading, setIsLoading] = createSignal(false)
  const [isOpen, setIsOpen] = createSignal(false)
  const [searchError, setSearchError] = createSignal<string | null>(null)

  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let abortController: AbortController | undefined

  const doSearch = async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }

    // Cancel previous request
    if (abortController) {
      abortController.abort()
    }
    abortController = new AbortController()

    setIsLoading(true)
    setSearchError(null)

    try {
      const searchResults = await searchPhoton(searchQuery, abortController.signal)
      setResults(searchResults)
      if (searchResults.length > 0) {
        setIsOpen(true)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setSearchError('Search failed. Please try again.')
        console.error('Location search error:', err)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleInput = (value: string) => {
    setQuery(value)

    // Clear previous debounce
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    // Debounce search (300ms)
    debounceTimer = setTimeout(() => {
      doSearch(value)
    }, 300)
  }

  const handleSelect = (location: LocationResult | null) => {
    if (!location) {
      handleClear()
      return
    }
    setQuery(location.label)
    setResults([])
    setIsOpen(false)
    props.onChange(location)
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    setIsOpen(false)
    props.onChange(null)
  }

  // Cleanup on unmount
  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (abortController) abortController.abort()
  })

  // Sync external value with query
  createEffect(() => {
    if (props.value === null) {
      setQuery('')
    } else if (props.value && props.value.label !== query()) {
      setQuery(props.value.label)
    }
  })

  return (
    <div class={cn('relative', props.class)}>
      <Combobox<LocationResult>
        options={results()}
        optionValue={(option) => `${option.provider}:${option.osm_id}`}
        optionTextValue="label"
        optionLabel="label"
        placeholder={props.placeholder || 'e.g. Tokyo, New York, London'}
        value={props.value ?? null}
        onChange={handleSelect}
        onInputChange={handleInput}
        open={isOpen()}
        onOpenChange={setIsOpen}
        triggerMode="input"
        allowsEmptyCollection={false}
        defaultFilter={() => true}
        disabled={props.disabled}
        itemComponent={(itemProps) => (
          <Combobox.Item
            item={itemProps.item}
            class={cn(
              'px-3 py-2.5 text-left transition-colors flex items-center gap-3',
              'cursor-pointer outline-none rounded-lg',
              'data-[highlighted]:bg-[var(--bg-highlight-hover)]'
            )}
          >
            <div class="text-[var(--text-muted)] shrink-0">
              <MapPinIcon />
            </div>
            <Combobox.ItemLabel class="text-base text-[var(--text-primary)] truncate">
              {itemProps.item.rawValue.label}
            </Combobox.ItemLabel>
          </Combobox.Item>
        )}
      >
        <Combobox.Control
          class={cn(
            'flex items-center gap-3 rounded-lg bg-[var(--bg-highlight)] px-3 h-11',
            'border-2 transition-colors',
            props.error
              ? 'border-[var(--accent-coral)]'
              : 'border-transparent focus-within:border-[var(--accent-blue)]/50',
            props.disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Combobox.Input
            class="flex-1 min-w-0 bg-transparent text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            value={query()}
          />
          {/* Fixed-size container to prevent layout shift */}
          <div class="w-8 h-8 flex items-center justify-center shrink-0">
            <Show when={isLoading()}>
              <Spinner size="sm" class="text-[var(--text-muted)]" />
            </Show>
            <Show when={!isLoading() && (query() || props.value)}>
              <button
                type="button"
                onClick={handleClear}
                class="p-2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors rounded-lg"
                aria-label="Clear location"
              >
                <XIcon />
              </button>
            </Show>
          </div>
        </Combobox.Control>

        <Combobox.Portal>
          <Combobox.Content
            class={cn(
              'z-50 mt-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--bg-highlight)]',
              'shadow-xl w-[var(--kb-popper-anchor-width)] overflow-hidden'
            )}
          >
            <Combobox.Listbox class="py-1 max-h-64 overflow-y-auto" />
            {/* OSM Attribution */}
            <div class="px-3 py-1.5 bg-[var(--bg-highlight)]/50 border-t border-[var(--bg-highlight)]">
              <p class="text-xs text-[var(--text-muted)]">
                Data ©{' '}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="underline hover:text-[var(--text-secondary)] transition-colors"
                >
                  OpenStreetMap
                </a>{' '}
                contributors
              </p>
            </div>
          </Combobox.Content>
        </Combobox.Portal>
      </Combobox>

      <Show when={props.error || searchError()}>
        <span class="text-xs text-[var(--accent-coral)] mt-1 block">
          {props.error || searchError()}
        </span>
      </Show>
    </div>
  )
}
