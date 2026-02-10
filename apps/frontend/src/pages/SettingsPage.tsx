import { type Component, createSignal, createResource, createMemo, Show, For } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { Button, PageHeader, SettingsMenu, type SettingsMenuItem, Switch } from '@heaven/ui'
import { Globe, UserCircle, SignOut, Code, ArrowLineUpRight } from '@heaven/ui/icons'
import { HOME } from '@heaven/core'
import { useAuth } from '../providers'
import { useI18n } from '@heaven/i18n/solid'
import { LOCALE_META } from '@heaven/i18n'
import { openAuthDialog } from '../lib/auth-dialog'
import { getEnsProfile, getTextRecord, setTextRecord, computeNode, getPrimaryName } from '../lib/heaven'

export const SettingsPage: Component = () => {
  const auth = useAuth()
  const { t, locale, setLocale } = useI18n()
  const navigate = useNavigate()
  const [saving, setSaving] = createSignal(false)
  const [identityOpen, setIdentityOpen] = createSignal(false)
  const [languageOpen, setLanguageOpen] = createSignal(false)

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
        label: t('profile.identity'),
        value: identityValue(),
        onClick: () => setIdentityOpen(!identityOpen()),
      })
    }

    items.push({
      key: 'account',
      icon: UserCircle,
      label: t('settings.account'),
      description: truncatedAddress(),
    })

    items.push({
      key: 'logout',
      icon: SignOut,
      label: t('auth.logOut'),
      onClick: handleLogout,
      destructive: true,
    })

    return items
  })

  return (
    <div class="h-full overflow-y-auto">
      <PageHeader title={t('settings.title')} />

      <div class="max-w-2xl mx-auto px-4 md:px-6 py-6">
        <Show
          when={auth.isAuthenticated()}
          fallback={
            <div class="text-center py-12">
              <p class="text-base text-[var(--text-secondary)] mb-4">{t('settings.signInPrompt')}</p>
              <Button onClick={() => openAuthDialog()}>{t('auth.signIn')}</Button>
            </div>
          }
        >
          <SettingsMenu items={menuItems()} />

          {/* Expanded identity toggle */}
          <Show when={identityOpen() && showIdentityToggle()}>
            <div class="mt-4 rounded-md bg-[var(--bg-surface)] px-4 py-4">
              <p class="text-base text-[var(--text-secondary)] mb-3">
                {t('settings.identityToggleDescription')}
              </p>
              <Switch
                checked={displayIdentity() === 'heaven'}
                onChange={(checked) => handleToggle(checked)}
                disabled={saving() || displayIdentity.loading}
                label={displayIdentity() === 'heaven' ? `${heavenName()}.heaven` : `${ensProfile()?.name}`}
                description={displayIdentity() === 'heaven'
                  ? t('settings.showAsHeaven')
                  : t('settings.showAsEns')}
              />
            </div>
          </Show>
        </Show>

        {/* Language switcher — always visible */}
        <div class="mt-6">
          <button
            type="button"
            class="w-full flex items-center justify-between px-4 py-3 rounded-md bg-[var(--bg-surface)] hover:bg-[var(--bg-highlight-hover)] transition-colors cursor-pointer"
            onClick={() => setLanguageOpen(!languageOpen())}
          >
            <div class="flex items-center gap-3">
              <Globe class="w-5 h-5 text-[var(--text-secondary)]" />
              <span class="text-base font-medium text-[var(--text-primary)]">{t('settings.language')}</span>
            </div>
            <span class="text-base text-[var(--text-muted)]">
              {LOCALE_META.find((l) => l.code === locale())?.nativeName ?? locale()}
            </span>
          </button>
          <Show when={languageOpen()}>
            <div class="mt-2 rounded-md bg-[var(--bg-surface)] px-2 py-2 flex flex-col gap-1">
              <For each={LOCALE_META}>
                {(meta) => (
                  <button
                    type="button"
                    class={`flex items-center justify-between px-3 py-2.5 rounded-md transition-colors cursor-pointer ${
                      locale() === meta.code
                        ? 'bg-[var(--bg-highlight)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-highlight-hover)]'
                    }`}
                    onClick={() => {
                      setLocale(meta.code)
                      setLanguageOpen(false)
                    }}
                  >
                    <span class="text-base font-medium">{meta.nativeName}</span>
                    <span class="text-sm text-[var(--text-muted)]">{meta.name}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Repository link */}
        <div class="mt-6">
          <a
            href="https://app.radicle.xyz/nodes/radicle.jarg.io/rad%3AzFPXXmn5fnwzNUbUG7Wj1iSKLYQw"
            target="_blank"
            rel="noopener noreferrer"
            class="w-full flex items-center justify-between px-4 py-3 rounded-md bg-[var(--bg-surface)] hover:bg-[var(--bg-highlight-hover)] transition-colors"
          >
            <div class="flex items-center gap-3">
              <Code class="w-5 h-5 text-[var(--text-secondary)]" />
              <span class="text-base font-medium text-[var(--text-primary)]">Source Code (GPLv3)</span>
            </div>
            <ArrowLineUpRight class="w-5 h-5 text-[var(--text-secondary)]" />
          </a>
        </div>
      </div>
    </div>
  )
}
