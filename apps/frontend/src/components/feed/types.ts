/**
 * Shared types for feed/video components
 */

export interface VideoPostData {
  id: string
  videoUrl?: string
  thumbnailUrl?: string
  username: string
  userAvatar?: string
  /** Caption/description text */
  caption?: string
  /** Track title playing in this video */
  trackTitle?: string
  /** Artist name */
  trackArtist?: string
  /** Album/track cover image */
  trackCoverUrl?: string
  likes: number
  comments: number
  shares: number
  isLiked?: boolean
  /** Whether user can interact (logged in) */
  canInteract?: boolean
  /** Video duration in seconds */
  duration?: number
}

export interface VideoPlayerProps {
  videoUrl?: string
  thumbnailUrl?: string
  isPlaying: boolean
  isMuted: boolean
  onTogglePlay: () => void
  onPlayFailed?: () => void
  onTimeUpdate?: (currentTime: number) => void
  class?: string
  priorityLoad?: boolean
}

export interface VideoActionsProps {
  userAvatar?: string
  username: string
  onProfileClick: () => void
  isLiked: boolean
  likeCount?: number
  onLikeClick: () => void
  commentCount?: number
  onCommentClick?: () => void
  onShareClick: () => void
  /** Track info for audio button */
  trackTitle?: string
  trackArtist?: string
  trackCoverUrl?: string
  onTrackClick?: () => void
  isMuted: boolean
  onToggleMute: () => void
  class?: string
}

export interface VerticalVideoFeedProps {
  videos: VideoPostData[]
  isLoading?: boolean
  onLoadMore?: () => void
  hasMore?: boolean
  initialVideoId?: string
  onLikeClick?: (videoId: string) => void
  onCommentClick?: (videoId: string) => void
  onShareClick?: (videoId: string) => void
  onProfileClick?: (username: string) => void
  onTrackClick?: (videoId: string) => void
  /** Called when video has been watched for 3+ seconds */
  onVideoViewed?: (postId: string) => void
}
