/**
 * RevealModal - Responsive modal for unlocking/revealing original photos
 *
 * Shows payment flow for pay-per-view reveal of original photos (behind anime conversion).
 * Uses Drawer on mobile for native bottom sheet experience, Dialog on desktop.
 */

import { type Component, Show, createSignal } from 'solid-js'
import { useIsMobile } from '../lib/use-media-query'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '../primitives/drawer'
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogCloseButton,
} from './dialog'
import { Button } from '../primitives/button'
import { LockSimple, ArrowClockwise, Image, Sparkle, ArrowRight } from '../icons'

export interface RevealModalProps {
  /** Public (anime) version thumbnail URL */
  publicThumbnailUrl: string
  /** Price to reveal in ETH (e.g. "0.0001") */
  priceEth: string
  /** Whether the modal is open */
  open: boolean
  /** Called when open state changes */
  onOpenChange: (open: boolean) => void
  /** Called when user confirms reveal payment */
  onConfirm?: () => Promise<void>
  /** Optional: Author name for attribution */
  authorName?: string
}

export const RevealModal: Component<RevealModalProps> = (props) => {
  const isMobile = useIsMobile()
  const [isLoading, setIsLoading] = createSignal(false)

  const handleReveal = async () => {
    if (!props.onConfirm) return
    setIsLoading(true)
    try {
      await props.onConfirm()
      props.onOpenChange(false)
    } finally {
      setIsLoading(false)
    }
  }

  const revealButton = () => (
    <Button
      class="w-full"
      size="lg"
      onClick={handleReveal}
      disabled={isLoading()}
      loading={isLoading()}
    >
      <Show when={!isLoading()} fallback={<span>Processing...</span>}>
        <LockSimple class="w-5 h-5 mr-2" />
        Reveal for {props.priceEth} ETH
      </Show>
    </Button>
  )

  const content = () => (
    <div class="py-6 space-y-6">
      {/* Preview comparison */}
      <div class="flex gap-4 justify-center items-center">
        {/* Public version thumbnail */}
        <div class="flex flex-col items-center gap-2">
          <div class="w-24 h-24 rounded-md overflow-hidden border border-[var(--bg-highlight)]">
            <img
              src={props.publicThumbnailUrl}
              alt="Public version"
              class="w-full h-full object-cover"
            />
          </div>
          <span class="text-base text-[var(--text-muted)]">Anime</span>
        </div>

        {/* Arrow */}
        <div class="flex items-center text-[var(--text-muted)]">
          <ArrowRight class="w-5 h-5" />
        </div>

        {/* Original version (blurred placeholder) */}
        <div class="flex flex-col items-center gap-2">
          <div class="w-24 h-24 rounded-md overflow-hidden border border-[var(--bg-highlight)] relative">
            <img
              src={props.publicThumbnailUrl}
              alt="Original version"
              class="w-full h-full object-cover blur-md scale-110"
            />
            <div class="absolute inset-0 flex items-center justify-center">
              <LockSimple class="w-8 h-8 text-white drop-shadow-md" />
            </div>
          </div>
          <span class="text-base text-[var(--text-muted)]">Original</span>
        </div>
      </div>

      {/* Features */}
      <div class="space-y-3">
        <Feature
          icon={ArrowClockwise}
          title="24-hour access"
          description="View the original anytime within 24 hours"
        />
        <Feature
          icon={Image}
          title="Watermarked to you"
          description="Original includes your wallet address"
        />
        <Feature
          icon={Sparkle}
          title="Full resolution"
          description="See the unfiltered original content"
        />
      </div>

      {/* Charity note */}
      <p class="text-base text-center text-[var(--text-muted)]">
        100% of reveal fees go to charity
      </p>
    </div>
  )

  return (
    <Show
      when={isMobile()}
      fallback={
        // Desktop: Dialog
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
          <DialogPortal>
            <DialogOverlay />
            <DialogContent class="max-w-md">
              <DialogHeader>
                <DialogTitle>Reveal Original</DialogTitle>
                <DialogDescription>
                  Get 24-hour access to the original photo
                </DialogDescription>
                <DialogCloseButton />
              </DialogHeader>
              <DialogBody>
                {content()}
              </DialogBody>
              <DialogFooter>
                {revealButton()}
              </DialogFooter>
            </DialogContent>
          </DialogPortal>
        </Dialog>
      }
    >
      {/* Mobile: Drawer */}
      <Drawer open={props.open} onOpenChange={props.onOpenChange}>
        <DrawerContent
          showHandle
          footer={revealButton()}
        >
          <DrawerHeader>
            <DrawerTitle>Reveal Original</DrawerTitle>
            <DrawerDescription>
              Get 24-hour access to the original photo
            </DrawerDescription>
          </DrawerHeader>
          {content()}
        </DrawerContent>
      </Drawer>
    </Show>
  )
}

const Feature: Component<{
  icon: Component<{ class?: string }>
  title: string
  description: string
}> = (props) => (
  <div class="flex items-start gap-3">
    <div class="w-8 h-8 rounded-full bg-[var(--accent-blue)]/10 flex items-center justify-center flex-shrink-0">
      <props.icon class="w-4 h-4 text-[var(--accent-blue)]" />
    </div>
    <div>
      <p class="font-medium text-base text-[var(--text-primary)]">{props.title}</p>
      <p class="text-base text-[var(--text-muted)]">{props.description}</p>
    </div>
  </div>
)

export default RevealModal
