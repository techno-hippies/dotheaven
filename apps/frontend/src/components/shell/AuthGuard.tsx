/**
 * AuthGuard — route guard for protected routes.
 *
 * Renders children only when authenticated and not a new user.
 * The landing page for unauthenticated users is handled by AppLayout.
 */

import type { ParentComponent } from 'solid-js'
import { Show } from 'solid-js'
import { useAuth } from '../../providers'

export const AuthGuard: ParentComponent = (props) => {
  const auth = useAuth()

  return (
    <Show when={auth.isAuthenticated() && !auth.isNewUser()}>
      {props.children}
    </Show>
  )
}
