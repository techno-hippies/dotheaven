package com.pirate.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.pirate.app.music.OnChainPlaylist
import com.pirate.app.music.OnChainPlaylistsApi
import com.pirate.app.onboarding.OnboardingRpcHelpers
import com.pirate.app.theme.PiratePalette
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val BannerGradient = Brush.verticalGradient(
  colors = listOf(Color(0xFF2D1B4E), Color(0xFF1A1040), Color(0xFF171717)),
)

private enum class ProfileTab(val label: String) {
  Music("Music"),
  Scrobbles("Scrobbles"),
  Schedule("Schedule"),
  About("About"),
}

private const val IPFS_GATEWAY = "https://heaven.myfilebase.com/ipfs/"

private fun resolveAvatarUrl(avatarUri: String?): String? {
  if (avatarUri.isNullOrBlank()) return null
  return if (avatarUri.startsWith("ipfs://")) {
    IPFS_GATEWAY + avatarUri.removePrefix("ipfs://")
  } else avatarUri
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
  ethAddress: String?,
  heavenName: String?,
  avatarUri: String?,
  isAuthenticated: Boolean,
  busy: Boolean,
  onRegister: () -> Unit,
  onLogin: () -> Unit,
  onLogout: () -> Unit = {},
  onBack: (() -> Unit)? = null,
  onMessage: ((String) -> Unit)? = null,
  onEditProfile: (() -> Unit)? = null,
  viewerEthAddress: String? = ethAddress,
  pkpPublicKey: String? = null,
  litNetwork: String = "naga-dev",
  litRpcUrl: String = "https://yellowstone-rpc.litprotocol.com",
) {
  if (!isAuthenticated || ethAddress.isNullOrBlank()) {
    Column(
      modifier = Modifier.fillMaxSize().statusBarsPadding().padding(32.dp),
      verticalArrangement = Arrangement.Center,
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      Text("Sign in to view your profile", color = PiratePalette.TextMuted, style = MaterialTheme.typography.bodyLarge)
      Spacer(Modifier.height(24.dp))
      Button(onClick = onRegister, enabled = !busy, modifier = Modifier.fillMaxWidth(0.6f)) {
        Text("Sign Up")
      }
      Spacer(Modifier.height(12.dp))
      OutlinedButton(onClick = onLogin, enabled = !busy, modifier = Modifier.fillMaxWidth(0.6f)) {
        Text("Sign In")
      }
      if (busy) {
        Spacer(Modifier.height(16.dp))
        CircularProgressIndicator(modifier = Modifier.size(24.dp))
      }
    }
    return
  }

  var selectedTab by remember { mutableIntStateOf(0) }
  val tabs = ProfileTab.entries
  val appContext = LocalContext.current.applicationContext
  val scope = rememberCoroutineScope()
  val canFollow = remember(viewerEthAddress, ethAddress) {
    !viewerEthAddress.isNullOrBlank() &&
      !ethAddress.isNullOrBlank() &&
      !viewerEthAddress.equals(ethAddress, ignoreCase = true)
  }
  val isOwnProfile = remember(viewerEthAddress, ethAddress) {
    !viewerEthAddress.isNullOrBlank() &&
      !ethAddress.isNullOrBlank() &&
      viewerEthAddress.equals(ethAddress, ignoreCase = true)
  }

  // Follow counts
  var followerCount by remember { mutableIntStateOf(0) }
  var followingCount by remember { mutableIntStateOf(0) }
  var isFollowing by remember { mutableStateOf(false) }
  var followBusy by remember { mutableStateOf(false) }
  var followError by remember { mutableStateOf<String?>(null) }

  // Scrobble state
  var scrobbles by remember { mutableStateOf<List<ScrobbleRow>>(emptyList()) }
  var scrobblesLoading by remember { mutableStateOf(true) }
  var scrobblesError by remember { mutableStateOf<String?>(null) }
  var scrobbleRetryKey by remember { mutableIntStateOf(0) }

  // Playlist state
  var playlists by remember { mutableStateOf<List<OnChainPlaylist>>(emptyList()) }
  var playlistsLoading by remember { mutableStateOf(true) }

  // Contract profile (all ProfileV2-supported fields)
  var contractProfile by remember { mutableStateOf<ContractProfileData?>(null) }
  var contractLoading by remember { mutableStateOf(true) }
  var contractError by remember { mutableStateOf<String?>(null) }
  var contractRetryKey by remember { mutableIntStateOf(0) }

  // Settings sheet
  var showSettings by remember { mutableStateOf(false) }

  val displayName = heavenName?.let { "$it.heaven" }
    ?: contractProfile?.displayName?.takeIf { it.isNotBlank() }
    ?: shortAddr(ethAddress)

  // Fetch follow counts
  LaunchedEffect(ethAddress) {
    withContext(Dispatchers.IO) {
      val (followers, following) = OnboardingRpcHelpers.getFollowCounts(ethAddress)
      followerCount = followers
      followingCount = following
    }
  }

  // Fetch follow state for viewer -> profile target
  LaunchedEffect(viewerEthAddress, ethAddress) {
    followError = null
    if (!canFollow) {
      isFollowing = false
      return@LaunchedEffect
    }
    isFollowing = withContext(Dispatchers.IO) {
      OnboardingRpcHelpers.getFollowState(viewerEthAddress!!, ethAddress!!)
    }
  }

  // Fetch scrobbles (retries when scrobbleRetryKey increments)
  LaunchedEffect(ethAddress, scrobbleRetryKey) {
    scrobblesLoading = true
    scrobblesError = null
    runCatching { ProfileScrobbleApi.fetchScrobbles(ethAddress) }
      .onSuccess { scrobbles = it; scrobblesLoading = false }
      .onFailure { scrobblesError = it.message; scrobblesLoading = false }
  }

  // Fetch playlists
  LaunchedEffect(ethAddress) {
    playlistsLoading = true
    runCatching { OnChainPlaylistsApi.fetchUserPlaylists(ethAddress) }
      .onSuccess { playlists = it; playlistsLoading = false }
      .onFailure { playlistsLoading = false }
  }

  // Fetch full contract profile for About/Edit
  LaunchedEffect(ethAddress, contractRetryKey) {
    contractLoading = true
    contractError = null
    runCatching { ProfileContractApi.fetchProfile(ethAddress) }
      .onSuccess {
        contractProfile = it
        contractLoading = false
      }
      .onFailure {
        contractError = it.message ?: "Failed to load profile"
        contractLoading = false
      }
  }

  Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
    // Banner + top actions
    Box(modifier = Modifier.fillMaxWidth().height(100.dp)) {
      Box(modifier = Modifier.fillMaxSize().background(BannerGradient))
      if (onBack != null) {
        IconButton(
          onClick = onBack,
          modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(start = 8.dp),
        ) {
          Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back", tint = Color.White, modifier = Modifier.size(24.dp))
        }
      }
      if (isOwnProfile) {
        IconButton(
          onClick = { showSettings = true },
          modifier = Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(end = 8.dp),
        ) {
          Icon(Icons.Rounded.Settings, contentDescription = "Settings", tint = Color.White, modifier = Modifier.size(24.dp))
        }
      }
      if (!isOwnProfile) {
        Text(
          displayName,
          modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 12.dp),
          style = MaterialTheme.typography.titleMedium,
          fontWeight = FontWeight.SemiBold,
          color = Color.White,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
        )
      }
    }

    // Avatar + stats row
    Row(
      modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 12.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      val avatarUrl = resolveAvatarUrl(avatarUri)
      if (avatarUrl != null) {
        AsyncImage(
          model = avatarUrl,
          contentDescription = "Avatar",
          modifier = Modifier.size(72.dp).clip(CircleShape),
          contentScale = ContentScale.Crop,
        )
      } else {
        Surface(
          modifier = Modifier.size(72.dp),
          shape = CircleShape,
          color = MaterialTheme.colorScheme.surfaceVariant,
        ) {
          Box(contentAlignment = Alignment.Center) {
            Text(
              (heavenName?.take(1) ?: "?").uppercase(),
              style = MaterialTheme.typography.headlineMedium,
              fontWeight = FontWeight.Bold,
            )
          }
        }
      }
      Spacer(Modifier.width(16.dp))
      Row(
        modifier = Modifier.weight(1f),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
      ) {
        FollowStat("$followerCount", "followers")
        FollowStat("$followingCount", "following")
      }
    }

    Spacer(Modifier.height(10.dp))

    Text(
      displayName,
      modifier = Modifier.padding(horizontal = 20.dp),
      style = MaterialTheme.typography.titleLarge,
      fontWeight = FontWeight.Bold,
      color = MaterialTheme.colorScheme.onBackground,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
    )

    if (isOwnProfile && onEditProfile != null) {
      Spacer(Modifier.height(10.dp))
      OutlinedButton(
        onClick = onEditProfile,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
      ) {
        Text("Edit Profile")
      }
    }

    if (canFollow) {
      Spacer(Modifier.height(10.dp))
      Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
      ) {
        Button(
          modifier = if (onMessage != null && !ethAddress.isNullOrBlank()) Modifier.weight(1f) else Modifier.fillMaxWidth(),
          onClick = {
            if (followBusy) return@Button
            val viewer = viewerEthAddress
            val pubkey = pkpPublicKey
            if (viewer.isNullOrBlank() || pubkey.isNullOrBlank()) {
              followError = "Missing follow auth context"
              return@Button
            }
            followBusy = true
            followError = null
            val action = if (isFollowing) "unfollow" else "follow"
            scope.launch {
              val result = FollowLitAction.toggleFollow(
                appContext = appContext,
                targetAddress = ethAddress!!,
                action = action,
                userPkpPublicKey = pubkey,
                userEthAddress = viewer,
                litNetwork = litNetwork,
                litRpcUrl = litRpcUrl,
              )
              if (result.success) {
                isFollowing = !isFollowing
                val (followers, following) = OnboardingRpcHelpers.getFollowCounts(ethAddress!!)
                followerCount = followers
                followingCount = following
              } else {
                followError = result.error ?: "Follow action failed"
              }
              followBusy = false
            }
          },
          enabled = !followBusy,
        ) {
          Text(
            if (followBusy) {
              if (isFollowing) "Unfollowing..." else "Following..."
            } else {
              if (isFollowing) "Following" else "Follow"
            },
          )
        }
        if (onMessage != null && !ethAddress.isNullOrBlank()) {
          OutlinedButton(
            modifier = Modifier.weight(1f),
            onClick = { onMessage(ethAddress) },
            enabled = !followBusy,
          ) {
            Text("Message")
          }
        }
      }
    }

    Spacer(Modifier.height(12.dp))
    if (!followError.isNullOrBlank()) {
      Text(
        followError!!,
        modifier = Modifier.padding(horizontal = 20.dp).padding(bottom = 8.dp),
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodySmall,
      )
    }

    // Tab row
    TabRow(
      selectedTabIndex = selectedTab,
      containerColor = Color(0xFF1C1C1C),
      contentColor = Color.White,
      indicator = { tabPositions ->
        if (selectedTab < tabPositions.size) {
          TabRowDefaults.SecondaryIndicator(
            modifier = Modifier.tabIndicatorOffset(tabPositions[selectedTab]),
            color = MaterialTheme.colorScheme.primary,
          )
        }
      },
      divider = { HorizontalDivider(color = Color(0xFF363636)) },
    ) {
      tabs.forEachIndexed { index, tab ->
        Tab(
          selected = selectedTab == index,
          onClick = { selectedTab = index },
          text = {
            Text(
              tab.label,
              fontWeight = if (selectedTab == index) FontWeight.SemiBold else FontWeight.Normal,
              color = if (selectedTab == index) Color.White else Color(0xFFA3A3A3),
              maxLines = 1,
            )
          },
        )
      }
    }

    // Tab content
    when (tabs[selectedTab]) {
      ProfileTab.Music -> PlaylistsPanel(playlists, playlistsLoading)
      ProfileTab.Scrobbles -> ScrobblesPanel(scrobbles, scrobblesLoading, scrobblesError) {
        scrobbleRetryKey++
      }
      ProfileTab.Schedule -> EmptyTabPanel("Schedule")
      ProfileTab.About -> AboutPanel(
        profile = contractProfile,
        loading = contractLoading,
        error = contractError,
        isOwnProfile = isOwnProfile,
        onEditProfile = onEditProfile,
      ) {
        contractRetryKey++
      }
    }
  }

  // Settings bottom sheet
  if (showSettings) {
    SettingsSheet(
      ethAddress = ethAddress,
      onDismiss = { showSettings = false },
      onLogout = onLogout,
    )
  }
}

// ── Settings Sheet ──

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SettingsSheet(
  ethAddress: String,
  onDismiss: () -> Unit,
  onLogout: () -> Unit,
) {
  val clipboardManager = LocalClipboardManager.current
  val scope = rememberCoroutineScope()
  var copied by remember { mutableStateOf(false) }
  val sheetState = rememberModalBottomSheetState()

  ModalBottomSheet(
    onDismissRequest = onDismiss,
    sheetState = sheetState,
    containerColor = Color(0xFF1C1C1C),
  ) {
    Column(
      modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 32.dp),
    ) {
      Text("Settings", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
      Spacer(Modifier.height(24.dp))

      Text("Wallet Address", style = MaterialTheme.typography.labelLarge, color = PiratePalette.TextMuted)
      Spacer(Modifier.height(8.dp))
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .background(Color(0xFF262626), RoundedCornerShape(12.dp))
          .clickable {
            clipboardManager.setText(AnnotatedString(ethAddress))
            copied = true
            scope.launch {
              kotlinx.coroutines.delay(2000)
              copied = false
            }
          }
          .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Text(
          ethAddress,
          modifier = Modifier.weight(1f),
          style = MaterialTheme.typography.bodyMedium,
          color = MaterialTheme.colorScheme.onBackground,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.width(8.dp))
        Icon(
          Icons.Rounded.ContentCopy,
          contentDescription = "Copy",
          modifier = Modifier.size(20.dp),
          tint = if (copied) Color(0xFFA6E3A1) else PiratePalette.TextMuted,
        )
      }
      if (copied) {
        Spacer(Modifier.height(4.dp))
        Text("Copied!", style = MaterialTheme.typography.bodySmall, color = Color(0xFFA6E3A1))
      }

      Spacer(Modifier.height(24.dp))
      HorizontalDivider(color = Color(0xFF363636))
      Spacer(Modifier.height(16.dp))

      Text("App", style = MaterialTheme.typography.labelLarge, color = PiratePalette.TextMuted)
      Spacer(Modifier.height(8.dp))
      Text("Version 0.1.0", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onBackground)

      Spacer(Modifier.height(24.dp))
      HorizontalDivider(color = Color(0xFF363636))
      Spacer(Modifier.height(16.dp))

      OutlinedButton(
        onClick = {
          onDismiss()
          onLogout()
        },
        modifier = Modifier.fillMaxWidth(),
      ) {
        Text("Sign Out", color = MaterialTheme.colorScheme.error)
      }
    }
  }
}

// ── Scrobbles ──

@Composable
private fun ScrobblesPanel(
  scrobbles: List<ScrobbleRow>,
  loading: Boolean,
  error: String?,
  onRetry: () -> Unit,
) {
  when {
    loading -> CenteredStatus { CircularProgressIndicator(Modifier.size(32.dp)); Spacer(Modifier.height(12.dp)); Text("Loading scrobbles...", color = PiratePalette.TextMuted) }
    error != null -> CenteredStatus { Text(error, color = MaterialTheme.colorScheme.error); Spacer(Modifier.height(8.dp)); TextButton(onClick = onRetry) { Text("Retry") } }
    scrobbles.isEmpty() -> CenteredStatus { Text("No scrobbles yet.", color = PiratePalette.TextMuted) }
    else -> {
      LazyColumn(modifier = Modifier.fillMaxSize()) {
        item {
          Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
            Text("#", modifier = Modifier.width(36.dp), color = PiratePalette.TextMuted, style = MaterialTheme.typography.labelLarge)
            Text("TRACK", modifier = Modifier.weight(1f), color = PiratePalette.TextMuted, style = MaterialTheme.typography.labelLarge)
            Text("PLAYED", modifier = Modifier.width(80.dp), color = PiratePalette.TextMuted, style = MaterialTheme.typography.labelLarge)
          }
          HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
        itemsIndexed(scrobbles, key = { i, s -> "${s.playedAtSec}:${s.trackId ?: i}" }) { index, scrobble ->
          ScrobbleRowItem(index + 1, scrobble)
        }
      }
    }
  }
}

@Composable
private fun ScrobbleRowItem(index: Int, scrobble: ScrobbleRow) {
  Row(
    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text("$index", modifier = Modifier.width(36.dp), color = PiratePalette.TextMuted, style = MaterialTheme.typography.bodyMedium)

    if (scrobble.coverCid != null) {
      AsyncImage(
        model = ProfileScrobbleApi.coverUrl(scrobble.coverCid),
        contentDescription = null,
        modifier = Modifier.size(44.dp).clip(RoundedCornerShape(6.dp)),
        contentScale = ContentScale.Crop,
      )
    } else {
      Surface(modifier = Modifier.size(44.dp), shape = RoundedCornerShape(6.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Box(contentAlignment = Alignment.Center) { Icon(Icons.Rounded.MusicNote, "Cover", modifier = Modifier.size(24.dp), tint = PiratePalette.TextMuted) }
      }
    }

    Spacer(Modifier.width(12.dp))

    Column(modifier = Modifier.weight(1f)) {
      Text(scrobble.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onBackground)
      Text(scrobble.artist, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, color = PiratePalette.TextMuted)
    }

    Text(scrobble.playedAgo, modifier = Modifier.width(80.dp), style = MaterialTheme.typography.bodyMedium, color = PiratePalette.TextMuted, maxLines = 1)
  }
}

// ── Playlists (Music tab) ──

@Composable
private fun PlaylistsPanel(playlists: List<OnChainPlaylist>, loading: Boolean) {
  when {
    loading -> CenteredStatus { CircularProgressIndicator(Modifier.size(32.dp)); Spacer(Modifier.height(12.dp)); Text("Loading playlists...", color = PiratePalette.TextMuted) }
    playlists.isEmpty() -> CenteredStatus { Text("No playlists yet.", color = PiratePalette.TextMuted) }
    else -> {
      LazyColumn(modifier = Modifier.fillMaxSize()) {
        item {
          Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("PLAYLISTS", color = PiratePalette.TextMuted, style = MaterialTheme.typography.labelLarge)
            Text("${playlists.size}", color = PiratePalette.TextMuted, style = MaterialTheme.typography.labelLarge)
          }
          HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
        itemsIndexed(playlists, key = { _, p -> p.id }) { _, playlist ->
          PlaylistRowItem(playlist)
        }
      }
    }
  }
}

@Composable
private fun PlaylistRowItem(playlist: OnChainPlaylist) {
  Row(
    modifier = Modifier.fillMaxWidth().clickable { }.padding(horizontal = 16.dp, vertical = 10.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    if (playlist.coverCid.isNotBlank()) {
      AsyncImage(model = ProfileScrobbleApi.coverUrl(playlist.coverCid, 96), contentDescription = null, modifier = Modifier.size(48.dp).clip(RoundedCornerShape(8.dp)), contentScale = ContentScale.Crop)
    } else {
      Surface(modifier = Modifier.size(48.dp), shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Box(contentAlignment = Alignment.Center) { Icon(Icons.Rounded.QueueMusic, "Playlist", modifier = Modifier.size(24.dp), tint = PiratePalette.TextMuted) }
      }
    }
    Spacer(Modifier.width(12.dp))
    Column(modifier = Modifier.weight(1f)) {
      Text(playlist.name.ifBlank { "Untitled" }, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onBackground)
      Text("${playlist.trackCount} track${if (playlist.trackCount != 1) "s" else ""}", style = MaterialTheme.typography.bodyMedium, color = PiratePalette.TextMuted)
    }
  }
}

// ── About tab ──

@Composable
private fun AboutPanel(
  profile: ContractProfileData?,
  loading: Boolean,
  error: String?,
  isOwnProfile: Boolean,
  onEditProfile: (() -> Unit)?,
  onRetry: () -> Unit,
) {
  if (loading) {
    CenteredStatus { CircularProgressIndicator(Modifier.size(32.dp)); Spacer(Modifier.height(12.dp)); Text("Loading profile fields...", color = PiratePalette.TextMuted) }
    return
  }
  if (!error.isNullOrBlank()) {
    CenteredStatus {
      Text(error, color = MaterialTheme.colorScheme.error)
      Spacer(Modifier.height(8.dp))
      TextButton(onClick = onRetry) { Text("Retry") }
    }
    return
  }
  if (profile == null) {
    CenteredStatus {
      Text(
        if (isOwnProfile) "No on-chain profile fields yet." else "No profile fields yet.",
        color = PiratePalette.TextMuted,
      )
      if (isOwnProfile && onEditProfile != null) {
        Spacer(Modifier.height(12.dp))
        Button(onClick = onEditProfile) { Text("Create Profile") }
      }
    }
    return
  }

  val identityRows = buildList<Pair<String, String>> {
    if (profile.displayName.isNotBlank()) add("Display Name" to profile.displayName)
    if (profile.nationality.isNotBlank()) add("Nationality" to profile.nationality)
    if (profile.nameHash.isNotBlank()) add("Name Hash" to profile.nameHash)
    if (profile.photoUri.isNotBlank()) add("Photo URI" to profile.photoUri)
  }

  val basicsRows = buildList<Pair<String, String>> {
    if (profile.age > 0) add("Age" to "${profile.age}")
    if (profile.heightCm > 0) add("Height" to "${profile.heightCm} cm")
    if (profile.languages.isNotEmpty()) {
      val langs = profile.languages.joinToString(" · ") { entry ->
        "${ProfileContractApi.languageLabel(entry.code)} (${ProfileContractApi.proficiencyLabel(entry.proficiency)})"
      }
      add("Languages" to langs)
    }
    val openTo = ProfileContractApi.selectedFriendsLabels(profile.friendsOpenToMask)
    if (openTo.isNotEmpty()) add("Open To" to openTo.joinToString(", "))
  }

  val locationRows = buildList<Pair<String, String>> {
    if (profile.locationCityId.isNotBlank()) add("Location City ID" to profile.locationCityId)
    if (ProfileContractApi.hasCoords(profile.locationLatE6, profile.locationLngE6)) {
      val lat = profile.locationLatE6.toDouble() / 1_000_000.0
      val lng = profile.locationLngE6.toDouble() / 1_000_000.0
      add("Coordinates" to String.format(Locale.US, "%.5f, %.5f", lat, lng))
    }
    if (profile.schoolId.isNotBlank()) add("School ID" to profile.schoolId)
    if (profile.hobbiesCommit.isNotBlank()) add("Hobbies IDs" to profile.hobbiesCommit)
    if (profile.skillsCommit.isNotBlank()) add("Skills IDs" to profile.skillsCommit)
  }

  val preferenceRows = buildList<Pair<String, String>> {
    ProfileContractApi.enumLabel(ProfileContractApi.GENDER_OPTIONS, profile.gender)?.let { add("Gender" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.RELOCATE_OPTIONS, profile.relocate)?.let { add("Relocate" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.DEGREE_OPTIONS, profile.degree)?.let { add("Degree" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.FIELD_OPTIONS, profile.fieldBucket)?.let { add("Field" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.PROFESSION_OPTIONS, profile.profession)?.let { add("Profession" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.INDUSTRY_OPTIONS, profile.industry)?.let { add("Industry" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.RELATIONSHIP_OPTIONS, profile.relationshipStatus)?.let { add("Relationship" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.SEXUALITY_OPTIONS, profile.sexuality)?.let { add("Sexuality" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.ETHNICITY_OPTIONS, profile.ethnicity)?.let { add("Ethnicity" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.DATING_STYLE_OPTIONS, profile.datingStyle)?.let { add("Dating Style" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.CHILDREN_OPTIONS, profile.children)?.let { add("Children" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.WANTS_CHILDREN_OPTIONS, profile.wantsChildren)?.let { add("Wants Children" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.LOOKING_FOR_OPTIONS, profile.lookingFor)?.let { add("Looking For" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.DRINKING_OPTIONS, profile.drinking)?.let { add("Drinking" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.SMOKING_OPTIONS, profile.smoking)?.let { add("Smoking" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.DRUGS_OPTIONS, profile.drugs)?.let { add("Drugs" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.RELIGION_OPTIONS, profile.religion)?.let { add("Religion" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.PETS_OPTIONS, profile.pets)?.let { add("Pets" to it) }
    ProfileContractApi.enumLabel(ProfileContractApi.DIET_OPTIONS, profile.diet)?.let { add("Diet" to it) }
  }

  LazyColumn(
    modifier = Modifier.fillMaxSize().padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    if (isOwnProfile && onEditProfile != null) {
      item {
        OutlinedButton(onClick = onEditProfile, modifier = Modifier.fillMaxWidth()) {
          Text("Edit Profile")
        }
      }
    }

    if (identityRows.isNotEmpty()) {
      item { AboutSectionCard("Identity", identityRows) }
    }
    if (basicsRows.isNotEmpty()) {
      item { AboutSectionCard("Basics", basicsRows) }
    }
    if (locationRows.isNotEmpty()) {
      item { AboutSectionCard("Location & Commitments", locationRows) }
    }
    if (preferenceRows.isNotEmpty()) {
      item { AboutSectionCard("Preferences", preferenceRows) }
    }
    if (identityRows.isEmpty() && basicsRows.isEmpty() && locationRows.isEmpty() && preferenceRows.isEmpty()) {
      item {
        Text(
          "No populated fields yet.",
          color = PiratePalette.TextMuted,
          style = MaterialTheme.typography.bodyLarge,
          modifier = Modifier.padding(8.dp),
        )
      }
    }
  }
}

@Composable
private fun AboutSectionCard(
  title: String,
  rows: List<Pair<String, String>>,
) {
  Surface(
    modifier = Modifier.fillMaxWidth(),
    color = Color(0xFF1C1C1C),
    shape = RoundedCornerShape(14.dp),
  ) {
    Column(
      modifier = Modifier.padding(14.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
      rows.forEachIndexed { index, row ->
        if (index > 0) HorizontalDivider(color = Color(0xFF2A2A2A))
        Text(row.first, style = MaterialTheme.typography.labelLarge, color = PiratePalette.TextMuted)
        Text(row.second, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onBackground)
      }
    }
  }
}

// ── Shared ──

@Composable
private fun EmptyTabPanel(label: String) {
  CenteredStatus { Text("$label — coming soon", color = PiratePalette.TextMuted) }
}

@Composable
private fun CenteredStatus(content: @Composable () -> Unit) {
  Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) { content() }
  }
}

@Composable
private fun FollowStat(count: String, label: String) {
  Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
    Text(count, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
    Text(label, style = MaterialTheme.typography.bodyLarge, color = PiratePalette.TextMuted)
  }
}

private fun shortAddr(addr: String): String {
  if (addr.length <= 14) return addr
  return "${addr.take(6)}...${addr.takeLast(4)}"
}
