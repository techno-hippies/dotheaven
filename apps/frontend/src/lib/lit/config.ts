import { nagaDev, nagaTest } from '@lit-protocol/networks'

const litNetwork = (import.meta.env.VITE_LIT_NETWORK || 'naga-dev') as 'naga-dev' | 'naga-test'

export const LIT_CONFIG = {
  appName: 'heaven',
  displayName: 'Heaven',
  network: litNetwork === 'naga-dev' ? nagaDev : nagaTest,
  networkName: litNetwork,
  authServiceUrl: `https://${litNetwork}-auth-service.getlit.dev`,
  sessionExpirationMs: 30 * 24 * 60 * 60 * 1000, // 30 days
} as const
