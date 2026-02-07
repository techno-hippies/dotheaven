/**
 * EAS (Ethereum Attestation Service) helpers for Base Sepolia
 *
 * Uses the OP Stack predeploy at 0x4200...0021
 * Schema registry at 0x4200...0020
 */

// EAS contract addresses (Base OP Stack predeploys)
export const EAS_ADDRESS = '0x4200000000000000000000000000000000000021'
export const SCHEMA_REGISTRY_ADDRESS = '0x4200000000000000000000000000000000000020'

// Registered schema UIDs on Base Sepolia
export const SCROBBLE_BATCH_SCHEMA = '0x6a31b6c6ed2c423297bd53d6df387d04cf69cecb961eb57f1dfc44ba374d95f0'
export const SLEEP_SESSION_SCHEMA = '0x0fb05f4f748efc6ab605aeb39a20b2e92d9bdde1d13ec70d5c99ace1787c8c00'
// MealPhotoV1: (uint64 capturedTs, uint8 source, string photoCid)
export const MEAL_PHOTO_SCHEMA = '0xa822ab73a555b3cbd3fedd18341d0a75c7daaf37497925dafdfcfb2d2d118ed1'
// MealCaloriesV1: (uint16 calories, uint16 proteinG, uint16 carbsG, uint16 fatG, uint16 confidenceBps, string analysisCid)
export const MEAL_CALORIES_SCHEMA = '0x53442947003d37cdabc5a0fb125e190506e8c3c939de5a5d1ae0115201def54b'

// EAS ABI (minimal, just what we need for attest)
const EAS_ABI = [
  {
    name: 'attest',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [
          { name: 'schema', type: 'bytes32' },
          {
            name: 'data',
            type: 'tuple',
            components: [
              { name: 'recipient', type: 'address' },
              { name: 'expirationTime', type: 'uint64' },
              { name: 'revocable', type: 'bool' },
              { name: 'refUID', type: 'bytes32' },
              { name: 'data', type: 'bytes' },
              { name: 'value', type: 'uint256' },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
]

/**
 * ABI encode a value based on its Solidity type
 */
function encodeValue(type: string, value: unknown): string {
  if (type === 'uint64' || type === 'uint32' || type === 'uint16' || type === 'uint8') {
    // Pad to 32 bytes (64 hex chars)
    const num = BigInt(value as number | string)
    return num.toString(16).padStart(64, '0')
  }

  if (type === 'string') {
    const str = value as string
    const encoder = new TextEncoder()
    const bytes = encoder.encode(str)

    // String encoding: offset (32 bytes) + length (32 bytes) + data (padded to 32)
    // We'll handle this specially in encodeData
    return str
  }

  if (type === 'bytes32') {
    const hex = (value as string).replace('0x', '')
    return hex.padStart(64, '0')
  }

  if (type === 'address') {
    const hex = (value as string).replace('0x', '').toLowerCase()
    return hex.padStart(64, '0')
  }

  if (type === 'bool') {
    return (value ? '1' : '0').padStart(64, '0')
  }

  throw new Error(`Unsupported type: ${type}`)
}

/**
 * ABI encode schema data
 * Schema: (uint64 startTs, uint64 endTs, uint32 count, string cid)
 */
export function encodeScrobbleBatchData(
  startTs: number,
  endTs: number,
  count: number,
  cid: string
): string {
  // For tuples with dynamic types (string), we need:
  // 1. Head section: fixed-size values + offsets for dynamic values
  // 2. Tail section: dynamic values

  const encoder = new TextEncoder()
  const cidBytes = encoder.encode(cid)

  // Head section (4 slots of 32 bytes each):
  // - uint64 startTs (padded to 32 bytes)
  // - uint64 endTs (padded to 32 bytes)
  // - uint32 count (padded to 32 bytes)
  // - offset to string data (4 * 32 = 128 = 0x80)

  const head = [
    BigInt(startTs).toString(16).padStart(64, '0'),
    BigInt(endTs).toString(16).padStart(64, '0'),
    BigInt(count).toString(16).padStart(64, '0'),
    BigInt(128).toString(16).padStart(64, '0'), // offset to string
  ]

  // Tail section (string):
  // - length (32 bytes)
  // - data (padded to 32 byte boundary)
  const strLen = BigInt(cidBytes.length).toString(16).padStart(64, '0')
  let strData = ''
  for (const b of cidBytes) {
    strData += b.toString(16).padStart(2, '0')
  }
  // Pad to 32-byte boundary
  const padLen = Math.ceil(cidBytes.length / 32) * 32 - cidBytes.length
  strData += '0'.repeat(padLen * 2)

  return '0x' + head.join('') + strLen + strData
}

/**
 * Encode the full attest() calldata
 */
export function encodeAttestCalldata(
  schema: string,
  recipient: string,
  expirationTime: bigint,
  revocable: boolean,
  refUID: string,
  data: string,
  value: bigint
): string {
  // Function selector: attest((bytes32,(address,uint64,bool,bytes32,bytes,uint256)))
  // keccak256("attest((bytes32,(address,uint64,bool,bytes32,bytes,uint256)))") = 0xf17325e7
  const selector = 'f17325e7'

  // The outer tuple is: (schema, data)
  // schema is bytes32 (fixed)
  // data is a tuple (fixed size elements + dynamic bytes)

  // For nested tuple with dynamic bytes, encoding is complex:
  // Outer tuple head:
  //   - schema (32 bytes)
  //   - offset to inner tuple (32 bytes) = 64

  // Inner tuple head (at offset 64):
  //   - recipient (32 bytes)
  //   - expirationTime (32 bytes)
  //   - revocable (32 bytes)
  //   - refUID (32 bytes)
  //   - offset to bytes (32 bytes) = 192 (6 * 32, from start of inner tuple)
  //   - value (32 bytes)

  // Inner tuple tail (at inner offset 192):
  //   - bytes length (32 bytes)
  //   - bytes data (padded)

  const schemaHex = schema.replace('0x', '').padStart(64, '0')
  const recipientHex = recipient.replace('0x', '').toLowerCase().padStart(64, '0')
  const expirationHex = expirationTime.toString(16).padStart(64, '0')
  const revocableHex = (revocable ? '1' : '0').padStart(64, '0')
  const refUIDHex = refUID.replace('0x', '').padStart(64, '0')
  const valueHex = value.toString(16).padStart(64, '0')

  // data bytes
  const dataHex = data.replace('0x', '')
  const dataLen = dataHex.length / 2
  const dataLenHex = BigInt(dataLen).toString(16).padStart(64, '0')
  const dataPadLen = Math.ceil(dataLen / 32) * 32 - dataLen
  const dataPadded = dataHex + '0'.repeat(dataPadLen * 2)

  // Outer tuple: schema + offset to inner tuple (0x40 = 64)
  const outerOffset = BigInt(64).toString(16).padStart(64, '0')

  // Inner tuple: 6 fixed elements + dynamic bytes
  // Offset to bytes is at position 4 (0-indexed), pointing to after all 6 fixed elements
  // Inner offset = 6 * 32 = 192 = 0xc0
  const innerBytesOffset = BigInt(192).toString(16).padStart(64, '0')

  const calldata =
    selector +
    schemaHex +
    outerOffset +
    recipientHex +
    expirationHex +
    revocableHex +
    refUIDHex +
    innerBytesOffset +
    valueHex +
    dataLenHex +
    dataPadded

  return '0x' + calldata
}

/**
 * Create and sign an EAS attestation transaction
 * Returns the signed transaction hex ready for eth_sendRawTransaction
 */
export async function createScrobbleAttestation(
  relayPk: string,
  rpcUrl: string,
  recipient: string,
  startTs: number,
  endTs: number,
  count: number,
  cid: string
): Promise<{ txHash: string; uid: string }> {
  // Import ethers dynamically since it's a heavy library
  // Workers should have it available via nodejs_compat
  const { ethers } = await import('ethers')

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const signer = new ethers.Wallet(relayPk, provider)

  // Encode the attestation data
  const encodedData = encodeScrobbleBatchData(startTs, endTs, count, cid)

  // Build the attestation request
  const attestationRequest = {
    schema: SCROBBLE_BATCH_SCHEMA,
    data: {
      recipient,
      expirationTime: 0n, // No expiration
      revocable: true,
      refUID: ethers.ZeroHash,
      data: encodedData,
      value: 0n,
    },
  }

  // Create contract instance
  const eas = new ethers.Contract(EAS_ADDRESS, EAS_ABI, signer)

  // Send the transaction
  const tx = await eas.attest(attestationRequest)
  console.log(`[EAS] Attestation tx sent: ${tx.hash}`)

  // Wait for confirmation
  const receipt = await tx.wait()
  console.log(`[EAS] Attestation confirmed in block ${receipt.blockNumber}`)

  // Extract UID from logs
  // Attested event: event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)
  // The UID is in the first topic of the Attested event log
  let uid = ethers.ZeroHash
  for (const log of receipt.logs) {
    // Attested event topic: keccak256("Attested(address,address,bytes32,bytes32)")
    if (log.topics[0] === '0x8bf46bf4cfd674fa735a3d63ec1c9ad4153f033c290341f3a588b75685141b35') {
      // UID is the 3rd topic (non-indexed bytes32)
      // Actually looking at EAS events: Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)
      // recipient = topics[1], attester = topics[2], schemaUID = topics[3], uid = data
      uid = log.data.slice(0, 66) // First 32 bytes of data
      break
    }
  }

  return {
    txHash: tx.hash,
    uid,
  }
}

/**
 * ABI encode meal photo data
 * Schema: (uint64 capturedAt, uint32 calories, uint16 protein_g, uint16 carbs_g, uint16 fat_g, string photoCid)
 */
/**
 * Encode MealPhotoV1: (uint64 capturedTs, uint8 source, string photoCid)
 */
export function encodeMealPhotoData(
  capturedTs: number,
  source: number,
  photoCid: string
): string {
  const encoder = new TextEncoder()
  const cidBytes = encoder.encode(photoCid)

  // Head section (3 slots of 32 bytes each):
  // - uint64 capturedTs (padded to 32 bytes)
  // - uint8 source (padded to 32 bytes)
  // - offset to string data (3 * 32 = 96 = 0x60)
  const head = [
    BigInt(capturedTs).toString(16).padStart(64, '0'),
    BigInt(source).toString(16).padStart(64, '0'),
    BigInt(96).toString(16).padStart(64, '0'), // offset to string
  ]

  // Tail section (string):
  // - length (32 bytes)
  // - data (padded to 32 byte boundary)
  const strLen = BigInt(cidBytes.length).toString(16).padStart(64, '0')
  let strData = ''
  for (const b of cidBytes) {
    strData += b.toString(16).padStart(2, '0')
  }
  const padLen = Math.ceil(cidBytes.length / 32) * 32 - cidBytes.length
  strData += '0'.repeat(padLen * 2)

  return '0x' + head.join('') + strLen + strData
}

/**
 * Encode MealCaloriesV1: (uint16 calories, uint16 proteinG, uint16 carbsG, uint16 fatG, uint16 confidenceBps, string analysisCid)
 */
export function encodeMealCaloriesData(
  calories: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
  confidenceBps: number,
  analysisCid: string
): string {
  const encoder = new TextEncoder()
  const cidBytes = encoder.encode(analysisCid)

  // Head section (6 slots of 32 bytes each):
  const head = [
    BigInt(calories).toString(16).padStart(64, '0'),
    BigInt(proteinG).toString(16).padStart(64, '0'),
    BigInt(carbsG).toString(16).padStart(64, '0'),
    BigInt(fatG).toString(16).padStart(64, '0'),
    BigInt(confidenceBps).toString(16).padStart(64, '0'),
    BigInt(192).toString(16).padStart(64, '0'), // offset to string (6*32=192)
  ]

  const strLen = BigInt(cidBytes.length).toString(16).padStart(64, '0')
  let strData = ''
  for (const b of cidBytes) {
    strData += b.toString(16).padStart(2, '0')
  }
  const padLen = Math.ceil(cidBytes.length / 32) * 32 - cidBytes.length
  strData += '0'.repeat(padLen * 2)

  return '0x' + head.join('') + strLen + strData
}

/**
 * Create and sign an EAS attestation for a meal photo (MealPhotoV1)
 * Returns the base attestation UID for use as refUID in the extension.
 */
export async function createMealAttestation(
  relayPk: string,
  rpcUrl: string,
  recipient: string,
  capturedTs: number,
  source: number,
  photoCid: string
): Promise<{ txHash: string; uid: string }> {
  const { ethers } = await import('ethers')

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const signer = new ethers.Wallet(relayPk, provider)

  const encodedData = encodeMealPhotoData(capturedTs, source, photoCid)

  const attestationRequest = {
    schema: MEAL_PHOTO_SCHEMA,
    data: {
      recipient,
      expirationTime: 0n,
      revocable: true,
      refUID: ethers.ZeroHash,
      data: encodedData,
      value: 0n,
    },
  }

  // Create contract instance
  const eas = new ethers.Contract(EAS_ADDRESS, EAS_ABI, signer)

  // Send the transaction
  const tx = await eas.attest(attestationRequest)
  console.log(`[EAS] Meal attestation tx sent: ${tx.hash}`)

  // Wait for confirmation
  const receipt = await tx.wait()
  console.log(`[EAS] Meal attestation confirmed in block ${receipt.blockNumber}`)

  // Extract UID from logs
  let uid = ethers.ZeroHash
  for (const log of receipt.logs) {
    if (log.topics[0] === '0x8bf46bf4cfd674fa735a3d63ec1c9ad4153f033c290341f3a588b75685141b35') {
      uid = log.data.slice(0, 66)
      break
    }
  }

  return {
    txHash: tx.hash,
    uid,
  }
}

/**
 * Create MealCaloriesV1 extension attestation (references base MealPhotoV1 via refUID)
 */
export async function createMealCaloriesAttestation(
  relayPk: string,
  rpcUrl: string,
  recipient: string,
  refUID: string,
  calories: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
  confidenceBps: number,
  analysisCid: string
): Promise<{ txHash: string; uid: string }> {
  const { ethers } = await import('ethers')

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const signer = new ethers.Wallet(relayPk, provider)

  const encodedData = encodeMealCaloriesData(calories, proteinG, carbsG, fatG, confidenceBps, analysisCid)

  const attestationRequest = {
    schema: MEAL_CALORIES_SCHEMA,
    data: {
      recipient,
      expirationTime: 0n,
      revocable: false, // Schema registered as non-revocable
      refUID,
      data: encodedData,
      value: 0n,
    },
  }

  const eas = new ethers.Contract(EAS_ADDRESS, EAS_ABI, signer)
  const tx = await eas.attest(attestationRequest)
  console.log(`[EAS] MealCalories extension tx sent: ${tx.hash}`)

  const receipt = await tx.wait()
  console.log(`[EAS] MealCalories confirmed in block ${receipt.blockNumber}`)

  let uid = ethers.ZeroHash
  for (const log of receipt.logs) {
    if (log.topics[0] === '0x8bf46bf4cfd674fa735a3d63ec1c9ad4153f033c290341f3a588b75685141b35') {
      uid = log.data.slice(0, 66)
      break
    }
  }

  return { txHash: tx.hash, uid }
}

/**
 * ABI encode sleep session data
 * Schema: (uint64 bedTs, uint64 wakeTs, uint8 source, string cid)
 */
export function encodeSleepSessionData(
  bedTs: number,
  wakeTs: number,
  source: number,
  cid: string
): string {
  const encoder = new TextEncoder()
  const cidBytes = encoder.encode(cid)

  // Head section (4 slots of 32 bytes each):
  // - uint64 bedTs (padded to 32 bytes)
  // - uint64 wakeTs (padded to 32 bytes)
  // - uint8 source (padded to 32 bytes)
  // - offset to string data (4 * 32 = 128 = 0x80)

  const head = [
    BigInt(bedTs).toString(16).padStart(64, '0'),
    BigInt(wakeTs).toString(16).padStart(64, '0'),
    BigInt(source).toString(16).padStart(64, '0'),
    BigInt(128).toString(16).padStart(64, '0'), // offset to string
  ]

  // Tail section (string):
  // - length (32 bytes)
  // - data (padded to 32 byte boundary)
  const strLen = BigInt(cidBytes.length).toString(16).padStart(64, '0')
  let strData = ''
  for (const b of cidBytes) {
    strData += b.toString(16).padStart(2, '0')
  }
  // Pad to 32-byte boundary
  const padLen = Math.ceil(cidBytes.length / 32) * 32 - cidBytes.length
  strData += '0'.repeat(padLen * 2)

  return '0x' + head.join('') + strLen + strData
}

/**
 * Create and sign an EAS attestation for a sleep session
 */
export async function createSleepAttestation(
  relayPk: string,
  rpcUrl: string,
  recipient: string,
  bedTs: number,
  wakeTs: number,
  source: number,
  cid: string
): Promise<{ txHash: string; uid: string }> {
  const { ethers } = await import('ethers')

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const signer = new ethers.Wallet(relayPk, provider)

  // Encode the attestation data
  const encodedData = encodeSleepSessionData(bedTs, wakeTs, source, cid)

  // Build the attestation request
  const attestationRequest = {
    schema: SLEEP_SESSION_SCHEMA,
    data: {
      recipient,
      expirationTime: 0n, // No expiration
      revocable: true,
      refUID: ethers.ZeroHash,
      data: encodedData,
      value: 0n,
    },
  }

  // Create contract instance
  const eas = new ethers.Contract(EAS_ADDRESS, EAS_ABI, signer)

  // Send the transaction
  const tx = await eas.attest(attestationRequest)
  console.log(`[EAS] Sleep attestation tx sent: ${tx.hash}`)

  // Wait for confirmation
  const receipt = await tx.wait()
  console.log(`[EAS] Sleep attestation confirmed in block ${receipt.blockNumber}`)

  // Extract UID from logs
  let uid = ethers.ZeroHash
  for (const log of receipt.logs) {
    if (log.topics[0] === '0x8bf46bf4cfd674fa735a3d63ec1c9ad4153f033c290341f3a588b75685141b35') {
      uid = log.data.slice(0, 66)
      break
    }
  }

  return {
    txHash: tx.hash,
    uid,
  }
}
