import type { Component } from 'solid-js'
import { createSignal, For, Show } from 'solid-js'
import { cn } from '../../lib/classnames'
import { Avatar } from '../../primitives/avatar'
import { AlbumCover } from '../media/album-cover'
import { IconButton } from '../../primitives/icon-button'
import { Button } from '../../primitives/button'
import { Drawer, DrawerContent } from '../../primitives/drawer'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '../../primitives/dropdown-menu'
import { Image, MusicNotes, Plus, X } from '../../icons'

// ── Song attachment types ──────────────────────────────────────────

/** A song published to Story Protocol that can be attached to a post */
export interface PublishedSong {
  ipId: string
  title: string
  artist: string
  coverUrl?: string
}

// ── Song attachment preview (based on ListItem pattern) ───────────

interface SongAttachmentProps {
  song: PublishedSong
  onRemove: () => void
}

const SongAttachment: Component<SongAttachmentProps> = (props) => (
  <div class="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--bg-elevated)]">
    <AlbumCover src={props.song.coverUrl} size="sm" />
    <div class="flex-1 min-w-0">
      <p class="text-base font-medium text-[var(--text-primary)] truncate">{props.song.title}</p>
      <p class="text-base text-[var(--text-secondary)] truncate">{props.song.artist}</p>
    </div>
    <IconButton variant="soft" size="sm" aria-label="Remove song" onClick={() => props.onRemove()}>
      <X class="w-3.5 h-3.5" />
    </IconButton>
  </div>
)

// ── Song picker dropdown ───────────────────────────────────────────

interface SongPickerProps {
  songs: PublishedSong[]
  onSelect: (song: PublishedSong) => void
  onPublishNew: () => void
  children: any
}

const SongPicker: Component<SongPickerProps> = (props) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      as={(triggerProps: Record<string, unknown>) => (
        <span {...triggerProps}>{props.children}</span>
      )}
    />
    <DropdownMenuContent class="min-w-[260px] max-h-[320px] overflow-y-auto">
      <Show when={props.songs.length > 0}>
        <For each={props.songs}>
          {(song) => (
            <DropdownMenuItem onSelect={() => props.onSelect(song)} class="gap-2.5">
              <AlbumCover src={song.coverUrl} size="xs" />
              <div class="flex-1 min-w-0">
                <p class="text-base font-medium text-[var(--text-primary)] truncate">{song.title}</p>
                <p class="text-base text-[var(--text-muted)] truncate">{song.artist}</p>
              </div>
            </DropdownMenuItem>
          )}
        </For>
        <DropdownMenuSeparator />
      </Show>
      <DropdownMenuItem onSelect={() => props.onPublishNew()} class="text-[var(--accent-blue)]">
        <Plus class="w-4 h-4" />
        Publish new song
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)

// ── Shared media preview strip ──────────────────────────────────────

interface MediaPreviewProps {
  files: File[]
  onRemove: (file: File) => void
}

const MediaPreview: Component<MediaPreviewProps> = (props) => (
  <Show when={props.files.length > 0}>
    <div class="flex gap-2 flex-wrap">
      <For each={props.files}>
        {(file) => {
          const url = URL.createObjectURL(file)
          return (
            <div class="relative group w-20 h-20 rounded-md overflow-hidden bg-[var(--bg-elevated)] flex-shrink-0">
              <img src={url} alt={file.name} class="w-full h-full object-cover" onLoad={() => URL.revokeObjectURL(url)} />
              <button
                type="button"
                class="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                onClick={() => props.onRemove(file)}
              >
                <X class="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          )
        }}
      </For>
    </div>
  </Show>
)

// ── Drag-and-drop helpers ───────────────────────────────────────────

function useDropZone(opts: { accept: string, maxFiles: number, onDrop: (files: File[]) => void }) {
  const [dragging, setDragging] = createSignal(false)

  const onDragOver = (e: DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    setDragging(true)
  }

  const onDragLeave = () => setDragging(false)

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer?.files ?? [])
    const accepted = dropped.filter((f) => f.type.startsWith('image/'))
    if (accepted.length > 0) opts.onDrop(accepted.slice(0, opts.maxFiles))
  }

  return { dragging, handlers: { onDragOver, onDragLeave, onDrop } }
}

// ── Desktop Compose Box (inline at top of feed) ────────────────────────

export interface ComposeBoxProps {
  avatarUrl?: string
  placeholder?: string
  onPost?: (text: string, media?: File[], song?: PublishedSong) => void
  /** List of user's published songs to show in the picker */
  publishedSongs?: PublishedSong[]
  /** Called when user selects "Publish new song" from the picker */
  onPublishSong?: () => void
  class?: string
  /** Max number of image attachments (default: 4) */
  maxMedia?: number
}

export const ComposeBox: Component<ComposeBoxProps> = (props) => {
  const [text, setText] = createSignal('')
  const [files, setFiles] = createSignal<File[]>([])
  const [song, setSong] = createSignal<PublishedSong | null>(null)
  let fileInputRef: HTMLInputElement | undefined

  const maxFiles = () => props.maxMedia ?? 4

  const handlePost = () => {
    const val = text().trim()
    const media = files()
    const attached = song()
    if (!val && media.length === 0 && !attached) return
    props.onPost?.(val, media.length > 0 ? media : undefined, attached ?? undefined)
    setText('')
    setFiles([])
    setSong(null)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handlePost()
    }
  }

  const addFiles = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles].slice(0, maxFiles()))
  }

  const removeFile = (file: File) => {
    setFiles((prev) => prev.filter((f) => f !== file))
  }

  const { dragging, handlers } = useDropZone({
    accept: 'image/*',
    maxFiles: maxFiles(),
    onDrop: addFiles,
  })

  return (
    <div class={cn('flex gap-3 p-4 border-b border-[var(--border-subtle)]', props.class)}>
      <Avatar src={props.avatarUrl} size="md" />
      <div class="flex-1 flex flex-col gap-2">
        <div
          {...handlers}
          class={cn(
            'w-full rounded-xl transition-colors',
            dragging() && 'bg-[var(--accent-blue)]/5 ring-1 ring-[var(--accent-blue)]/30',
          )}
        >
          <textarea
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder={props.placeholder ?? "What's on your mind?"}
            rows={3}
            class="w-full resize-none bg-transparent text-[var(--text-primary)] text-base placeholder:text-[var(--text-muted)] outline-none"
          />
        </div>

        <MediaPreview files={files()} onRemove={removeFile} />

        <Show when={song()}>
          {(s) => <SongAttachment song={s()} onRemove={() => setSong(null)} />}
        </Show>

        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1 -ml-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              class="hidden"
              onChange={(e) => {
                const picked = Array.from((e.target as HTMLInputElement).files ?? [])
                if (picked.length > 0) addFiles(picked)
                e.target.value = ''
              }}
            />
            <IconButton
              variant="soft"
              size="md"
              aria-label="Add media"
              onClick={() => fileInputRef?.click()}
            >
              <Image class="w-5 h-5" />
            </IconButton>
            <SongPicker
              songs={props.publishedSongs ?? []}
              onSelect={(s) => setSong(s)}
              onPublishNew={() => props.onPublishSong?.()}
            >
              <IconButton
                variant="soft"
                size="md"
                aria-label="Attach song"
              >
                <MusicNotes class="w-5 h-5" />
              </IconButton>
            </SongPicker>
          </div>
          <Button
            variant="default"
            size="md"
            disabled={!text().trim() && files().length === 0 && !song()}
            onClick={handlePost}
          >
            Post
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Mobile FAB (floating action button) ────────────────────────────────

export interface ComposeFabProps {
  onClick?: () => void
  class?: string
}

export const ComposeFab: Component<ComposeFabProps> = (props) => {
  return (
    <button
      type="button"
      class={cn(
        'fixed bottom-20 right-4 z-40',
        'w-14 h-14 rounded-full',
        'bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-hover)]',
        'flex items-center justify-center',
        'shadow-lg shadow-black/30',
        'transition-colors cursor-pointer',
        props.class,
      )}
      onClick={() => props.onClick?.()}
    >
      <Plus class="w-7 h-7 text-white" />
    </button>
  )
}

// ── Mobile Compose Drawer (bottom sheet) ───────────────────────────────

export interface ComposeDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  avatarUrl?: string
  placeholder?: string
  onPost?: (text: string, media?: File[], song?: PublishedSong) => void
  /** List of user's published songs to show in the picker */
  publishedSongs?: PublishedSong[]
  /** Called when user selects "Publish new song" from the picker */
  onPublishSong?: () => void
  /** Max number of image attachments (default: 4) */
  maxMedia?: number
}

export const ComposeDrawer: Component<ComposeDrawerProps> = (props) => {
  const [text, setText] = createSignal('')
  const [files, setFiles] = createSignal<File[]>([])
  const [song, setSong] = createSignal<PublishedSong | null>(null)
  let fileInputRef: HTMLInputElement | undefined

  const maxFiles = () => props.maxMedia ?? 4

  const handlePost = () => {
    const val = text().trim()
    const media = files()
    const attached = song()
    if (!val && media.length === 0 && !attached) return
    props.onPost?.(val, media.length > 0 ? media : undefined, attached ?? undefined)
    setText('')
    setFiles([])
    setSong(null)
    props.onOpenChange(false)
  }

  const addFiles = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles].slice(0, maxFiles()))
  }

  const removeFile = (file: File) => {
    setFiles((prev) => prev.filter((f) => f !== file))
  }

  const { dragging, handlers } = useDropZone({
    accept: 'image/*',
    maxFiles: maxFiles(),
    onDrop: addFiles,
  })

  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange}>
      <DrawerContent showHandle>
        <div
          {...handlers}
          class={cn(
            'w-full rounded-xl transition-colors',
            dragging() && 'bg-[var(--accent-blue)]/5 ring-1 ring-[var(--accent-blue)]/30',
          )}
        >
          <div class="flex gap-3 pt-2">
            <Avatar src={props.avatarUrl} size="md" />
            <textarea
              ref={(el) => setTimeout(() => el.focus(), 100)}
              value={text()}
              onInput={(e) => setText(e.currentTarget.value)}
              placeholder={props.placeholder ?? "What's on your mind?"}
              rows={4}
              class="w-full flex-1 resize-none bg-transparent text-[var(--text-primary)] text-base placeholder:text-[var(--text-muted)] outline-none"
            />
          </div>
        </div>

        <MediaPreview files={files()} onRemove={removeFile} />

        <Show when={song()}>
          {(s) => <SongAttachment song={s()} onRemove={() => setSong(null)} />}
        </Show>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          onChange={(e) => {
            const picked = Array.from((e.target as HTMLInputElement).files ?? [])
            if (picked.length > 0) addFiles(picked)
            e.target.value = ''
          }}
        />

        <div class="flex items-center justify-between pt-3">
          <div class="flex items-center gap-1">
            <IconButton
              variant="soft"
              size="md"
              aria-label="Add media"
              onClick={() => fileInputRef?.click()}
            >
              <Image class="w-5 h-5" />
            </IconButton>
            <SongPicker
              songs={props.publishedSongs ?? []}
              onSelect={(s) => setSong(s)}
              onPublishNew={() => props.onPublishSong?.()}
            >
              <IconButton
                variant="soft"
                size="md"
                aria-label="Attach song"
              >
                <MusicNotes class="w-5 h-5" />
              </IconButton>
            </SongPicker>
          </div>
          <Button
            variant="default"
            size="md"
            disabled={!text().trim() && files().length === 0 && !song()}
            onClick={handlePost}
          >
            Post
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
