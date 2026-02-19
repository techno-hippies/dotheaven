/**
 * Storage Service (Load-first)
 *
 * Filecoin/Synapse deposits are deprecated in this app path.
 * Upload readiness is based on auth/session only.
 */

import type { PKPAuthContext, PKPInfo } from './lit'

export interface StorageStatus {
  balance: string
  balanceRaw: bigint
  operatorApproved: boolean
  monthlyCost: string
  daysRemaining: number | null
  ready: boolean
}

export interface UploadReadiness {
  ready: boolean
  reason?: string
  suggestedDeposit?: string
}

export function resetSynapse() {
  // no-op: retained for compatibility with existing call sites
}

export async function getStorageStatus(
  _pkp: PKPInfo,
  _authContext: PKPAuthContext,
): Promise<StorageStatus> {
  return {
    balance: '$0.00',
    balanceRaw: 0n,
    operatorApproved: true,
    monthlyCost: '$0.00',
    daysRemaining: null,
    ready: true,
  }
}

export async function depositAndApprove(
  _pkp: PKPInfo,
  _authContext: PKPAuthContext,
  _amount: string,
): Promise<{ txHash: string }> {
  throw new Error('Filecoin USDFC deposit flow removed. Use Load/Turbo funding instead.')
}

export async function checkUploadReady(
  _pkp: PKPInfo,
  _authContext: PKPAuthContext,
  _sizeBytes?: number,
): Promise<UploadReadiness> {
  return { ready: true }
}
