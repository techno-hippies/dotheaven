import type { Component } from 'solid-js'
import { createSignal, createMemo, Show } from 'solid-js'
import { useIsMobile } from '../../lib/use-media-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogCloseButton,
} from '../../primitives/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '../../primitives/drawer'
import { Button } from '../../primitives/button'

export interface AddFundsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentBalance: string
  /** Current days remaining — used with balance to compute estimate for new deposits */
  daysRemaining: number | null
  /** Current balance as a number (for computing ratio) */
  balanceNum: number
  loading: boolean
  onDeposit: (amount: string) => void
}

const AddFundsDesktop: Component<AddFundsDialogProps> = (props) => {
  const [amount, setAmount] = createSignal('5.00')

  const estimateDays = createMemo(() => {
    const val = parseFloat(amount())
    if (!val || val <= 0 || !props.daysRemaining || !props.balanceNum || props.balanceNum <= 0) {
      return null
    }
    const dailyCost = props.balanceNum / props.daysRemaining
    return Math.floor(val / dailyCost)
  })

  const handleSubmit = () => {
    const val = amount().trim()
    if (!val || parseFloat(val) <= 0) return
    props.onDeposit(val)
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="!max-w-md">
        <DialogHeader>
          <DialogTitle>Add Funds</DialogTitle>
          <DialogDescription>
            Deposit USDFC to fund your Filecoin storage. Your balance covers hosting for all uploaded tracks.
          </DialogDescription>
        </DialogHeader>
        <DialogBody class="flex flex-col gap-5">
          <div class="flex items-center justify-between">
            <span class="text-base text-[var(--text-muted)]">Current balance</span>
            <span class="text-base font-semibold text-[var(--text-primary)]">{props.currentBalance}</span>
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-base font-medium text-[var(--text-secondary)]">Amount (USDFC)</label>
            <div class="flex items-center gap-2 rounded-full bg-[var(--bg-page)] border border-[var(--border-default)] px-4 h-12 focus-within:border-[var(--accent-blue)]/40 transition-colors">
              <span class="text-[var(--text-muted)] text-base">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount()}
                onInput={(e) => setAmount(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
                class="flex-1 bg-transparent border-none outline-none text-base text-[var(--text-primary)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                placeholder="0.00"
              />
            </div>
          </div>

          <Show when={estimateDays() !== null && estimateDays()! > 0}>
            <div class="flex items-center gap-2 rounded-md bg-[var(--bg-elevated)] p-3">
              <svg class="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <span class="text-xs text-[var(--text-secondary)]">
                Estimated ~{estimateDays()!.toLocaleString()} additional days of storage
              </span>
            </div>
          </Show>
        </DialogBody>
        <DialogFooter class="!justify-stretch">
          <DialogCloseButton
            as={(closeProps: any) => (
              <Button {...closeProps} variant="outline" size="md" class="flex-1">Cancel</Button>
            )}
          />
          <Button
            variant="default"
            size="md"
            class="flex-1"
            loading={props.loading}
            onClick={handleSubmit}
          >
            Deposit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const AddFundsMobile: Component<AddFundsDialogProps> = (props) => {
  const [amount, setAmount] = createSignal('5.00')

  const estimateDays = createMemo(() => {
    const val = parseFloat(amount())
    if (!val || val <= 0 || !props.daysRemaining || !props.balanceNum || props.balanceNum <= 0) {
      return null
    }
    const dailyCost = props.balanceNum / props.daysRemaining
    return Math.floor(val / dailyCost)
  })

  const handleSubmit = () => {
    const val = amount().trim()
    if (!val || parseFloat(val) <= 0) return
    props.onDeposit(val)
  }

  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange}>
      <DrawerContent
        footer={
          <Button
            variant="default"
            class="w-full"
            loading={props.loading}
            onClick={handleSubmit}
          >
            Deposit
          </Button>
        }
      >
        <DrawerHeader>
          <DrawerTitle>Add Funds</DrawerTitle>
        </DrawerHeader>

        <div class="px-5 pb-4 flex flex-col gap-5">
          <p class="text-base text-[var(--text-secondary)] leading-relaxed">
            Deposit USDFC to fund your Filecoin storage. Your balance covers hosting for all uploaded tracks.
          </p>

          <div class="flex items-center justify-between">
            <span class="text-base text-[var(--text-muted)]">Current balance</span>
            <span class="text-base font-semibold text-[var(--text-primary)]">{props.currentBalance}</span>
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-base font-medium text-[var(--text-secondary)]">Amount (USDFC)</label>
            <div class="flex items-center gap-2 rounded-full bg-[var(--bg-page)] border border-[var(--border-default)] px-4 h-12 focus-within:border-[var(--accent-blue)]/40 transition-colors">
              <span class="text-[var(--text-muted)] text-base">$</span>
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={amount()}
                onInput={(e) => setAmount(e.currentTarget.value)}
                class="flex-1 bg-transparent border-none outline-none text-base text-[var(--text-primary)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                placeholder="0.00"
              />
            </div>
          </div>

          <Show when={estimateDays() !== null && estimateDays()! > 0}>
            <div class="flex items-center gap-2 rounded-md bg-[var(--bg-elevated)] p-3">
              <svg class="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <span class="text-xs text-[var(--text-secondary)]">
                Estimated ~{estimateDays()!.toLocaleString()} additional days of storage
              </span>
            </div>
          </Show>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

export const AddFundsDialog: Component<AddFundsDialogProps> = (props) => {
  const isMobile = useIsMobile()

  return (
    <Show
      when={isMobile()}
      fallback={<AddFundsDesktop {...props} />}
    >
      <AddFundsMobile {...props} />
    </Show>
  )
}
