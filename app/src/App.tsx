import type { Component } from 'solid-js'

export const App: Component = () => {
  return (
    <div class="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div class="text-center">
        <h1 class="text-4xl font-bold mb-4">Heaven</h1>
        <p class="text-muted-foreground">Your Tauri + SolidJS app is ready.</p>
      </div>
    </div>
  )
}
