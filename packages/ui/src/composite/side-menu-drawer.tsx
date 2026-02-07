import type { Component, JSX } from 'solid-js'
import { Show } from 'solid-js'
import { Drawer, DrawerContent } from '../primitives/drawer'
import { Avatar } from '../primitives/avatar'
import { Gear, Wallet, SignOut, GithubLogo } from '../icons'

export interface SideMenuDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Whether the user is authenticated */
  isAuthenticated?: boolean
  /** User avatar URL */
  avatarUrl?: string
  /** Display name (heaven name or truncated address) */
  displayName?: string
  /** Username / address label */
  username?: string
  /** Logo image source */
  logoSrc?: string
  /** Navigation callbacks */
  onSettings?: () => void
  onWallet?: () => void
  onLogout?: () => void
  /** Extra nav items to render above the bottom section */
  extraItems?: JSX.Element
}

export const SideMenuDrawer: Component<SideMenuDrawerProps> = (props) => {
  const handleNav = (cb?: () => void) => {
    props.onOpenChange(false)
    cb?.()
  }

  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange} side="left">
      <DrawerContent
        side="left"
        class="!w-[280px] !max-w-[85vw]"
        footer={
          <div class="flex flex-col gap-1">
            {/* GitHub link */}
            <a
              href="https://github.com/nichochar/dotheaven"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-3 px-2 py-3 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-highlight-hover)] transition-colors cursor-pointer"
              onClick={() => props.onOpenChange(false)}
            >
              <GithubLogo class="w-5 h-5" />
              <span class="text-sm font-medium">GitHub</span>
            </a>

            {/* Log out (authenticated only) */}
            <Show when={props.isAuthenticated}>
              <button
                type="button"
                class="flex items-center gap-3 px-2 py-3 rounded-md text-red-400 hover:bg-[var(--bg-highlight-hover)] transition-colors cursor-pointer"
                onClick={() => handleNav(props.onLogout)}
              >
                <SignOut class="w-5 h-5" />
                <span class="text-sm font-medium">Log Out</span>
              </button>
            </Show>
          </div>
        }
      >
        {/* Header: Logo */}
        <div class="flex items-center gap-3 pb-4 border-b border-[var(--border-subtle)]">
          <Show
            when={props.logoSrc}
            fallback={
              <span class="text-lg font-bold text-[var(--text-primary)]">heaven</span>
            }
          >
            <img
              src={props.logoSrc}
              alt="Heaven"
              class="w-8 h-8 object-contain"
            />
            <span class="text-lg font-bold text-[var(--text-primary)]">heaven</span>
          </Show>
        </div>

        {/* User info (authenticated only) */}
        <Show when={props.isAuthenticated && props.displayName}>
          <div class="flex items-center gap-3 py-4 border-b border-[var(--border-subtle)]">
            <Avatar
              src={props.avatarUrl}
              alt={props.displayName ?? ''}
              size="md"
            />
            <div class="flex flex-col min-w-0">
              <span class="text-sm font-semibold text-[var(--text-primary)] truncate">
                {props.displayName}
              </span>
              <Show when={props.username}>
                <span class="text-xs text-[var(--text-muted)] truncate">
                  {props.username}
                </span>
              </Show>
            </div>
          </div>
        </Show>

        {/* Navigation items */}
        <nav class="flex flex-col gap-1 pt-4">
          <button
            type="button"
            class="flex items-center gap-3 px-2 py-3 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-highlight-hover)] transition-colors cursor-pointer"
            onClick={() => handleNav(props.onSettings)}
          >
            <Gear class="w-5 h-5" />
            <span class="text-sm font-medium">Settings</span>
          </button>

          <button
            type="button"
            class="flex items-center gap-3 px-2 py-3 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-highlight-hover)] transition-colors cursor-pointer"
            onClick={() => handleNav(props.onWallet)}
          >
            <Wallet class="w-5 h-5" />
            <span class="text-sm font-medium">Wallet</span>
          </button>

          {props.extraItems}
        </nav>
      </DrawerContent>
    </Drawer>
  )
}
