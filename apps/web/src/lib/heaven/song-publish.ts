/**
 * Song Publish Service
 *
 * Orchestrates the full song publish pipeline:
 * 1. Convert form files to inline base64
 * 2. Build metadata JSONs
 * 3. SHA-256 hash all content + sign EIP-191 via PKP
 * 4. Call song-publish-v1 Lit Action (IPFS upload, lyrics alignment, translation)
 * 5. Sign EIP-712 typed data for Story registration via PKP
 * 6. Call story-register-sponsor-v1 Lit Action (mint NFT, register IP, attach license)
 * 7. Register on ContentRegistry (MegaETH) so subgraph indexes the song
 * 8. Auto-translate lyrics to Mandarin + English (best-effort, doesn't fail publish)
 */

import { getLitClient } from '../lit/client'
import { SONG_PUBLISH_CID, STORY_REGISTER_SPONSOR_CID, LYRICS_TRANSLATE_CID, CONTENT_REGISTER_MEGAETH_V1_CID } from '../lit/action-cids'
import { signMessageWithPKP } from '../lit/signer-pkp'
import type { PKPInfo, PKPAuthContext } from '../lit/types'
import type { SongFormData, LicenseType } from '@heaven/ui'
import { computeTrackId } from '../filecoin-upload-service'

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

// ── Encrypted keys (bound to song-publish-v1 action CID) ──────────

const FILEBASE_ENCRYPTED_KEY: EncryptedKey = {
  ciphertext: 'rZKsuJAFr0bAmB0sB8Y47wMafboSsI48rUIG2KVfhW689ZxFTh2WbdplO64b574FSWw+KvKOB0xKA3jqNWARbeXUVvsZiAYSj737msRXDSBllUdZ5VvOmypIl0YpAXxFv+ZrvBI6jBIiakm20Uvl7wbKm3ic2YJyEkfSurFsAwC+DXvMfWVbnBXc4mNuzsjPTMS9nriUz6/y4q2xMHiquFi3qu6PeWCzIcjXjNOL2TCk0GECaqsC',
  dataToEncryptHash: '23ab539bda3900163da16db23be0e6e6c6003d35bd1ac54aeaada176f8f1e0d4',
  accessControlConditions: [{
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':currentActionIpfsId'],
    returnValueTest: { comparator: '=', value: SONG_PUBLISH_CID },
  }],
}

const ELEVENLABS_ENCRYPTED_KEY: EncryptedKey = {
  ciphertext: 'kO4ArVoy+keulKjuvMzCoftMcDEAbze0RwCScxqZvk5rkJNBkV+UDu9a6ZT2aZ8al4mygNhhz1S0yjz2DMhKyu/a/kRrJwseyaRDGh6O7ec0P58orQ27bYCeEPNiZgQBsTOcjZlkcJP4SxKPaGzt/SY6P2nIQuz3lMgwhGQVtpnjT/ngzQI=',
  dataToEncryptHash: '6d1863a0dd36fcff73e8d00eaec3f038d143e4bea663b57f8b9810d786b73f6c',
  accessControlConditions: [{
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':currentActionIpfsId'],
    returnValueTest: { comparator: '=', value: SONG_PUBLISH_CID },
  }],
}

const OPENROUTER_ENCRYPTED_KEY: EncryptedKey = {
  ciphertext: 'hJRS8qOvZLdsQv9Xy8MYAnYE15GQlRqh4bBdJdHiWcDApX5Gk501qNOc2wXw8Q9oXVIDQz4ggZPyzMoQS91Ux/jQUTk4ZHZ2l5Mp2+llzwhK8xf6Ix0FD8ZJnusBTPu+u7aNdpyzGbTnuJ1qSJFYRT8DskjVSDm+IVtd436+miqkmmbFDuIa7yoynXsCZSxBr6uGunn2/Ne4y50C',
  dataToEncryptHash: '2ca783d51c4bfd1a8b80e1c8aee5e94d3f17c3089f8bca45e48d40b3435ae092',
  accessControlConditions: [{
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':currentActionIpfsId'],
    returnValueTest: { comparator: '=', value: SONG_PUBLISH_CID },
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

// ── Proxy upload via heaven-api backend ──────────────────────────────

const HEAVEN_API_URL = import.meta.env.VITE_HEAVEN_API_URL || 'http://localhost:8787'

/**
 * Upload files to Filebase via heaven-api proxy (avoids CORS issues).
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
  if (!SONG_PUBLISH_CID) throw new Error('SONG_PUBLISH_CID not set')
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

  // Pre-upload files to Filebase via presigned URLs from heaven-api
  // Lit nodes fetch via URL instead of receiving inline base64 (avoids 413)
  const uploadFiles: Array<{ slot: string; data: Uint8Array; contentType: string }> = [
    { slot: 'audio', data: audioBytes, contentType: formData.audioFile.type },
    { slot: 'vocals', data: vocalsBytes, contentType: formData.vocalsFile.type },
    { slot: 'instrumental', data: instrumentalBytes, contentType: formData.instrumentalFile.type },
    { slot: 'cover', data: coverBytes, contentType: formData.coverFile.type },
  ]
  if (canvasBytes && formData.canvasFile) {
    uploadFiles.push({ slot: 'canvas', data: canvasBytes, contentType: formData.canvasFile.type })
  }

  const cidMap = await proxyUpload(uploadFiles)

  const audioUrl = `${IPFS_GATEWAY}${cidMap.get('audio')}`
  const vocalsUrl = `${IPFS_GATEWAY}${cidMap.get('vocals')}`
  const instrumentalUrl = `${IPFS_GATEWAY}${cidMap.get('instrumental')}`
  const coverUrl = `${IPFS_GATEWAY}${cidMap.get('cover')}`
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

  // ── Step 5: Call song-publish-v1 Lit Action (30-65%) ─────────────
  const litClient = await getLitClient()

  const publishResult = await litClient.executeJs({
    ipfsId: SONG_PUBLISH_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpInfo.publicKey,
      audioUrl,
      coverUrl,
      vocalsUrl,
      instrumentalUrl,
      canvasUrl: canvasUrl || undefined,
      songMetadataJson: songMetadata,
      ipaMetadataJson: ipaMetadata,
      nftMetadataJson: nftMetadata,
      signature,
      timestamp,
      nonce,
      lyricsText,
      sourceLanguage: sourceLanguageName,
      targetLanguage,
      filebaseEncryptedKey: FILEBASE_ENCRYPTED_KEY,
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
  const storyResult = await litClient.executeJs({
    ipfsId: STORY_REGISTER_SPONSOR_CID,
    authContext,
    jsParams: {
      recipient: userAddress,
      ipMetadataURI,
      ipMetadataHash,
      nftMetadataURI,
      nftMetadataHash: nftMetadataHashHex,
      commercialRevShare: revShare,
      defaultMintingFee: formData.mintingFee || '0',
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

  // ── Step 8: Register on ContentRegistry (MegaETH) for subgraph ────
  // Uses MegaETH-only Lit Action (skips Base mirror which isn't needed for published songs).
  // This creates a ContentRegistered event that the dotheaven-activity subgraph
  // indexes, making the song appear in the library across devices.
  if (CONTENT_REGISTER_MEGAETH_V1_CID) {
    try {
      const trackId = computeTrackId({
        title: formData.title,
        artist: formData.artist,
        album: '',
      })
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

  onProgress(95)

  // ── Step 9: Auto-translate lyrics (95-100%, best-effort) ──────────
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
    coverCid: publishResponse.coverCID,
    canvasCid: publishResponse.canvasCID || undefined,
    licenseTermsIds: storyResponse.licenseTermsIds || [],
  }
}
