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
} from './dialog'
import { Button } from '../../primitives/button'
import { Spinner } from '../../primitives/spinner'
import { AlbumCover } from '../media/album-cover'

const meta: Meta<typeof Dialog> = {
  title: 'Shared/Dialog',
  component: Dialog,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Dialog>

export const Basic: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger as={(props) => <Button {...props}>Open Dialog</Button>}>
        Open Dialog
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>About Heaven</DialogTitle>
          <DialogDescription>
            A decentralized social platform for music lovers and creators.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p class="text-[var(--text-primary)]">
            Heaven combines the best of Web3 technology with an intuitive music streaming
            experience. Share your favorite tracks, discover new music, and connect with artists
            directly.
          </p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  ),
}

export const WithFooter: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger as={(props) => <Button {...props}>Delete Track</Button>}>
        Delete Track
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Track</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this track? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const WithBodyContent: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger as={(props) => <Button {...props}>Share Track</Button>}>
        Share Track
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share Track</DialogTitle>
          <DialogDescription>
            Share this track with your friends and followers.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div class="space-y-4">
            <div class="flex items-center gap-3 p-3 bg-[var(--bg-elevated)] rounded-md">
              <div class="w-12 h-12 bg-[var(--bg-highlight)] rounded-md" />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-[var(--text-primary)] truncate">
                  Midnight Dreams
                </p>
                <p class="text-xs text-[var(--text-secondary)]">Artist Name</p>
              </div>
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-[var(--text-primary)]">
                Share via
              </label>
              <div class="flex gap-2">
                <Button variant="outline" class="flex-1">Twitter</Button>
                <Button variant="outline" class="flex-1">Discord</Button>
                <Button variant="outline" class="flex-1">Copy Link</Button>
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const Controlled: Story = {
  render: () => {
    const [open, setOpen] = createSignal(false)

    return (
      <div class="space-y-4">
        <div class="flex gap-2">
          <Button onClick={() => setOpen(true)}>Open Dialog</Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close Dialog
          </Button>
        </div>
        <p class="text-sm text-[var(--text-secondary)]">
          Dialog is currently: {open() ? 'Open' : 'Closed'}
        </p>
        <Dialog open={open()} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Controlled Dialog</DialogTitle>
              <DialogDescription>
                This dialog's open state is controlled by external buttons.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <p class="text-[var(--text-primary)]">
                You can control the dialog's open state using the buttons above,
                or close it using the X button or by clicking outside.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  },
}

export const LongContent: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger as={(props) => <Button {...props}>Terms of Service</Button>}>
        Terms of Service
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terms of Service</DialogTitle>
          <DialogDescription>
            Please read our terms of service carefully.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div class="space-y-4 text-sm text-[var(--text-primary)]">
            <section>
              <h3 class="font-semibold mb-2">1. Acceptance of Terms</h3>
              <p class="text-[var(--text-secondary)]">
                By accessing and using Heaven, you accept and agree to be bound by the terms
                and provision of this agreement.
              </p>
            </section>
            <section>
              <h3 class="font-semibold mb-2">2. Use License</h3>
              <p class="text-[var(--text-secondary)]">
                Permission is granted to temporarily download one copy of the materials
                on Heaven's platform for personal, non-commercial transitory viewing only.
              </p>
            </section>
            <section>
              <h3 class="font-semibold mb-2">3. Disclaimer</h3>
              <p class="text-[var(--text-secondary)]">
                The materials on Heaven's platform are provided on an 'as is' basis.
                Heaven makes no warranties, expressed or implied, and hereby disclaims and
                negates all other warranties.
              </p>
            </section>
            <section>
              <h3 class="font-semibold mb-2">4. Limitations</h3>
              <p class="text-[var(--text-secondary)]">
                In no event shall Heaven or its suppliers be liable for any damages
                (including, without limitation, damages for loss of data or profit, or due to
                business interruption) arising out of the use or inability to use the materials
                on Heaven's platform.
              </p>
            </section>
            <section>
              <h3 class="font-semibold mb-2">5. Revisions</h3>
              <p class="text-[var(--text-secondary)]">
                The materials appearing on Heaven's platform could include technical,
                typographical, or photographic errors. Heaven does not warrant that any of the
                materials on its platform are accurate, complete, or current.
              </p>
            </section>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button>I Agree</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const ConfirmationDialog: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger as={(props) => <Button variant="destructive" {...props}>Disconnect Wallet</Button>}>
        Disconnect Wallet
      </DialogTrigger>
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Disconnect Wallet?</DialogTitle>
          <DialogDescription>
            You will need to reconnect your wallet to access your profile and library.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive">Disconnect</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const NewChatDialog: Story = {
  render: () => {
    const [address, setAddress] = createSignal('')

    return (
      <Dialog>
        <DialogTrigger as={(props) => <Button {...props}>+ New Chat</Button>}>
          + New Chat
        </DialogTrigger>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
            <DialogDescription>
              Start a conversation with anyone on the network.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <input
              type="text"
              value={address()}
              onInput={(e) => setAddress(e.currentTarget.value)}
              placeholder="Message any ENS, .heaven, or 0x wallet address"
              class="w-full px-4 py-2.5 rounded-md bg-[var(--bg-highlight)] text-[var(--text-primary)] text-base placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-colors"
            />
          </DialogBody>
          <DialogFooter>
            <DialogCloseButton
              as={(props: any) => (
                <Button {...props} variant="secondary">Cancel</Button>
              )}
            />
            <Button disabled={!address().trim()}>Start Chat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  },
}

export const AddToPlaylistDialog: Story = {
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
            <DialogDescription>"4ÆM" by Grimes</DialogDescription>
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
                      <p class="text-[var(--text-primary)] text-sm truncate">{pl.name}</p>
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
          <DialogDescription>"4ÆM" by Grimes</DialogDescription>
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
            <div class="px-3 py-4 flex items-center justify-center gap-2 text-[var(--text-muted)] text-sm">
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
          <DialogDescription>"4ÆM" by Grimes</DialogDescription>
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
            <div class="px-3 py-4 text-center text-[var(--text-muted)] text-sm">
              No playlists yet. Create one above.
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  ),
}

export const EditPlaylistDialog: Story = {
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
