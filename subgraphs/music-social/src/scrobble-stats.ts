import { Address, BigInt } from "@graphprotocol/graph-ts";
import { UserArtistStats, UserListeningStats } from "../generated/schema";

const ONE = BigInt.fromI32(1);
const ZERO = BigInt.fromI32(0);

function userId(user: Address): string {
  return user.toHexString().toLowerCase();
}

function normalizedArtistKey(artist: string): string {
  if (artist.length == 0) {
    return "unknown";
  }
  return artist.toLowerCase();
}

export function applyUserScrobbleStats(
  user: Address,
  artist: string,
  scrobbleTimestamp: BigInt,
  blockNumber: BigInt,
): void {
  let userKey = userId(user);

  let listening = UserListeningStats.load(userKey);
  if (listening == null) {
    listening = new UserListeningStats(userKey);
    listening.user = user;
    listening.totalScrobbles = ZERO;
    listening.lastScrobbleAt = scrobbleTimestamp;
    listening.topArtist = "";
    listening.topArtistScrobbleCount = ZERO;
  }
  listening.totalScrobbles = listening.totalScrobbles.plus(ONE);
  if (scrobbleTimestamp.ge(listening.lastScrobbleAt)) {
    listening.lastScrobbleAt = scrobbleTimestamp;
  }
  listening.updatedAtBlock = blockNumber;

  let artistKey = normalizedArtistKey(artist);
  let artistId = userKey + "-" + artistKey;
  let artistStats = UserArtistStats.load(artistId);
  if (artistStats == null) {
    artistStats = new UserArtistStats(artistId);
    artistStats.user = user;
    artistStats.artistKey = artistKey;
    artistStats.artist = artist.length > 0 ? artist : "Unknown Artist";
    artistStats.scrobbleCount = ZERO;
    artistStats.lastScrobbleAt = scrobbleTimestamp;
  }
  artistStats.scrobbleCount = artistStats.scrobbleCount.plus(ONE);
  if (artist.length > 0) {
    artistStats.artist = artist;
  }
  if (scrobbleTimestamp.ge(artistStats.lastScrobbleAt)) {
    artistStats.lastScrobbleAt = scrobbleTimestamp;
  }
  artistStats.updatedAtBlock = blockNumber;
  artistStats.save();

  if (
    artistStats.scrobbleCount.gt(listening.topArtistScrobbleCount) ||
    listening.topArtist.length == 0
  ) {
    listening.topArtist = artistStats.artist;
    listening.topArtistScrobbleCount = artistStats.scrobbleCount;
  }

  listening.save();
}
