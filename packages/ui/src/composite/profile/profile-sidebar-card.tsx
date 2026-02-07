import { Show, type Component, type JSX } from 'solid-js'

export interface ProfileSidebarCardProps {
  title: string
  children: JSX.Element
}

export const ProfileSidebarCard: Component<ProfileSidebarCardProps> = (props) => {
  return (
    <div class="bg-[var(--bg-surface)] rounded-md p-4">
      <h3 class="text-base font-semibold text-[var(--text-primary)] mb-3">{props.title}</h3>
      {props.children}
    </div>
  )
}

export interface ProfileSidebarRowProps {
  label: string
  value?: string | null
  children?: JSX.Element
}

export const ProfileSidebarRow: Component<ProfileSidebarRowProps> = (props) => {
  return (
    <Show when={props.value || props.children}>
      <div class="flex items-start gap-3 py-1.5">
        <span class="text-base text-[var(--text-muted)] min-w-[100px] flex-shrink-0">{props.label}</span>
        <Show when={props.children} fallback={
          <span class="text-base text-[var(--text-secondary)]">{props.value}</span>
        }>
          {props.children}
        </Show>
      </div>
    </Show>
  )
}
