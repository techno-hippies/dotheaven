/// <reference types="vite/client" />

declare module 'virtual:heaven-platform' {
  export { PlatformProvider, usePlatform } from '@heaven/platform'
  export type { PlatformAPI } from '@heaven/platform'

  export const platform: import('@heaven/platform').PlatformAPI
  const defaultExport: import('@heaven/platform').PlatformAPI
  export default defaultExport
}
