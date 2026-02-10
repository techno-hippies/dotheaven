import type { Component, JSX } from 'solid-js'
import { For } from 'solid-js'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
} from '../primitives/dialog'
import {
  AppleLogo,
  WindowsLogo,
  LinuxLogo,
  AppStoreLogo,
  GooglePlayLogo,
  DownloadSimple,
} from '../icons'

// ── Types ──────────────────────────────────────────────────────────────

interface PlatformOption {
  icon: () => JSX.Element
  label: string
  sublabel: string
  href: string
}

export interface DownloadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ── Platform data ──────────────────────────────────────────────────────

const DESKTOP_PLATFORMS: PlatformOption[] = [
  { icon: () => <AppleLogo class="w-6 h-6" />, label: 'macOS', sublabel: 'Apple Silicon & Intel', href: '#' },
  { icon: () => <WindowsLogo class="w-6 h-6" />, label: 'Windows', sublabel: '10 / 11', href: '#' },
  { icon: () => <LinuxLogo class="w-6 h-6" />, label: 'Linux', sublabel: '.deb / .AppImage', href: '#' },
]

const MOBILE_PLATFORMS: PlatformOption[] = [
  { icon: () => <AppStoreLogo class="w-6 h-6" />, label: 'iOS', sublabel: 'iPhone & iPad', href: '#' },
  { icon: () => <GooglePlayLogo class="w-6 h-6" />, label: 'Android', sublabel: 'Google Play', href: '#' },
]

// ── Sub-components ─────────────────────────────────────────────────────

const PlatformButton: Component<{ platform: PlatformOption }> = (props) => (
  <a
    href={props.platform.href}
    target="_blank"
    rel="noopener noreferrer"
    class="flex items-center gap-3 px-4 py-3 rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--bg-highlight)] transition-colors cursor-pointer"
  >
    <span class="w-7 h-7 flex items-center justify-center text-[var(--text-secondary)]">
      {props.platform.icon()}
    </span>
    <div class="flex flex-col min-w-0">
      <span class="text-base font-medium text-[var(--text-primary)]">{props.platform.label}</span>
      <span class="text-xs text-[var(--text-muted)]">{props.platform.sublabel}</span>
    </div>
    <span class="ml-auto text-[var(--text-muted)]">
      <DownloadSimple class="w-4 h-4" />
    </span>
  </a>
)

// ── Main component ─────────────────────────────────────────────────────

export const DownloadDialog: Component<DownloadDialogProps> = (props) => {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="max-w-sm">
        <DialogHeader>
          <DialogTitle>Download</DialogTitle>
        </DialogHeader>
        <DialogBody class="space-y-5">
          <div>
            <p class="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2 px-1">Desktop</p>
            <div class="flex flex-col gap-1.5">
              <For each={DESKTOP_PLATFORMS}>
                {(p) => <PlatformButton platform={p} />}
              </For>
            </div>
          </div>

          <div>
            <p class="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2 px-1">Mobile</p>
            <div class="flex flex-col gap-1.5">
              <For each={MOBILE_PLATFORMS}>
                {(p) => <PlatformButton platform={p} />}
              </For>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
