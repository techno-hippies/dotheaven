package com.pirate.app.scrobble

import android.content.Context
import android.net.Uri
import android.util.Log
import com.pirate.app.arweave.ArweaveUploadApi
import com.pirate.app.music.CoverRef
import com.pirate.app.music.PendingMediaSyncStore
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoPasskeyManager
import java.io.File
import java.io.InputStream
import java.net.URL
import java.net.URLConnection

private const val TAG = "PirateScrobble"
private const val MAX_SOURCE_COVER_BYTES = 10 * 1024 * 1024

internal class ScrobbleMediaSyncer(
  private val appContext: Context,
) {
  suspend fun syncTrackMediaBestEffort(
    account: TempoPasskeyManager.PasskeyAccount,
    sessionKey: SessionKeyManager.SessionKey,
    trackId: String,
    scrobble: ReadyScrobble,
  ) {
    val pending = runCatching { PendingMediaSyncStore.get(appContext, trackId) }.getOrNull()

    val coverSyncSupported =
      runCatching { TempoScrobbleApi.contractSupportsSetTrackCoverFor() }
        .onFailure { err -> Log.w(TAG, "Scrobble cover sync support check failed: ${err.message}") }
        .getOrDefault(false)
    if (!coverSyncSupported) {
      Log.d(TAG, "Scrobble cover sync unavailable for current ScrobbleV4")
    } else {
      val existingCoverRef =
        runCatching { TempoScrobbleApi.getTrackCoverRef(trackId) }
          .onFailure { err -> Log.w(TAG, "Scrobble cover read failed trackId=$trackId err=${err.message}") }
          .getOrNull()
      if (!existingCoverRef.isNullOrBlank()) {
        runCatching { PendingMediaSyncStore.markCoverSynced(appContext, trackId) }
        Log.d(TAG, "Scrobble cover already on-chain trackId=$trackId ref=$existingCoverRef")
      } else {
        var coverRef = pending?.coverRef
        if (coverRef.isNullOrBlank()) {
          coverRef = resolveCanonicalCoverRef(scrobble.artworkUri)
          if (coverRef.isNullOrBlank()) {
            coverRef = resolveCanonicalCoverRef(scrobble.artworkFallbackUri)
          }
          if (coverRef.isNullOrBlank()) {
            coverRef =
              uploadCoverFromArtwork(
                sessionKey = sessionKey,
                primaryArtwork = scrobble.artworkUri,
                fallbackArtwork = scrobble.artworkFallbackUri,
              )
          }
          if (!coverRef.isNullOrBlank()) {
            runCatching {
              PendingMediaSyncStore.upsertRefs(
                context = appContext,
                trackId = trackId,
                coverRef = coverRef,
              )
            }
          }
        }

        if (!coverRef.isNullOrBlank()) {
          runCatching {
            TempoScrobbleApi.ensureTrackCoverSynced(
              account = account,
              sessionKey = sessionKey,
              trackId = trackId,
              coverRef = coverRef,
            )
          }.onSuccess {
            runCatching { PendingMediaSyncStore.markCoverSynced(appContext, trackId) }
            Log.d(TAG, "Scrobble cover sync ok trackId=$trackId ref=$it")
          }.onFailure { err ->
            Log.w(TAG, "Scrobble cover sync skipped/failed trackId=$trackId err=${err.message}")
          }
        }
      }
    }

    val lyricsSyncSupported =
      runCatching { TempoScrobbleApi.contractSupportsSetTrackLyricsFor() }
        .onFailure { err -> Log.w(TAG, "Scrobble lyrics sync support check failed: ${err.message}") }
        .getOrDefault(false)
    if (!lyricsSyncSupported) {
      Log.d(TAG, "Scrobble lyrics sync unavailable for current ScrobbleV4")
      return
    }

    val existingLyricsRef =
      runCatching { TempoScrobbleApi.getTrackLyricsRef(trackId) }
        .onFailure { err -> Log.w(TAG, "Scrobble lyrics read failed trackId=$trackId err=${err.message}") }
        .getOrNull()
    if (!existingLyricsRef.isNullOrBlank()) {
      runCatching { PendingMediaSyncStore.markLyricsSynced(appContext, trackId) }
      Log.d(TAG, "Scrobble lyrics already on-chain trackId=$trackId ref=$existingLyricsRef")
      return
    }

    var lyricsRef = pending?.lyricsRef
    if (lyricsRef.isNullOrBlank()) {
      lyricsRef =
        uploadLyricsForTrack(
          sessionKey = sessionKey,
          trackId = trackId,
          scrobble = scrobble,
        )
      if (!lyricsRef.isNullOrBlank()) {
        runCatching {
          PendingMediaSyncStore.upsertRefs(
            context = appContext,
            trackId = trackId,
            lyricsRef = lyricsRef,
          )
        }
      }
    }

    if (!lyricsRef.isNullOrBlank()) {
      runCatching {
        TempoScrobbleApi.ensureTrackLyricsSynced(
          account = account,
          sessionKey = sessionKey,
          trackId = trackId,
          lyricsRef = lyricsRef,
        )
      }.onSuccess {
        runCatching { PendingMediaSyncStore.markLyricsSynced(appContext, trackId) }
        Log.d(TAG, "Scrobble lyrics sync ok trackId=$trackId ref=$it")
      }.onFailure { err ->
        Log.w(TAG, "Scrobble lyrics sync skipped/failed trackId=$trackId err=${err.message}")
      }
    }
  }

  private suspend fun uploadLyricsForTrack(
    sessionKey: SessionKeyManager.SessionKey,
    trackId: String,
    scrobble: ReadyScrobble,
  ): String? {
    val durationSec = scrobble.durationMs?.div(1000L)?.toInt()?.takeIf { it > 0 }
    val lookup =
      runCatching {
        LyricsLookupApi.fetchLyrics(
          title = scrobble.title,
          artist = scrobble.artist,
          album = scrobble.album,
          durationSec = durationSec,
        )
      }.onFailure { err ->
        Log.w(TAG, "Scrobble lyrics lookup failed trackId=$trackId err=${err.message}")
      }.getOrNull()

    if (lookup == null || !lookup.hasAnyLyrics()) {
      Log.d(TAG, "Scrobble lyrics lookup empty trackId=$trackId")
      return null
    }

    val payload =
      LyricsLookupApi.buildLyricsPayloadJson(
        trackId = trackId,
        trackName = scrobble.title,
        artistName = scrobble.artist,
        albumName = scrobble.album,
        durationSec = durationSec,
        result = lookup,
      )

    val uploaded =
      runCatching {
        val ownerAddress = sessionKey.ownerAddress
          ?: throw IllegalStateException("Session key owner address missing for lyrics upload")
        ArweaveUploadApi.uploadLyrics(
          context = appContext,
          ownerEthAddress = ownerAddress,
          trackId = trackId,
          lyricsJson = payload,
        )
      }.onFailure { err ->
        Log.w(TAG, "Scrobble lyrics upload failed trackId=$trackId err=${err.message}")
      }.getOrNull()
    return uploaded?.arRef
  }

  private suspend fun uploadCoverFromArtwork(
    sessionKey: SessionKeyManager.SessionKey,
    primaryArtwork: String?,
    fallbackArtwork: String?,
  ): String? {
    val candidates =
      listOfNotNull(primaryArtwork?.trim(), fallbackArtwork?.trim())
        .filter { it.isNotBlank() }
        .distinct()
    for (candidate in candidates) {
      val payload = runCatching { readCoverPayload(candidate) }.getOrNull() ?: continue
      val uploaded =
        runCatching {
          val ownerAddress = sessionKey.ownerAddress
            ?: throw IllegalStateException("Session key owner address missing for cover upload")
          ArweaveUploadApi.uploadCover(
            context = appContext,
            ownerEthAddress = ownerAddress,
            coverBytes = payload.bytes,
            filename = payload.filename,
            contentType = payload.contentType,
          )
        }.getOrNull()
      if (uploaded != null) return uploaded.arRef
    }
    return null
  }

  private data class CoverPayload(
    val bytes: ByteArray,
    val filename: String,
    val contentType: String,
  )

  private fun readCoverPayload(rawUri: String): CoverPayload {
    val uri = Uri.parse(rawUri)
    val scheme = uri.scheme?.trim()?.lowercase().orEmpty()
    val filename = resolveFilename(uri)
    val contentType = resolveContentType(uri, fallbackFilename = filename)
    val resolvedRemoteUrl =
      when {
        scheme == "http" || scheme == "https" -> rawUri
        else ->
          CoverRef.resolveCoverUrl(rawUri)
            ?.takeIf { it.startsWith("http://") || it.startsWith("https://") }
      }

    val bytes =
      when {
        !resolvedRemoteUrl.isNullOrBlank() -> {
          URL(resolvedRemoteUrl).openStream().use { readStreamWithLimit(it, MAX_SOURCE_COVER_BYTES) }
        }
        scheme == "content" || scheme == "file" || scheme == "android.resource" || scheme.isBlank() -> {
          val input = appContext.contentResolver.openInputStream(uri)
            ?: if (rawUri.startsWith("/")) File(rawUri).inputStream() else null
          input?.use { readStreamWithLimit(it, MAX_SOURCE_COVER_BYTES) }
            ?: throw IllegalStateException("Cannot read artwork URI: $rawUri")
        }
        else -> throw IllegalStateException("Unsupported artwork URI scheme: $scheme")
      }

    return CoverPayload(
      bytes = bytes,
      filename = filename,
      contentType = contentType,
    )
  }

  private fun resolveFilename(uri: Uri): String {
    val fromPath = uri.lastPathSegment?.substringAfterLast('/')?.trim().orEmpty()
    if (fromPath.isNotBlank()) return fromPath
    return "cover.jpg"
  }

  private fun resolveContentType(
    uri: Uri,
    fallbackFilename: String,
  ): String {
    val fromResolver = appContext.contentResolver.getType(uri)?.trim().orEmpty()
    if (fromResolver.startsWith("image/")) return fromResolver
    val guessed = URLConnection.guessContentTypeFromName(fallbackFilename)?.trim().orEmpty()
    if (guessed.startsWith("image/")) return guessed
    return "image/jpeg"
  }

  private fun readStreamWithLimit(
    input: InputStream,
    maxBytes: Int,
  ): ByteArray {
    val out = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    var total = 0
    while (true) {
      val read = input.read(buffer)
      if (read <= 0) break
      total += read
      if (total > maxBytes) {
        throw IllegalStateException("Artwork exceeds max bytes ($total > $maxBytes)")
      }
      out.write(buffer, 0, read)
    }
    if (total == 0) throw IllegalStateException("Artwork payload is empty")
    return out.toByteArray()
  }

  private fun resolveCanonicalCoverRef(raw: String?): String? {
    val value = raw?.trim().orEmpty()
    if (value.isBlank()) return null
    if (value.startsWith("ar://")) {
      val id = value.removePrefix("ar://").trim()
      return if (id.isBlank()) null else "ar://$id"
    }
    if (value.startsWith("http://") || value.startsWith("https://")) {
      val uri = Uri.parse(value)
      val host = uri.host?.trim()?.lowercase().orEmpty()
      if (host == "arweave.net") {
        val id = uri.pathSegments.firstOrNull()?.trim().orEmpty()
        if (id.isNotBlank()) return "ar://$id"
      }
    }
    return null
  }
}
