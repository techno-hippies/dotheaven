import { type Component, createSignal } from 'solid-js'
import {
  AppShell,
  Header,
  RightPanel,
  MusicPlayer,
} from '@heaven/ui'
import { AppSidebar, HeaderActions } from '../components/shell'
import { ProfilePage, type ProfileTab } from '../components/profile'
import { useAuth } from '../providers'

export const MyProfilePage: Component = () => {
  const auth = useAuth()
  const [activeTab, setActiveTab] = createSignal<ProfileTab>('activity')

  const truncatedAddress = () => {
    const addr = auth.pkpAddress()
    if (!addr) return 'Unknown'
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
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
        <ProfilePage
          username={truncatedAddress()}
          displayName="My Profile"
          stats={{
            followers: 0,
            following: 0,
            likes: 0,
          }}
          isOwnProfile={true}
          activeTab={activeTab()}
          onTabChange={setActiveTab}
        />
      </div>
    </AppShell>
  )
}
