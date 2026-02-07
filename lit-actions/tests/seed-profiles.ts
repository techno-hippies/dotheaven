#!/usr/bin/env bun
/**
 * Seed 20 realistic profiles on-chain via direct contract calls.
 *
 * Creates profiles with:
 * - .heaven name (RegistryV1.registerFor)
 * - ProfileV2 on-chain data (ProfileV2.upsertProfileFor)
 * - Text records: avatar, bio, location (RecordsV1.setRecordsFor)
 * - Placewaifu anime avatars
 *
 * Each profile gets a unique random wallet address. The deployer EOA sends
 * all transactions (paying gas). User signatures are generated from the
 * random wallets' private keys.
 *
 * Usage:
 *   bun tests/seed-profiles.ts
 *   bun tests/seed-profiles.ts --dry-run        # Show what would happen
 *   bun tests/seed-profiles.ts --start=5        # Start from profile index 5
 *   bun tests/seed-profiles.ts --only=3         # Only seed profile at index 3
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

const PROFILE_V2 = "0xa31545D33f6d656E62De67fd020A26608d4601E5" as const;
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
  "function upsertProfileFor(address user, (uint8 profileVersion, string displayName, bytes32 nameHash, uint8 age, uint16 heightCm, bytes2 nationality, uint256 languagesPacked, uint8 friendsOpenToMask, bytes32 locationCityId, bytes32 schoolId, bytes32 skillsCommit, bytes32 hobbiesCommit, string photoURI, uint8 gender, uint8 relocate, uint8 degree, uint8 fieldBucket, uint8 profession, uint8 industry, uint8 relationshipStatus, uint8 sexuality, uint8 ethnicity, uint8 datingStyle, uint8 children, uint8 wantsChildren, uint8 drinking, uint8 smoking, uint8 drugs, uint8 lookingFor, uint8 religion, uint8 pets, uint8 diet) calldata in_, bytes calldata signature) external",
  "function getProfile(address user) external view returns ((uint8 profileVersion, bool exists, uint8 age, uint16 heightCm, bytes2 nationality, uint8 friendsOpenToMask, uint256 languagesPacked, bytes32 locationCityId, bytes32 schoolId, bytes32 skillsCommit, bytes32 hobbiesCommit, bytes32 nameHash, uint256 packed, string displayName, string photoURI))",
]);

const recordsAbi = parseAbi([
  "function nonces(bytes32 node) external view returns (uint256)",
  "function setRecordsFor(bytes32 node, string[] calldata keys, string[] calldata values, bytes calldata signature) external",
  "function text(bytes32 node, string key) external view returns (string)",
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

// ── Profile Data ─────────────────────────────────────────────────────

interface SeedProfile {
  label: string;
  displayName: string;
  age: number;
  gender: number;
  nationality: string;
  languages: { code: string; proficiency: number }[];
  location: string;
  bio: string;
  hobbies: number[];
  skills: number[];
  degree?: number;
  profession?: number;
  industry?: number;
  sexuality?: number;
  datingStyle?: number;
  lookingFor?: number;
  drinking?: number;
  smoking?: number;
  pets?: number;
  diet?: number;
}

const PROFILES: SeedProfile[] = [
  {
    label: "sarah-nyc",
    displayName: "Sarah",
    age: 27,
    gender: 1,
    nationality: "US",
    languages: [
      { code: "en", proficiency: 7 },
      { code: "fr", proficiency: 3 },
    ],
    location: "New York, New York, United States",
    bio: "UX designer who paints on weekends. Obsessed with ramen and rooftop sunsets. Looking for someone to explore museums with.",
    hobbies: [101, 150, 302, 350],
    skills: [1050, 1000],
    degree: 4,
    profession: 3,
    industry: 1,
    lookingFor: 3,
    drinking: 3,
    smoking: 1,
    pets: 3,
  },
  {
    label: "marcus-sf",
    displayName: "Marcus",
    age: 31,
    gender: 2,
    nationality: "US",
    languages: [
      { code: "en", proficiency: 7 },
      { code: "es", proficiency: 4 },
    ],
    location: "San Francisco, California, United States",
    bio: "Backend engineer at a startup. Trail runner, home cook, vinyl collector. Can debate the best taco spots for hours.",
    hobbies: [1, 4, 150, 54],
    skills: [1000, 1002],
    degree: 5,
    profession: 1,
    industry: 1,
    sexuality: 1,
    datingStyle: 1,
    lookingFor: 3,
    drinking: 3,
    smoking: 1,
    diet: 1,
  },
  {
    label: "aisha-chi",
    displayName: "Aisha",
    age: 24,
    gender: 1,
    nationality: "US",
    languages: [
      { code: "en", proficiency: 7 },
      { code: "ar", proficiency: 5 },
    ],
    location: "Chicago, Illinois, United States",
    bio: "Med student with too many houseplants. I bake when stressed and read sci-fi to decompress. Love spontaneous road trips.",
    hobbies: [151, 302, 252, 350],
    skills: [1150, 1300],
    degree: 5,
    profession: 9,
    lookingFor: 3,
    smoking: 1,
  },
  {
    label: "tyler-austin",
    displayName: "Tyler",
    age: 29,
    gender: 2,
    nationality: "US",
    languages: [{ code: "en", proficiency: 7 }],
    location: "Austin, Texas, United States",
    bio: "Music producer and DJ. If you can handle my record collection taking up half the apartment, we might just work out.",
    hobbies: [53, 54, 200, 153],
    skills: [1000, 1050],
    profession: 8,
    industry: 3,
    datingStyle: 1,
    lookingFor: 6,
    drinking: 3,
  },
  {
    label: "priya-seattle",
    displayName: "Priya",
    age: 33,
    gender: 1,
    nationality: "US",
    languages: [
      { code: "en", proficiency: 7 },
      { code: "hi", proficiency: 7 },
      { code: "ta", proficiency: 5 },
    ],
    location: "Seattle, Washington, United States",
    bio: "Product manager by day, amateur photographer by twilight. Hiking the PNW is my therapy. Will cook you the best biryani.",
    hobbies: [102, 4, 150, 5],
    skills: [1100, 1000],
    degree: 5,
    profession: 2,
    industry: 1,
    lookingFor: 3,
    pets: 2,
  },
  {
    label: "james-boston",
    displayName: "James",
    age: 36,
    gender: 2,
    nationality: "US",
    languages: [
      { code: "en", proficiency: 7 },
      { code: "de", proficiency: 3 },
    ],
    location: "Boston, Massachusetts, United States",
    bio: "History professor who brews his own beer. I have strong opinions about architecture and weak willpower around bookstores.",
    hobbies: [302, 152, 104, 350],
    skills: [1252, 1102],
    degree: 6,
    profession: 10,
    industry: 4,
    datingStyle: 1,
    lookingFor: 4,
    drinking: 3,
  },
  {
    label: "olivia-london",
    displayName: "Olivia",
    age: 28,
    gender: 1,
    nationality: "GB",
    languages: [
      { code: "en", proficiency: 7 },
      { code: "it", proficiency: 4 },
    ],
    location: "London, England, United Kingdom",
    bio: "Journalist turned content strategist. Theatre nerd, pub quiz champion, and unapologetic tea snob. Looking for my partner in crime.",
    hobbies: [104, 302, 155, 9],
    skills: [1101, 1102],
    degree: 4,
    profession: 6,
    industry: 3,
    lookingFor: 3,
    drinking: 3,
    smoking: 1,
  },
  {
    label: "callum-edinburgh",
    displayName: "Callum",
    age: 30,
    gender: 2,
    nationality: "GB",
    languages: [
      { code: "en", proficiency: 7 },
      { code: "fr", proficiency: 3 },
    ],
    location: "Edinburgh, Scotland, United Kingdom",
    bio: "Data scientist with a climbing addiction. If I'm not at my desk, I'm probably halfway up a crag somewhere in the Highlands.",
    hobbies: [7, 4, 250, 204],
    skills: [1004, 1001],
    degree: 5,
    profession: 4,
    industry: 1,
    lookingFor: 3,
    pets: 2,
    diet: 1,
  },
  {
    label: "luisa-berlin",
    displayName: "Luisa",
    age: 26,
    gender: 1,
    nationality: "DE",
    languages: [
      { code: "de", proficiency: 7 },
      { code: "en", proficiency: 6 },
      { code: "es", proficiency: 3 },
    ],
    location: "Berlin, Germany",
    bio: "Graphic designer who collects vintage synths. Berlin techno is my love language. Let's grab a coffee at a Spaetkauf.",
    hobbies: [110, 53, 54, 153],
    skills: [1050, 1051],
    degree: 4,
    profession: 3,
    industry: 1,
    lookingFor: 6,
    drinking: 3,
    diet: 2,
  },
  {
    label: "felix-munich",
    displayName: "Felix",
    age: 34,
    gender: 2,
    nationality: "DE",
    languages: [
      { code: "de", proficiency: 7 },
      { code: "en", proficiency: 6 },
      { code: "ja", proficiency: 2 },
    ],
    location: "Munich, Bavaria, Germany",
    bio: "Mechanical engineer who loves the Alps. Weekday: simulations. Weekend: skiing or Biergarten. Learning Japanese because of anime.",
    hobbies: [11, 4, 200, 14],
    skills: [1000, 1004],
    degree: 5,
    profession: 1,
    industry: 5,
    datingStyle: 1,
    lookingFor: 3,
    drinking: 3,
    smoking: 1,
  },
  {
    label: "camille-paris",
    displayName: "Camille",
    age: 25,
    gender: 1,
    nationality: "FR",
    languages: [
      { code: "fr", proficiency: 7 },
      { code: "en", proficiency: 5 },
      { code: "pt", proficiency: 3 },
    ],
    location: "Paris, Ile-de-France, France",
    bio: "Film studies grad now doing video editing. Cinema is not a hobby, it's a way of life. Will absolutely judge your Letterboxd.",
    hobbies: [103, 102, 155, 152],
    skills: [1052, 1051],
    degree: 5,
    profession: 3,
    industry: 3,
    lookingFor: 3,
    drinking: 3,
    diet: 1,
  },
  {
    label: "diego-barcelona",
    displayName: "Diego",
    age: 28,
    gender: 2,
    nationality: "ES",
    languages: [
      { code: "es", proficiency: 7 },
      { code: "en", proficiency: 5 },
      { code: "ca", proficiency: 6 },
    ],
    location: "Barcelona, Catalonia, Spain",
    bio: "Architect who surfs before work. I design buildings by day and build furniture in my workshop on weekends. Paella Sundays are sacred.",
    hobbies: [10, 108, 150, 14],
    skills: [1051, 1053],
    degree: 5,
    profession: 3,
    industry: 5,
    datingStyle: 1,
    lookingFor: 4,
    drinking: 3,
    smoking: 1,
  },
  {
    label: "emma-amsterdam",
    displayName: "Emma",
    age: 30,
    gender: 1,
    nationality: "NL",
    languages: [
      { code: "nl", proficiency: 7 },
      { code: "en", proficiency: 7 },
      { code: "de", proficiency: 4 },
    ],
    location: "Amsterdam, North Holland, Netherlands",
    bio: "Sustainability consultant and avid cyclist. I make ceramics, grow herbs on my balcony, and foster rescue cats.",
    hobbies: [3, 106, 252, 300],
    skills: [1100, 1101],
    degree: 5,
    profession: 7,
    industry: 9,
    lookingFor: 3,
    smoking: 1,
    pets: 2,
    diet: 2,
  },
  {
    label: "minjun-seoul",
    displayName: "Minjun",
    age: 27,
    gender: 2,
    nationality: "KR",
    languages: [
      { code: "ko", proficiency: 7 },
      { code: "en", proficiency: 5 },
      { code: "ja", proficiency: 3 },
    ],
    location: "Seoul, South Korea",
    bio: "Game developer and casual streamer. If I'm not coding, I'm probably at a PC bang or hunting for the best fried chicken in Gangnam.",
    hobbies: [200, 204, 150, 57],
    skills: [1000, 1004],
    degree: 4,
    profession: 1,
    industry: 1,
    lookingFor: 3,
    drinking: 3,
    smoking: 1,
  },
  {
    label: "yuki-tokyo",
    displayName: "Yuki",
    age: 29,
    gender: 1,
    nationality: "JP",
    languages: [
      { code: "ja", proficiency: 7 },
      { code: "en", proficiency: 4 },
    ],
    location: "Tokyo, Japan",
    bio: "Illustrator and cat mom. I draw manga-style portraits and sell prints at Comiket. My ideal date is a good izakaya and long walks.",
    hobbies: [100, 110, 302, 153],
    skills: [1050, 1051],
    degree: 4,
    profession: 3,
    industry: 3,
    lookingFor: 3,
    smoking: 1,
    pets: 2,
  },
  {
    label: "matheus-rio",
    displayName: "Matheus",
    age: 26,
    gender: 2,
    nationality: "BR",
    languages: [
      { code: "pt", proficiency: 7 },
      { code: "en", proficiency: 5 },
      { code: "es", proficiency: 4 },
    ],
    location: "Rio de Janeiro, Brazil",
    bio: "Full-stack dev who surfs Copacabana before standup. Building a crypto startup with friends. Samba is in my blood.",
    hobbies: [10, 207, 204, 9],
    skills: [1000, 1002],
    degree: 4,
    profession: 1,
    industry: 1,
    lookingFor: 6,
    drinking: 3,
    smoking: 1,
  },
  {
    label: "ananya-mumbai",
    displayName: "Ananya",
    age: 25,
    gender: 1,
    nationality: "IN",
    languages: [
      { code: "hi", proficiency: 7 },
      { code: "en", proficiency: 7 },
      { code: "mr", proficiency: 6 },
    ],
    location: "Mumbai, Maharashtra, India",
    bio: "Data analyst at a fintech. Classical dancer (Bharatanatyam) and weekend baker. Ask me about my sourdough starter, she has a name.",
    hobbies: [9, 151, 302, 5],
    skills: [1004, 1001],
    degree: 4,
    profession: 4,
    industry: 2,
    lookingFor: 3,
    smoking: 1,
    diet: 2,
  },
  {
    label: "erik-stockholm",
    displayName: "Erik",
    age: 32,
    gender: 2,
    nationality: "SE",
    languages: [
      { code: "sv", proficiency: 7 },
      { code: "en", proficiency: 7 },
      { code: "no", proficiency: 5 },
    ],
    location: "Stockholm, Sweden",
    bio: "Backend engineer and cross-country skier. I build APIs and IKEA furniture with equal enthusiasm. Fika is a lifestyle, not a break.",
    hobbies: [11, 3, 153, 204],
    skills: [1000, 1002, 1006],
    degree: 5,
    profession: 1,
    industry: 1,
    datingStyle: 1,
    lookingFor: 4,
    drinking: 3,
    smoking: 1,
    diet: 1,
  },
  {
    label: "sophie-toronto",
    displayName: "Sophie",
    age: 28,
    gender: 1,
    nationality: "CA",
    languages: [
      { code: "en", proficiency: 7 },
      { code: "fr", proficiency: 6 },
    ],
    location: "Toronto, Ontario, Canada",
    bio: "Environmental scientist and rock climber. Splitting my time between the lab and the crag. My ideal weekend involves a lake and zero cell service.",
    hobbies: [7, 250, 4, 252],
    skills: [1150, 1152],
    degree: 5,
    profession: 10,
    industry: 9,
    lookingFor: 3,
    smoking: 1,
    pets: 3,
    diet: 4,
  },
  {
    label: "liam-portland",
    displayName: "Liam",
    age: 30,
    gender: 2,
    nationality: "US",
    languages: [
      { code: "en", proficiency: 7 },
      { code: "ko", proficiency: 2 },
    ],
    location: "Portland, Oregon, United States",
    bio: "Barista turned roastery owner. When I'm not pulling shots, I'm foraging mushrooms or playing chess online. Sourdough evangelist.",
    hobbies: [153, 257, 202, 151],
    skills: [1100, 1101],
    profession: 8,
    industry: 6,
    datingStyle: 1,
    lookingFor: 3,
    drinking: 3,
    smoking: 1,
    diet: 2,
  },
];

// ── ProfileInput type matching the Solidity struct ───────────────────

function buildProfileTuple(p: SeedProfile) {
  const ZERO =
    "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

  return {
    profileVersion: 2,
    displayName: p.displayName,
    nameHash: ZERO,
    age: p.age,
    heightCm: 0,
    nationality: nationalityToBytes2(p.nationality),
    languagesPacked: packLanguages(p.languages),
    friendsOpenToMask: 0,
    locationCityId: keccak256(toBytes(p.location)),
    schoolId: ZERO,
    skillsCommit: packTagIds(p.skills),
    hobbiesCommit: packTagIds(p.hobbies),
    photoURI: "",
    gender: p.gender,
    relocate: 0,
    degree: p.degree || 0,
    fieldBucket: 0,
    profession: p.profession || 0,
    industry: p.industry || 0,
    relationshipStatus: 0,
    sexuality: p.sexuality || 0,
    ethnicity: 0,
    datingStyle: p.datingStyle || 0,
    children: 0,
    wantsChildren: 0,
    drinking: p.drinking || 0,
    smoking: p.smoking || 0,
    drugs: 0,
    lookingFor: p.lookingFor || 0,
    religion: 0,
    pets: p.pets || 0,
    diet: p.diet || 0,
  };
}

// ── Profile hash (must match Solidity's keccak256(abi.encode(in_))) ──

// The ProfileInput struct ABI encoding for hashing
// Solidity's keccak256(abi.encode(struct)) encodes the struct as a tuple,
// so we must wrap all fields in a tuple type to match.
const PROFILE_INPUT_TUPLE = parseAbiParameters(
  "(uint8, string, bytes32, uint8, uint16, bytes2, uint256, uint8, bytes32, bytes32, bytes32, bytes32, string, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8)"
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

// ── Records batch hash (matches Solidity's keccak256(abi.encode(keys, values))) ──

function recordsBatchHash(keys: string[], values: string[]): Hex {
  const encoded = encodeAbiParameters(
    parseAbiParameters("string[], string[]"),
    [keys, values]
  );
  return keccak256(encoded);
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const startArg = process.argv.find((a) => a.startsWith("--start="));
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const startIdx = startArg ? parseInt(startArg.split("=")[1]) : 0;
  const onlyIdx = onlyArg ? parseInt(onlyArg.split("=")[1]) : -1;

  console.log("Seed Profiles — Heaven (Direct Contract Calls)");
  console.log("=".repeat(60));
  console.log(`   Dry run:     ${dryRun}`);
  console.log(`   Profiles:    ${PROFILES.length}`);
  if (onlyIdx >= 0) console.log(`   Only index:  ${onlyIdx}`);
  else if (startIdx > 0) console.log(`   Start index: ${startIdx}`);

  // Load deployer private key
  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment");
  if (!pk.startsWith("0x")) pk = `0x${pk}`;

  // RecordsV1 requires msg.sender == sponsor || owner().
  // Load the owner key from contracts/megaeth/.env for RecordsV1 calls.
  const contractsEnvPath = join(__dirname, "../../contracts/megaeth/.env");
  const { readFileSync } = await import("fs");
  const contractsEnv = dotenv.parse(readFileSync(contractsEnvPath, "utf-8"));
  let ownerPk = contractsEnv.PRIVATE_KEY;
  if (!ownerPk) throw new Error("PRIVATE_KEY not found in contracts/megaeth/.env");
  if (!ownerPk.startsWith("0x")) ownerPk = `0x${ownerPk}`;

  const deployer = privateKeyToAccount(pk as Hex);
  const owner = privateKeyToAccount(ownerPk as Hex);
  console.log(`   Deployer:    ${deployer.address}`);
  console.log(`   Owner:       ${owner.address} (for RecordsV1)`);

  // Clients
  const publicClient = createPublicClient({
    transport: http(MEGAETH_RPC),
  });

  const walletClient = createWalletClient({
    account: deployer,
    chain: megaeth,
    transport: http(MEGAETH_RPC),
  });

  const ownerWalletClient = createWalletClient({
    account: owner,
    chain: megaeth,
    transport: http(MEGAETH_RPC),
  });

  // Determine which profiles to seed
  let profilesToSeed: { profile: SeedProfile; idx: number }[];
  if (onlyIdx >= 0) {
    profilesToSeed = [{ profile: PROFILES[onlyIdx], idx: onlyIdx }];
  } else {
    profilesToSeed = PROFILES.slice(startIdx).map((p, i) => ({
      profile: p,
      idx: startIdx + i,
    }));
  }

  let successCount = 0;
  let failCount = 0;

  // Generate deterministic wallets (seeded from label)
  // This ensures the same label always gets the same address
  function walletForProfile(label: string): {
    address: `0x${string}`;
    privateKey: Hex;
  } {
    const seed = keccak256(toBytes(`heaven-seed:${label}`));
    const account = privateKeyToAccount(seed);
    return { address: account.address, privateKey: seed };
  }

  for (const { profile, idx } of profilesToSeed) {
    const { address: userAddress, privateKey: userPk } = walletForProfile(
      profile.label
    );
    // ethers v6 Wallet for EIP-191 signing (matches what the contract expects)
    const userWallet = new Wallet(userPk);

    console.log(`\n${"─".repeat(60)}`);
    console.log(
      `[${idx + 1}/${PROFILES.length}] ${profile.displayName} (${profile.label}.heaven)`
    );
    console.log(
      `   ${profile.location} | ${profile.nationality} | Age ${profile.age}`
    );
    console.log(`   Wallet: ${userAddress}`);

    if (dryRun) {
      console.log("   [dry-run] Would register name, set profile, set records");
      successCount++;
      continue;
    }

    try {
      // ── Step 1: Register .heaven name ──────────────────────────
      const isAvailable = await publicClient.readContract({
        address: REGISTRY_V1,
        abi: registryAbi,
        functionName: "available",
        args: [HEAVEN_NODE, profile.label],
      });

      if (isAvailable) {
        console.log(`   Registering ${profile.label}.heaven...`);
        const regHash = await walletClient.writeContract({
          address: REGISTRY_V1,
          abi: registryAbi,
          functionName: "registerFor",
          args: [
            HEAVEN_NODE,
            profile.label,
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

      // ── Step 2: Set profile on ProfileV2 ───────────────────────
      console.log("   Setting profile...");
      const nonce = await publicClient.readContract({
        address: PROFILE_V2,
        abi: profileAbi,
        functionName: "nonces",
        args: [userAddress],
      });

      const tuple = buildProfileTuple(profile);
      const pHash = profileHash(tuple);

      // Sign EIP-191 message: heaven:profile:{user}:{profileHash}:{nonce}
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

      // ── Step 3: Set text records ───────────────────────────────
      console.log("   Setting text records...");
      const node = computeNode(profile.label);

      const recordNonce = await publicClient.readContract({
        address: RECORDS_V1,
        abi: recordsAbi,
        functionName: "nonces",
        args: [node],
      });

      const avatarUrl = `https://placewaifu.com/image/200`;
      const keys = ["avatar", "description", "heaven.location"];
      const values = [avatarUrl, profile.bio, profile.location];

      // Sign batch records message: heaven:records-batch:{node}:{payloadHash}:{nonce}
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
      console.error(`   FAILED: ${err.message}`);
      if (err.cause) console.error(`   Cause:`, err.cause);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Seeding complete: ${successCount} success, ${failCount} failed`);

  // Print all wallet addresses for reference
  console.log(`\nWallet addresses:`);
  for (const p of PROFILES) {
    const { address } = walletForProfile(p.label);
    console.log(`   ${p.label.padEnd(20)} ${address}`);
  }
}

main().catch((e) => {
  console.error("\nFATAL:", e?.message || e);
  process.exit(1);
});
