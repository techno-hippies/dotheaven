import type { Component } from 'solid-js'
import { useNavigate, useParams } from '@solidjs/router'
import { Show } from 'solid-js'
import { PostDetailView } from '@heaven/ui'
import { feedPosts } from './FeedPage'

export const PostPage: Component = () => {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()

  const postIndex = () => parseInt(params.id, 10)
  const post = () => feedPosts[postIndex()]

  return (
    <Show
      when={post()}
      fallback={
        <div class="flex items-center justify-center h-full text-[var(--text-muted)]">
          Post not found
        </div>
      }
    >
      {(p) => (
        <PostDetailView
          post={p()}
          comments={[]}
          onBack={() => navigate(-1)}
          onSubmitComment={(text) => console.log('comment:', text)}
        />
      )}
    </Show>
  )
}
