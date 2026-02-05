import { createSignal } from 'solid-js'
import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { ScheduleDashboard } from './schedule-dashboard'
import type { SessionSlotData, SessionRequestData } from './schedule-tab'

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

  // Today — sessions at 30-min intervals, 20 min each
  slots.push(
    { id: id++, startTime: daysFromNow(0, 9, 0),  durationMins: 20, priceEth: '0.01', status: 'booked', guestName: 'Alice' },
    { id: id++, startTime: daysFromNow(0, 9, 30), durationMins: 20, priceEth: '0.01', status: 'booked', guestName: 'Bob' },
    { id: id++, startTime: daysFromNow(0, 10, 0), durationMins: 20, priceEth: '0.01', status: 'open' },
    { id: id++, startTime: daysFromNow(0, 14, 0), durationMins: 20, priceEth: '0.01', status: 'booked', guestName: 'Charlie' },
    { id: id++, startTime: daysFromNow(0, 14, 30), durationMins: 20, priceEth: '0.01', status: 'open' },
    { id: id++, startTime: daysFromNow(0, 15, 0), durationMins: 20, priceEth: '0.01', status: 'open' },
  )

  // Tomorrow
  slots.push(
    { id: id++, startTime: daysFromNow(1, 9, 0),  durationMins: 20, priceEth: '0.01', status: 'open' },
    { id: id++, startTime: daysFromNow(1, 9, 30), durationMins: 20, priceEth: '0.01', status: 'booked', guestName: 'Diana' },
    { id: id++, startTime: daysFromNow(1, 10, 0), durationMins: 20, priceEth: '0.01', status: 'booked', guestName: 'Eve' },
    { id: id++, startTime: daysFromNow(1, 10, 30), durationMins: 20, priceEth: '0.01', status: 'open' },
    { id: id++, startTime: daysFromNow(1, 15, 0), durationMins: 20, priceEth: '0.01', status: 'open' },
    { id: id++, startTime: daysFromNow(1, 15, 30), durationMins: 20, priceEth: '0.01', status: 'booked', guestName: 'Frank' },
  )

  // Day +2
  slots.push(
    { id: id++, startTime: daysFromNow(2, 10, 0), durationMins: 20, priceEth: '0.01', status: 'open' },
    { id: id++, startTime: daysFromNow(2, 10, 30), durationMins: 20, priceEth: '0.01', status: 'open' },
    { id: id++, startTime: daysFromNow(2, 15, 0), durationMins: 20, priceEth: '0.01', status: 'booked', guestName: 'Alice' },
  )

  // Day +3
  slots.push(
    { id: id++, startTime: daysFromNow(3, 9, 0),  durationMins: 20, priceEth: '0.01', status: 'open' },
    { id: id++, startTime: daysFromNow(3, 9, 30), durationMins: 20, priceEth: '0.01', status: 'open' },
    { id: id++, startTime: daysFromNow(3, 14, 0), durationMins: 20, priceEth: '0.01', status: 'open' },
    { id: id++, startTime: daysFromNow(3, 14, 30), durationMins: 20, priceEth: '0.01', status: 'open' },
  )

  // Day +4
  slots.push(
    { id: id++, startTime: daysFromNow(4, 11, 0),  durationMins: 20, priceEth: '0.01', status: 'booked', guestName: 'Bob' },
    { id: id++, startTime: daysFromNow(4, 11, 30), durationMins: 20, priceEth: '0.01', status: 'open' },
    { id: id++, startTime: daysFromNow(4, 15, 0),  durationMins: 20, priceEth: '0.01', status: 'open' },
  )

  nextId = id + 100
  return slots
}

function generateMockRequests(): SessionRequestData[] {
  return [
    {
      id: 101,
      guestAddress: '0x1234567890abcdef1234567890abcdef12345678',
      guestName: 'Diana',
      windowStart: daysFromNow(3, 10),
      windowEnd: daysFromNow(3, 18),
      durationMins: 60,
      amountEth: '0.015',
      expiry: daysFromNow(2),
      status: 'open',
    },
    {
      id: 102,
      guestAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      guestName: 'Eve',
      windowStart: daysFromNow(4, 14),
      windowEnd: daysFromNow(4, 20),
      durationMins: 90,
      amountEth: '0.02',
      expiry: daysFromNow(3),
      status: 'open',
    },
    {
      id: 103,
      guestAddress: '0x9876543210fedcba9876543210fedcba98765432',
      windowStart: daysFromNow(5, 9),
      windowEnd: daysFromNow(5, 12),
      durationMins: 60,
      amountEth: '0.01',
      expiry: daysFromNow(4),
      status: 'open',
    },
  ]
}

// ── Stories ──────────────────────────────────────────────────────

export const Default: Story = {
  render: () => {
    const [accepting, setAccepting] = createSignal(true)
    const [slots, setSlots] = createSignal(generateMockSlots())

    return (
      <ScheduleDashboard
        basePrice="0.01"
        acceptingBookings={accepting()}
        onToggleAccepting={setAccepting}
        slots={slots()}
        onCreateSlot={(startTime, durationMins) => {
          setSlots(prev => [...prev, { id: nextId++, startTime, durationMins, priceEth: '0.01', status: 'open' as const }])
        }}
        onRemoveSlot={(id) => {
          setSlots(prev => prev.filter(s => s.id !== id))
        }}
        onSlotClick={(slot) => alert(`Navigate to ${slot.status === 'booked' ? 'booking' : 'slot'} #${slot.id}`)}
        requests={generateMockRequests()}
        onSetBasePrice={(price) => alert(`Set base price: ${price} ETH`)}
      />
    )
  },
}

export const Empty: Story = {
  render: () => {
    const [accepting, setAccepting] = createSignal(false)
    const [slots, setSlots] = createSignal<SessionSlotData[]>([])

    return (
      <ScheduleDashboard
        basePrice=""
        acceptingBookings={accepting()}
        onToggleAccepting={setAccepting}
        slots={slots()}
        onCreateSlot={(startTime, durationMins) => {
          setSlots(prev => [...prev, { id: nextId++, startTime, durationMins, priceEth: '0.01', status: 'open' as const }])
        }}
        onRemoveSlot={(id) => {
          setSlots(prev => prev.filter(s => s.id !== id))
        }}
        requests={[]}
        onSetBasePrice={(price) => alert(`Set base price: ${price} ETH`)}
      />
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'New host with no sessions, no pricing configured.',
      },
    },
  },
}

export const Loading: Story = {
  render: () => {
    return (
      <ScheduleDashboard
        basePrice="0.01"
        acceptingBookings={true}
        slotsLoading={true}
        requestsLoading={true}
      />
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Dashboard while sessions and requests are loading.',
      },
    },
  },
}

export const BusySchedule: Story = {
  render: () => {
    const [accepting, setAccepting] = createSignal(true)

    // Generate lots of sessions over the next week
    const busySlots: SessionSlotData[] = []
    let id = 1
    for (let d = 0; d < 7; d++) {
      const dayOfWeek = new Date(Date.now() + d * 86400000).getDay()
      if (dayOfWeek === 0) continue // Skip Sunday

      // 30-min intervals, 20-min sessions
      for (const [hour, min] of [[9,0],[9,30],[10,0],[10,30],[11,0],[14,0],[14,30],[15,0],[15,30],[16,0],[16,30],[17,0]] as const) {
        const isBooked = Math.random() > 0.35
        busySlots.push({
          id: id++,
          startTime: daysFromNow(d, hour, min),
          durationMins: 20,
          priceEth: '0.01',
          status: isBooked ? 'booked' : 'open',
          guestName: isBooked ? ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank'][Math.floor(Math.random() * 6)] : undefined,
        })
      }
    }

    return (
      <ScheduleDashboard
        basePrice="0.01"
        acceptingBookings={accepting()}
        onToggleAccepting={setAccepting}
        slots={busySlots}
        onSlotClick={(slot) => alert(`Navigate to ${slot.status === 'booked' ? 'booking' : 'slot'} #${slot.id}`)}
        requests={generateMockRequests()}
        onSetBasePrice={(price) => alert(`Set: ${price} ETH`)}
      />
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Host with a packed schedule across the whole week.',
      },
    },
  },
}

export const NoRequests: Story = {
  render: () => {
    const [accepting, setAccepting] = createSignal(true)
    const [slots, setSlots] = createSignal(generateMockSlots().slice(0, 6))

    return (
      <ScheduleDashboard
        basePrice="0.005"
        acceptingBookings={accepting()}
        onToggleAccepting={setAccepting}
        slots={slots()}
        onCreateSlot={(startTime, durationMins) => {
          setSlots(prev => [...prev, { id: nextId++, startTime, durationMins, priceEth: '0.005', status: 'open' as const }])
        }}
        onRemoveSlot={(id) => {
          setSlots(prev => prev.filter(s => s.id !== id))
        }}
        onSlotClick={(slot) => alert(`Navigate to slot #${slot.id}`)}
        requests={[]}
        onSetBasePrice={(price) => alert(`Set: ${price} ETH`)}
      />
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Host with sessions but no incoming requests.',
      },
    },
  },
}

export const Paused: Story = {
  render: () => {
    const [accepting, setAccepting] = createSignal(false)

    return (
      <ScheduleDashboard
        basePrice="0.01"
        acceptingBookings={accepting()}
        onToggleAccepting={setAccepting}
        slots={generateMockSlots().filter(s => s.status === 'booked').slice(0, 3)}
        requests={[]}
        onSetBasePrice={(price) => alert(`Set: ${price} ETH`)}
      />
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Host has paused accepting new bookings but still has existing booked sessions.',
      },
    },
  },
}
