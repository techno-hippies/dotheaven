export type TempoAuthMode = 'signin' | 'register'

export interface TempoAuthParams {
  mode: TempoAuthMode
  chainId: number
  keyManagerUrl: string
  feePayerUrl: string
  rpId?: string
}

export interface TempoAuthResult {
  walletAddress: `0x${string}`
  tempoCredentialId?: string
  tempoPublicKey?: string
  tempoRpId: string
  tempoKeyManagerUrl: string
  tempoFeePayerUrl: string
  tempoChainId: number
}

type TempoRuntime = {
  viemTempo: any
  viemChains: any
}

let runtimePromise: Promise<TempoRuntime> | null = null

async function getTempoRuntime(): Promise<TempoRuntime> {
  if (!runtimePromise) {
    runtimePromise = Promise.all([import('viem/tempo'), import('viem/chains')])
      .then(([viemTempo, viemChains]) => ({
        viemTempo,
        viemChains,
      }))
      .catch((error) => {
        runtimePromise = null
        throw new Error(
          `Failed to load Tempo SDK modules (viem/tempo, viem/chains): ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      })
  }
  return runtimePromise
}

function resolveTempoChain(viemChains: any, chainId: number) {
  if (chainId === 42431 && viemChains.tempoModerato) return viemChains.tempoModerato
  if (chainId === 42429 && viemChains.tempoAndantino) return viemChains.tempoAndantino
  if (chainId === 4243 && viemChains.tempoAndantino) return viemChains.tempoAndantino
  if (viemChains.tempo && viemChains.tempo.id === chainId) return viemChains.tempo

  throw new Error(
    `Unsupported Tempo chain id (${chainId}). Add chain resolution for this network.`
  )
}

function normalizeHex(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`
}

type StoredCredential = {
  id: string
  publicKey: string
}

const CREDENTIAL_MAP_KEY = 'tempo.passkeys.v1'

function readCredentialMap(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(CREDENTIAL_MAP_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.entries(parsed).reduce<Record<string, string>>((acc, [id, publicKey]) => {
      const key = id.trim()
      const normalizedPublicKey = normalizeHex(publicKey)
      if (key && normalizedPublicKey) acc[key] = normalizedPublicKey
      return acc
    }, {})
  } catch {
    return {}
  }
}

function writeCredentialMap(map: Record<string, string>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CREDENTIAL_MAP_KEY, JSON.stringify(map))
}

function upsertCredential(credential: StoredCredential) {
  const map = readCredentialMap()
  map[credential.id] = credential.publicKey
  writeCredentialMap(map)
}

function credentialFromMap(id: string): string | undefined {
  const map = readCredentialMap()
  return map[id]
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function parsePublicKeyFromResponse(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const record = payload as Record<string, unknown>

  const direct = normalizeHex(record.publicKey)
  if (direct) return direct

  const nestedCredential = record.credential
  if (nestedCredential && typeof nestedCredential === 'object') {
    const nested = nestedCredential as Record<string, unknown>
    return normalizeHex(nested.publicKey)
  }

  return undefined
}

async function fetchPublicKeyFromKeyManager(
  keyManagerUrl: string,
  credentialId: string
): Promise<string | undefined> {
  const endpoint = `${trimTrailingSlash(keyManagerUrl)}/${encodeURIComponent(credentialId)}`
  try {
    const response = await fetch(endpoint)
    if (!response.ok) return undefined
    const payload = await response.json()
    return parsePublicKeyFromResponse(payload)
  } catch {
    return undefined
  }
}

async function storeCredentialInKeyManager(
  keyManagerUrl: string,
  credential: { id: string; raw?: unknown },
  publicKey: string
): Promise<boolean> {
  const endpoint = `${trimTrailingSlash(keyManagerUrl)}/${encodeURIComponent(credential.id)}`
  const payloads: Array<Record<string, unknown>> = [
    {
      credential: credential.raw ?? { id: credential.id },
      publicKey,
    },
    {
      credential: { id: credential.id },
      publicKey,
    },
  ]

  for (const payload of payloads) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (response.ok) return true
    } catch {
      // ignore and try fallback payload shape
    }
  }

  return false
}

export async function authenticateWithTempoPasskey(
  params: TempoAuthParams
): Promise<TempoAuthResult> {
  const { mode, chainId, keyManagerUrl, feePayerUrl, rpId } = params
  const runtime = await getTempoRuntime()
  const { viemTempo, viemChains } = runtime

  const chain = resolveTempoChain(viemChains, chainId)

  const resolvedRpId = rpId || window.location.hostname

  const credential =
    mode === 'register'
      ? await viemTempo.WebAuthnP256.createCredential({
          label: new Date().toISOString(),
          rpId: resolvedRpId,
        })
      : await viemTempo.WebAuthnP256.getCredential({
          async getPublicKey(rawCredential: { id?: string }) {
            const credentialId =
              typeof rawCredential?.id === 'string' ? rawCredential.id : undefined
            if (!credentialId) throw new Error('No passkey credential id returned by browser')
            const remotePublicKey = await fetchPublicKeyFromKeyManager(
              keyManagerUrl,
              credentialId
            )
            const localPublicKey = credentialFromMap(credentialId)
            const publicKey = remotePublicKey || localPublicKey

            if (!publicKey) {
              throw new Error('Passkey is not registered. Register on this device first.')
            }

            if (remotePublicKey) {
              upsertCredential({
                id: credentialId,
                publicKey: remotePublicKey,
              })
            }

            return publicKey
          },
        })

  const credentialId = typeof credential?.id === 'string' ? credential.id : undefined
  const credentialPublicKey = normalizeHex(credential?.publicKey)
  if (!credentialId || !credentialPublicKey) {
    throw new Error('Tempo passkey flow did not return a valid credential')
  }

  upsertCredential({
    id: credentialId,
    publicKey: credentialPublicKey,
  })
  if (mode === 'register') {
    void storeCredentialInKeyManager(
      keyManagerUrl,
      {
        id: credentialId,
        raw: credential?.raw,
      },
      credentialPublicKey
    )
  }

  const account = viemTempo.Account.fromWebAuthnP256(
    {
      id: credentialId,
      publicKey: credentialPublicKey,
    },
    { rpId: resolvedRpId }
  )

  const address = account?.address
  if (!address || typeof address !== 'string') {
    throw new Error('Tempo passkey flow succeeded but account address was not derived')
  }

  return {
    walletAddress: address as `0x${string}`,
    tempoCredentialId: credentialId,
    tempoPublicKey: credentialPublicKey,
    tempoRpId: resolvedRpId,
    tempoKeyManagerUrl: keyManagerUrl,
    tempoFeePayerUrl: feePayerUrl,
    tempoChainId: chain.id,
  }
}
