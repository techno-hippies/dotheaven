import { BigInt } from "@graphprotocol/graph-ts";
import { ScrobbleBatch as ScrobbleBatchEvent } from "../generated/ScrobbleV1/ScrobbleV1";
import { ScrobbleBatch } from "../generated/schema";

export function handleScrobbleBatch(event: ScrobbleBatchEvent): void {
  let id = event.transaction.hash.toHexString();

  let item = new ScrobbleBatch(id);
  item.user = event.params.user;
  item.startTs = BigInt.fromI64(event.params.startTs.toI64());
  item.endTs = BigInt.fromI64(event.params.endTs.toI64());
  item.count = event.params.count.toI32();
  item.cid = event.params.cid;
  item.batchHash = event.params.batchHash;
  item.blockNumber = event.block.number;
  item.blockTimestamp = event.block.timestamp;
  item.transactionHash = event.transaction.hash;
  item.save();
}
