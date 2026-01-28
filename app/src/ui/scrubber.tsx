import type { Component } from 'solid-js'
import { createSignal, onCleanup } from 'solid-js'
import { cn } from '@/lib/utils'

export interface ScrubberProps {
  class?: string
  value?: number // 0-100
  onChange?: (value: number) => void
  onChangeStart?: () => void
  onChangeEnd?: () => void
}

/**
 * Reusable scrubber/slider bar component for music player progress and volume controls.
 *
 * Features:
 * - Shows white bar by default
 * - On hover: background changes to primary blue and shows draggable dot
 * - While dragging: maintains blue color and dot
 * - Returns to white when not hovering/dragging
 */
export const Scrubber: Component<ScrubberProps> = (props) => {
  const [isHovered, setIsHovered] = createSignal(false)
  const [isDragging, setIsDragging] = createSignal(false)
  let barRef: HTMLDivElement | undefined

  const isActive = () => isHovered() || isDragging()

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    props.onChangeStart?.()
    updateValue(e)

    const handleMouseMove = (e: MouseEvent) => {
      updateValue(e)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      props.onChangeEnd?.()
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const updateValue = (e: MouseEvent) => {
    if (!barRef) return

    const rect = barRef.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const percentage = (x / rect.width) * 100

    props.onChange?.(Math.round(percentage))
  }

  const handleClick = (e: MouseEvent) => {
    if (!isDragging()) {
      updateValue(e)
    }
  }

  return (
    <div
      ref={barRef}
      class={cn(
        'relative py-2 cursor-pointer group',
        props.class
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {/* Background bar */}
      <div class="relative h-1.5 rounded-full bg-[var(--bg-highlight)] overflow-visible">
        {/* Progress fill */}
        <div
          class={cn(
            'h-full rounded-full transition-colors',
            isActive() ? 'bg-[var(--primary)]' : 'bg-white'
          )}
          style={{ width: `${props.value || 0}%` }}
        />

        {/* Draggable dot - only visible on hover or while dragging */}
        {isActive() && (
          <div
            class="absolute w-4 h-4 bg-white rounded-full shadow-md pointer-events-none"
            style={{
              left: `${props.value || 0}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)'
            }}
          />
        )}
      </div>
    </div>
  )
}
