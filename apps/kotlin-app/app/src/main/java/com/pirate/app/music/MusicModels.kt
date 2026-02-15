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
  // "Save Forever" is a local preference; upload/register can exist without being marked permanent.
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
