import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerTrigger } from './drawer'
import { Button } from './button'
import { TextField } from './text-field'

const meta = {
  title: 'Primitives/Drawer',
  parameters: {
    layout: 'centered',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

// Basic drawer demo
const BasicDrawerDemo = () => {
  const [open, setOpen] = createSignal(false)

  return (
    <div class="p-8">
      <Button onClick={() => setOpen(true)}>
        Open Drawer
      </Button>
      <Drawer open={open()} onOpenChange={setOpen}>
        <DrawerContent showHandle>
          <DrawerHeader>
            <DrawerTitle>Drawer Title</DrawerTitle>
            <DrawerDescription>
              This is a description of what this drawer does.
            </DrawerDescription>
          </DrawerHeader>
          <div class="py-4">
            <p class="text-[var(--text-secondary)]">
              Drawer content goes here. This is a mobile-friendly bottom sheet
              that can be dragged to dismiss.
            </p>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

export const Basic: Story = {
  render: () => <BasicDrawerDemo />,
}

// Drawer with footer
const DrawerWithFooterDemo = () => {
  const [open, setOpen] = createSignal(false)

  return (
    <div class="p-8">
      <Button onClick={() => setOpen(true)}>
        Open Drawer with Footer
      </Button>
      <Drawer open={open()} onOpenChange={setOpen}>
        <DrawerContent
          showHandle
          footer={
            <div class="flex gap-3">
              <Button variant="secondary" class="flex-1" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button class="flex-1" onClick={() => setOpen(false)}>
                Confirm
              </Button>
            </div>
          }
        >
          <DrawerHeader>
            <DrawerTitle>Confirm Action</DrawerTitle>
            <DrawerDescription>
              Are you sure you want to proceed?
            </DrawerDescription>
          </DrawerHeader>
          <div class="py-4">
            <p class="text-[var(--text-secondary)]">
              This action cannot be undone. Please make sure you want to continue.
            </p>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

export const WithFooter: Story = {
  render: () => <DrawerWithFooterDemo />,
}

// Drawer with form (keyboard handling)
const DrawerWithFormDemo = () => {
  const [open, setOpen] = createSignal(false)

  return (
    <div class="p-8">
      <Button onClick={() => setOpen(true)}>
        Open Form Drawer
      </Button>
      <Drawer open={open()} onOpenChange={setOpen}>
        <DrawerContent
          showHandle
          footer={
            <Button class="w-full" onClick={() => setOpen(false)}>
              Submit
            </Button>
          }
        >
          <DrawerHeader>
            <DrawerTitle>Edit Profile</DrawerTitle>
            <DrawerDescription>
              Update your profile information
            </DrawerDescription>
          </DrawerHeader>
          <div class="py-4 space-y-4">
            <TextField label="Name" placeholder="Enter your name" />
            <TextField label="Bio" placeholder="Tell us about yourself" />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

export const WithForm: Story = {
  render: () => <DrawerWithFormDemo />,
  parameters: {
    viewport: { defaultViewport: 'mobile2' },
  },
}

// Drawer with back button
const DrawerWithBackDemo = () => {
  const [open, setOpen] = createSignal(false)
  const [step, setStep] = createSignal(1)

  const handleBack = () => {
    if (step() > 1) setStep(step() - 1)
  }

  return (
    <div class="p-8">
      <Button onClick={() => { setOpen(true); setStep(1) }}>
        Open Multi-Step Drawer
      </Button>
      <Drawer open={open()} onOpenChange={setOpen}>
        <DrawerContent
          showHandle
          onBack={step() > 1 ? handleBack : undefined}
          footer={
            <Button
              class="w-full"
              onClick={() => {
                if (step() < 3) setStep(step() + 1)
                else setOpen(false)
              }}
            >
              {step() < 3 ? 'Next' : 'Done'}
            </Button>
          }
        >
          <DrawerHeader>
            <DrawerTitle>Step {step()} of 3</DrawerTitle>
            <DrawerDescription>
              {step() === 1 && 'Choose your preferences'}
              {step() === 2 && 'Customize your settings'}
              {step() === 3 && 'Review and confirm'}
            </DrawerDescription>
          </DrawerHeader>
          <div class="py-4">
            <p class="text-[var(--text-secondary)]">
              Content for step {step()}
            </p>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

export const WithBackButton: Story = {
  render: () => <DrawerWithBackDemo />,
}

// Using DrawerTrigger
const TriggerDrawerDemo = () => {
  return (
    <div class="p-8">
      <Drawer>
        <DrawerTrigger as={Button}>
          Open with Trigger
        </DrawerTrigger>
        <DrawerContent showHandle>
          <DrawerHeader>
            <DrawerTitle>Trigger Example</DrawerTitle>
            <DrawerDescription>
              This drawer was opened using DrawerTrigger
            </DrawerDescription>
          </DrawerHeader>
          <div class="py-4">
            <p class="text-[var(--text-secondary)]">
              The DrawerTrigger component automatically handles open/close state.
            </p>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

export const UsingTrigger: Story = {
  render: () => <TriggerDrawerDemo />,
}
