import type { Component } from 'solid-js'
import { createSignal, Match, Switch } from 'solid-js'
import { cn } from '../lib/utils'
import { Stepper } from '../primitives/stepper'
import { OnboardingNameStep, type OnboardingNameStepProps } from './onboarding-name-step'
import { OnboardingAvatarStep, type OnboardingAvatarStepProps } from './onboarding-avatar-step'
import { OnboardingBasicsStep, type OnboardingBasicsStepProps, type OnboardingBasicsData } from './onboarding-basics-step'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from './dialog'

export type OnboardingStep = 'name' | 'basics' | 'avatar' | 'complete'

export interface OnboardingFlowProps {
  class?: string
  /** Whether the dialog is open (controlled) */
  open?: boolean
  /** Called when dialog open state changes */
  onOpenChange?: (open: boolean) => void
  /** Starting step (default: 'name') */
  initialStep?: OnboardingStep
  /** Called when onboarding is complete */
  onComplete?: (data: { name: string; basics?: OnboardingBasicsData; avatarFile?: File }) => void
  /** Name step props passthrough */
  nameStepProps?: Partial<OnboardingNameStepProps>
  /** Basics step props passthrough */
  basicsStepProps?: Partial<OnboardingBasicsStepProps>
  /** Avatar step props passthrough */
  avatarStepProps?: Partial<OnboardingAvatarStepProps>
}

const STEPS: OnboardingStep[] = ['name', 'basics', 'avatar', 'complete']

/**
 * OnboardingFlow - Dialog-based onboarding that continues from auth modal.
 *
 * Steps:
 * 1. Name - Choose your .heaven name
 * 2. Basics - Age, gender, location, languages (skippable)
 * 3. Avatar - Upload a profile photo (skippable)
 * 4. Complete - brief confirmation, then auto-close
 */
export const OnboardingFlow: Component<OnboardingFlowProps> = (props) => {
  const [step, setStep] = createSignal<OnboardingStep>(props.initialStep ?? 'name')
  const [claimedName, setClaimedName] = createSignal('')
  const [basicsData, setBasicsData] = createSignal<OnboardingBasicsData | undefined>()

  const stepIndex = () => STEPS.indexOf(step())

  const title = () => {
    switch (step()) {
      case 'name': return 'Choose your name'
      case 'basics': return 'A bit about you'
      case 'avatar': return 'Add a profile photo'
      case 'complete': return "You're all set!"
    }
  }

  const subtitle = () => {
    switch (step()) {
      case 'name': return "This is your identity on Heaven. It's how people find and message you."
      case 'basics': return 'Helps us match your timezone and language preferences.'
      case 'avatar': return claimedName()
        ? `Looking good, ${claimedName()}.heaven. Add a photo so people recognize you.`
        : 'Help people recognize you.'
      case 'complete': return `Welcome to Heaven, ${claimedName()}.heaven. Your identity is secured on-chain.`
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class={cn('max-w-md', props.class)}>
        <DialogHeader>
          {/* Step indicator — 3 steps (complete has no dot) */}
          <Stepper steps={3} currentStep={stepIndex()} class="mb-2" />
          <DialogTitle>{title()}</DialogTitle>
          <DialogDescription>{subtitle()}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Switch>
            <Match when={step() === 'name'}>
              <OnboardingNameStep
                {...props.nameStepProps}
                class="gap-6"
                onClaim={async (name) => {
                  const result = await props.nameStepProps?.onClaim?.(name)
                  if (result !== false) {
                    setClaimedName(name)
                    setStep('basics')
                  }
                  return result
                }}
              />
            </Match>
            <Match when={step() === 'basics'}>
              <OnboardingBasicsStep
                {...props.basicsStepProps}
                claimedName={claimedName()}
                onContinue={async (data) => {
                  const result = await props.basicsStepProps?.onContinue?.(data)
                  if (result !== false) {
                    setBasicsData(data)
                    setStep('avatar')
                  }
                  return result
                }}
                onSkip={() => {
                  setStep('avatar')
                }}
              />
            </Match>
            <Match when={step() === 'avatar'}>
              <OnboardingAvatarStep
                {...props.avatarStepProps}
                claimedName={claimedName()}
                onUpload={async (file) => {
                  const result = await props.avatarStepProps?.onUpload?.(file)
                  if (result !== false) {
                    setStep('complete')
                    props.onComplete?.({ name: claimedName(), basics: basicsData(), avatarFile: file })
                  }
                  return result
                }}
                onSkip={() => {
                  setStep('complete')
                  props.onComplete?.({ name: claimedName(), basics: basicsData() })
                }}
              />
            </Match>
            <Match when={step() === 'complete'}>
              <div class="flex flex-col items-center gap-6 text-center py-8">
                <div class="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
                  <svg class="w-10 h-10 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                  </svg>
                </div>
              </div>
            </Match>
          </Switch>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
