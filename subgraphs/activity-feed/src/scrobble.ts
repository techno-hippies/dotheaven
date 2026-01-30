import { BigInt } from "@graphprotocol/graph-ts";
import {
  TrackRegistered as TrackRegisteredEvent,
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
  track.save();
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
