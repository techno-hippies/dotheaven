/**
 * Minimal signal-based toast store.
 * No provider needed — import { addToast, toasts } anywhere.
 */
import { createSignal } from 'solid-js'

export interface Toast {
  id: number
  message: string
  type: 'info' | 'success' | 'error'
}

const [toasts, setToasts] = createSignal<Toast[]>([])
let nextId = 0

export { toasts }

export function addToast(message: string, type: Toast['type'] = 'info', durationMs = 4000): number {
  const id = nextId++
  setToasts((prev) => [...prev, { id, message, type }])
  if (durationMs > 0) {
    setTimeout(() => removeToast(id), durationMs)
  }
  return id
}

export function updateToast(id: number, message: string, type: Toast['type'] = 'info', durationMs = 4000) {
  setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, message, type } : t)))
  if (durationMs > 0) {
    setTimeout(() => removeToast(id), durationMs)
  }
}

export function removeToast(id: number) {
  setToasts((prev) => prev.filter((t) => t.id !== id))
}
