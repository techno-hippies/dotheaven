import { BigInt } from "@graphprotocol/graph-ts";
import {
  PlaylistShared as PlaylistSharedEvent,
  PlaylistUnshared as PlaylistUnsharedEvent,
} from "../generated/PlaylistShareV1/PlaylistShareV1";
import { Playlist, PlaylistShare } from "../generated/schema";

export function handlePlaylistShared(event: PlaylistSharedEvent): void {
  let playlistId = event.params.playlistId.toHexString();
  let grantee = event.params.grantee.toHexString();
  let id = playlistId + "-" + grantee;

  // Defensive: share events should only be emitted for existing playlists.
  let playlist = Playlist.load(playlistId);
  if (playlist == null) return;

  let share = PlaylistShare.load(id);
  if (share == null) {
    share = new PlaylistShare(id);
    share.playlist = playlistId;
    share.playlistId = event.params.playlistId;
    share.owner = event.params.playlistOwner;
    share.grantee = event.params.grantee;
  }

  let sharedAt = BigInt.fromI64(event.params.sharedAt.toI64());

  share.granted = true;
  share.playlistVersion = event.params.playlistVersion.toI32();
  share.trackCount = event.params.trackCount.toI32();
  share.tracksHash = event.params.tracksHash;
  share.sharedAt = sharedAt;
  share.updatedAt = sharedAt;
  share.blockNumber = event.block.number;
  share.transactionHash = event.transaction.hash;
  share.save();
}

export function handlePlaylistUnshared(event: PlaylistUnsharedEvent): void {
  let playlistId = event.params.playlistId.toHexString();
  let grantee = event.params.grantee.toHexString();
  let id = playlistId + "-" + grantee;

  let playlist = Playlist.load(playlistId);
  if (playlist == null) return;

  let share = PlaylistShare.load(id);
  if (share == null) {
    share = new PlaylistShare(id);
    share.playlist = playlistId;
    share.playlistId = event.params.playlistId;
    share.owner = event.params.playlistOwner;
    share.grantee = event.params.grantee;
    share.sharedAt = BigInt.fromI64(event.params.unsharedAt.toI64());
  }

  let unsharedAt = BigInt.fromI64(event.params.unsharedAt.toI64());

  share.granted = false;
  share.playlistVersion = event.params.playlistVersion.toI32();
  share.trackCount = event.params.trackCount.toI32();
  share.tracksHash = event.params.tracksHash;
  share.updatedAt = unsharedAt;
  share.blockNumber = event.block.number;
  share.transactionHash = event.transaction.hash;
  share.save();
}
