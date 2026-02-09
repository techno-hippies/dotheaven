export interface Env {
  DB: D1Database
  ROOM_DO: DurableObjectNamespace
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
}
