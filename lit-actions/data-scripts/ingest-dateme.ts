#!/usr/bin/env bun
/**
 * Ingest profiles from dateme.db → Heaven on-chain.
 *
 * Pipeline per profile:
 * 1. Read from dateme.db (name, age, gender, location, bio, first photo path)
 * 2. Convert photo → anime via fal.ai FLUX.2 edit endpoint
 * 3. Upload anime image to Filebase S3 → get IPFS CID
 * 4. Write on-chain (3 txs): register .heaven name, set ProfileV2, set RecordsV1
 *
 * Usage:
 *   bun tests/ingest-dateme.ts                    # Run full pipeline
 *   bun tests/ingest-dateme.ts --dry-run          # Show what would happen
 *   bun tests/ingest-dateme.ts --start=10         # Start from index 10
 *   bun tests/ingest-dateme.ts --limit=5          # Only process 5 profiles
 *   bun tests/ingest-dateme.ts --skip-fal         # Skip fal.ai, use placewaifu
 *   bun tests/ingest-dateme.ts --skip-chain       # Skip on-chain writes
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  toBytes,
  encodePacked,
  encodeAbiParameters,
  parseAbiParameters,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Wallet } from "ethers";
import { Database } from "bun:sqlite";
import { readFileSync, existsSync } from "fs";
import dotenv from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

// ── Chain Config ─────────────────────────────────────────────────────

const MEGAETH_RPC = "https://carrot.megaeth.com/rpc";
const CHAIN_ID = 6343;

const megaeth = {
  id: CHAIN_ID,
  name: "MegaETH Testnet",
  nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" },
  rpcUrls: { default: { http: [MEGAETH_RPC] } },
} as const;

// ── Contracts ────────────────────────────────────────────────────────

const PROFILE_V2 = "0xe00e82086480E61AaC8d5ad8B05B56A582dD0000" as const;
const RECORDS_V1 = "0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3" as const;
const REGISTRY_V1 = "0x22B618DaBB5aCdC214eeaA1c4C5e2eF6eb4488C2" as const;
const HEAVEN_NODE =
  "0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27" as const;

const registryAbi = parseAbi([
  "function available(bytes32 parentNode, string calldata label) external view returns (bool)",
  "function registerFor(bytes32 parentNode, string calldata label, address to, uint256 duration) external payable returns (uint256 tokenId)",
]);

const profileAbi = parseAbi([
  "function nonces(address user) external view returns (uint256)",
  "function upsertProfileFor(address user, (uint8 profileVersion, string displayName, bytes32 nameHash, uint8 age, uint16 heightCm, bytes2 nationality, uint256 languagesPacked, uint8 friendsOpenToMask, bytes32 locationCityId, int32 locationLatE6, int32 locationLngE6, bytes32 schoolId, bytes32 skillsCommit, bytes32 hobbiesCommit, string photoURI, uint8 gender, uint8 relocate, uint8 degree, uint8 fieldBucket, uint8 profession, uint8 industry, uint8 relationshipStatus, uint8 sexuality, uint8 ethnicity, uint8 datingStyle, uint8 children, uint8 wantsChildren, uint8 drinking, uint8 smoking, uint8 drugs, uint8 lookingFor, uint8 religion, uint8 pets, uint8 diet) calldata in_, bytes calldata signature) external",
]);

const recordsAbi = parseAbi([
  "function nonces(bytes32 node) external view returns (uint256)",
  "function setRecordsFor(bytes32 node, string[] calldata keys, string[] calldata values, bytes calldata signature) external",
]);

// ── Language Packing ─────────────────────────────────────────────────

function langCodeToUint16(code: string): number {
  const upper = code.toUpperCase();
  return (upper.charCodeAt(0) << 8) | upper.charCodeAt(1);
}

function packLanguages(
  entries: { code: string; proficiency: number }[]
): bigint {
  let packed = 0n;
  const slots = entries.slice(0, 8);
  for (let i = 0; i < slots.length; i++) {
    const { code, proficiency } = slots[i];
    const langVal = langCodeToUint16(code);
    const slotVal = BigInt(
      ((langVal & 0xffff) << 16) | ((proficiency & 0xff) << 8)
    );
    const shift = BigInt((7 - i) * 32);
    packed |= slotVal << shift;
  }
  return packed;
}

// ── Tag Packing ──────────────────────────────────────────────────────

function packTagIds(ids: number[]): Hex {
  const unique = [...new Set(ids)]
    .filter((id) => id > 0 && id <= 0xffff)
    .sort((a, b) => a - b)
    .slice(0, 16);
  while (unique.length < 16) unique.push(0);
  let hex = "0x";
  for (const id of unique) {
    hex += id.toString(16).padStart(4, "0");
  }
  return hex as Hex;
}

// ── Nationality ──────────────────────────────────────────────────────

function nationalityToBytes2(code: string): Hex {
  if (!code || code.length !== 2) return "0x0000";
  const upper = code.toUpperCase();
  const hex =
    upper.charCodeAt(0).toString(16).padStart(2, "0") +
    upper.charCodeAt(1).toString(16).padStart(2, "0");
  return `0x${hex}` as Hex;
}

// ── Node computation ─────────────────────────────────────────────────

function computeNode(label: string): Hex {
  const labelHash = keccak256(toBytes(label));
  return keccak256(
    encodePacked(["bytes32", "bytes32"], [HEAVEN_NODE, labelHash])
  );
}

// ── Profile hash (must match Solidity's keccak256(abi.encode(in_))) ──

const PROFILE_INPUT_TUPLE = parseAbiParameters(
  "(uint8, string, bytes32, uint8, uint16, bytes2, uint256, uint8, bytes32, int32, int32, bytes32, bytes32, bytes32, string, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8)"
);

function profileHash(tuple: ReturnType<typeof buildProfileTuple>): Hex {
  const encoded = encodeAbiParameters(PROFILE_INPUT_TUPLE, [
    [
      tuple.profileVersion,
      tuple.displayName,
      tuple.nameHash,
      tuple.age,
      tuple.heightCm,
      tuple.nationality,
      tuple.languagesPacked,
      tuple.friendsOpenToMask,
      tuple.locationCityId,
      tuple.locationLatE6,
      tuple.locationLngE6,
      tuple.schoolId,
      tuple.skillsCommit,
      tuple.hobbiesCommit,
      tuple.photoURI,
      tuple.gender,
      tuple.relocate,
      tuple.degree,
      tuple.fieldBucket,
      tuple.profession,
      tuple.industry,
      tuple.relationshipStatus,
      tuple.sexuality,
      tuple.ethnicity,
      tuple.datingStyle,
      tuple.children,
      tuple.wantsChildren,
      tuple.drinking,
      tuple.smoking,
      tuple.drugs,
      tuple.lookingFor,
      tuple.religion,
      tuple.pets,
      tuple.diet,
    ],
  ]);
  return keccak256(encoded);
}

// ── Records batch hash ───────────────────────────────────────────────

function recordsBatchHash(keys: string[], values: string[]): Hex {
  const encoded = encodeAbiParameters(
    parseAbiParameters("string[], string[]"),
    [keys, values]
  );
  return keccak256(encoded);
}

// ── Data Mapping ─────────────────────────────────────────────────────

/** Map dateme gender codes to Heaven enum values */
function mapGender(g: string): number {
  switch (g.toUpperCase()) {
    case "F":
      return 1;
    case "M":
      return 2;
    case "NB":
    case "FNB":
    case "MNB":
    case "NBM":
    case "FMNB":
      return 5;
    default:
      return 0;
  }
}

/** Parse age string to clamped uint8 */
function parseAge(ageStr: string): number {
  const n = parseInt(ageStr, 10);
  if (isNaN(n)) return 0;
  return Math.max(18, Math.min(99, n));
}

/** Strip quotes from location string and get the first city */
function parseLocation(loc: string): string {
  // Strip surrounding quotes
  let clean = loc.replace(/^["']|["']$/g, "").trim();
  // Some locations are arrays like "[]" — skip those
  if (clean === "[]" || clean === "" || clean === "Flexible") return "";
  return clean;
}

/** Make a valid .heaven label from name + profileId */
function makeLabel(name: string, profileId: number): string {
  // Take first name, lowercase, strip non-alphanumeric
  const firstName = name.split(/[\s,]+/)[0].toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (firstName.length >= 2) {
    return `${firstName}-${profileId}`;
  }
  return `dateme-${profileId}`;
}

/** Get display name: first 2 words, max 30 chars */
function makeDisplayName(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 2).join(" ");
  return words.slice(0, 30);
}

/** Clean bio text for on-chain storage */
function cleanBio(bio: string | null): string {
  if (!bio) return "";
  // Remove "Hi, I'm X" prefix if present, clean whitespace
  let clean = bio
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Truncate to ~500 chars at word boundary
  if (clean.length > 500) {
    clean = clean.slice(0, 500);
    const lastSpace = clean.lastIndexOf(" ");
    if (lastSpace > 400) clean = clean.slice(0, lastSpace);
    clean += "...";
  }
  return clean;
}

// ── Location → Nationality inference ─────────────────────────────────

const CITY_TO_COUNTRY: Record<string, string> = {
  // US cities
  "San Francisco Bay Area": "US",
  "San Francisco": "US",
  NYC: "US",
  "New York": "US",
  "New York City": "US",
  Boston: "US",
  Chicago: "US",
  "Los Angeles": "US",
  LA: "US",
  Seattle: "US",
  Austin: "US",
  DC: "US",
  "Washington DC": "US",
  Portland: "US",
  Denver: "US",
  Philadelphia: "US",
  Colorado: "US",
  "Western US": "US",
  "North America": "US",
  Miami: "US",
  Atlanta: "US",
  Minneapolis: "US",
  "Bay Area": "US",
  "San Diego": "US",
  Pittsburgh: "US",
  Phoenix: "US",
  Houston: "US",
  Nashville: "US",
  "Salt Lake City": "US",
  // UK
  London: "GB",
  "London, UK": "GB",
  UK: "GB",
  Edinburgh: "GB",
  Manchester: "GB",
  Cambridge: "GB",
  Oxford: "GB",
  Bristol: "GB",
  // Europe
  Berlin: "DE",
  Munich: "DE",
  Hamburg: "DE",
  "Central Europe": "DE",
  Paris: "FR",
  Amsterdam: "NL",
  Barcelona: "ES",
  Madrid: "ES",
  Stockholm: "SE",
  Copenhagen: "DK",
  Dublin: "IE",
  Zurich: "CH",
  Vienna: "AT",
  Prague: "CZ",
  Warsaw: "PL",
  Lisbon: "PT",
  Helsinki: "FI",
  Oslo: "NO",
  Brussels: "BE",
  // Asia
  Singapore: "SG",
  Tokyo: "JP",
  Seoul: "KR",
  "Hong Kong": "HK",
  Taipei: "TW",
  Bangkok: "TH",
  Asia: "SG",
  // Canada
  Toronto: "CA",
  Vancouver: "CA",
  Montreal: "CA",
  // Australia
  Sydney: "AU",
  Melbourne: "AU",
  // Other
  "Tel Aviv": "IL",
  Mumbai: "IN",
  Bangalore: "IN",
  "Sao Paulo": "BR",
  "Rio de Janeiro": "BR",
  "Buenos Aires": "AR",
  "Mexico City": "MX",
};

function inferNationality(location: string): string {
  // Check exact match first
  if (CITY_TO_COUNTRY[location]) return CITY_TO_COUNTRY[location];
  // Check if location starts with a known city
  for (const [city, country] of Object.entries(CITY_TO_COUNTRY)) {
    if (location.startsWith(city)) return country;
  }
  // Default to US (most dateme profiles are US-based)
  return "US";
}

/** Infer language(s) from country code */
function inferLanguages(
  country: string
): { code: string; proficiency: number }[] {
  const COUNTRY_LANGS: Record<
    string,
    { code: string; proficiency: number }[]
  > = {
    US: [{ code: "en", proficiency: 7 }],
    GB: [{ code: "en", proficiency: 7 }],
    CA: [
      { code: "en", proficiency: 7 },
      { code: "fr", proficiency: 3 },
    ],
    AU: [{ code: "en", proficiency: 7 }],
    DE: [
      { code: "de", proficiency: 7 },
      { code: "en", proficiency: 5 },
    ],
    FR: [
      { code: "fr", proficiency: 7 },
      { code: "en", proficiency: 4 },
    ],
    ES: [
      { code: "es", proficiency: 7 },
      { code: "en", proficiency: 4 },
    ],
    NL: [
      { code: "nl", proficiency: 7 },
      { code: "en", proficiency: 6 },
    ],
    SE: [
      { code: "sv", proficiency: 7 },
      { code: "en", proficiency: 6 },
    ],
    DK: [
      { code: "da", proficiency: 7 },
      { code: "en", proficiency: 6 },
    ],
    NO: [
      { code: "no", proficiency: 7 },
      { code: "en", proficiency: 6 },
    ],
    FI: [
      { code: "fi", proficiency: 7 },
      { code: "en", proficiency: 5 },
    ],
    JP: [
      { code: "ja", proficiency: 7 },
      { code: "en", proficiency: 3 },
    ],
    KR: [
      { code: "ko", proficiency: 7 },
      { code: "en", proficiency: 4 },
    ],
    BR: [
      { code: "pt", proficiency: 7 },
      { code: "en", proficiency: 4 },
    ],
    SG: [{ code: "en", proficiency: 7 }],
    HK: [
      { code: "zh", proficiency: 7 },
      { code: "en", proficiency: 6 },
    ],
    TW: [
      { code: "zh", proficiency: 7 },
      { code: "en", proficiency: 4 },
    ],
    IL: [
      { code: "he", proficiency: 7 },
      { code: "en", proficiency: 6 },
    ],
    IN: [
      { code: "hi", proficiency: 7 },
      { code: "en", proficiency: 6 },
    ],
    IE: [{ code: "en", proficiency: 7 }],
    CH: [
      { code: "de", proficiency: 7 },
      { code: "en", proficiency: 5 },
    ],
    AT: [
      { code: "de", proficiency: 7 },
      { code: "en", proficiency: 5 },
    ],
    CZ: [
      { code: "cs", proficiency: 7 },
      { code: "en", proficiency: 4 },
    ],
    PL: [
      { code: "pl", proficiency: 7 },
      { code: "en", proficiency: 4 },
    ],
    PT: [
      { code: "pt", proficiency: 7 },
      { code: "en", proficiency: 4 },
    ],
    BE: [
      { code: "nl", proficiency: 7 },
      { code: "fr", proficiency: 6 },
      { code: "en", proficiency: 5 },
    ],
    TH: [
      { code: "th", proficiency: 7 },
      { code: "en", proficiency: 3 },
    ],
    MX: [
      { code: "es", proficiency: 7 },
      { code: "en", proficiency: 3 },
    ],
    AR: [
      { code: "es", proficiency: 7 },
      { code: "en", proficiency: 3 },
    ],
  };
  return COUNTRY_LANGS[country] || [{ code: "en", proficiency: 7 }];
}

// ── Profile Tuple Builder ────────────────────────────────────────────

interface DatemeProfile {
  id: number;
  name: string;
  age: string;
  gender: string;
  location: string;
  bio_text: string | null;
  profile_url: string | null;
  first_photo: string | null;
}

function buildProfileTuple(p: DatemeProfile) {
  const ZERO =
    "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

  const loc = parseLocation(p.location);
  const country = inferNationality(loc);
  const languages = inferLanguages(country);

  return {
    profileVersion: 2,
    displayName: makeDisplayName(p.name),
    nameHash: ZERO,
    age: parseAge(p.age),
    heightCm: 0,
    nationality: nationalityToBytes2(country),
    languagesPacked: packLanguages(languages),
    friendsOpenToMask: 0,
    locationCityId: loc ? keccak256(toBytes(loc)) : ZERO,
    locationLatE6: 0,
    locationLngE6: 0,
    schoolId: ZERO,
    skillsCommit: packTagIds([]),
    hobbiesCommit: packTagIds([]),
    photoURI: "",
    gender: mapGender(p.gender),
    relocate: 0,
    degree: 0,
    fieldBucket: 0,
    profession: 0,
    industry: 0,
    relationshipStatus: 0,
    sexuality: 0,
    ethnicity: 0,
    datingStyle: 0,
    children: 0,
    wantsChildren: 0,
    drinking: 0,
    smoking: 0,
    drugs: 0,
    lookingFor: 0,
    religion: 0,
    pets: 0,
    diet: 0,
  };
}

// ── Filebase S3 Upload (AWS Sig V4) ──────────────────────────────────

async function sha256Bytes(data: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await sha256Bytes(encoder.encode(message));
  return bytesToHex(hash);
}

async function sha256HexFromBuffer(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  const hash = await sha256Bytes(buffer);
  return bytesToHex(hash);
}

async function hmacSha256(
  key: ArrayBuffer | Uint8Array | string,
  message: string
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? encoder.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
}

async function hmacHex(
  key: ArrayBuffer | Uint8Array | string,
  message: string
): Promise<string> {
  const sig = await hmacSha256(key, message);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const kDate = await hmacSha256(
    encoder.encode("AWS4" + secretKey),
    dateStamp
  );
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

async function uploadToFilebase(
  filebaseApiKey: string,
  content: Uint8Array,
  contentType: string,
  fileName: string
): Promise<string> {
  const decoded = atob(filebaseApiKey);
  const [accessKey, secretKey, bucket] = decoded.split(":");
  if (!accessKey || !secretKey || !bucket) {
    throw new Error("Invalid Filebase API key format");
  }

  const endpoint = "s3.filebase.com";
  const region = "us-east-1";
  const service = "s3";

  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = `/${bucket}/${fileName}`;

  const payloadHash = await sha256HexFromBuffer(content);

  const canonicalHeaders =
    [
      `host:${endpoint}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`,
    ].join("\n") + "\n";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await getSigningKey(
    secretKey,
    dateStamp,
    region,
    service
  );
  const signature = await hmacHex(signingKey, stringToSign);

  const authHeader = [
    `${algorithm} Credential=${accessKey}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  const response = await fetch(`https://${endpoint}${canonicalUri}`, {
    method: "PUT",
    headers: {
      Authorization: authHeader,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      "Content-Type": contentType,
    },
    body: content,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Filebase upload failed: ${response.status} ${text}`);
  }

  const cid = response.headers.get("x-amz-meta-cid");
  if (!cid) {
    throw new Error("No CID returned from Filebase");
  }

  return cid;
}

// ── fal.ai Anime Conversion ─────────────────────────────────────────

async function convertToAnime(
  falKey: string,
  imageBytes: Uint8Array,
  contentType: string
): Promise<Uint8Array> {
  // Convert to base64 data URI
  const b64 = Buffer.from(imageBytes).toString("base64");
  const mimeType = contentType === "image/png" ? "image/png" : "image/jpeg";
  const dataUri = `data:${mimeType};base64,${b64}`;

  const FAL_MODEL = "fal-ai/flux/dev/image-to-image";

  // Submit to fal.ai queue
  const submitRes = await fetch(
    `https://queue.fal.run/${FAL_MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: dataUri,
        prompt:
          "Convert this portrait photo into anime style art, keeping the same pose, expression, and distinguishing features. Clean anime illustration style with vibrant colors.",
        strength: 0.85,
        num_inference_steps: 40,
        guidance_scale: 3.5,
        output_format: "png",
      }),
    }
  );

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`fal.ai submit failed: ${submitRes.status} ${errText}`);
  }

  const submitData = await submitRes.json();

  // If synchronous response (has images already)
  if (submitData.images?.[0]?.url) {
    const imgRes = await fetch(submitData.images[0].url);
    return new Uint8Array(await imgRes.arrayBuffer());
  }

  // Queue-based: use URLs from response (fal.ai shortens the model path)
  const statusUrl = submitData.status_url;
  const resultUrl = submitData.response_url;
  if (!statusUrl || !resultUrl) {
    throw new Error("No status_url/response_url from fal.ai submit");
  }

  // Poll status every 3s, timeout after 180s
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));

    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${falKey}` },
    });
    if (!statusRes.ok) continue;

    const statusText = await statusRes.text();
    let status: any;
    try {
      status = JSON.parse(statusText);
    } catch {
      continue; // Retry on parse failure
    }

    if (status.status === "COMPLETED") {
      // Fetch result
      const resultRes = await fetch(resultUrl, {
        headers: { Authorization: `Key ${falKey}` },
      });
      if (!resultRes.ok) {
        throw new Error(`fal.ai result fetch failed: ${resultRes.status}`);
      }
      const result = await resultRes.json();
      if (!result.images?.[0]?.url) {
        throw new Error("No image URL in fal.ai result");
      }
      const imgRes = await fetch(result.images[0].url);
      return new Uint8Array(await imgRes.arrayBuffer());
    }
    if (status.status === "FAILED") {
      throw new Error(`fal.ai job failed: ${JSON.stringify(status)}`);
    }
    // IN_QUEUE or IN_PROGRESS — keep polling
  }

  throw new Error("fal.ai conversion timed out after 180s");
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv;
  const dryRun = args.includes("--dry-run");
  const skipFal = args.includes("--skip-fal");
  const skipChain = args.includes("--skip-chain");
  const startArg = args.find((a) => a.startsWith("--start="));
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const startIdx = startArg ? parseInt(startArg.split("=")[1]) : 0;
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : Infinity;

  console.log("Dateme → Heaven Ingestor");
  console.log("=".repeat(60));
  console.log(`   Dry run:      ${dryRun}`);
  console.log(`   Skip fal.ai:  ${skipFal}`);
  console.log(`   Skip chain:   ${skipChain}`);
  console.log(`   Start index:  ${startIdx}`);
  console.log(`   Limit:        ${limit === Infinity ? "all" : limit}`);

  // ── Load env ─────────────────────────────────────────────────────
  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in .env");
  if (!pk.startsWith("0x")) pk = `0x${pk}`;

  // RecordsV1 requires msg.sender == sponsor || owner().
  // Load the owner key from contracts/megaeth/.env for RecordsV1 calls.
  const contractsEnvPath = join(__dirname, "../../contracts/megaeth/.env");
  const contractsEnv = dotenv.parse(readFileSync(contractsEnvPath, "utf-8"));
  let ownerPk = contractsEnv.PRIVATE_KEY;
  if (!ownerPk) throw new Error("PRIVATE_KEY not found in contracts/megaeth/.env");
  if (!ownerPk.startsWith("0x")) ownerPk = `0x${ownerPk}`;

  const falKey = process.env.FAL_KEY;
  if (!falKey && !skipFal && !dryRun) {
    throw new Error("FAL_KEY not found in .env (use --skip-fal to skip)");
  }

  const filebaseKey = process.env.FILEBASE_API_KEY;
  if (!filebaseKey && !skipFal && !dryRun) {
    throw new Error("FILEBASE_API_KEY not found in .env");
  }

  const deployer = privateKeyToAccount(pk as Hex);
  const owner = privateKeyToAccount(ownerPk as Hex);
  console.log(`   Deployer:     ${deployer.address}`);
  console.log(`   Owner:        ${owner.address} (for RecordsV1)`);

  // ── Open dateme.db ───────────────────────────────────────────────
  const dbPath = "/media/t42/th42/Code/dateme-dir-crawler/dateme.db";
  if (!existsSync(dbPath)) {
    throw new Error(`dateme.db not found at ${dbPath}`);
  }
  const db = new Database(dbPath, { readonly: true });

  const rows = db
    .query<DatemeProfile, []>(
      `SELECT p.id, p.name, p.age, p.gender, p.location, p.bio_text,
              p.profile_url, MIN(ph.local_path) as first_photo
       FROM profiles p
       LEFT JOIN photos ph ON ph.profile_id = p.id AND ph.downloaded = 1
       WHERE p.source = 'dateme.directory'
         AND p.age IS NOT NULL AND p.gender IS NOT NULL AND p.location IS NOT NULL
       GROUP BY p.id
       ORDER BY p.id`
    )
    .all();

  console.log(`   Total profiles in DB: ${rows.length}`);

  // Filter empty locations
  const validRows = rows.filter((r) => {
    const loc = parseLocation(r.location);
    return loc !== "";
  });
  console.log(`   Valid profiles (with location): ${validRows.length}`);

  // Apply start + limit
  const toProcess = validRows.slice(startIdx, startIdx + limit);
  console.log(`   Processing:   ${toProcess.length}`);

  // ── Clients ──────────────────────────────────────────────────────
  const publicClient = createPublicClient({
    transport: http(MEGAETH_RPC),
  });

  const walletClient = createWalletClient({
    account: deployer,
    chain: megaeth,
    transport: http(MEGAETH_RPC),
  });

  // Owner wallet client for RecordsV1 (requires sponsor/owner as msg.sender)
  const ownerWalletClient = createWalletClient({
    account: owner,
    chain: megaeth,
    transport: http(MEGAETH_RPC),
  });

  // ── Deterministic wallet ─────────────────────────────────────────
  function walletForProfile(profileId: number): {
    address: `0x${string}`;
    privateKey: Hex;
  } {
    const seed = keccak256(toBytes(`heaven-seed:dateme-${profileId}`));
    const account = privateKeyToAccount(seed);
    return { address: account.address, privateKey: seed };
  }

  let successCount = 0;
  let failCount = 0;
  const photosDir = "/media/t42/th42/Code/dateme-dir-crawler";

  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i];
    const label = makeLabel(row.name, row.id);
    const loc = parseLocation(row.location);
    const country = inferNationality(loc);
    const { address: userAddress, privateKey: userPk } = walletForProfile(
      row.id
    );
    const userWallet = new Wallet(userPk);

    console.log(`\n${"─".repeat(60)}`);
    console.log(
      `[${i + 1}/${toProcess.length}] ${row.name} → ${label}.heaven (id=${row.id})`
    );
    console.log(`   ${loc} | ${country} | Age ${row.age} | ${row.gender}`);
    console.log(`   Wallet: ${userAddress}`);
    console.log(`   Photo:  ${row.first_photo || "(none)"}`);
    if (row.bio_text) {
      console.log(`   Bio:    ${cleanBio(row.bio_text).slice(0, 80)}...`);
    }

    if (dryRun) {
      console.log("   [dry-run] Would convert photo, upload, register name, set profile, set records");
      successCount++;
      continue;
    }

    try {
      // ── Step 1: Convert photo to anime + upload to Filebase ────
      let avatarUri = "";

      if (!skipFal && row.first_photo && falKey && filebaseKey) {
        const photoPath = join(photosDir, row.first_photo);
        if (existsSync(photoPath)) {
          try {
            console.log("   Converting to anime via fal.ai...");
            const photoBytes = new Uint8Array(readFileSync(photoPath));
            const ext = photoPath.toLowerCase().endsWith(".png") ? "png" : "jpeg";
            const animeBytes = await convertToAnime(
              falKey,
              photoBytes,
              `image/${ext}`
            );
            console.log(
              `   Anime conversion done (${animeBytes.length} bytes)`
            );

            // Upload to Filebase
            console.log("   Uploading to Filebase...");
            const fileName = `avatars/dateme-${row.id}.png`;
            const cid = await uploadToFilebase(
              filebaseKey,
              animeBytes,
              "image/png",
              fileName
            );
            avatarUri = `ipfs://${cid}`;
            console.log(`   Uploaded! CID: ${cid}`);
          } catch (err: any) {
            console.error(`   fal.ai/filebase failed: ${err.message}`);
            console.log("   Falling back to placewaifu...");
            avatarUri = "https://placewaifu.com/image/200";
          }
        } else {
          console.log(`   Photo file not found, using placewaifu`);
          avatarUri = "https://placewaifu.com/image/200";
        }
      } else {
        avatarUri = "https://placewaifu.com/image/200";
      }

      if (skipChain) {
        console.log("   [skip-chain] Skipping on-chain writes");
        successCount++;
        continue;
      }

      // ── Step 2: Register .heaven name ──────────────────────────
      const isAvailable = await publicClient.readContract({
        address: REGISTRY_V1,
        abi: registryAbi,
        functionName: "available",
        args: [HEAVEN_NODE, label],
      });

      if (isAvailable) {
        console.log(`   Registering ${label}.heaven...`);
        const regHash = await walletClient.writeContract({
          address: REGISTRY_V1,
          abi: registryAbi,
          functionName: "registerFor",
          args: [
            HEAVEN_NODE,
            label,
            userAddress,
            BigInt(365 * 24 * 60 * 60),
          ],
          gas: 2_000_000n,
          gasPrice: 1_000_000n,
        });
        const regReceipt = await publicClient.waitForTransactionReceipt({
          hash: regHash,
        });
        console.log(
          `   Name registered! TX: ${regHash} (block ${regReceipt.blockNumber})`
        );
      } else {
        console.log(`   Name already registered, skipping...`);
      }

      // ── Step 3: Set profile on ProfileV2 ───────────────────────
      console.log("   Setting profile...");
      const nonce = await publicClient.readContract({
        address: PROFILE_V2,
        abi: profileAbi,
        functionName: "nonces",
        args: [userAddress],
      });

      const tuple = buildProfileTuple(row);
      const pHash = profileHash(tuple);

      const profileMessage = `heaven:profile:${userAddress.toLowerCase()}:${pHash}:${nonce}`;
      const profileSig = await userWallet.signMessage(profileMessage);

      const profileTxHash = await walletClient.writeContract({
        address: PROFILE_V2,
        abi: profileAbi,
        functionName: "upsertProfileFor",
        args: [userAddress, tuple, profileSig as Hex],
        gas: 3_000_000n,
        gasPrice: 1_000_000n,
      });
      const profileReceipt = await publicClient.waitForTransactionReceipt({
        hash: profileTxHash,
      });
      console.log(
        `   Profile set! TX: ${profileTxHash} (block ${profileReceipt.blockNumber})`
      );

      // ── Step 4: Set text records ───────────────────────────────
      console.log("   Setting text records...");
      const node = computeNode(label);

      const recordNonce = await publicClient.readContract({
        address: RECORDS_V1,
        abi: recordsAbi,
        functionName: "nonces",
        args: [node],
      });

      const keys = ["avatar", "description", "heaven.location"];
      const values = [avatarUri, cleanBio(row.bio_text), loc];

      // Add source URL if available
      if (row.profile_url) {
        keys.push("url");
        values.push(row.profile_url);
      }

      const payloadHash = recordsBatchHash(keys, values);
      const recordsMessage = `heaven:records-batch:${node.toLowerCase()}:${payloadHash}:${recordNonce}`;
      const recordsSig = await userWallet.signMessage(recordsMessage);

      const recordsTxHash = await ownerWalletClient.writeContract({
        address: RECORDS_V1,
        abi: recordsAbi,
        functionName: "setRecordsFor",
        args: [node, keys, values, recordsSig as Hex],
        gas: 3_000_000n,
        gasPrice: 1_000_000n,
      });
      const recordsReceipt = await publicClient.waitForTransactionReceipt({
        hash: recordsTxHash,
      });
      console.log(
        `   Records set! TX: ${recordsTxHash} (block ${recordsReceipt.blockNumber})`
      );

      successCount++;
      console.log(`   DONE`);
    } catch (err: any) {
      failCount++;
      console.error(`   FAILED (id=${row.id}): ${err.message}`);
      if (err.cause) console.error(`   Cause:`, err.cause);
    }
  }

  db.close();

  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `Ingest complete: ${successCount} success, ${failCount} failed out of ${toProcess.length}`
  );
}

main().catch((e) => {
  console.error("\nFATAL:", e?.message || e);
  process.exit(1);
});
