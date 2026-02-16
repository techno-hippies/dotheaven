// Re-export icons from the centralized icons package.
// Sidebar NavItem expects `icon: () => any` (zero-arg), so we wrap each
// icon component to apply a default class.
import {
  Home, ChatCircle, User, UsersThree, CalendarBlank,
  Wallet, Gear, DownloadSimple, Plus, Folder, Cloud, ShareNetwork,
  Compass, List,
} from '@heaven/ui/icons'

export const HomeIcon = () => <Home class="w-6 h-6" />
export const ChatCircleIcon = () => <ChatCircle class="w-6 h-6" />
export const UserIcon = () => <User class="w-6 h-6" />
export const SearchIcon = () => <UsersThree class="w-6 h-6" />
export const CalendarIcon = () => <CalendarBlank class="w-6 h-6" />
export const WalletIcon = () => <Wallet class="w-6 h-6" />
export const GearIcon = () => <Gear class="w-5 h-5" />
export const DownloadIcon = () => <DownloadSimple class="w-5 h-5" />
export const PlusIcon = () => <Plus class="w-5 h-5" />
export const FolderIcon = () => <Folder class="w-5 h-5" />
export const CloudIcon = () => <Cloud class="w-5 h-5" />
export const ShareIcon = () => <ShareNetwork class="w-5 h-5" />
export const CompassIcon = () => <Compass class="w-5 h-5" />
export const ListIcon = () => <List class="w-5 h-5" />
