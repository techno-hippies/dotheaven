import { BigInt } from "@graphprotocol/graph-ts";
import {
  ScrobbleId as ScrobbleIdEvent,
  ScrobbleMeta as ScrobbleMetaEvent,
} from "../generated/ScrobbleV2/ScrobbleV2";
import { Scrobble, ScrobbleMetaEntry } from "../generated/schema";

export function handleScrobbleId(event: ScrobbleIdEvent): void {
  let id =
    event.transaction.hash.toHexString() +
    "-" +
    event.logIndex.toString();

  let item = new Scrobble(id);
  item.user = event.params.user;
  item.scrobbleId = event.params.scrobbleId;
  item.identifier = event.params.id;
  item.kind = event.params.kind;
  item.timestamp = BigInt.fromI64(event.params.timestamp.toI64());
  item.blockNumber = event.block.number;
  item.blockTimestamp = event.block.timestamp;
  item.transactionHash = event.transaction.hash;
  item.save();
}

export function handleScrobbleMeta(event: ScrobbleMetaEvent): void {
  let id =
    event.transaction.hash.toHexString() +
    "-" +
    event.logIndex.toString();

  let item = new ScrobbleMetaEntry(id);
  item.user = event.params.user;
  item.scrobbleId = event.params.scrobbleId;
  item.metaHash = event.params.metaHash;
  item.timestamp = BigInt.fromI64(event.params.timestamp.toI64());
  item.blockNumber = event.block.number;
  item.blockTimestamp = event.block.timestamp;
  item.transactionHash = event.transaction.hash;
  item.save();
}
