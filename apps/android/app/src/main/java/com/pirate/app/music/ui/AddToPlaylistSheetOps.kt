package com.pirate.app.music.ui

import android.content.Context
import androidx.fragment.app.FragmentActivity
import com.pirate.app.music.LocalPlaylist
import com.pirate.app.music.LocalPlaylistTrack
import com.pirate.app.music.LocalPlaylistsStore
import com.pirate.app.music.MusicTrack
import com.pirate.app.music.OnChainPlaylist
import com.pirate.app.music.OnChainPlaylistsApi
import com.pirate.app.music.PlaylistDisplayItem
import com.pirate.app.music.TempoPlaylistApi
import com.pirate.app.music.CoverRef
import com.pirate.app.music.TrackIds
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoPasskeyManager
import com.pirate.app.tempo.TempoSessionKeyApi
import kotlinx.coroutines.delay

internal data class PlaylistMutationSuccess(
  val playlistId: String,
  val playlistName: String,
)

internal suspend fun loadPlaylistDisplayItems(
  context: Context,
  isAuthenticated: Boolean,
  ownerEthAddress: String?,
): List<PlaylistDisplayItem> {
  val local = runCatching { LocalPlaylistsStore.getLocalPlaylists(context) }.getOrElse { emptyList() }
  val onChain =
    if (isAuthenticated && !ownerEthAddress.isNullOrBlank()) {
      runCatching { OnChainPlaylistsApi.fetchUserPlaylists(ownerEthAddress) }.getOrElse { emptyList() }
    } else {
      emptyList()
    }

  return toDisplayItems(local, onChain)
}

internal suspend fun createPlaylistWithTrack(
  context: Context,
  track: MusicTrack,
  playlistName: String,
  isAuthenticated: Boolean,
  ownerEthAddress: String?,
  tempoAccount: TempoPasskeyManager.PasskeyAccount?,
  hostActivity: FragmentActivity?,
  onShowMessage: (String) -> Unit,
): PlaylistMutationSuccess? {
  val owner = ownerEthAddress?.trim()?.lowercase().orEmpty()
  if (isAuthenticated && owner.isNotBlank() && tempoAccount != null) {
    val sessionKey =
      resolvePlaylistSessionKey(
        context = context,
        owner = owner,
        hostActivity = hostActivity,
        tempoAccount = tempoAccount,
        failureMessage = "Session expired. Sign in again to create playlists.",
        onShowMessage = onShowMessage,
      ) ?: return null

    val trackId =
      TrackIds.computeMetaTrackId(
        title = track.title,
        artist = track.artist,
        album = track.album.ifBlank { null },
      )
    val createResult =
      TempoPlaylistApi.createPlaylist(
        account = tempoAccount,
        sessionKey = sessionKey,
        name = playlistName,
        coverCid = "",
        visibility = 0,
        trackIds = listOf(trackId),
      )
    if (!createResult.success) {
      onShowMessage("Create failed: ${createResult.error ?: "unknown error"}")
      return null
    }

    val resolvedId = resolveCreatedPlaylistId(owner, playlistName, createResult.playlistId)
    val createFundingPath = if (createResult.usedSelfPayFallback) "self-pay fallback" else "sponsored"
    onShowMessage("Added to $playlistName ($createFundingPath)")
    return PlaylistMutationSuccess(
      playlistId = resolvedId ?: "pending:${System.currentTimeMillis()}",
      playlistName = playlistName,
    )
  }

  val created = LocalPlaylistsStore.createLocalPlaylist(context, playlistName, track.toLocalPlaylistTrack())
  onShowMessage("Added to ${created.name}")
  return PlaylistMutationSuccess(
    playlistId = created.id,
    playlistName = created.name,
  )
}

internal suspend fun addTrackToPlaylistWithUi(
  context: Context,
  playlist: PlaylistDisplayItem,
  track: MusicTrack,
  isAuthenticated: Boolean,
  ownerEthAddress: String?,
  tempoAccount: TempoPasskeyManager.PasskeyAccount?,
  hostActivity: FragmentActivity?,
  onShowMessage: (String) -> Unit,
): PlaylistMutationSuccess? {
  if (playlist.isLocal) {
    LocalPlaylistsStore.addTrackToLocalPlaylist(context, playlist.id, track.toLocalPlaylistTrack())
    onShowMessage("Added to ${playlist.name}")
    return PlaylistMutationSuccess(
      playlistId = playlist.id,
      playlistName = playlist.name,
    )
  }

  val owner = ownerEthAddress?.trim()?.lowercase().orEmpty()
  if (!isAuthenticated || owner.isBlank() || tempoAccount == null) {
    onShowMessage("Sign in with Tempo passkey to update on-chain playlists")
    return null
  }

  val sessionKey =
    resolvePlaylistSessionKey(
      context = context,
      owner = owner,
      hostActivity = hostActivity,
      tempoAccount = tempoAccount,
      failureMessage = "Session expired. Sign in again to update playlists.",
      onShowMessage = onShowMessage,
    ) ?: return null

  val trackId =
    TrackIds.computeMetaTrackId(
      title = track.title,
      artist = track.artist,
      album = track.album.ifBlank { null },
    )

  val existingTrackIds = runCatching { OnChainPlaylistsApi.fetchPlaylistTrackIds(playlist.id) }
    .getOrElse {
      onShowMessage("Could not load playlist tracks yet. Try again in a moment.")
      return null
    }

  if (playlist.trackCount > 0 && existingTrackIds.isEmpty()) {
    onShowMessage("Playlist tracks are still indexing. Try again shortly.")
    return null
  }

  if (existingTrackIds.any { it.equals(trackId, ignoreCase = true) }) {
    onShowMessage("Already in ${playlist.name}")
    return PlaylistMutationSuccess(
      playlistId = playlist.id,
      playlistName = playlist.name,
    )
  }

  val nextTrackIds = ArrayList<String>(existingTrackIds.size + 1)
  nextTrackIds.addAll(existingTrackIds)
  nextTrackIds.add(trackId)

  val result =
    TempoPlaylistApi.setTracks(
      account = tempoAccount,
      sessionKey = sessionKey,
      playlistId = playlist.id,
      trackIds = nextTrackIds,
    )
  if (!result.success) {
    onShowMessage("Add failed: ${result.error ?: "unknown error"}")
    return null
  }

  val updateFundingPath = if (result.usedSelfPayFallback) "self-pay fallback" else "sponsored"
  onShowMessage("Added to ${playlist.name} ($updateFundingPath)")
  return PlaylistMutationSuccess(
    playlistId = playlist.id,
    playlistName = playlist.name,
  )
}

private suspend fun resolvePlaylistSessionKey(
  context: Context,
  owner: String,
  hostActivity: FragmentActivity?,
  tempoAccount: TempoPasskeyManager.PasskeyAccount?,
  failureMessage: String,
  onShowMessage: (String) -> Unit,
): SessionKeyManager.SessionKey? {
  val loaded =
    SessionKeyManager.load(context)?.takeIf {
      SessionKeyManager.isValid(it, ownerAddress = owner) &&
        it.keyAuthorization?.isNotEmpty() == true
    }
  if (loaded != null) return loaded

  val activity = hostActivity
  val account = tempoAccount
  if (activity == null || account == null) {
    onShowMessage(failureMessage)
    return null
  }
  onShowMessage("Authorizing session key...")
  val auth = TempoSessionKeyApi.authorizeSessionKey(activity = activity, account = account)
  val authorized =
    auth.sessionKey?.takeIf {
      auth.success &&
        SessionKeyManager.isValid(it, ownerAddress = owner) &&
        it.keyAuthorization?.isNotEmpty() == true
    }
  if (authorized != null) return authorized

  onShowMessage(auth.error ?: failureMessage)
  return null
}

private fun toDisplayItems(local: List<LocalPlaylist>, onChain: List<OnChainPlaylist>): List<PlaylistDisplayItem> {
  val out = ArrayList<PlaylistDisplayItem>(local.size + onChain.size)
  for (localPlaylist in local) {
    out.add(
      PlaylistDisplayItem(
        id = localPlaylist.id,
        name = localPlaylist.name,
        trackCount = localPlaylist.tracks.size,
        coverUri = localPlaylist.coverUri ?: localPlaylist.tracks.firstOrNull()?.artworkUri,
        isLocal = true,
      ),
    )
  }
  for (onChainPlaylist in onChain) {
    out.add(
      PlaylistDisplayItem(
        id = onChainPlaylist.id,
        name = onChainPlaylist.name,
        trackCount = onChainPlaylist.trackCount,
        coverUri = CoverRef.resolveCoverUrl(onChainPlaylist.coverCid.ifBlank { null }, width = 96, height = 96, format = "webp", quality = 80),
        isLocal = false,
      ),
    )
  }
  return out
}

private fun MusicTrack.toLocalPlaylistTrack(): LocalPlaylistTrack {
  return LocalPlaylistTrack(
    artist = artist,
    title = title,
    album = album.ifBlank { null },
    durationSec = durationSec.takeIf { it > 0 },
    uri = uri,
    artworkUri = artworkUri,
    artworkFallbackUri = artworkFallbackUri,
  )
}

private suspend fun resolveCreatedPlaylistId(
  ownerAddress: String,
  playlistName: String,
  immediateId: String?,
): String? {
  val direct = immediateId?.trim().orEmpty()
  if (direct.startsWith("0x") && direct.length == 66) return direct.lowercase()

  repeat(4) {
    val candidates = runCatching { OnChainPlaylistsApi.fetchUserPlaylists(ownerAddress, maxEntries = 30) }.getOrNull()
    val match =
      candidates
        ?.firstOrNull { playlist ->
          playlist.name.trim().equals(playlistName.trim(), ignoreCase = true)
        }
        ?.id
        ?.trim()
    if (!match.isNullOrBlank()) return match.lowercase()
    delay(1_200L)
  }

  return null
}
