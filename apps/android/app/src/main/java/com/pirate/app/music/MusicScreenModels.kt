package com.pirate.app.music

internal enum class MusicView { Home, Library, Shared, SharedPlaylistDetail, Playlists, PlaylistDetail, Search }

internal data class AlbumCardModel(
  val title: String,
  val artist: String,
  val audioRef: String? = null,
  val coverRef: String? = null,
)

internal const val HOME_NEW_RELEASES_MAX = 12
internal const val SHARED_REFRESH_TTL_MS = 120_000L
internal const val TURBO_CREDITS_COPY = "Save this song forever on Arweave for ~\$0.03."

internal fun mergedNewReleases(
  recentPublished: List<AlbumCardModel>,
): List<AlbumCardModel> {
  if (recentPublished.isEmpty()) return emptyList()
  val out = ArrayList<AlbumCardModel>(recentPublished.size)
  val seen = LinkedHashSet<String>()

  fun add(item: AlbumCardModel) {
    val key = "${item.title.trim().lowercase()}|${item.artist.trim().lowercase()}"
    if (key == "|") return
    if (!seen.add(key)) return
    out.add(item)
  }

  for (item in recentPublished) add(item)
  return out.take(HOME_NEW_RELEASES_MAX)
}
