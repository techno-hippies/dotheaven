/**
 * PKPEthersSigner — ethers v6 AbstractSigner backed by a Lit Protocol PKP.
 *
 * Bridges Lit PKP signing into the ethers v6 Signer interface so that
 * libraries expecting an ethers Signer (e.g. Synapse SDK) can use a PKP
 * wallet transparently.
 *
 * Key design decisions:
 * - Forces legacy type-0 transactions (Filecoin doesn't support EIP-1559/2930)
 * - Signs raw tx/typed-data hashes via Lit.Actions.signEcdsa (not personal message)
 * - Signs personal messages via Lit.Actions.ethPersonalSignMessageEcdsa
 * - Requires an active PKP auth context + Lit client from the existing auth system
 */

import { ethers } from 'ethers'
import { getLitClient } from './client'
import type { PKPInfo, PKPAuthContext } from './types'

/** Filecoin Calibration chain ID */
const FIL_CALIBRATION_CHAIN_ID = 314159n

/**
 * Extract r, s, v from a Lit signature result.
 * Lit returns signatures in different formats depending on the runtime version.
 */
function parseLitSignature(sig: any): { r: string; s: string; v: number } {
  const v = sig.recid !== undefined ? sig.recid + 27 : sig.recoveryId + 27

  if (sig.signature) {
    const hex = sig.signature.startsWith('0x') ? sig.signature.slice(2) : sig.signature
    return { r: '0x' + hex.slice(0, 64), s: '0x' + hex.slice(64, 128), v }
  }
  if (sig.r && sig.s) {
    return {
      r: sig.r.startsWith('0x') ? sig.r : '0x' + sig.r,
      s: sig.s.startsWith('0x') ? sig.s : '0x' + sig.s,
      v,
    }
  }
  throw new Error(`Unknown Lit signature format: ${JSON.stringify(sig)}`)
}

/**
 * Sign a raw 32-byte hash with the PKP via Lit Action (signEcdsa).
 */
async function signHash(
  hashBytes: number[],
  publicKey: string,
  authContext: PKPAuthContext,
): Promise<{ r: string; s: string; v: number }> {
  const litClient = await getLitClient()

  const litActionCode = `(async () => {
    const toSign = new Uint8Array(jsParams.hashBytes);
    const sigShare = await Lit.Actions.signEcdsa({
      toSign: toSign,
      publicKey: jsParams.publicKey,
      sigName: "sig",
    });
  })();`

  const result = await litClient.executeJs({
    code: litActionCode,
    authContext,
    jsParams: { hashBytes, publicKey },
  })

  if (!result.signatures?.sig) {
    throw new Error('No signature returned from PKP')
  }
  return parseLitSignature(result.signatures.sig)
}

export class PKPEthersSigner extends ethers.AbstractSigner {
  private _pkp: PKPInfo
  private _authContext: PKPAuthContext

  constructor(pkp: PKPInfo, authContext: PKPAuthContext, provider: ethers.Provider) {
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

    const litActionCode = `(async () => {
      const sigShare = await Lit.Actions.ethPersonalSignMessageEcdsa({
        message: jsParams.message,
        publicKey: jsParams.publicKey,
        sigName: "sig",
      });
    })();`

    const result = await litClient.executeJs({
      code: litActionCode,
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

    // Fill missing fields
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
    if (txToSign.chainId === undefined || txToSign.chainId === 0) {
      txToSign.chainId = FIL_CALIBRATION_CHAIN_ID
    }

    // Force legacy type-0 — Filecoin doesn't support EIP-2930/1559
    txToSign.type = 0

    // Remove 'from' — unsigned tx can't have it (derived from signature)
    const { from: _from, ...txWithoutFrom } = txToSign

    // Compute tx hash client-side (ethers not available in Lit Actions)
    const unsignedTx = ethers.Transaction.from(txWithoutFrom)
    const txHash = ethers.keccak256(unsignedTx.unsignedSerialized)
    const txHashBytes = Array.from(ethers.getBytes(txHash))

    const { r, s, v } = await signHash(txHashBytes, this._pkp.publicKey, this._authContext)

    const signedTx = ethers.Transaction.from({
      ...txWithoutFrom,
      signature: { r, s, v },
    })

    return signedTx.serialized
  }

  async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    const populated = await this.populateTransaction(tx)
    const signedTx = await this.signTransaction(populated)
    if (!this.provider) throw new Error('No provider')
    return this.provider.broadcastTransaction(signedTx)
  }

  async populateTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionLike> {
    const populated: ethers.TransactionLike = {
      ...tx,
      from: this._pkp.ethAddress,
    }

    if (populated.nonce === undefined && this.provider) {
      populated.nonce = await this.provider.getTransactionCount(this._pkp.ethAddress)
    }
    if (populated.gasLimit === undefined && this.provider) {
      populated.gasLimit = await this.provider.estimateGas({
        ...tx,
        from: this._pkp.ethAddress,
      })
    }
    if (
      populated.gasPrice === undefined &&
      populated.maxFeePerGas === undefined &&
      this.provider
    ) {
      const feeData = await this.provider.getFeeData()
      populated.gasPrice = feeData.gasPrice
    }
    if (populated.chainId === undefined) {
      populated.chainId = FIL_CALIBRATION_CHAIN_ID
    }

    return populated
  }
}
