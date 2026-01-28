import { type Component, createSignal } from 'solid-js'
import {
  AppShell,
  Header,
  RightPanel,
  Avatar,
  IconButton,
  MusicPlayer,
} from '@heaven/ui'
import { AppSidebar } from '../components/shell'
import { ProfilePage, type ProfileTab } from '../components/profile'
import { useAuth } from '../providers'
import { useNavigate } from '@solidjs/router'

const BellIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

export const MyProfilePage: Component = () => {
  const auth = useAuth()
  const navigate = useNavigate()
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
          rightSlot={
            <div class="flex items-center gap-3">
              <IconButton variant="ghost" size="md" aria-label="Notifications">
                <BellIcon />
              </IconButton>
              <button
                onClick={() => navigate('/profile')}
                class="flex items-center gap-2 hover:opacity-80 transition-opacity"
                title={`Signed in as ${auth.pkpAddress()?.slice(0, 6)}...${auth.pkpAddress()?.slice(-4)}`}
              >
                <Avatar size="sm" class="cursor-pointer" />
              </button>
            </div>
          }
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
