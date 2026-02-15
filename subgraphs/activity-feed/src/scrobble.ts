import { BigInt } from "@graphprotocol/graph-ts";
import {
  ScrobbleV3,
  TrackRegistered as TrackRegisteredEvent,
  TrackCoverSet as TrackCoverSetEvent,
  Scrobbled as ScrobbledEvent,
} from "../generated/ScrobbleV3/ScrobbleV3";
import { Scrobble, Track, UserVerification } from "../generated/schema";

export function handleTrackRegistered(event: TrackRegisteredEvent): void {
  let id = event.params.trackId.toHexString();

  let track = Track.load(id);
  let isNew = track == null;
  if (!track) {
    track = new Track(id);
  }
  if (isNew) {
    track.scrobbleCountTotal = BigInt.fromI32(0);
    track.scrobbleCountVerified = BigInt.fromI32(0);
  }
  track.kind = event.params.kind;
  track.payload = event.params.payload;
  track.metaHash = event.params.metaHash;
  track.registeredAt = BigInt.fromI64(event.params.registeredAt.toI64());
  track.blockNumber = event.block.number;
  track.transactionHash = event.transaction.hash;

  // Read title/artist from contract state
  let contract = ScrobbleV3.bind(event.address);
  let result = contract.try_getTrack(event.params.trackId);
  if (result.reverted) {
    track.title = "";
    track.artist = "";
    track.album = "";
  } else {
    track.title = result.value.value0;
    track.artist = result.value.value1;
    track.album = result.value.value2;
  }

  track.save();
}

export function handleTrackCoverSet(event: TrackCoverSetEvent): void {
  let id = event.params.trackId.toHexString();
  let track = Track.load(id);
  if (track) {
    track.coverCid = event.params.coverCid;
    track.save();
  }
}

export function handleScrobbled(event: ScrobbledEvent): void {
  let id =
    event.transaction.hash.toHexString() +
    "-" +
    event.logIndex.toString();

  let scrobble = new Scrobble(id);
  scrobble.user = event.params.user;
  scrobble.track = event.params.trackId.toHexString();
  scrobble.timestamp = BigInt.fromI64(event.params.timestamp.toI64());
  scrobble.blockNumber = event.block.number;
  scrobble.blockTimestamp = event.block.timestamp;
  scrobble.transactionHash = event.transaction.hash;
  scrobble.save();

  let track = Track.load(event.params.trackId.toHexString());
  if (track) {
    track.scrobbleCountTotal = track.scrobbleCountTotal.plus(BigInt.fromI32(1));

    let userId = event.params.user.toHexString();
    let verification = UserVerification.load(userId);
    if (verification) {
      track.scrobbleCountVerified = track.scrobbleCountVerified.plus(
        BigInt.fromI32(1),
      );
    }

    track.save();
  }
}
