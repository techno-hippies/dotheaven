import { type Component, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { Button } from '@heaven/ui'
import { useAuth } from '../../providers'

/**
 * Shared header actions with auth state handling.
 * When unauthenticated (visible on public routes), shows Login/Sign Up buttons
 * that navigate to the home page (which shows the landing page via AuthGuard).
 */
export const HeaderActions: Component = () => {
  const auth = useAuth()
  const navigate = useNavigate()

  return (
    <div class="flex items-center gap-3">
      <Show
        when={auth.isAuthenticated()}
        fallback={
          <>
            <Button
              variant="secondary"
              onClick={() => navigate('/')}
              class="w-[125px]"
            >
              Login
            </Button>
            <Button
              variant="default"
              onClick={() => navigate('/')}
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
