import type { Component } from 'solid-js'
import { createSignal, Show } from 'solid-js'
import { cn } from '../../lib/classnames'
import { Button } from '../../primitives/button'
import { TextField } from '../../primitives/text-field'
import { Spinner } from '../../primitives/spinner'
import { ClaimProfileCard, type ClaimProfileData } from './claim-profile-card'

// ── Types ──────────────────────────────────────────────────────────────

export type ClaimState =
  | 'loading'
  | 'profile'       // Show profile + code entry
  | 'checking'      // Verifying code...
  | 'passkey'       // Ready to create passkey
  | 'minting'       // Creating PKP
  | 'success'       // Done!
  | 'error'

export interface ClaimFlowProps {
  /** Shadow profile data (null while loading) */
  profile?: ClaimProfileData | null
  /** Current state of the claim flow */
  state: ClaimState
  /** Error message to show */
  error?: string
  /** Called when user submits their verification code */
  onSubmitCode?: (code: string) => void
  /** Called when user clicks "Create passkey" */
  onCreatePasskey?: () => void
  /** Called when user clicks "Complete your profile" on success */
  onComplete?: () => void
  /** Called to navigate home on error */
  onGoHome?: () => void
  class?: string
}

/**
 * ClaimFlow - Full claim flow UI for shadow profile handoff.
 *
 * Flow: loading → profile (enter code) → checking → passkey → minting → success
 *
 * State management is external — the parent controls `state` and handles callbacks.
 */
export const ClaimFlow: Component<ClaimFlowProps> = (props) => {
  const [code, setCode] = createSignal('')

  return (
    <div class={cn('min-h-screen flex flex-col', props.class)} style={{ background: 'var(--bg-page)' }}>
      {/* Loading */}
      <Show when={props.state === 'loading'}>
        <div class="flex-1 flex items-center justify-center">
          <div class="text-center">
            <Spinner size="lg" class="mx-auto mb-4 text-[var(--text-muted)]" />
            <p class="text-[var(--text-secondary)]">Loading your profile...</p>
          </div>
        </div>
      </Show>

      {/* Error */}
      <Show when={props.state === 'error'}>
        <div class="flex-1 flex items-center justify-center p-6">
          <div class="text-center max-w-md">
            <div class="w-16 h-16 rounded-full bg-[var(--accent-coral)]/10 flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-[var(--accent-coral)]" fill="currentColor" viewBox="0 0 256 256">
                <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm-8,56a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm8,104a12,12,0,1,1,12-12A12,12,0,0,1,128,184Z" />
              </svg>
            </div>
            <h1 class="text-2xl font-bold text-[var(--text-primary)] mb-2">Link expired</h1>
            <p class="text-[var(--text-secondary)] mb-6">
              {props.error || 'This claim link is no longer valid.'}
            </p>
            <Button variant="secondary" onClick={() => props.onGoHome?.()}>
              Go to Heaven
            </Button>
          </div>
        </div>
      </Show>

      {/* Minting PKP */}
      <Show when={props.state === 'minting'}>
        <div class="flex-1 flex items-center justify-center p-6">
          <div class="text-center max-w-md">
            <Spinner size="xl" class="mx-auto mb-4 text-[var(--accent-blue)]" />
            <h1 class="text-xl font-semibold text-[var(--text-primary)] mb-2">
              Creating your account...
            </h1>
            <p class="text-[var(--text-secondary)]">
              This takes a few seconds. Please don't close this page.
            </p>
          </div>
        </div>
      </Show>

      {/* Success */}
      <Show when={props.state === 'success'}>
        <div class="flex-1 flex items-center justify-center p-6">
          <div class="text-center max-w-md">
            <div class="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <svg class="w-10 h-10 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
              </svg>
            </div>
            <h1 class="text-3xl font-bold text-[var(--text-primary)] mb-2">
              Welcome to Heaven!
            </h1>
            <p class="text-[var(--text-secondary)] mb-6">
              Your profile is now yours.
              <Show when={(props.profile?.likesReceived ?? 0) > 0}>
                {' '}You have {props.profile!.likesReceived}{' '}
                {props.profile!.likesReceived === 1 ? 'like' : 'likes'} waiting.
              </Show>
            </p>
            <Button onClick={() => props.onComplete?.()}>
              Complete your profile
            </Button>
          </div>
        </div>
      </Show>

      {/* Main flow: profile / checking / passkey */}
      <Show when={props.profile && !['loading', 'error', 'success', 'minting'].includes(props.state)}>
        <div class="flex-1 flex flex-col items-center justify-start px-6 py-12">
          <div class="w-full max-w-md space-y-6">
            {/* Header */}
            <div class="text-center">
              <h1 class="text-2xl font-bold text-[var(--text-primary)]">
                Claim your profile
              </h1>
            </div>

            {/* Profile card */}
            <ClaimProfileCard profile={props.profile!} />

            {/* Code entry */}
            <Show when={props.state === 'profile'}>
              <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md p-6 space-y-4">
                <p class="text-base text-[var(--text-secondary)]">
                  Enter the code from your message to verify this is you.
                </p>
                <TextField
                  placeholder="HVN-XXXXXX"
                  value={code()}
                  onChange={setCode}
                />
                <Button
                  variant="default"
                  class="w-full"
                  onClick={() => props.onSubmitCode?.(code())}
                  disabled={!code().trim()}
                >
                  Verify
                </Button>
              </div>
            </Show>

            {/* Checking */}
            <Show when={props.state === 'checking'}>
              <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md p-6 text-center">
                <Spinner size="lg" class="mx-auto mb-4 text-[var(--accent-blue)]" />
                <p class="text-[var(--text-secondary)]">Verifying...</p>
              </div>
            </Show>

            {/* Passkey creation */}
            <Show when={props.state === 'passkey'}>
              <div class="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md p-6 space-y-4">
                <h2 class="font-semibold text-[var(--text-primary)]">Create your passkey</h2>
                <p class="text-base text-[var(--text-secondary)]">
                  A passkey lets you sign in securely using Face ID, fingerprint, or your device PIN.
                  No password needed.
                </p>
                <Button variant="default" class="w-full" onClick={() => props.onCreatePasskey?.()}>
                  Create passkey
                </Button>
              </div>
            </Show>

            {/* Inline error */}
            <Show when={props.error && props.state !== 'error'}>
              <p class="text-base text-[var(--accent-coral)] text-center">{props.error}</p>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
