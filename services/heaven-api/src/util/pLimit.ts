/**
 * Simple promise concurrency limiter.
 * Prevents blasting external APIs when resolving a batch of tracks.
 */
export function pLimit(concurrency: number) {
  let activeCount = 0
  const queue: Array<() => void> = []

  const next = () => {
    activeCount--
    if (queue.length > 0) queue.shift()!()
  }

  return function <T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        activeCount++
        fn().then(resolve, reject).finally(next)
      }

      if (activeCount < concurrency) run()
      else queue.push(run)
    })
  }
}
