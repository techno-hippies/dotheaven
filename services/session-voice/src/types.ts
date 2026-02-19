export interface Env {
  DB: D1Database
  ROOM_DO: DurableObjectNamespace
  DUET_ROOM_DO: DurableObjectNamespace
  ENVIRONMENT: string
  AGORA_APP_ID: string
  AGORA_APP_CERTIFICATE: string
  JWT_SECRET: string
  RPC_URL: string
  ESCROW_ADDRESS: string
  CHAIN_ID: string
  REGISTRY_ADDRESS: string
  VERIFICATION_MIRROR_ADDRESS: string
  ORACLE_PRIVATE_KEY?: string
  ORACLE_SERVICE_TOKEN?: string
  // Explicit session escrow mode. Avoid coupling to generic ENVIRONMENT value.
  SESSION_ESCROW_MODE?: 'live' | 'mock'
  SONG_REGISTRY_ADMIN_TOKEN?: string
  X402_FACILITATOR_MODE?: 'mock' | 'self'
  X402_FACILITATOR_BASE_URL?: string
  X402_FACILITATOR_AUTH_TOKEN?: string
  // CAI agent (AI in rooms)
  AGORA_REST_AUTH?: string
  LLM_BASE_URL?: string
  LLM_API_KEY?: string
  ELEVENLABS_API_KEY?: string
  ELEVENLABS_VOICE_ID?: string
}
