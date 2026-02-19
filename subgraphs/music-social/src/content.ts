import { BigInt } from "@graphprotocol/graph-ts";
import {
  ContentRegistered as ContentRegisteredEvent,
  AccessGranted as AccessGrantedEvent,
  AccessRevoked as AccessRevokedEvent,
  ContentDeactivated as ContentDeactivatedEvent,
  ContentRegistry,
} from "../generated/ContentRegistry/ContentRegistry";
import { ContentEntry, AccessGrant } from "../generated/schema";

export function handleContentRegistered(event: ContentRegisteredEvent): void {
  let id = event.params.contentId.toHexString();

  let entry = new ContentEntry(id);
  entry.trackId = event.params.trackId;
  entry.owner = event.params.owner;
  entry.datasetOwner = event.params.datasetOwner;
  entry.pieceCid = event.params.pieceCid;

  // Read algo from contract (not in event)
  let contract = ContentRegistry.bind(event.address);
  let contentResult = contract.try_getContent(event.params.contentId);
  if (!contentResult.reverted) {
    entry.algo = contentResult.value.getAlgo();
  } else {
    entry.algo = 0;
  }

  entry.active = true;
  entry.createdAt = event.block.timestamp;
  entry.blockNumber = event.block.number;
  entry.transactionHash = event.transaction.hash;
  entry.save();
}

export function handleAccessGranted(event: AccessGrantedEvent): void {
  let contentId = event.params.contentId.toHexString();
  let grantee = event.params.grantee.toHexString();
  let id = contentId + "-" + grantee;

  let grant = AccessGrant.load(id);
  if (grant == null) {
    grant = new AccessGrant(id);
    grant.content = contentId;
    grant.grantee = event.params.grantee;
  }
  grant.granted = true;
  grant.updatedAt = event.block.timestamp;
  grant.blockNumber = event.block.number;
  grant.save();
}

export function handleAccessRevoked(event: AccessRevokedEvent): void {
  let contentId = event.params.contentId.toHexString();
  let grantee = event.params.grantee.toHexString();
  let id = contentId + "-" + grantee;

  let grant = AccessGrant.load(id);
  if (grant == null) {
    grant = new AccessGrant(id);
    grant.content = contentId;
    grant.grantee = event.params.grantee;
  }
  grant.granted = false;
  grant.updatedAt = event.block.timestamp;
  grant.blockNumber = event.block.number;
  grant.save();
}

export function handleContentDeactivated(event: ContentDeactivatedEvent): void {
  let id = event.params.contentId.toHexString();

  let entry = ContentEntry.load(id);
  if (entry == null) return;

  entry.active = false;
  entry.blockNumber = event.block.number;
  entry.transactionHash = event.transaction.hash;
  entry.save();
}
