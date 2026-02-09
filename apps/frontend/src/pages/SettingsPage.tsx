import { type Component, createSignal, createResource, createMemo, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { Button, PageHeader, SettingsMenu, type SettingsMenuItem, Switch } from '@heaven/ui'
import { Globe, UserCircle, SignOut } from '@heaven/ui/icons'
import { HOME } from '@heaven/core'
import { useAuth } from '../providers'
import { openAuthDialog } from '../lib/auth-dialog'
import { getEnsProfile, getTextRecord, setTextRecord, computeNode, getPrimaryName } from '../lib/heaven'

export const SettingsPage: Component = () => {
  const auth = useAuth()
  const navigate = useNavigate()
  const [saving, setSaving] = createSignal(false)
  const [identityOpen, setIdentityOpen] = createSignal(false)

  // Fetch linked EOA's ENS profile
  const [ensProfile] = createResource(
    () => auth.eoaAddress(),
    async (addr) => {
      if (!addr) return null
      return getEnsProfile(addr)
    },
  )

  // Fetch heaven name for this PKP
  const [heavenName] = createResource(
    () => auth.pkpAddress(),
    async (addr) => {
      if (!addr) return null
      const result = await getPrimaryName(addr).catch(() => null)
      return result?.label ?? null
    },
  )

  // Fetch current display identity preference
  const [displayIdentity, { mutate: setDisplayIdentity }] = createResource(
    () => {
      const name = heavenName()
      return name ? computeNode(name) : null
    },
    async (node) => {
      if (!node) return 'ens' // default
      const pref = await getTextRecord(node, 'heaven.displayIdentity').catch(() => '')
      return pref === 'heaven' ? 'heaven' : 'ens' // default to ENS
    },
  )

  const hasEns = () => !!ensProfile()?.name
  const hasHeaven = () => !!heavenName()
  const showIdentityToggle = () => hasEns() && hasHeaven()

  const handleToggle = async (preferHeaven: boolean) => {
    const name = heavenName()
    const pkp = auth.pkpInfo()
    if (!name || !pkp) return

    setSaving(true)
    try {
      const authContext = await auth.getAuthContext()
      const node = computeNode(name)
      const value = preferHeaven ? 'heaven' : 'ens'
      const result = await setTextRecord(node, 'heaven.displayIdentity', value, pkp.publicKey, authContext)
      if (result.success) {
        setDisplayIdentity(value)
      } else {
        console.error('[Settings] Failed to save identity preference:', result.error)
      }
    } catch (err) {
      console.error('[Settings] Error saving identity preference:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    await auth.logout()
    navigate(HOME)
  }

  const truncatedAddress = () => {
    const addr = auth.pkpAddress()
    return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : ''
  }

  const identityValue = () => {
    if (displayIdentity() === 'heaven' && heavenName()) return `${heavenName()}.heaven`
    if (ensProfile()?.name) return ensProfile()!.name!
    return undefined
  }

  const menuItems = createMemo<SettingsMenuItem[]>(() => {
    const items: SettingsMenuItem[] = []

    if (showIdentityToggle()) {
      items.push({
        key: 'identity',
        icon: Globe,
        label: 'Identity',
        value: identityValue(),
        onClick: () => setIdentityOpen(!identityOpen()),
      })
    }

    items.push({
      key: 'account',
      icon: UserCircle,
      label: 'Account',
      description: truncatedAddress(),
    })

    items.push({
      key: 'logout',
      icon: SignOut,
      label: 'Log Out',
      onClick: handleLogout,
      destructive: true,
    })

    return items
  })

  return (
    <div class="h-full overflow-y-auto">
      <PageHeader title="Settings" />

      <div class="max-w-2xl mx-auto px-4 md:px-6 py-6">
        <Show
          when={auth.isAuthenticated()}
          fallback={
            <div class="text-center py-12">
              <p class="text-base text-[var(--text-secondary)] mb-4">Sign in to manage your settings.</p>
              <Button onClick={() => openAuthDialog()}>Sign In</Button>
            </div>
          }
        >
          <SettingsMenu items={menuItems()} />

          {/* Expanded identity toggle */}
          <Show when={identityOpen() && showIdentityToggle()}>
            <div class="mt-4 rounded-md bg-[var(--bg-surface)] px-4 py-4">
              <p class="text-base text-[var(--text-secondary)] mb-3">
                Choose which name to display on your posts.
              </p>
              <Switch
                checked={displayIdentity() === 'heaven'}
                onChange={(checked) => handleToggle(checked)}
                disabled={saving() || displayIdentity.loading}
                label={displayIdentity() === 'heaven' ? `Show as ${heavenName()}.heaven` : `Show as ${ensProfile()?.name}`}
                description={displayIdentity() === 'heaven'
                  ? 'Your Heaven name will be shown on posts'
                  : 'Your ENS name will be shown on posts'}
              />
            </div>
          </Show>
        </Show>
      </div>
    </div>
  )
}
