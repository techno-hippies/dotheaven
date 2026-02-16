// Common types shared across clients

export interface User {
  id: string
  name: string
  handle: string
  avatar?: string
  verified?: boolean
}

export interface Track {
  id: string
  title: string
  artist: string
  album?: string
  coverUrl?: string
  duration: number // seconds
}

export interface Post {
  id: string
  author: User
  content: string
  track?: Track
  createdAt: Date
  likes: number
  comments: number
  shares: number
}

export interface Comment {
  id: string
  author: User
  content: string
  createdAt: Date
  likes: number
}
