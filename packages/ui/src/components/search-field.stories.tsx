import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { SearchField, type SearchOption } from './search-field'
import { createSignal } from 'solid-js'

const meta: Meta<typeof SearchField> = {
  title: 'UI/SearchField',
  component: SearchField,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof SearchField>

// Mock data matching the screenshot
const recentSearches: SearchOption[] = [
  {
    id: '1',
    title: 'No Cars Go',
    subtitle: 'Song • Arcade Fire',
    type: 'song',
  },
  {
    id: '2',
    title: 'Plastic Love',
    subtitle: 'Song • Mariya Takeuchi',
    type: 'song',
  },
  {
    id: '3',
    title: 'The Guess Who',
    subtitle: 'Artist',
    type: 'artist',
    verified: true,
  },
]

const allSongs: SearchOption[] = [
  ...recentSearches,
  {
    id: '4',
    title: 'Bohemian Rhapsody',
    subtitle: 'Song • Queen',
    type: 'song',
  },
  {
    id: '5',
    title: 'Hotel California',
    subtitle: 'Song • Eagles',
    type: 'song',
  },
  {
    id: '6',
    title: 'Radiohead',
    subtitle: 'Artist',
    type: 'artist',
    verified: true,
  },
  {
    id: '7',
    title: 'Dark Side of the Moon',
    subtitle: 'Album • Pink Floyd • 1973',
    type: 'album',
  },
  {
    id: '8',
    title: 'Fleetwood Mac',
    subtitle: 'Artist',
    type: 'artist',
    verified: true,
  },
]

export const Default: Story = {
  args: {
    placeholder: 'What do you want to play?',
    options: recentSearches,
  },
}

export const WithSectionTitle: Story = {
  args: {
    placeholder: 'What do you want to play?',
    options: recentSearches,
    sectionTitle: 'Recent searches',
  },
}

export const Loading: Story = {
  args: {
    placeholder: 'Searching...',
    options: [],
    loading: true,
  },
}

export const Empty: Story = {
  args: {
    placeholder: 'Search for songs, artists, albums...',
    options: [],
    emptyMessage: 'No results found. Try a different search.',
  },
}

export const Interactive: Story = {
  render: () => {
    const [query, setQuery] = createSignal('')
    const [selected, setSelected] = createSignal<SearchOption | null>(null)

    const filteredOptions = () => {
      if (!query()) return recentSearches
      return allSongs.filter(
        (song) =>
          song.title.toLowerCase().includes(query().toLowerCase()) ||
          song.subtitle?.toLowerCase().includes(query().toLowerCase())
      )
    }

    return (
      <div class="space-y-4">
        <SearchField
          placeholder="What do you want to play?"
          options={filteredOptions()}
          onInputChange={setQuery}
          onChange={setSelected}
          sectionTitle={query() ? 'Search results' : 'Recent searches'}
        />
        {selected() && (
          <div class="p-4 bg-[var(--bg-surface)] rounded-lg">
            <p class="text-sm text-[var(--text-secondary)] mb-1">Selected:</p>
            <p class="text-base text-[var(--text-primary)] font-medium">{selected()!.title}</p>
            {selected()!.subtitle && (
              <p class="text-sm text-[var(--text-secondary)]">{selected()!.subtitle}</p>
            )}
          </div>
        )}
      </div>
    )
  },
}

export const InlineStyle: Story = {
  render: () => {
    const [query, setQuery] = createSignal('')
    const [_selected, setSelected] = createSignal<SearchOption | null>(null)

    const filteredOptions = () => {
      if (!query()) return recentSearches
      return allSongs.filter(
        (song) =>
          song.title.toLowerCase().includes(query().toLowerCase()) ||
          song.subtitle?.toLowerCase().includes(query().toLowerCase())
      )
    }

    return (
      <div class="max-w-2xl mx-auto bg-[var(--bg-page)] p-6 rounded-lg">
        <SearchField
          inline
          placeholder="What do you want to play?"
          options={filteredOptions()}
          onInputChange={setQuery}
          onChange={setSelected}
          sectionTitle={query() ? 'Search results' : 'Recent searches'}
        />
      </div>
    )
  },
}

export const FullScreenExample: Story = {
  render: () => {
    const [query, setQuery] = createSignal('')
    const [selected, setSelected] = createSignal<SearchOption | null>(null)

    const filteredOptions = () => {
      if (!query()) return recentSearches
      return allSongs.filter(
        (song) =>
          song.title.toLowerCase().includes(query().toLowerCase()) ||
          song.subtitle?.toLowerCase().includes(query().toLowerCase())
      )
    }

    return (
      <div class="min-h-screen bg-gradient-to-b from-[var(--bg-surface)] to-black p-6">
        <div class="max-w-3xl mx-auto pt-20">
          <SearchField
            inline
            placeholder="What do you want to play?"
            options={filteredOptions()}
            onInputChange={setQuery}
            onChange={setSelected}
            sectionTitle={query() ? 'Search results' : 'Recent searches'}
            class="w-full"
          />
        </div>
      </div>
    )
  },
}

export const WithCustomDebounce: Story = {
  render: () => {
    const [query, setQuery] = createSignal('')
    const [searches, setSearches] = createSignal<string[]>([])

    const handleInputChange = (value: string) => {
      setQuery(value)
      if (value.trim()) {
        setSearches((prev) => [
          `Search triggered: "${value}" at ${new Date().toLocaleTimeString()}`,
          ...prev.slice(0, 4),
        ])
      }
    }

    return (
      <div class="space-y-4">
        <SearchField
          placeholder="Type to search (500ms debounce)..."
          options={recentSearches}
          onInputChange={handleInputChange}
          debounce={500}
        />
        {searches().length > 0 && (
          <div class="p-4 bg-[var(--bg-surface)] rounded-lg">
            <p class="text-sm font-medium text-[var(--text-primary)] mb-2">Search log:</p>
            <ul class="space-y-1">
              {searches().map((search) => (
                <li class="text-xs text-[var(--text-secondary)]">{search}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  },
}

export const DifferentTypes: Story = {
  render: () => {
    const [_query, setQuery] = createSignal('')

    const mixedOptions: SearchOption[] = [
      {
        id: '1',
        title: 'Plastic Love',
        subtitle: 'Song • Mariya Takeuchi',
        type: 'song',
      },
      {
        id: '2',
        title: 'City Pop Essentials',
        subtitle: 'Playlist • 127 songs',
        type: 'playlist',
      },
      {
        id: '3',
        title: 'Tatsuro Yamashita',
        subtitle: 'Artist',
        type: 'artist',
        verified: true,
      },
      {
        id: '4',
        title: 'For You',
        subtitle: 'Album • Tatsuro Yamashita • 1982',
        type: 'album',
      },
    ]

    return (
      <SearchField
        placeholder="Search songs, artists, albums, playlists..."
        options={mixedOptions}
        onInputChange={setQuery}
        sectionTitle="All results"
      />
    )
  },
}
