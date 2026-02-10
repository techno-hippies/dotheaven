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
  'function getProfile(address user) external view returns (uint8 profileVersion, string displayName, bytes32 nameHash, uint8 age, uint8 heightCm, bytes2 nationality, uint256 languagesPacked, uint8 friendsOpenToMask, bytes32 locationCityId, bytes32 schoolId, bytes32 skillsCommit, bytes32 hobbiesCommit, string photoURI, uint8 gender, uint8 relocate, uint8 degree, uint8 fieldBucket, uint8 profession, uint8 industry, uint8 relationshipStatus, uint8 sexuality, uint8 ethnicity, uint8 datingStyle, uint8 children, uint8 wantsChildren, uint8 drinking, uint8 smoking, uint8 drugs, uint8 lookingFor, uint8 religion, uint8 pets, uint8 diet)',
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
    const [
      , // profileVersion
      displayName,
      , // nameHash
      ageVal,
      heightCmVal,
      nationality,
      languagesPacked,
      , // friendsOpenToMask
      , // locationCityId
      , // schoolId
      , // skillsCommit
      , // hobbiesCommit
      , // photoURI
      genderVal,
      relocateVal,
      degreeVal,
      fieldBucketVal,
      professionVal,
      industryVal,
      relationshipStatusVal,
      sexualityVal,
      ethnicityVal,
      datingStyleVal,
      childrenVal,
      wantsChildrenVal,
      drinkingVal,
      smokingVal,
      drugsVal,
      lookingForVal,
      religionVal,
      petsVal,
      dietVal,
    ] = profileResult;

    if (displayName) name = displayName;
    if (ageVal > 0) age = ageVal;
    if (heightCmVal > 0) heightCm = heightCmVal;

    gender = toGenderAbbr(genderVal);
    genderLabel = NUM_TO_GENDER_LABEL[genderVal];

    const natHex = typeof nationality === 'string' ? nationality : `0x${Number(nationality).toString(16).padStart(4, '0')}`;
    nationalityCode = bytes2ToCode(natHex);

    // Decode languages
    const langEntries = unpackLanguages(languagesPacked);
    if (langEntries.length > 0) languages = langEntries;

    // Decode all enum fields (0 = unset, skip)
    relocate = NUM_TO_RELOCATE[relocateVal];
    degree = NUM_TO_DEGREE[degreeVal];
    fieldBucket = NUM_TO_FIELD[fieldBucketVal];
    profession = NUM_TO_PROFESSION[professionVal];
    industry = NUM_TO_INDUSTRY[industryVal];
    relationshipStatus = NUM_TO_RELATIONSHIP[relationshipStatusVal];
    sexuality = NUM_TO_SEXUALITY[sexualityVal];
    ethnicity = NUM_TO_ETHNICITY[ethnicityVal];
    datingStyle = NUM_TO_DATING_STYLE[datingStyleVal];
    children = NUM_TO_CHILDREN[childrenVal];
    wantsChildren = NUM_TO_WANTS_CHILDREN[wantsChildrenVal];
    drinking = NUM_TO_DRINKING[drinkingVal];
    smoking = NUM_TO_SMOKING[smokingVal];
    drugs = NUM_TO_DRUGS[drugsVal];
    lookingFor = NUM_TO_LOOKING_FOR[lookingForVal];
    religion = NUM_TO_RELIGION[religionVal];
    pets = NUM_TO_PETS[petsVal];
    diet = NUM_TO_DIET[dietVal];
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
