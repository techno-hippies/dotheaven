import type { Component } from 'solid-js'
import { createSignal, Show } from 'solid-js'
import { useIsMobile } from '../../lib/use-media-query'
import { Drawer, DrawerContent } from '../../primitives/drawer'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from '../../primitives/dialog'
import { RadioGroup } from '../../primitives/radio-group'
import { Switch } from '../../primitives/switch'
import { Button } from '../../primitives/button'

export interface CreateRoomOptions {
  visibility: 'open' | 'private'
  aiEnabled: boolean
}

export interface CreateRoomDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGoLive?: (options: CreateRoomOptions) => void
  /** i18n labels */
  labels?: {
    createRoom?: string
    visibility?: string
    open?: string
    openDescription?: string
    private?: string
    privateDescription?: string
    aiAssistant?: string
    aiDescription?: string
    create?: string
  }
}

// ── Shared content ──────────────────────────────────────────────

const CreateRoomContent: Component<CreateRoomDrawerProps> = (props) => {
  const [visibility, setVisibility] = createSignal<string>('open')
  const [aiEnabled, setAiEnabled] = createSignal(true)

  const visibilityOptions = () => [
    { value: 'open', label: props.labels?.open ?? 'Open', description: props.labels?.openDescription ?? 'Anyone can join from Live Now' },
    { value: 'private', label: props.labels?.private ?? 'Private', description: props.labels?.privateDescription ?? 'Invite only via link' },
  ]

  const handleGoLive = () => {
    props.onGoLive?.({
      visibility: visibility() as CreateRoomOptions['visibility'],
      aiEnabled: aiEnabled(),
    })
    props.onOpenChange(false)
  }

  return (
    <div class="flex flex-col gap-6">
      <RadioGroup
        label={props.labels?.visibility ?? 'Visibility'}
        options={visibilityOptions()}
        value={visibility()}
        onChange={setVisibility}
      />

      <div class="border-t border-[var(--border-subtle)]" />

      <Switch
        label={props.labels?.aiAssistant ?? 'AI assistant'}
        description={props.labels?.aiDescription ?? 'Helps with icebreaking and translation'}
        checked={aiEnabled()}
        onChange={setAiEnabled}
      />

      <Button
        variant="default"
        size="lg"
        onClick={handleGoLive}
        class="w-full"
      >
        {props.labels?.create ?? 'Create'}
      </Button>
    </div>
  )
}

// ── Desktop dialog ──────────────────────────────────────────────

const CreateRoomDesktop: Component<CreateRoomDrawerProps> = (props) => (
  <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>{props.labels?.createRoom ?? 'Create a Room'}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <CreateRoomContent {...props} />
      </DialogBody>
    </DialogContent>
  </Dialog>
)

// ── Mobile drawer ───────────────────────────────────────────────

const CreateRoomMobile: Component<CreateRoomDrawerProps> = (props) => (
  <Drawer open={props.open} onOpenChange={props.onOpenChange}>
    <DrawerContent showHandle>
      <div class="pt-2">
        <h2 class="text-xl font-semibold text-[var(--text-primary)] mb-6">{props.labels?.createRoom ?? 'Create a Room'}</h2>
        <CreateRoomContent {...props} />
      </div>
    </DrawerContent>
  </Drawer>
)

// ── Responsive export ───────────────────────────────────────────

export const CreateRoomModal: Component<CreateRoomDrawerProps> = (props) => {
  const isMobile = useIsMobile()

  return (
    <Show
      when={isMobile()}
      fallback={<CreateRoomDesktop {...props} />}
    >
      <CreateRoomMobile {...props} />
    </Show>
  )
}

/** @deprecated Use CreateRoomModal instead */
export const CreateRoomDrawer = CreateRoomModal
