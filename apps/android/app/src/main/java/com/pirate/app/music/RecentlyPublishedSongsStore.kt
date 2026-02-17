package com.pirate.app.music

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

data class RecentlyPublishedSongEntry(
  val title: String,
  val artist: String,
  val audioCid: String?,
  val coverCid: String?,
  val publishedAtMs: Long,
)

object RecentlyPublishedSongsStore {
  private const val CACHE_FILENAME = "pirate_recently_published_songs.json"
  private const val MAX_ENTRIES = 20

  suspend fun load(context: Context): List<RecentlyPublishedSongEntry> = withContext(Dispatchers.IO) {
    loadInternal(context)
  }

  suspend fun record(
    context: Context,
    title: String,
    artist: String,
    audioCid: String?,
    coverCid: String?,
    publishedAtMs: Long = System.currentTimeMillis(),
  ): List<RecentlyPublishedSongEntry> = withContext(Dispatchers.IO) {
    val safeTitle = title.trim().ifBlank { "Untitled" }
    val safeArtist = artist.trim().ifBlank { "Unknown Artist" }
    val normalizedAudioCid = audioCid?.trim()?.ifBlank { null }
    val normalizedCoverCid = coverCid?.trim()?.ifBlank { null }

    val next = ArrayList<RecentlyPublishedSongEntry>(MAX_ENTRIES)
    next.add(
      RecentlyPublishedSongEntry(
        title = safeTitle,
        artist = safeArtist,
        audioCid = normalizedAudioCid,
        coverCid = normalizedCoverCid,
        publishedAtMs = publishedAtMs,
      ),
    )

    for (entry in loadInternal(context)) {
      if (isSameSong(entry, safeTitle, safeArtist)) continue
      next.add(entry)
      if (next.size >= MAX_ENTRIES) break
    }

    write(context, next)
    next
  }

  private fun file(context: Context): File {
    return File(context.filesDir, CACHE_FILENAME)
  }

  private fun loadInternal(context: Context): List<RecentlyPublishedSongEntry> {
    val cacheFile = file(context)
    if (!cacheFile.exists()) return emptyList()

    val raw = runCatching { cacheFile.readText() }.getOrNull()?.trim().orEmpty()
    if (raw.isBlank()) return emptyList()

    return runCatching {
      val arr = JSONArray(raw)
      val out = ArrayList<RecentlyPublishedSongEntry>(arr.length())
      for (i in 0 until arr.length()) {
        val obj = arr.optJSONObject(i) ?: continue
        val title = obj.optString("title", "").trim().ifBlank { "Untitled" }
        val artist = obj.optString("artist", "").trim().ifBlank { "Unknown Artist" }
        val publishedAtMs = obj.optLong("publishedAtMs", 0L)
        out.add(
          RecentlyPublishedSongEntry(
            title = title,
            artist = artist,
            audioCid = obj.optString("audioCid", "").trim().ifBlank { null },
            coverCid = obj.optString("coverCid", "").trim().ifBlank { null },
            publishedAtMs = publishedAtMs,
          ),
        )
      }
      out
        .sortedByDescending { it.publishedAtMs }
        .take(MAX_ENTRIES)
    }.getOrElse { emptyList() }
  }

  private fun write(context: Context, entries: List<RecentlyPublishedSongEntry>) {
    val arr = JSONArray()
    for (entry in entries) {
      arr.put(
        JSONObject()
          .put("title", entry.title)
          .put("artist", entry.artist)
          .put("audioCid", entry.audioCid ?: JSONObject.NULL)
          .put("coverCid", entry.coverCid ?: JSONObject.NULL)
          .put("publishedAtMs", entry.publishedAtMs),
      )
    }

    val cacheFile = file(context)
    runCatching { cacheFile.writeText(arr.toString()) }
  }

  private fun isSameSong(
    entry: RecentlyPublishedSongEntry,
    title: String,
    artist: String,
  ): Boolean {
    return entry.title.trim().lowercase() == title.trim().lowercase() &&
      entry.artist.trim().lowercase() == artist.trim().lowercase()
  }
}
