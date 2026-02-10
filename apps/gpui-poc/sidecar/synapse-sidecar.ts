/**
 * Synapse sidecar (NDJSON over stdin/stdout)
 *
 * Minimal surface for GPUI integration:
 * - health
 * - storage.status
 * - storage.depositAndApprove
 * - storage.preflight
 * - storage.upload
 * - storage.reset
 *
 * Run:
 *   bun apps/frontend/src/sidecar/synapse-sidecar.ts
 *
 * Request format (one JSON object per line):
 *   {"id":"1","method":"health","params":{}}
 *
 * Response format:
 *   {"id":"1","result":{...}}
 *   {"id":"1","error":{"message":"..."}}
 */

import { createInterface } from 'node:readline'
import { readFile } from 'node:fs/promises'
import { ethers } from 'ethers'
import { Synapse, RPC_URLS } from '@filoz/synapse-sdk'
import { createLitClient } from '@lit-protocol/lit-client'
import { createAuthManager, storagePlugins } from '@lit-protocol/auth'
import { nagaDev, nagaTest } from '@lit-protocol/networks'

const FIL_RPC = RPC_URLS.mainnet.http
const USDFC_DECIMALS = 18
const EPOCHS_PER_DAY = 2880n
const DEFAULT_MAX_LOCKUP_EPOCHS = EPOCHS_PER_DAY * 30n

type Json = Record<string, unknown>

interface RpcRequest {
  id: string | number
  method: string
  params?: Json
}

interface PkpInfo {
  publicKey: string
  ethAddress: `0x${string}`
  tokenId?: string
}

interface AuthData {
  authMethodType: number
  authMethodId: string
  accessToken: unknown
  [key: string]: unknown
}

interface SidecarAuthInput {
  pkp: PkpInfo
  authData: AuthData
}

type CachedContext = {
  key: string
  synapse: Synapse
}

let cachedSynapse: CachedContext | null = null
let cachedAuthContext: { key: string; authContext: any } | null = null
let litClientSingleton: Awaited<ReturnType<typeof createLitClient>> | null = null
let authManagerSingleton: ReturnType<typeof createAuthManager> | null = null

const litNetworkName = (process.env.LIT_NETWORK || process.env.VITE_LIT_NETWORK || 'naga-dev').trim()
const litNetwork = litNetworkName === 'naga-test' ? nagaTest : nagaDev

function getAuthCacheKey(input: SidecarAuthInput): string {
  return `${input.pkp.publicKey}:${input.authData.authMethodType}:${input.authData.authMethodId}`
}

function parseAccessToken(input: unknown): unknown {
  if (typeof input !== 'string') return input
  const s = input.trim()
  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      return JSON.parse(s)
    } catch {
      return input
    }
  }
  return input
}

async function getLitClient() {
  if (!litClientSingleton) {
    litClientSingleton = await createLitClient({ network: litNetwork })
  }
  return litClientSingleton
}

function getAuthManager() {
  if (!authManagerSingleton) {
    authManagerSingleton = createAuthManager({
      storage: storagePlugins.localStorageNode({
        appName: 'heaven-sidecar',
        networkName: litNetworkName,
        storagePath: process.env.HEAVEN_SIDECAR_AUTH_PATH || './.heaven-sidecar-auth',
      }),
    })
  }
  return authManagerSingleton
}

async function createPkpAuthContext(input: SidecarAuthInput): Promise<any> {
  const key = getAuthCacheKey(input)
  if (cachedAuthContext && cachedAuthContext.key === key) {
    return cachedAuthContext.authContext
  }

  const litClient = await getLitClient()
  const authManager = getAuthManager()
  const authData = {
    ...input.authData,
    accessToken: parseAccessToken(input.authData.accessToken),
  }

  const authContext = await authManager.createPkpAuthContext({
    authData: authData as any,
    pkpPublicKey: input.pkp.publicKey,
    authConfig: {
      domain: process.env.HEAVEN_SIDECAR_DOMAIN || 'localhost',
      statement: 'Heaven desktop storage operations',
      expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      resources: [
        ['lit-action-execution', '*'],
        ['pkp-signing', '*'],
        ['access-control-condition-decryption', '*'],
      ],
    },
    litClient,
  })

  cachedAuthContext = { key, authContext }
  return authContext
}

function parseLitSignature(sig: any): { r: string; s: string; v: number } {
  const v = sig.recid !== undefined ? sig.recid + 27 : sig.recoveryId + 27
  if (sig.signature) {
    const hex = sig.signature.startsWith('0x') ? sig.signature.slice(2) : sig.signature
    return { r: `0x${hex.slice(0, 64)}`, s: `0x${hex.slice(64, 128)}`, v }
  }
  if (sig.r && sig.s) {
    return {
      r: sig.r.startsWith('0x') ? sig.r : `0x${sig.r}`,
      s: sig.s.startsWith('0x') ? sig.s : `0x${sig.s}`,
      v,
    }
  }
  throw new Error(`Unknown Lit signature format: ${JSON.stringify(sig)}`)
}

async function signHash(
  hashBytes: number[],
  publicKey: string,
  authContext: any,
): Promise<{ r: string; s: string; v: number }> {
  const litClient = await getLitClient()
  const code = `(async () => {
    const toSign = new Uint8Array(jsParams.hashBytes);
    await Lit.Actions.signEcdsa({
      toSign,
      publicKey: jsParams.publicKey,
      sigName: "sig",
    });
  })();`

  const result = await litClient.executeJs({
    code,
    authContext,
    jsParams: { hashBytes, publicKey },
  })

  if (!result.signatures?.sig) throw new Error('No signature returned from PKP')
  return parseLitSignature(result.signatures.sig)
}

class PKPEthersSigner extends ethers.AbstractSigner {
  private _pkp: PkpInfo
  private _authContext: any

  constructor(pkp: PkpInfo, authContext: any, provider: ethers.Provider) {
    super(provider)
    this._pkp = pkp
    this._authContext = authContext
  }

  async getAddress(): Promise<string> {
    return this._pkp.ethAddress
  }

  connect(provider: ethers.Provider): PKPEthersSigner {
    return new PKPEthersSigner(this._pkp, this._authContext, provider)
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const litClient = await getLitClient()
    const msgStr = typeof message === 'string' ? message : ethers.hexlify(message)
    const code = `(async () => {
      await Lit.Actions.ethPersonalSignMessageEcdsa({
        message: jsParams.message,
        publicKey: jsParams.publicKey,
        sigName: "sig",
      });
    })();`

    const result = await litClient.executeJs({
      code,
      authContext: this._authContext,
      jsParams: { message: msgStr, publicKey: this._pkp.publicKey },
    })

    if (!result.signatures?.sig) throw new Error('No signature returned from PKP')
    const sig = result.signatures.sig as any
    const vHex = ((sig.recid ?? sig.recoveryId) + 27).toString(16).padStart(2, '0')
    const sigHex = sig.signature.startsWith('0x') ? sig.signature.slice(2) : sig.signature
    return `0x${sigHex}${vHex}`
  }

  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, any>,
  ): Promise<string> {
    const hash = ethers.TypedDataEncoder.hash(domain, types, value)
    const hashBytes = Array.from(ethers.getBytes(hash))
    const { r, s, v } = await signHash(hashBytes, this._pkp.publicKey, this._authContext)
    return ethers.Signature.from({ r, s, v }).serialized
  }

  async signTransaction(tx: ethers.TransactionRequest): Promise<string> {
    const txToSign = { ...tx }

    if (txToSign.from === undefined) txToSign.from = this._pkp.ethAddress
    if (txToSign.nonce === undefined && this.provider) {
      txToSign.nonce = await this.provider.getTransactionCount(this._pkp.ethAddress)
    }
    if (txToSign.gasLimit === undefined && this.provider) {
      txToSign.gasLimit = await this.provider.estimateGas({
        ...txToSign,
        from: this._pkp.ethAddress,
      })
    }
    if (txToSign.gasPrice === undefined && txToSign.maxFeePerGas === undefined && this.provider) {
      const feeData = await this.provider.getFeeData()
      txToSign.gasPrice = feeData.gasPrice
    }
    if ((txToSign.chainId === undefined || txToSign.chainId === 0) && this.provider) {
      const network = await this.provider.getNetwork()
      txToSign.chainId = network.chainId
    } else if (txToSign.chainId === undefined || txToSign.chainId === 0) {
      txToSign.chainId = 314n
    }

    txToSign.type = 0

    const { from: _from, ...txWithoutFrom } = txToSign
    const unsignedTx = ethers.Transaction.from(txWithoutFrom as ethers.TransactionLike)
    const txHash = ethers.keccak256(unsignedTx.unsignedSerialized)
    const txHashBytes = Array.from(ethers.getBytes(txHash))

    const { r, s, v } = await signHash(txHashBytes, this._pkp.publicKey, this._authContext)
    const signedTx = ethers.Transaction.from({
      ...txWithoutFrom,
      signature: { r, s, v },
    } as ethers.TransactionLike)

    return signedTx.serialized
  }

  async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    const populated = await this.populateTransaction(tx)
    const signedTx = await this.signTransaction(populated)
    if (!this.provider) throw new Error('No provider')
    return this.provider.broadcastTransaction(signedTx)
  }
}

async function getSynapse(input: SidecarAuthInput): Promise<Synapse> {
  const cacheKey = getAuthCacheKey(input)
  if (cachedSynapse && cachedSynapse.key === cacheKey) {
    return cachedSynapse.synapse
  }

  const authContext = await createPkpAuthContext(input)
  const provider = new ethers.JsonRpcProvider(FIL_RPC)
  const signer = new PKPEthersSigner(input.pkp, authContext, provider)
  const synapse = await Synapse.create({
    signer: signer as any,
    withCDN: true,
  })
  cachedSynapse = { key: cacheKey, synapse }
  return synapse
}

function requireAuthInput(params: Json | undefined): SidecarAuthInput {
  if (!params || typeof params !== 'object') {
    throw new Error('Missing params')
  }
  const pkp = params.pkp as PkpInfo | undefined
  const authData = params.authData as AuthData | undefined
  if (!pkp?.publicKey || !pkp?.ethAddress) throw new Error('Missing pkp')
  if (!authData?.authMethodId || authData.authMethodType === undefined) throw new Error('Missing authData')
  return { pkp, authData }
}

function formatUsd(value: string): string {
  const num = parseFloat(value)
  if (Number.isNaN(num) || num === 0) return '$0.00'
  return `$${num.toFixed(2)}`
}

async function storageStatus(params: Json | undefined) {
  const input = requireAuthInput(params)
  const synapse = await getSynapse(input)

  let balanceRaw = 0n
  let lockupRate = 0n
  try {
    const info = await synapse.payments.accountInfo()
    balanceRaw = info.availableFunds
    lockupRate = info.lockupRate
  } catch {}

  let operatorApproved = false
  try {
    const storageInfo = await synapse.storage.getStorageInfo()
    operatorApproved = storageInfo.allowances?.isApproved ?? false
  } catch {}

  const balance = ethers.formatUnits(balanceRaw, USDFC_DECIMALS)
  const epochsPerMonth = EPOCHS_PER_DAY * 30n
  const monthlyCostRaw = lockupRate * epochsPerMonth
  const monthlyCost = ethers.formatUnits(monthlyCostRaw, USDFC_DECIMALS)

  let daysRemaining: number | null = null
  if (lockupRate > 0n) {
    const dailyCost = lockupRate * EPOCHS_PER_DAY
    if (dailyCost > 0n) daysRemaining = Number(balanceRaw / dailyCost)
  }

  return {
    balance: formatUsd(balance),
    balanceRaw: balanceRaw.toString(),
    operatorApproved,
    monthlyCost: formatUsd(monthlyCost),
    daysRemaining,
    ready: balanceRaw > 0n && operatorApproved,
  }
}

async function storageDepositAndApprove(params: Json | undefined) {
  const input = requireAuthInput(params)
  const amount = typeof params?.amount === 'string' ? params.amount : null
  if (!amount) throw new Error('Missing amount')

  const synapse = await getSynapse(input)
  const amountWei = ethers.parseUnits(amount, USDFC_DECIMALS)

  let isApproved = false
  try {
    const storageInfo = await synapse.storage.getStorageInfo()
    isApproved = storageInfo.allowances?.isApproved ?? false
  } catch {}

  if (!isApproved) {
    const warmAddr = synapse.getWarmStorageAddress()
    const rateAllowance = ethers.parseUnits('10', USDFC_DECIMALS)
    const lockupAllowance = ethers.parseUnits('100', USDFC_DECIMALS)
    const tx = await synapse.payments.depositWithPermitAndApproveOperator(
      amountWei,
      warmAddr,
      rateAllowance,
      lockupAllowance,
      DEFAULT_MAX_LOCKUP_EPOCHS,
    )
    const receipt = await tx.wait()
    return { txHash: receipt?.hash || tx.hash }
  }

  const tx = await synapse.payments.deposit(amountWei)
  const receipt = await tx.wait()
  return { txHash: receipt?.hash || tx.hash }
}

async function storagePreflight(params: Json | undefined) {
  const input = requireAuthInput(params)
  const sizeBytesRaw = params?.sizeBytes
  const sizeBytes = typeof sizeBytesRaw === 'number' ? sizeBytesRaw : undefined
  const synapse = await getSynapse(input)

  let availableFunds = 0n
  try {
    const info = await synapse.payments.accountInfo()
    availableFunds = info.availableFunds
  } catch {
    return {
      ready: false,
      reason: 'No storage balance. Add funds on the Wallet page to enable uploads.',
      suggestedDeposit: '1.00',
    }
  }

  if (availableFunds === 0n) {
    return {
      ready: false,
      reason: 'Storage balance is empty. Add funds on the Wallet page to enable uploads.',
      suggestedDeposit: '1.00',
    }
  }

  let isApproved = false
  try {
    const storageInfo = await synapse.storage.getStorageInfo()
    isApproved = storageInfo.allowances?.isApproved ?? false
  } catch {}

  if (!isApproved) {
    return {
      ready: false,
      reason: 'Storage not set up. Add funds on the Wallet page to enable uploads.',
      suggestedDeposit: '1.00',
    }
  }

  if (sizeBytes !== undefined) {
    try {
      const preflight = await synapse.storage.preflightUpload(sizeBytes)
      if (!preflight.allowanceCheck.sufficient) {
        return {
          ready: false,
          reason:
            preflight.allowanceCheck.message ||
            'Insufficient storage allowance. Add more funds on the Wallet page.',
          suggestedDeposit: '5.00',
        }
      }
    } catch {}
  }

  return { ready: true }
}

async function storageUpload(params: Json | undefined) {
  const input = requireAuthInput(params)
  const withCDN = params?.withCDN !== false
  const bytesBase64 = typeof params?.bytesBase64 === 'string' ? params.bytesBase64 : null
  const filePath = typeof params?.filePath === 'string' ? params.filePath : null

  if (!bytesBase64 && !filePath) {
    throw new Error('Missing payload: provide bytesBase64 or filePath')
  }

  let payload: Uint8Array
  if (bytesBase64) {
    payload = new Uint8Array(Buffer.from(bytesBase64, 'base64'))
  } else {
    payload = new Uint8Array(await readFile(filePath!))
  }

  const synapse = await getSynapse(input)
  const ctx = await synapse.storage.createContext({ withCDN })
  const result = await ctx.upload(payload)
  return {
    pieceCid: result.pieceCid.toString(),
    size: result.size,
    pieceId: result.pieceId ?? null,
  }
}

function writeResponse(payload: unknown) {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

function asError(err: unknown): { message: string } {
  if (err instanceof Error) return { message: err.message }
  return { message: String(err) }
}

async function handleRequest(req: RpcRequest) {
  switch (req.method) {
    case 'health':
      return {
        ok: true,
        component: 'synapse-sidecar',
        litNetwork: litNetworkName,
      }
    case 'storage.status':
      return await storageStatus(req.params)
    case 'storage.depositAndApprove':
      return await storageDepositAndApprove(req.params)
    case 'storage.preflight':
      return await storagePreflight(req.params)
    case 'storage.upload':
      return await storageUpload(req.params)
    case 'storage.reset':
      cachedSynapse = null
      cachedAuthContext = null
      return { ok: true }
    default:
      throw new Error(`Unknown method: ${req.method}`)
  }
}

async function main() {
  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let parsed: RpcRequest
    try {
      parsed = JSON.parse(trimmed)
      if (parsed.id === undefined || typeof parsed.method !== 'string') {
        throw new Error('Invalid request shape')
      }
    } catch (err) {
      writeResponse({ id: null, error: asError(err) })
      continue
    }

    try {
      const result = await handleRequest(parsed)
      writeResponse({ id: parsed.id, result })
    } catch (err) {
      writeResponse({ id: parsed.id, error: asError(err) })
    }
  }
}

main().catch((err) => {
  writeResponse({ id: null, error: asError(err) })
  process.exit(1)
})
