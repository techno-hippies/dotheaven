import type { Component } from 'solid-js'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
} from '../primitives/dialog'

// ── Icons (Phosphor, 256×256) ──────────────────────────────────────

const ListMusicIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M32,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H40A8,8,0,0,1,32,64Zm8,72H160a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16Zm72,48H40a8,8,0,0,0,0,16h72a8,8,0,0,0,0-16Zm135.16-68.42-48,32A8,8,0,0,1,184,144V80a8,8,0,0,1,15.16-3.58l48,32a8,8,0,0,1,0,13.16Z" />
  </svg>
)

const MusicNoteIcon = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor">
    <path d="M210.3,56.34l-80-24A8,8,0,0,0,120,40V148.26A48,48,0,1,0,136,184V50.75l69.7,20.91a8,8,0,1,0,4.6-15.32ZM88,216a32,32,0,1,1,32-32A32,32,0,0,1,88,216Z" />
  </svg>
)

const ChevronRightIcon = () => (
  <svg class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
    <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z" />
  </svg>
)

// ── Types ──────────────────────────────────────────────────────────

export interface CreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNewPlaylist: () => void
  onPublishSong: () => void
}

// ── Component ─────────────────────────────────────────────────────

export const CreateDialog: Component<CreateDialogProps> = (props) => {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="max-w-xs">
        <DialogHeader>
          <DialogTitle>Create</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div class="flex flex-col gap-1.5">
            <button
              type="button"
              class="flex items-center gap-3 px-4 py-3 rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--bg-highlight)] transition-colors cursor-pointer text-left"
              onClick={() => {
                props.onOpenChange(false)
                props.onNewPlaylist()
              }}
            >
              <span class="w-7 h-7 flex items-center justify-center text-[var(--text-secondary)]">
                <ListMusicIcon />
              </span>
              <div class="flex flex-col min-w-0">
                <span class="text-base font-medium text-[var(--text-primary)]">New Playlist</span>
                <span class="text-base text-[var(--text-muted)]">Curate your own collection</span>
              </div>
              <span class="ml-auto text-[var(--text-muted)]">
                <ChevronRightIcon />
              </span>
            </button>

            <button
              type="button"
              class="flex items-center gap-3 px-4 py-3 rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--bg-highlight)] transition-colors cursor-pointer text-left"
              onClick={() => {
                props.onOpenChange(false)
                props.onPublishSong()
              }}
            >
              <span class="w-7 h-7 flex items-center justify-center text-[var(--text-secondary)]">
                <MusicNoteIcon />
              </span>
              <div class="flex flex-col min-w-0">
                <span class="text-base font-medium text-[var(--text-primary)]">Publish Song</span>
                <span class="text-base text-[var(--text-muted)]">Release on Story Protocol</span>
              </div>
              <span class="ml-auto text-[var(--text-muted)]">
                <ChevronRightIcon />
              </span>
            </button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
