package com.pirate.app.music

import android.content.Context
import android.net.Uri
import com.pirate.app.BuildConfig
import kotlinx.coroutines.delay
import org.json.JSONObject
import java.util.UUID

/**
 * Song publish flow via api-core:
 * 1) Stage audio upload to Load
 * 2) Stage supporting artifacts to Load (cover + lyrics)
 * 3) Run preflight checks
 * 4) Finalize on Tempo (ScrobbleV4 + ContentRegistry)
 */
object SongPublishService {

  private const val TAG = "SongPublish"
  val API_CORE_URL: String
    get() = BuildConfig.API_CORE_URL.trim().trimEnd('/')
  // Backward-compatible alias for existing callers during API core migration.
  val HEAVEN_API_URL: String
    get() = API_CORE_URL
  private const val MAX_AUDIO_BYTES = 50 * 1024 * 1024 // Matches backend /api/music/publish/start limit.
  private const val PREFLIGHT_MAX_RETRIES = 3
  private const val PREFLIGHT_RETRY_DELAY_MS = 2_000L
  private const val RECENT_COVERS_DIR = "recent_release_covers"
  private const val MAX_COVER_BYTES = 10 * 1024 * 1024
  private const val MAX_LYRICS_BYTES = 256 * 1024

  data class SongFormData(
    val title: String = "",
    val artist: String = "",
    val genre: String = "pop",
    val primaryLanguage: String = "en",
    val secondaryLanguage: String = "",
    val lyrics: String = "",
    val coverUri: Uri? = null,
    val audioUri: Uri? = null,
    val vocalsUri: Uri? = null,
    val instrumentalUri: Uri? = null,
    val canvasUri: Uri? = null,
    val license: String = "non-commercial", // "non-commercial" | "commercial-use" | "commercial-remix"
    val revShare: Int = 0,
    val mintingFee: String = "0",
    val attestation: Boolean = false,
  )

  data class PublishResult(
    val jobId: String,
    val status: String,
    val stagedAudioId: String?,
    val stagedAudioUrl: String?,
    val audioSha256: String,
    val coverCid: String? = null,
  )

  suspend fun publish(
    context: Context,
    formData: SongFormData,
    ownerAddress: String,
    onProgress: (Int) -> Unit,
  ): PublishResult {
    val userPkp = songPublishNormalizeUserPkp(ownerAddress)
    if (formData.title.isBlank()) throw IllegalStateException("Song title is required")
    if (formData.artist.isBlank()) throw IllegalStateException("Artist is required")
    if (formData.lyrics.isBlank()) throw IllegalStateException("Lyrics are required")

    onProgress(2)

    val audioUri = formData.audioUri ?: throw IllegalStateException("Audio file is required")
    val coverUri = formData.coverUri ?: throw IllegalStateException("Cover image is required")

    val audioBytes = songPublishReadUriWithMaxBytes(context, audioUri, MAX_AUDIO_BYTES)
    val coverBytes = songPublishReadCoverUriWithMaxBytes(context, coverUri, MAX_COVER_BYTES)

    val detectedAudioMime = songPublishGetMimeType(context, audioUri)
    val audioMime = if (detectedAudioMime.startsWith("audio/")) detectedAudioMime else "audio/mpeg"
    val detectedCoverMime = songPublishGetMimeType(context, coverUri)
    val coverMime = if (detectedCoverMime.startsWith("image/")) detectedCoverMime else "image/jpeg"
    val audioSha256 = songPublishSha256Hex(audioBytes)
    val lyricsBytes = formData.lyrics.toByteArray(Charsets.UTF_8)
    if (lyricsBytes.size > MAX_LYRICS_BYTES) {
      throw IllegalStateException("Lyrics exceed 256KB limit (${lyricsBytes.size} bytes)")
    }

    onProgress(15)

    val idempotencyKey = "music-android-${UUID.randomUUID()}"
    val startResponse = songPublishStageAudioForMusicPublish(
      audioBytes = audioBytes,
      audioMime = audioMime,
      audioSha256 = audioSha256,
      userPkp = userPkp,
      idempotencyKey = idempotencyKey,
    )
    if (startResponse.status !in 200..299) {
      throw IllegalStateException(songPublishErrorMessageFromApi("Audio staging upload", startResponse))
    }

    val startJob = songPublishRequireJobObject("Audio staging upload", startResponse)
    val jobId = startJob.optString("jobId", "").trim()
    if (jobId.isBlank()) throw IllegalStateException("Audio staging upload failed: missing jobId")

    onProgress(35)

    val artifactsResponse = songPublishStageArtifactsForMusicPublish(
      jobId = jobId,
      userPkp = userPkp,
      coverBytes = coverBytes,
      coverMime = coverMime,
      lyricsText = formData.lyrics,
    )
    if (artifactsResponse.status !in 200..299) {
      if (artifactsResponse.status == 404) {
        throw IllegalStateException(
          "Artifact staging endpoint not found. Backend is outdated; deploy latest api-core.",
        )
      }
      throw IllegalStateException(songPublishErrorMessageFromApi("Artifact staging", artifactsResponse))
    }
    val artifactsJob = songPublishRequireJobObject("Artifact staging", artifactsResponse)
    var stagedCoverGatewayUrl = songPublishExtractStagedCoverGatewayUrl(artifactsJob)

    onProgress(50)

    var preflightResponse: SongPublishApiResponse? = null
    for (attempt in 1..PREFLIGHT_MAX_RETRIES) {
      val preflightBody = JSONObject().apply {
        put("jobId", jobId)
        put("publishType", "original")
        put("fingerprint", "sha256:$audioSha256")
      }
      val response = songPublishPostJsonToMusicApi(
        path = "/api/music/preflight",
        userPkp = userPkp,
        body = preflightBody,
      )
      val policyReasonCode = response.json
        ?.optJSONObject("job")
        ?.optJSONObject("policy")
        ?.optString("reasonCode", "")
        ?.trim()
        .orEmpty()
      val retryable = response.status == 502 && (
        policyReasonCode == "hash_verification_unavailable" ||
          response.json?.optString("error", "")
            ?.lowercase()
            ?.contains("hash verification unavailable") == true
        )
      if (!retryable || attempt == PREFLIGHT_MAX_RETRIES) {
        preflightResponse = response
        break
      }
      delay(PREFLIGHT_RETRY_DELAY_MS)
    }

    val finalPreflight = preflightResponse ?: throw IllegalStateException("Preflight checks failed unexpectedly")
    if (finalPreflight.status !in 200..299) {
      throw IllegalStateException(songPublishErrorMessageFromApi("Preflight checks", finalPreflight))
    }
    val preflightJob = songPublishRequireJobObject("Preflight checks", finalPreflight)
    val preflightStatus = preflightJob.optString("status", "").trim()
    if (preflightStatus != "policy_passed") {
      val reason = preflightJob
        .optJSONObject("policy")
        ?.optString("reason", "")
        ?.trim()
        .orEmpty()
      val reasonCode = preflightJob
        .optJSONObject("policy")
        ?.optString("reasonCode", "")
        ?.trim()
        .orEmpty()
      throw IllegalStateException(
        "Upload policy did not pass (status=$preflightStatus${if (reasonCode.isNotBlank()) ", reasonCode=$reasonCode" else ""}${if (reason.isNotBlank()) ", reason=$reason" else ""})",
      )
    }

    val stagedAudioId = songPublishExtractDataitemId(preflightJob)
    val stagedAudioUrl = preflightJob
      .optJSONObject("upload")
      ?.optString("stagedGatewayUrl", "")
      ?.trim()
      ?.ifBlank { null }
    if (stagedCoverGatewayUrl.isNullOrBlank()) {
      stagedCoverGatewayUrl = songPublishExtractStagedCoverGatewayUrl(preflightJob)
    }
    if (stagedCoverGatewayUrl.isNullOrBlank()) {
      throw IllegalStateException("Artifact staging succeeded but staged cover URL is missing")
    }

    onProgress(88)

    val finalizeResponse = songPublishFinalizeMusicPublish(
      jobId = jobId,
      userPkp = userPkp,
      title = formData.title,
      artist = formData.artist,
      album = "",
    )
    if (finalizeResponse.status !in 200..299) {
      if (finalizeResponse.status == 404) {
        throw IllegalStateException(
          "Finalize endpoint not found. Backend is outdated; deploy latest api-core.",
        )
      }
      throw IllegalStateException(songPublishErrorMessageFromApi("Tempo finalize", finalizeResponse))
    }
    val finalizeJob = songPublishRequireJobObject("Tempo finalize", finalizeResponse)
    val finalizedStatus = finalizeJob.optString("status", "").trim()
    if (finalizedStatus != "registered") {
      throw IllegalStateException("Tempo finalize did not complete (status=$finalizedStatus)")
    }

    onProgress(100)

    val cachedCoverRef = songPublishCacheRecentCoverRef(
      context = context,
      coverUri = coverUri,
      audioSha256 = audioSha256,
      recentCoversDir = RECENT_COVERS_DIR,
      maxCoverBytes = MAX_COVER_BYTES,
    )

    val canonicalCoverRef = stagedCoverGatewayUrl

    val result = PublishResult(
      jobId = jobId,
      status = finalizedStatus,
      stagedAudioId = stagedAudioId,
      stagedAudioUrl = stagedAudioUrl,
      audioSha256 = audioSha256,
      coverCid = canonicalCoverRef,
    )

    runCatching {
      RecentlyPublishedSongsStore.record(
        context = context,
        title = formData.title,
        artist = formData.artist,
        audioCid = result.stagedAudioUrl ?: result.stagedAudioId,
        coverCid = result.coverCid,
      )
    }.onFailure { err ->
      android.util.Log.w(TAG, "Failed to cache recently published song", err)
    }

    return result
  }
}
