import { nagaTest } from '@lit-protocol/networks'

export const LIT_CONFIG = {
  appName: 'heaven',
  displayName: 'Heaven',
  network: nagaTest,
  networkName: 'naga-test',
  authServiceUrl: 'https://naga-test-auth-service.getlit.dev',
  sessionExpirationMs: 30 * 24 * 60 * 60 * 1000, // 30 days
} as const
