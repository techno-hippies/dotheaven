import {
  hexToBytes,
  withTimeout,
  getErrorMessage,
  isInstallationLimitError,
  extractInboxId,
  asRecord,
  getInstallationBytes,
} from './xmtp-utils'

const IS_DEV = import.meta.env.DEV
const IS_TAURI_PLATFORM = import.meta.env.VITE_PLATFORM === 'tauri'
const XMTP_ENV = (import.meta.env.VITE_XMTP_ENV || (IS_DEV ? 'dev' : 'production')) as
  | 'dev'
  | 'production'
const INSTALLATION_RECOVERY_TIMEOUT_MS = 30_000

export async function recoverFromInstallationLimit(
  address: string,
  signMessage: (message: string) => Promise<string>,
  error: unknown,
): Promise<boolean> {
  if (!IS_TAURI_PLATFORM || !isInstallationLimitError(error)) return false

  const message = getErrorMessage(error)
  const inboxId = extractInboxId(message)
  if (!inboxId) {
    console.error('[XMTPProvider] Installation limit reached but inboxId was not found in error:', message)
    return false
  }

  console.warn(`[XMTPProvider] Installation limit reached for inbox ${inboxId}, attempting static revocation`)

  try {
    const { Client, IdentifierKind } = await import('@xmtp/browser-sdk')

    const signer = {
      type: 'EOA',
      getIdentifier: () => ({
        identifier: address,
        identifierKind: IdentifierKind.Ethereum,
      }),
      signMessage: async (text: string) => {
        const signature = await signMessage(text)
        return hexToBytes(signature)
      },
    } as const

    const fetchInboxStates = Client.fetchInboxStates.bind(Client) as (...args: unknown[]) => Promise<unknown[]>
    const revokeInstallations = Client.revokeInstallations.bind(Client) as (...args: unknown[]) => Promise<void>

    let inboxStates: unknown[]
    try {
      inboxStates = await withTimeout(
        fetchInboxStates([inboxId], XMTP_ENV),
        INSTALLATION_RECOVERY_TIMEOUT_MS,
        'Client.fetchInboxStates'
      )
    } catch (fetchError) {
      if (IS_DEV) {
        console.warn('[XMTPProvider] fetchInboxStates with env failed, retrying without env:', fetchError)
      }
      inboxStates = await withTimeout(
        fetchInboxStates([inboxId]),
        INSTALLATION_RECOVERY_TIMEOUT_MS,
        'Client.fetchInboxStates (no env)'
      )
    }

    const state = asRecord(inboxStates[0])
    const installations = Array.isArray(state?.installations) ? state.installations : []
    const installationBytes = getInstallationBytes(installations)
    if (installationBytes.length === 0) {
      throw new Error('Inbox state did not include any revocable installations')
    }

    try {
      await withTimeout(
        revokeInstallations(signer, inboxId, installationBytes, XMTP_ENV),
        INSTALLATION_RECOVERY_TIMEOUT_MS,
        'Client.revokeInstallations'
      )
    } catch (revokeError) {
      if (IS_DEV) {
        console.warn('[XMTPProvider] revokeInstallations with env failed, retrying without env:', revokeError)
      }
      await withTimeout(
        revokeInstallations(signer, inboxId, installationBytes),
        INSTALLATION_RECOVERY_TIMEOUT_MS,
        'Client.revokeInstallations (no env)'
      )
    }

    console.warn(`[XMTPProvider] Revoked ${installationBytes.length} installations for inbox ${inboxId}`)
    return true
  } catch (recoveryError) {
    console.error('[XMTPProvider] Failed installation-limit recovery:', recoveryError)
    return false
  }
}
