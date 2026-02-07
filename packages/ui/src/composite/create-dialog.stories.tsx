import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { CreateDialog } from './create-dialog'
import { Button } from '../primitives/button'

const meta: Meta<typeof CreateDialog> = {
  title: 'Composite/CreateDialog',
  component: CreateDialog,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof CreateDialog>

export const Default: Story = {
  render: () => {
    const [open, setOpen] = createSignal(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>+ Create</Button>
        <CreateDialog
          open={open()}
          onOpenChange={setOpen}
          onNewPlaylist={() => console.log('New Playlist')}
          onPublishSong={() => console.log('Publish Song')}
        />
      </>
    )
  },
}

export const Open: Story = {
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <CreateDialog
        open={open()}
        onOpenChange={setOpen}
        onNewPlaylist={() => console.log('New Playlist')}
        onPublishSong={() => console.log('Publish Song')}
      />
    )
  },
}
