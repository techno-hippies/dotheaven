package com.pirate.app.music

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/**
 * Shared-with-you data layer (Goldsky subgraphs).
 *
 * Semantics:
 * - Tracks: activity subgraph AccessGrant → ContentEntry (contentId/pieceCid/datasetOwner/algo)
 * - Playlists: playlists subgraph PlaylistShare → (playlistId + tracksHash + version snapshot)
 *
 * Notes:
 * - ContentEntry.trackId may not match PlaylistV1 trackId for the "same" song due to duplicate
 *   registrations. We resolve playable content for playlist tracks by matching metaHash.
 */
object SharedWithYouApi {
  private const val TAG = "SharedWithYouApi"
  private const val SUBGRAPH_ACTIVITY =
    "https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/14.0.0/gn"

  private const val SUBGRAPH_PLAYLISTS =
    "https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-playlists/1.0.0/gn"

  private val client = OkHttpClient()
  private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

  suspend fun fetchSharedTracks(granteeAddress: String, maxEntries: Int = 100): List<SharedCloudTrack> = withContext(Dispatchers.IO) {
    val addr = granteeAddress.trim().lowercase()
    if (addr.isBlank()) return@withContext emptyList()

    val query = """
      {
        accessGrants(
          where: { grantee: "$addr", granted: true }
          orderBy: updatedAt
          orderDirection: desc
          first: $maxEntries
        ) {
          updatedAt
          content {
            id
            trackId
            owner
            datasetOwner
            pieceCid
            algo
          }
        }
      }
    """.trimIndent()

    val json = postQuery(SUBGRAPH_ACTIVITY, query)
    val grants = json.optJSONObject("data")?.optJSONArray("accessGrants") ?: JSONArray()
    if (grants.length() == 0) return@withContext emptyList()

    val contentRows = ArrayList<ContentRow>(grants.length())
    val trackIds = LinkedHashSet<String>()
    for (i in 0 until grants.length()) {
      val g = grants.optJSONObject(i) ?: continue
      val updatedAt = g.optString("updatedAt", "0").trim().toLongOrNull() ?: 0L
      val c = g.optJSONObject("content") ?: continue
      val contentId = c.optString("id", "").trim().lowercase()
      val trackId = c.optString("trackId", "").trim().lowercase()
      if (contentId.isEmpty() || trackId.isEmpty()) continue
      val pieceCid = decodeBytesUtf8(c.optString("pieceCid", "").trim())
      val datasetOwner = c.optString("datasetOwner", "").trim().lowercase()
      val owner = c.optString("owner", "").trim().lowercase()
      val algo = c.optInt("algo", 1)
      contentRows.add(
        ContentRow(
          contentId = contentId,
          trackId = trackId,
          owner = owner,
          pieceCid = pieceCid,
          datasetOwner = datasetOwner,
          algo = algo,
          updatedAtSec = updatedAt,
        ),
      )
      trackIds.add(trackId)
    }

    val trackMeta = fetchTrackMeta(trackIds.toList())

    val out = ArrayList<SharedCloudTrack>(contentRows.size)
    for (row in contentRows) {
      val meta = trackMeta[row.trackId]
      out.add(
        SharedCloudTrack(
          contentId = row.contentId,
          trackId = row.trackId,
          owner = row.owner,
          pieceCid = row.pieceCid,
          datasetOwner = row.datasetOwner,
          algo = row.algo,
          updatedAtSec = row.updatedAtSec,
          title = meta?.title ?: row.trackId.take(14),
          artist = meta?.artist ?: "Unknown Artist",
          album = meta?.album.orEmpty(),
          coverCid = meta?.coverCid,
          durationSec = meta?.durationSec ?: 0,
          metaHash = meta?.metaHash,
        ),
      )
    }

    Log.d(TAG, "fetchSharedTracks grantee=$addr count=${out.size}")
    out
  }

  suspend fun fetchSharedPlaylists(granteeAddress: String, maxEntries: Int = 50): List<PlaylistShareEntry> = withContext(Dispatchers.IO) {
    val addr = granteeAddress.trim().lowercase()
    if (addr.isBlank()) return@withContext emptyList()

    val query = """
      {
        playlistShares(
          where: { grantee: "$addr", granted: true }
          orderBy: updatedAt
          orderDirection: desc
          first: $maxEntries
        ) {
          id
          playlistId
          owner
          grantee
          granted
          playlistVersion
          trackCount
          tracksHash
          sharedAt
          updatedAt
          playlist {
            id
            owner
            name
            coverCid
            visibility
            trackCount
            version
            exists
            tracksHash
            createdAt
            updatedAt
          }
        }
      }
    """.trimIndent()

    val json = postQuery(SUBGRAPH_PLAYLISTS, query)
    val shares = json.optJSONObject("data")?.optJSONArray("playlistShares") ?: JSONArray()
    if (shares.length() == 0) return@withContext emptyList()

    val out = ArrayList<PlaylistShareEntry>(shares.length())
    for (i in 0 until shares.length()) {
      val s = shares.optJSONObject(i) ?: continue
      val playlistObj = s.optJSONObject("playlist") ?: continue
      val playlist =
        OnChainPlaylist(
          id = playlistObj.optString("id", "").trim(),
          owner = playlistObj.optString("owner", "").trim(),
          name = playlistObj.optString("name", "").trim(),
          coverCid = decodeBytesUtf8(playlistObj.optString("coverCid", "").trim()),
          visibility = playlistObj.optInt("visibility", 0),
          trackCount = playlistObj.optInt("trackCount", 0),
          version = playlistObj.optInt("version", 0),
          exists = playlistObj.optBoolean("exists", false),
          tracksHash = playlistObj.optString("tracksHash", "").trim(),
          createdAtSec = playlistObj.optString("createdAt", "0").trim().toLongOrNull() ?: 0L,
          updatedAtSec = playlistObj.optString("updatedAt", "0").trim().toLongOrNull() ?: 0L,
        )

      out.add(
        PlaylistShareEntry(
          id = s.optString("id", "").trim(),
          playlistId = s.optString("playlistId", "").trim(),
          owner = s.optString("owner", "").trim(),
          grantee = s.optString("grantee", "").trim(),
          granted = s.optBoolean("granted", false),
          playlistVersion = s.optInt("playlistVersion", 0),
          trackCount = s.optInt("trackCount", 0),
          tracksHash = s.optString("tracksHash", "").trim(),
          sharedAtSec = s.optString("sharedAt", "0").trim().toLongOrNull() ?: 0L,
          updatedAtSec = s.optString("updatedAt", "0").trim().toLongOrNull() ?: 0L,
          playlist = playlist,
        ),
      )
    }

    Log.d(TAG, "fetchSharedPlaylists grantee=$addr count=${out.size}")
    out
  }

  suspend fun fetchSharedPlaylistTracks(share: PlaylistShareEntry): List<SharedCloudTrack> = withContext(Dispatchers.IO) {
    val playlistId = share.playlistId.trim().lowercase()
    val tracksHash = share.tracksHash.trim().lowercase()
    if (playlistId.isEmpty() || tracksHash.isEmpty()) return@withContext emptyList()

    val orderedTrackIds = fetchPlaylistTrackIdsAtCheckpoint(playlistId, tracksHash, share.playlistVersion)
    if (orderedTrackIds.isEmpty()) return@withContext emptyList()

    val trackMeta = fetchTrackMeta(orderedTrackIds)
    // Resolve only content that this grantee can actually decrypt.
    val contentByMetaHash = buildGrantedContentByMetaHash(ownerAddress = share.owner, granteeAddress = share.grantee, minUpdatedAtSec = null)

    val out = ArrayList<SharedCloudTrack>(orderedTrackIds.size)
    var resolvedCount = 0
    for (trackId in orderedTrackIds) {
      val meta = trackMeta[trackId]
      val mh = meta?.metaHash?.lowercase()
      val content = if (!mh.isNullOrBlank()) contentByMetaHash[mh] else null
      if (content != null) resolvedCount += 1

      out.add(
        SharedCloudTrack(
          contentId = content?.contentId.orEmpty(),
          trackId = trackId,
          owner = share.owner.trim().lowercase(),
          pieceCid = content?.pieceCid.orEmpty(),
          datasetOwner = content?.datasetOwner.orEmpty(),
          algo = content?.algo ?: ContentCryptoConfig.ALGO_AES_GCM_256,
          updatedAtSec = share.updatedAtSec,
          title = meta?.title ?: trackId.take(14),
          artist = meta?.artist ?: "Unknown Artist",
          album = meta?.album.orEmpty(),
          coverCid = meta?.coverCid,
          durationSec = meta?.durationSec ?: 0,
          metaHash = meta?.metaHash,
        ),
      )
    }
    Log.d(
      TAG,
      "fetchSharedPlaylistTracks playlistId=${share.playlistId.take(10)}.. v=${share.playlistVersion} tracks=${out.size} resolved=$resolvedCount",
    )
    out
  }

  private data class ContentRow(
    val contentId: String,
    val trackId: String,
    val owner: String,
    val pieceCid: String,
    val datasetOwner: String,
    val algo: Int,
    val updatedAtSec: Long,
  )

  private data class ContentMeta(
    val contentId: String,
    val pieceCid: String,
    val datasetOwner: String,
    val algo: Int,
  )

  private data class TrackMeta(
    val id: String,
    val title: String,
    val artist: String,
    val album: String,
    val coverCid: String? = null,
    val durationSec: Int = 0,
    val metaHash: String? = null,
  )

  private suspend fun fetchPlaylistTrackIdsAtCheckpoint(
    playlistId: String,
    tracksHash: String,
    asOfVersion: Int,
  ): List<String> = withContext(Dispatchers.IO) {
    val id = playlistId.trim().lowercase()
    val th = tracksHash.trim().lowercase()
    if (id.isEmpty() || th.isEmpty()) return@withContext emptyList()

    val versionFilter = if (asOfVersion > 0) ", version_lte: $asOfVersion" else ""
    val query = """
      {
        playlistTrackVersions(
          where: { playlist: "$id", tracksHash: "$th"$versionFilter }
          orderBy: version
          orderDirection: desc
          first: 1000
        ) {
          version
          trackId
          position
        }
      }
    """.trimIndent()

    val json = postQuery(SUBGRAPH_PLAYLISTS, query)
    val rows = json.optJSONObject("data")?.optJSONArray("playlistTrackVersions") ?: JSONArray()
    if (rows.length() == 0) return@withContext emptyList()

    data class Row(val version: Int, val trackId: String, val position: Int)
    val parsed = ArrayList<Row>(rows.length())
    var maxVersion = 0
    for (i in 0 until rows.length()) {
      val r = rows.optJSONObject(i) ?: continue
      val version = r.optInt("version", 0)
      val trackId = r.optString("trackId", "").trim().lowercase()
      val position = r.optInt("position", 0)
      if (trackId.isEmpty()) continue
      parsed.add(Row(version = version, trackId = trackId, position = position))
      if (version > maxVersion) maxVersion = version
    }

    parsed
      .filter { it.version == maxVersion }
      .sortedBy { it.position }
      .map { it.trackId }
  }

  private suspend fun fetchTrackMeta(trackIds: List<String>): Map<String, TrackMeta> = withContext(Dispatchers.IO) {
    if (trackIds.isEmpty()) return@withContext emptyMap()

    // Chunk to avoid enormous GraphQL bodies.
    val chunkSize = 200
    val out = HashMap<String, TrackMeta>(trackIds.size)

    for (i in trackIds.indices step chunkSize) {
      val chunk = trackIds.subList(i, minOf(i + chunkSize, trackIds.size))
      val quoted = chunk.joinToString(",") { "\"${it.replace("\"", "\\\"")}\"" }
      val query = """
        {
          tracks(where: { id_in: [$quoted] }, first: 1000) {
            id
            title
            artist
            album
            coverCid
            durationSec
            metaHash
          }
        }
      """.trimIndent()

      val json = postQuery(SUBGRAPH_ACTIVITY, query)
      val tracks = json.optJSONObject("data")?.optJSONArray("tracks") ?: JSONArray()
      val missingCoverMetaHashes = LinkedHashSet<String>()
      for (j in 0 until tracks.length()) {
        val t = tracks.optJSONObject(j) ?: continue
        val id = t.optString("id", "").trim().lowercase()
        if (id.isEmpty()) continue
        val metaHash = t.optString("metaHash", "").trim().ifBlank { null }
        val coverCid = decodeBytesUtf8(t.optString("coverCid", "").trim()).ifBlank { null }
        if (coverCid == null && !metaHash.isNullOrBlank()) {
          missingCoverMetaHashes.add(metaHash.lowercase())
        }
        out[id] =
          TrackMeta(
            id = id,
            title = t.optString("title", "").trim().ifEmpty { id.take(14) },
            artist = t.optString("artist", "").trim().ifEmpty { "Unknown Artist" },
            album = t.optString("album", "").trim(),
            coverCid = coverCid,
            durationSec = t.optInt("durationSec", 0),
            metaHash = metaHash,
          )
      }

      // Fill missing coverCid by metaHash (duplicate track IDs can carry the cover art).
      if (missingCoverMetaHashes.isNotEmpty()) {
        val quotedMeta = missingCoverMetaHashes.joinToString(",") { "\"$it\"" }
        val coverQuery = """
          {
            tracks(where: { metaHash_in: [$quotedMeta], coverCid_not: null }, first: 1000) {
              metaHash
              coverCid
            }
          }
        """.trimIndent()
        val coverJson = postQuery(SUBGRAPH_ACTIVITY, coverQuery)
        val coverTracks = coverJson.optJSONObject("data")?.optJSONArray("tracks") ?: JSONArray()
        if (coverTracks.length() > 0) {
          val coverByMeta = HashMap<String, String>(coverTracks.length())
          for (k in 0 until coverTracks.length()) {
            val t = coverTracks.optJSONObject(k) ?: continue
            val mh = t.optString("metaHash", "").trim().lowercase()
            val cv = decodeBytesUtf8(t.optString("coverCid", "").trim()).trim()
            if (mh.isEmpty() || cv.isEmpty()) continue
            if (!coverByMeta.containsKey(mh)) coverByMeta[mh] = cv
          }

          if (coverByMeta.isNotEmpty()) {
            for (trackId in chunk) {
              val id = trackId.trim().lowercase()
              val prior = out[id] ?: continue
              if (prior.coverCid != null) continue
              val mh = prior.metaHash?.trim()?.lowercase().orEmpty()
              val cv = coverByMeta[mh] ?: continue
              out[id] = prior.copy(coverCid = cv)
            }
          }
        }
      }
    }

    out
  }

  private suspend fun buildGrantedContentByMetaHash(
    ownerAddress: String,
    granteeAddress: String,
    minUpdatedAtSec: Long? = null,
  ): Map<String, ContentMeta> = withContext(Dispatchers.IO) {
    val owner = ownerAddress.trim().lowercase()
    val grantee = granteeAddress.trim().lowercase()
    if (owner.isBlank() || grantee.isBlank()) return@withContext emptyMap()

    val query = """
      {
        accessGrants(
          where: { grantee: "$grantee", granted: true }
          orderBy: updatedAt
          orderDirection: desc
          first: 1000
        ) {
          updatedAt
          content {
            id
            trackId
            owner
            datasetOwner
            pieceCid
            algo
          }
        }
      }
    """.trimIndent()

    val json = postQuery(SUBGRAPH_ACTIVITY, query)
    val grants = json.optJSONObject("data")?.optJSONArray("accessGrants") ?: JSONArray()
    if (grants.length() == 0) return@withContext emptyMap()

    data class Row(val trackId: String, val updatedAt: Long, val content: ContentMeta)
    val rows = ArrayList<Row>(grants.length())
    val trackIds = LinkedHashSet<String>()

    for (i in 0 until grants.length()) {
      val g = grants.optJSONObject(i) ?: continue
      val updatedAt = g.optString("updatedAt", "0").trim().toLongOrNull() ?: 0L
      if (minUpdatedAtSec != null && updatedAt < minUpdatedAtSec) continue
      val c = g.optJSONObject("content") ?: continue
      if (c.optString("owner", "").trim().lowercase() != owner) continue
      val trackId = c.optString("trackId", "").trim().lowercase()
      if (trackId.isEmpty()) continue
      val contentId = c.optString("id", "").trim().lowercase()
      if (contentId.isEmpty()) continue
      val pieceCid = decodeBytesUtf8(c.optString("pieceCid", "").trim())
      val datasetOwner = c.optString("datasetOwner", "").trim().lowercase()
      val algo = c.optInt("algo", ContentCryptoConfig.ALGO_AES_GCM_256)
      val meta = ContentMeta(contentId = contentId, pieceCid = pieceCid, datasetOwner = datasetOwner, algo = algo)
      rows.add(Row(trackId = trackId, updatedAt = updatedAt, content = meta))
      trackIds.add(trackId)
    }

    if (rows.isEmpty() || trackIds.isEmpty()) return@withContext emptyMap()
    val trackMeta = fetchTrackMeta(trackIds.toList())

    // Resolve the newest decryptable content per metaHash (iterating rows in updatedAt-desc order).
    val out = HashMap<String, ContentMeta>(trackIds.size)
    for (row in rows) {
      val meta = trackMeta[row.trackId] ?: continue
      val mh = meta.metaHash?.lowercase().orEmpty()
      if (mh.isEmpty()) continue
      if (out.containsKey(mh)) continue
      out[mh] = row.content
    }

    out
  }

  private fun postQuery(url: String, query: String): JSONObject {
    val body = JSONObject().put("query", query).toString().toRequestBody(jsonMediaType)
    val req = Request.Builder().url(url).post(body).build()
    client.newCall(req).execute().use { res ->
      if (!res.isSuccessful) throw IllegalStateException("Goldsky query failed: ${res.code}")
      val raw = res.body?.string().orEmpty()
      val json = JSONObject(raw)
      val errors = json.optJSONArray("errors")
      if (errors != null && errors.length() > 0) {
        val msg = errors.optJSONObject(0)?.optString("message", "GraphQL error") ?: "GraphQL error"
        throw IllegalStateException(msg)
      }
      return json
    }
  }

  private fun decodeBytesUtf8(value: String): String {
    val v = value.trim()
    if (!v.startsWith("0x")) return v
    val hex = v.removePrefix("0x")
    if (hex.isEmpty() || hex.length % 2 != 0) return v
    if (!hex.all { it.isDigit() || (it.lowercaseChar() in 'a'..'f') }) return v
    return try {
      val bytes = ByteArray(hex.length / 2)
      var i = 0
      while (i < hex.length) {
        bytes[i / 2] = hex.substring(i, i + 2).toInt(16).toByte()
        i += 2
      }
      // Trim nulls, which can show up in fixed-size bytes fields.
      bytes.toString(Charsets.UTF_8).trimEnd { it == '\u0000' }
    } catch (_: Throwable) {
      v
    }
  }
}
