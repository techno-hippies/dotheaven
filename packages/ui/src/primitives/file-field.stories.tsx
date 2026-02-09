import type { Meta, StoryObj } from 'storybook-solidjs'
import { FileField, type FileFieldProps } from './file-field'

const meta: Meta<FileFieldProps> = {
  title: 'Primitives/FileField',
  component: FileField,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ padding: '2rem', background: 'var(--bg-surface)', 'border-radius': '6px', width: '400px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta

export const Default: StoryObj = {
  render: () => (
    <FileField
      label="Upload files"
      description="PNG, JPG or GIF up to 10MB"
      accept="image/*"
      multiple
      maxFiles={5}
      onFileAccept={(files) => console.log('Accepted:', files)}
      onFileReject={(files) => console.log('Rejected:', files)}
    />
  ),
}

export const SingleImage: StoryObj = {
  name: 'Single Image',
  render: () => (
    <FileField
      label="Profile photo"
      description="Square image recommended"
      accept={['image/png', 'image/jpeg', 'image/webp']}
      placeholder="Drop your photo here or"
      triggerText="choose file"
    />
  ),
}

export const Compact: StoryObj = {
  render: () => (
    <FileField
      accept="image/*"
      multiple
      maxFiles={4}
      compact
      placeholder="Drop images or"
      triggerText="browse"
    />
  ),
}

export const WithSizeLimit: StoryObj = {
  name: 'With Size Limit',
  render: () => (
    <FileField
      label="Attachments"
      description="Max 5MB per file"
      accept="image/*"
      multiple
      maxFiles={3}
      maxFileSize={5 * 1024 * 1024}
      validationState="valid"
      onFileReject={(rejections) => {
        for (const r of rejections) {
          console.log(`Rejected ${r.file.name}:`, r.errors)
        }
      }}
    />
  ),
}

export const Disabled: StoryObj = {
  render: () => (
    <FileField
      label="Upload disabled"
      description="File uploads are currently disabled"
      accept="image/*"
      disabled
    />
  ),
}

export const AnyFileType: StoryObj = {
  name: 'Any File Type',
  render: () => (
    <FileField
      label="Documents"
      description="Upload any document"
      multiple
      maxFiles={10}
      placeholder="Drag & drop files here or"
      triggerText="select files"
    />
  ),
}

export const WithValidation: StoryObj = {
  name: 'With Validation Error',
  render: () => (
    <FileField
      label="Cover image"
      accept="image/*"
      maxFileSize={2 * 1024 * 1024}
      validationState="invalid"
      errorMessage="File is too large. Maximum size is 2MB."
      description="PNG or JPG, max 2MB"
    />
  ),
}
