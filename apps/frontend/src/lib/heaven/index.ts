export {
  checkNameAvailable,
  getNamePrice,
  registerHeavenName,
  getTextRecord,
  getAddr,
  computeNode,
  REGISTRY_V1,
  RECORDS_V1,
  HEAVEN_NODE,
  getPrimaryName,
  getPrimaryNode,
  type RegisterResult,
} from './registry'

export {
  uploadAvatar,
  type AvatarUploadResult,
} from './avatar'

export {
  resolveAvatarUri,
  resolveIpfsUri,
  getEnsProfile,
  resolveEnsName,
  verifyNftOwnership,
  parseNftRef,
} from './avatar-resolver'

export {
  getProfile,
  setProfile,
  type ProfileInput,
  type SetProfileResult,
} from './profile'

export {
  setTextRecord,
  setTextRecords,
  type SetTextRecordResult,
} from './records'

export {
  fetchScrobbleEntries,
  scrobblesToTracks,
  type ScrobbleEntry,
} from './scrobbles'

export {
  getVerificationStatus,
  buildSelfVerifyLink,
  syncVerificationToMegaEth,
  type VerificationStatus,
  type MirrorResult,
} from './verification'

export {
  fetchPosts,
  timeAgo,
  type FeedPostEntry,
} from './posts'

export {
  fetchUserPlaylists,
  fetchPlaylist,
  fetchPlaylistTracks,
  resolvePlaylistTracks,
  getUserNonce,
  type OnChainPlaylist,
  type OnChainPlaylistTrack,
} from './playlists'

export {
  getLinkedEoa,
} from './linked-eoa'
