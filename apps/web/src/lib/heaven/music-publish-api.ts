export type MusicPublishType = 'original' | 'derivative' | 'cover'

export interface MusicRegisterDerivativeSelection {
  publishType?: MusicPublishType
  parentIpIds?: string[]
  licenseTermsIds?: Array<string | number>
  licenseTemplate?: string
  royaltyContext?: string
  maxMintingFee?: string | number
  maxRts?: number
  maxRevenueShare?: number
  allowDuplicates?: boolean
}

export interface BuildMusicRegisterBodyInput {
  recipient: string
  ipMetadataURI: string
  ipMetadataHash: string
  nftMetadataURI: string
  nftMetadataHash: string
  commercialRevShare: number
  defaultMintingFee: string | number
  selection?: MusicRegisterDerivativeSelection
}

export interface MusicRegisterRequestBody {
  recipient: string
  ipMetadataURI: string
  ipMetadataHash: string
  nftMetadataURI: string
  nftMetadataHash: string
  commercialRevShare: number
  defaultMintingFee: string
  allowDuplicates?: boolean
  parentIpIds?: string[]
  licenseTermsIds?: string[]
  licenseTemplate?: string
  royaltyContext?: string
  maxMintingFee?: string
  maxRts?: number
  maxRevenueShare?: number
}

function normalizePublishType(input?: MusicPublishType): MusicPublishType {
  if (input === 'derivative' || input === 'cover') return input
  return 'original'
}

export function buildMusicRegisterBody(input: BuildMusicRegisterBodyInput): MusicRegisterRequestBody {
  const selection = input.selection
  const publishType = normalizePublishType(selection?.publishType)
  const body: MusicRegisterRequestBody = {
    recipient: input.recipient,
    ipMetadataURI: input.ipMetadataURI,
    ipMetadataHash: input.ipMetadataHash,
    nftMetadataURI: input.nftMetadataURI,
    nftMetadataHash: input.nftMetadataHash,
    commercialRevShare: input.commercialRevShare,
    defaultMintingFee: String(input.defaultMintingFee),
    allowDuplicates: selection?.allowDuplicates,
  }

  if (publishType === 'derivative' || publishType === 'cover') {
    if (selection?.parentIpIds?.length) {
      body.parentIpIds = selection.parentIpIds
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    }

    if (selection?.licenseTermsIds?.length) {
      body.licenseTermsIds = selection.licenseTermsIds
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0)
    }

    if (selection?.licenseTemplate) body.licenseTemplate = selection.licenseTemplate
    if (selection?.royaltyContext) body.royaltyContext = selection.royaltyContext
    if (selection?.maxMintingFee !== undefined) body.maxMintingFee = String(selection.maxMintingFee)
    if (selection?.maxRts !== undefined) body.maxRts = selection.maxRts
    if (selection?.maxRevenueShare !== undefined) body.maxRevenueShare = selection.maxRevenueShare
  }

  return body
}
