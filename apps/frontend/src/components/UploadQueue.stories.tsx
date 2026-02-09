import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { UploadQueuePanel } from './UploadQueue'
import type { UploadJob } from '../lib/upload-manager'

const meta = {
  title: 'Components/UploadQueue',
  component: UploadQueuePanel,
  tags: ['autodocs'],
  argTypes: {
    onRemoveJob: { action: 'remove job' },
    onClearCompleted: { action: 'clear completed' },
  },
  args: {
    inline: true,
  },
} satisfies Meta<typeof UploadQueuePanel>

export default meta
type Story = StoryObj<typeof meta>

const now = Date.now()

const MOCK_JOBS: Record<string, UploadJob[]> = {
  uploading: [
    {
      id: 'upload-0',
      title: 'Concrete Schoolyard',
      artist: 'Jurassic 5',
      filePath: '/music/jurassic5/concrete.flac',
      step: 'uploading',
      startedAt: now - 45_000,
      trackId: '0xabc123',
      contentId: '0xdef456',
    },
  ],
  multiStep: [
    {
      id: 'upload-0',
      title: 'Concrete Schoolyard',
      artist: 'Jurassic 5',
      filePath: '/music/jurassic5/concrete.flac',
      step: 'uploading',
      startedAt: now - 120_000,
    },
    {
      id: 'upload-1',
      title: 'Afterimage',
      artist: 'Justice starring RIMON',
      filePath: '/music/justice/afterimage.flac',
      step: 'queued',
    },
    {
      id: 'upload-2',
      title: 'Midnight City',
      artist: 'M83',
      filePath: '/music/m83/midnight.flac',
      step: 'queued',
    },
  ],
  mixed: [
    {
      id: 'upload-0',
      title: 'Concrete Schoolyard',
      artist: 'Jurassic 5',
      filePath: '/music/jurassic5/concrete.flac',
      step: 'done',
      startedAt: now - 180_000,
      completedAt: now - 15_000,
      pieceCid: 'baga6ea4seaqkcr...',
    },
    {
      id: 'upload-1',
      title: 'Afterimage',
      artist: 'Justice starring RIMON',
      filePath: '/music/justice/afterimage.flac',
      step: 'encrypting',
      startedAt: now - 30_000,
    },
    {
      id: 'upload-2',
      title: 'Midnight City',
      artist: 'M83',
      filePath: '/music/m83/midnight.flac',
      step: 'queued',
    },
  ],
  errorNoFunds: [
    {
      id: 'upload-0',
      title: 'Concrete Schoolyard',
      artist: 'Jurassic 5',
      filePath: '/music/jurassic5/concrete.flac',
      step: 'error',
      startedAt: now - 14_000,
      error: 'Your wallet has no tFIL on Filecoin Calibration. Get test FIL from https://faucet.calibnet.chainsafe-fil.io and send to 0xa46a225673A06F67D549F183f732Ca8FBA30b602',
    },
  ],
  errorSynapse: [
    {
      id: 'upload-0',
      title: 'Concrete Schoolyard',
      artist: 'Jurassic 5',
      filePath: '/music/jurassic5/concrete.flac',
      step: 'error',
      startedAt: now - 14_000,
      error: 'PaymentsService account info failed: Failed to read account information from payments contract.',
    },
  ],
  errorCallException: [
    {
      id: 'upload-0',
      title: 'Afterimage',
      artist: 'Justice starring RIMON',
      filePath: '/music/justice/afterimage.flac',
      step: 'error',
      startedAt: now - 8_000,
      error: 'missing revert data (action="call", data=null, reason=null, code=CALL_EXCEPTION, version=6.16.0)',
    },
  ],
  errorAuth: [
    {
      id: 'upload-0',
      title: 'Midnight City',
      artist: 'M83',
      filePath: '/music/m83/midnight.flac',
      step: 'error',
      startedAt: now - 3_000,
      error: 'Not authenticated',
    },
  ],
  allDone: [
    {
      id: 'upload-0',
      title: 'Concrete Schoolyard',
      artist: 'Jurassic 5',
      filePath: '/music/jurassic5/concrete.flac',
      step: 'done',
      startedAt: now - 195_000,
      completedAt: now - 60_000,
      pieceCid: 'baga6ea4seaqkcr...',
    },
    {
      id: 'upload-1',
      title: 'Afterimage',
      artist: 'Justice starring RIMON',
      filePath: '/music/justice/afterimage.flac',
      step: 'done',
      startedAt: now - 55_000,
      completedAt: now - 5_000,
      pieceCid: 'baga6ea4seaqdef...',
    },
  ],
  allSteps: [
    { id: 'u-0', title: 'Reading...', artist: 'Artist', filePath: '/a', step: 'reading' as const, startedAt: now - 5000 },
    { id: 'u-1', title: 'Encrypting...', artist: 'Artist', filePath: '/b', step: 'encrypting' as const, startedAt: now - 15000 },
    { id: 'u-2', title: 'Depositing...', artist: 'Artist', filePath: '/c', step: 'depositing' as const, startedAt: now - 30000 },
    { id: 'u-3', title: 'Uploading...', artist: 'Artist', filePath: '/d', step: 'uploading' as const, startedAt: now - 90000 },
    { id: 'u-4', title: 'Registering...', artist: 'Artist', filePath: '/e', step: 'registering' as const, startedAt: now - 120000 },
    { id: 'u-5', title: 'Done!', artist: 'Artist', filePath: '/f', step: 'done' as const, startedAt: now - 180000, completedAt: now - 10000 },
  ],
}

export const SingleUploading: Story = {
  args: { jobs: MOCK_JOBS.uploading },
}

export const QueueWithMultiple: Story = {
  args: { jobs: MOCK_JOBS.multiStep },
}

export const MixedStates: Story = {
  args: { jobs: MOCK_JOBS.mixed },
}

export const ErrorNoFunds: Story = {
  args: { jobs: MOCK_JOBS.errorNoFunds },
}

export const ErrorSynapseAccount: Story = {
  args: { jobs: MOCK_JOBS.errorSynapse },
}

export const ErrorCallException: Story = {
  args: { jobs: MOCK_JOBS.errorCallException },
}

export const ErrorNotAuthenticated: Story = {
  args: { jobs: MOCK_JOBS.errorAuth },
}

export const AllCompleted: Story = {
  args: { jobs: MOCK_JOBS.allDone },
}

export const AllSteps: Story = {
  args: { jobs: MOCK_JOBS.allSteps },
}
