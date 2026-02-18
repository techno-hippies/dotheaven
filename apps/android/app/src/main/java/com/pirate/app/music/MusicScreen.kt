package com.pirate.app.music

import android.Manifest
import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.List
import androidx.compose.material.icons.automirrored.rounded.PlaylistPlay
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ArrowDropDown
import androidx.compose.material.icons.rounded.AddCircle
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import androidx.compose.ui.layout.ContentScale
import com.pirate.app.tempo.ContentKeyManager
import com.pirate.app.tempo.EciesContentCrypto
import com.pirate.app.music.ui.AddToPlaylistSheet
import com.pirate.app.music.ui.CreatePlaylistSheet
import com.pirate.app.music.ui.TrackItemRow
import com.pirate.app.music.ui.TrackMenuSheet
import com.pirate.app.onboarding.OnboardingRpcHelpers
import com.pirate.app.profile.TempoNameRecordsApi
import com.pirate.app.player.PlayerController
import com.pirate.app.theme.PiratePalette
import com.pirate.app.ui.PirateMobileHeader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File

private enum class MusicView { Home, Library, Shared, SharedPlaylistDetail, Playlists, PlaylistDetail, Search }


private data class AlbumCardModel(
  val title: String,
  val artist: String,
  val audioRef: String? = null,
  val coverRef: String? = null,
)

private const val HOME_NEW_RELEASES_MAX = 12

private fun mergedNewReleases(
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

private const val TAG_SHARED = "MusicShared"
private const val SHARED_REFRESH_TTL_MS = 120_000L
private const val SHARED_SEEN_PREFS = "pirate_music_shared_seen"
private const val SHARED_SEEN_KEY_PREFIX = "seen_v1_"

private fun resolveReleaseAudioUrl(ref: String?): String? {
  val raw = ref?.trim().orEmpty()
  if (raw.isBlank()) return null
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  if (raw.startsWith("ar://")) {
    val id = raw.removePrefix("ar://").trim()
    if (id.isBlank()) return null
    return "https://arweave.net/$id"
  }
  if (raw.startsWith("ls3://")) {
    val id = raw.removePrefix("ls3://").trim()
    if (id.isBlank()) return null
    return "${LoadTurboConfig.DEFAULT_GATEWAY_URL.trimEnd('/')}/resolve/$id"
  }
  if (raw.startsWith("load-s3://")) {
    val id = raw.removePrefix("load-s3://").trim()
    if (id.isBlank()) return null
    return "${LoadTurboConfig.DEFAULT_GATEWAY_URL.trimEnd('/')}/resolve/$id"
  }
  return "${LoadTurboConfig.DEFAULT_GATEWAY_URL.trimEnd('/')}/resolve/$raw"
}

private fun resolveReleaseCoverUrl(ref: String?): String? {
  val fromRef = CoverRef.resolveCoverUrl(ref, width = 140, height = 140, format = "webp", quality = 80)
  if (!fromRef.isNullOrBlank()) return fromRef
  val raw = ref?.trim().orEmpty()
  if (raw.startsWith("content://")) return raw
  if (raw.startsWith("file://")) return raw
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  return null
}

private data class CachedSharedAudio(
  val file: File,
  val uri: String,
  val filename: String,
  val mimeType: String?,
)

private fun sharedItemIdForPlaylist(share: PlaylistShareEntry): String {
  return "pl:${share.id.trim().lowercase()}"
}

private fun sharedItemIdForTrack(track: SharedCloudTrack): String {
  val stable = track.contentId.ifBlank { track.trackId }.trim().lowercase()
  return "tr:$stable"
}

private fun computeSharedItemIds(
  playlists: List<PlaylistShareEntry>,
  tracks: List<SharedCloudTrack>,
): Set<String> {
  val out = LinkedHashSet<String>(playlists.size + tracks.size)
  for (p in playlists) out.add(sharedItemIdForPlaylist(p))
  for (t in tracks) out.add(sharedItemIdForTrack(t))
  return out
}

private fun sharedSeenStorageKey(ownerEthAddress: String?): String? {
  val owner = ownerEthAddress?.trim()?.lowercase().orEmpty()
  if (owner.isBlank()) return null
  return SHARED_SEEN_KEY_PREFIX + owner
}

private fun loadSeenSharedItemIds(context: Context, ownerEthAddress: String?): Set<String> {
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

private fun saveSeenSharedItemIds(
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

@Composable
fun MusicScreen(
  player: PlayerController,
  ownerEthAddress: String?,
  isAuthenticated: Boolean,
  onShowMessage: (String) -> Unit,
  onOpenPlayer: () -> Unit,
  onOpenDrawer: () -> Unit,
  hostActivity: androidx.fragment.app.FragmentActivity? = null,
  tempoAccount: com.pirate.app.tempo.TempoPasskeyManager.PasskeyAccount? = null,
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()

  val currentTrack by player.currentTrack.collectAsState()
  val isPlaying by player.isPlaying.collectAsState()

  var view by rememberSaveable { mutableStateOf(MusicView.Home) }
  var searchQuery by rememberSaveable { mutableStateOf("") }
  var recentPublishedReleases by remember { mutableStateOf<List<AlbumCardModel>>(emptyList()) }

  val permission = if (Build.VERSION.SDK_INT >= 33) {
    Manifest.permission.READ_MEDIA_AUDIO
  } else {
    @Suppress("DEPRECATION")
    Manifest.permission.READ_EXTERNAL_STORAGE
  }

  fun computeHasPermission(): Boolean {
    return ContextCompat.checkSelfPermission(context, permission) == android.content.pm.PackageManager.PERMISSION_GRANTED
  }

  var hasPermission by remember { mutableStateOf(computeHasPermission()) }
  var tracks by remember { mutableStateOf<List<MusicTrack>>(emptyList()) }
  var scanning by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }

  var playlistsLoading by remember { mutableStateOf(false) }
  var localPlaylists by remember { mutableStateOf<List<LocalPlaylist>>(emptyList()) }
  var onChainPlaylists by remember { mutableStateOf<List<OnChainPlaylist>>(emptyList()) }
  var selectedPlaylist by remember { mutableStateOf<PlaylistDisplayItem?>(null) }
  var selectedPlaylistId by rememberSaveable { mutableStateOf<String?>(null) }
  var playlistDetailLoading by remember { mutableStateOf(false) }
  var playlistDetailError by remember { mutableStateOf<String?>(null) }
  var playlistDetailTracks by remember { mutableStateOf<List<MusicTrack>>(emptyList()) }

  var sharedLoading by remember { mutableStateOf(false) }
  var sharedError by remember { mutableStateOf<String?>(null) }
  var sharedPlaylists by remember { mutableStateOf(SharedWithYouCache.playlists) }
  var sharedTracks by remember { mutableStateOf(SharedWithYouCache.tracks) }

  var sharedSelectedPlaylist by remember { mutableStateOf<PlaylistShareEntry?>(null) }
  var sharedPlaylistLoading by remember { mutableStateOf(false) }
  var sharedPlaylistRefreshing by remember { mutableStateOf(false) }
  var sharedPlaylistError by remember { mutableStateOf<String?>(null) }
  var sharedPlaylistTracks by remember { mutableStateOf<List<SharedCloudTrack>>(emptyList()) }
  var sharedPlaylistKey by remember { mutableStateOf<String?>(null) }
  var sharedPlaylistMenuOpen by remember { mutableStateOf(false) }

  var cloudPlayBusy by remember { mutableStateOf(false) }
  var cloudPlayLabel by remember { mutableStateOf<String?>(null) }

  var trackMenuOpen by remember { mutableStateOf(false) }
  var selectedTrack by remember { mutableStateOf<MusicTrack?>(null) }

  var addToPlaylistOpen by remember { mutableStateOf(false) }
  var createPlaylistOpen by remember { mutableStateOf(false) }
  var shareTrack by remember { mutableStateOf<MusicTrack?>(null) }
  var shareRecipientInput by rememberSaveable { mutableStateOf("") }
  var shareBusy by remember { mutableStateOf(false) }

  var uploadBusy by remember { mutableStateOf(false) }

  var autoSyncJob by remember { mutableStateOf<Job?>(null) }

  var sharedLastFetchAtMs by remember { mutableStateOf(SharedWithYouCache.lastFetchAtMs) }
  val sharedOwnerLabels = remember { mutableStateMapOf<String, String>() }
  var sharedSeenItemIds by remember { mutableStateOf<Set<String>>(emptySet()) }
  var downloadedTracksByContentId by remember { mutableStateOf<Map<String, DownloadedTrackEntry>>(emptyMap()) }
  val sharedItemIds = remember(sharedPlaylists, sharedTracks) { computeSharedItemIds(sharedPlaylists, sharedTracks) }
  val sharedUnreadCount = remember(sharedItemIds, sharedSeenItemIds) { sharedItemIds.count { !sharedSeenItemIds.contains(it) } }

  fun shortAddr(addr: String): String {
    val a = addr.trim()
    if (a.length <= 10) return a
    return "${a.take(6)}...${a.takeLast(4)}"
  }

  fun sharedOwnerLabel(ownerAddress: String): String {
    val key = ownerAddress.trim().lowercase()
    if (key.isBlank()) return "unknown"
    return sharedOwnerLabels[key] ?: shortAddr(key)
  }

  fun buildSharedTrackForPlayer(
    t: SharedCloudTrack,
    uri: String,
    filename: String,
  ): MusicTrack {
    val coverUri = CoverRef.resolveCoverUrl(t.coverCid, width = 192, height = 192, format = "webp", quality = 80)
    return MusicTrack(
      id = t.contentId.ifBlank { t.trackId },
      title = t.title,
      artist = t.artist,
      album = t.album,
      durationSec = t.durationSec,
      uri = uri,
      filename = filename,
      artworkUri = coverUri,
      contentId = t.contentId,
      pieceCid = t.pieceCid,
      datasetOwner = t.datasetOwner,
      algo = t.algo,
    )
  }

  suspend fun removeDownloadedEntry(contentId: String) {
    val key = contentId.trim().lowercase()
    if (key.isBlank()) return
    downloadedTracksByContentId = DownloadedTracksStore.remove(context, key)
  }

  suspend fun resolveDownloadedEntry(contentId: String): DownloadedTrackEntry? {
    val key = contentId.trim().lowercase()
    if (key.isBlank()) return null
    val entry = downloadedTracksByContentId[key] ?: return null
    val exists = runCatching { MediaStoreAudioDownloads.uriExists(context, entry.mediaUri) }.getOrDefault(false)
    if (exists) return entry
    removeDownloadedEntry(key)
    return null
  }

  suspend fun findCachedSharedAudio(contentId: String): CachedSharedAudio? = withContext(Dispatchers.IO) {
    val safe = contentId.removePrefix("0x").trim().lowercase()
    if (safe.isBlank()) return@withContext null

    val dir = File(context.cacheDir, "heaven_cloud")
    if (!dir.exists()) return@withContext null

    val existing =
      dir.listFiles()
        ?.firstOrNull { f -> f.isFile && f.name.startsWith("content_${safe}.") && f.length() > 0L }
        ?: return@withContext null

    CachedSharedAudio(
      file = existing,
      uri = Uri.fromFile(existing).toString(),
      filename = existing.name,
      mimeType = extToMime(existing.extension),
    )
  }

  suspend fun decryptSharedAudioToCache(t: SharedCloudTrack): CachedSharedAudio = withContext(Dispatchers.IO) {
    if (t.algo != ContentCryptoConfig.ALGO_AES_GCM_256) {
      throw IllegalStateException("Legacy/plaintext shared track is not supported. Ask owner to re-upload encrypted.")
    }
    val grantee = ownerEthAddress?.trim()?.lowercase().orEmpty()
    if (grantee.isBlank()) {
      throw IllegalStateException("Missing active wallet for shared-track decrypt.")
    }

    val contentKey = ContentKeyManager.load(context)
      ?: throw IllegalStateException("No content encryption key — upload a track first to generate one")

    var wrappedKey = ContentKeyManager.loadWrappedKey(context, t.contentId)
    if (wrappedKey == null) {
      UploadedTrackActions.ensureWrappedKeyFromLs3(
        context = context,
        contentId = t.contentId,
        ownerAddress = t.owner,
        granteeAddress = grantee,
      )
      wrappedKey = ContentKeyManager.loadWrappedKey(context, t.contentId)
    }
    val resolvedWrappedKey =
      wrappedKey
        ?: throw IllegalStateException(
          "Missing encrypted key for this shared track. It may not be shared to this wallet yet.",
        )

    // Fetch encrypted blob from Load gateway
    val blob = UploadedTrackActions.fetchResolvePayload(t.pieceCid)

    // Parse blob: [iv (12 bytes)][aes ciphertext]
    if (blob.size < 13) throw RuntimeException("Encrypted blob too small: ${blob.size} bytes")
    val iv = blob.copyOfRange(0, 12)
    val ciphertext = blob.copyOfRange(12, blob.size)

    // ECIES decrypt wrapped AES key
    val aesKey = EciesContentCrypto.eciesDecrypt(contentKey.privateKey, resolvedWrappedKey)

    // AES-GCM decrypt file
    val audio = EciesContentCrypto.decryptFile(aesKey, iv, ciphertext)
    aesKey.fill(0)

    // Write to cache
    val dir = File(context.cacheDir, "heaven_cloud").also { it.mkdirs() }
    val safe = t.contentId.removePrefix("0x").trim().lowercase()
    val ext = if (t.title.contains(".")) t.title.substringAfterLast('.') else "mp3"
    val cacheFile = File(dir, "content_${safe}.${ext}")
    cacheFile.writeBytes(audio)

    CachedSharedAudio(
      file = cacheFile,
      uri = Uri.fromFile(cacheFile).toString(),
      filename = cacheFile.name,
      mimeType = extToMime(ext),
    )
  }

  suspend fun downloadSharedTrackToDevice(
    t: SharedCloudTrack,
    notify: Boolean = true,
  ): Boolean {
    if (t.contentId.isBlank()) {
      if (notify) onShowMessage("Download failed: missing contentId")
      return false
    }

    val existing = resolveDownloadedEntry(t.contentId)
    if (existing != null) {
      if (notify) onShowMessage("Already downloaded")
      return true
    }

    if (cloudPlayBusy) {
      if (notify) onShowMessage("Another decrypt/download is in progress")
      return false
    }

    cloudPlayBusy = true
    cloudPlayLabel = "Downloading: ${t.title}"

    try {
      val cached = findCachedSharedAudio(t.contentId)
      val prepared =
        if (cached != null) {
          cached
        } else {
          if (t.pieceCid.isBlank()) {
            throw IllegalStateException("missing pieceCid")
          }
          if (!isAuthenticated) {
            throw IllegalStateException("Sign in to download")
          }
          decryptSharedAudioToCache(t)
        }

      val preferredName =
        listOf(t.artist.trim(), t.title.trim())
          .filter { it.isNotBlank() }
          .joinToString(" - ")
          .ifBlank { t.contentId.removePrefix("0x") }

      val mediaUri =
        MediaStoreAudioDownloads.saveAudio(
          context = context,
          sourceFile = prepared.file,
          title = t.title,
          artist = t.artist,
          album = t.album,
          mimeType = prepared.mimeType,
          preferredName = preferredName,
        )

      val entry =
        DownloadedTrackEntry(
          contentId = t.contentId.trim().lowercase(),
          mediaUri = mediaUri,
          title = t.title,
          artist = t.artist,
          album = t.album,
          filename = prepared.filename,
          mimeType = prepared.mimeType,
          pieceCid = t.pieceCid,
          datasetOwner = t.datasetOwner,
          algo = t.algo,
          coverCid = t.coverCid,
          downloadedAtMs = System.currentTimeMillis(),
        )

      downloadedTracksByContentId = DownloadedTracksStore.upsert(context, entry)

      // Once a persistent device copy exists, drop the temporary decrypt cache file.
      val cacheRoot = File(context.cacheDir, "heaven_cloud").absolutePath
      if (prepared.file.absolutePath.startsWith(cacheRoot)) {
        runCatching { prepared.file.delete() }
      }

      runScan(
        context = context,
        onShowMessage = onShowMessage,
        silent = true,
        setScanning = { scanning = it },
        setTracks = { tracks = it },
        setError = { error = it },
      )

      if (notify) onShowMessage("Downloaded to device")
      return true
    } catch (err: Throwable) {
      Log.e(TAG_SHARED, "download failed contentId=${t.contentId}", err)
      if (notify) onShowMessage("Download failed: ${err.message ?: "unknown error"}")
      return false
    } finally {
      cloudPlayBusy = false
      cloudPlayLabel = null
    }
  }

  val requestPermission = rememberLauncherForActivityResult(
    contract = ActivityResultContracts.RequestPermission(),
    onResult = { ok ->
      hasPermission = ok
      if (ok) {
        scope.launch { runScan(context, onShowMessage, silent = true, setScanning = { scanning = it }, setTracks = { tracks = it }, setError = { error = it }) }
      }
    },
  )

  suspend fun loadPlaylists() {
    playlistsLoading = true
    val local = runCatching { LocalPlaylistsStore.getLocalPlaylists(context) }.getOrElse { emptyList() }
    localPlaylists = local

    onChainPlaylists =
      if (isAuthenticated && !ownerEthAddress.isNullOrBlank()) {
        runCatching { OnChainPlaylistsApi.fetchUserPlaylists(ownerEthAddress) }.getOrElse { emptyList() }
      } else {
        emptyList()
      }

    playlistsLoading = false
  }

  suspend fun loadPlaylistDetail(playlist: PlaylistDisplayItem) {
    playlistDetailLoading = true
    playlistDetailError = null
    try {
      if (playlist.isLocal) {
        val local = localPlaylists.firstOrNull { it.id == playlist.id }
        if (local == null) {
          playlistDetailTracks = emptyList()
          playlistDetailError = "Playlist not found"
          return
        }
        val fallbackArt = playlist.coverUri
        playlistDetailTracks =
          local.tracks.mapIndexed { idx, t ->
            val stable = t.uri ?: "${t.artist}-${t.title}-${idx}"
            MusicTrack(
              id = "localpl:${local.id}:$stable",
              title = t.title.ifBlank { "Track ${idx + 1}" },
              artist = t.artist.ifBlank { "Unknown Artist" },
              album = t.album.orEmpty(),
              durationSec = t.durationSec ?: 0,
              uri = t.uri.orEmpty(),
              filename = t.title.ifBlank { "track-${idx + 1}" },
              artworkUri = t.artworkUri ?: fallbackArt,
              artworkFallbackUri = t.artworkFallbackUri,
            )
          }
      } else {
        val trackIds = OnChainPlaylistsApi.fetchPlaylistTrackIds(playlist.id)
        val byContentId =
          tracks
            .mapNotNull { t ->
              val key = t.contentId?.trim()?.lowercase().orEmpty()
              if (key.isBlank()) null else key to t
            }
            .toMap()
        val byTrackId = tracks.associateBy { it.id.trim().lowercase() }
        val fallbackArt = playlist.coverUri
        playlistDetailTracks =
          trackIds.mapIndexed { idx, tid ->
            val key = tid.trim().lowercase()
            val match = byContentId[key] ?: byTrackId[key]
            if (match != null) {
              match.copy(
                id = "onchain:${playlist.id}:$idx:${match.id}",
                artworkUri = match.artworkUri ?: fallbackArt,
              )
            } else {
              MusicTrack(
                id = "onchain:${playlist.id}:$idx",
                title = "Track ${idx + 1}",
                artist = key.take(10).ifBlank { "Unknown Artist" },
                album = playlist.name,
                durationSec = 0,
                uri = "",
                filename = key.ifBlank { "track-${idx + 1}" },
                artworkUri = fallbackArt,
                contentId = key.ifBlank { null },
              )
            }
          }
      }
    } catch (err: Throwable) {
      playlistDetailTracks = emptyList()
      playlistDetailError = err.message ?: "Failed to load playlist"
    } finally {
      playlistDetailLoading = false
    }
  }

  suspend fun loadShared(force: Boolean) {
    sharedError = null
    if (!isAuthenticated || ownerEthAddress.isNullOrBlank()) {
      sharedPlaylists = emptyList()
      sharedTracks = emptyList()
      sharedLastFetchAtMs = 0L
      SharedWithYouCache.playlists = emptyList()
      SharedWithYouCache.tracks = emptyList()
      SharedWithYouCache.lastFetchAtMs = 0L
      return
    }
    if (sharedLoading) return

    val now = SystemClock.elapsedRealtime()
    val hasData = sharedPlaylists.isNotEmpty() || sharedTracks.isNotEmpty()
    val stale = !hasData || (sharedLastFetchAtMs == 0L) || (now - sharedLastFetchAtMs > SHARED_REFRESH_TTL_MS)
    if (!force && !stale) return

    // Avoid flashing loaders when navigating between tabs; keep stale data visible while refreshing.
    sharedLoading = !hasData
    try {
      val playlists =
        runCatching { SharedWithYouApi.fetchSharedPlaylists(ownerEthAddress) }
          .getOrElse { err ->
            sharedError = err.message ?: "Failed to load shared playlists"
            emptyList()
          }
      val tracks =
        runCatching { SharedWithYouApi.fetchSharedTracks(ownerEthAddress) }
          .getOrElse { err ->
            if (sharedError == null) sharedError = err.message ?: "Failed to load shared tracks"
            emptyList()
          }
      sharedPlaylists = playlists
      sharedTracks = tracks
      sharedLastFetchAtMs = now
      SharedWithYouCache.playlists = playlists
      SharedWithYouCache.tracks = tracks
      SharedWithYouCache.lastFetchAtMs = now
    } finally {
      sharedLoading = false
    }
  }

  suspend fun loadSharedPlaylistTracks(share: PlaylistShareEntry, force: Boolean) {
    sharedPlaylistError = null

    val key = "${share.id}:${share.playlistVersion}:${share.tracksHash}".lowercase()
    sharedPlaylistKey = key

    val cached = SharedWithYouCache.getPlaylistTracks(key)
    // Show cached tracks instantly; otherwise clear to avoid showing stale tracks from a
    // previously-opened playlist.
    sharedPlaylistTracks = cached?.second ?: emptyList()

    if (sharedPlaylistLoading || sharedPlaylistRefreshing) return

    val now = SystemClock.elapsedRealtime()
    val hasData = (cached?.second?.isNotEmpty() == true)
    val cachedAt = cached?.first ?: 0L
    val stale = !hasData || cachedAt == 0L || (now - cachedAt > SHARED_REFRESH_TTL_MS)
    val hasMissingPointers =
      cached?.second?.any { it.contentId.isBlank() || it.pieceCid.isBlank() } == true
    if (!force && !stale && !hasMissingPointers) return

    if (hasData) sharedPlaylistRefreshing = true else sharedPlaylistLoading = true
    try {
      val tracks =
        runCatching { SharedWithYouApi.fetchSharedPlaylistTracks(share) }
          .getOrElse { err ->
            sharedPlaylistError = err.message ?: "Failed to load playlist"
            emptyList()
          }
      // Only apply if we're still on this same playlist key (avoid race when switching fast).
      if (sharedPlaylistKey == key) {
        sharedPlaylistTracks = tracks
      }
      SharedWithYouCache.putPlaylistTracks(key, now, tracks)
    } finally {
      sharedPlaylistLoading = false
      sharedPlaylistRefreshing = false
    }
  }

  suspend fun playSharedCloudTrack(t: SharedCloudTrack) {
    if (cloudPlayBusy) {
      onShowMessage("Playback already in progress")
      return
    }
    if (t.contentId.isBlank()) {
      Log.w(TAG_SHARED, "play blocked: missing contentId title='${t.title}' trackId='${t.trackId}'")
      onShowMessage("Not unlocked yet (missing contentId).")
      return
    }

    try {
      val downloaded = resolveDownloadedEntry(t.contentId)
      if (downloaded != null) {
        Log.d(TAG_SHARED, "play local download contentId=${t.contentId} uri=${downloaded.mediaUri}")
        val track = buildSharedTrackForPlayer(t, downloaded.mediaUri, downloaded.filename.ifBlank { t.title })
        player.playTrack(track, listOf(track))
        onOpenPlayer()
        return
      }

      Log.d(TAG_SHARED, "play requested title='${t.title}' contentId='${t.contentId}' pieceCid='${t.pieceCid.take(18)}...' datasetOwner='${t.datasetOwner}' algo=${t.algo}")
      val cached = findCachedSharedAudio(t.contentId)
      if (cached != null) {
        Log.d(TAG_SHARED, "cache hit contentId=${t.contentId} file=${cached.filename}")
        val track = buildSharedTrackForPlayer(t, cached.uri, cached.filename)
        player.playTrack(track, listOf(track))
        onOpenPlayer()
        return
      }

      if (!isAuthenticated) {
        onShowMessage("Sign in to play")
        return
      }
      if (t.pieceCid.isBlank()) {
        Log.w(TAG_SHARED, "play blocked: missing pieceCid title='${t.title}' contentId='${t.contentId}' trackId='${t.trackId}'")
        onShowMessage("Not unlocked yet (missing pieceCid).")
        return
      }
      val isFilecoinPiece = run {
        val v = t.pieceCid.trim()
        v.startsWith("baga") || v.startsWith("bafy") || v.startsWith("Qm")
      }
      if (isFilecoinPiece && t.datasetOwner.isBlank()) {
        Log.w(TAG_SHARED, "play blocked: missing datasetOwner for Filecoin pieceCid='${t.pieceCid}' contentId='${t.contentId}'")
        onShowMessage("Not unlocked yet (missing datasetOwner).")
        return
      }

      cloudPlayBusy = true
      cloudPlayLabel = "Decrypting: ${t.title} (can take up to ~60s)"
      onShowMessage("Decrypting (can take up to ~60s)…")
      val startedAtMs = SystemClock.elapsedRealtime()

      val prepared = decryptSharedAudioToCache(t)

      val tookMs = SystemClock.elapsedRealtime() - startedAtMs
      Log.d(TAG_SHARED, "decrypt ok contentId=${t.contentId} tookMs=$tookMs file=${prepared.filename}")
      val track = buildSharedTrackForPlayer(t, prepared.uri, prepared.filename)
      player.playTrack(track, listOf(track))
      onOpenPlayer()
    } catch (err: Throwable) {
      Log.e(TAG_SHARED, "decrypt/play failed contentId=${t.contentId}", err)
      onShowMessage("Playback failed: ${err.message ?: "unknown error"}")
    } finally {
      cloudPlayBusy = false
      cloudPlayLabel = null
    }
  }

  fun toDisplayItems(local: List<LocalPlaylist>, onChain: List<OnChainPlaylist>): List<PlaylistDisplayItem> {
    val out = ArrayList<PlaylistDisplayItem>(local.size + onChain.size)
    for (lp in local) {
      out.add(
        PlaylistDisplayItem(
          id = lp.id,
          name = lp.name,
          trackCount = lp.tracks.size,
          coverUri = lp.coverUri ?: lp.tracks.firstOrNull()?.artworkUri,
          isLocal = true,
        ),
      )
    }
    for (p in onChain) {
      out.add(
        PlaylistDisplayItem(
          id = p.id,
          name = p.name,
          trackCount = p.trackCount,
          coverUri = CoverRef.resolveCoverUrl(p.coverCid, width = 140, height = 140, format = "webp", quality = 80),
          isLocal = false,
        ),
      )
    }
    return out
  }

  val displayPlaylists = remember(localPlaylists, onChainPlaylists) { toDisplayItems(localPlaylists, onChainPlaylists) }

  LaunchedEffect(Unit) {
    tracks = MusicLibrary.loadCachedTracks(context)
    downloadedTracksByContentId = DownloadedTracksStore.load(context)
    loadPlaylists()
    // Background refresh once on open when permitted.
    if (hasPermission) {
      scope.launch { runScan(context, onShowMessage, silent = true, setScanning = { scanning = it }, setTracks = { tracks = it }, setError = { error = it }) }
    }
  }

  LaunchedEffect(ownerEthAddress, isAuthenticated) {
    sharedSeenItemIds =
      if (isAuthenticated && !ownerEthAddress.isNullOrBlank()) {
        withContext(Dispatchers.IO) { loadSeenSharedItemIds(context, ownerEthAddress) }
      } else {
        emptySet()
      }
    loadPlaylists()
    loadShared(force = false)
  }

  LaunchedEffect(view, ownerEthAddress, isAuthenticated) {
    if (view != MusicView.Shared) return@LaunchedEffect
    loadShared(force = false)
  }

  LaunchedEffect(view) {
    if (view != MusicView.Home) return@LaunchedEffect
    recentPublishedReleases =
      withContext(Dispatchers.IO) {
        RecentlyPublishedSongsStore
          .load(context)
          .map {
            AlbumCardModel(
              title = it.title,
              artist = it.artist,
              audioRef = it.audioCid,
              coverRef = it.coverCid,
            )
          }
      }
  }

  LaunchedEffect(view, sharedSelectedPlaylist) {
    if (view != MusicView.SharedPlaylistDetail) return@LaunchedEffect
    val share = sharedSelectedPlaylist ?: return@LaunchedEffect

    loadSharedPlaylistTracks(share, force = false)
  }

  LaunchedEffect(view, sharedItemIds, ownerEthAddress, isAuthenticated) {
    if (view != MusicView.Shared || !isAuthenticated || ownerEthAddress.isNullOrBlank()) return@LaunchedEffect
    if (sharedItemIds.isEmpty()) return@LaunchedEffect
    val merged = sharedSeenItemIds + sharedItemIds
    if (merged.size == sharedSeenItemIds.size) return@LaunchedEffect
    sharedSeenItemIds = merged
    withContext(Dispatchers.IO) { saveSeenSharedItemIds(context, ownerEthAddress, merged) }
  }

  LaunchedEffect(sharedPlaylists) {
    val owners =
      sharedPlaylists
        .map { it.owner.trim().lowercase() }
        .filter { it.startsWith("0x") && it.length == 42 }
        .distinct()

    for (owner in owners) {
      if (sharedOwnerLabels.containsKey(owner)) continue
      sharedOwnerLabels[owner] = shortAddr(owner)
      val handle =
        runCatching {
          withContext(Dispatchers.IO) {
            TempoNameRecordsApi.getPrimaryName(owner)
              ?: OnboardingRpcHelpers.getPrimaryName(owner)?.trim()?.takeIf { it.isNotBlank() }?.let { "$it.heaven" }
          }
        }
          .getOrNull()
          ?.trim()
          .orEmpty()
      if (handle.isNotBlank()) {
        sharedOwnerLabels[owner] = handle
      }
    }
  }

  DisposableEffect(hasPermission) {
    if (!hasPermission) {
      return@DisposableEffect onDispose {}
    }

    val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
      override fun onChange(selfChange: Boolean) {
        autoSyncJob?.cancel()
        autoSyncJob = scope.launch {
          delay(1200)
          runScan(context, onShowMessage, silent = true, setScanning = { scanning = it }, setTracks = { tracks = it }, setError = { error = it })
        }
      }
    }
    context.contentResolver.registerContentObserver(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, true, observer)
    onDispose {
      runCatching { context.contentResolver.unregisterContentObserver(observer) }
      autoSyncJob?.cancel()
      autoSyncJob = null
    }
  }

  Box(modifier = Modifier.fillMaxSize()) {
    Column(modifier = Modifier.fillMaxSize()) {
      when (view) {
      MusicView.Home -> {
        PirateMobileHeader(
          title = "Music",
          isAuthenticated = isAuthenticated,
          onAvatarPress = onOpenDrawer,
          rightSlot = {
            IconButton(
              onClick = { view = MusicView.Search },
            ) {
              Icon(
                Icons.Rounded.Search,
                contentDescription = "Search",
                tint = MaterialTheme.colorScheme.onBackground,
              )
            }
          },
        )
        MusicHomeView(
          sharedPlaylistCount = sharedPlaylists.size,
          sharedTrackCount = sharedTracks.size,
          sharedUnreadCount = sharedUnreadCount,
          playlistCount = displayPlaylists.size,
          playlists = displayPlaylists,
          newReleases = mergedNewReleases(recentPublishedReleases),
          onNavigateLibrary = { view = MusicView.Library },
          onNavigateShared = { view = MusicView.Shared },
          onNavigatePlaylists = { view = MusicView.Playlists },
          onOpenPlaylist = { pl ->
            selectedPlaylist = pl
            selectedPlaylistId = pl.id
            view = MusicView.PlaylistDetail
            scope.launch { loadPlaylistDetail(pl) }
          },
          onPlayRelease = { release ->
            val audioUrl = resolveReleaseAudioUrl(release.audioRef)
            if (audioUrl.isNullOrBlank()) {
              onShowMessage("This release is not playable yet")
              return@MusicHomeView
            }
            val coverUrl = resolveReleaseCoverUrl(release.coverRef)
            val track =
              MusicTrack(
                id = "release:${release.audioRef ?: "${release.title}-${release.artist}"}",
                title = release.title,
                artist = release.artist,
                album = "",
                durationSec = 0,
                uri = audioUrl,
                filename = "${release.title}.mp3",
                artworkUri = coverUrl,
                artworkFallbackUri = release.coverRef,
              )
            player.playTrack(track, listOf(track))
            onOpenPlayer()
          },
        )
      }

      MusicView.Library -> {
        PirateMobileHeader(
          title = "Library",
          onBackPress = { view = MusicView.Home },
          rightSlot = {
            IconButton(onClick = { view = MusicView.Search }) {
              Icon(
                Icons.Rounded.Search,
                contentDescription = "Search",
                tint = MaterialTheme.colorScheme.onBackground,
              )
            }
          },
        )
        LibraryView(
          hasPermission = hasPermission,
          requestPermission = { requestPermission.launch(permission) },
          tracks = tracks,
          scanning = scanning,
          error = error,
          currentTrackId = currentTrack?.id,
          isPlaying = isPlaying,
          onScan = {
            scope.launch {
              runScan(
                context,
                onShowMessage,
                silent = false,
                setScanning = { scanning = it },
                setTracks = { tracks = it },
                setError = { error = it },
              )
            }
          },
          onPlayTrack = { t ->
            if (currentTrack?.id == t.id) {
              player.togglePlayPause()
            } else {
              player.playTrack(t, tracks)
            }
            onOpenPlayer()
          },
          onTrackMenu = { t ->
            selectedTrack = t
            trackMenuOpen = true
          },
        )
      }

      MusicView.Search -> {
        PirateMobileHeader(
          title = "Search",
          onBackPress = {
            searchQuery = ""
            view = MusicView.Home
          },
        )
        SearchView(
          query = searchQuery,
          onQueryChange = { searchQuery = it },
          tracks = tracks,
          currentTrackId = currentTrack?.id,
          isPlaying = isPlaying,
          onPlayTrack = { t ->
            if (currentTrack?.id == t.id) {
              player.togglePlayPause()
            } else {
              player.playTrack(t, tracks)
            }
            onOpenPlayer()
          },
          onTrackMenu = { t ->
            selectedTrack = t
            trackMenuOpen = true
          },
        )
      }

      MusicView.Shared -> {
        PirateMobileHeader(
          title = "Shared With You",
          onBackPress = { view = MusicView.Home },
          rightSlot = {
            if (cloudPlayBusy || sharedLoading) {
              CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.primary,
              )
            } else {
              IconButton(
                onClick = {
                  scope.launch { loadShared(force = true) }
                },
              ) {
                Icon(
                  Icons.Rounded.Refresh,
                  contentDescription = "Refresh",
                  tint = MaterialTheme.colorScheme.onBackground,
                )
              }
            }
          },
        )
        SharedView(
          loading = sharedLoading,
          error = sharedError,
          sharedPlaylists = sharedPlaylists,
          sharedTracks = sharedTracks,
          isAuthenticated = isAuthenticated,
          ownerLabelFor = { owner -> sharedOwnerLabel(owner) },
          onOpenPlaylist = { pl ->
            sharedSelectedPlaylist = pl
            view = MusicView.SharedPlaylistDetail
          },
          onPlayTrack = { t ->
            scope.launch { playSharedCloudTrack(t) }
          },
          onDownloadTrack = { t ->
            scope.launch { downloadSharedTrackToDevice(t, notify = true) }
          },
        )
      }

      MusicView.Playlists -> {
        PirateMobileHeader(
          title = "Playlists",
          onBackPress = { view = MusicView.Home },
          rightSlot = {
            IconButton(onClick = { createPlaylistOpen = true }) {
              Icon(
                Icons.Rounded.Add,
                contentDescription = "Create playlist",
                tint = MaterialTheme.colorScheme.onBackground,
              )
            }
          },
        )
        PlaylistsView(
          loading = playlistsLoading,
          playlists = displayPlaylists,
          onOpenPlaylist = { pl ->
            selectedPlaylist = pl
            selectedPlaylistId = pl.id
            view = MusicView.PlaylistDetail
            scope.launch { loadPlaylistDetail(pl) }
          },
        )
      }

      MusicView.PlaylistDetail -> {
        // Recover selectedPlaylist from saveable ID after state loss (e.g. returning from Player)
        val pl = selectedPlaylist ?: displayPlaylists.find { it.id == selectedPlaylistId }?.also { selectedPlaylist = it }
        LaunchedEffect(pl) {
          if (pl != null && playlistDetailTracks.isEmpty() && !playlistDetailLoading) {
            loadPlaylistDetail(pl)
          }
        }
        PirateMobileHeader(
          title = pl?.name?.ifBlank { "Playlist" } ?: "Playlist",
          onBackPress = { view = MusicView.Playlists },
        )
        PlaylistDetailView(
          playlist = pl,
          loading = playlistDetailLoading,
          error = playlistDetailError,
          tracks = playlistDetailTracks,
          currentTrackId = currentTrack?.id,
          isPlaying = isPlaying,
          onPlayTrack = { t ->
            if (t.uri.isBlank()) {
              onShowMessage("This playlist track isn't available for playback on this device yet")
              return@PlaylistDetailView
            }
            val playable = playlistDetailTracks.filter { it.uri.isNotBlank() }
            if (currentTrack?.id == t.id) {
              player.togglePlayPause()
            } else {
              player.playTrack(t, playable)
            }
            onOpenPlayer()
          },
          onTrackMenu = { t ->
            if (t.uri.isBlank()) {
              onShowMessage("Track actions unavailable for this item")
              return@PlaylistDetailView
            }
            selectedTrack = t
            trackMenuOpen = true
          },
        )
      }

      MusicView.SharedPlaylistDetail -> {
        val share = sharedSelectedPlaylist
        PirateMobileHeader(
          title = share?.playlist?.name?.ifBlank { "Shared Playlist" } ?: "Shared Playlist",
          onBackPress = { view = MusicView.Shared },
          rightSlot = {
            if (share != null) {
              Box {
                IconButton(onClick = { sharedPlaylistMenuOpen = true }) {
                  Icon(
                    Icons.Rounded.MoreVert,
                    contentDescription = "Playlist actions",
                    tint = MaterialTheme.colorScheme.onBackground,
                  )
                }
                DropdownMenu(
                  expanded = sharedPlaylistMenuOpen,
                  onDismissRequest = { sharedPlaylistMenuOpen = false },
                ) {
                  DropdownMenuItem(
                    text = { Text("Refresh") },
                    onClick = {
                      sharedPlaylistMenuOpen = false
                      scope.launch { loadSharedPlaylistTracks(share, force = true) }
                    },
                  )
                  DropdownMenuItem(
                    text = { Text("Download to device") },
                    onClick = {
                      sharedPlaylistMenuOpen = false
                      if (sharedPlaylistTracks.isEmpty()) {
                        onShowMessage("No tracks to download")
                      } else {
                        scope.launch {
                          var ok = 0
                          for ((idx, track) in sharedPlaylistTracks.withIndex()) {
                            cloudPlayLabel = "Downloading ${idx + 1}/${sharedPlaylistTracks.size}: ${track.title}"
                            if (downloadSharedTrackToDevice(track, notify = false)) ok += 1
                          }
                          onShowMessage("Downloaded $ok/${sharedPlaylistTracks.size} tracks")
                        }
                      }
                    },
                  )
                }
              }
            }
          },
        )
        SharedPlaylistDetailView(
          loading = sharedPlaylistLoading || sharedPlaylistRefreshing,
          error = sharedPlaylistError,
          share = share,
          sharedByLabel = share?.let { sharedOwnerLabel(it.owner) },
          tracks = sharedPlaylistTracks,
          currentTrackId = currentTrack?.id,
          isPlaying = isPlaying,
          onPlayTrack = { t ->
            scope.launch { playSharedCloudTrack(t) }
          },
          onDownloadTrack = { t ->
            scope.launch { downloadSharedTrackToDevice(t, notify = true) }
          },
          onShowMessage = onShowMessage,
        )
      }
    }
  }

    if (cloudPlayBusy) {
      Surface(
        modifier = Modifier
          .align(Alignment.BottomCenter)
          .padding(horizontal = 16.dp, vertical = 18.dp),
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.extraLarge,
        shadowElevation = 4.dp,
      ) {
        Row(
          modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
          horizontalArrangement = Arrangement.spacedBy(10.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          CircularProgressIndicator(
            modifier = Modifier.size(18.dp),
            strokeWidth = 2.dp,
            color = MaterialTheme.colorScheme.primary,
          )
          Text(
            text = cloudPlayLabel ?: "Decrypting...",
            color = MaterialTheme.colorScheme.onSurface,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
          )
        }
      }
    }
  }

  TrackMenuSheet(
    open = trackMenuOpen,
    track = selectedTrack,
    onClose = { trackMenuOpen = false },
    onUpload = { t ->
      if (uploadBusy) {
        onShowMessage("Upload already in progress")
        return@TrackMenuSheet
      }
      if (!isAuthenticated || ownerEthAddress.isNullOrBlank()) {
        onShowMessage("Sign in to upload")
        return@TrackMenuSheet
      }

      uploadBusy = true
      scope.launch {
        onShowMessage("Uploading...")
        val result =
          runCatching {
            TrackUploadService.uploadEncrypted(
              context = context,
              ownerEthAddress = ownerEthAddress,
              track = t,
              hostActivity = hostActivity,
              tempoAccount = tempoAccount,
            )
          }
        uploadBusy = false

        result.onFailure { err ->
          onShowMessage("Upload failed: ${err.message ?: "unknown error"}")
        }
        result.onSuccess { ok ->
          val next =
            tracks.map { tr ->
              if (tr.id != t.id) tr
              else
                tr.copy(
                  contentId = ok.contentId,
                  pieceCid = ok.pieceCid,
                  datasetOwner = ok.datasetOwner,
                  algo = ok.algo,
                )
            }
          tracks = next
          MusicLibrary.saveCachedTracks(context, next)

          onShowMessage("Uploaded.")
        }
      }
    },
    onSaveForever = { t ->
      if (uploadBusy) {
        onShowMessage("Upload already in progress")
        return@TrackMenuSheet
      }
      if (!isAuthenticated || ownerEthAddress.isNullOrBlank()) {
        onShowMessage("Sign in to save forever")
        return@TrackMenuSheet
      }
      if (t.savedForever) {
        onShowMessage("Already saved forever")
        return@TrackMenuSheet
      }

      uploadBusy = true
      scope.launch {
        if (!t.pieceCid.isNullOrBlank()) {
          uploadBusy = false
          val next = tracks.map { tr -> if (tr.id == t.id) tr.copy(savedForever = true) else tr }
          tracks = next
          MusicLibrary.saveCachedTracks(context, next)
          onShowMessage("Marked Saved Forever (already uploaded).")
          return@launch
        }

        onShowMessage("Saving Forever...")
        val result =
          runCatching {
            TrackUploadService.uploadEncrypted(
              context = context,
              ownerEthAddress = ownerEthAddress,
              track = t,
              hostActivity = hostActivity,
              tempoAccount = tempoAccount,
            )
          }
        uploadBusy = false

        result.onFailure { err ->
          onShowMessage("Save Forever failed: ${err.message ?: "unknown error"}")
        }
        result.onSuccess { ok ->
          val next =
            tracks.map { tr ->
              if (tr.id != t.id) tr
              else {
                val base =
                  tr.copy(
                    contentId = ok.contentId,
                    pieceCid = ok.pieceCid,
                    datasetOwner = ok.datasetOwner,
                    algo = ok.algo,
                  )

                base.copy(savedForever = true)
              }
            }
          tracks = next
          MusicLibrary.saveCachedTracks(context, next)

          onShowMessage("Upload complete and saved forever.")
        }
      }
    },
    onDownload = { t ->
      scope.launch {
        val owner = ownerEthAddress?.trim()
        val result =
          UploadedTrackActions.downloadUploadedTrackToDevice(
            context = context,
            track = t,
            ownerAddress = owner ?: t.datasetOwner,
            granteeAddress = owner,
          )
        if (!result.success) {
          onShowMessage("Download failed: ${result.error ?: "unknown error"}")
          return@launch
        }
        runScan(
          context = context,
          onShowMessage = onShowMessage,
          silent = true,
          setScanning = { scanning = it },
          setTracks = { tracks = it },
          setError = { error = it },
        )
        onShowMessage(if (result.alreadyDownloaded) "Already downloaded" else "Downloaded to device")
      }
    },
    onShare = { t ->
      if (!isAuthenticated || ownerEthAddress.isNullOrBlank()) {
        onShowMessage("Sign in to share")
        return@TrackMenuSheet
      }
      shareTrack = t
      shareRecipientInput = ""
    },
    onAddToPlaylist = { t ->
      selectedTrack = t
      addToPlaylistOpen = true
    },
    onAddToQueue = { onShowMessage("Add to queue coming soon") },
    onGoToAlbum = { onShowMessage("Album view coming soon") },
    onGoToArtist = { onShowMessage("Artist view coming soon") },
  )

  // TODO: Playlist sheets need Tempo migration (currently still use PlaylistV1LitAction)
  // CreatePlaylistSheet(...)
  // AddToPlaylistSheet(...)

  if (shareTrack != null) {
    val activeTrack = shareTrack!!
    AlertDialog(
      onDismissRequest = {
        if (!shareBusy) {
          shareTrack = null
          shareRecipientInput = ""
        }
      },
      title = { Text("Share Track") },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          Text(
            text = "Enter wallet address, .heaven, or .pirate name.",
            style = MaterialTheme.typography.bodyMedium,
          )
          OutlinedTextField(
            value = shareRecipientInput,
            onValueChange = { if (!shareBusy) shareRecipientInput = it },
            singleLine = true,
            label = { Text("Recipient") },
            placeholder = { Text("0x..., alice.heaven, bob.pirate") },
            enabled = !shareBusy,
            modifier = Modifier.fillMaxWidth(),
          )
        }
      },
      confirmButton = {
        TextButton(
          enabled = !shareBusy && shareRecipientInput.trim().isNotEmpty(),
          onClick = {
            val owner = ownerEthAddress
            if (owner.isNullOrBlank()) {
              onShowMessage("Missing share credentials")
              return@TextButton
            }
            shareBusy = true
            scope.launch {
              val result =
                UploadedTrackActions.shareUploadedTrack(
                  context = context,
                  track = activeTrack,
                  recipient = shareRecipientInput,
                  ownerAddress = owner,
                )
              shareBusy = false
              if (!result.success) {
                onShowMessage("Share failed: ${result.error ?: "unknown error"}")
                return@launch
              }
              shareTrack = null
              shareRecipientInput = ""
              val target = result.recipientAddress?.let { shortAddr(it) } ?: "recipient"
              onShowMessage("Shared with $target")
            }
          },
        ) {
          Text(if (shareBusy) "Sharing..." else "Share")
        }
      },
      dismissButton = {
        TextButton(
          enabled = !shareBusy,
          onClick = {
            shareTrack = null
            shareRecipientInput = ""
          },
        ) { Text("Cancel") }
      },
    )
  }
}

@Composable
private fun MusicHomeView(
  sharedPlaylistCount: Int,
  sharedTrackCount: Int,
  sharedUnreadCount: Int,
  playlistCount: Int,
  playlists: List<PlaylistDisplayItem>,
  newReleases: List<AlbumCardModel>,
  onNavigateLibrary: () -> Unit,
  onNavigateShared: () -> Unit,
  onNavigatePlaylists: () -> Unit,
  onOpenPlaylist: (PlaylistDisplayItem) -> Unit,
  onPlayRelease: (AlbumCardModel) -> Unit,
) {
  val sharedCount = sharedPlaylistCount + sharedTrackCount
  val sharedSubtitle =
    when {
      sharedPlaylistCount > 0 && sharedTrackCount > 0 ->
        "$sharedPlaylistCount playlist${if (sharedPlaylistCount == 1) "" else "s"} · $sharedTrackCount song${if (sharedTrackCount == 1) "" else "s"}"
      sharedPlaylistCount > 0 ->
        "$sharedPlaylistCount playlist${if (sharedPlaylistCount == 1) "" else "s"}"
      else ->
        "$sharedTrackCount song${if (sharedTrackCount == 1) "" else "s"}"
    }

  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(bottom = 16.dp),
  ) {
    item {
      Column(modifier = Modifier.padding(top = 4.dp, bottom = 8.dp)) {
        EntryRow(
          icon = Icons.AutoMirrored.Rounded.List,
          iconTint = MaterialTheme.colorScheme.onSecondaryContainer,
          iconBg = MaterialTheme.colorScheme.secondaryContainer,
          title = "Library",
          subtitle = "On device",
          badge = null,
          onClick = onNavigateLibrary,
        )
        EntryRow(
          icon = Icons.Rounded.Inbox,
          iconTint = MaterialTheme.colorScheme.onPrimaryContainer,
          iconBg = MaterialTheme.colorScheme.primaryContainer,
          title = "Shared With You",
          subtitle = sharedSubtitle,
          badge = if (sharedUnreadCount > 0) "$sharedUnreadCount" else null,
          onClick = onNavigateShared,
        )
        EntryRow(
          icon = Icons.AutoMirrored.Rounded.PlaylistPlay,
          iconTint = MaterialTheme.colorScheme.onTertiary,
          iconBg = MaterialTheme.colorScheme.tertiary.copy(alpha = 0.18f),
          title = "Playlists",
          subtitle = "$playlistCount playlist${if (playlistCount == 1) "" else "s"}",
          badge = null,
          onClick = onNavigatePlaylists,
        )
      }
    }

    if (newReleases.isNotEmpty()) {
      item {
        SectionHeader(title = "New Releases", action = "See all", onAction = { /* TODO */ })
        LazyRow(
          contentPadding = PaddingValues(horizontal = 20.dp),
          horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
          items(newReleases) { item ->
            val releaseAudioUrl = resolveReleaseAudioUrl(item.audioRef)
            AlbumCard(
              title = item.title,
              artist = item.artist,
              imageUri = resolveReleaseCoverUrl(item.coverRef),
              imageFallbackUri = item.coverRef,
              onClick = if (!releaseAudioUrl.isNullOrBlank()) ({ onPlayRelease(item) }) else null,
            )
          }
        }
        Spacer(modifier = Modifier.height(28.dp))
      }
    }

    if (playlists.isNotEmpty()) {
      item {
        SectionHeader(title = "Your Playlists", action = "See all", onAction = onNavigatePlaylists)
        LazyRow(
          contentPadding = PaddingValues(horizontal = 20.dp),
          horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
          items(playlists.take(6)) { pl ->
            PlaylistCard(playlist = pl, onClick = { onOpenPlaylist(pl) })
          }
        }
        Spacer(modifier = Modifier.height(12.dp))
      }
    }
  }
}

@Composable
private fun EntryRow(
  icon: androidx.compose.ui.graphics.vector.ImageVector,
  iconTint: Color,
  iconBg: Color,
  title: String,
  subtitle: String,
  badge: String?,
  onClick: () -> Unit,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .height(72.dp)
      .clickable(onClick = onClick)
      .padding(horizontal = 16.dp),
    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Box(
      modifier = Modifier
        .size(48.dp)
        .clip(MaterialTheme.shapes.medium)
        .padding(0.dp),
      contentAlignment = androidx.compose.ui.Alignment.Center,
    ) {
      Surface(
        modifier = Modifier.fillMaxSize(),
        color = iconBg,
        shape = MaterialTheme.shapes.medium,
      ) {
        Box(contentAlignment = androidx.compose.ui.Alignment.Center) {
          Icon(icon, contentDescription = null, tint = iconTint)
        }
      }
    }

    Column(modifier = Modifier.weight(1f)) {
      Text(title, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onBackground)
      Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }

    if (!badge.isNullOrBlank()) {
      Surface(
        color = MaterialTheme.colorScheme.primary,
        shape = MaterialTheme.shapes.extraLarge,
      ) {
        Text(
          badge,
          modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
          color = MaterialTheme.colorScheme.onPrimary,
          style = MaterialTheme.typography.labelMedium,
          fontWeight = FontWeight.SemiBold,
        )
      }
    } else {
      Icon(
        Icons.Rounded.ChevronRight,
        contentDescription = null,
        tint = PiratePalette.TextMuted,
      )
    }
  }
}

@Composable
private fun SectionHeader(
  title: String,
  action: String? = null,
  onAction: (() -> Unit)? = null,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .padding(horizontal = 20.dp, vertical = 14.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
  ) {
    Text(
      title,
      fontWeight = FontWeight.Bold,
      color = MaterialTheme.colorScheme.onBackground,
      style = MaterialTheme.typography.titleMedium,
    )
    if (!action.isNullOrBlank() && onAction != null) {
      Text(
        action,
        modifier = Modifier.clickable(onClick = onAction),
        color = MaterialTheme.colorScheme.primary,
        fontWeight = FontWeight.SemiBold,
      )
    }
  }
}

@Composable
private fun AlbumCard(
  title: String,
  artist: String,
  imageUri: String? = null,
  imageFallbackUri: String? = null,
  onClick: (() -> Unit)? = null,
) {
  var displayImageUri by remember(imageUri, imageFallbackUri) { mutableStateOf(imageUri) }

  fun handleImageError() {
    val fallback = imageFallbackUri?.trim().orEmpty()
    if (fallback.isNotBlank() && fallback != displayImageUri) {
      displayImageUri = fallback
      return
    }
    displayImageUri = null
  }

  Column(
    modifier =
      Modifier
        .width(140.dp)
        .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
  ) {
    Surface(
      modifier = Modifier.size(140.dp),
      color = MaterialTheme.colorScheme.surfaceVariant,
      shape = MaterialTheme.shapes.large,
    ) {
      Box(contentAlignment = androidx.compose.ui.Alignment.Center) {
        if (!displayImageUri.isNullOrBlank()) {
          AsyncImage(
            model = displayImageUri,
            contentDescription = "Cover art",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
            onError = { handleImageError() },
          )
        } else {
          Icon(Icons.Rounded.MusicNote, contentDescription = null, tint = PiratePalette.TextMuted, modifier = Modifier.size(24.dp))
        }
      }
    }
    Spacer(modifier = Modifier.height(10.dp))
    Text(
      title,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      color = MaterialTheme.colorScheme.onBackground,
      fontWeight = FontWeight.Medium,
    )
    Text(
      artist,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      color = PiratePalette.TextMuted,
    )
  }
}

@Composable
private fun PlaylistCard(
  playlist: PlaylistDisplayItem,
  onClick: () -> Unit,
) {
  Column(
    modifier = Modifier
      .width(140.dp)
      .clickable(onClick = onClick),
  ) {
    Surface(
      modifier = Modifier.size(140.dp),
      color = MaterialTheme.colorScheme.surfaceVariant,
      shape = MaterialTheme.shapes.large,
    ) {
      Box(contentAlignment = androidx.compose.ui.Alignment.Center) {
        if (!playlist.coverUri.isNullOrBlank()) {
          AsyncImage(
            model = playlist.coverUri,
            contentDescription = "Playlist cover",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
          )
        } else {
          Icon(Icons.Rounded.MusicNote, contentDescription = null, tint = PiratePalette.TextMuted, modifier = Modifier.size(24.dp))
        }
      }
    }
    Spacer(modifier = Modifier.height(10.dp))
    Text(
      playlist.name,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      color = MaterialTheme.colorScheme.onBackground,
      fontWeight = FontWeight.Medium,
    )
    Text(
      "${playlist.trackCount} track${if (playlist.trackCount == 1) "" else "s"}",
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      color = PiratePalette.TextMuted,
    )
  }
}

@Composable
private fun LibraryView(
  hasPermission: Boolean,
  requestPermission: () -> Unit,
  tracks: List<MusicTrack>,
  scanning: Boolean,
  error: String?,
  currentTrackId: String?,
  isPlaying: Boolean,
  onScan: () -> Unit,
  onPlayTrack: (MusicTrack) -> Unit,
  onTrackMenu: (MusicTrack) -> Unit,
) {
  if (!hasPermission) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(20.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Text("Permission required to read your music library.", color = MaterialTheme.colorScheme.onSurfaceVariant)
      Button(onClick = requestPermission) { Text("Grant Permission") }
    }
    return
  }

  Column(modifier = Modifier.fillMaxSize()) {
    FilterSortBar(
      left = "Filter: All",
      right = "Sort: Recent",
      onLeft = { /* TODO */ },
      onRight = { /* TODO */ },
    )

    if (!error.isNullOrBlank()) {
      Text(
        text = error,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
    }

    if (tracks.isEmpty() && !scanning) {
      EmptyState(
        title = "No songs in your library yet",
        actionLabel = "Scan device",
        onAction = onScan,
      )
      return
    }

    if (scanning && tracks.isEmpty()) {
      EmptyState(
        title = "Scanning your device...",
        actionLabel = null,
        onAction = null,
      )
      return
    }

    LazyColumn(
      modifier = Modifier.fillMaxSize(),
      contentPadding = PaddingValues(bottom = 12.dp),
    ) {
      items(tracks, key = { it.id }) { t ->
        TrackItemRow(
          track = t,
          isActive = currentTrackId == t.id,
          isPlaying = currentTrackId == t.id && isPlaying,
          onPress = { onPlayTrack(t) },
          onMenuPress = { onTrackMenu(t) },
        )
      }
    }
  }
}

@Composable
private fun SearchView(
  query: String,
  onQueryChange: (String) -> Unit,
  tracks: List<MusicTrack>,
  currentTrackId: String?,
  isPlaying: Boolean,
  onPlayTrack: (MusicTrack) -> Unit,
  onTrackMenu: (MusicTrack) -> Unit,
) {
  val focusRequester = remember { FocusRequester() }
  LaunchedEffect(Unit) { focusRequester.requestFocus() }

  val q = query.trim()
  val results =
    remember(tracks, q) {
      if (q.isBlank()) {
        tracks
      } else {
        val needle = q.lowercase()
        tracks.filter { t ->
          t.title.lowercase().contains(needle) ||
            t.artist.lowercase().contains(needle) ||
            t.album.lowercase().contains(needle)
        }
      }
    }

  Column(modifier = Modifier.fillMaxSize()) {
    OutlinedTextField(
      value = query,
      onValueChange = onQueryChange,
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 16.dp, vertical = 10.dp)
        .focusRequester(focusRequester),
      singleLine = true,
      placeholder = { Text("Search your library") },
    )

    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

    LazyColumn(
      modifier = Modifier.fillMaxSize(),
      contentPadding = PaddingValues(bottom = 12.dp),
    ) {
      items(results, key = { it.id }) { t ->
        TrackItemRow(
          track = t,
          isActive = currentTrackId == t.id,
          isPlaying = currentTrackId == t.id && isPlaying,
          onPress = { onPlayTrack(t) },
          onMenuPress = { onTrackMenu(t) },
        )
      }
    }
  }
}

@Composable
private fun FilterSortBar(
  left: String,
  right: String,
  onLeft: () -> Unit,
  onRight: () -> Unit,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .padding(horizontal = 16.dp, vertical = 10.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
  ) {
    FilterSortPill(label = left, onClick = onLeft)
    FilterSortPill(label = right, onClick = onRight)
  }
}

@Composable
private fun FilterSortPill(
  label: String,
  onClick: () -> Unit,
) {
  Surface(
    modifier = Modifier.clickable(onClick = onClick),
    color = MaterialTheme.colorScheme.surfaceVariant,
    shape = MaterialTheme.shapes.extraLarge,
  ) {
    Row(
      modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
      verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
      Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
      Icon(Icons.Rounded.ArrowDropDown, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
  }
}

@Composable
private fun EmptyState(
  title: String,
  actionLabel: String?,
  onAction: (() -> Unit)?,
) {
  Column(
    modifier = Modifier
      .fillMaxWidth()
      .padding(horizontal = 20.dp, vertical = 28.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Text(title, color = MaterialTheme.colorScheme.onBackground, fontWeight = FontWeight.SemiBold)
    if (!actionLabel.isNullOrBlank() && onAction != null) {
      OutlinedButton(onClick = onAction) {
        Icon(Icons.Rounded.FolderOpen, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Spacer(modifier = Modifier.width(8.dp))
        Text(actionLabel, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
      }
    }
  }
}

@Composable
private fun SharedView(
  loading: Boolean,
  error: String?,
  sharedPlaylists: List<PlaylistShareEntry>,
  sharedTracks: List<SharedCloudTrack>,
  isAuthenticated: Boolean,
  ownerLabelFor: (String) -> String,
  onOpenPlaylist: (PlaylistShareEntry) -> Unit,
  onPlayTrack: (SharedCloudTrack) -> Unit,
  onDownloadTrack: (SharedCloudTrack) -> Unit,
) {
  if (!isAuthenticated) {
    EmptyState(title = "Sign in to view shared items", actionLabel = null, onAction = null)
    return
  }

  val total = sharedPlaylists.size + sharedTracks.size

  Column(modifier = Modifier.fillMaxSize()) {
    if (!error.isNullOrBlank()) {
      Text(
        text = error,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp),
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodyMedium,
      )
    }

    fun coverUrl(coverCid: String?): String? {
      return CoverRef.resolveCoverUrl(coverCid, width = 140, height = 140, format = "webp", quality = 80)
    }

    fun toRowTrack(t: SharedCloudTrack): MusicTrack {
      return MusicTrack(
        id = t.contentId.ifBlank { t.trackId },
        title = t.title,
        artist = t.artist,
        album = t.album,
        durationSec = t.durationSec,
        uri = "",
        filename = "",
        artworkUri = coverUrl(t.coverCid),
        contentId = t.contentId,
        pieceCid = t.pieceCid,
        datasetOwner = t.datasetOwner,
        algo = t.algo,
      )
    }

    if (total == 0) {
      // Avoid flashing an empty state while the initial request is still loading.
      if (!loading) {
        EmptyState(title = "Nothing shared with you yet", actionLabel = null, onAction = null)
      }
      return
    }

    LazyColumn(
      modifier = Modifier.fillMaxSize(),
      contentPadding = PaddingValues(bottom = 12.dp),
    ) {
      if (sharedPlaylists.isNotEmpty()) {
        item {
          Text(
            text = "Playlists",
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp),
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.SemiBold,
          )
        }

        items(sharedPlaylists, key = { it.id }) { share ->
          SharedPlaylistRow(
            share = share,
            coverUrl = coverUrl(share.playlist.coverCid),
            ownerLabel = ownerLabelFor(share.owner),
            onClick = { onOpenPlaylist(share) },
          )
        }

        item { HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) }
      }

      if (sharedTracks.isNotEmpty()) {
        item {
          Text(
            text = "Songs",
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp),
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.SemiBold,
          )
        }

        items(sharedTracks, key = { it.contentId.ifBlank { it.trackId } }) { t ->
          val rowTrack = toRowTrack(t)
          TrackItemRow(
            track = rowTrack,
            isActive = false,
            isPlaying = false,
            onPress = { onPlayTrack(t) },
            onMenuPress = { onDownloadTrack(t) },
          )
        }
      }
    }
  }
}

@Composable
private fun SharedPlaylistRow(
  share: PlaylistShareEntry,
  coverUrl: String?,
  ownerLabel: String,
  onClick: () -> Unit,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .height(72.dp)
      .clickable(onClick = onClick)
      .padding(horizontal = 16.dp),
    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Surface(
      modifier = Modifier.size(48.dp),
      color = MaterialTheme.colorScheme.surfaceVariant,
      shape = MaterialTheme.shapes.medium,
    ) {
      Box(contentAlignment = androidx.compose.ui.Alignment.Center) {
        if (!coverUrl.isNullOrBlank()) {
          AsyncImage(
            model = coverUrl,
            contentDescription = "Playlist cover",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
            onError = { Log.w(TAG_SHARED, "playlist cover failed url=$coverUrl") },
          )
        } else {
          Icon(
            Icons.AutoMirrored.Rounded.PlaylistPlay,
            contentDescription = null,
            tint = PiratePalette.TextMuted,
            modifier = Modifier.size(20.dp),
          )
        }
      }
    }

    Column(modifier = Modifier.weight(1f)) {
      val name = share.playlist.name.ifBlank { "Shared playlist" }
      Text(
        name,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        fontWeight = FontWeight.Medium,
        color = MaterialTheme.colorScheme.onBackground,
      )
      Text(
        "${share.trackCount} track${if (share.trackCount == 1) "" else "s"} · shared by $ownerLabel",
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        color = PiratePalette.TextMuted,
      )
    }

    Icon(Icons.Rounded.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
  }
}

@Composable
private fun SharedPlaylistDetailView(
  loading: Boolean,
  error: String?,
  share: PlaylistShareEntry?,
  sharedByLabel: String?,
  tracks: List<SharedCloudTrack>,
  currentTrackId: String?,
  isPlaying: Boolean,
  onPlayTrack: (SharedCloudTrack) -> Unit,
  onDownloadTrack: (SharedCloudTrack) -> Unit,
  onShowMessage: (String) -> Unit,
) {
  val pl = share?.playlist
  if (pl == null) {
    EmptyState(title = "Playlist not found", actionLabel = null, onAction = null)
    return
  }

  fun coverUrl(coverCid: String?): String? {
    return CoverRef.resolveCoverUrl(coverCid, width = 140, height = 140, format = "webp", quality = 80)
  }

  fun toRowTrack(t: SharedCloudTrack): MusicTrack {
    return MusicTrack(
      id = t.contentId.ifBlank { t.trackId },
      title = t.title,
      artist = t.artist,
      album = t.album,
      durationSec = t.durationSec,
      uri = "",
      filename = "",
      artworkUri = coverUrl(t.coverCid),
      contentId = t.contentId,
      pieceCid = t.pieceCid,
      datasetOwner = t.datasetOwner,
      algo = t.algo,
    )
  }

  Column(modifier = Modifier.fillMaxSize()) {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 16.dp, vertical = 12.dp),
      horizontalArrangement = Arrangement.spacedBy(12.dp),
      verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    ) {
      Surface(
        modifier = Modifier.size(72.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.large,
      ) {
        Box(contentAlignment = androidx.compose.ui.Alignment.Center) {
          val url = coverUrl(pl.coverCid)
          if (!url.isNullOrBlank()) {
            AsyncImage(
              model = url,
              contentDescription = "Playlist cover",
              contentScale = ContentScale.Crop,
              modifier = Modifier.fillMaxSize(),
              onError = { Log.w(TAG_SHARED, "playlist cover failed url=$url") },
            )
          } else {
            Icon(
              Icons.AutoMirrored.Rounded.PlaylistPlay,
              contentDescription = null,
              tint = PiratePalette.TextMuted,
              modifier = Modifier.size(28.dp),
            )
          }
        }
      }

      Column(modifier = Modifier.weight(1f)) {
        Text(
          pl.name.ifBlank { "Shared playlist" },
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
          color = MaterialTheme.colorScheme.onBackground,
          fontWeight = FontWeight.SemiBold,
          style = MaterialTheme.typography.titleMedium,
        )
        Text(
          "${share.trackCount} track${if (share.trackCount == 1) "" else "s"} · shared by ${sharedByLabel ?: "unknown"}",
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
          color = PiratePalette.TextMuted,
        )
      }
    }

    if (!error.isNullOrBlank()) {
      Text(
        text = error,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp),
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodyMedium,
      )
    }

    if (tracks.isEmpty()) {
      if (loading) {
        SharedPlaylistTracksSkeleton()
        return
      }

      if (!loading) {
        EmptyState(title = "No tracks in this playlist", actionLabel = null, onAction = null)
      }
      return
    }

    LazyColumn(
      modifier = Modifier.fillMaxSize(),
      contentPadding = PaddingValues(bottom = 12.dp),
    ) {
      items(tracks, key = { it.contentId.ifBlank { it.trackId } }) { t ->
        val rowTrack = toRowTrack(t)
        val id = rowTrack.id
        TrackItemRow(
          track = rowTrack,
          isActive = currentTrackId == id,
          isPlaying = currentTrackId == id && isPlaying,
          onPress = { onPlayTrack(t) },
          onMenuPress = { onDownloadTrack(t) },
        )
      }
    }
  }
}

@Composable
private fun SharedPlaylistTracksSkeleton() {
  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(bottom = 12.dp),
  ) {
    items(6) {
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .height(72.dp)
          .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        Surface(
          modifier = Modifier.size(48.dp),
          color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f),
          shape = MaterialTheme.shapes.medium,
        ) {}
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Surface(
            modifier = Modifier
              .fillMaxWidth(0.7f)
              .height(14.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f),
            shape = MaterialTheme.shapes.small,
          ) {}
          Surface(
            modifier = Modifier
              .fillMaxWidth(0.45f)
              .height(12.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
            shape = MaterialTheme.shapes.small,
          ) {}
        }
        Surface(
          modifier = Modifier.size(24.dp),
          color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
          shape = MaterialTheme.shapes.small,
        ) {}
      }
    }
  }
}

@Composable
private fun PlaylistsView(
  loading: Boolean,
  playlists: List<PlaylistDisplayItem>,
  onOpenPlaylist: (PlaylistDisplayItem) -> Unit,
) {
  if (loading) {
    EmptyState(title = "Loading playlists...", actionLabel = null, onAction = null)
    return
  }

  if (playlists.isEmpty()) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(horizontal = 20.dp, vertical = 28.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      Text("No playlists yet", color = MaterialTheme.colorScheme.onBackground, fontWeight = FontWeight.SemiBold)
      Text("Add tracks to a playlist from the track menu", color = PiratePalette.TextMuted)
    }
    return
  }

  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(bottom = 12.dp),
  ) {
    items(playlists, key = { it.id }) { pl ->
      PlaylistRow(playlist = pl, onClick = { onOpenPlaylist(pl) })
    }
  }
}

@Composable
private fun PlaylistDetailView(
  playlist: PlaylistDisplayItem?,
  loading: Boolean,
  error: String?,
  tracks: List<MusicTrack>,
  currentTrackId: String?,
  isPlaying: Boolean,
  onPlayTrack: (MusicTrack) -> Unit,
  onTrackMenu: (MusicTrack) -> Unit,
) {
  if (playlist == null) {
    EmptyState(title = "Playlist not found", actionLabel = null, onAction = null)
    return
  }

  Column(modifier = Modifier.fillMaxSize()) {
    Text(
      text = "${tracks.size} track${if (tracks.size == 1) "" else "s"}${if (!playlist.isLocal) " · on-chain" else ""}",
      modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp),
      color = MaterialTheme.colorScheme.onSurfaceVariant,
      style = MaterialTheme.typography.bodyMedium,
    )

    if (!error.isNullOrBlank()) {
      Text(
        text = error,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp),
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodyMedium,
      )
    }

    if (tracks.isEmpty()) {
      if (loading) {
        SharedPlaylistTracksSkeleton()
        return
      }
      EmptyState(title = "No tracks in this playlist", actionLabel = null, onAction = null)
      return
    }

    LazyColumn(
      modifier = Modifier.fillMaxSize(),
      contentPadding = PaddingValues(bottom = 12.dp),
    ) {
      items(tracks, key = { it.id }) { t ->
        val id = t.id
        TrackItemRow(
          track = t,
          isActive = currentTrackId == id,
          isPlaying = currentTrackId == id && isPlaying,
          onPress = { onPlayTrack(t) },
          onMenuPress = { onTrackMenu(t) },
        )
      }
    }
  }
}

@Composable
private fun PlaylistRow(
  playlist: PlaylistDisplayItem,
  onClick: () -> Unit,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .height(72.dp)
      .clickable(onClick = onClick)
      .padding(horizontal = 16.dp),
    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Surface(
      modifier = Modifier.size(48.dp),
      color = MaterialTheme.colorScheme.surfaceVariant,
      shape = MaterialTheme.shapes.medium,
    ) {
      Box(contentAlignment = androidx.compose.ui.Alignment.Center) {
        if (!playlist.coverUri.isNullOrBlank()) {
          AsyncImage(
            model = playlist.coverUri,
            contentDescription = "Playlist cover",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
          )
        } else {
          Icon(Icons.Rounded.MusicNote, contentDescription = null, tint = PiratePalette.TextMuted, modifier = Modifier.size(20.dp))
        }
      }
    }

    Column(modifier = Modifier.weight(1f)) {
      Text(
        playlist.name,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        fontWeight = FontWeight.Medium,
        color = MaterialTheme.colorScheme.onBackground,
      )
      Text(
        "${playlist.trackCount} track${if (playlist.trackCount == 1) "" else "s"}",
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        color = PiratePalette.TextMuted,
      )
    }

    if (!playlist.isLocal) {
      Text("on-chain", color = PiratePalette.TextMuted)
    }
  }
}

private fun mimeToExt(mimeType: String?): String {
  val m = mimeType?.trim()?.lowercase().orEmpty()
  return when (m) {
    "audio/mpeg", "audio/mp3" -> "mp3"
    "audio/flac" -> "flac"
    "audio/wav", "audio/x-wav", "audio/wave" -> "wav"
    "audio/aac" -> "aac"
    "audio/ogg" -> "ogg"
    "audio/mp4", "audio/m4a" -> "m4a"
    else -> "bin"
  }
}

private fun extToMime(ext: String?): String? {
  val e = ext?.trim()?.lowercase().orEmpty()
  return when (e) {
    "mp3" -> "audio/mpeg"
    "flac" -> "audio/flac"
    "wav" -> "audio/wav"
    "aac" -> "audio/aac"
    "ogg" -> "audio/ogg"
    "m4a", "mp4" -> "audio/mp4"
    else -> null
  }
}

private suspend fun runScan(
  context: android.content.Context,
  onShowMessage: (String) -> Unit,
  silent: Boolean,
  setScanning: (Boolean) -> Unit,
  setTracks: (List<MusicTrack>) -> Unit,
  setError: (String?) -> Unit,
) {
  // Guard against overlapping scans; `scope` is stable per composition, but callers can still spam.
  // Use the UI state lock for now.
  // (If this becomes flaky, move scanning to a ViewModel with an atomic guard.)
  setScanning(true)
  setError(null)
  val result = runCatching { MusicLibrary.scanDeviceTracks(context) }
  result.onFailure { err ->
    setScanning(false)
    setError(err.message ?: "Failed to scan")
    if (!silent) onShowMessage(err.message ?: "Scan failed")
  }
  result.onSuccess { list ->
    val cached = runCatching { MusicLibrary.loadCachedTracks(context) }.getOrElse { emptyList() }
    val cachedById = cached.associateBy { it.id }
    val downloadedByUri =
      runCatching { DownloadedTracksStore.load(context).values.associateBy { it.mediaUri } }
        .getOrElse { emptyMap() }

    val merged =
      list.map { scanned ->
        val downloaded = downloadedByUri[scanned.uri]
        if (downloaded != null) {
          val mergedTitle =
            when {
              scanned.title.isBlank() -> downloaded.title
              scanned.title == "(untitled)" && downloaded.title.isNotBlank() -> downloaded.title
              else -> scanned.title
            }
          val mergedArtist =
            when {
              scanned.artist.isBlank() -> downloaded.artist
              scanned.artist.equals("unknown artist", ignoreCase = true) && downloaded.artist.isNotBlank() -> downloaded.artist
              else -> scanned.artist
            }
          val mergedAlbum = if (scanned.album.isBlank()) downloaded.album else scanned.album

          return@map scanned.copy(
            title = mergedTitle,
            artist = mergedArtist,
            album = mergedAlbum,
            contentId = downloaded.contentId,
            pieceCid = null,
            datasetOwner = null,
            algo = null,
            savedForever = false,
          )
        }

        val prior = cachedById[scanned.id] ?: return@map scanned
        scanned.copy(
          contentId = prior.contentId,
          pieceCid = prior.pieceCid,
          datasetOwner = prior.datasetOwner,
          algo = prior.algo,
          savedForever = prior.savedForever,
        )
      }

    setTracks(merged)
    MusicLibrary.saveCachedTracks(context, merged)
    setScanning(false)
  }
}
