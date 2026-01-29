import { type Component } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import {
  AppShell,
  Header,
  RightPanel,
  MusicPlayer,
  Button,
} from '@heaven/ui'
import { AppSidebar, HeaderActions } from '../components/shell'
import { useAuth } from '../providers'

export const SettingsPage: Component = () => {
  const auth = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await auth.logout()
    navigate('/')
  }

  return (
    <AppShell
      header={
        <Header
          rightSlot={<HeaderActions />}
        />
      }
      sidebar={<AppSidebar />}
      rightPanel={
        <RightPanel>
          <div class="p-4">
            <h3 class="text-base font-semibold text-[var(--text-primary)] mb-4">Now Playing</h3>
            <div class="aspect-square bg-[var(--bg-highlight)] rounded-lg mb-4" />
            <p class="text-lg font-semibold text-[var(--text-primary)]">Neon Dreams</p>
            <p class="text-base text-[var(--text-secondary)]">Synthwave Collective</p>
          </div>
        </RightPanel>
      }
      footer={
        <MusicPlayer
          title="Neon Dreams"
          artist="Synthwave Collective"
          currentTime="2:47"
          duration="4:39"
          progress={58}
          isPlaying
        />
      }
    >
      <div class="h-full overflow-y-auto">
        <div class="max-w-2xl mx-auto px-6 py-8">
          <h1 class="text-2xl font-bold text-[var(--text-primary)] mb-6">Settings</h1>

          <div class="bg-[var(--bg-surface)] rounded-lg p-6 mb-4">
            <h2 class="text-lg font-semibold text-[var(--text-primary)] mb-2">Account</h2>
            <p class="text-sm text-[var(--text-secondary)] mb-4">
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
    </AppShell>
  )
}
