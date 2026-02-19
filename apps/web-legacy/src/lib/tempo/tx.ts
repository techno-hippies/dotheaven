export interface TempoSignerContext {
  chainId: number
  credentialId: string
  publicKey: string
  feePayerUrl: string
  rpId?: string
}

export interface TempoSponsoredTokenTransferParams extends TempoSignerContext {
  token: `0x${string}`
  to: `0x${string}`
  amount: bigint
}

type TempoRuntime = {
  viem: any
  viemTempo: any
  viemChains: any
}

let runtimePromise: Promise<TempoRuntime> | null = null

async function getTempoRuntime(): Promise<TempoRuntime> {
  if (!runtimePromise) {
    runtimePromise = Promise.all([import('viem'), import('viem/tempo'), import('viem/chains')])
      .then(([viem, viemTempo, viemChains]) => ({ viem, viemTempo, viemChains }))
      .catch((error) => {
        runtimePromise = null
        throw new Error(
          `Failed to load Tempo SDK modules (viem, viem/tempo, viem/chains): ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      })
  }
  return runtimePromise
}

function normalizeHex(value: string): `0x${string}` {
  return (value.startsWith('0x') ? value : `0x${value}`) as `0x${string}`
}

function resolveTempoChain(viemChains: any, chainId: number) {
  if (chainId === 42431 && viemChains.tempoModerato) return viemChains.tempoModerato
  if ((chainId === 42429 || chainId === 4243) && viemChains.tempoAndantino) {
    return viemChains.tempoAndantino
  }
  if (viemChains.tempo && viemChains.tempo.id === chainId) return viemChains.tempo
  throw new Error(`Unsupported Tempo chain id (${chainId})`)
}

export async function createTempoSponsoredClient(context: TempoSignerContext) {
  const runtime = await getTempoRuntime()
  const { viem, viemTempo, viemChains } = runtime

  const chain = resolveTempoChain(viemChains, context.chainId)
  const account = viemTempo.Account.fromWebAuthnP256(
    {
      id: context.credentialId,
      publicKey: normalizeHex(context.publicKey),
    },
    { rpId: context.rpId || window.location.hostname }
  )

  const client = viem.createClient({
    account,
    chain,
    transport: viemTempo.withFeePayer(viem.http(), viem.http(context.feePayerUrl)),
  })

  return { account, chain, client }
}

export async function sendSponsoredTokenTransfer(
  params: TempoSponsoredTokenTransferParams
): Promise<{ receipt?: unknown }> {
  const { client } = await createTempoSponsoredClient(params)

  const result = await client.token.transferSync({
    amount: params.amount,
    feePayer: true,
    to: params.to,
    token: params.token,
  })

  return { receipt: result?.receipt }
}
