/**
 * Song Publish Service
 *
 * Orchestrates the full song publish pipeline:
 * 1. Read form files
 * 2. Upload cover to Arweave (canonical `ar://...` ref)
 * 3. Pre-upload audio stems to Filebase for Lit fetch
 * 4. Build metadata JSONs
 * 5. SHA-256 hash all content + sign EIP-191 via PKP
 * 6. Call song-publish-v2 Lit Action (storage-agnostic params + lyrics alignment + translation)
 * 7. Sign EIP-712 typed data for Story registration via PKP
 * 8. Call story-register-sponsor-v1 Lit Action (mint NFT, register IP, attach license)
 * 9. Register on ContentRegistry (MegaETH) so subgraph indexes the song
 * 10. Write cover ref on-chain via track-cover-v5 (`ar://...`)
 * 11. Auto-translate lyrics to Mandarin + English (best-effort, doesn't fail publish)
 */

import { getLitClient } from '../lit/client'
import { SONG_PUBLISH_V2_CID, STORY_REGISTER_SPONSOR_CID, LYRICS_TRANSLATE_CID, CONTENT_REGISTER_MEGAETH_V1_CID, TRACK_COVER_V5_CID } from '../lit/action-cids'
import { signMessageWithPKP } from '../lit/signer-pkp'
import type { PKPInfo, PKPAuthContext } from '../lit/types'
import type { SongFormData, LicenseType } from '@heaven/ui'
import { computeTrackId } from '../filecoin-upload-service'
import { uploadCoverToArweave } from '../arweave-upload'
import { buildMusicRegisterBody } from './music-publish-api'

// ── Types ──────────────────────────────────────────────────────────

export interface PublishResult {
  ipId: string
  tokenId: string
  audioCid: string
  instrumentalCid: string
  coverCid: string
  canvasCid?: string
  licenseTermsIds: string[]
}

type EncryptedKey = {
  ciphertext: string
  dataToEncryptHash: string
  accessControlConditions: unknown[]
}

// ── Encrypted keys (bound to song-publish-v2 action CID) ──────────

const FILEBASE_ENCRYPTED_KEY: EncryptedKey = {
  ciphertext: 'lnvxDJMtF1yqGN7cAj9ZKBdkoCgJ4JExWKiy7/u6O0ebNj4aagBJ9MAqulSHrJx7DrVne1L78etCAxYdH6KXERYdL6TZZc4TDAEbT0EAZRhleFyH7P1yO65ryGekd85Tj7tCytYN/zdg7OYd+eCr6+ouqBszY4M+RvjP9UerLyW9/TXdP1v670y/ov+hMLaI1P8pnixXbBqb5xoKmTZ9PxRymzC2XUhbLyjD/nDMHVIOBDVGLvQC',
  dataToEncryptHash: '23ab539bda3900163da16db23be0e6e6c6003d35bd1ac54aeaada176f8f1e0d4',
  accessControlConditions: [{
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':currentActionIpfsId'],
    returnValueTest: { comparator: '=', value: SONG_PUBLISH_V2_CID },
  }],
}

const ELEVENLABS_ENCRYPTED_KEY: EncryptedKey = {
  ciphertext: 'uTJ6xvhguWO1H8NqauuOD0orVBeoBEXGu1NlGIPegSnmXz7LbLgNhthJRQdfk9936YuJtmTKw2epxfRSMLWbPOV2ZJyp7cKUfYMrKTLn32o02afacl81HhehuxfwMOId88KaS8wmFSsq6as80qOj4+tWzDBFxymcnGmSZ1vJSl3R/FmJ/AI=',
  dataToEncryptHash: '6d1863a0dd36fcff73e8d00eaec3f038d143e4bea663b57f8b9810d786b73f6c',
  accessControlConditions: [{
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':currentActionIpfsId'],
    returnValueTest: { comparator: '=', value: SONG_PUBLISH_V2_CID },
  }],
}

const OPENROUTER_ENCRYPTED_KEY: EncryptedKey = {
  ciphertext: 'qh5DyFLLEVx2NaFx1FHQKw+1HhqaaiM0l4wTJwhRsZfl7zl/xKjfTdOaVHxYkJJakDr1j1XbMCOxJHD5GH3o0u+KAngydXuY1NGkVKx5F19KCj92+OG1VXQG/io41UPLQfYnUxnvthial/7+czfEJI6XFtjesgn6/9IJACMA9kiBTaU71VhcbMgWFhjcyPF89f1PX8opr4sUDiwC',
  dataToEncryptHash: '2ca783d51c4bfd1a8b80e1c8aee5e94d3f17c3089f8bca45e48d40b3435ae092',
  accessControlConditions: [{
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':currentActionIpfsId'],
    returnValueTest: { comparator: '=', value: SONG_PUBLISH_V2_CID },
  }],
}

// ── Encrypted keys (bound to lyrics-translate-v1 action CID) ─────

const LYRICS_FILEBASE_ENCRYPTED_KEY: EncryptedKey = {
  ciphertext: 'tKYa+oVjx6F2Ja3rm4OWeinfcyENLf3dwSIIMEa7g/XQP/wnGE9nXGiR2JMuXGYpLx03kppJfMdbv25N+yRjORw8KDuKHAMXGZqFbXTmYMxls8tH1zpaHxLlcicKVxIXeReXvSOgJVZ9cELNSMDSByVBNM6ka70jPT6RdFbCrs9mUyQUb0XZaEyzmjTjZ/K2/Uqz7pwkxu+3iBHBnKLCDV8hoBQdXO9CLspRXCycy7LCPNSUpSMC',
  dataToEncryptHash: '23ab539bda3900163da16db23be0e6e6c6003d35bd1ac54aeaada176f8f1e0d4',
  accessControlConditions: [{
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':currentActionIpfsId'],
    returnValueTest: { comparator: '=', value: LYRICS_TRANSLATE_CID },
  }],
}

const LYRICS_OPENROUTER_ENCRYPTED_KEY: EncryptedKey = {
  ciphertext: 'o/7W0AEqLIdlO6GriIAs5iwxPJ/3JG2ctRysJKRZN0j67xW1kl23sD9fkTRCXr2FhnmFMfSoLB5r0cGD7hAEP3J7jCZIJa0k+xrWn7gjnORKqMpZl1G5LR+V9MV1UVSmrydFubnmnNWF3pBGkvUGDVl/RrYGgUJ0G9XOSYqHjxcFZ6VDcKw/ByOMOL/OmM8QDOVnV5Va6E+76EUC',
  dataToEncryptHash: '2ca783d51c4bfd1a8b80e1c8aee5e94d3f17c3089f8bca45e48d40b3435ae092',
  accessControlConditions: [{
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':currentActionIpfsId'],
    returnValueTest: { comparator: '=', value: LYRICS_TRANSLATE_CID },
  }],
}

// ── Auto-translate target languages ──────────────────────────────

/** Always translate to these languages (excluding the source language) */
const AUTO_TRANSLATE_LANGS = ['zh', 'en']

// ── Language mapping ───────────────────────────────────────────────

const LANG_CODE_TO_NAME: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  it: 'Italian', pt: 'Portuguese', ru: 'Russian', ja: 'Japanese',
  ko: 'Korean', zh: 'Mandarin Chinese', ar: 'Arabic', hi: 'Hindi',
  tr: 'Turkish', th: 'Thai', vi: 'Vietnamese', id: 'Indonesian',
  tl: 'Tagalog', sw: 'Swahili',
}

// ── EIP-712 domain for Story registration ──────────────────────────

const STORY_EIP712_DOMAIN = {
  name: 'Heaven Song Registration',
  version: '1',
  chainId: 1315,
}

const STORY_EIP712_TYPES = {
  RegisterSong: [
    { name: 'recipient', type: 'address' },
    { name: 'ipMetadataHash', type: 'bytes32' },
    { name: 'nftMetadataHash', type: 'bytes32' },
    { name: 'commercialRevShare', type: 'uint32' },
    { name: 'defaultMintingFee', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
}

// ── Helpers ────────────────────────────────────────────────────────

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data as ArrayBufferView<ArrayBuffer>)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256HexString(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text))
}

function toBase64(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i])
  }
  return btoa(binary)
}

function licenseToRevShare(license: LicenseType, revShare: number): number {
  if (license === 'non-commercial') return 0
  return revShare
}

/**
 * Sign EIP-712 typed data using PKP via a Lit Action.
 * We use signEcdsa on the typed data hash (not ethPersonalSignMessageEcdsa).
 */
async function signTypedDataWithPKP(
  pkpInfo: PKPInfo,
  authContext: PKPAuthContext,
  domain: typeof STORY_EIP712_DOMAIN,
  types: typeof STORY_EIP712_TYPES,
  value: Record<string, unknown>,
): Promise<string> {
  // Import ethers dynamically to compute the typed data hash
  const { ethers } = await import('ethers')
  const hash = ethers.TypedDataEncoder.hash(domain, types, value)
  const hashBytes = Array.from(ethers.getBytes(hash))

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
    jsParams: { hashBytes, publicKey: pkpInfo.publicKey },
  })

  if (!result.signatures?.sig) {
    throw new Error('No EIP-712 signature returned from PKP')
  }

  const sig = result.signatures.sig as any
  const v = ((sig.recid ?? sig.recoveryId) + 27)
  const sigHex = sig.signature.startsWith('0x') ? sig.signature.slice(2) : sig.signature
  return `0x${sigHex}${v.toString(16).padStart(2, '0')}`
}

// ── IPFS gateway URL ───────────────────────────────────────────────

const IPFS_GATEWAY = 'https://ipfs.filebase.io/ipfs/'

// ── Proxy upload via api-core backend ──────────────────────────────

const HEAVEN_API_URL = import.meta.env.VITE_HEAVEN_API_URL || 'http://localhost:8787'

/**
 * Upload files to Filebase via api-core proxy (avoids CORS issues).
 * Browser sends multipart form to worker, worker uploads to S3 server-side.
 *
 * Returns map of slot → CID
 */
async function proxyUpload(
  files: Array<{ slot: string; data: Uint8Array; contentType: string }>,
): Promise<Map<string, string>> {
  const form = new FormData()
  for (const f of files) {
    const blobBytes = new Uint8Array(f.data.byteLength)
    blobBytes.set(f.data)
    form.append(
      f.slot,
      new Blob([blobBytes], { type: f.contentType }),
      `${f.slot}.${f.contentType.split('/')[1] || 'bin'}`,
    )
  }

  const resp = await fetch(`${HEAVEN_API_URL}/api/upload`, {
    method: 'POST',
    body: form,
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Upload failed: ${resp.status} ${err}`)
  }

  const { slots } = (await resp.json()) as { slots: Record<string, { cid: string; gatewayUrl: string }> }
  const cidMap = new Map<string, string>()
  for (const [slot, { cid }] of Object.entries(slots)) {
    cidMap.set(slot, cid)
  }
  return cidMap
}

// ── Main publish function ──────────────────────────────────────────

export async function publishSong(
  formData: SongFormData,
  authContext: PKPAuthContext,
  pkpInfo: PKPInfo,
  onProgress: (pct: number) => void,
): Promise<PublishResult> {
  if (!SONG_PUBLISH_V2_CID) throw new Error('SONG_PUBLISH_V2_CID not set')
  if (!STORY_REGISTER_SPONSOR_CID) throw new Error('STORY_REGISTER_SPONSOR_CID not set')

  const userAddress = pkpInfo.ethAddress

  // ── Step 1: Read files + pre-upload large ones to Filebase (0-15%) ─
  onProgress(2)

  if (!formData.audioFile) throw new Error('Audio file is required')
  if (!formData.vocalsFile) throw new Error('Vocals stem file is required')
  if (!formData.instrumentalFile) throw new Error('Instrumental file is required')
  if (!formData.coverFile) throw new Error('Cover image is required')

  // Read all files into bytes
  const [audioBuffer, vocalsBuffer, instrumentalBuffer, coverBuffer] = await Promise.all([
    formData.audioFile.arrayBuffer(),
    formData.vocalsFile.arrayBuffer(),
    formData.instrumentalFile.arrayBuffer(),
    formData.coverFile.arrayBuffer(),
  ])
  const audioBytes = new Uint8Array(audioBuffer)
  const vocalsBytes = new Uint8Array(vocalsBuffer)
  const instrumentalBytes = new Uint8Array(instrumentalBuffer)
  const coverBytes = new Uint8Array(coverBuffer)
  const canvasBytes = formData.canvasFile
    ? new Uint8Array(await formData.canvasFile.arrayBuffer())
    : null

  onProgress(5)

  // Pre-upload cover to Arweave (canonical ref for new writes)
  const coverUpload = await uploadCoverToArweave({
    base64: toBase64(coverBytes),
    contentType: formData.coverFile.type || 'image/jpeg',
  })
  const coverRef = coverUpload.ref

  // Pre-upload audio stems to Filebase via api-core proxy.
  // Lit nodes fetch via URL instead of receiving inline base64 (avoids 413).
  const uploadFiles: Array<{ slot: string; data: Uint8Array; contentType: string }> = [
    { slot: 'audio', data: audioBytes, contentType: formData.audioFile.type },
    { slot: 'vocals', data: vocalsBytes, contentType: formData.vocalsFile.type },
    { slot: 'instrumental', data: instrumentalBytes, contentType: formData.instrumentalFile.type },
  ]
  if (canvasBytes && formData.canvasFile) {
    uploadFiles.push({ slot: 'canvas', data: canvasBytes, contentType: formData.canvasFile.type })
  }

  const cidMap = await proxyUpload(uploadFiles)

  const audioUrl = `${IPFS_GATEWAY}${cidMap.get('audio')}`
  const vocalsUrl = `${IPFS_GATEWAY}${cidMap.get('vocals')}`
  const instrumentalUrl = `${IPFS_GATEWAY}${cidMap.get('instrumental')}`
  const canvasUrl = cidMap.has('canvas') ? `${IPFS_GATEWAY}${cidMap.get('canvas')}` : null

  onProgress(15)

  // ── Step 2: Build metadata JSONs (15-20%) ────────────────────────
  const sourceLanguageName = LANG_CODE_TO_NAME[formData.primaryLanguage] || formData.primaryLanguage
  const targetLanguage = formData.secondaryLanguage || (formData.primaryLanguage !== 'en' ? 'en' : 'es')

  const songMetadata = JSON.stringify({
    title: formData.title,
    artist: formData.artist,
    genre: formData.genre,
    primaryLanguage: formData.primaryLanguage,
    secondaryLanguage: formData.secondaryLanguage || undefined,
    license: formData.license,
    version: '1.0.0',
  })

  const ipaMetadata = JSON.stringify({
    title: formData.title,
    artist: formData.artist,
    genre: formData.genre,
    language: formData.primaryLanguage,
  })

  const nftMetadata = JSON.stringify({
    name: formData.title,
    description: `${formData.title} by ${formData.artist}`,
    external_url: '',
  })

  onProgress(15)

  // ── Step 3: Hash all content (20-25%) ────────────────────────────
  const [audioHash, coverHash, instrumentalHash, vocalsHash, songMetadataHash, ipaMetadataHash, nftMetadataHash, lyricsHash] =
    await Promise.all([
      sha256Hex(audioBytes),
      sha256Hex(coverBytes),
      sha256Hex(instrumentalBytes),
      sha256Hex(vocalsBytes),
      sha256HexString(songMetadata),
      sha256HexString(ipaMetadata),
      sha256HexString(nftMetadata),
      sha256HexString(formData.lyrics || '(instrumental)'),
    ])
  const canvasHash = canvasBytes ? await sha256Hex(canvasBytes) : ''

  onProgress(25)

  // ── Step 4: Sign EIP-191 binding message (25-30%) ────────────────
  const timestamp = Date.now()
  const nonce = Math.floor(Math.random() * 1_000_000).toString()
  const lyricsText = formData.lyrics || '(instrumental)'

  const message = `heaven:publish:${audioHash}:${coverHash}:${instrumentalHash}:${vocalsHash}:${canvasHash || ''}:${songMetadataHash}:${ipaMetadataHash}:${nftMetadataHash}:${lyricsHash}:${sourceLanguageName}:${targetLanguage}:${timestamp}:${nonce}`

  const signature = await signMessageWithPKP(pkpInfo, authContext, message)

  onProgress(30)

  // ── Step 5: Call song-publish-v2 Lit Action (30-65%) ─────────────
  const litClient = await getLitClient()

  const publishResult = await litClient.executeJs({
    ipfsId: SONG_PUBLISH_V2_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpInfo.publicKey,
      audioRef: audioUrl,
      coverRef,
      vocalsRef: vocalsUrl,
      instrumentalRef: instrumentalUrl,
      canvasRef: canvasUrl || undefined,
      storageMode: 'filebase',
      songMetadataJson: songMetadata,
      ipaMetadataJson: ipaMetadata,
      nftMetadataJson: nftMetadata,
      signature,
      timestamp,
      nonce,
      lyricsText,
      sourceLanguage: sourceLanguageName,
      targetLanguage,
      storageEncryptedKey: FILEBASE_ENCRYPTED_KEY,
      elevenlabsEncryptedKey: ELEVENLABS_ENCRYPTED_KEY,
      openrouterEncryptedKey: OPENROUTER_ENCRYPTED_KEY,
    },
  })

  const publishResponse = JSON.parse(publishResult.response as string)
  if (!publishResponse.success) {
    throw new Error(`Song publish failed: ${publishResponse.error}`)
  }

  onProgress(65)

  // ── Step 6: Sign EIP-712 for Story registration (65-70%) ─────────
  const revShare = licenseToRevShare(formData.license, formData.revShare)
  const storyTimestamp = Date.now()
  const storyNonce = Math.floor(Math.random() * 1_000_000).toString()

  const ipMetadataURI = `${IPFS_GATEWAY}${publishResponse.ipaMetadataCID}`
  const nftMetadataURI = `${IPFS_GATEWAY}${publishResponse.nftMetadataCID}`

  // Hash must be 0x-prefixed bytes32 (SHA-256 of metadata JSON, zero-padded to 32 bytes)
  const ipMetadataHash = `0x${await sha256HexString(ipaMetadata)}`
  const nftMetadataHashHex = `0x${await sha256HexString(nftMetadata)}`

  const typedValue = {
    recipient: userAddress,
    ipMetadataHash,
    nftMetadataHash: nftMetadataHashHex,
    commercialRevShare: revShare,
    defaultMintingFee: formData.mintingFee || '0',
    timestamp: storyTimestamp.toString(),
    nonce: storyNonce,
  }

  const storySignature = await signTypedDataWithPKP(
    pkpInfo, authContext,
    STORY_EIP712_DOMAIN, STORY_EIP712_TYPES, typedValue,
  )

  onProgress(70)

  // ── Step 7: Call story-register-sponsor-v1 Lit Action (70-88%) ───
  const storyRegisterBody = buildMusicRegisterBody({
    recipient: userAddress,
    ipMetadataURI,
    ipMetadataHash,
    nftMetadataURI,
    nftMetadataHash: nftMetadataHashHex,
    commercialRevShare: revShare,
    defaultMintingFee: formData.mintingFee || '0',
    selection: {
      publishType: formData.publishType,
      parentIpIds: formData.parentIpIds,
      licenseTermsIds: formData.licenseTermsIds,
    },
  })

  const storyResult = await litClient.executeJs({
    ipfsId: STORY_REGISTER_SPONSOR_CID,
    authContext,
    jsParams: {
      ...storyRegisterBody,
      signature: storySignature,
      timestamp: storyTimestamp,
      nonce: storyNonce,
    },
  })

  const storyResponse = JSON.parse(storyResult.response as string)
  if (!storyResponse.success) {
    throw new Error(`Story registration failed: ${storyResponse.error}`)
  }

  onProgress(88)

  const trackId = computeTrackId({
    title: formData.title,
    artist: formData.artist,
    album: '',
  })

  // ── Step 8: Register on ContentRegistry (MegaETH) for subgraph ────
  // Uses MegaETH-only Lit Action (skips Base mirror which isn't needed for published songs).
  // This creates a ContentRegistered event that the dotheaven music-social subgraph
  // indexes, making the song appear in the library across devices.
  if (CONTENT_REGISTER_MEGAETH_V1_CID) {
    try {
      const audioCid = publishResponse.audioCID
      console.log('[Publish] Registering on ContentRegistry (MegaETH):', { trackId, audioCid })

      const litClient = await getLitClient()
      const timestamp = Date.now().toString()
      const nonce = crypto.randomUUID()

      const result = await litClient.executeJs({
        ipfsId: CONTENT_REGISTER_MEGAETH_V1_CID,
        authContext,
        jsParams: {
          userPkpPublicKey: pkpInfo.publicKey,
          trackId,
          pieceCid: audioCid,
          algo: 1, // ContentRegistry requires algo != 0
          timestamp,
          nonce,
          title: formData.title,
          artist: formData.artist,
          album: '',
        },
      })

      const response = JSON.parse(result.response as string)
      if (!response.success) {
        console.warn('[Publish] ContentRegistry registration failed:', response.error)
      } else {
        console.log('[Publish] ContentRegistry registered:', response)
      }
    } catch (err) {
      // Non-fatal: song is already on Story + IPFS. Library indexing will be missing
      // but the song is published. User can still access via Story.
      console.warn('[Publish] ContentRegistry registration failed (non-fatal):', err)
    }
  } else {
    console.warn('[Publish] CONTENT_REGISTER_MEGAETH_V1_CID not set — skipping ContentRegistry registration')
  }

  // ── Step 9: Set canonical on-chain cover ref via track-cover-v5 ─────
  if (TRACK_COVER_V5_CID) {
    try {
      const coverTimestamp = Date.now().toString()
      const coverNonce = crypto.randomUUID()
      const coverResult = await litClient.executeJs({
        ipfsId: TRACK_COVER_V5_CID,
        authContext,
        jsParams: {
          userPkpPublicKey: pkpInfo.publicKey,
          tracks: [{ trackId, coverCid: coverRef }],
          timestamp: coverTimestamp,
          nonce: coverNonce,
        },
      })

      const coverResponse = JSON.parse(coverResult.response as string)
      if (!coverResponse?.success) {
        console.warn('[Publish] track-cover-v5 failed (non-fatal):', coverResponse?.error)
      }
    } catch (err) {
      console.warn('[Publish] track-cover-v5 failed (non-fatal):', err)
    }
  } else {
    console.warn('[Publish] TRACK_COVER_V5_CID not set — skipping cover ref write')
  }

  onProgress(95)

  // ── Step 10: Auto-translate lyrics (95-100%, best-effort) ─────────
  if (LYRICS_TRANSLATE_CID && lyricsText !== '(instrumental)') {
    const targetLangs = AUTO_TRANSLATE_LANGS.filter((l) => l !== formData.primaryLanguage)

    if (targetLangs.length > 0) {
      try {
        const ipIdAddress = storyResponse.ipId
        const translateTimestamp = Date.now()
        const translateNonce = Math.floor(Math.random() * 1_000_000).toString()
        const translateLyricsHash = await sha256HexString(lyricsText)
        const sortedLangs = [...targetLangs].sort().join(',')
        const translateMessage = `heaven:translate:${ipIdAddress}:${translateLyricsHash}:${sourceLanguageName}:${sortedLangs}:${translateTimestamp}:${translateNonce}`

        const translateSignature = await signMessageWithPKP(pkpInfo, authContext, translateMessage)

        await litClient.executeJs({
          ipfsId: LYRICS_TRANSLATE_CID,
          authContext,
          jsParams: {
            userPkpPublicKey: pkpInfo.publicKey,
            ipId: ipIdAddress,
            lyricsText,
            sourceLanguage: sourceLanguageName,
            targetLanguages: targetLangs,
            signature: translateSignature,
            timestamp: translateTimestamp,
            nonce: translateNonce,
            filebaseEncryptedKey: LYRICS_FILEBASE_ENCRYPTED_KEY,
            openrouterEncryptedKey: LYRICS_OPENROUTER_ENCRYPTED_KEY,
          },
        })
      } catch {
        // Auto-translate is best-effort — publish already succeeded
        console.warn('Auto-translate failed (best-effort, publish succeeded)')
      }
    }
  }

  onProgress(100)

  return {
    ipId: storyResponse.ipId,
    tokenId: storyResponse.tokenId,
    audioCid: publishResponse.audioCID,
    instrumentalCid: publishResponse.instrumentalCID,
    coverCid: coverRef,
    canvasCid: publishResponse.canvasCID || undefined,
    licenseTermsIds: storyResponse.licenseTermsIds || [],
  }
}
