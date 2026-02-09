import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { ShareViaChatDialog, type ShareRecipient } from './share-via-chat-dialog'
import { Button } from '../primitives/button'

const meta: Meta<typeof ShareViaChatDialog> = {
  title: 'Feed/ShareViaChatDialog',
  component: ShareViaChatDialog,
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof ShareViaChatDialog>

// ── Sample data ─────────────────────────────────────────────────

const sampleRecipients: ShareRecipient[] = [
  { id: '0x1', name: 'sakura', handle: '0x1a2b...3c4d', avatarUrl: 'https://placewaifu.com/image/100', nationalityCode: 'JP' },
  { id: '0x2', name: 'miku', handle: '0x2b3c...4d5e', avatarUrl: 'https://placewaifu.com/image/101', nationalityCode: 'JP' },
  { id: '0x3', name: 'alice.eth', handle: '0x3c4d...5e6f', avatarUrl: 'https://placewaifu.com/image/102', nationalityCode: 'US' },
  { id: '0x4', name: 'bob', handle: '0x4d5e...6f7a', avatarUrl: 'https://placewaifu.com/image/103', nationalityCode: 'GB' },
  { id: '0x5', name: 'charlie', handle: '0x5e6f...7a8b', avatarUrl: 'https://placewaifu.com/image/104', nationalityCode: 'FR' },
  { id: '0x6', name: 'diana', handle: '0x6f7a...8b9c', avatarUrl: 'https://placewaifu.com/image/105', nationalityCode: 'DE' },
  { id: '0x7', name: 'eve', handle: '0x7a8b...9c0d', avatarUrl: 'https://placewaifu.com/image/106', nationalityCode: 'KR' },
  { id: '0x8', name: 'frank', handle: '0x8b9c...0d1e', avatarUrl: 'https://placewaifu.com/image/107', nationalityCode: 'BR' },
  { id: '0x9', name: 'grace', handle: '0x9c0d...1e2f', avatarUrl: 'https://placewaifu.com/image/108', nationalityCode: 'AU' },
  { id: '0xa', name: 'hiro', handle: '0x0d1e...2f3a', avatarUrl: 'https://placewaifu.com/image/109', nationalityCode: 'JP' },
]

// ── Default (open with recipients) ──────────────────────────────

export const Default: Story = {
  render: () => (
    <ShareViaChatDialog
      open={true}
      onOpenChange={() => {}}
      recipients={sampleRecipients}
      onSend={(ids) => console.log('Send to:', ids)}
    />
  ),
}

// ── Empty (no conversations) ────────────────────────────────────

export const Empty: Story = {
  render: () => (
    <ShareViaChatDialog
      open={true}
      onOpenChange={() => {}}
      recipients={[]}
      onSend={(ids) => console.log('Send to:', ids)}
    />
  ),
}

// ── Few recipients ──────────────────────────────────────────────

export const FewRecipients: Story = {
  render: () => (
    <ShareViaChatDialog
      open={true}
      onOpenChange={() => {}}
      recipients={sampleRecipients.slice(0, 3)}
      onSend={(ids) => console.log('Send to:', ids)}
    />
  ),
}

// ── Sending state ───────────────────────────────────────────────

export const Sending: Story = {
  render: () => (
    <ShareViaChatDialog
      open={true}
      onOpenChange={() => {}}
      recipients={sampleRecipients}
      onSend={() => {}}
      isSending={true}
    />
  ),
}

// ── Interactive (full demo) ─────────────────────────────────────

export const Interactive: Story = {
  render: () => {
    const [open, setOpen] = createSignal(false)
    const [sending, setSending] = createSignal(false)

    const handleSend = (ids: string[]) => {
      setSending(true)
      console.log('Sending to:', ids)
      setTimeout(() => {
        setSending(false)
        setOpen(false)
        console.log('Sent!')
      }, 1500)
    }

    return (
      <div>
        <Button onClick={() => setOpen(true)}>Share via chat</Button>
        <ShareViaChatDialog
          open={open()}
          onOpenChange={setOpen}
          recipients={sampleRecipients}
          onSend={handleSend}
          isSending={sending()}
        />
      </div>
    )
  },
}
