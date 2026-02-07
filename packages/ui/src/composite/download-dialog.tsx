import type { Component, JSX } from 'solid-js'
import { For } from 'solid-js'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
} from '../primitives/dialog'

// ── Phosphor icons (regular, 256×256) ───────────────────────────────────

const AppleLogo = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor"><path d="M223.3,169.59a8.07,8.07,0,0,0-2.8-3.4C203.53,154.53,200,134.64,200,120c0-17.67,13.47-33.06,21.5-40.67a8,8,0,0,0,0-11.62C208.82,55.74,187.82,48,168,48a72.2,72.2,0,0,0-40,12.13,71.56,71.56,0,0,0-90.71,9.09A74.63,74.63,0,0,0,16,123.4a127.06,127.06,0,0,0,40.14,89.73A39.8,39.8,0,0,0,83.59,224h87.68a39.84,39.84,0,0,0,29.12-12.57,125,125,0,0,0,17.82-24.6C225.23,174,224.33,172,223.3,169.59Zm-34.63,30.94a23.76,23.76,0,0,1-17.4,7.47H83.59a23.82,23.82,0,0,1-16.44-6.51A111.14,111.14,0,0,1,32,123,58.5,58.5,0,0,1,48.65,80.47,54.81,54.81,0,0,1,88,64h.78A55.45,55.45,0,0,1,123,76.28a8,8,0,0,0,10,0A55.44,55.44,0,0,1,168,64a70.64,70.64,0,0,1,36,10.35c-13,14.52-20,30.47-20,45.65,0,23.77,7.64,42.73,22.18,55.3A105.82,105.82,0,0,1,188.67,200.53ZM128.23,30A40,40,0,0,1,167,0h1a8,8,0,0,1,0,16h-1a24,24,0,0,0-23.24,18,8,8,0,1,1-15.5-4Z"/></svg>
)

const WindowsLogo = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor"><path d="M208,136H128a8,8,0,0,0-8,8v57.45a8,8,0,0,0,6.57,7.88l80,14.54A7.61,7.61,0,0,0,208,224a8,8,0,0,0,8-8V144A8,8,0,0,0,208,136Zm-8,70.41-64-11.63V152h64ZM96,136H32a8,8,0,0,0-8,8v40a8,8,0,0,0,6.57,7.87l64,11.64a8.54,8.54,0,0,0,1.43.13,8,8,0,0,0,8-8V144A8,8,0,0,0,96,136Zm-8,50.05-48-8.73V152H88ZM213.13,33.86a8,8,0,0,0-6.56-1.73l-80,14.55A8,8,0,0,0,120,54.55V112a8,8,0,0,0,8,8h80a8,8,0,0,0,8-8V40A8,8,0,0,0,213.13,33.86ZM200,104H136V61.22l64-11.63ZM101.13,54.22a8,8,0,0,0-6.56-1.73l-64,11.64A8,8,0,0,0,24,72v40a8,8,0,0,0,8,8H96a8,8,0,0,0,8-8V60.36A8,8,0,0,0,101.13,54.22ZM88,104H40V78.68L88,70Z"/></svg>
)

const LinuxLogo = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor"><path d="M229,214.25A8,8,0,0,1,217.76,213C216.39,211.27,184,169.86,184,88A56,56,0,0,0,72,88c0,81.86-32.37,123.27-33.75,125a8,8,0,0,1-12.51-10c.15-.2,7.69-9.9,15.13-28.74C47.77,156.8,56,127.64,56,88a72,72,0,0,1,144,0c0,39.64,8.23,68.8,15.13,86.28,7.48,18.94,15.06,28.64,15.14,28.74A8,8,0,0,1,229,214.25ZM100,88a12,12,0,1,0,12,12A12,12,0,0,0,100,88Zm68,12a12,12,0,1,0-12,12A12,12,0,0,0,168,100ZM99.58,128.84a8,8,0,0,0-7.15,14.31l32,16a7.94,7.94,0,0,0,7.15,0l32-16a8,8,0,0,0-7.16-14.31L128,143.05ZM128,176a54.07,54.07,0,0,0-47,28.11,8,8,0,1,0,14,7.78,37.35,37.35,0,0,1,66,0,8,8,0,0,0,14-7.78A54.07,54.07,0,0,0,128,176Z"/></svg>
)

const AppStoreLogo = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor"><path d="M64.34,196.07l-9.45,16a8,8,0,1,1-13.78-8.14l9.46-16a8,8,0,1,1,13.77,8.14ZM232,152H184.2l-30.73-52a8,8,0,1,0-13.77,8.14l61.41,103.93a8,8,0,0,0,13.78-8.14L193.66,168H232a8,8,0,0,0,0-16Zm-89.53,0H90.38L158.89,36.07a8,8,0,0,0-13.78-8.14L128,56.89l-17.11-29a8,8,0,1,0-13.78,8.14l21.6,36.55L71.8,152H24a8,8,0,0,0,0,16H142.47a8,8,0,1,0,0-16Z"/></svg>
)

const GooglePlayLogo = () => (
  <svg class="w-6 h-6" viewBox="0 0 256 256" fill="currentColor"><path d="M239.82,114.19,72,18.16a16,16,0,0,0-16.12,0A15.68,15.68,0,0,0,48,31.87V224.13a15.68,15.68,0,0,0,7.92,13.67,16,16,0,0,0,16.12,0l167.78-96a15.75,15.75,0,0,0,0-27.62ZM64,212.67V43.33L148.69,128Zm96-73.36,18.92,18.92-88.5,50.66ZM90.4,47.1l88.53,50.67L160,116.69ZM193.31,150l-22-22,22-22,38.43,22Z"/></svg>
)

// Phosphor download-simple icon for the arrow
const DownloadArrow = () => (
  <svg class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor"><path d="M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z"/></svg>
)

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
  { icon: AppleLogo, label: 'macOS', sublabel: 'Apple Silicon & Intel', href: '#' },
  { icon: WindowsLogo, label: 'Windows', sublabel: '10 / 11', href: '#' },
  { icon: LinuxLogo, label: 'Linux', sublabel: '.deb / .AppImage', href: '#' },
]

const MOBILE_PLATFORMS: PlatformOption[] = [
  { icon: AppStoreLogo, label: 'iOS', sublabel: 'iPhone & iPad', href: '#' },
  { icon: GooglePlayLogo, label: 'Android', sublabel: 'Google Play', href: '#' },
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
      <span class="text-sm font-medium text-[var(--text-primary)]">{props.platform.label}</span>
      <span class="text-xs text-[var(--text-muted)]">{props.platform.sublabel}</span>
    </div>
    <span class="ml-auto text-[var(--text-muted)]">
      <DownloadArrow />
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
