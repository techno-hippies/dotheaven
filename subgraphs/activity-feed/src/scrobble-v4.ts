import { BigInt } from "@graphprotocol/graph-ts";
import {
  ScrobbleV4,
  TrackRegistered as TrackRegisteredEvent,
  TrackCoverSet as TrackCoverSetEvent,
  Scrobbled as ScrobbledEvent,
  TrackUpdated as TrackUpdatedEvent,
} from "../generated/ScrobbleV4/ScrobbleV4";
import { Track, Scrobble } from "../generated/schema";

export function handleTrackRegisteredV4(event: TrackRegisteredEvent): void {
  let id = event.params.trackId.toHexString();

  let track = Track.load(id);
  if (!track) {
    track = new Track(id);
  }
  track.kind = event.params.kind;
  track.payload = event.params.payload;
  track.metaHash = event.params.metaHash;
  track.durationSec = event.params.durationSec.toI32();
  track.registeredAt = BigInt.fromI64(event.params.registeredAt.toI64());
  track.blockNumber = event.block.number;
  track.transactionHash = event.transaction.hash;

  // Read title/artist/album from contract state
  let contract = ScrobbleV4.bind(event.address);
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

export function handleTrackCoverSetV4(event: TrackCoverSetEvent): void {
  let id = event.params.trackId.toHexString();
  let track = Track.load(id);
  if (track) {
    track.coverCid = event.params.coverCid;
    track.save();
  }
}

export function handleScrobbledV4(event: ScrobbledEvent): void {
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
}

export function handleTrackUpdatedV4(event: TrackUpdatedEvent): void {
  let id = event.params.trackId.toHexString();
  let track = Track.load(id);
  if (!track) return;

  // Re-read title/artist/album from contract after metadata update
  let contract = ScrobbleV4.bind(event.address);
  let result = contract.try_getTrack(event.params.trackId);
  if (!result.reverted) {
    track.title = result.value.value0;
    track.artist = result.value.value1;
    track.album = result.value.value2;
    track.metaHash = event.params.metaHash;
    track.save();
  }
}
