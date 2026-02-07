import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { DownloadDialog } from './download-dialog'
import { Button } from '../primitives/button'

const meta: Meta<typeof DownloadDialog> = {
  title: 'Composite/DownloadDialog',
  component: DownloadDialog,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof DownloadDialog>

export const Default: Story = {
  render: () => {
    const [open, setOpen] = createSignal(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Download App</Button>
        <DownloadDialog open={open()} onOpenChange={setOpen} />
      </>
    )
  },
}

export const Open: Story = {
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <DownloadDialog open={open()} onOpenChange={setOpen} />
    )
  },
}
