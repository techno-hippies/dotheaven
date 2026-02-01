import type { Component, JSX } from 'solid-js'
import { cn } from '../lib/utils'

export type VerificationState = 'verified' | 'unverified' | 'none'

export interface VerificationBadgeProps {
  state: VerificationState
  size?: 'sm' | 'md' | 'lg'
  class?: string
}

const SIZES = {
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
  lg: 'w-7 h-7',
} as const

/** Filled seal with white checkmark — blue background */
const SealCheckIcon: Component<{ class?: string }> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 256 256"
    class={props.class}
  >
    {/* Seal body — accent blue */}
    <path
      fill="oklch(0.65 0.12 240)"
      d="M225.86,102.82c-3.77-3.94-7.67-8-9.14-11.57-1.36-3.27-1.44-8.69-1.52-13.94-.15-9.76-.31-20.82-8-28.51s-18.75-7.85-28.51-8c-5.25-.08-10.67-.16-13.94-1.52-3.56-1.47-7.63-5.37-11.57-9.14C146.28,23.51,138.44,16,128,16s-18.27,7.51-25.18,14.14c-3.94,3.77-8,7.67-11.57,9.14C88,40.64,82.56,40.72,77.31,40.8c-9.76.15-20.82.31-28.51,8S41,67.55,40.8,77.31c-.08,5.25-.16,10.67-1.52,13.94-1.47,3.56-5.37,7.63-9.14,11.57C23.51,109.72,16,117.56,16,128s7.51,18.27,14.14,25.18c3.77,3.94,7.67,8,9.14,11.57,1.36,3.27,1.44,8.69,1.52,13.94.15,9.76.31,20.82,8,28.51s18.75,7.85,28.51,8c5.25.08,10.67.16,13.94,1.52,3.56,1.47,7.63,5.37,11.57,9.14C109.72,232.49,117.56,240,128,240s18.27-7.51,25.18-14.14c3.94-3.77,8-7.67,11.57-9.14,3.27-1.36,8.69-1.44,13.94-1.52,9.76-.15,20.82-.31,28.51-8s7.85-18.75,8-28.51c.08-5.25.16-10.67,1.52-13.94,1.47-3.56,5.37-7.63,9.14-11.57C232.49,146.28,240,138.44,240,128S232.49,109.73,225.86,102.82Z"
    />
    {/* Checkmark — white */}
    <path
      fill="#ffffff"
      d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34Z"
    />
  </svg>
)

/** Warning circle duotone — yellow body, white exclamation */
const WarningIcon: Component<{ class?: string }> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 256 256"
    class={props.class}
  >
    {/* Circle body — yellow */}
    <path
      fill="#EAB308"
      d="M224,128a96,96,0,1,1-96-96A96,96,0,0,1,224,128Z"
    />
    {/* Exclamation — white */}
    <path
      fill="#ffffff"
      d="M120,136V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z"
    />
  </svg>
)

/**
 * VerificationBadge — shows verified (blue seal + white check) or unverified (amber warning).
 * `state="none"` renders nothing.
 */
export const VerificationBadge: Component<VerificationBadgeProps> = (props) => {
  const sizeClass = () => SIZES[props.size ?? 'md']

  return (
    <>
      {props.state === 'verified' && (
        <span
          class={cn('inline-flex items-center shrink-0', props.class)}
          title="Passport verified"
        >
          <SealCheckIcon class={sizeClass()} />
        </span>
      )}
      {props.state === 'unverified' && (
        <span
          class={cn('inline-flex items-center shrink-0', props.class)}
          title="Identity not verified"
        >
          <WarningIcon class={sizeClass()} />
        </span>
      )}
    </>
  )
}
