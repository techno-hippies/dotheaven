import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { FeedPost } from './feed-post'
import { ComposeBox, ComposeFab } from './compose-box'
import { LiveRoomsRow, type LiveRoom } from './live-rooms-row'

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

const sampleRooms: LiveRoom[] = [
  {
    id: '1',
    hostName: 'camille',
    hostAvatarUrl: 'https://placewaifu.com/image/110',
    participantCount: 3,
    coverUrl: 'https://placewaifu.com/image/300/450',
  },
  {
    id: '2',
    hostName: 'erik',
    hostAvatarUrl: 'https://placewaifu.com/image/111',
    participantCount: 5,
    coverUrl: 'https://placewaifu.com/image/301/450',
  },
  {
    id: '3',
    hostName: 'yuki',
    hostAvatarUrl: 'https://placewaifu.com/image/112',
    participantCount: 2,
    coverUrl: 'https://placewaifu.com/image/302/450',
  },
  {
    id: '4',
    hostName: 'matheus',
    hostAvatarUrl: 'https://placewaifu.com/image/113',
    participantCount: 4,
    coverUrl: 'https://placewaifu.com/image/303/450',
  },
  {
    id: '5',
    hostName: 'sophie',
    hostAvatarUrl: 'https://placewaifu.com/image/114',
    participantCount: 7,
    coverUrl: 'https://placewaifu.com/image/304/450',
  },
]

const feedPosts = (
  <>
    <FeedPost
      authorName="Yuki"
      authorHandle="yuki"
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
      authorHandle="miku"
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
      authorHandle="rei"
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
      authorHandle="hana"
      authorAvatarUrl="https://placewaifu.com/image/105"
      authorNationalityCode="JP"
      timestamp="10h ago"
      text="Today I found an amazing album. The production quality is incredible."
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
      <LiveRoomsRow
        rooms={sampleRooms}
        onRoomClick={(id) => console.log('Join room:', id)}
        onCreateRoom={() => console.log('Create room')}
        createAvatarUrl="https://placewaifu.com/image/200"
      />
      <div class="border-t border-[var(--border-subtle)]" />
      <div class="bg-[var(--bg-surface)] rounded-md divide-y divide-[var(--border-subtle)]">
        <ComposeBox
          avatarUrl="https://placewaifu.com/image/200"
          onPost={(text, media) => console.log('Post:', text, media)}
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
      <LiveRoomsRow
        rooms={sampleRooms}
        onRoomClick={(id) => console.log('Join room:', id)}
        onCreateRoom={() => console.log('Create room')}
        createAvatarUrl="https://placewaifu.com/image/200"
      />
      <div class="border-t border-[var(--border-subtle)]" />
      <div class="divide-y divide-[var(--border-subtle)]">
        {feedPosts}
      </div>
      <ComposeFab onClick={() => console.log('Open compose')} />
    </div>
  ),
}

export const NoCoverArt: StoryObj = {
  render: () => (
    <div style={{ width: '600px', height: '300px', overflow: 'auto', background: 'var(--bg-page)' }}>
      <LiveRoomsRow
        rooms={sampleRooms.map((r) => ({ ...r, coverUrl: undefined }))}
        onRoomClick={(id) => console.log('Join room:', id)}
        onCreateRoom={() => console.log('Create room')}
        createAvatarUrl="https://placewaifu.com/image/200"
      />
    </div>
  ),
}

export const CreateRoomNoAvatar: StoryObj = {
  render: () => (
    <div style={{ width: '600px', height: '300px', overflow: 'auto', background: 'var(--bg-page)' }}>
      <LiveRoomsRow
        rooms={sampleRooms.slice(0, 2)}
        onRoomClick={(id) => console.log('Join room:', id)}
        onCreateRoom={() => console.log('Create room')}
      />
    </div>
  ),
}

export const CreateRoomOnly: StoryObj = {
  render: () => (
    <div style={{ width: '600px', height: '300px', overflow: 'auto', background: 'var(--bg-page)' }}>
      <LiveRoomsRow
        rooms={[]}
        onCreateRoom={() => console.log('Create room')}
        createAvatarUrl="https://placewaifu.com/image/200"
      />
    </div>
  ),
}

export const NoLiveRooms: StoryObj = {
  render: () => (
    <div style={{ width: '600px', height: '900px', overflow: 'auto', background: 'var(--bg-page)' }}>
      <LiveRoomsRow
        rooms={[]}
        onCreateRoom={() => console.log('Create room')}
        createAvatarUrl="https://placewaifu.com/image/200"
      />
      <div class="bg-[var(--bg-surface)] rounded-md divide-y divide-[var(--border-subtle)]">
        <ComposeBox
          avatarUrl="https://placewaifu.com/image/200"
          onPost={(text, media) => console.log('Post:', text, media)}
        />
        {feedPosts}
      </div>
    </div>
  ),
}
