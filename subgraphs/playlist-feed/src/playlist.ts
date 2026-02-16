import { BigInt, store } from "@graphprotocol/graph-ts";
import {
  PlaylistCreated as PlaylistCreatedEvent,
  PlaylistTracksSet as PlaylistTracksSetEvent,
  PlaylistMetaUpdated as PlaylistMetaUpdatedEvent,
  PlaylistDeleted as PlaylistDeletedEvent,
} from "../generated/PlaylistV1/PlaylistV1";
import { Playlist, PlaylistTrack, PlaylistTrackVersion } from "../generated/schema";

export function handlePlaylistCreated(event: PlaylistCreatedEvent): void {
  let id = event.params.playlistId.toHexString();

  let playlist = new Playlist(id);
  playlist.owner = event.params.playlistOwner;
  playlist.name = event.params.name;
  playlist.coverCid = event.params.coverCid;
  playlist.visibility = event.params.visibility;
  playlist.trackCount = event.params.trackCount.toI32();
  playlist.version = event.params.version.toI32();
  playlist.exists = true;
  playlist.tracksHash = event.params.tracksHash;
  playlist.createdAt = BigInt.fromI64(event.params.createdAt.toI64());
  playlist.updatedAt = BigInt.fromI64(event.params.createdAt.toI64());
  playlist.blockNumber = event.block.number;
  playlist.transactionHash = event.transaction.hash;
  playlist.save();

  // Note: tracks are set by the accompanying PlaylistTracksSet event
  // emitted in the same tx — no need to handle here.
}

export function handlePlaylistTracksSet(event: PlaylistTracksSetEvent): void {
  let playlistId = event.params.playlistId.toHexString();

  let playlist = Playlist.load(playlistId);
  if (playlist == null) return;

  // Remove old track entries (full replace)
  let oldCount = playlist.trackCount;
  for (let i = 0; i < oldCount; i++) {
    let trackEntityId = playlistId + "-" + i.toString();
    store.remove("PlaylistTrack", trackEntityId);
  }

  // Write new track entries
  let trackIds = event.params.trackIds;
  for (let i = 0; i < trackIds.length; i++) {
    let trackEntityId = playlistId + "-" + i.toString();
    let pt = new PlaylistTrack(trackEntityId);
    pt.playlist = playlistId;
    pt.trackId = trackIds[i];
    pt.position = i;
    pt.save();
  }

  // Write versioned snapshot track entries (immutable)
  let version = event.params.version.toI32();
  let tracksHash = event.params.tracksHash;
  let updatedAt = BigInt.fromI64(event.params.updatedAt.toI64());
  let playlistBytes = event.params.playlistId;

  for (let i = 0; i < trackIds.length; i++) {
    let snapshotId = playlistId + "-v" + version.toString() + "-" + i.toString();
    let pv = new PlaylistTrackVersion(snapshotId);
    pv.playlist = playlistId;
    pv.playlistId = playlistBytes;
    pv.version = version;
    pv.tracksHash = tracksHash;
    pv.trackId = trackIds[i];
    pv.position = i;
    pv.updatedAt = updatedAt;
    pv.blockNumber = event.block.number;
    pv.transactionHash = event.transaction.hash;
    pv.save();
  }

  // Update playlist header
  playlist.trackCount = event.params.trackCount.toI32();
  playlist.version = event.params.version.toI32();
  playlist.tracksHash = event.params.tracksHash;
  playlist.updatedAt = BigInt.fromI64(event.params.updatedAt.toI64());
  playlist.blockNumber = event.block.number;
  playlist.transactionHash = event.transaction.hash;
  playlist.save();
}

export function handlePlaylistMetaUpdated(event: PlaylistMetaUpdatedEvent): void {
  let playlistId = event.params.playlistId.toHexString();

  let playlist = Playlist.load(playlistId);
  if (playlist == null) return;

  playlist.name = event.params.name;
  playlist.coverCid = event.params.coverCid;
  playlist.visibility = event.params.visibility;
  playlist.version = event.params.version.toI32();
  playlist.updatedAt = BigInt.fromI64(event.params.updatedAt.toI64());
  playlist.blockNumber = event.block.number;
  playlist.transactionHash = event.transaction.hash;
  playlist.save();
}

export function handlePlaylistDeleted(event: PlaylistDeletedEvent): void {
  let playlistId = event.params.playlistId.toHexString();

  let playlist = Playlist.load(playlistId);
  if (playlist == null) return;

  playlist.exists = false;
  playlist.version = event.params.version.toI32();
  playlist.updatedAt = BigInt.fromI64(event.params.updatedAt.toI64());
  playlist.blockNumber = event.block.number;
  playlist.transactionHash = event.transaction.hash;
  playlist.save();
}
