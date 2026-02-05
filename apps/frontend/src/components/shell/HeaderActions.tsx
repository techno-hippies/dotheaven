import { type Component, Show } from 'solid-js'
import { Button } from '@heaven/ui'
import { useAuth } from '../../providers'
import { setAuthDialogOpen } from '../../lib/auth-dialog'

/**
 * Shared header actions with auth state handling.
 * When unauthenticated, shows Login/Sign Up buttons that open the auth modal.
 */
export const HeaderActions: Component = () => {
  const auth = useAuth()

  return (
    <div class="flex items-center gap-3">
      <Show
        when={auth.isAuthenticated()}
        fallback={
          <>
            <Button
              variant="secondary"
              onClick={() => setAuthDialogOpen(true)}
              class="w-[125px]"
            >
              Login
            </Button>
            <Button
              variant="default"
              onClick={() => setAuthDialogOpen(true)}
              class="w-[125px]"
            >
              Sign Up
            </Button>
          </>
        }
      >
        {/* Authenticated state on desktop: nothing (notifications in sidebar) */}
        <></>
      </Show>
    </div>
  )
}
