import { createSignal, Show } from 'solid-js'
import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { ScheduleDashboard } from './schedule-dashboard'
import { Switch, IconButton } from '../../primitives'
import type { SessionSlotData } from './schedule-tab'

const meta: Meta = {
  title: 'Scheduling/ScheduleDashboard',
  component: ScheduleDashboard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj

// ── Mock Data ────────────────────────────────────────────────────

let nextId = 1000

function daysFromNow(d: number, hour = 14, min = 0) {
  const date = new Date()
  date.setDate(date.getDate() + d)
  date.setHours(hour, min, 0, 0)
  return Math.floor(date.getTime() / 1000)
}

function generateMockSlots(): SessionSlotData[] {
  const slots: SessionSlotData[] = []
  let id = 1

  // Today — a mix of open and booked slots
  slots.push(
    { id: id++, startTime: daysFromNow(0, 9, 0),  durationMins: 20, priceEth: '0.05', status: 'booked', guestName: 'Alice' },
    { id: id++, startTime: daysFromNow(0, 9, 30), durationMins: 20, priceEth: '0.05', status: 'open' },
    { id: id++, startTime: daysFromNow(0, 10, 0), durationMins: 20, priceEth: '0.05', status: 'open' },
    { id: id++, startTime: daysFromNow(0, 10, 30), durationMins: 20, priceEth: '0.05', status: 'open' },
    { id: id++, startTime: daysFromNow(0, 11, 30), durationMins: 20, priceEth: '0.05', status: 'booked', guestName: 'Bob' },
    { id: id++, startTime: daysFromNow(0, 14, 0), durationMins: 20, priceEth: '0.05', status: 'open' },
    { id: id++, startTime: daysFromNow(0, 14, 30), durationMins: 20, priceEth: '0.05', status: 'open' },
  )

  // Tomorrow
  slots.push(
    { id: id++, startTime: daysFromNow(1, 9, 0),  durationMins: 20, priceEth: '0.05', status: 'open' },
    { id: id++, startTime: daysFromNow(1, 10, 0), durationMins: 20, priceEth: '0.05', status: 'booked', guestName: 'Charlie' },
    { id: id++, startTime: daysFromNow(1, 15, 0), durationMins: 20, priceEth: '0.05', status: 'open' },
  )

  // Day +2
  slots.push(
    { id: id++, startTime: daysFromNow(2, 10, 0), durationMins: 20, priceEth: '0.05', status: 'open' },
    { id: id++, startTime: daysFromNow(2, 10, 30), durationMins: 20, priceEth: '0.05', status: 'open' },
  )

  // Day +3
  slots.push(
    { id: id++, startTime: daysFromNow(3, 9, 0),  durationMins: 20, priceEth: '0.05', status: 'open' },
    { id: id++, startTime: daysFromNow(3, 14, 0), durationMins: 20, priceEth: '0.05', status: 'booked', guestName: 'Diana' },
  )

  nextId = id + 100
  return slots
}

// ── Icons (for stories) ──────────────────────────────────────────

const ChevronLeftIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
)

// ── Stories ──────────────────────────────────────────────────────

export const Default: Story = {
  render: () => {
    const [slots, setSlots] = createSignal(generateMockSlots())

    return (
      <div class="max-w-lg mx-auto">
        <ScheduleDashboard
          basePrice="0.05"
          acceptingBookings={true}
          slots={slots()}
          onCreateSlot={(startTime, durationMins) => {
            setSlots(prev => [...prev, { id: nextId++, startTime, durationMins, priceEth: '0.05', status: 'open' as const }])
          }}
          onRemoveSlot={(id) => {
            setSlots(prev => prev.filter(s => s.id !== id))
          }}
          onSetBasePrice={(price) => alert(`Set base price: ${price} ETH`)}
        />
      </div>
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Default availability dashboard. Tap empty slots to mark as open, tap open slots to remove. Blue = open, dark = booked.',
      },
    },
  },
}

export const Empty: Story = {
  render: () => {
    const [slots, setSlots] = createSignal<SessionSlotData[]>([])

    return (
      <div class="max-w-lg mx-auto">
        <ScheduleDashboard
          basePrice=""
          acceptingBookings={true}
          slots={slots()}
          onCreateSlot={(startTime, durationMins) => {
            setSlots(prev => [...prev, { id: nextId++, startTime, durationMins, priceEth: '0.01', status: 'open' as const }])
          }}
          onRemoveSlot={(id) => {
            setSlots(prev => prev.filter(s => s.id !== id))
          }}
          onSetBasePrice={(price) => alert(`Set base price: ${price} ETH`)}
        />
      </div>
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'New host with no sessions. All 48 half-hour slots are empty and available to toggle.',
      },
    },
  },
}

export const BusyDay: Story = {
  render: () => {
    // Generate a packed day with lots of slots
    const busySlots: SessionSlotData[] = []
    let id = 1
    for (let h = 8; h < 20; h++) {
      for (const m of [0, 30]) {
        const isBooked = Math.random() > 0.4
        busySlots.push({
          id: id++,
          startTime: daysFromNow(0, h, m),
          durationMins: 20,
          priceEth: '0.05',
          status: isBooked ? 'booked' : 'open',
          guestName: isBooked ? ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'][Math.floor(Math.random() * 5)] : undefined,
        })
      }
    }

    return (
      <div class="max-w-lg mx-auto">
        <ScheduleDashboard
          basePrice="0.05"
          acceptingBookings={true}
          slots={busySlots}
          onSetBasePrice={(price) => alert(`Set: ${price} ETH`)}
        />
      </div>
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'A packed day with many open and booked slots from 8 AM to 8 PM.',
      },
    },
  },
}

export const Paused: Story = {
  render: () => {
    const [accepting, setAccepting] = createSignal(false)

    return (
      <div class="max-w-lg mx-auto">
        <ScheduleDashboard
          basePrice="0.05"
          acceptingBookings={accepting()}
          onToggleAccepting={setAccepting}
          slots={generateMockSlots().filter(s => s.status === 'booked')}
          onSetBasePrice={(price) => alert(`Set: ${price} ETH`)}
        />
      </div>
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Host has paused bookings. Grid is dimmed. Existing booked sessions remain visible.',
      },
    },
  },
}

export const AvailabilityPage: Story = {
  render: () => {
    const [accepting, setAccepting] = createSignal(true)
    const [slots, setSlots] = createSignal(generateMockSlots())

    return (
      <div class="flex flex-col h-[800px] bg-[var(--bg-page)] rounded-lg overflow-hidden max-w-lg mx-auto">
        {/* Header */}
        <div class="flex items-center gap-3 px-4 h-14 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex-shrink-0">
          <IconButton variant="soft" size="md" aria-label="Back">
            <ChevronLeftIcon />
          </IconButton>
          <span class="flex-1 text-base font-semibold text-[var(--text-primary)]">
            Availability
            <Show when={!accepting()}>
              <span class="text-sm font-normal text-[var(--text-muted)] ml-2">(paused)</span>
            </Show>
          </span>
          <Switch checked={accepting()} onChange={setAccepting} />
        </div>

        {/* Content */}
        <div class={`flex-1 overflow-y-auto transition-opacity ${!accepting() ? 'opacity-60' : ''}`}>
          <div class="px-4 py-5">
            <Show when={!accepting()}>
              <div class="mb-4 px-4 py-3 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
                Bookings are paused. Toggle the switch above to accept new bookings.
              </div>
            </Show>
            <ScheduleDashboard
              basePrice="0.05"
              acceptingBookings={accepting()}
              onToggleAccepting={setAccepting}
              slots={slots()}
              onCreateSlot={(startTime, durationMins) => {
                setSlots(prev => [...prev, { id: nextId++, startTime, durationMins, priceEth: '0.05', status: 'open' as const }])
              }}
              onRemoveSlot={(id) => {
                setSlots(prev => prev.filter(s => s.id !== id))
              }}
              onSetBasePrice={(price) => alert(`Set: ${price} ETH`)}
            />
          </div>
        </div>
      </div>
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Full availability page with header, accepting toggle, and dashboard. Matches the `/schedule/availability` route layout.',
      },
    },
  },
}
