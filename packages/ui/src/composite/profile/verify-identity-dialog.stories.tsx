import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { VerifyIdentityDialog, type VerifyStep } from './verify-identity-dialog'
import { Button } from '../../primitives'

const meta = {
  title: 'Profile/VerifyIdentityDialog',
  component: VerifyIdentityDialog,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
} satisfies Meta<typeof VerifyIdentityDialog>

export default meta
type Story = StoryObj<typeof meta>

/** QR code step — user sees the QR to scan */
export const QrCode: Story = {
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Verify Dialog</Button>
        <VerifyIdentityDialog
          open={open()}
          onOpenChange={setOpen}
          verifyLink="https://self.xyz/verify?app=heaven&scope=passport&endpoint=0x872E8E7E4a4088F41CeB0ccc14a7081D36aF5aa4&userId=0x089fc7801D8f7D487765343a7946b1b97A7d29D4"
          step="qr"
        />
      </>
    )
  },
}

/** Loading state while generating the verify link */
export const LinkLoading: Story = {
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Verify Dialog</Button>
        <VerifyIdentityDialog
          open={open()}
          onOpenChange={setOpen}
          linkLoading={true}
          step="qr"
        />
      </>
    )
  },
}

/** Polling step — waiting for on-chain confirmation */
export const Polling: Story = {
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Verify Dialog</Button>
        <VerifyIdentityDialog
          open={open()}
          onOpenChange={setOpen}
          step="polling"
        />
      </>
    )
  },
}

/** Mirroring step — syncing Celo to MegaETH */
export const Mirroring: Story = {
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Verify Dialog</Button>
        <VerifyIdentityDialog
          open={open()}
          onOpenChange={setOpen}
          step="mirroring"
        />
      </>
    )
  },
}

/** Success step */
export const Success: Story = {
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Verify Dialog</Button>
        <VerifyIdentityDialog
          open={open()}
          onOpenChange={setOpen}
          step="success"
        />
      </>
    )
  },
}

/** Error step */
export const Error: Story = {
  render: () => {
    const [open, setOpen] = createSignal(true)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Verify Dialog</Button>
        <VerifyIdentityDialog
          open={open()}
          onOpenChange={setOpen}
          step="error"
          errorMessage="Transaction reverted: insufficient gas"
          onRetry={() => alert('Retry clicked')}
        />
      </>
    )
  },
}

/** Interactive demo — walk through all steps */
export const FullFlow: Story = {
  render: () => {
    const [open, setOpen] = createSignal(true)
    const [step, setStep] = createSignal<VerifyStep>('qr')

    const advanceStep = () => {
      const steps: VerifyStep[] = ['qr', 'polling', 'mirroring', 'success']
      const idx = steps.indexOf(step())
      if (idx < steps.length - 1) setStep(steps[idx + 1])
    }

    return (
      <div class="flex flex-col items-center gap-4">
        <Button onClick={() => { setStep('qr'); setOpen(true) }}>Open Verify Dialog</Button>
        <div class="flex gap-2">
          <Button variant="secondary" size="sm" onClick={advanceStep}>
            Advance Step
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setStep('error')}>
            Simulate Error
          </Button>
        </div>
        <p class="text-sm text-[var(--text-muted)]">Current: {step()}</p>
        <VerifyIdentityDialog
          open={open()}
          onOpenChange={setOpen}
          verifyLink="https://self.xyz/verify?app=heaven&scope=passport&endpoint=0x872E8E7E4a4088F41CeB0ccc14a7081D36aF5aa4"
          step={step()}
          errorMessage="Transaction reverted: nonce too low"
          onRetry={() => setStep('qr')}
        />
      </div>
    )
  },
}
