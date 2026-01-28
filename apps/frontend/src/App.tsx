import { type Component, Show } from 'solid-js'
import { usePlatform } from 'virtual:heaven-platform'
import {
  AppShell,
  Sidebar,
  SidebarSection,
  RightPanel,
  Header,
  MusicPlayer,
  WelcomeScreen,
  ListItem,
  Avatar,
  AlbumCover,
  IconButton,
  Button,
} from '@heaven/ui'
import { useAuth } from './providers'

const ChatCircleIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-4-1.08,7.85,7.85,0,0,0-2.53.42L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
  </svg>
)

const MusicNotesIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V62.25l112-28V134.08A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69ZM52,216a20,20,0,1,1,20-20A20,20,0,0,1,52,216Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,184Z" />
  </svg>
)

const PlusIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const ChevronDownIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

const BellIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

const FolderPlusIcon = () => (
  <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    <line x1="12" y1="10" x2="12" y2="16" />
    <line x1="9" y1="13" x2="15" y2="13" />
  </svg>
)

const UploadIcon = () => (
  <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

export const App: Component = () => {
  const platform = usePlatform()
  const auth = useAuth()

  console.log('[App] Platform:', platform.platform, 'isTauri:', platform.isTauri)

  // Tauri: Open folder picker dialog
  const handleAddFolders = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        directory: true,
        multiple: true,
        title: 'Select Music Folders',
      })
      if (selected) {
        console.log('Selected folders:', selected)
        // TODO: Process selected folders
      }
    } catch (err) {
      console.error('Failed to open folder picker:', err)
    }
  }

  // Web: Open file upload dialog
  const handleUploadFiles = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = 'audio/*'
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files?.length) {
        console.log('Selected files:', Array.from(files).map((f) => f.name))
        // TODO: Process uploaded files
      }
    }
    input.click()
  }

  // Platform-aware action handler
  const handleWelcomeAction = platform.isTauri ? handleAddFolders : handleUploadFiles

  const handleLogin = () => {
    auth.loginWithPasskey()
  }

  const handleRegister = () => {
    auth.registerWithPasskey()
  }

  const handleLogout = () => {
    auth.logout()
  }

  return (
    <AppShell
      header={
        <Header
          rightSlot={
            <div class="flex items-center gap-3">
              <Show
                when={auth.isAuthenticated()}
                fallback={
                  <Show
                    when={auth.isAuthenticating()}
                    fallback={
                      <>
                        <Button variant="secondary" onClick={handleLogin}>
                          Login
                        </Button>
                        <Button variant="default" onClick={handleRegister}>
                          Sign Up
                        </Button>
                      </>
                    }
                  >
                    {/* Tauri: auth happens in browser, show waiting message */}
                    <Show when={platform.isTauri}>
                      <span class="text-sm text-[var(--text-secondary)]">
                        Complete sign-in in browser...
                      </span>
                      <Button variant="secondary" onClick={() => auth.cancelAuth()}>
                        Cancel
                      </Button>
                    </Show>
                    {/* Web: auth happens in-page via WebAuthn prompt, show spinner */}
                    <Show when={!platform.isTauri}>
                      <span class="text-sm text-[var(--text-secondary)]">
                        Authenticating...
                      </span>
                    </Show>
                  </Show>
                }
              >
                <IconButton variant="ghost" size="md" aria-label="Notifications">
                  <BellIcon />
                </IconButton>
                <button
                  onClick={handleLogout}
                  class="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  title={`Signed in as ${auth.pkpAddress()?.slice(0, 6)}...${auth.pkpAddress()?.slice(-4)}`}
                >
                  <Avatar size="sm" class="cursor-pointer" />
                </button>
              </Show>
            </div>
          }
        />
      }
      sidebar={
        <Sidebar>
          <SidebarSection
            title="Chat"
            icon={<ChatCircleIcon />}
            action={
              <div class="flex items-center gap-1">
                <IconButton variant="soft" size="md" aria-label="Add chat">
                  <PlusIcon />
                </IconButton>
                <IconButton variant="soft" size="md" aria-label="Chat options">
                  <ChevronDownIcon />
                </IconButton>
              </div>
            }
          >
            <ListItem
              title="vitalik.eth"
              subtitle="Hey, did you see the new proposal?"
              cover={<Avatar size="sm" />}
            />
            <ListItem
              title="nick.heaven"
              subtitle="The transaction went through"
              cover={<Avatar size="sm" />}
            />
          </SidebarSection>
          <SidebarSection
            title="Music"
            icon={<MusicNotesIcon />}
            action={
              <div class="flex items-center gap-1">
                <IconButton variant="soft" size="md" aria-label="Add playlist">
                  <PlusIcon />
                </IconButton>
                <IconButton variant="soft" size="md" aria-label="Music options">
                  <ChevronDownIcon />
                </IconButton>
              </div>
            }
          >
            <ListItem
              title="Liked Songs"
              subtitle="0 songs"
              cover={<AlbumCover size="sm" icon="heart" />}
            />
            <ListItem
              title="Free Weekly"
              subtitle="Playlist • technohippies"
              cover={<AlbumCover size="sm" icon="playlist" />}
            />
          </SidebarSection>
        </Sidebar>
      }
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
      <WelcomeScreen
        onAction={handleWelcomeAction}
        actionLabel={platform.isTauri ? 'Add Folders' : 'Upload Files'}
        actionIcon={platform.isTauri ? <FolderPlusIcon /> : <UploadIcon />}
        subtitle={
          platform.isTauri
            ? 'Add your music folders to start listening'
            : 'Upload your music files to start listening'
        }
        logoSrc="/images/heaven.png"
        class="rounded-xl"
      />
    </AppShell>
  )
}
