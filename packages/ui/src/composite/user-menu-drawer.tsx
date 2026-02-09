import type { Component } from 'solid-js'
import { Drawer, DrawerContent } from '../primitives/drawer'
import { Avatar } from '../primitives/avatar'
import { Gear, SignOut, User } from '../icons'

export interface UserMenuDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  avatarUrl?: string
  displayName: string
  username: string
  onProfile?: () => void
  onSettings?: () => void
  onLogout?: () => void
}

export const UserMenuDrawer: Component<UserMenuDrawerProps> = (props) => {
  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange}>
      <DrawerContent showHandle={true}>
        {/* User header */}
        <div class="flex items-center gap-3 px-2 pt-4 pb-4">
          <Avatar
            src={props.avatarUrl}
            alt={props.displayName}
            size="lg"
          />
          <div class="flex flex-col min-w-0">
            <span class="text-base font-semibold text-[var(--text-primary)] truncate">
              {props.displayName}
            </span>
            <span class="text-base text-[var(--text-muted)] truncate">
              {props.username}
            </span>
          </div>
        </div>

        {/* Menu items */}
        <div class="flex flex-col gap-1 pb-4">
          <button
            type="button"
            class="flex items-center gap-3 px-2 py-3 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-highlight-hover)] transition-colors cursor-pointer"
            onClick={() => {
              props.onOpenChange(false)
              props.onProfile?.()
            }}
          >
            <User class="w-5 h-5" />
            <span class="text-base font-medium">Profile</span>
          </button>

          <button
            type="button"
            class="flex items-center gap-3 px-2 py-3 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-highlight-hover)] transition-colors cursor-pointer"
            onClick={() => {
              props.onOpenChange(false)
              props.onSettings?.()
            }}
          >
            <Gear class="w-5 h-5" />
            <span class="text-base font-medium">Settings</span>
          </button>

          <button
            type="button"
            class="flex items-center gap-3 px-2 py-3 rounded-md text-red-400 hover:bg-[var(--bg-highlight-hover)] transition-colors cursor-pointer"
            onClick={() => {
              props.onOpenChange(false)
              props.onLogout?.()
            }}
          >
            <SignOut class="w-5 h-5" />
            <span class="text-base font-medium">Log Out</span>
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
