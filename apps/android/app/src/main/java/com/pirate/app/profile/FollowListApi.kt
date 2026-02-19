package com.pirate.app.profile

import com.pirate.app.BuildConfig
import com.pirate.app.music.CoverRef
import com.pirate.app.onboarding.OnboardingRpcHelpers
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

data class FollowListMember(
  val address: String,
  val name: String,
  val avatarUrl: String?,
  val followedAtSec: Long,
)

object FollowListApi {

  private const val DEFAULT_TEMPO_SUBGRAPH_MUSIC_SOCIAL =
    "https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-music-social-tempo/1.0.0/gn"

  private const val DEFAULT_TEMPO_SUBGRAPH_PROFILES =
    "https://graph.dotheaven.org/subgraphs/name/dotheaven/profiles-tempo"

  private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()
  private val http = OkHttpClient()

  /** Fetch followers of an address (people who follow this address). */
  suspend fun fetchFollowers(
    address: String,
    first: Int = 50,
    skip: Int = 0,
  ): List<FollowListMember> = withContext(Dispatchers.IO) {
    val addr = address.trim().lowercase()
    val query = """
      {
        follows(
          where: { followee: "$addr", active: true }
          orderBy: blockTimestamp
          orderDirection: desc
          first: $first
          skip: $skip
        ) {
          follower
          blockTimestamp
        }
      }
    """.trimIndent()

    val follows = queryMusicSocialSubgraph(query)
    val addresses = follows.map { it.first }
    resolveMembers(addresses, follows)
  }

  /** Fetch users that this address follows. */
  suspend fun fetchFollowing(
    address: String,
    first: Int = 50,
    skip: Int = 0,
  ): List<FollowListMember> = withContext(Dispatchers.IO) {
    val addr = address.trim().lowercase()
    val query = """
      {
        follows(
          where: { follower: "$addr", active: true }
          orderBy: blockTimestamp
          orderDirection: desc
          first: $first
          skip: $skip
        ) {
          followee
          blockTimestamp
        }
      }
    """.trimIndent()

    val follows = queryMusicSocialSubgraph(query)
    val addresses = follows.map { it.first }
    resolveMembers(addresses, follows)
  }

  /** Returns list of (address, blockTimestamp) pairs. */
  private fun queryMusicSocialSubgraph(query: String): List<Pair<String, Long>> {
    val urls = musicSocialSubgraphUrls()
    for (url in urls) {
      val result = runCatching { postGraphQL(url, query) }.getOrNull() ?: continue
      val data = result.optJSONObject("data") ?: continue
      val follows = data.optJSONArray("follows") ?: continue
      val list = mutableListOf<Pair<String, Long>>()
      for (i in 0 until follows.length()) {
        val f = follows.getJSONObject(i)
        val addr = f.optString("follower", "").ifBlank { f.optString("followee", "") }
        val ts = f.optString("blockTimestamp", "0").toLongOrNull() ?: 0L
        if (addr.isNotBlank()) list.add(addr.lowercase() to ts)
      }
      return list
    }
    return emptyList()
  }

  /** Resolve addresses into FollowListMembers with names and avatars. */
  private suspend fun resolveMembers(
    addresses: List<String>,
    follows: List<Pair<String, Long>>,
  ): List<FollowListMember> = coroutineScope {
    if (addresses.isEmpty()) return@coroutineScope emptyList()

    // Batch-fetch profile data (displayName, photoURI) from profiles subgraph
    val profileMap = runCatching { fetchProfilesBatch(addresses) }.getOrDefault(emptyMap())

    // Resolve primary names in parallel (capped)
    val nameJobs = addresses.take(50).map { addr ->
      async(Dispatchers.IO) {
        val name = runCatching {
          TempoNameRecordsApi.getPrimaryName(addr)
            ?: OnboardingRpcHelpers.getPrimaryName(addr)
              ?.trim()?.takeIf { it.isNotBlank() }?.let { "$it.heaven" }
        }.getOrNull()
        addr to name
      }
    }
    val nameMap = nameJobs.awaitAll().toMap()

    follows.map { (addr, ts) ->
      val profile = profileMap[addr]
      val resolvedName = nameMap[addr]
      val displayName = profile?.first?.trim()?.takeIf { it.isNotBlank() }
      val name = resolvedName
        ?: displayName
        ?: shortAddr(addr)
      val photoUri = profile?.second?.trim()?.takeIf { it.isNotBlank() }
      val avatarUrl = photoUri?.let {
        CoverRef.resolveCoverUrl(ref = it, width = null, height = null, format = null, quality = null)
      }
      FollowListMember(
        address = addr,
        name = name,
        avatarUrl = avatarUrl,
        followedAtSec = ts,
      )
    }
  }

  /** Batch-fetch displayName + photoURI from profiles subgraph. Returns map of address → (displayName, photoURI). */
  private fun fetchProfilesBatch(addresses: List<String>): Map<String, Pair<String, String>> {
    if (addresses.isEmpty()) return emptyMap()
    val ids = addresses.joinToString(", ") { "\"$it\"" }
    val query = """
      {
        profiles(where: { id_in: [$ids] }) {
          id
          displayName
          photoURI
        }
      }
    """.trimIndent()

    val urls = profilesSubgraphUrls()
    for (url in urls) {
      val result = runCatching { postGraphQL(url, query) }.getOrNull() ?: continue
      val data = result.optJSONObject("data") ?: continue
      val profiles = data.optJSONArray("profiles") ?: continue
      val map = mutableMapOf<String, Pair<String, String>>()
      for (i in 0 until profiles.length()) {
        val p = profiles.getJSONObject(i)
        val id = p.optString("id", "").lowercase()
        val displayName = p.optString("displayName", "")
        val photoURI = p.optString("photoURI", "")
        if (id.isNotBlank()) map[id] = displayName to photoURI
      }
      return map
    }
    return emptyMap()
  }

  private fun postGraphQL(url: String, query: String): JSONObject {
    val body = JSONObject().put("query", query).toString()
    val req = Request.Builder()
      .url(url)
      .post(body.toRequestBody(JSON_TYPE))
      .build()
    http.newCall(req).execute().use { res ->
      if (!res.isSuccessful) throw IllegalStateException("GraphQL failed: ${res.code}")
      return JSONObject(res.body?.string().orEmpty())
    }
  }

  private fun musicSocialSubgraphUrls(): List<String> {
    val fromMusicSocial = runCatching { BuildConfig.TEMPO_MUSIC_SOCIAL_SUBGRAPH_URL }.getOrDefault("")
    return listOfNotNull(
      fromMusicSocial.takeIf { it.isNotBlank() },
      DEFAULT_TEMPO_SUBGRAPH_MUSIC_SOCIAL,
    ).distinct()
  }

  private fun profilesSubgraphUrls(): List<String> {
    val fromConfig = runCatching { BuildConfig.TEMPO_PROFILES_SUBGRAPH_URL }.getOrDefault("")
    return listOfNotNull(
      fromConfig.takeIf { it.isNotBlank() },
      DEFAULT_TEMPO_SUBGRAPH_PROFILES,
    ).distinct()
  }

  private fun shortAddr(addr: String): String {
    if (addr.length <= 14) return addr
    return "${addr.take(6)}...${addr.takeLast(4)}"
  }
}
