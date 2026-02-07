/**
 * MobilePageHeader — wraps PageHeader with the user's avatar on mobile.
 *
 * On mobile: avatar (left) + centered title + optional right slot.
 * On desktop: just the title + right slot (avatar hidden, sidebar visible).
 *
 * Tapping the avatar opens the SideMenuDrawer via the shared signal.
 */

import type { Component, JSX } from 'solid-js'
import { createMemo } from 'solid-js'
import { useQueryClient } from '@tanstack/solid-query'
import { Avatar, PageHeader, type ProfileInput } from '@heaven/ui'
import { useAuth } from '../../providers'
import { openUserMenu } from '../../lib/user-menu'

export interface MobilePageHeaderProps {
  title: string
  rightSlot?: JSX.Element
  class?: string
}

export const MobilePageHeader: Component<MobilePageHeaderProps> = (props) => {
  const auth = useAuth()
  const queryClient = useQueryClient()

  const cachedAvatarUrl = createMemo(() => {
    const addr = auth.pkpAddress()
    if (!addr) return undefined
    const queries = queryClient.getQueriesData<ProfileInput>({ queryKey: ['profile', addr] })
    for (const [, data] of queries) {
      if (data?.avatar) return data.avatar
    }
    return undefined
  })

  return (
    <PageHeader
      title={props.title}
      class={props.class}
      leftSlot={
        <div class="md:hidden">
          <button
            type="button"
            class="cursor-pointer"
            aria-label="Open menu"
            onClick={openUserMenu}
          >
            <Avatar
              src={cachedAvatarUrl()}
              alt="Menu"
              size="sm"
            />
          </button>
        </div>
      }
      rightSlot={props.rightSlot}
    />
  )
}
