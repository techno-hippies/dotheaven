/**
 * Session Voice Service Configuration
 */

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required env: ${key}`)
  return value
}

export const config = {
  port: parseInt(process.env.PORT || '3338', 10),

  // Agora
  agoraAppId: requireEnv('AGORA_APP_ID'),
  agoraAppCertificate: requireEnv('AGORA_APP_CERTIFICATE'),

  // Chain
  rpcUrl: process.env.RPC_URL || 'https://carrot.megaeth.com/rpc',
  chainId: 6343,
  escrowAddress: process.env.ESCROW_ADDRESS || '0x132212B78C4a7A3F19DE1BF63f119848c765c1d2',

  // Oracle (optional - only needed for attestation)
  oraclePrivateKey: process.env.ORACLE_PRIVATE_KEY || null,

  // JWT
  jwtSecret: requireEnv('JWT_SECRET'),

  // Session config
  tokenExpirySeconds: 3600, // 1 hour Agora tokens
  joinWindowBeforeMinutes: 5, // Can join 5 mins before start

  // Dev/testing
  mockEscrow: process.env.MOCK_ESCROW === '1',
  mockHost: (process.env.MOCK_HOST || '0x0000000000000000000000000000000000000000'),
  mockGuest: (process.env.MOCK_GUEST || '0x0000000000000000000000000000000000000000'),
}
