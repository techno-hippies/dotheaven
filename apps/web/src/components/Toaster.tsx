import { For } from 'solid-js'
import { toasts } from '../lib/toast'

export const Toaster = () => (
  <div class="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
    <For each={toasts()}>
      {(t) => (
        <div
          class="px-4 py-2.5 rounded-lg text-base font-medium shadow-lg pointer-events-auto animate-[fadeIn_0.2s_ease-out]"
          classList={{
            'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)]': t.type === 'info',
            'bg-green-900/80 text-green-100 border border-green-700/50': t.type === 'success',
            'bg-red-900/80 text-red-100 border border-red-700/50': t.type === 'error',
          }}
        >
          {t.message}
        </div>
      )}
    </For>
  </div>
)
