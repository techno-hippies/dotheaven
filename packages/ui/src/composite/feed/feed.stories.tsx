import type { Meta, StoryObj } from 'storybook-solidjs'
import { FeedPost } from './feed-post'
import { ComposeBox, ComposeFab } from './compose-box'

const meta: Meta = {
  title: 'Feed/Feed',
  parameters: { layout: 'centered' },
}

export default meta

const noop = () => {}

const handlers = {
  onLike: noop,
  onComment: noop,
  onRepost: noop,
  onQuote: noop,
  onCopyLink: noop,
  onSendViaChat: noop,
}

const feedPosts = (
  <>
    <FeedPost
      authorName="Yuki"
      authorHandle="yuki.heaven"
      authorAvatarUrl="https://placewaifu.com/image/100"
      authorNationalityCode="JP"
      timestamp="2h ago"
      text="Just discovered this amazing album. The production quality is insane, every track flows into the next perfectly. Highly recommend giving it a full listen with headphones."
      likes={42}
      comments={7}
      reposts={3}
      {...handlers}
    />
    <FeedPost
      authorName="Miku"
      authorHandle="miku.heaven"
      authorAvatarUrl="https://placewaifu.com/image/101"
      authorNationalityCode="JP"
      timestamp="4h ago"
      text="Sunset vibes from the rooftop"
      media={{ type: 'photo', items: [{ url: 'https://placewaifu.com/image/800/450', aspect: 'landscape' }] }}
      likes={234}
      comments={18}
      reposts={13}
      {...handlers}
    />
    <FeedPost
      authorName="Rei"
      authorHandle="rei.heaven"
      authorAvatarUrl="https://placewaifu.com/image/102"
      authorNationalityCode="JP"
      timestamp="6h ago"
      text="New album art is incredible"
      media={{ type: 'photo', items: [{ url: 'https://placewaifu.com/image/500', aspect: 'square' }] }}
      likes={28}
      comments={3}
      reposts={1}
      isLiked
      {...handlers}
    />
    <FeedPost
      authorName="Asuka"
      authorHandle="asuka.eth"
      authorAvatarUrl="https://placewaifu.com/image/103"
      authorNationalityCode="DE"
      timestamp="8h ago"
      text="Concert was incredible last night"
      media={{ type: 'photo', items: [
        { url: 'https://placewaifu.com/image/400/400' },
        { url: 'https://placewaifu.com/image/401/401' },
      ]}}
      likes={312}
      comments={45}
      reposts={21}
      {...handlers}
    />
    <FeedPost
      authorName="Hana"
      authorHandle="hana.heaven"
      authorAvatarUrl="https://placewaifu.com/image/105"
      authorNationalityCode="JP"
      timestamp="10h ago"
      text="今日は素晴らしいアルバムを見つけました。プロダクションの質が凄い。"
      postLang="ja"
      userLang="en"
      likes={58}
      comments={4}
      reposts={2}
      onTranslate={(lang) => console.log('translate to:', lang)}
      {...handlers}
    />
  </>
)

export const DesktopFeed: StoryObj = {
  render: () => (
    <div style={{ width: '600px', height: '900px', overflow: 'auto', background: 'var(--bg-page)' }}>
      <div class="bg-[var(--bg-surface)] rounded-md divide-y divide-[var(--bg-highlight)]">
        <ComposeBox
          avatarUrl="https://placewaifu.com/image/200"
          onPost={(text) => console.log('Post:', text)}
          onAddMedia={() => console.log('Add media')}
        />
        {feedPosts}
      </div>
    </div>
  ),
}

export const MobileFeed: StoryObj = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: () => (
    <div style={{ width: '375px', height: '812px', overflow: 'auto', background: 'var(--bg-page)', position: 'relative' }}>
      <div class="divide-y divide-[var(--bg-highlight)]">
        {feedPosts}
      </div>
      <ComposeFab onClick={() => console.log('Open compose')} />
    </div>
  ),
}
