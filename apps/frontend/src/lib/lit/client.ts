import { createLitClient } from '@lit-protocol/lit-client'
import { LIT_CONFIG } from './config'

let litClient: Awaited<ReturnType<typeof createLitClient>> | null = null

export async function getLitClient() {
  if (!litClient) {
    litClient = await createLitClient({ network: LIT_CONFIG.network })
  }
  return litClient
}

export function resetClient() {
  litClient = null
}
