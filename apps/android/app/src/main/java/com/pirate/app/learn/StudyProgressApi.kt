package com.pirate.app.learn

import com.pirate.app.BuildConfig
import com.pirate.app.util.HttpClients
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

private const val DEFAULT_STUDY_PROGRESS_SUBGRAPH =
  "https://graph.dotheaven.org/subgraphs/name/dotheaven/study-progress-tempo"
private const val DEBUG_DEFAULT_STUDY_PROGRESS_SUBGRAPH_EMULATOR =
  "http://10.0.2.2:8000/subgraphs/name/dotheaven/study-progress-tempo"
private const val DEBUG_DEFAULT_STUDY_PROGRESS_SUBGRAPH_REVERSE =
  "http://127.0.0.1:8000/subgraphs/name/dotheaven/study-progress-tempo"

private val ADDRESS_REGEX = Regex("^0x[a-fA-F0-9]{40}$")
private val BYTES32_REGEX = Regex("^0x[a-fA-F0-9]{64}$")

data class UserStudySetSummary(
  val id: String,
  val studySetKey: String,
  val totalAttempts: Int,
  val uniqueQuestionsTouched: Int,
  val correctAttempts: Int,
  val incorrectAttempts: Int,
  val averageScore: Double,
  val latestBlockTimestampSec: Long,
)

data class StudyAttemptRow(
  val questionId: String,
  val rating: Int,
  val score: Int,
  val canonicalOrder: Long,
  val blockTimestampSec: Long,
  val clientTimestampSec: Long,
)

data class StudySetAnchorRow(
  val trackId: String,
  val version: Int,
  val studySetRef: String,
)

data class UserStudySetDetail(
  val summary: UserStudySetSummary,
  val attempts: List<StudyAttemptRow>,
  val anchor: StudySetAnchorRow?,
)

object StudyProgressApi {
  private val client = HttpClients.Api
  private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

  suspend fun fetchUserStudySetSummaries(userAddress: String, maxEntries: Int = 30): List<UserStudySetSummary> =
    withContext(Dispatchers.IO) {
      val normalizedUser = normalizeAddress(userAddress)
        ?: throw IllegalArgumentException("Invalid user address: $userAddress")
      val first = maxEntries.coerceIn(1, 100)
      var sawSuccessfulEmpty = false
      var lastError: Throwable? = null

      for (subgraphUrl in studyProgressSubgraphUrls()) {
        try {
          val rows = fetchUserStudySetSummariesFromSubgraph(subgraphUrl, normalizedUser, first)
          if (rows.isNotEmpty()) return@withContext rows
          sawSuccessfulEmpty = true
        } catch (error: Throwable) {
          lastError = error
        }
      }

      if (sawSuccessfulEmpty) return@withContext emptyList()
      if (lastError != null) throw lastError
      emptyList()
    }

  suspend fun fetchUserStudySetDetail(
    userAddress: String,
    studySetKey: String,
    maxAttempts: Int = 2_000,
  ): UserStudySetDetail? = withContext(Dispatchers.IO) {
    val normalizedUser = normalizeAddress(userAddress)
      ?: throw IllegalArgumentException("Invalid user address: $userAddress")
    val normalizedStudySetKey = normalizeBytes32(studySetKey)
      ?: throw IllegalArgumentException("Invalid studySetKey: $studySetKey")

    val userStudySetId = toUserStudySetId(normalizedUser, normalizedStudySetKey)
    val first = maxAttempts.coerceIn(1, 4_000)

    var sawSuccessfulNull = false
    var lastError: Throwable? = null

    for (subgraphUrl in studyProgressSubgraphUrls()) {
      try {
        val detail = fetchUserStudySetDetailFromSubgraph(
          subgraphUrl = subgraphUrl,
          userStudySetId = userStudySetId,
          studySetKey = normalizedStudySetKey,
          maxAttempts = first,
        )
        if (detail != null) return@withContext detail
        sawSuccessfulNull = true
      } catch (error: Throwable) {
        lastError = error
      }
    }

    if (sawSuccessfulNull) return@withContext null
    if (lastError != null) throw lastError
    null
  }

  private fun fetchUserStudySetSummariesFromSubgraph(
    subgraphUrl: String,
    normalizedUser: String,
    first: Int,
  ): List<UserStudySetSummary> {
    val query = """
      {
        userStudySetProgresses(
          where: { user: \"$normalizedUser\" }
          orderBy: latestCanonicalOrder
          orderDirection: desc
          first: $first
        ) {
          id
          studySetKey
          totalAttempts
          uniqueQuestionsTouched
          correctAttempts
          incorrectAttempts
          averageScore
          latestBlockTimestamp
        }
      }
    """.trimIndent()

    val json = postQuery(subgraphUrl, query)
    val rows = json.optJSONObject("data")?.optJSONArray("userStudySetProgresses") ?: JSONArray()
    val out = ArrayList<UserStudySetSummary>(rows.length())
    for (i in 0 until rows.length()) {
      val row = rows.optJSONObject(i) ?: continue
      val id = row.optString("id", "").trim().lowercase()
      val studySetKey = normalizeBytes32(row.optString("studySetKey", "")) ?: continue
      if (id.isEmpty()) continue

      out.add(
        UserStudySetSummary(
          id = id,
          studySetKey = studySetKey,
          totalAttempts = row.optInt("totalAttempts", 0).coerceAtLeast(0),
          uniqueQuestionsTouched = row.optInt("uniqueQuestionsTouched", 0).coerceAtLeast(0),
          correctAttempts = row.optInt("correctAttempts", 0).coerceAtLeast(0),
          incorrectAttempts = row.optInt("incorrectAttempts", 0).coerceAtLeast(0),
          averageScore = row.optString("averageScore", "0").trim().toDoubleOrNull() ?: 0.0,
          latestBlockTimestampSec = row.optString("latestBlockTimestamp", "0").trim().toLongOrNull() ?: 0L,
        ),
      )
    }

    return out
  }

  private fun fetchUserStudySetDetailFromSubgraph(
    subgraphUrl: String,
    userStudySetId: String,
    studySetKey: String,
    maxAttempts: Int,
  ): UserStudySetDetail? {
    val query = """
      {
        userStudySetProgress(id: \"$userStudySetId\") {
          id
          studySetKey
          totalAttempts
          uniqueQuestionsTouched
          correctAttempts
          incorrectAttempts
          averageScore
          latestBlockTimestamp
          attempts(first: $maxAttempts, orderBy: canonicalOrder, orderDirection: asc) {
            questionId
            rating
            score
            canonicalOrder
            blockTimestamp
            clientTimestamp
          }
        }
        studySetAnchor(id: \"${studySetKey.lowercase()}\") {
          trackId
          version
          studySetRef
        }
      }
    """.trimIndent()

    val json = postQuery(subgraphUrl, query)
    val data = json.optJSONObject("data") ?: return null
    val progress = data.optJSONObject("userStudySetProgress") ?: return null

    val normalizedStudySetKey = normalizeBytes32(progress.optString("studySetKey", "")) ?: return null
    val summary = UserStudySetSummary(
      id = progress.optString("id", "").trim().lowercase(),
      studySetKey = normalizedStudySetKey,
      totalAttempts = progress.optInt("totalAttempts", 0).coerceAtLeast(0),
      uniqueQuestionsTouched = progress.optInt("uniqueQuestionsTouched", 0).coerceAtLeast(0),
      correctAttempts = progress.optInt("correctAttempts", 0).coerceAtLeast(0),
      incorrectAttempts = progress.optInt("incorrectAttempts", 0).coerceAtLeast(0),
      averageScore = progress.optString("averageScore", "0").trim().toDoubleOrNull() ?: 0.0,
      latestBlockTimestampSec = progress.optString("latestBlockTimestamp", "0").trim().toLongOrNull() ?: 0L,
    )

    val attemptsJson = progress.optJSONArray("attempts") ?: JSONArray()
    val attempts = ArrayList<StudyAttemptRow>(attemptsJson.length())
    for (i in 0 until attemptsJson.length()) {
      val row = attemptsJson.optJSONObject(i) ?: continue
      val questionId = normalizeBytes32(row.optString("questionId", "")) ?: continue
      attempts.add(
        StudyAttemptRow(
          questionId = questionId,
          rating = row.optInt("rating", 0),
          score = row.optInt("score", 0),
          canonicalOrder = row.optString("canonicalOrder", "0").trim().toLongOrNull() ?: 0L,
          blockTimestampSec = row.optString("blockTimestamp", "0").trim().toLongOrNull() ?: 0L,
          clientTimestampSec = row.optString("clientTimestamp", "0").trim().toLongOrNull() ?: 0L,
        ),
      )
    }

    val anchorJson = data.optJSONObject("studySetAnchor")
    val anchor = if (anchorJson == null) {
      null
    } else {
      val trackId = normalizeBytes32(anchorJson.optString("trackId", "")) ?: ""
      val studySetRef = anchorJson.optString("studySetRef", "").trim()
      if (trackId.isBlank() || studySetRef.isBlank()) {
        null
      } else {
        StudySetAnchorRow(
          trackId = trackId,
          version = anchorJson.optInt("version", 1).coerceIn(1, 255),
          studySetRef = studySetRef,
        )
      }
    }

    return UserStudySetDetail(
      summary = summary,
      attempts = attempts,
      anchor = anchor,
    )
  }

  private fun studyProgressSubgraphUrls(): List<String> {
    val fromBuildConfig = BuildConfig.TEMPO_STUDY_PROGRESS_SUBGRAPH_URL.trim().removeSuffix("/")
    val urls = ArrayList<String>(4)
    if (fromBuildConfig.isNotBlank()) urls.add(fromBuildConfig)
    urls.add(DEFAULT_STUDY_PROGRESS_SUBGRAPH)
    if (BuildConfig.DEBUG) {
      urls.add(DEBUG_DEFAULT_STUDY_PROGRESS_SUBGRAPH_REVERSE)
      urls.add(DEBUG_DEFAULT_STUDY_PROGRESS_SUBGRAPH_EMULATOR)
    }
    return urls.distinct()
  }

  private fun postQuery(subgraphUrl: String, query: String): JSONObject {
    val body = JSONObject().put("query", query).toString().toRequestBody(jsonMediaType)
    val req = Request.Builder().url(subgraphUrl).post(body).build()
    return client.newCall(req).execute().use { res ->
      if (!res.isSuccessful) throw IllegalStateException("Study subgraph query failed: ${res.code}")
      val json = JSONObject(res.body?.string().orEmpty())
      val errors = json.optJSONArray("errors")
      if (errors != null && errors.length() > 0) {
        val message = errors.optJSONObject(0)?.optString("message", "GraphQL error") ?: "GraphQL error"
        throw IllegalStateException(message)
      }
      json
    }
  }

  private fun normalizeAddress(raw: String): String? {
    val trimmed = raw.trim()
    if (!ADDRESS_REGEX.matches(trimmed)) return null
    return trimmed.lowercase()
  }

  private fun normalizeBytes32(raw: String): String? {
    val trimmed = raw.trim()
    if (!BYTES32_REGEX.matches(trimmed)) return null
    return trimmed.lowercase()
  }

  private fun toUserStudySetId(userAddress: String, studySetKey: String): String {
    return "${userAddress.lowercase()}-${studySetKey.lowercase()}"
  }
}
