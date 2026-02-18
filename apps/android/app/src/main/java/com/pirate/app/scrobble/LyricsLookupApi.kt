package com.pirate.app.scrobble

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.math.abs

object LyricsLookupApi {
  private const val LRCLIB_BASE_URL = "https://lrclib.net/"
  private const val USER_AGENT = "heaven-android/0.1"
  private const val MIN_SEARCH_SCORE = 120

  private val client =
    OkHttpClient.Builder()
      .connectTimeout(12, TimeUnit.SECONDS)
      .readTimeout(12, TimeUnit.SECONDS)
      .build()

  data class LyricsResult(
    val source: String,
    val lrclibId: Long?,
    val plainLyrics: String?,
    val syncedLyrics: String?,
    val fetchedAtEpochSec: Long,
  ) {
    fun hasAnyLyrics(): Boolean = !plainLyrics.isNullOrBlank() || !syncedLyrics.isNullOrBlank()
  }

  suspend fun fetchLyrics(
    title: String,
    artist: String,
    album: String? = null,
    durationSec: Int? = null,
  ): LyricsResult? =
    withContext(Dispatchers.IO) {
      val safeTitle = title.trim()
      val safeArtist = artist.trim()
      val safeAlbum = album?.trim().orEmpty()
      val safeDuration = durationSec?.coerceAtLeast(0)?.takeIf { it > 0 }
      if (safeTitle.isBlank() || safeArtist.isBlank()) return@withContext null

      if (safeDuration != null) {
        fetchBySignature(
          endpoint = "get-cached",
          title = safeTitle,
          artist = safeArtist,
          album = safeAlbum,
          durationSec = safeDuration,
        )?.let { return@withContext it }
        fetchBySignature(
          endpoint = "get",
          title = safeTitle,
          artist = safeArtist,
          album = safeAlbum,
          durationSec = safeDuration,
        )?.let { return@withContext it }
      }

      fetchBySearch(
        title = safeTitle,
        artist = safeArtist,
        album = safeAlbum,
        durationSec = safeDuration,
      )
    }

  fun buildLyricsPayloadJson(
    trackId: String,
    trackName: String,
    artistName: String,
    albumName: String?,
    durationSec: Int?,
    result: LyricsResult,
  ): String {
    val payload =
      JSONObject()
        .put("trackId", trackId.trim())
        .put("trackName", trackName.trim())
        .put("artistName", artistName.trim())
        .put("albumName", albumName?.trim()?.ifBlank { null } ?: JSONObject.NULL)
        .put("durationSec", durationSec?.coerceAtLeast(0) ?: JSONObject.NULL)
        .put("source", result.source)
        .put("lrclibId", result.lrclibId ?: JSONObject.NULL)
        .put("fetchedAt", result.fetchedAtEpochSec)
        .put("plainLyrics", result.plainLyrics ?: JSONObject.NULL)
        .put("syncedLyrics", result.syncedLyrics ?: JSONObject.NULL)
    return payload.toString()
  }

  private fun fetchBySignature(
    endpoint: String,
    title: String,
    artist: String,
    album: String,
    durationSec: Int,
  ): LyricsResult? {
    val url =
      buildUrl(
        endpoint = endpoint,
        title = title,
        artist = artist,
        album = album,
        durationSec = durationSec,
      )
    val json = requestJsonObject(url) ?: return null
    return parseRecord(json)
  }

  private fun fetchBySearch(
    title: String,
    artist: String,
    album: String,
    durationSec: Int?,
  ): LyricsResult? {
    val url =
      buildUrl(
        endpoint = "search",
        title = title,
        artist = artist,
        album = album,
        durationSec = null,
      )
    val arr = requestJsonArray(url) ?: return null
    var bestScore = Int.MIN_VALUE
    var best: LyricsResult? = null
    for (i in 0 until arr.length()) {
      val row = arr.optJSONObject(i) ?: continue
      val parsed = parseRecord(row) ?: continue
      val score = scoreCandidate(row, title, artist, album, durationSec)
      if (score > bestScore) {
        bestScore = score
        best = parsed
      }
    }
    if (bestScore < MIN_SEARCH_SCORE) return null
    return best
  }

  private fun buildUrl(
    endpoint: String,
    title: String,
    artist: String,
    album: String,
    durationSec: Int?,
  ): HttpUrl {
    val base = LRCLIB_BASE_URL.toHttpUrlOrNull()
      ?: throw IllegalStateException("Invalid LRCLIB base URL")
    val builder =
      base.newBuilder()
        .addPathSegment("api")
        .addPathSegment(endpoint)
        .addQueryParameter("track_name", title)
        .addQueryParameter("artist_name", artist)
    if (album.isNotBlank()) builder.addQueryParameter("album_name", album)
    if (durationSec != null && durationSec > 0) {
      builder.addQueryParameter("duration", durationSec.toString())
    }
    return builder.build()
  }

  private fun requestJsonObject(url: HttpUrl): JSONObject? {
    val request =
      Request.Builder()
        .url(url)
        .get()
        .header("User-Agent", USER_AGENT)
        .build()
    client.newCall(request).execute().use { response ->
      val body = response.body?.string().orEmpty()
      if (response.code == 404) return null
      if (!response.isSuccessful) {
        throw IllegalStateException("LRCLIB request failed (${response.code}): ${body.trim()}")
      }
      return runCatching { JSONObject(body) }.getOrNull()
    }
  }

  private fun requestJsonArray(url: HttpUrl): JSONArray? {
    val request =
      Request.Builder()
        .url(url)
        .get()
        .header("User-Agent", USER_AGENT)
        .build()
    client.newCall(request).execute().use { response ->
      val body = response.body?.string().orEmpty()
      if (response.code == 404) return null
      if (!response.isSuccessful) {
        throw IllegalStateException("LRCLIB request failed (${response.code}): ${body.trim()}")
      }
      return runCatching { JSONArray(body) }.getOrNull()
    }
  }

  private fun parseRecord(row: JSONObject): LyricsResult? {
    val plain = row.optString("plainLyrics", "").trim().ifBlank { null }
    val synced = row.optString("syncedLyrics", "").trim().ifBlank { null }
    if (plain.isNullOrBlank() && synced.isNullOrBlank()) return null

    val id = row.optLong("id", -1L).takeIf { it >= 0L }
    return LyricsResult(
      source = "lrclib",
      lrclibId = id,
      plainLyrics = plain,
      syncedLyrics = synced,
      fetchedAtEpochSec = System.currentTimeMillis() / 1000L,
    )
  }

  private fun scoreCandidate(
    row: JSONObject,
    title: String,
    artist: String,
    album: String,
    durationSec: Int?,
  ): Int {
    val rowTitle = normalizeText(row.optString("trackName", ""))
    val rowArtist = normalizeText(row.optString("artistName", ""))
    val rowAlbum = normalizeText(row.optString("albumName", ""))
    val targetTitle = normalizeText(title)
    val targetArtist = normalizeText(artist)
    val targetAlbum = normalizeText(album)
    var score = 0

    if (rowTitle == targetTitle) {
      score += 100
    } else if (rowTitle.contains(targetTitle) || targetTitle.contains(rowTitle)) {
      score += 45
    }

    if (rowArtist == targetArtist) {
      score += 85
    } else if (rowArtist.contains(targetArtist) || targetArtist.contains(rowArtist)) {
      score += 35
    }

    if (targetAlbum.isNotBlank() && rowAlbum.isNotBlank()) {
      if (rowAlbum == targetAlbum) {
        score += 40
      } else if (rowAlbum.contains(targetAlbum) || targetAlbum.contains(rowAlbum)) {
        score += 15
      }
    }

    if (durationSec != null && durationSec > 0) {
      val rowDuration = row.optInt("duration", 0).takeIf { it > 0 }
      if (rowDuration != null) {
        val diff = abs(rowDuration - durationSec)
        score +=
          when {
            diff <= 2 -> 20
            diff <= 5 -> 10
            diff <= 10 -> 5
            else -> -20
          }
      }
    }

    return score
  }

  private fun normalizeText(value: String): String =
    value.trim().lowercase().split(Regex("\\s+")).filter { it.isNotBlank() }.joinToString(" ")
}
