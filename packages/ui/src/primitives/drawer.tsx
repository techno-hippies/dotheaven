/**
 * Drawer Component for SolidJS
 * Using Corvu Drawer primitive - mobile-friendly bottom sheet with drag-to-dismiss
 *
 * Use this for mobile modals, especially those with form inputs (keyboard-safe)
 */

import Drawer from '@corvu/drawer'
import { splitProps, onMount, onCleanup, createSignal, type ParentComponent, type JSX } from 'solid-js'
import { IconButton } from './icon-button'
import { X, ChevronLeft } from '../icons'
import { cn } from '../lib/utils'

// Re-export primitives for flexibility
const DrawerRoot = Drawer
const DrawerTrigger = Drawer.Trigger
const DrawerPortal = Drawer.Portal
const DrawerClose = Drawer.Close
const useDrawerContext = Drawer.useContext

const DrawerOverlay = () => {
  const context = useDrawerContext()

  return (
    <Drawer.Overlay
      class="fixed inset-0 z-50 corvu-transitioning:transition-colors corvu-transitioning:duration-300"
      style={{
        'background-color': `rgb(0 0 0 / ${0.6 * context.openPercentage()})`,
      }}
    />
  )
}

interface DrawerContentProps {
  class?: string
  children?: JSX.Element
  /** Optional back button handler - shows caret-left in top-left */
  onBack?: () => void
  /** Show drag handle at top (default: true) */
  showHandle?: boolean
  /** Footer content that stays sticky at the bottom (outside scroll area) */
  footer?: JSX.Element
}

const DrawerContent: ParentComponent<DrawerContentProps> = (props) => {
  const [local] = splitProps(props, ['class', 'children', 'onBack', 'showHandle', 'footer'])
  const showHandle = () => local.showHandle !== false
  const context = useDrawerContext()

  // Visual viewport offset for mobile keyboard handling
  const [keyboardOffset, setKeyboardOffset] = createSignal(0)

  // Track visual viewport for mobile keyboard
  onMount(() => {
    const vv = window.visualViewport
    if (!vv) return

    const updateViewport = () => {
      // Calculate how much the viewport has shrunk (keyboard height)
      const keyboardHeight = window.innerHeight - vv.height
      // Only apply offset when keyboard is likely open (>100px difference)
      if (keyboardHeight > 100) {
        setKeyboardOffset(keyboardHeight)
      } else {
        setKeyboardOffset(0)
      }
    }

    vv.addEventListener('resize', updateViewport)
    vv.addEventListener('scroll', updateViewport)

    onCleanup(() => {
      vv.removeEventListener('resize', updateViewport)
      vv.removeEventListener('scroll', updateViewport)
    })
  })

  // Calculate translateY based on open percentage
  const translateY = () => 100 - context.openPercentage() * 100

  return (
    <DrawerPortal>
      <DrawerOverlay />
      {/* Wrapper for centering */}
      <div class="fixed inset-x-0 bottom-0 z-50 flex justify-center">
        <Drawer.Content
          class={cn(
            // Sizing - full width mobile, constrained desktop
            'w-full sm:max-w-lg',
            'max-h-[94vh]',
            // Appearance - rounded top corners only, flush to bottom
            'bg-[var(--bg-surface)] shadow-lg',
            'rounded-t-xl',
            // Border
            'border-t border-x border-[var(--bg-highlight)]',
            // Flex layout for content
            'flex flex-col',
            // Safe area for home indicator on iOS
            'pb-safe',
            // Transition - corvu adds corvu-transitioning class during animations
            'corvu-transitioning:transition-transform corvu-transitioning:duration-300 corvu-transitioning:ease-out',
            // Smooth transition when keyboard opens/closes
            'transition-[bottom] duration-200 ease-out',
            local.class
          )}
          style={{
            transform: `translateY(${translateY()}%)`,
            // Move drawer up when keyboard is open
            bottom: `${keyboardOffset()}px`,
          }}
        >
          {/* Drag handle */}
          {showHandle() && (
            <div class="flex justify-center pt-3 pb-1">
              <div class="w-10 h-1 rounded-full bg-[var(--text-muted)]/30" />
            </div>
          )}

          {/* Back button - top left (conditionally rendered) */}
          {local.onBack && (
            <IconButton
              variant="ghost"
              size="md"
              onClick={local.onBack}
              class="absolute left-3 top-3"
              aria-label="Go back"
            >
              <ChevronLeft class="w-5 h-5" />
            </IconButton>
          )}

          {/* Close button - top right */}
          <DrawerClose
            as={(closeProps: any) => (
              <IconButton
                {...closeProps}
                variant="ghost"
                size="md"
                class="absolute right-3 top-3"
                aria-label="Close"
              >
                <X class="w-5 h-5" />
              </IconButton>
            )}
          />

          {/* Content wrapper with padding - scrollable */}
          <div class="flex-1 overflow-y-auto px-6 pt-2 pb-2">
            {local.children}
          </div>

          {/* Footer - sticky at bottom, outside scroll area */}
          {local.footer && (
            <div class="px-6 pb-6 pt-2 flex-shrink-0">
              {local.footer}
            </div>
          )}
        </Drawer.Content>
      </div>
    </DrawerPortal>
  )
}

const DrawerHeader: ParentComponent<{ class?: string }> = (props) => {
  return (
    <div class={cn('flex flex-col space-y-1.5 text-center pt-4', props.class)}>
      {props.children}
    </div>
  )
}

const DrawerFooter: ParentComponent<{ class?: string }> = (props) => {
  return (
    <div class={cn('flex flex-col gap-2 mt-auto pt-4', props.class)}>
      {props.children}
    </div>
  )
}

const DrawerTitle: ParentComponent<{ class?: string }> = (props) => {
  return (
    <Drawer.Label class={cn('text-lg font-semibold leading-none tracking-tight text-[var(--text-primary)]', props.class)}>
      {props.children}
    </Drawer.Label>
  )
}

const DrawerDescription: ParentComponent<{ class?: string }> = (props) => {
  return (
    <Drawer.Description class={cn('text-sm text-[var(--text-muted)]', props.class)}>
      {props.children}
    </Drawer.Description>
  )
}

export {
  DrawerRoot as Drawer,
  DrawerTrigger,
  DrawerPortal,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
}
