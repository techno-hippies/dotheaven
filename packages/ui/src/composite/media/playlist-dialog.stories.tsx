import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal, Show } from 'solid-js'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogCloseButton,
} from '../../primitives/dialog'
import { Button } from '../../primitives/button'
import { Spinner } from '../../primitives/spinner'
import { AlbumCover } from './album-cover'

const meta: Meta = {
  title: 'Composite/Media/PlaylistDialog',
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj

export const AddToPlaylist: Story = {
  render: () => {
    const [adding, setAdding] = createSignal<string | null>(null)
    const [showCreate, setShowCreate] = createSignal(false)
    const [newName, setNewName] = createSignal('')

    const mockPlaylists = [
      { id: '1', name: 'Late Night Vibes', trackCount: 23, coverCid: '' },
      { id: '2', name: 'Workout Mix', trackCount: 47, coverCid: '' },
      { id: '3', name: 'Focus Flow', trackCount: 12, coverCid: '' },
    ]

    const handleAdd = (id: string) => {
      setAdding(id)
      setTimeout(() => setAdding(null), 2000)
    }

    return (
      <Dialog defaultOpen>
        <DialogTrigger as={(props: any) => <Button {...props}>Add to Playlist</Button>}>
          Add to Playlist
        </DialogTrigger>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>Add to Playlist</DialogTitle>
            <DialogDescription>"4AEM" by Grimes</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Show when={!showCreate()} fallback={
              <div class="flex flex-col gap-3">
                <input
                  type="text"
                  value={newName()}
                  onInput={(e) => setNewName(e.currentTarget.value)}
                  placeholder="Playlist name"
                  class="w-full px-4 py-2.5 rounded-md bg-[var(--bg-highlight)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors"
                />
                <div class="flex gap-2">
                  <Button variant="secondary" onClick={() => setShowCreate(false)} class="flex-1">Back</Button>
                  <Button disabled={!newName().trim()} class="flex-1">Create & Add</Button>
                </div>
              </div>
            }>
              <div class="flex flex-col gap-1">
                <button
                  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-[var(--bg-highlight)] transition-colors text-left"
                  onClick={() => setShowCreate(true)}
                >
                  <div class="w-10 h-10 rounded-md bg-[var(--bg-highlight)] flex items-center justify-center text-[var(--text-muted)]">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </div>
                  <span class="text-[var(--text-primary)] font-medium">Create New Playlist</span>
                </button>

                {mockPlaylists.map((pl) => (
                  <button
                    class="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-[var(--bg-highlight)] transition-colors text-left disabled:opacity-50"
                    onClick={() => handleAdd(pl.id)}
                    disabled={adding() !== null}
                  >
                    <AlbumCover size="sm" icon="playlist" />
                    <div class="flex-1 min-w-0">
                      <p class="text-[var(--text-primary)] text-base truncate">{pl.name}</p>
                      <p class="text-[var(--text-muted)] text-xs">{pl.trackCount} songs</p>
                    </div>
                    {adding() === pl.id && (
                      <Spinner size="sm" class="text-[var(--text-muted)]" />
                    )}
                  </button>
                ))}
              </div>
            </Show>
          </DialogBody>
        </DialogContent>
      </Dialog>
    )
  },
}

export const AddToPlaylistLoading: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger as={(props: any) => <Button {...props}>Add to Playlist</Button>}>
        Add to Playlist
      </DialogTrigger>
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Playlist</DialogTitle>
          <DialogDescription>"4AEM" by Grimes</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div class="flex flex-col gap-1">
            <button class="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-[var(--bg-highlight)] transition-colors text-left">
              <div class="w-10 h-10 rounded-md bg-[var(--bg-highlight)] flex items-center justify-center text-[var(--text-muted)]">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <span class="text-[var(--text-primary)] font-medium">Create New Playlist</span>
            </button>
            <div class="px-3 py-4 flex items-center justify-center gap-2 text-[var(--text-muted)] text-base">
              <Spinner size="sm" />
              <span>Loading playlists...</span>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  ),
}

export const AddToPlaylistEmpty: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger as={(props: any) => <Button {...props}>Add to Playlist</Button>}>
        Add to Playlist
      </DialogTrigger>
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Playlist</DialogTitle>
          <DialogDescription>"4AEM" by Grimes</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div class="flex flex-col gap-1">
            <button class="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-[var(--bg-highlight)] transition-colors text-left">
              <div class="w-10 h-10 rounded-md bg-[var(--bg-highlight)] flex items-center justify-center text-[var(--text-muted)]">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <span class="text-[var(--text-primary)] font-medium">Create New Playlist</span>
            </button>
            <div class="px-3 py-4 text-center text-[var(--text-muted)] text-base">
              No playlists yet. Create one above.
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  ),
}

export const EditPlaylist: Story = {
  render: () => {
    const [title, setTitle] = createSignal('My Playlist #1')
    const [description, setDescription] = createSignal('')
    const [coverUrl, setCoverUrl] = createSignal('')

    return (
      <Dialog>
        <DialogTrigger as={(props) => <Button {...props}>Edit Playlist</Button>}>
          Edit Playlist
        </DialogTrigger>
        <DialogContent class="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Playlist</DialogTitle>
            <DialogDescription>
              Update your playlist details.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div class="flex gap-4">
              {/* Square cover image */}
              <div class="flex-shrink-0">
                <div
                  class="w-32 h-32 rounded-md bg-[var(--bg-highlight)] flex items-center justify-center cursor-pointer hover:bg-[var(--bg-highlight-hover)] transition-colors overflow-hidden"
                  onClick={() => {
                    const url = prompt('Enter image URL:')
                    if (url) setCoverUrl(url)
                  }}
                >
                  {coverUrl() ? (
                    <img src={coverUrl()} alt="Cover" class="w-full h-full object-cover" />
                  ) : (
                    <div class="text-center text-[var(--text-muted)]">
                      <svg class="w-8 h-8 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                        <path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                      </svg>
                      <span class="text-xs">Add cover</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Form fields */}
              <div class="flex-1 flex flex-col gap-3">
                <input
                  type="text"
                  value={title()}
                  onInput={(e) => setTitle(e.currentTarget.value)}
                  placeholder="Playlist name"
                  class="w-full px-4 py-2.5 rounded-md bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors"
                />
                <textarea
                  value={description()}
                  onInput={(e) => setDescription(e.currentTarget.value)}
                  placeholder="Add a description (optional)"
                  rows={3}
                  class="w-full px-4 py-2.5 rounded-md bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors resize-none"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogCloseButton
              as={(props: any) => (
                <Button {...props} variant="secondary">Cancel</Button>
              )}
            />
            <Button>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  },
}
