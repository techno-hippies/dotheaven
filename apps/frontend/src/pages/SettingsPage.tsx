import { type Component, createSignal, createResource, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { Button, Switch } from '@heaven/ui'
import { useAuth } from '../providers'
import { getEnsProfile, getTextRecord, setTextRecord, computeNode, getPrimaryName } from '../lib/heaven'

export const SettingsPage: Component = () => {
  const auth = useAuth()
  const navigate = useNavigate()
  const [saving, setSaving] = createSignal(false)

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
    navigate('/')
  }

  return (
    <div class="h-full overflow-y-auto">
      <div class="max-w-2xl mx-auto px-6 py-8">
        <h1 class="text-2xl font-bold text-[var(--text-primary)] mb-6">Settings</h1>

        {/* Identity section */}
        <Show when={showIdentityToggle()}>
          <div class="border-b border-[var(--bg-highlight)] pb-6 mb-6">
            <h2 class="text-lg font-semibold text-[var(--text-primary)] mb-2">Identity</h2>
            <p class="text-base text-[var(--text-secondary)] mb-4">
              You have both <span class="text-[var(--text-primary)] font-medium">{heavenName()}.heaven</span> and{' '}
              <span class="text-[var(--text-primary)] font-medium">{ensProfile()?.name}</span>. Choose which to display on your posts.
            </p>
            <div class="flex items-center gap-3">
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
          </div>
        </Show>

        {/* Account section */}
        <div class="border-b border-[var(--bg-highlight)] pb-6 mb-6">
          <h2 class="text-lg font-semibold text-[var(--text-primary)] mb-2">Account</h2>
          <p class="text-base text-[var(--text-secondary)] mb-4">
            Signed in as {auth.pkpAddress()?.slice(0, 6)}...{auth.pkpAddress()?.slice(-4)}
          </p>
          <Button
            variant="destructive"
            onClick={handleLogout}
          >
            Log Out
          </Button>
        </div>
      </div>
    </div>
  )
}
