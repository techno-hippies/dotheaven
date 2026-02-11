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
 * 7. Auto-translate lyrics to Mandarin + English (best-effort, doesn't fail publish)
 */

import { getLitClient } from '../lit/client'
import { SONG_PUBLISH_CID, STORY_REGISTER_SPONSOR_CID, LYRICS_TRANSLATE_CID } from '../lit/action-cids'
import { signMessageWithPKP } from '../lit/signer-pkp'
import type { PKPInfo, PKPAuthContext } from '../lit/types'
import type { SongFormData, LicenseType } from '@heaven/ui'

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

async function fileToBase64(file: File): Promise<{ base64: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(',')[1]
      resolve({ base64, contentType: file.type })
    }
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
    reader.readAsDataURL(file)
  })
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data as ArrayBufferView<ArrayBuffer>)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256HexString(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text))
}

function base64ToBytes(base64: string): Uint8Array {
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
  return bytes
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

  // ── Step 1: Convert files to base64 (0-10%) ──────────────────────
  onProgress(2)

  if (!formData.audioFile) throw new Error('Audio file is required')
  if (!formData.instrumentalFile) throw new Error('Instrumental file is required')
  if (!formData.coverFile) throw new Error('Cover image is required')

  const [audioInline, instrumentalInline, coverInline] = await Promise.all([
    fileToBase64(formData.audioFile),
    fileToBase64(formData.instrumentalFile),
    fileToBase64(formData.coverFile),
  ])
  const canvasInline = formData.canvasFile ? await fileToBase64(formData.canvasFile) : null

  onProgress(10)

  // ── Step 2: Build metadata JSONs (10-15%) ────────────────────────
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

  // ── Step 3: Hash all content (15-20%) ────────────────────────────
  const audioBytes = base64ToBytes(audioInline.base64)
  const instrumentalBytes = base64ToBytes(instrumentalInline.base64)
  const coverBytes = base64ToBytes(coverInline.base64)
  const canvasBytes = canvasInline ? base64ToBytes(canvasInline.base64) : null

  const [audioHash, coverHash, instrumentalHash, songMetadataHash, ipaMetadataHash, nftMetadataHash, lyricsHash] =
    await Promise.all([
      sha256Hex(audioBytes),
      sha256Hex(coverBytes),
      sha256Hex(instrumentalBytes),
      sha256HexString(songMetadata),
      sha256HexString(ipaMetadata),
      sha256HexString(nftMetadata),
      sha256HexString(formData.lyrics || '(instrumental)'),
    ])
  const canvasHash = canvasBytes ? await sha256Hex(canvasBytes) : ''

  onProgress(20)

  // ── Step 4: Sign EIP-191 binding message (20-25%) ────────────────
  const timestamp = Date.now()
  const nonce = Math.floor(Math.random() * 1_000_000).toString()
  const lyricsText = formData.lyrics || '(instrumental)'

  const message = `heaven:publish:${audioHash}:${coverHash}:${instrumentalHash}:${canvasHash || ''}:${songMetadataHash}:${ipaMetadataHash}:${nftMetadataHash}:${lyricsHash}:${sourceLanguageName}:${targetLanguage}:${timestamp}:${nonce}`

  const signature = await signMessageWithPKP(pkpInfo, authContext, message)

  onProgress(25)

  // ── Step 5: Call song-publish-v1 Lit Action (25-65%) ─────────────
  const litClient = await getLitClient()

  const publishResult = await litClient.executeJs({
    ipfsId: SONG_PUBLISH_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpInfo.publicKey,
      audioUrl: audioInline,
      coverUrl: coverInline,
      instrumentalUrl: instrumentalInline,
      canvasUrl: canvasInline || undefined,
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

  // ── Step 7: Call story-register-sponsor-v1 Lit Action (70-95%) ───
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

  onProgress(95)

  // ── Step 8: Auto-translate lyrics (95-100%, best-effort) ──────────
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
