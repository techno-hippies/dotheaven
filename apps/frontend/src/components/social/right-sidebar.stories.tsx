import type { Meta, StoryObj } from 'storybook-solidjs'
import { RightSidebar, RightSidebarSection } from './right-sidebar'
import { NowPlaying } from '../player/now-playing'
import { PostCard } from './post-card'
import { CommentItem, CommentSection } from './comment-item'
import { FollowButton } from './follow-button'
import { HeartIcon, CommentIcon, type EngagementAction } from './engagement-bar'

const meta: Meta<typeof RightSidebar> = {
  title: 'UI/RightSidebar',
  component: RightSidebar,
  parameters: {
    layout: 'centered',
  },
}

export default meta
type Story = StoryObj<typeof RightSidebar>

// Example engagement actions
const engagementActions: EngagementAction[] = [
  { icon: <HeartIcon />, count: '4.2K', label: 'Like' },
  { icon: <CommentIcon />, count: '328', label: 'Comment' },
]

/**
 * Full composition matching the design mockup:
 * - Now Playing section with album art and unlock button
 * - Post card with engagement
 * - Comments section
 */
export const FullComposition: Story = {
  render: () => (
    <div class="w-[320px] h-[800px] bg-[var(--bg-surface)] rounded-xl">
      <RightSidebar>
        {/* Now Playing Section */}
        <RightSidebarSection>
          <NowPlaying
            title="Neon Dreams"
            artist="Synthwave Collective"
            albumArtSrc="https://picsum.photos/seed/neon/400/400"
            isLocked
            unlockPrice="$1"
            onShare={() => console.log('Share track')}
          />
        </RightSidebarSection>

        {/* Post Section */}
        <RightSidebarSection>
          <PostCard
            authorName="nightwalker"
            authorHandle="nightwalker"
            authorAvatarSrc="https://picsum.photos/seed/nw/100/100"
            content="Walking through the city after midnight. The neon lights hit different at 2am."
            engagementActions={engagementActions}
            headerAction={<FollowButton />}
          >
            {/* Comments */}
            <CommentSection title="Comments" class="mt-4">
              <CommentItem authorName="urbanexplorer">
                The vibe is immaculate 🔥
              </CommentItem>
              <CommentItem authorName="neonlights">
                Where is this? Need to visit
              </CommentItem>
            </CommentSection>
          </PostCard>
        </RightSidebarSection>
      </RightSidebar>
    </div>
  ),
}

/**
 * Now Playing only
 */
export const NowPlayingOnly: Story = {
  render: () => (
    <div class="w-[320px] bg-[var(--bg-surface)] rounded-xl p-4">
      <NowPlaying
        title="Midnight City"
        artist="M83"
        albumArtSrc="https://picsum.photos/seed/m83/400/400"
        isLocked
        unlockPrice="$0.99"
        onShare={() => console.log('Share track')}
      />
    </div>
  ),
}

/**
 * Post with engagement and comments
 */
export const PostOnly: Story = {
  render: () => (
    <div class="w-[320px] bg-[var(--bg-surface)] rounded-xl p-4">
      <PostCard
        authorName="synthwave_fan"
        authorHandle="synthwave_fan"
        content="Just discovered this amazing track. The production quality is insane!"
        engagementActions={[
          { icon: <HeartIcon filled />, count: '1.2K', label: 'Like', active: true },
          { icon: <CommentIcon />, count: '45', label: 'Comment' },
        ]}
        headerAction={<FollowButton isFollowing />}
      >
        <CommentSection title="Comments" class="mt-4">
          <CommentItem authorName="producer101">
            The mixing is so clean
          </CommentItem>
          <CommentItem authorName="beatmaker">
            What DAW do they use?
          </CommentItem>
          <CommentItem authorName="audiophile">
            Need this on vinyl
          </CommentItem>
        </CommentSection>
      </PostCard>
    </div>
  ),
}

/**
 * Unlocked state
 */
export const UnlockedTrack: Story = {
  render: () => (
    <div class="w-[320px] bg-[var(--bg-surface)] rounded-xl p-4">
      <NowPlaying
        title="Electric Dreams"
        artist="Future Sound"
        albumArtSrc="https://picsum.photos/seed/electric/400/400"
        isLocked={false}
        onShare={() => console.log('Share track')}
      />
    </div>
  ),
}
