/**
 * AuthGuard — route guard for protected routes.
 *
 * Redirects unauthenticated users to / (homepage).
 * Renders children only when authenticated.
 */

import type { ParentComponent } from 'solid-js'
import { Show, createEffect } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { useAuth } from '../../providers'

export const AuthGuard: ParentComponent = (props) => {
  const auth = useAuth()
  const navigate = useNavigate()

  createEffect(() => {
    if (auth.isSessionRestoring()) return
    if (!auth.isAuthenticated()) {
      navigate('/', { replace: true })
    }
  })

  return (
    <Show when={auth.isAuthenticated()}>
      {props.children}
    </Show>
  )
}
