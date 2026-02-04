/**
 * Storage Service — manages Filecoin storage balance, deposits, and operator approvals.
 *
 * Wraps the Synapse SDK's payments/storage APIs into a simple interface:
 *   - getStorageStatus()  → balance, burn rate, days remaining
 *   - deposit(amount)     → deposit USDFC + auto-approve operator
 *   - checkUploadReady()  → can we upload right now?
 *
 * Used by:
 *   - WalletPage (Storage section)
 *   - filecoin-upload-service.ts (preflight check)
 */

import { ethers } from 'ethers'
import { Synapse, RPC_URLS } from '@filoz/synapse-sdk'
import type { PKPAuthContext, PKPInfo } from './lit'
import { PKPEthersSigner } from './lit/pkp-ethers-signer'

// ── Constants ──────────────────────────────────────────────────────────

const FIL_RPC = RPC_URLS.mainnet.http
const USDFC_DECIMALS = 18

/** Default lockup period for operator approval (30 days in epochs, ~2880/day on Filecoin) */
const EPOCHS_PER_DAY = 2880n
const DEFAULT_MAX_LOCKUP_EPOCHS = EPOCHS_PER_DAY * 30n

// ── Types ──────────────────────────────────────────────────────────────

export interface StorageStatus {
  /** Deposited balance in USDFC (human-readable) */
  balance: string
  /** Raw balance in wei */
  balanceRaw: bigint
  /** Whether operator (Warm Storage) is approved */
  operatorApproved: boolean
  /** Estimated monthly cost based on current storage (human-readable) */
  monthlyCost: string
  /** Estimated days remaining at current burn rate */
  daysRemaining: number | null
  /** Whether storage is ready for uploads (has balance + approval) */
  ready: boolean
}

export interface UploadReadiness {
  ready: boolean
  /** If not ready, human-readable reason */
  reason?: string
  /** Suggested deposit amount in USDFC (human-readable) */
  suggestedDeposit?: string
}

// ── Singleton ──────────────────────────────────────────────────────────

let _synapse: Synapse | null = null
let _signer: PKPEthersSigner | null = null

/**
 * Get or create a Synapse instance for storage operations.
 * Cached per session — call resetSynapse() on logout.
 */
async function getSynapse(pkp: PKPInfo, authContext: PKPAuthContext): Promise<Synapse> {
  if (_synapse) return _synapse

  const filProvider = new ethers.JsonRpcProvider(FIL_RPC)
  _signer = new PKPEthersSigner(pkp, authContext, filProvider)

  _synapse = await Synapse.create({
    signer: _signer as any,
    withCDN: true,
  })

  return _synapse
}

/** Reset cached Synapse (call on logout). */
export function resetSynapse() {
  _synapse = null
  _signer = null
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Get current storage status: balance, burn rate, days remaining.
 */
export async function getStorageStatus(
  pkp: PKPInfo,
  authContext: PKPAuthContext,
): Promise<StorageStatus> {
  const synapse = await getSynapse(pkp, authContext)

  // Account info (balance + lockup)
  let balanceRaw = 0n
  let lockupRate = 0n
  try {
    const info = await synapse.payments.accountInfo()
    balanceRaw = info.availableFunds
    lockupRate = info.lockupRate
  } catch {
    // No account yet — zero balance
  }

  // Check operator approval via getStorageInfo
  let operatorApproved = false
  try {
    const storageInfo = await synapse.storage.getStorageInfo()
    operatorApproved = storageInfo.allowances?.isApproved ?? false
  } catch {
    // Not approved
  }

  const balance = ethers.formatUnits(balanceRaw, USDFC_DECIMALS)

  // Compute monthly cost from lockup rate (rate per epoch × epochs per month)
  const epochsPerMonth = EPOCHS_PER_DAY * 30n
  const monthlyCostRaw = lockupRate * epochsPerMonth
  const monthlyCost = ethers.formatUnits(monthlyCostRaw, USDFC_DECIMALS)

  // Days remaining = available funds / (lockup rate per day)
  let daysRemaining: number | null = null
  if (lockupRate > 0n) {
    const dailyCost = lockupRate * EPOCHS_PER_DAY
    if (dailyCost > 0n) {
      // Integer division in days
      daysRemaining = Number(balanceRaw / dailyCost)
    }
  }

  return {
    balance: formatUSD(balance),
    balanceRaw,
    operatorApproved,
    monthlyCost: formatUSD(monthlyCost),
    daysRemaining,
    ready: balanceRaw > 0n && operatorApproved,
  }
}

/**
 * Deposit USDFC into the Synapse Pay contract and approve the Warm Storage operator.
 * Uses depositWithPermit (single-tx ERC-20 approval + deposit) when possible,
 * plus approveService if operator not yet approved.
 *
 * @param amount Human-readable USDFC amount (e.g. "5.00")
 */
export async function depositAndApprove(
  pkp: PKPInfo,
  authContext: PKPAuthContext,
  amount: string,
): Promise<{ txHash: string }> {
  const synapse = await getSynapse(pkp, authContext)
  const amountWei = ethers.parseUnits(amount, USDFC_DECIMALS)

  // Check current operator status
  let isApproved = false
  try {
    const storageInfo = await synapse.storage.getStorageInfo()
    isApproved = storageInfo.allowances?.isApproved ?? false
  } catch {}

  if (!isApproved) {
    // Combined: deposit + approve operator in one tx
    const warmAddr = synapse.getWarmStorageAddress()

    // Generous allowances — user shouldn't hit these limits in normal use
    const rateAllowance = ethers.parseUnits('10', USDFC_DECIMALS) // $10/epoch max rate
    const lockupAllowance = ethers.parseUnits('100', USDFC_DECIMALS) // $100 max lockup

    console.log(`[Storage] Depositing ${amount} USDFC + approving operator...`)
    const tx = await synapse.payments.depositWithPermitAndApproveOperator(
      amountWei,
      warmAddr,
      rateAllowance,
      lockupAllowance,
      DEFAULT_MAX_LOCKUP_EPOCHS,
    )
    const receipt = await tx.wait()
    console.log(`[Storage] Deposit + approve tx: ${receipt?.hash}`)
    return { txHash: receipt?.hash || tx.hash }
  }

  // Already approved — just deposit
  console.log(`[Storage] Depositing ${amount} USDFC...`)
  const tx = await synapse.payments.deposit(amountWei)
  const receipt = await tx.wait()
  console.log(`[Storage] Deposit tx: ${receipt?.hash}`)
  return { txHash: receipt?.hash || tx.hash }
}

/**
 * Check if the user can upload a file of the given size right now.
 * Returns ready=true if sufficient balance + operator approved.
 */
export async function checkUploadReady(
  pkp: PKPInfo,
  authContext: PKPAuthContext,
  sizeBytes?: number,
): Promise<UploadReadiness> {
  const synapse = await getSynapse(pkp, authContext)

  // Quick check: any balance at all?
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

  // Check operator approval
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

  // If size specified, do a preflight cost check
  if (sizeBytes) {
    try {
      const preflight = await synapse.storage.preflightUpload(sizeBytes)
      if (!preflight.allowanceCheck.sufficient) {
        return {
          ready: false,
          reason: preflight.allowanceCheck.message || 'Insufficient storage allowance. Add more funds on the Wallet page.',
          suggestedDeposit: '5.00',
        }
      }
    } catch {
      // Preflight failed — let the upload try anyway
    }
  }

  return { ready: true }
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Format a numeric string as USD with 2 decimal places */
function formatUSD(value: string): string {
  const num = parseFloat(value)
  if (isNaN(num) || num === 0) return '$0.00'
  return `$${num.toFixed(2)}`
}
