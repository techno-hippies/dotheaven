import { nagaDev } from '@lit-protocol/networks'

export const LIT_CONFIG = {
  appName: 'heaven',
  displayName: 'Heaven',
  network: nagaDev,
  networkName: 'naga-dev',
  authServiceUrl: 'https://naga-dev-auth-service.getlit.dev',
  sessionExpirationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const
