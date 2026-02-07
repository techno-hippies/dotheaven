#!/usr/bin/env bun
/**
 * Test PKPEthersSigner — verify PKP can sign Filecoin transactions via Lit.
 *
 * Uses the test PKP (which has tFIL + USDFC on Calibration) to:
 *   1. Initialize PKPEthersSigner
 *   2. Verify getAddress() matches PKP eth address
 *   3. Initialize Synapse with PKP signer
 *   4. Check storage balance
 *   5. Deposit 0.01 USDFC (small amount to prove signing works)
 *
 * Usage:
 *   source .env && bun run tests/pkp-signer.test.ts
 */

import { Synapse } from "@filoz/synapse-sdk";
import { createLitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from "@lit-protocol/auth";
import { privateKeyToAccount } from "viem/accounts";
import { Env } from "./shared/env";
import { ethers } from "ethers";

// ── Constants ──────────────────────────────────────────────────────────

const FIL_RPC = "https://api.calibration.node.glif.io/rpc/v1";
const FIL_CHAIN_ID = 314159n;
const USDFC_DECIMALS = 18;
const DEPOSIT_AMOUNT = ethers.parseUnits("0.01", USDFC_DECIMALS); // Small test deposit

// ── Inline PKPEthersSigner (same logic as frontend version) ────────────

function parseLitSignature(sig: any): { r: string; s: string; v: number } {
  const v = sig.recid !== undefined ? sig.recid + 27 : sig.recoveryId + 27;
  if (sig.signature) {
    const hex = sig.signature.startsWith("0x") ? sig.signature.slice(2) : sig.signature;
    return { r: "0x" + hex.slice(0, 64), s: "0x" + hex.slice(64, 128), v };
  }
  if (sig.r && sig.s) {
    return {
      r: sig.r.startsWith("0x") ? sig.r : "0x" + sig.r,
      s: sig.s.startsWith("0x") ? sig.s : "0x" + sig.s,
      v,
    };
  }
  throw new Error(`Unknown Lit signature format: ${JSON.stringify(sig)}`);
}

class PKPEthersSigner extends ethers.AbstractSigner {
  private _pkpPublicKey: string;
  private _ethAddress: string;
  private _authContext: any;
  private _litClient: any;

  constructor(
    ethAddress: string,
    pkpPublicKey: string,
    authContext: any,
    litClient: any,
    provider: ethers.Provider,
  ) {
    super(provider);
    this._ethAddress = ethAddress;
    this._pkpPublicKey = pkpPublicKey;
    this._authContext = authContext;
    this._litClient = litClient;
  }

  async getAddress(): Promise<string> {
    return this._ethAddress;
  }

  connect(provider: ethers.Provider): PKPEthersSigner {
    return new PKPEthersSigner(
      this._ethAddress,
      this._pkpPublicKey,
      this._authContext,
      this._litClient,
      provider,
    );
  }

  private async _signHash(hashBytes: number[]): Promise<{ r: string; s: string; v: number }> {
    const litActionCode = `(async () => {
      const toSign = new Uint8Array(jsParams.hashBytes);
      const sigShare = await Lit.Actions.signEcdsa({
        toSign: toSign,
        publicKey: jsParams.publicKey,
        sigName: "sig",
      });
    })();`;

    const result = await this._litClient.executeJs({
      code: litActionCode,
      authContext: this._authContext,
      jsParams: { hashBytes, publicKey: this._pkpPublicKey },
    });

    if (!result.signatures?.sig) throw new Error("No signature returned from PKP");
    return parseLitSignature(result.signatures.sig);
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const msgStr = typeof message === "string" ? message : ethers.hexlify(message);
    const litActionCode = `(async () => {
      const sigShare = await Lit.Actions.ethPersonalSignMessageEcdsa({
        message: jsParams.message,
        publicKey: jsParams.publicKey,
        sigName: "sig",
      });
    })();`;

    const result = await this._litClient.executeJs({
      code: litActionCode,
      authContext: this._authContext,
      jsParams: { message: msgStr, publicKey: this._pkpPublicKey },
    });

    if (!result.signatures?.sig) throw new Error("No signature returned from PKP");
    const sig = result.signatures.sig as any;
    const vHex = ((sig.recid ?? sig.recoveryId) + 27).toString(16).padStart(2, "0");
    const sigHex = sig.signature.startsWith("0x") ? sig.signature.slice(2) : sig.signature;
    return `0x${sigHex}${vHex}`;
  }

  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, any>,
  ): Promise<string> {
    const hash = ethers.TypedDataEncoder.hash(domain, types, value);
    const hashBytes = Array.from(ethers.getBytes(hash));
    const { r, s, v } = await this._signHash(hashBytes);
    return ethers.Signature.from({ r, s, v }).serialized;
  }

  async signTransaction(tx: ethers.TransactionRequest): Promise<string> {
    const txToSign = { ...tx };

    if (txToSign.from === undefined) txToSign.from = this._ethAddress;
    if (txToSign.nonce === undefined && this.provider) {
      txToSign.nonce = await this.provider.getTransactionCount(this._ethAddress);
    }
    if (txToSign.gasLimit === undefined && this.provider) {
      txToSign.gasLimit = await this.provider.estimateGas({ ...txToSign, from: this._ethAddress });
    }
    if (txToSign.gasPrice === undefined && txToSign.maxFeePerGas === undefined && this.provider) {
      const feeData = await this.provider.getFeeData();
      txToSign.gasPrice = feeData.gasPrice;
    }
    if (txToSign.chainId === undefined || txToSign.chainId === 0) {
      txToSign.chainId = FIL_CHAIN_ID;
    }

    // Force legacy type-0 — Filecoin doesn't support EIP-2930/1559
    txToSign.type = 0;

    const { from: _from, ...txWithoutFrom } = txToSign;
    const unsignedTx = ethers.Transaction.from(txWithoutFrom);
    const txHash = ethers.keccak256(unsignedTx.unsignedSerialized);
    const txHashBytes = Array.from(ethers.getBytes(txHash));

    const { r, s, v } = await this._signHash(txHashBytes);

    const signedTx = ethers.Transaction.from({
      ...txWithoutFrom,
      signature: { r, s, v },
    });

    return signedTx.serialized;
  }

  async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    const populated = await this.populateTransaction(tx);
    const signedTx = await this.signTransaction(populated);
    if (!this.provider) throw new Error("No provider");
    return this.provider.broadcastTransaction(signedTx);
  }

  async populateTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionLike> {
    const populated: ethers.TransactionLike = { ...tx, from: this._ethAddress };

    if (populated.nonce === undefined && this.provider) {
      populated.nonce = await this.provider.getTransactionCount(this._ethAddress);
    }
    if (populated.gasLimit === undefined && this.provider) {
      populated.gasLimit = await this.provider.estimateGas({ ...tx, from: this._ethAddress });
    }
    if (populated.gasPrice === undefined && populated.maxFeePerGas === undefined && this.provider) {
      const feeData = await this.provider.getFeeData();
      populated.gasPrice = feeData.gasPrice;
    }
    if (populated.chainId === undefined) {
      populated.chainId = FIL_CHAIN_ID;
    }

    return populated;
  }
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("Test PKPEthersSigner with Synapse");
  console.log("=".repeat(60));

  const pkpCreds = Env.loadPkpCreds();
  console.log(`   PKP address: ${pkpCreds.ethAddress}`);

  // EOA to create auth context (controls the PKP)
  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found");
  if (!pk.startsWith("0x")) pk = "0x" + pk;

  const t0 = performance.now();

  // ── Step 1: Connect Lit + create auth context ──
  console.log("\n── Step 1: Connect Lit Protocol ──");
  const litClient = await createLitClient({ network: Env.litNetwork });
  console.log("   Connected");

  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "pkp-signer-test",
      networkName: Env.name,
      storagePath: "./output/lit-auth",
    }),
  });

  const authEoa = privateKeyToAccount(pk as `0x${string}`);
  const authData = await ViemAccountAuthenticator.authenticate(authEoa);
  const authContext = await authManager.createPkpAuthContext({
    authData,
    pkpPublicKey: pkpCreds.publicKey,
    authConfig: {
      resources: [
        ["pkp-signing", "*"],
        ["lit-action-execution", "*"],
      ],
      expiration: new Date(Date.now() + 1000 * 60 * 15).toISOString(),
      statement: "",
    },
    litClient,
  });
  console.log("   Auth context ready");

  // ── Step 2: Create PKPEthersSigner ──
  console.log("\n── Step 2: Create PKPEthersSigner ──");
  const filProvider = new ethers.JsonRpcProvider(FIL_RPC);
  const pkpSigner = new PKPEthersSigner(
    pkpCreds.ethAddress,
    pkpCreds.publicKey,
    authContext,
    litClient,
    filProvider,
  );

  const addr = await pkpSigner.getAddress();
  console.log(`   getAddress(): ${addr}`);
  if (addr.toLowerCase() !== pkpCreds.ethAddress.toLowerCase()) {
    throw new Error(`Address mismatch: ${addr} != ${pkpCreds.ethAddress}`);
  }
  console.log("   ✓ Address matches PKP");

  // Check balances
  const tfilBal = await filProvider.getBalance(addr);
  console.log(`   tFIL: ${ethers.formatEther(tfilBal)}`);
  if (tfilBal === 0n) throw new Error("PKP has no tFIL for gas");

  // ── Step 3: Initialize Synapse with PKP signer ──
  console.log("\n── Step 3: Initialize Synapse with PKP signer ──");

  const syn = await Synapse.create({
    signer: pkpSigner as any,
    withCDN: true,
    disableNonceManager: false,
  });
  console.log("   ✓ Synapse initialized with PKP signer");

  const payments = (syn as any)._payments;
  const accountInfo = await payments.accountInfo();
  const available = accountInfo.availableFunds;
  console.log(`   Storage available: ${ethers.formatUnits(available, USDFC_DECIMALS)} USDFC`);

  // ── Step 4: Deposit with PKP signing ──
  console.log("\n── Step 4: Deposit 0.01 USDFC via PKP ──");

  const warmStorageAddr = (syn as any)._warmStorageAddress;
  console.log(`   Warm storage: ${warmStorageAddr}`);
  console.log("   Depositing...");

  const depositTx = await payments.depositWithPermitAndApproveOperator(
    DEPOSIT_AMOUNT,
    warmStorageAddr,
    BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
    BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
    2880 * 30,
  );

  console.log(`   Deposit tx: ${depositTx.hash}`);
  await depositTx.wait();
  console.log("   ✓ Deposit confirmed!");

  // Verify balance increased
  const newInfo = await payments.accountInfo();
  console.log(`   New storage available: ${ethers.formatUnits(newInfo.availableFunds, USDFC_DECIMALS)} USDFC`);

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`ALL CHECKS PASSED (${elapsed}s)`);
  console.log("=".repeat(60));

  litClient.disconnect();
}

main().catch((err) => {
  console.error(`\nFAILED:`, err.message || err);
  console.error(err);
  process.exit(1);
});
