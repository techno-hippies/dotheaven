import { createStore, get, set, del, keys } from 'idb-keyval'

// Create separate stores for different data types
export const playlistStore = createStore('heaven-playlists', 'playlists')
export const settingsStore = createStore('heaven-settings', 'settings')

// Generic IDB helpers
export const idb = {
  get,
  set,
  del,
  keys,
}
