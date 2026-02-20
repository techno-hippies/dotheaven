package com.pirate.app.song

import com.pirate.app.music.SongPublishService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

data class SongStats(
  val trackId: String,
  val title: String,
  val artist: String,
  val album: String,
  val coverCid: String?,
  val scrobbleCountTotal: Long,
  val scrobbleCountVerified: Long,
  val durationSec: Int = 0,
  val registeredAtSec: Long,
)

data class SongListenerRow(
  val userAddress: String,
  val scrobbleCount: Int,
  val lastScrobbleAtSec: Long,
)

data class SongScrobbleRow(
  val userAddress: String,
  val playedAtSec: Long,
)

data class ArtistTrackRow(
  val trackId: String,
  val title: String,
  val artist: String,
  val album: String,
  val coverCid: String?,
  val scrobbleCountTotal: Long,
  val scrobbleCountVerified: Long,
)

data class ArtistListenerRow(
  val userAddress: String,
  val scrobbleCount: Long,
  val lastScrobbleAtSec: Long,
)

data class ArtistScrobbleRow(
  val userAddress: String,
  val trackId: String,
  val title: String,
  val playedAtSec: Long,
)

data class StudySetStatus(
  val ready: Boolean,
  val studySetRef: String?,
  val studySetHash: String?,
  val errorCode: String?,
  val error: String?,
)

data class StudySetGenerateResult(
  val success: Boolean,
  val cached: Boolean,
  val studySetRef: String?,
  val studySetHash: String?,
  val errorCode: String?,
  val error: String?,
)

object SongArtistApi {
  suspend fun fetchSongStats(trackId: String): SongStats? =
    withContext(Dispatchers.IO) {
      val normalizedTrackId = normalizeBytes32(trackId) ?: return@withContext null

      var sawSuccessfulEmpty = false
      var lastError: Throwable? = null
      for (subgraphUrl in musicSocialSubgraphUrls()) {
        try {
          val row = fetchSongStatsFromSubgraph(subgraphUrl, normalizedTrackId)
          if (row != null) return@withContext row
          sawSuccessfulEmpty = true
        } catch (error: Throwable) {
          lastError = error
        }
      }

      fetchSongStatsFromChain(normalizedTrackId)?.let { return@withContext it }

      if (sawSuccessfulEmpty) return@withContext null
      if (lastError != null && isSubgraphAvailabilityError(lastError)) return@withContext null
      if (lastError != null) throw lastError
      null
    }

  suspend fun fetchSongTopListeners(trackId: String, maxEntries: Int = 20): List<SongListenerRow> =
    withContext(Dispatchers.IO) {
      val normalizedTrackId = normalizeBytes32(trackId) ?: return@withContext emptyList()
      val first = maxEntries.coerceIn(1, 100)

      var sawSuccessfulEmpty = false
      var lastError: Throwable? = null
      for (subgraphUrl in musicSocialSubgraphUrls()) {
        try {
          val rows = fetchSongTopListenersFromSubgraph(subgraphUrl, normalizedTrackId, first)
          if (rows.isNotEmpty()) return@withContext rows
          sawSuccessfulEmpty = true
        } catch (error: Throwable) {
          lastError = error
        }
      }

      if (sawSuccessfulEmpty) return@withContext emptyList()
      if (lastError != null && isSubgraphAvailabilityError(lastError)) return@withContext emptyList()
      if (lastError != null) throw lastError
      emptyList()
    }

  suspend fun fetchSongRecentScrobbles(trackId: String, maxEntries: Int = 40): List<SongScrobbleRow> =
    withContext(Dispatchers.IO) {
      val normalizedTrackId = normalizeBytes32(trackId) ?: return@withContext emptyList()
      val first = maxEntries.coerceIn(1, 200)

      var sawSuccessfulEmpty = false
      var lastError: Throwable? = null
      for (subgraphUrl in musicSocialSubgraphUrls()) {
        try {
          val rows = fetchSongRecentScrobblesFromSubgraph(subgraphUrl, normalizedTrackId, first)
          if (rows.isNotEmpty()) return@withContext rows
          sawSuccessfulEmpty = true
        } catch (error: Throwable) {
          lastError = error
        }
      }

      if (sawSuccessfulEmpty) return@withContext emptyList()
      if (lastError != null && isSubgraphAvailabilityError(lastError)) return@withContext emptyList()
      if (lastError != null) throw lastError
      emptyList()
    }

  suspend fun fetchArtistTopTracks(artistName: String, maxEntries: Int = 50): List<ArtistTrackRow> =
    withContext(Dispatchers.IO) {
      val artist = artistName.trim()
      if (artist.isBlank()) return@withContext emptyList()
      val first = maxEntries.coerceIn(1, 200)

      var sawSuccessfulEmpty = false
      var lastError: Throwable? = null
      for (subgraphUrl in musicSocialSubgraphUrls()) {
        try {
          val rows = fetchArtistTopTracksFromSubgraph(subgraphUrl, artist, first)
          if (rows.isNotEmpty()) return@withContext rows
          sawSuccessfulEmpty = true
        } catch (error: Throwable) {
          lastError = error
        }
      }

      if (lastError != null) {
        val fallback = fetchArtistTopTracksFromChain(artist, first)
        if (fallback.isNotEmpty()) return@withContext fallback
      }

      if (sawSuccessfulEmpty) return@withContext emptyList()
      if (lastError != null && isSubgraphAvailabilityError(lastError)) return@withContext emptyList()
      if (lastError != null) throw lastError
      emptyList()
    }

  suspend fun fetchArtistTopListeners(artistName: String, maxEntries: Int = 20): List<ArtistListenerRow> =
    withContext(Dispatchers.IO) {
      val artist = artistName.trim()
      if (artist.isBlank()) return@withContext emptyList()
      val first = maxEntries.coerceIn(1, 100)

      var sawSuccessfulEmpty = false
      var lastError: Throwable? = null
      for (subgraphUrl in musicSocialSubgraphUrls()) {
        try {
          val rows = fetchArtistTopListenersFromSubgraph(subgraphUrl, artist, first)
          if (rows.isNotEmpty()) return@withContext rows
          sawSuccessfulEmpty = true
        } catch (error: Throwable) {
          lastError = error
        }
      }

      if (sawSuccessfulEmpty) return@withContext emptyList()
      if (lastError != null && isSubgraphAvailabilityError(lastError)) return@withContext emptyList()
      if (lastError != null) throw lastError
      emptyList()
    }

  suspend fun fetchArtistRecentScrobbles(artistName: String, maxEntries: Int = 40): List<ArtistScrobbleRow> =
    withContext(Dispatchers.IO) {
      val artist = artistName.trim()
      if (artist.isBlank()) return@withContext emptyList()
      val first = maxEntries.coerceIn(1, 200)

      var sawSuccessfulEmpty = false
      var lastError: Throwable? = null
      for (subgraphUrl in musicSocialSubgraphUrls()) {
        try {
          val rows = fetchArtistRecentScrobblesFromSubgraph(subgraphUrl, artist, first)
          if (rows.isNotEmpty()) return@withContext rows
          sawSuccessfulEmpty = true
        } catch (error: Throwable) {
          lastError = error
        }
      }

      if (sawSuccessfulEmpty) return@withContext emptyList()
      if (lastError != null && isSubgraphAvailabilityError(lastError)) return@withContext emptyList()
      if (lastError != null) throw lastError
      emptyList()
    }

  suspend fun fetchLatestTracksFromChain(maxEntries: Int = 100): List<SongStats> =
    withContext(Dispatchers.IO) {
      val first = maxEntries.coerceIn(1, 200)
      val trackIds = fetchRecentRegisteredTrackIdsFromChain(first)
      if (trackIds.isEmpty()) return@withContext emptyList()
      val meta = fetchTrackMetaFromChain(trackIds)
      if (meta.isEmpty()) return@withContext emptyList()
      meta.values
        .sortedByDescending { it.registeredAtSec }
        .take(first)
        .map {
          SongStats(
            trackId = it.trackId,
            title = it.title.ifBlank { it.trackId.take(14) },
            artist = it.artist.ifBlank { "Unknown Artist" },
            album = it.album,
            coverCid = it.coverCid,
            scrobbleCountTotal = 0L,
            scrobbleCountVerified = 0L,
            registeredAtSec = it.registeredAtSec,
          )
        }
    }

  suspend fun fetchStudySetStatus(trackId: String, language: String): StudySetStatus =
    withContext(Dispatchers.IO) {
      val normalizedTrackId =
        normalizeBytes32(trackId)
          ?: return@withContext StudySetStatus(
            ready = false,
            studySetRef = null,
            studySetHash = null,
            errorCode = "invalid_track_id",
            error = "trackId must be bytes32",
          )

      val lang = language.trim().ifBlank { "en" }
      val url = "${SongPublishService.HEAVEN_API_URL}/api/study-sets/$normalizedTrackId?lang=${encodeUrlComponent(lang)}&v=1"
      val req = Request.Builder().url(url).get().build()

      songArtistClient.newCall(req).execute().use { res ->
        val text = res.body?.string().orEmpty()
        val json = runCatching { JSONObject(text) }.getOrNull()

        if (res.isSuccessful && json?.optBoolean("success") == true) {
          val registry = json.optJSONObject("registry")
          return@withContext StudySetStatus(
            ready = true,
            studySetRef = registry?.optString("studySetRef")?.ifBlank { null },
            studySetHash = registry?.optString("studySetHash")?.ifBlank { null },
            errorCode = null,
            error = null,
          )
        }

        return@withContext StudySetStatus(
          ready = false,
          studySetRef = null,
          studySetHash = null,
          errorCode = json?.optString("code")?.ifBlank { null },
          error = json?.optString("error")?.ifBlank { "HTTP ${res.code}" },
        )
      }
    }

  suspend fun generateStudySet(
    trackId: String,
    language: String,
    userAddress: String,
  ): StudySetGenerateResult =
    withContext(Dispatchers.IO) {
      val normalizedTrackId =
        normalizeBytes32(trackId)
          ?: return@withContext StudySetGenerateResult(
            success = false,
            cached = false,
            studySetRef = null,
            studySetHash = null,
            errorCode = "invalid_track_id",
            error = "trackId must be bytes32",
          )

      val normalizedUserAddress =
        normalizeAddress(userAddress)
          ?: return@withContext StudySetGenerateResult(
            success = false,
            cached = false,
            studySetRef = null,
            studySetHash = null,
            errorCode = "invalid_user_address",
            error = "userAddress must be 0x + 40 hex",
          )

      val body =
        JSONObject().apply {
          put("trackId", normalizedTrackId)
          put("language", language.trim().ifBlank { "en" })
          put("version", 1)
        }

      val req =
        Request.Builder()
          .url("${SongPublishService.HEAVEN_API_URL}/api/study-sets/generate")
          .post(body.toString().toRequestBody(songArtistJsonMediaType))
          .header("Content-Type", "application/json")
          .header("X-User-Address", normalizedUserAddress)
          .build()

      songArtistClient.newCall(req).execute().use { res ->
        val text = res.body?.string().orEmpty()
        val json = runCatching { JSONObject(text) }.getOrNull()

        val success = json?.optBoolean("success") == true
        val cached = json?.optBoolean("cached") == true
        val registry = json?.optJSONObject("registry")
        val studySetRef = registry?.optString("studySetRef")?.ifBlank { null }
        val studySetHash = registry?.optString("studySetHash")?.ifBlank { null }

        return@withContext StudySetGenerateResult(
          success = success,
          cached = cached,
          studySetRef = studySetRef,
          studySetHash = studySetHash,
          errorCode = if (success) null else json?.optString("code")?.ifBlank { null },
          error = if (success) null else json?.optString("error")?.ifBlank { "HTTP ${res.code}" },
        )
      }
    }
}
