import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { LanguageEditor } from './language-editor'
import type { LanguageEntry } from '../../data/languages'

const meta: Meta<typeof LanguageEditor> = {
  title: 'Profile/LanguageEditor',
  component: LanguageEditor,
  decorators: [
    (Story) => (
      <div style={{ width: '500px', padding: '24px', background: 'var(--bg-page)' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof LanguageEditor>

// ── Editing stories ─────────────────────────────────────────────────

export const Empty: Story = {
  render: () => {
    const [langs, setLangs] = createSignal<LanguageEntry[]>([])
    return (
      <LanguageEditor
        languages={langs()}
        onChange={setLangs}
        isEditing={true}
        isOwnProfile={true}
      />
    )
  },
}

export const SingleNative: Story = {
  render: () => {
    const [langs, setLangs] = createSignal<LanguageEntry[]>([
      { code: 'en', proficiency: 7 },
    ])
    return (
      <LanguageEditor
        languages={langs()}
        onChange={setLangs}
        isEditing={true}
        isOwnProfile={true}
      />
    )
  },
}

export const MultipleLanguages: Story = {
  render: () => {
    const [langs, setLangs] = createSignal<LanguageEntry[]>([
      { code: 'en', proficiency: 7 },
      { code: 'es', proficiency: 3 },
      { code: 'ja', proficiency: 2 },
      { code: 'fr', proficiency: 5 },
    ])
    return (
      <LanguageEditor
        languages={langs()}
        onChange={setLangs}
        isEditing={true}
        isOwnProfile={true}
      />
    )
  },
}

export const MaxLanguages: Story = {
  render: () => {
    const [langs, setLangs] = createSignal<LanguageEntry[]>([
      { code: 'en', proficiency: 7 },
      { code: 'es', proficiency: 3 },
      { code: 'ja', proficiency: 2 },
      { code: 'fr', proficiency: 5 },
      { code: 'de', proficiency: 4 },
      { code: 'ko', proficiency: 1 },
      { code: 'zh', proficiency: 6 },
      { code: 'ar', proficiency: 7 },
    ])
    return (
      <LanguageEditor
        languages={langs()}
        onChange={setLangs}
        isEditing={true}
        isOwnProfile={true}
      />
    )
  },
}

// ── View mode stories ───────────────────────────────────────────────

export const ViewMode: Story = {
  render: () => (
    <LanguageEditor
      languages={[
        { code: 'en', proficiency: 7 },
        { code: 'es', proficiency: 3 },
        { code: 'ja', proficiency: 2 },
      ]}
      onChange={() => {}}
      isEditing={false}
      isOwnProfile={true}
    />
  ),
}

export const ViewModeEmpty: Story = {
  render: () => (
    <LanguageEditor
      languages={[]}
      onChange={() => {}}
      isEditing={false}
      isOwnProfile={true}
    />
  ),
}

export const ViewModePublic: Story = {
  render: () => (
    <LanguageEditor
      languages={[
        { code: 'en', proficiency: 7 },
        { code: 'fr', proficiency: 6 },
        { code: 'ko', proficiency: 1 },
      ]}
      onChange={() => {}}
      isEditing={false}
      isOwnProfile={false}
    />
  ),
}
