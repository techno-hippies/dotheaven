import { type Component, createSignal, createEffect, Show, Switch, Match } from 'solid-js'
import { cn } from '../../lib/classnames'
import { Button } from '../../primitives'
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
import { VerificationBadge } from './verification-badge'

export type VerifyStep = 'qr' | 'polling' | 'mirroring' | 'success' | 'error'

export interface VerifyIdentityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The Self.xyz universal link to encode as QR */
  verifyLink?: string
  /** Loading the verify link */
  linkLoading?: boolean
  /** Current step in the verification flow */
  step?: VerifyStep
  /** Error message if step is 'error' */
  errorMessage?: string
  /** Called when user wants to retry */
  onRetry?: () => void
}

/** Render QR code SVG from a URL string using the qrcode library */
function QrCode(props: { data: string; class?: string }) {
  const [svg, setSvg] = createSignal('')

  createEffect(async () => {
    if (!props.data) return
    try {
      const QRCode = await import('qrcode')
      const svgStr = await QRCode.toString(props.data, {
        type: 'svg',
        margin: 1,
        width: 240,
        color: { dark: '#171717', light: '#ffffff' },
      })
      setSvg(svgStr)
    } catch {
      setSvg('')
    }
  })

  return (
    <div
      class={cn('rounded-lg overflow-hidden', props.class)}
      innerHTML={svg()}
    />
  )
}

/** Spinner */
const Spinner: Component<{ class?: string }> = (props) => (
  <svg
    class={cn('animate-spin', props.class)}
    viewBox="0 0 24 24"
    fill="none"
  >
    <circle
      cx="12" cy="12" r="10"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      class="opacity-20"
    />
    <path
      d="M12 2a10 10 0 0 1 10 10"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
    />
  </svg>
)

/** Phosphor SealCheck icon for success */
const SealCheckLarge: Component<{ class?: string }> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" class={props.class}>
    <path
      fill="oklch(0.65 0.12 240)"
      d="M225.86,102.82c-3.77-3.94-7.67-8-9.14-11.57-1.36-3.27-1.44-8.69-1.52-13.94-.15-9.76-.31-20.82-8-28.51s-18.75-7.85-28.51-8c-5.25-.08-10.67-.16-13.94-1.52-3.56-1.47-7.63-5.37-11.57-9.14C146.28,23.51,138.44,16,128,16s-18.27,7.51-25.18,14.14c-3.94,3.77-8,7.67-11.57,9.14C88,40.64,82.56,40.72,77.31,40.8c-9.76.15-20.82.31-28.51,8S41,67.55,40.8,77.31c-.08,5.25-.16,10.67-1.52,13.94-1.47,3.56-5.37,7.63-9.14,11.57C23.51,109.72,16,117.56,16,128s7.51,18.27,14.14,25.18c3.77,3.94,7.67,8,9.14,11.57,1.36,3.27,1.44,8.69,1.52,13.94.15,9.76.31,20.82,8,28.51s18.75,7.85,28.51,8c5.25.08,10.67.16,13.94,1.52,3.56,1.47,7.63,5.37,11.57,9.14C109.72,232.49,117.56,240,128,240s18.27-7.51,25.18-14.14c3.94-3.77,8-7.67,11.57-9.14,3.27-1.36,8.69-1.44,13.94-1.52,9.76-.15,20.82-.31,28.51-8s7.85-18.75,8-28.51c.08-5.25.16-10.67,1.52-13.94,1.47-3.56,5.37-7.63,9.14-11.57C232.49,146.28,240,138.44,240,128S232.49,109.73,225.86,102.82Z"
    />
    <path
      fill="#ffffff"
      d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34Z"
    />
  </svg>
)

export const VerifyIdentityDialog: Component<VerifyIdentityDialogProps> = (props) => {
  const step = () => props.step ?? 'qr'

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="!max-w-md">
        <DialogHeader>
          <DialogTitle>Verify Your Identity</DialogTitle>
          <DialogDescription>
            <Switch>
              <Match when={step() === 'qr'}>
                Scan with the Self app to verify your passport
              </Match>
              <Match when={step() === 'polling'}>
                Waiting for verification from Self app...
              </Match>
              <Match when={step() === 'mirroring'}>
                Syncing verification to MegaETH...
              </Match>
              <Match when={step() === 'success'}>
                Your identity has been verified
              </Match>
              <Match when={step() === 'error'}>
                Verification failed
              </Match>
            </Switch>
          </DialogDescription>
        </DialogHeader>

        <DialogBody class="flex flex-col items-center gap-6 py-4">
          <Switch>
            {/* QR Code step */}
            <Match when={step() === 'qr'}>
              <Show
                when={!props.linkLoading && props.verifyLink}
                fallback={
                  <div class="w-[240px] h-[240px] rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center">
                    <Spinner class="w-8 h-8 text-[var(--text-muted)]" />
                  </div>
                }
              >
                <div class="p-3 bg-white rounded-lg">
                  <QrCode data={props.verifyLink!} />
                </div>
              </Show>

              <div class="text-center space-y-2">
                <p class="text-base text-[var(--text-secondary)]">
                  Open the <span class="font-medium text-[var(--text-primary)]">Self</span> app on your phone and scan this code
                </p>
                <a
                  href="https://self.xyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-base text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] transition-colors"
                >
                  Don't have the app? Download Self
                </a>
              </div>
            </Match>

            {/* Polling step */}
            <Match when={step() === 'polling'}>
              <div class="flex flex-col items-center gap-4 py-8">
                <Spinner class="w-12 h-12 text-[var(--accent-blue)]" />
                <p class="text-base text-[var(--text-secondary)]">
                  Complete verification in the Self app
                </p>
                <div class="flex items-center gap-2 text-base text-[var(--text-muted)]">
                  <div class="w-2 h-2 rounded-full bg-[var(--accent-blue)] animate-pulse" />
                  Listening for on-chain confirmation
                </div>
              </div>
            </Match>

            {/* Mirroring step */}
            <Match when={step() === 'mirroring'}>
              <div class="flex flex-col items-center gap-4 py-8">
                <Spinner class="w-12 h-12 text-[var(--accent-purple)]" />
                <p class="text-base text-[var(--text-secondary)]">
                  Verified on Celo, syncing to MegaETH...
                </p>
              </div>
            </Match>

            {/* Success step */}
            <Match when={step() === 'success'}>
              <div class="flex flex-col items-center gap-4 py-8">
                <SealCheckLarge class="w-20 h-20" />
                <p class="text-lg font-medium text-[var(--text-primary)]">
                  Identity Verified
                </p>
                <p class="text-base text-[var(--text-secondary)] text-center">
                  Your profile now shows a verified badge
                </p>
              </div>
            </Match>

            {/* Error step */}
            <Match when={step() === 'error'}>
              <div class="flex flex-col items-center gap-4 py-8">
                <VerificationBadge state="unverified" size="lg" class="scale-[3]" />
                <div class="mt-6" />
                <p class="text-base text-[var(--text-primary)]">
                  Something went wrong
                </p>
                <p class="text-base text-[var(--text-muted)] text-center max-w-xs">
                  {props.errorMessage ?? 'Please try again'}
                </p>
              </div>
            </Match>
          </Switch>
        </DialogBody>

        <DialogFooter>
          <Switch>
            <Match when={step() === 'qr'}>
              <DialogCloseButton
                as={(closeProps: any) => (
                  <Button {...closeProps} variant="secondary" size="md">Cancel</Button>
                )}
              />
            </Match>
            <Match when={step() === 'success'}>
              <DialogCloseButton
                as={(closeProps: any) => (
                  <Button {...closeProps} variant="default" size="md">Done</Button>
                )}
              />
            </Match>
            <Match when={step() === 'error'}>
              <DialogCloseButton
                as={(closeProps: any) => (
                  <Button {...closeProps} variant="secondary" size="md">Close</Button>
                )}
              />
              <Button variant="default" size="md" onClick={() => props.onRetry?.()}>
                Retry
              </Button>
            </Match>
          </Switch>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
