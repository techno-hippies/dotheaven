/**
 * Profile data layer (read-only) — fetches profile data from ProfileV2 + RecordsV1.
 * Reuses viem client pattern from posts.ts / heaven-onchain.ts.
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { getPrimaryName } from './heaven-onchain';
import {
  MEGA_RPC,
  PROFILE_V2,
  FOLLOW_V1,
  REGISTRY_V1,
  RECORDS_V1,
  ZERO_HASH,
  toGenderAbbr,
  bytes2ToCode,
  resolveIpfsOrHttpUri,
  NUM_TO_GENDER_LABEL,
  NUM_TO_RELOCATE,
  NUM_TO_DEGREE,
  NUM_TO_FIELD,
  NUM_TO_PROFESSION,
  NUM_TO_INDUSTRY,
  NUM_TO_RELATIONSHIP,
  NUM_TO_SEXUALITY,
  NUM_TO_ETHNICITY,
  NUM_TO_DATING_STYLE,
  NUM_TO_CHILDREN,
  NUM_TO_WANTS_CHILDREN,
  NUM_TO_DRINKING,
  NUM_TO_SMOKING,
  NUM_TO_DRUGS,
  NUM_TO_LOOKING_FOR,
  NUM_TO_RELIGION,
  NUM_TO_PETS,
  NUM_TO_DIET,
  unpackLanguages,
  type LanguageEntry,
} from './heaven-constants';

// ── Constants ─────────────────────────────────────────────────────

const profileAbi = parseAbi([
  'struct Profile { uint8 profileVersion; bool exists; uint8 age; uint16 heightCm; bytes2 nationality; uint8 friendsOpenToMask; uint256 languagesPacked; bytes32 locationCityId; bytes32 schoolId; bytes32 skillsCommit; bytes32 hobbiesCommit; bytes32 nameHash; uint256 packed; string displayName; string photoURI; }',
  'function getProfile(address user) external view returns (Profile)',
]);

const recordsAbi = parseAbi([
  'function text(bytes32 node, string calldata key) external view returns (string)',
]);

const followAbi = parseAbi([
  'function followerCount(address user) external view returns (uint256)',
  'function followingCount(address user) external view returns (uint256)',
]);

const registryAbi = parseAbi([
  'function primaryNode(address) external view returns (bytes32)',
]);

// ── Singleton client ────────────────────────────────────────────

let _client: ReturnType<typeof createPublicClient> | null = null;
function getClient() {
  if (!_client) {
    _client = createPublicClient({ transport: http(MEGA_RPC) });
  }
  return _client;
}

// ── Types ─────────────────────────────────────────────────────────

export interface ProfileData {
  name: string;
  handle?: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  nationalityCode?: string;
  age?: number;
  gender?: string;
  genderLabel?: string;
  heightCm?: number;
  followerCount: number;
  followingCount: number;

  // Languages
  languages?: LanguageEntry[];

  // Education & Career
  school?: string;
  degree?: string;
  fieldBucket?: string;
  profession?: string;
  industry?: string;

  // Dating
  relocate?: string;
  relationshipStatus?: string;
  sexuality?: string;
  ethnicity?: string;
  datingStyle?: string;
  children?: string;
  wantsChildren?: string;
  lookingFor?: string;

  // Lifestyle
  hobbies?: string;
  skills?: string;
  drinking?: string;
  smoking?: string;
  drugs?: string;
  religion?: string;
  pets?: string;
  diet?: string;

  // Links
  url?: string;
  twitter?: string;
  github?: string;
  telegram?: string;

  // Raw numeric enum values (for edit profile)
  raw?: {
    gender: number;
    relocate: number;
    degree: number;
    fieldBucket: number;
    profession: number;
    industry: number;
    relationshipStatus: number;
    sexuality: number;
    ethnicity: number;
    datingStyle: number;
    children: number;
    wantsChildren: number;
    drinking: number;
    smoking: number;
    drugs: number;
    lookingFor: number;
    religion: number;
    pets: number;
    diet: number;
  };
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Fetch a user's full display profile (read-only).
 * Combines ProfileV2 struct + RecordsV1 text records + FollowV1 counts.
 */
export async function fetchProfile(
  address: `0x${string}`,
): Promise<ProfileData> {
  const client = getClient();

  // Fetch profile struct + primary name + follow counts in parallel
  const [profileResult, primaryName, followCounts] = await Promise.all([
    client
      .readContract({
        address: PROFILE_V2,
        abi: profileAbi,
        functionName: 'getProfile',
        args: [address],
      })
      .catch(() => null),
    getPrimaryName(address).catch(() => null),
    getFollowCounts(address),
  ]);

  let name = shortenAddress(address);
  let handle: string | undefined;
  let age: number | undefined;
  let gender: string | undefined;
  let genderLabel: string | undefined;
  let nationalityCode: string | undefined;
  let heightCm: number | undefined;
  let languages: LanguageEntry[] | undefined;

  // Raw enum values (for edit form)
  let rawEnums: ProfileData['raw'] | undefined;

  // Enum display values
  let relocate: string | undefined;
  let degree: string | undefined;
  let fieldBucket: string | undefined;
  let profession: string | undefined;
  let industry: string | undefined;
  let relationshipStatus: string | undefined;
  let sexuality: string | undefined;
  let ethnicity: string | undefined;
  let datingStyle: string | undefined;
  let children: string | undefined;
  let wantsChildren: string | undefined;
  let drinking: string | undefined;
  let smoking: string | undefined;
  let drugs: string | undefined;
  let lookingFor: string | undefined;
  let religion: string | undefined;
  let pets: string | undefined;
  let diet: string | undefined;

  if (profileResult) {
    const p = profileResult as {
      profileVersion: number;
      exists: boolean;
      age: number;
      heightCm: number;
      nationality: `0x${string}`;
      friendsOpenToMask: number;
      languagesPacked: bigint;
      locationCityId: `0x${string}`;
      schoolId: `0x${string}`;
      skillsCommit: `0x${string}`;
      hobbiesCommit: `0x${string}`;
      nameHash: `0x${string}`;
      packed: bigint;
      displayName: string;
      photoURI: string;
    };

    if (p.exists) {
      if (p.displayName) name = p.displayName;
      if (p.age > 0) age = p.age;
      if (p.heightCm > 0) heightCm = p.heightCm;

      nationalityCode = bytes2ToCode(p.nationality);

      // Decode languages
      const langEntries = unpackLanguages(p.languagesPacked);
      if (langEntries.length > 0) languages = langEntries;

      // Extract enums from packed uint256
      const getByte = (packed: bigint, offset: number): number =>
        Number((packed >> (BigInt(offset) * 8n)) & 0xFFn);

      const genderVal = getByte(p.packed, 0);
      gender = toGenderAbbr(genderVal);
      genderLabel = NUM_TO_GENDER_LABEL[genderVal];

      const rawRelocate = getByte(p.packed, 1);
      const rawDegree = getByte(p.packed, 2);
      const rawFieldBucket = getByte(p.packed, 3);
      const rawProfession = getByte(p.packed, 4);
      const rawIndustry = getByte(p.packed, 5);
      const rawRelationship = getByte(p.packed, 6);
      const rawSexuality = getByte(p.packed, 7);
      const rawEthnicity = getByte(p.packed, 8);
      const rawDatingStyle = getByte(p.packed, 9);
      const rawChildren = getByte(p.packed, 10);
      const rawWantsChildren = getByte(p.packed, 11);
      const rawDrinking = getByte(p.packed, 12);
      const rawSmoking = getByte(p.packed, 13);
      const rawDrugs = getByte(p.packed, 14);
      const rawLookingFor = getByte(p.packed, 15);
      const rawReligion = getByte(p.packed, 16);
      const rawPets = getByte(p.packed, 17);
      const rawDiet = getByte(p.packed, 18);

      relocate = NUM_TO_RELOCATE[rawRelocate];
      degree = NUM_TO_DEGREE[rawDegree];
      fieldBucket = NUM_TO_FIELD[rawFieldBucket];
      profession = NUM_TO_PROFESSION[rawProfession];
      industry = NUM_TO_INDUSTRY[rawIndustry];
      relationshipStatus = NUM_TO_RELATIONSHIP[rawRelationship];
      sexuality = NUM_TO_SEXUALITY[rawSexuality];
      ethnicity = NUM_TO_ETHNICITY[rawEthnicity];
      datingStyle = NUM_TO_DATING_STYLE[rawDatingStyle];
      children = NUM_TO_CHILDREN[rawChildren];
      wantsChildren = NUM_TO_WANTS_CHILDREN[rawWantsChildren];
      drinking = NUM_TO_DRINKING[rawDrinking];
      smoking = NUM_TO_SMOKING[rawSmoking];
      drugs = NUM_TO_DRUGS[rawDrugs];
      lookingFor = NUM_TO_LOOKING_FOR[rawLookingFor];
      religion = NUM_TO_RELIGION[rawReligion];
      pets = NUM_TO_PETS[rawPets];
      diet = NUM_TO_DIET[rawDiet];

      rawEnums = {
        gender: genderVal,
        relocate: rawRelocate,
        degree: rawDegree,
        fieldBucket: rawFieldBucket,
        profession: rawProfession,
        industry: rawIndustry,
        relationshipStatus: rawRelationship,
        sexuality: rawSexuality,
        ethnicity: rawEthnicity,
        datingStyle: rawDatingStyle,
        children: rawChildren,
        wantsChildren: rawWantsChildren,
        drinking: rawDrinking,
        smoking: rawSmoking,
        drugs: rawDrugs,
        lookingFor: rawLookingFor,
        religion: rawReligion,
        pets: rawPets,
        diet: rawDiet,
      };
    }
  }

  if (primaryName?.label) {
    name = primaryName.label;
    handle = `${primaryName.label}.heaven`;
  }

  // Fetch text records if we have a heaven name
  let avatarUrl: string | undefined;
  let bio: string | undefined;
  let location: string | undefined;
  let url: string | undefined;
  let twitter: string | undefined;
  let github: string | undefined;
  let telegram: string | undefined;
  let hobbies: string | undefined;
  let skills: string | undefined;
  let school: string | undefined;

  try {
    const node = await client.readContract({
      address: REGISTRY_V1,
      abi: registryAbi,
      functionName: 'primaryNode',
      args: [address],
    });

    if (node && node !== ZERO_HASH) {
      const readRecord = (key: string) =>
        client
          .readContract({
            address: RECORDS_V1,
            abi: recordsAbi,
            functionName: 'text',
            args: [node, key],
          })
          .catch(() => '');

      const [
        avatar, desc, loc, urlVal, tw, gh, tg, hob, sk, sch,
      ] = await Promise.all([
        readRecord('avatar'),
        readRecord('description'),
        readRecord('heaven.location'),
        readRecord('url'),
        readRecord('com.twitter'),
        readRecord('com.github'),
        readRecord('org.telegram'),
        readRecord('heaven.hobbies'),
        readRecord('heaven.skills'),
        readRecord('heaven.school'),
      ]);

      if (avatar) avatarUrl = resolveAvatarUri(avatar);
      bio = desc || undefined;
      location = loc || undefined;
      url = urlVal || undefined;
      twitter = tw || undefined;
      github = gh || undefined;
      telegram = tg || undefined;
      hobbies = hob || undefined;
      skills = sk || undefined;
      school = sch || undefined;
    }
  } catch {
    // Degrade gracefully
  }

  return {
    name,
    handle,
    avatarUrl,
    bio,
    location,
    nationalityCode,
    age,
    gender,
    genderLabel,
    heightCm,
    languages,
    school,
    degree,
    fieldBucket,
    profession,
    industry,
    relocate,
    relationshipStatus,
    sexuality,
    ethnicity,
    datingStyle,
    children,
    wantsChildren,
    lookingFor,
    hobbies,
    skills,
    drinking,
    smoking,
    drugs,
    religion,
    pets,
    diet,
    url,
    twitter,
    github,
    telegram,
    raw: rawEnums,
    ...followCounts,
  };
}

/**
 * Fetch follower + following counts from FollowV1 contract.
 */
export async function getFollowCounts(
  address: `0x${string}`,
): Promise<{ followerCount: number; followingCount: number }> {
  try {
    const client = getClient();
    const [followers, following] = await Promise.all([
      client.readContract({
        address: FOLLOW_V1,
        abi: followAbi,
        functionName: 'followerCount',
        args: [address],
      }),
      client.readContract({
        address: FOLLOW_V1,
        abi: followAbi,
        functionName: 'followingCount',
        args: [address],
      }),
    ]);
    return {
      followerCount: Number(followers),
      followingCount: Number(following),
    };
  } catch {
    return { followerCount: 0, followingCount: 0 };
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function resolveAvatarUri(uri: string): string | undefined {
  return resolveIpfsOrHttpUri(uri);
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
