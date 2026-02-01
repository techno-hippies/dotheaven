import type { Meta, StoryObj } from 'storybook-solidjs'
import { FeedPost } from './feed-post'
import { PostComposer } from './post-composer'

const meta: Meta = {
  title: 'Composite/Feed',
  parameters: { layout: 'centered' },
}

export default meta

const noop = () => {}

export const DesktopFeed: StoryObj = {
  render: () => (
    <div style={{ width: '600px', height: '900px', overflow: 'auto', background: 'var(--bg-page)' }}>
      {/* Composer */}
      <div class="bg-[var(--bg-surface)] rounded-md mb-3">
        <PostComposer
          avatarUrl="https://placewaifu.com/image/100"
          onPhotoClick={noop}
          onVideoClick={noop}
          onMusicClick={noop}
          onSubmit={noop}
        />
      </div>

      {/* Feed */}
      <div class="bg-[var(--bg-surface)] rounded-md divide-y divide-[var(--bg-highlight)]">
        <FeedPost
          authorName="Yuki"
          authorHandle="yuki.heaven"
          authorAvatarUrl="https://placewaifu.com/image/100"
          timestamp="2h ago"
          text="Just discovered this amazing album. The production quality is insane, every track flows into the next perfectly. Highly recommend giving it a full listen with headphones."
          likes={42}
          comments={7}
          onLike={noop}
          onComment={noop}
        />

        <FeedPost
          authorName="Miku"
          authorHandle="miku.heaven"
          authorAvatarUrl="https://placewaifu.com/image/101"
          timestamp="4h ago"
          text="Sunset vibes from the rooftop"
          media={{ type: 'photo', items: [{ url: 'https://placewaifu.com/image/800/450', aspect: 'landscape' }] }}
          likes={234}
          comments={18}
          onLike={noop}
          onComment={noop}
        />

        <FeedPost
          authorName="Rei"
          authorHandle="rei.heaven"
          authorAvatarUrl="https://placewaifu.com/image/102"
          timestamp="6h ago"
          text="New album art is incredible"
          media={{ type: 'photo', items: [{ url: 'https://placewaifu.com/image/500', aspect: 'square' }] }}
          likes={28}
          comments={3}
          isLiked
          onLike={noop}
          onComment={noop}
        />

        <FeedPost
          authorName="Asuka"
          authorHandle="asuka.eth"
          authorAvatarUrl="https://placewaifu.com/image/103"
          timestamp="8h ago"
          text="Concert was incredible last night"
          media={{ type: 'photo', items: [
            { url: 'https://placewaifu.com/image/400/400' },
            { url: 'https://placewaifu.com/image/401/401' },
          ]}}
          likes={312}
          comments={45}
          onLike={noop}
          onComment={noop}
        />

        <FeedPost
          authorName="Sakura"
          authorHandle="sakura.heaven"
          authorAvatarUrl="https://placewaifu.com/image/104"
          timestamp="12h ago"
          text="POV: discovering a new genre"
          media={{ type: 'video', src: '', thumbnailUrl: 'https://placewaifu.com/image/270/480', aspect: 'portrait' }}
          likes={5400}
          comments={312}
          onLike={noop}
          onComment={noop}
        />

        <FeedPost
          authorName="Misato"
          authorHandle="misato.heaven"
          authorAvatarUrl="https://placewaifu.com/image/105"
          timestamp="1d ago"
          media={{ type: 'photo', items: [
            { url: 'https://placewaifu.com/image/400/400' },
            { url: 'https://placewaifu.com/image/401/401' },
            { url: 'https://placewaifu.com/image/402/402' },
            { url: 'https://placewaifu.com/image/403/403' },
            { url: 'https://placewaifu.com/image/404/404' },
          ]}}
          text="Festival photo dump"
          likes={891}
          comments={67}
          onLike={noop}
          onComment={noop}
        />

        <FeedPost
          authorName="Shinji"
          authorHandle="shinji.eth"
          authorAvatarUrl="https://placewaifu.com/image/106"
          timestamp="1d ago"
          text="Found this hidden gem on a random playlist. No idea who this artist is but the vocals are haunting. Anyone know them?"
          likes={14}
          comments={2}
          onLike={noop}
          onComment={noop}
        />

        <FeedPost
          authorName="Kaworu"
          authorHandle="kaworu.heaven"
          authorAvatarUrl="https://placewaifu.com/image/107"
          timestamp="2d ago"
          text="New music video just dropped"
          media={{ type: 'video', src: '', thumbnailUrl: 'https://placewaifu.com/image/800/450', aspect: 'landscape' }}
          likes={1200}
          comments={89}
          onLike={noop}
          onComment={noop}
        />
      </div>
    </div>
  ),
}
