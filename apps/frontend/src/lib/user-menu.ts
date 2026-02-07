/**
 * Shared user menu drawer signal — allows any component to open the drawer.
 *
 * Usage:
 *   import { openUserMenu } from '../lib/user-menu'
 *   openUserMenu()  // opens the user menu drawer
 *
 * The UserMenuDrawer in AppLayout reads these signals.
 */

import { createSignal } from 'solid-js'

const [userMenuOpen, setUserMenuOpen] = createSignal(false)

export function openUserMenu() {
  setUserMenuOpen(true)
}

export { userMenuOpen, setUserMenuOpen }
