import { BigInt } from "@graphprotocol/graph-ts";
import {
  ProfileV2,
  ProfileUpserted as ProfileUpsertedEvent,
} from "../generated/ProfileV2/ProfileV2";
import { Profile } from "../generated/schema";

/**
 * Extract a single byte from a packed uint256 at the given byte offset.
 * packed enums: offset 0=gender, 1=relocate, 2=degree, ... 18=diet
 */
function getByte(packed: BigInt, offset: i32): i32 {
  let shift = (offset * 8) as u8;
  let mask = BigInt.fromI32(0xff);
  return packed.rightShift(shift).bitAnd(mask).toI32();
}

export function handleProfileUpserted(event: ProfileUpsertedEvent): void {
  let user = event.params.user;
  let id = user.toHexString();

  let contract = ProfileV2.bind(event.address);
  let result = contract.try_getProfile(user);
  if (result.reverted) return;

  let data = result.value;
  if (!data.exists) return;

  let existing = Profile.load(id);
  let profile: Profile;
  if (existing == null) {
    profile = new Profile(id);
    profile.createdAt = event.block.timestamp;
  } else {
    profile = existing;
  }

  profile.profileVersion = data.profileVersion;
  profile.age = data.age;
  profile.heightCm = data.heightCm;
  profile.nationality = data.nationality;
  profile.languagesPacked = data.languagesPacked;
  profile.friendsOpenToMask = data.friendsOpenToMask;
  profile.locationCityId = data.locationCityId;
  profile.schoolId = data.schoolId;
  profile.skillsCommit = data.skillsCommit;
  profile.hobbiesCommit = data.hobbiesCommit;
  profile.nameHash = data.nameHash;
  profile.displayName = data.displayName;
  profile.photoURI = data.photoURI;

  // Unpack enums from packed uint256
  let packed = data.packed;
  profile.gender = getByte(packed, 0);
  profile.relocate = getByte(packed, 1);
  profile.degree = getByte(packed, 2);
  profile.fieldBucket = getByte(packed, 3);
  profile.profession = getByte(packed, 4);
  profile.industry = getByte(packed, 5);
  profile.relationshipStatus = getByte(packed, 6);
  profile.sexuality = getByte(packed, 7);
  profile.ethnicity = getByte(packed, 8);
  profile.datingStyle = getByte(packed, 9);
  profile.children = getByte(packed, 10);
  profile.wantsChildren = getByte(packed, 11);
  profile.drinking = getByte(packed, 12);
  profile.smoking = getByte(packed, 13);
  profile.drugs = getByte(packed, 14);
  profile.lookingFor = getByte(packed, 15);
  profile.religion = getByte(packed, 16);
  profile.pets = getByte(packed, 17);
  profile.diet = getByte(packed, 18);

  profile.updatedAt = event.block.timestamp;
  profile.blockNumber = event.block.number;
  profile.transactionHash = event.transaction.hash;

  profile.save();
}
