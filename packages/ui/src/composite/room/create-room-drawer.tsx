import type { Component } from 'solid-js'
import { createSignal } from 'solid-js'
import { Drawer, DrawerContent } from '../../primitives/drawer'
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
}

const visibilityOptions = [
  { value: 'open', label: 'Open', description: 'Anyone can join from Live Now' },
  { value: 'private', label: 'Private', description: 'Invite only via link' },
]

export const CreateRoomDrawer: Component<CreateRoomDrawerProps> = (props) => {
  const [visibility, setVisibility] = createSignal<string>('open')
  const [aiEnabled, setAiEnabled] = createSignal(true)

  const handleGoLive = () => {
    props.onGoLive?.({
      visibility: visibility() as CreateRoomOptions['visibility'],
      aiEnabled: aiEnabled(),
    })
    props.onOpenChange(false)
  }

  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange}>
      <DrawerContent showHandle>
        <div class="flex flex-col gap-6 pt-2">
          <h2 class="text-xl font-semibold text-[var(--text-primary)]">Create a Room</h2>

          <RadioGroup
            label="Visibility"
            options={visibilityOptions}
            value={visibility()}
            onChange={setVisibility}
          />

          <div class="border-t border-[var(--border-subtle)]" />

          <Switch
            label="AI assistant"
            description="Helps with icebreaking and translation"
            checked={aiEnabled()}
            onChange={setAiEnabled}
          />

          <Button
            variant="default"
            size="lg"
            onClick={handleGoLive}
            class="w-full"
          >
            Go Live
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
