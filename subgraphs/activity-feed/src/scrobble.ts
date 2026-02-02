import { BigInt } from "@graphprotocol/graph-ts";
import {
  ScrobbleV3,
  TrackRegistered as TrackRegisteredEvent,
  TrackCoverSet as TrackCoverSetEvent,
  Scrobbled as ScrobbledEvent,
} from "../generated/ScrobbleV3/ScrobbleV3";
import { Track, Scrobble } from "../generated/schema";

export function handleTrackRegistered(event: TrackRegisteredEvent): void {
  let id = event.params.trackId.toHexString();

  let track = new Track(id);
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
  } else {
    track.title = result.value.value0;
    track.artist = result.value.value1;
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
}
