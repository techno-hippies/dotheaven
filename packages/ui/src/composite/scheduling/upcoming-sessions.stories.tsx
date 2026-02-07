import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { UpcomingSessions, type BookingData } from './upcoming-sessions'

const meta: Meta<typeof UpcomingSessions> = {
  title: 'Scheduling/UpcomingSessions',
  component: UpcomingSessions,
  parameters: {
    layout: 'padded',
  },
}

export default meta

type Story = StoryObj<typeof UpcomingSessions>

// ── Mock Data ────────────────────────────────────────────────────

function hoursFromNow(h: number, min = 0): number {
  const d = new Date()
  d.setHours(d.getHours() + h, min, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

function daysFromNow(d: number, hour = 14, min = 0): number {
  const date = new Date()
  date.setDate(date.getDate() + d)
  date.setHours(hour, min, 0, 0)
  return Math.floor(date.getTime() / 1000)
}

const mockBookings: BookingData[] = [
  {
    id: '1',
    startTime: hoursFromNow(0, 15), // Starting in 15 mins
    durationMins: 20,
    guestAddress: '0x1234567890abcdef1234567890abcdef12345678',
    guestName: 'Alice',
    status: 'upcoming',
  },
  {
    id: '2',
    startTime: hoursFromNow(2),
    durationMins: 20,
    guestAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    guestName: 'Bob',
    guestAvatar: 'https://i.pravatar.cc/150?u=bob',
    status: 'upcoming',
  },
  {
    id: '3',
    startTime: daysFromNow(1, 10, 0),
    durationMins: 20,
    guestAddress: '0x9876543210fedcba9876543210fedcba98765432',
    guestName: 'Charlie',
    guestAvatar: 'https://i.pravatar.cc/150?u=charlie',
    status: 'upcoming',
  },
  {
    id: '4',
    startTime: daysFromNow(1, 14, 30),
    durationMins: 20,
    guestAddress: '0xfedcba9876543210fedcba9876543210fedcba98',
    guestName: 'Diana',
    status: 'upcoming',
  },
  {
    id: '5',
    startTime: daysFromNow(3, 9, 0),
    durationMins: 20,
    guestAddress: '0x1111222233334444555566667777888899990000',
    guestName: 'Eve',
    guestAvatar: 'https://i.pravatar.cc/150?u=eve',
    status: 'upcoming',
  },
]

// ── Stories ──────────────────────────────────────────────────────

export const Default: Story = {
  args: {
    bookings: mockBookings,
    onBookingClick: (booking) => alert(`Clicked: ${booking.guestName}`),
  },
}

export const WithLiveSession: Story = {
  args: {
    bookings: [
      {
        id: 'live-1',
        startTime: hoursFromNow(0, -5), // Started 5 mins ago
        durationMins: 20,
        guestAddress: '0x1234567890abcdef1234567890abcdef12345678',
        guestName: 'Alice',
        guestAvatar: 'https://i.pravatar.cc/150?u=alice',
        status: 'live',
      },
      ...mockBookings.slice(1),
    ],
    onBookingClick: (booking) => alert(`Clicked: ${booking.guestName}`),
  },
}

export const SingleSession: Story = {
  args: {
    bookings: [mockBookings[0]],
    onBookingClick: (booking) => alert(`Clicked: ${booking.guestName}`),
  },
}

export const Empty: Story = {
  args: {
    bookings: [],
  },
}

export const ManyBookings: Story = {
  args: {
    bookings: [
      ...mockBookings,
      {
        id: '6',
        startTime: daysFromNow(4, 11, 0),
        durationMins: 20,
        guestAddress: '0xaaaa1111bbbb2222cccc3333dddd4444eeee5555',
        guestName: 'Frank',
        status: 'upcoming',
      },
      {
        id: '7',
        startTime: daysFromNow(5, 15, 0),
        durationMins: 20,
        guestAddress: '0xbbbb2222cccc3333dddd4444eeee5555ffff6666',
        guestName: 'Grace',
        guestAvatar: 'https://i.pravatar.cc/150?u=grace',
        status: 'upcoming',
      },
      {
        id: '8',
        startTime: daysFromNow(6, 10, 30),
        durationMins: 20,
        guestAddress: '0xcccc3333dddd4444eeee5555ffff6666aaaa7777',
        status: 'upcoming', // No name, shows address
      },
    ],
    onBookingClick: (booking) => alert(`Clicked: ${booking.guestName || booking.guestAddress}`),
  },
}
