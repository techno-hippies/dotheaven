import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { Stepper } from './stepper'
import { Button } from './button'

const meta = {
  title: 'Primitives/Stepper',
  component: Stepper,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
      values: [{ name: 'dark', value: '#171717' }],
    },
  },
  tags: ['autodocs'],
  argTypes: {
    currentStep: {
      control: { type: 'number', min: 0, max: 4 },
    },
    steps: {
      control: { type: 'number', min: 2, max: 10 },
    },
  },
} satisfies Meta<typeof Stepper>

export default meta
type Story = StoryObj<typeof meta>

export const ThreeSteps: Story = {
  args: {
    steps: 3,
    currentStep: 0,
  },
}

export const FiveSteps: Story = {
  args: {
    steps: 5,
    currentStep: 2,
  },
}

export const Completed: Story = {
  name: 'All Steps Completed',
  args: {
    steps: 4,
    currentStep: 4,
  },
}

export const Interactive: Story = {
  name: 'Interactive Demo',
  render: () => {
    const [currentStep, setCurrentStep] = createSignal(0)
    const totalSteps = 4

    const handleNext = () => {
      if (currentStep() < totalSteps) {
        setCurrentStep(currentStep() + 1)
      }
    }

    const handlePrev = () => {
      if (currentStep() > 0) {
        setCurrentStep(currentStep() - 1)
      }
    }

    const handleReset = () => {
      setCurrentStep(0)
    }

    return (
      <div class="flex flex-col items-center gap-6">
        <Stepper steps={totalSteps} currentStep={currentStep()} />

        <div class="flex gap-3">
          <Button
            onClick={handlePrev}
            disabled={currentStep() === 0}
            variant="secondary"
          >
            Previous
          </Button>
          <Button
            onClick={handleNext}
            disabled={currentStep() >= totalSteps}
          >
            {currentStep() === totalSteps ? 'Complete' : 'Next'}
          </Button>
        </div>

        <Button onClick={handleReset} variant="secondary">
          Reset
        </Button>

        <p class="text-[var(--text-secondary)] text-sm">
          Step {currentStep()} of {totalSteps}
        </p>
      </div>
    )
  },
}
