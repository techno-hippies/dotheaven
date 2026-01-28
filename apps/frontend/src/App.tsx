import type { Component } from 'solid-js'
import { usePlatform } from '@heaven/platform'
import { Button } from '@heaven/ui'

export const App: Component = () => {
  const platform = usePlatform()

  return (
    <div class="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div class="text-center space-y-4">
        <h1 class="text-4xl font-bold mb-4">Heaven</h1>
        <p class="text-muted-foreground">
          Running on: <span class="text-primary font-semibold">{platform.platform}</span>
        </p>
        <div class="flex gap-2 justify-center">
          <Button variant="default" onClick={() => platform.openExternal('https://github.com')}>
            Open GitHub
          </Button>
          <Button variant="outline" onClick={() => alert(`Version: ${platform.getVersion()}`)}>
            Get Version
          </Button>
        </div>
      </div>
    </div>
  )
}
