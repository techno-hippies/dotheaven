import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { FileInput } from './file-input'

const meta = {
  title: 'Primitives/FileInput',
  component: FileInput,
  tags: ['autodocs'],
} satisfies Meta<typeof FileInput>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    label: 'Upload file',
    description: 'Choose a file to upload',
  },
}

export const Multiple: Story = {
  args: {
    label: 'Upload files',
    description: 'You can upload up to 5 files',
    multiple: true,
    maxFiles: 5,
  },
}

export const ImageOnly: Story = {
  args: {
    label: 'Album cover',
    description: 'Upload a square image (PNG, JPG, or WebP)',
    accept: 'image/*',
    maxFileSize: 5 * 1024 * 1024, // 5 MB
  },
}

export const AudioOnly: Story = {
  args: {
    label: 'Audio file',
    description: 'Upload an audio file (MP3, WAV, or M4A)',
    accept: ['audio/mpeg', 'audio/wav', 'audio/mp4'],
    maxFileSize: 50 * 1024 * 1024, // 50 MB
  },
}

export const WithSizeLimit: Story = {
  args: {
    label: 'Preview clip',
    description: 'Upload a short audio clip (max 5 MB)',
    accept: 'audio/*',
    maxFileSize: 5 * 1024 * 1024,
    onFileReject: (files) => {
      console.log('Rejected files:', files)
    },
  },
}

export const Disabled: Story = {
  args: {
    label: 'Upload file',
    description: 'File upload is disabled',
    disabled: true,
  },
}

export const WithError: Story = {
  args: {
    label: 'Upload file',
    description: 'File must be less than 10 MB',
    validationState: 'invalid',
    errorMessage: 'File size exceeds 10 MB limit',
  },
}

export const NoDragDrop: Story = {
  args: {
    label: 'Upload file',
    description: 'Click to choose a file (drag and drop disabled)',
    allowDragAndDrop: false,
  },
}
