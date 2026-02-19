import { createLitClient } from '@lit-protocol/lit-client'
import { createAuthManager, storagePlugins } from '@lit-protocol/auth'
import { LIT_CONFIG } from './config'

const IS_DEV = import.meta.env.DEV

/**
 * Singleton Lit Client
 */
let litClient: Awaited<ReturnType<typeof createLitClient>> | null = null

export async function getLitClient() {
  if (!litClient) {
    if (IS_DEV) console.log('[Lit] Creating Lit client...')
    litClient = await createLitClient({ network: LIT_CONFIG.network })
    if (IS_DEV) console.log('[Lit] Lit client created')
  }
  return litClient
}

/**
 * Singleton Auth Manager
 * Uses localStorage for persistence
 */
let authManagerInstance: ReturnType<typeof createAuthManager> | null = null

export function getAuthManager() {
  if (!authManagerInstance) {
    if (IS_DEV) console.log('[Lit] Creating auth manager...')

    authManagerInstance = createAuthManager({
      storage: storagePlugins.localStorage({
        appName: LIT_CONFIG.appName,
        networkName: LIT_CONFIG.networkName,
      }),
    })

    if (IS_DEV) console.log('[Lit] Auth manager created')
  }

  return authManagerInstance
}

export function resetClient() {
  if (IS_DEV) console.log('[Lit] Resetting clients...')
  litClient = null
  authManagerInstance = null
}
