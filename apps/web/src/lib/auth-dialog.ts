/**
 * Shared auth dialog signal — allows any component to open the auth modal.
 *
 * Usage:
 *   import { openAuthDialog } from '../lib/auth-dialog'
 *   openAuthDialog()  // opens the auth modal
 *
 * The AuthDialog component in HeaderActions reads these signals.
 */

import { createSignal } from 'solid-js'

const [authDialogOpen, setAuthDialogOpen] = createSignal(false)

export function openAuthDialog() {
  setAuthDialogOpen(true)
}

export { authDialogOpen, setAuthDialogOpen }
