import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { BookingDetail, type BookingDetailData } from './booking-detail'

const meta: Meta = {
  title: 'Scheduling/BookingDetail',
  component: BookingDetail,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj

// ── Helpers ─────────────────────────────────────────────────────

function hoursFromNow(h: number): number {
  return Math.floor(Date.now() / 1000) + h * 3600
}

const EXPLORER = 'https://megaeth-testnet-v2.blockscout.com'
const HOST = '0x1234567890abcdef1234567890abcdef12345678'
const GUEST = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const TX_BOOKING = '0x7a3b9c4d2e1f0a8b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b'
const TX_FINALIZE = '0x9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2e1f0d9c8b7a6e5f4d3c2b1a0f9e8d'

function makeBooking(overrides: Partial<BookingDetailData> = {}): BookingDetailData {
  return {
    txHash: TX_BOOKING,
    host: HOST,
    hostName: 'alice.heaven',
    hostNationalityCode: 'US',
    guest: GUEST,
    guestName: 'bob.eth',
    guestNationalityCode: 'JP',
    startTime: hoursFromNow(2),
    durationMins: 20,
    priceEth: '0.01',
    cancelCutoffMins: 30,
    slotStatus: 'booked',
    amountEth: '0.01',
    bookingStatus: 'booked',
    outcome: 'none',
    isHost: true,
    explorerUrl: EXPLORER,
    ...overrides,
  }
}

// ── Stories ──────────────────────────────────────────────────────

export const PendingRequestAsHost: Story = {
  render: () => (
    <BookingDetail
      booking={makeBooking({
        bookingStatus: 'pending',
        slotStatus: 'open',
      })}
      onAcceptRequest={() => alert('Accept request')}
      onDeclineRequest={() => alert('Decline request')}
      onBack={() => alert('Go back')}
    />
  ),
  parameters: {
    docs: {
      description: { story: 'Incoming request. Host can accept or decline.' },
    },
  },
}

export const PendingRequestAsGuest: Story = {
  render: () => (
    <BookingDetail
      booking={makeBooking({
        bookingStatus: 'pending',
        slotStatus: 'open',
        isHost: false,
      })}
      onCancelBooking={() => alert('Withdraw request')}
      onBack={() => alert('Go back')}
    />
  ),
  parameters: {
    docs: {
      description: { story: 'Viewing own pending request as guest. Can withdraw.' },
    },
  },
}

export const Booked: Story = {
  render: () => (
    <BookingDetail
      booking={makeBooking()}
      onJoinSession={() => alert('Join session')}
      onCancelBooking={() => alert('Cancel booking')}
      onBack={() => alert('Go back')}
    />
  ),
  parameters: {
    docs: {
      description: { story: 'Upcoming booked session. Host can cancel before cutoff.' },
    },
  },
}

export const BookedAsGuest: Story = {
  render: () => (
    <BookingDetail
      booking={makeBooking({ isHost: false })}
      onCancelBooking={() => alert('Cancel booking')}
      onBack={() => alert('Go back')}
    />
  ),
  parameters: {
    docs: {
      description: { story: 'Viewing as the guest. Shows host info instead of guest.' },
    },
  },
}

export const ReadyToJoin: Story = {
  render: () => (
    <BookingDetail
      booking={makeBooking({
        startTime: hoursFromNow(0.05), // 3 mins from now
      })}
      onJoinSession={() => alert('Join session')}
      onBack={() => alert('Go back')}
    />
  ),
  parameters: {
    docs: {
      description: { story: 'Session starting soon (within 5 mins). Join button available.' },
    },
  },
}

export const SessionInProgress: Story = {
  render: () => (
    <BookingDetail
      booking={makeBooking({
        startTime: hoursFromNow(-0.25), // started 15 mins ago
      })}
      onJoinSession={() => alert('Join session')}
      onBack={() => alert('Go back')}
    />
  ),
  parameters: {
    docs: {
      description: { story: 'Session is currently happening. Join button available.' },
    },
  },
}

export const AwaitingOracle: Story = {
  render: () => (
    <BookingDetail
      booking={makeBooking({
        startTime: hoursFromNow(-2),
        bookingStatus: 'booked',
      })}
      onBack={() => alert('Go back')}
    />
  ),
  parameters: {
    docs: {
      description: { story: 'Session has ended, waiting for oracle attestation.' },
    },
  },
}

export const Completed: Story = {
  render: () => (
    <BookingDetail
      booking={makeBooking({
        startTime: hoursFromNow(-3),
        bookingStatus: 'attested',
        outcome: 'completed',
        attestedAt: hoursFromNow(-1),
        finalizableAt: hoursFromNow(23),
      })}
      onReportProblem={() => alert('Report problem')}
      onBack={() => alert('Go back')}
    />
  ),
  parameters: {
    docs: {
      description: { story: 'Session completed. "Something wrong?" link available during review period.' },
    },
  },
}

export const NoShowReported: Story = {
  render: () => (
    <BookingDetail
      booking={makeBooking({
        startTime: hoursFromNow(-3),
        bookingStatus: 'attested',
        outcome: 'no-show-host',
        attestedAt: hoursFromNow(-1),
        finalizableAt: hoursFromNow(23),
        isHost: false,
      })}
      onReportProblem={() => alert('Report problem')}
      onBack={() => alert('Go back')}
    />
  ),
  parameters: {
    docs: {
      description: { story: 'Host marked as no-show. Guest can dispute if incorrect.' },
    },
  },
}

export const Disputed: Story = {
  render: () => (
    <BookingDetail
      booking={makeBooking({
        startTime: hoursFromNow(-48),
        bookingStatus: 'disputed',
        outcome: 'no-show-guest',
        attestedAt: hoursFromNow(-24),
        finalizableAt: hoursFromNow(-1),
      })}
      onBack={() => alert('Go back')}
    />
  ),
  parameters: {
    docs: {
      description: { story: 'Booking is under dispute. No actions available.' },
    },
  },
}

export const UnderReview: Story = {
  render: () => (
    <BookingDetail
      booking={makeBooking({
        startTime: hoursFromNow(-72),
        bookingStatus: 'disputed',
        outcome: 'no-show-guest',
        attestedAt: hoursFromNow(-48),
        finalizableAt: hoursFromNow(-1),
      })}
      onBack={() => alert('Go back')}
    />
  ),
  parameters: {
    docs: {
      description: { story: 'Session under review after dispute. No actions needed - team is reviewing.' },
    },
  },
}

export const PaymentComplete: Story = {
  render: () => (
    <BookingDetail
      booking={makeBooking({
        startTime: hoursFromNow(-96),
        bookingStatus: 'finalized',
        outcome: 'completed',
        attestedAt: hoursFromNow(-72),
        finalizableAt: hoursFromNow(-48),
        finalizeTxHash: TX_FINALIZE,
      })}
      onBack={() => alert('Go back')}
    />
  ),
  parameters: {
    docs: {
      description: { story: 'Payment complete. Session finished and settled. ID shows finalize TX.' },
    },
  },
}

export const PaymentCompleteAsGuest: Story = {
  render: () => (
    <BookingDetail
      booking={makeBooking({
        startTime: hoursFromNow(-96),
        bookingStatus: 'finalized',
        outcome: 'completed',
        attestedAt: hoursFromNow(-72),
        finalizableAt: hoursFromNow(-48),
        finalizeTxHash: TX_FINALIZE,
        isHost: false,
      })}
      onBack={() => alert('Go back')}
    />
  ),
  parameters: {
    docs: {
      description: { story: 'Payment complete from guest perspective. ID shows finalize TX.' },
    },
  },
}

export const CancelledByGuest: Story = {
  render: () => (
    <BookingDetail
      booking={makeBooking({
        bookingStatus: 'cancelled',
        outcome: 'cancelled-by-guest',
      })}
      onBack={() => alert('Go back')}
    />
  ),
  parameters: {
    docs: {
      description: { story: 'Guest cancelled the booking. Short timeline.' },
    },
  },
}

export const CancelledByHost: Story = {
  render: () => (
    <BookingDetail
      booking={makeBooking({
        bookingStatus: 'cancelled',
        outcome: 'cancelled-by-host',
        isHost: true,
      })}
      onBack={() => alert('Go back')}
    />
  ),
  parameters: {
    docs: {
      description: { story: 'Host cancelled the booking.' },
    },
  },
}

export const NoNames: Story = {
  render: () => (
    <BookingDetail
      booking={makeBooking({
        hostName: undefined,
        guestName: undefined,
        hostAvatar: undefined,
        guestAvatar: undefined,
      })}
      onCancelBooking={() => alert('Cancel')}
      onBack={() => alert('Go back')}
    />
  ),
  parameters: {
    docs: {
      description: { story: 'No names resolved — shows truncated addresses.' },
    },
  },
}

export const NoExplorer: Story = {
  render: () => (
    <BookingDetail
      booking={makeBooking({ explorerUrl: undefined })}
      onCancelBooking={() => alert('Cancel')}
      onBack={() => alert('Go back')}
    />
  ),
  parameters: {
    docs: {
      description: { story: 'No explorer URL — tx hash shown without link icon.' },
    },
  },
}
