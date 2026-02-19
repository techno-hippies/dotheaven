package com.pirate.app.music

data class MusicTrack(
  val id: String,
  val title: String,
  val artist: String,
  val album: String,
  val durationSec: Int,
  val uri: String,
  val filename: String,
  val artworkUri: String? = null,
  val artworkFallbackUri: String? = null,
  // Optional cloud-content metadata for encrypted playback.
  val contentId: String? = null,
  val pieceCid: String? = null,
  val datasetOwner: String? = null,
  val algo: Int? = null,
  // True permanence proof. Save Forever is only complete when permanentRef is set.
  val permanentRef: String? = null,
  val permanentGatewayUrl: String? = null,
  val permanentSavedAtMs: Long? = null,
  // Legacy local marker from pre-Arweave flow; not authoritative for permanence.
  val savedForever: Boolean = false,
)

data class LocalPlaylistTrack(
  val artist: String,
  val title: String,
  val album: String? = null,
  val durationSec: Int? = null,
  val uri: String? = null,
  val artworkUri: String? = null,
  val artworkFallbackUri: String? = null,
)

data class LocalPlaylist(
  val id: String,
  val name: String,
  val tracks: List<LocalPlaylistTrack>,
  val coverUri: String? = null,
  val createdAtMs: Long,
  val updatedAtMs: Long,
  val syncedPlaylistId: String? = null,
)

data class OnChainPlaylist(
  val id: String,
  val owner: String,
  val name: String,
  val coverCid: String,
  val visibility: Int,
  val trackCount: Int,
  val version: Int,
  val exists: Boolean,
  val tracksHash: String,
  val createdAtSec: Long,
  val updatedAtSec: Long,
)

data class PlaylistDisplayItem(
  val id: String,
  val name: String,
  val trackCount: Int,
  val coverUri: String?,
  val isLocal: Boolean,
)

data class PlaylistShareEntry(
  val id: String,
  val playlistId: String,
  val owner: String,
  val grantee: String,
  val granted: Boolean,
  val playlistVersion: Int,
  val trackCount: Int,
  val tracksHash: String,
  val sharedAtSec: Long,
  val updatedAtSec: Long,
  val playlist: OnChainPlaylist,
)

data class SharedCloudTrack(
  val contentId: String,
  val trackId: String,
  val owner: String,
  val pieceCid: String,
  val datasetOwner: String,
  val algo: Int,
  val updatedAtSec: Long,
  val title: String,
  val artist: String,
  val album: String,
  val coverCid: String? = null,
  val durationSec: Int = 0,
  val metaHash: String? = null,
)
