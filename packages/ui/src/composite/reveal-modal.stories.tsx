import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { RevealModal, type RevealModalProps } from './reveal-modal'
import { Button } from '../primitives/button'

const meta = {
  title: 'Composite/RevealModal',
  component: RevealModal,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    priceEth: {
      control: 'text',
      description: 'Price to reveal in ETH',
    },
    publicThumbnailUrl: {
      control: 'text',
      description: 'URL of the public (anime) thumbnail',
    },
  },
} satisfies Meta<typeof RevealModal>

export default meta
type Story = StoryObj<typeof meta>

// Interactive wrapper component
const RevealModalDemo = (props: Partial<RevealModalProps>) => {
  const [open, setOpen] = createSignal(false)

  const handleConfirm = async () => {
    // Simulate payment processing
    await new Promise((resolve) => setTimeout(resolve, 2000))
    console.log('Reveal confirmed!')
  }

  return (
    <div class="p-8">
      <Button onClick={() => setOpen(true)}>
        Open Reveal Modal
      </Button>
      <RevealModal
        publicThumbnailUrl={props.publicThumbnailUrl ?? 'https://picsum.photos/seed/anime/400/400'}
        priceEth={props.priceEth ?? '0.0001'}
        open={open()}
        onOpenChange={setOpen}
        onConfirm={handleConfirm}
        authorName={props.authorName}
      />
    </div>
  )
}

export const Default: Story = {
  render: () => <RevealModalDemo />,
}

export const CustomPrice: Story = {
  render: () => <RevealModalDemo priceEth="0.001" />,
}

export const WithAuthor: Story = {
  render: () => <RevealModalDemo authorName="alice.heaven" />,
}

// Pre-opened state for visual testing - Mobile (shows Drawer)
const PreOpenedDemo = () => {
  const [open, setOpen] = createSignal(true)

  return (
    <div class="p-8">
      <RevealModal
        publicThumbnailUrl="https://picsum.photos/seed/anime2/400/400"
        priceEth="0.0001"
        open={open()}
        onOpenChange={setOpen}
        onConfirm={async () => {
          await new Promise((resolve) => setTimeout(resolve, 1500))
        }}
      />
    </div>
  )
}

export const MobileDrawer: Story = {
  render: () => <PreOpenedDemo />,
  parameters: {
    viewport: { defaultViewport: 'mobile2' },
  },
}

// Pre-opened state for visual testing - Desktop (shows Dialog)
export const DesktopDialog: Story = {
  render: () => <PreOpenedDemo />,
  parameters: {
    viewport: { defaultViewport: 'responsive' },
  },
}
