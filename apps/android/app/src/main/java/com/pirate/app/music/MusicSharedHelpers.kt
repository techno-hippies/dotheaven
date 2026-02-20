package com.pirate.app.music

import android.content.Context

private const val SHARED_SEEN_PREFS = "pirate_music_shared_seen"
private const val SHARED_SEEN_KEY_PREFIX = "seen_v1_"

internal fun sharedPlaylistCoverUrl(coverCid: String?): String? {
  return CoverRef.resolveCoverUrl(coverCid, width = 140, height = 140, format = "webp", quality = 80)
}

internal fun sharedCloudTrackToRowTrack(track: SharedCloudTrack): MusicTrack {
  return MusicTrack(
    id = track.contentId.ifBlank { track.trackId },
    title = track.title,
    artist = track.artist,
    album = track.album,
    durationSec = track.durationSec,
    uri = "",
    filename = "",
    artworkUri = sharedPlaylistCoverUrl(track.coverCid),
    contentId = track.contentId,
    pieceCid = track.pieceCid,
    datasetOwner = track.datasetOwner,
    algo = track.algo,
  )
}

private fun sharedItemIdForPlaylist(share: PlaylistShareEntry): String {
  return "pl:${share.id.trim().lowercase()}"
}

private fun sharedItemIdForTrack(track: SharedCloudTrack): String {
  val stable = track.contentId.ifBlank { track.trackId }.trim().lowercase()
  return "tr:$stable"
}

internal fun computeSharedItemIds(
  playlists: List<PlaylistShareEntry>,
  tracks: List<SharedCloudTrack>,
): Set<String> {
  val out = LinkedHashSet<String>(playlists.size + tracks.size)
  for (playlist in playlists) out.add(sharedItemIdForPlaylist(playlist))
  for (track in tracks) out.add(sharedItemIdForTrack(track))
  return out
}

private fun sharedSeenStorageKey(ownerEthAddress: String?): String? {
  val owner = ownerEthAddress?.trim()?.lowercase().orEmpty()
  if (owner.isBlank()) return null
  return SHARED_SEEN_KEY_PREFIX + owner
}

internal fun loadSeenSharedItemIds(context: Context, ownerEthAddress: String?): Set<String> {
  val key = sharedSeenStorageKey(ownerEthAddress) ?: return emptySet()
  val prefs = context.getSharedPreferences(SHARED_SEEN_PREFS, Context.MODE_PRIVATE)
  val raw = prefs.getString(key, "").orEmpty()
  if (raw.isBlank()) return emptySet()
  return raw
    .split('|')
    .map { it.trim() }
    .filter { it.isNotBlank() }
    .toSet()
}

internal fun saveSeenSharedItemIds(
  context: Context,
  ownerEthAddress: String?,
  ids: Set<String>,
) {
  val key = sharedSeenStorageKey(ownerEthAddress) ?: return
  val payload = ids.joinToString("|")
  context.getSharedPreferences(SHARED_SEEN_PREFS, Context.MODE_PRIVATE)
    .edit()
    .putString(key, payload)
    .apply()
}
