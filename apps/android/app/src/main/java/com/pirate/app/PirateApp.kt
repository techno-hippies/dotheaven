package com.pirate.app

import android.net.Uri
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.ChatBubble
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.School
import androidx.compose.material.icons.rounded.Groups
import com.pirate.app.onboarding.OnboardingRpcHelpers
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavType
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.navArgument
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.pirate.app.auth.PirateAuthUiState
import com.pirate.app.chat.ChatScreen
import com.pirate.app.chat.XmtpChatService
import com.pirate.app.community.CommunityScreen
import com.pirate.app.learn.LearnScreen
import com.pirate.app.music.CoverRef
import com.pirate.app.music.MusicScreen
import com.pirate.app.music.MusicTrack
import com.pirate.app.music.PublishScreen
import com.pirate.app.player.PlayerController
import com.pirate.app.identity.VerifyIdentityScreen
import com.pirate.app.profile.FollowListMode
import com.pirate.app.profile.FollowListScreen
import com.pirate.app.profile.ProfileContractApi
import com.pirate.app.profile.ProfileEditScreen
import com.pirate.app.profile.ProfileScreen
import com.pirate.app.profile.TempoNameRecordsApi
import com.pirate.app.scarlett.AgoraVoiceController
import com.pirate.app.scarlett.ScarlettCallScreen
import com.pirate.app.scarlett.ScarlettService
import com.pirate.app.scarlett.ScarlettVoiceBar
import com.pirate.app.scarlett.VoiceCallState
import com.pirate.app.scarlett.clearWorkerAuthCache
import com.pirate.app.schedule.ScheduledSessionCallScreen
import com.pirate.app.schedule.ScheduledSessionVoiceController
import com.pirate.app.schedule.ScheduleAvailabilityScreen
import com.pirate.app.schedule.ScheduleScreen
import com.pirate.app.scrobble.ScrobbleService
import com.pirate.app.song.ArtistScreen
import com.pirate.app.song.SongScreen
import com.pirate.app.tempo.TempoAccountFactory
import com.pirate.app.tempo.TempoPasskeyManager
import com.pirate.app.ui.PirateMiniPlayer
import com.pirate.app.ui.PirateSideMenuDrawer
import com.pirate.app.ui.PirateTopBar
import com.pirate.app.store.NameStoreScreen
import com.pirate.app.wallet.WalletScreen
import com.pirate.app.onboarding.OnboardingScreen
import com.pirate.app.onboarding.OnboardingStep
import com.pirate.app.onboarding.checkOnboardingStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private sealed class PirateRoute(val route: String, val label: String) {
  data object Music : PirateRoute("music", "Music")
  data object Chat : PirateRoute("chat", "Chat")
  data object Wallet : PirateRoute("wallet", "Wallet")
  data object NameStore : PirateRoute("name_store", "Store")
  data object Learn : PirateRoute("learn", "Learn")
  data object Schedule : PirateRoute("schedule", "Schedule")
  data object ScheduleAvailability : PirateRoute("schedule/availability", "Availability")
  data object Rooms : PirateRoute("rooms", "Community")
  data object Profile : PirateRoute("profile", "Profile")
  data object PublicProfile : PirateRoute("profile/public/{address}", "Profile") {
    const val ARG_ADDRESS = "address"
    fun buildRoute(address: String): String = "profile/public/${address.trim()}"
  }
  data object Song : PirateRoute("song/{trackId}?title={title}&artist={artist}", "Song") {
    const val ARG_TRACK_ID = "trackId"
    const val ARG_TITLE = "title"
    const val ARG_ARTIST = "artist"
    fun buildRoute(trackId: String, title: String? = null, artist: String? = null): String {
      val normalizedTrackId = trackId.trim()
      val titleQuery = Uri.encode(title?.trim().orEmpty())
      val artistQuery = Uri.encode(artist?.trim().orEmpty())
      return "song/$normalizedTrackId?title=$titleQuery&artist=$artistQuery"
    }
  }
  data object Artist : PirateRoute("artist/{artistName}", "Artist") {
    const val ARG_ARTIST_NAME = "artistName"
    fun buildRoute(artistName: String): String = "artist/${Uri.encode(artistName.trim())}"
  }
  data object FollowList : PirateRoute("profile/follow_list/{address}/{mode}", "Follow List") {
    const val ARG_ADDRESS = "address"
    const val ARG_MODE = "mode"
    fun buildRoute(address: String, mode: FollowListMode): String =
      "profile/follow_list/${address.trim()}/${mode.name}"
  }
  data object EditProfile : PirateRoute("profile/edit", "Edit Profile")
  data object Player : PirateRoute("player", "Player")
  data object VoiceCall : PirateRoute("voice_call", "Voice Call")
  data object ScheduledSessionCall : PirateRoute("scheduled_session_call", "Session Call")
  data object Onboarding : PirateRoute("onboarding", "Onboarding")
  data object Publish : PirateRoute("publish", "Publish Song")
  data object VerifyIdentity : PirateRoute("verify_identity", "Verify Identity")
}

private suspend fun resolveProfileIdentity(address: String): Pair<String?, String?> = withContext(Dispatchers.IO) {
  var contractAvatarLoaded = false
  var contractAvatar: String? = null

  suspend fun loadContractAvatar(): String? {
    if (contractAvatarLoaded) return contractAvatar
    contractAvatarLoaded = true
    contractAvatar = runCatching {
      ProfileContractApi.fetchProfile(address)?.photoUri?.trim()?.ifBlank { null }
    }.getOrNull()
    return contractAvatar
  }

  val tempoName = TempoNameRecordsApi.getPrimaryName(address)
  if (!tempoName.isNullOrBlank()) {
    val node = TempoNameRecordsApi.computeNode(tempoName)
    val avatar = TempoNameRecordsApi.getTextRecord(node, "avatar")
      ?: OnboardingRpcHelpers.getTextRecord(node, "avatar")
      ?: loadContractAvatar()
    return@withContext tempoName to avatar
  }

  val legacyName = OnboardingRpcHelpers.getPrimaryName(address)
  if (legacyName.isNullOrBlank()) return@withContext null to loadContractAvatar()
  val node = OnboardingRpcHelpers.computeNode(legacyName)
  val avatar = TempoNameRecordsApi.getTextRecord(node, "avatar")
    ?: OnboardingRpcHelpers.getTextRecord(node, "avatar")
    ?: loadContractAvatar()
  return@withContext "$legacyName.heaven" to avatar
}

private suspend fun resolveProfileIdentityWithRetry(
  address: String,
  attempts: Int = 6,
  retryDelayMs: Long = 1_500,
): Pair<String?, String?> {
  val totalAttempts = attempts.coerceAtLeast(1)
  var last: Pair<String?, String?> = null to null
  repeat(totalAttempts) { attempt ->
    last = resolveProfileIdentity(address)
    val name = last.first
    val avatar = last.second
    if (!name.isNullOrBlank() || !avatar.isNullOrBlank() || attempt == totalAttempts - 1) {
      return last
    }
    delay(retryDelayMs)
  }
  return last
}

@Composable
fun PirateApp(activity: androidx.fragment.app.FragmentActivity) {
  val appContext = LocalContext.current.applicationContext
  val navController = rememberNavController()
  val routes = listOf(PirateRoute.Music, PirateRoute.Rooms, PirateRoute.Chat, PirateRoute.Learn, PirateRoute.Schedule)
  val scope = rememberCoroutineScope()
  val snackbarHostState = remember { SnackbarHostState() }
  val drawerState = androidx.compose.material3.rememberDrawerState(initialValue = DrawerValue.Closed)
  val player = remember {
    PlayerController(appContext).also {
      com.pirate.app.widget.WidgetActionReceiver.playerRef = it
    }
  }
  val chatService = remember { XmtpChatService(appContext) }
  val scarlettService = remember { ScarlettService(appContext) }
  val voiceController = remember { AgoraVoiceController(appContext) }
  val scheduledSessionVoiceController = remember { ScheduledSessionVoiceController(appContext) }

  var onboardingInitialStep by remember { mutableStateOf(OnboardingStep.NAME) }

  var authState by remember {
    val saved = PirateAuthUiState.load(appContext)
    mutableStateOf(
      saved.copy(
        passkeyRpId = saved.tempoRpId.ifBlank { TempoPasskeyManager.DEFAULT_RP_ID },
        tempoRpId = saved.tempoRpId.ifBlank { TempoPasskeyManager.DEFAULT_RP_ID },
      ),
    )
  }

  val scrobbleService =
    remember {
      ScrobbleService(
        appContext = appContext,
        activity = activity,
        player = player,
        getAuthState = { authState },
        onShowMessage = { msg ->
          scope.launch {
            snackbarHostState.showSnackbar(
              message = msg,
              withDismissAction = true,
              duration = SnackbarDuration.Long,
            )
          }
        },
      )
    }

  DisposableEffect(Unit) {
    scrobbleService.start()
    onDispose {
      scrobbleService.close()
      player.release()
      voiceController.release()
      scheduledSessionVoiceController.release()
    }
  }

  val isAuthenticated = authState.hasAnyCredentials()
  val activeAddress = authState.activeAddress()

  // Profile identity — hoisted so drawer + profile screen can share
  var heavenName by remember { mutableStateOf<String?>(null) }
  var avatarUri by remember { mutableStateOf<String?>(null) }
  var chatThreadOpen by remember { mutableStateOf(false) }
  var xmtpBootstrapKey by remember { mutableStateOf<String?>(null) }

  suspend fun bootstrapXmtpInbox(address: String, source: String) {
    val normalizedAddress = address.trim()
    if (normalizedAddress.isBlank()) return
    val key = normalizedAddress.lowercase()
    if (chatService.connected.value) {
      xmtpBootstrapKey = key
      return
    }
    if (xmtpBootstrapKey == key) return
    xmtpBootstrapKey = key
    runCatching {
      chatService.connect(normalizedAddress)
    }.onSuccess {
      xmtpBootstrapKey = key
    }.onFailure { err ->
      xmtpBootstrapKey = null
      android.util.Log.w("PirateApp", "XMTP bootstrap failed ($source): ${err.message}")
    }
  }

  LaunchedEffect(activeAddress) {
    val addr = activeAddress
    if (addr.isNullOrBlank()) {
      heavenName = null; avatarUri = null; return@LaunchedEffect
    }
    val (name, avatar) = resolveProfileIdentityWithRetry(addr, attempts = 2, retryDelayMs = 700)
    heavenName = name
    avatarUri = avatar
  }

  // Ensure each authenticated user gets an XMTP inbox as soon as possible,
  // rather than waiting until they first open the chat screen.
  LaunchedEffect(isAuthenticated, activeAddress) {
    if (!isAuthenticated) {
      xmtpBootstrapKey = null
      return@LaunchedEffect
    }
    val address = activeAddress
    if (address.isNullOrBlank()) return@LaunchedEffect

    bootstrapXmtpInbox(address = address, source = "auth")
  }

  val navBackStackEntry by navController.currentBackStackEntryAsState()
  val currentRoute = navBackStackEntry?.destination?.route
  val showBottomChrome = currentRoute != PirateRoute.Player.route &&
    currentRoute != PirateRoute.VoiceCall.route &&
    currentRoute != PirateRoute.ScheduledSessionCall.route &&
    currentRoute != PirateRoute.ScheduleAvailability.route &&
    currentRoute != PirateRoute.Onboarding.route &&
    currentRoute != PirateRoute.Publish.route &&
    currentRoute != PirateRoute.VerifyIdentity.route &&
    currentRoute != PirateRoute.EditProfile.route &&
    currentRoute != PirateRoute.Wallet.route &&
    currentRoute != PirateRoute.NameStore.route &&
    currentRoute != PirateRoute.PublicProfile.route &&
    currentRoute != PirateRoute.FollowList.route &&
    !(currentRoute == PirateRoute.Chat.route && chatThreadOpen)
  val showTopChrome = currentRoute != PirateRoute.Player.route && currentRoute != PirateRoute.Music.route &&
    currentRoute != PirateRoute.Chat.route && currentRoute != PirateRoute.Learn.route &&
    currentRoute != PirateRoute.Schedule.route && currentRoute != PirateRoute.Rooms.route &&
    currentRoute != PirateRoute.ScheduleAvailability.route &&
    currentRoute != PirateRoute.Profile.route && currentRoute != PirateRoute.Wallet.route &&
    currentRoute != PirateRoute.NameStore.route &&
    currentRoute != PirateRoute.Song.route &&
    currentRoute != PirateRoute.Artist.route &&
    currentRoute != PirateRoute.PublicProfile.route &&
    currentRoute != PirateRoute.EditProfile.route &&
    currentRoute != PirateRoute.FollowList.route &&
    currentRoute != PirateRoute.VoiceCall.route &&
    currentRoute != PirateRoute.ScheduledSessionCall.route &&
    currentRoute != PirateRoute.Onboarding.route &&
    currentRoute != PirateRoute.Publish.route &&
    currentRoute != PirateRoute.VerifyIdentity.route
  val currentTitle = when (currentRoute) {
    PirateRoute.Music.route -> "Music"
    PirateRoute.Chat.route -> "Chat"
    PirateRoute.Wallet.route -> "Wallet"
    PirateRoute.NameStore.route -> "Store"
    PirateRoute.Song.route -> "Song"
    PirateRoute.Artist.route -> "Artist"
    PirateRoute.Learn.route -> "Learn"
    PirateRoute.Schedule.route -> "Schedule"
    PirateRoute.ScheduleAvailability.route -> "Availability"
    PirateRoute.Rooms.route -> "Community"
    PirateRoute.Profile.route -> "Profile"
    PirateRoute.PublicProfile.route -> "Profile"
    PirateRoute.EditProfile.route -> "Edit Profile"
    PirateRoute.Player.route -> "Now Playing"
    PirateRoute.ScheduledSessionCall.route -> "Session Call"
    PirateRoute.VerifyIdentity.route -> "Verify Identity"
    else -> "Heaven"
  }

  suspend fun closeDrawer() {
    drawerState.close()
  }

  suspend fun openDrawer() {
    drawerState.open()
  }

  suspend fun doRegister() {
    authState = authState.copy(busy = true, output = "Creating Tempo passkey account...")
    val result = runCatching {
      val rpId = authState.passkeyRpId.ifBlank { authState.tempoRpId }
      TempoPasskeyManager.createAccount(
        activity = activity,
        rpId = rpId,
        rpName = "Heaven",
      )
    }

    result.onFailure { err ->
      authState = authState.copy(busy = false, output = "sign up failed: ${err.message}")
      snackbarHostState.showSnackbar("Sign up failed: ${err.message ?: "unknown error"}")
    }

    result.onSuccess { account ->
      chatService.disconnect()
      clearWorkerAuthCache()
      xmtpBootstrapKey = null
      heavenName = null
      avatarUri = null
      val nextState =
        authState.copy(
          busy = false,
          passkeyRpId = account.rpId,
          tempoRpId = account.rpId,
          tempoAddress = account.address,
          tempoCredentialId = account.credentialId,
          tempoPubKeyX = account.pubKey.xHex,
          tempoPubKeyY = account.pubKey.yHex,
          signerType = PirateAuthUiState.SignerType.PASSKEY,
          selfVerified = false,
          output = "Tempo account ready: ${account.address.take(10)}...",
        )
      authState = nextState
      PirateAuthUiState.save(appContext, nextState)
      snackbarHostState.showSnackbar("Signed up with passkey.")

      val step = runCatching { checkOnboardingStatus(appContext, account.address) }.getOrNull()
      if (step != null) {
        onboardingInitialStep = step
        navController.navigate(PirateRoute.Onboarding.route) { launchSingleTop = true }
      }
    }
  }

  suspend fun doLogin() {
    authState = authState.copy(busy = true, output = "Authenticating with Tempo passkey...")
    val result = runCatching {
      val rpId = authState.passkeyRpId.ifBlank { authState.tempoRpId }
      TempoPasskeyManager.login(
        activity = activity,
        rpId = rpId,
      )
    }

    result.onFailure { err ->
      authState = authState.copy(busy = false, output = "login failed: ${err.message}")
      val reason = err.message ?: "unknown error"
      val message =
        if (reason.contains("not registered in this app", ignoreCase = true)) {
          "Selected passkey is not registered on this device yet. Use Sign Up to register it."
        } else {
          "Log in failed: $reason"
        }
      snackbarHostState.showSnackbar(message)
    }

    result.onSuccess { account ->
      chatService.disconnect()
      clearWorkerAuthCache()
      xmtpBootstrapKey = null
      heavenName = null
      avatarUri = null
      val nextState =
        authState.copy(
          busy = false,
          passkeyRpId = account.rpId,
          tempoRpId = account.rpId,
          tempoAddress = account.address,
          tempoCredentialId = account.credentialId,
          tempoPubKeyX = account.pubKey.xHex,
          tempoPubKeyY = account.pubKey.yHex,
          signerType = PirateAuthUiState.SignerType.PASSKEY,
          selfVerified = false,
          output = "Logged in: ${account.address.take(10)}...",
        )
      authState = nextState
      PirateAuthUiState.save(appContext, nextState)
      snackbarHostState.showSnackbar("Logged in with passkey.")

      val step = runCatching { checkOnboardingStatus(appContext, account.address) }.getOrNull()
      if (step != null) {
        onboardingInitialStep = step
        navController.navigate(PirateRoute.Onboarding.route) { launchSingleTop = true }
      }
    }
  }

  suspend fun doLogout() {
    chatService.disconnect()
    clearWorkerAuthCache()
    xmtpBootstrapKey = null
    heavenName = null
    avatarUri = null

    PirateAuthUiState.clear(appContext)
    authState =
      authState.copy(
        tempoAddress = null,
        tempoCredentialId = null,
        tempoPubKeyX = null,
        tempoPubKeyY = null,
        signerType = null,
        selfVerified = false,
        output = "Logged out.",
      )
    snackbarHostState.showSnackbar("Logged out.")
  }

  ModalNavigationDrawer(
    drawerState = drawerState,
    drawerContent = {
      PirateSideMenuDrawer(
        isAuthenticated = isAuthenticated,
        busy = authState.busy,
        ethAddress = activeAddress,
        heavenName = heavenName,
        avatarUri = avatarUri,
        selfVerified = authState.selfVerified,
        onNavigateProfile = {
          scope.launch {
            closeDrawer()
            navController.navigate(PirateRoute.Profile.route) {
              popUpTo(navController.graph.startDestinationId) { saveState = true }
              launchSingleTop = true
              restoreState = true
            }
          }
        },
        onNavigateWallet = {
          scope.launch {
            closeDrawer()
            navController.navigate(PirateRoute.Wallet.route) { launchSingleTop = true }
          }
        },
        onNavigateNameStore = {
          scope.launch {
            closeDrawer()
            navController.navigate(PirateRoute.NameStore.route) { launchSingleTop = true }
          }
        },
        onNavigateVerifyIdentity = {
          scope.launch {
            closeDrawer()
            navController.navigate(PirateRoute.VerifyIdentity.route) { launchSingleTop = true }
          }
        },
        onNavigatePublish = {
          scope.launch {
            closeDrawer()
            navController.navigate(PirateRoute.Publish.route) { launchSingleTop = true }
          }
        },
        onSignUp = {
          scope.launch {
            closeDrawer()
            doRegister()
          }
        },
        onSignIn = {
          scope.launch {
            closeDrawer()
            doLogin()
          }
        },
        onLogout = {
          scope.launch {
            closeDrawer()
            doLogout()
          }
        },
      )
    },
  ) {
    Scaffold(
      // We are not edge-to-edge; avoid double-applying system-bar insets which creates a
      // "mystery gap" above headers.
      contentWindowInsets = WindowInsets(0),
      topBar = {
        if (showTopChrome) {
          PirateTopBar(
            title = currentTitle,
            isAuthenticated = isAuthenticated,
            onAvatarClick = { scope.launch { openDrawer() } },
          )
        }
      },
      snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
      bottomBar = {
        if (showBottomChrome) {
          Column {
            ScarlettVoiceBar(
              controller = voiceController,
              onOpen = {
                navController.navigate(PirateRoute.VoiceCall.route) { launchSingleTop = true }
              },
            )

            PirateMiniPlayer(
              player = player,
              onOpen = {
                navController.navigate(PirateRoute.Player.route) { launchSingleTop = true }
              },
            )

            NavigationBar {
              val currentDestination = navBackStackEntry?.destination

              routes.forEach { screen ->
                val selected =
                  currentDestination?.hierarchy?.any { it.route == screen.route } == true
                NavigationBarItem(
                  selected = selected,
                  onClick = {
                    navController.navigate(screen.route) {
                      popUpTo(navController.graph.startDestinationId) { saveState = true }
                      launchSingleTop = true
                      restoreState = true
                    }
                  },
                  label = { Text(screen.label) },
                  icon = {
                    when (screen) {
                      PirateRoute.Music -> Icon(Icons.Rounded.MusicNote, contentDescription = null)
                      PirateRoute.Chat -> Icon(Icons.Rounded.ChatBubble, contentDescription = null)
                      PirateRoute.Learn -> Icon(Icons.Rounded.School, contentDescription = null)
                      PirateRoute.Schedule -> Icon(Icons.Rounded.CalendarMonth, contentDescription = null)
                      PirateRoute.Rooms -> Icon(Icons.Rounded.Groups, contentDescription = null)
                      else -> Icon(Icons.Rounded.Person, contentDescription = null)
                    }
                  },
                )
              }
            }
          }
        }
      },
    ) { innerPadding ->
      PirateNavHost(
        activity = activity,
        innerPadding = innerPadding,
        navController = navController,
        authState = authState,
        heavenName = heavenName,
        avatarUri = avatarUri,
        onAuthStateChange = { next ->
          authState = next
          PirateAuthUiState.save(appContext, next)
        },
        onRegister = { scope.launch { doRegister() } },
        onLogin = { scope.launch { doLogin() } },
        onLogout = { scope.launch { doLogout() } },
        player = player,
        chatService = chatService,
        scarlettService = scarlettService,
        voiceController = voiceController,
        scheduledSessionVoiceController = scheduledSessionVoiceController,
        onOpenDrawer = { scope.launch { openDrawer() } },
        onShowMessage = { msg ->
          scope.launch {
            snackbarHostState.showSnackbar(
              message = msg,
              withDismissAction = true,
              duration = SnackbarDuration.Long,
            )
          }
        },
        onRefreshProfileIdentity = {
          scope.launch {
            val currentAddress = authState.activeAddress()
            if (currentAddress.isNullOrBlank()) {
              heavenName = null
              avatarUri = null
              return@launch
            }
            runCatching {
              val (name, avatar) = resolveProfileIdentityWithRetry(currentAddress)
              heavenName = name
              avatarUri = avatar
            }
          }
        },
        onChatThreadVisibilityChange = { chatThreadOpen = it },
        onboardingInitialStep = onboardingInitialStep,
      )
    }
  }
}

@Composable
private fun PirateNavHost(
  activity: androidx.fragment.app.FragmentActivity,
  innerPadding: PaddingValues,
  navController: androidx.navigation.NavHostController,
  authState: PirateAuthUiState,
  heavenName: String?,
  avatarUri: String?,
  onAuthStateChange: (PirateAuthUiState) -> Unit,
  onRegister: () -> Unit,
  onLogin: () -> Unit,
  onLogout: () -> Unit,
  player: PlayerController,
  chatService: XmtpChatService,
  scarlettService: ScarlettService,
  voiceController: AgoraVoiceController,
  scheduledSessionVoiceController: ScheduledSessionVoiceController,
  onOpenDrawer: () -> Unit,
  onShowMessage: (String) -> Unit,
  onRefreshProfileIdentity: () -> Unit,
  onChatThreadVisibilityChange: (Boolean) -> Unit,
  onboardingInitialStep: OnboardingStep = OnboardingStep.NAME,
) {
  val scope = rememberCoroutineScope()
  val activeAddress = authState.activeAddress()
  val tempoAccount = remember(
    authState.tempoAddress,
    authState.tempoCredentialId,
    authState.tempoPubKeyX,
    authState.tempoPubKeyY,
    authState.tempoRpId,
  ) {
    TempoAccountFactory.fromSession(
      tempoAddress = authState.tempoAddress,
      tempoCredentialId = authState.tempoCredentialId,
      tempoPubKeyX = authState.tempoPubKeyX,
      tempoPubKeyY = authState.tempoPubKeyY,
      tempoRpId = authState.tempoRpId.ifBlank { TempoPasskeyManager.DEFAULT_RP_ID },
    )
  }

  NavHost(
    navController = navController,
    startDestination = PirateRoute.Music.route,
    modifier = Modifier.fillMaxSize().padding(innerPadding),
    // nav-compose ships with default fades; opt out so Player can feel like a real "page open".
    enterTransition = { EnterTransition.None },
    exitTransition = { ExitTransition.None },
    popEnterTransition = { EnterTransition.None },
    popExitTransition = { ExitTransition.None },
  ) {
    composable(PirateRoute.Music.route) {
      val isAuthenticated = authState.hasTempoCredentials()
      MusicScreen(
        player = player,
        ownerEthAddress = authState.activeAddress(),
        isAuthenticated = isAuthenticated,
        onShowMessage = onShowMessage,
        onOpenPlayer = {
          navController.navigate(PirateRoute.Player.route) { launchSingleTop = true }
        },
        onOpenDrawer = onOpenDrawer,
        onOpenSongPage = { trackId, title, artist ->
          navController.navigate(
            PirateRoute.Song.buildRoute(trackId = trackId, title = title, artist = artist),
          ) { launchSingleTop = true }
        },
        onOpenArtistPage = { artistName ->
          navController.navigate(PirateRoute.Artist.buildRoute(artistName)) { launchSingleTop = true }
        },
        hostActivity = activity,
        tempoAccount = tempoAccount,
      )
    }
    composable(PirateRoute.Chat.route) {
      val isAuthenticated = authState.hasAnyCredentials()
      ChatScreen(
        chatService = chatService,
        scarlettService = scarlettService,
        voiceController = voiceController,
        isAuthenticated = isAuthenticated,
        userAddress = activeAddress,
        onOpenDrawer = onOpenDrawer,
        onShowMessage = onShowMessage,
        onNavigateToCall = {
          navController.navigate(PirateRoute.VoiceCall.route) { launchSingleTop = true }
        },
        onThreadVisibilityChange = onChatThreadVisibilityChange,
      )
    }
    composable(PirateRoute.Wallet.route) {
      val isAuthenticated = authState.hasAnyCredentials()
      WalletScreen(
        isAuthenticated = isAuthenticated,
        walletAddress = activeAddress,
        onClose = { navController.popBackStack() },
        onShowMessage = onShowMessage,
      )
    }
    composable(PirateRoute.NameStore.route) {
      val isAuthenticated = authState.hasAnyCredentials()
      NameStoreScreen(
        activity = activity,
        isAuthenticated = isAuthenticated,
        account = tempoAccount,
        onClose = { navController.popBackStack() },
        onShowMessage = onShowMessage,
      )
    }
    composable(PirateRoute.Learn.route) {
      val isAuthenticated = authState.hasAnyCredentials()
      LearnScreen(
        isAuthenticated = isAuthenticated,
        userAddress = activeAddress,
        onOpenDrawer = onOpenDrawer,
        onShowMessage = onShowMessage,
        onOpenSong = { trackId ->
          navController.navigate(PirateRoute.Song.buildRoute(trackId = trackId)) { launchSingleTop = true }
        },
      )
    }
    composable(
      route = PirateRoute.Song.route,
      arguments = listOf(
        navArgument(PirateRoute.Song.ARG_TRACK_ID) { type = NavType.StringType },
        navArgument(PirateRoute.Song.ARG_TITLE) {
          type = NavType.StringType
          nullable = true
          defaultValue = ""
        },
        navArgument(PirateRoute.Song.ARG_ARTIST) {
          type = NavType.StringType
          nullable = true
          defaultValue = ""
        },
      ),
    ) { backStackEntry ->
      val trackId = backStackEntry.arguments?.getString(PirateRoute.Song.ARG_TRACK_ID).orEmpty()
      val title = backStackEntry.arguments?.getString(PirateRoute.Song.ARG_TITLE)?.takeIf { it.isNotBlank() }
      val artist = backStackEntry.arguments?.getString(PirateRoute.Song.ARG_ARTIST)?.takeIf { it.isNotBlank() }
      val isAuthenticated = authState.hasAnyCredentials()
      SongScreen(
        trackId = trackId,
        initialTitle = title,
        initialArtist = artist,
        isAuthenticated = isAuthenticated,
        userAddress = activeAddress,
        onBack = { navController.popBackStack() },
        onOpenArtist = { artistName ->
          navController.navigate(PirateRoute.Artist.buildRoute(artistName)) { launchSingleTop = true }
        },
        onOpenProfile = { address ->
          navController.navigate(PirateRoute.PublicProfile.buildRoute(address)) { launchSingleTop = true }
        },
        onShowMessage = onShowMessage,
      )
    }
    composable(
      route = PirateRoute.Artist.route,
      arguments = listOf(navArgument(PirateRoute.Artist.ARG_ARTIST_NAME) { type = NavType.StringType }),
    ) { backStackEntry ->
      val artistName = backStackEntry.arguments?.getString(PirateRoute.Artist.ARG_ARTIST_NAME).orEmpty().trim()
      ArtistScreen(
        artistName = artistName,
        onBack = { navController.popBackStack() },
        onOpenSong = { trackId, title, artist ->
          navController.navigate(
            PirateRoute.Song.buildRoute(
              trackId = trackId,
              title = title,
              artist = artist ?: artistName,
            ),
          ) { launchSingleTop = true }
        },
        onOpenProfile = { address ->
          navController.navigate(PirateRoute.PublicProfile.buildRoute(address)) { launchSingleTop = true }
        },
      )
    }
    composable(PirateRoute.Rooms.route) {
      CommunityScreen(
        viewerAddress = activeAddress,
        onMemberClick = { address ->
          navController.navigate(PirateRoute.PublicProfile.buildRoute(address)) {
            launchSingleTop = true
          }
        },
      )
    }
    composable(PirateRoute.Schedule.route) {
      val isAuthenticated = authState.hasAnyCredentials()
      ScheduleScreen(
        isAuthenticated = isAuthenticated,
        userAddress = activeAddress,
        onOpenDrawer = onOpenDrawer,
        onOpenAvailability = {
          navController.navigate(PirateRoute.ScheduleAvailability.route) { launchSingleTop = true }
        },
        onJoinBooking = { bookingId ->
          val wallet = activeAddress
          if (wallet.isNullOrBlank()) {
            onShowMessage("Sign in to join this session.")
            return@ScheduleScreen
          }
          scheduledSessionVoiceController.startSession(
            bookingId = bookingId,
            userAddress = wallet,
          )
          navController.navigate(PirateRoute.ScheduledSessionCall.route) { launchSingleTop = true }
        },
        onShowMessage = onShowMessage,
      )
    }
    composable(PirateRoute.ScheduleAvailability.route) {
      val isAuthenticated = authState.hasAnyCredentials()
      ScheduleAvailabilityScreen(
        isAuthenticated = isAuthenticated,
        onClose = { navController.popBackStack() },
      )
    }
    composable(PirateRoute.Profile.route) {
      val isAuthenticated = authState.hasAnyCredentials()
      ProfileScreen(
        ethAddress = activeAddress,
        heavenName = heavenName,
        avatarUri = avatarUri,
        isAuthenticated = isAuthenticated,
        busy = authState.busy,
        selfVerified = authState.selfVerified,
        onRegister = onRegister,
        onLogin = onLogin,
        onLogout = onLogout,
        onBack = { navController.popBackStack() },
        onMessage = null,
        onEditProfile = {
          navController.navigate(PirateRoute.EditProfile.route) { launchSingleTop = true }
        },
        activity = activity,
        tempoAccount = tempoAccount,
        viewerEthAddress = activeAddress,
        onPlayPublishedSong = { song ->
          val audioUrl = CoverRef.resolveCoverUrl(song.pieceCid, width = null, height = null, format = null, quality = null)
          if (audioUrl.isNullOrBlank()) {
            onShowMessage("No audio available for this track")
            return@ProfileScreen
          }
          val coverUrl = CoverRef.resolveCoverUrl(song.coverCid, width = 192, height = 192, format = "webp", quality = 80)
          val track = MusicTrack(
            id = song.contentId,
            title = song.title.ifBlank { "Unknown Track" },
            artist = song.artist.ifBlank { "Unknown Artist" },
            album = song.album,
            durationSec = song.durationSec,
            uri = audioUrl,
            filename = song.title.ifBlank { "track" },
            artworkUri = coverUrl,
            contentId = song.contentId,
            pieceCid = song.pieceCid,
          )
          player.playTrack(track, listOf(track))
        },
        onOpenSong = { trackId, title, artist ->
          navController.navigate(
            PirateRoute.Song.buildRoute(trackId = trackId, title = title, artist = artist),
          ) { launchSingleTop = true }
        },
        onOpenArtist = { artistName ->
          navController.navigate(PirateRoute.Artist.buildRoute(artistName)) { launchSingleTop = true }
        },
        onViewProfile = { address ->
          navController.navigate(PirateRoute.PublicProfile.buildRoute(address)) { launchSingleTop = true }
        },
        onNavigateFollowList = { mode, address ->
          navController.navigate(PirateRoute.FollowList.buildRoute(address, mode)) { launchSingleTop = true }
        },
      )
    }
    composable(
      route = PirateRoute.PublicProfile.route,
      arguments = listOf(navArgument(PirateRoute.PublicProfile.ARG_ADDRESS) { type = NavType.StringType }),
    ) { backStackEntry ->
      val isAuthenticated = authState.hasAnyCredentials()
      val rawAddress = backStackEntry.arguments?.getString(PirateRoute.PublicProfile.ARG_ADDRESS).orEmpty()
      val targetAddress = remember(rawAddress) {
        val trimmed = rawAddress.trim()
        when {
          trimmed.isBlank() -> null
          trimmed.startsWith("0x", ignoreCase = true) -> trimmed
          trimmed.length == 40 -> "0x$trimmed"
          else -> trimmed
        }
      }
      var targetHeavenName by remember(targetAddress) { mutableStateOf<String?>(null) }
      var targetAvatarUri by remember(targetAddress) { mutableStateOf<String?>(null) }

      LaunchedEffect(targetAddress) {
        targetHeavenName = null
        targetAvatarUri = null
        if (targetAddress.isNullOrBlank()) return@LaunchedEffect
        val (name, avatar) = resolveProfileIdentity(targetAddress)
        targetHeavenName = name
        targetAvatarUri = avatar
      }

      ProfileScreen(
        ethAddress = targetAddress,
        heavenName = targetHeavenName,
        avatarUri = targetAvatarUri,
        isAuthenticated = isAuthenticated,
        busy = authState.busy,
        selfVerified =
          authState.selfVerified &&
            activeAddress != null &&
            targetAddress != null &&
            activeAddress.equals(targetAddress, ignoreCase = true),
        onRegister = onRegister,
        onLogin = onLogin,
        onLogout = {},
        onBack = { navController.popBackStack() },
        onMessage = { address ->
          scope.launch {
            runCatching {
              val selfAddress = activeAddress
              if (selfAddress.isNullOrBlank()) {
                throw IllegalStateException("Missing chat auth context")
              }
              if (!chatService.connected.value) {
                chatService.connect(selfAddress)
              }
              val dmId = chatService.newDm(address)
              chatService.openConversation(dmId)
              navController.navigate(PirateRoute.Chat.route) { launchSingleTop = true }
            }.onFailure { err ->
              val message = err.message ?: "unknown error"
              when {
                message.contains("No XMTP inboxId", ignoreCase = true) ->
                  onShowMessage("This user has not enabled messaging yet.")
                message.contains("Missing chat auth context", ignoreCase = true) ->
                  onShowMessage("Missing chat auth. Please sign in again.")
                else -> onShowMessage("Message failed: $message")
              }
            }
          }
        },
        activity = activity,
        tempoAccount = tempoAccount,
        viewerEthAddress = activeAddress,
        onPlayPublishedSong = { song ->
          val audioUrl = CoverRef.resolveCoverUrl(song.pieceCid, width = null, height = null, format = null, quality = null)
          if (audioUrl.isNullOrBlank()) {
            onShowMessage("No audio available for this track")
            return@ProfileScreen
          }
          val coverUrl = CoverRef.resolveCoverUrl(song.coverCid, width = 192, height = 192, format = "webp", quality = 80)
          val track = MusicTrack(
            id = song.contentId,
            title = song.title.ifBlank { "Unknown Track" },
            artist = song.artist.ifBlank { "Unknown Artist" },
            album = song.album,
            durationSec = song.durationSec,
            uri = audioUrl,
            filename = song.title.ifBlank { "track" },
            artworkUri = coverUrl,
            contentId = song.contentId,
            pieceCid = song.pieceCid,
          )
          player.playTrack(track, listOf(track))
        },
        onOpenSong = { trackId, title, artist ->
          navController.navigate(
            PirateRoute.Song.buildRoute(trackId = trackId, title = title, artist = artist),
          ) { launchSingleTop = true }
        },
        onOpenArtist = { artistName ->
          navController.navigate(PirateRoute.Artist.buildRoute(artistName)) { launchSingleTop = true }
        },
        onViewProfile = { address ->
          navController.navigate(PirateRoute.PublicProfile.buildRoute(address)) { launchSingleTop = true }
        },
        onNavigateFollowList = { mode, address ->
          navController.navigate(PirateRoute.FollowList.buildRoute(address, mode)) { launchSingleTop = true }
        },
      )
    }
    composable(
      route = PirateRoute.FollowList.route,
      arguments = listOf(
        navArgument(PirateRoute.FollowList.ARG_ADDRESS) { type = NavType.StringType },
        navArgument(PirateRoute.FollowList.ARG_MODE) { type = NavType.StringType },
      ),
    ) { backStackEntry ->
      val address = backStackEntry.arguments?.getString(PirateRoute.FollowList.ARG_ADDRESS).orEmpty().trim()
      val modeName = backStackEntry.arguments?.getString(PirateRoute.FollowList.ARG_MODE).orEmpty()
      val mode = runCatching { FollowListMode.valueOf(modeName) }.getOrDefault(FollowListMode.Following)
      FollowListScreen(
        mode = mode,
        ethAddress = address,
        onClose = { navController.popBackStack() },
        onMemberClick = { memberAddress ->
          navController.navigate(PirateRoute.PublicProfile.buildRoute(memberAddress)) { launchSingleTop = true }
        },
      )
    }
    composable(PirateRoute.EditProfile.route) {
      val address = activeAddress
      if (!authState.hasTempoCredentials() || address.isNullOrBlank()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
          Text("Sign in with Tempo passkey to edit your profile", color = Color(0xFFA3A3A3))
        }
      } else {
        ProfileEditScreen(
          activity = activity,
          ethAddress = address,
          tempoAddress = authState.tempoAddress,
          tempoCredentialId = authState.tempoCredentialId,
          tempoPubKeyX = authState.tempoPubKeyX,
          tempoPubKeyY = authState.tempoPubKeyY,
          tempoRpId = authState.tempoRpId.ifBlank { TempoPasskeyManager.DEFAULT_RP_ID },
          onBack = { navController.popBackStack() },
          onSaved = {
            onRefreshProfileIdentity()
            onShowMessage("Profile updated")
            navController.navigate(PirateRoute.Profile.route) {
              popUpTo(PirateRoute.Profile.route) { inclusive = true }
              launchSingleTop = true
            }
          },
        )
      }
    }
    composable(
      route = PirateRoute.Onboarding.route,
      enterTransition = {
        slideInVertically(
          animationSpec = tween(durationMillis = 220),
          initialOffsetY = { fullHeight -> fullHeight },
        )
      },
      popExitTransition = {
        slideOutVertically(
          animationSpec = tween(durationMillis = 200),
          targetOffsetY = { fullHeight -> fullHeight },
        )
      },
    ) {
      OnboardingScreen(
        activity = activity,
        userEthAddress = activeAddress.orEmpty(),
        tempoAddress = authState.tempoAddress,
        tempoCredentialId = authState.tempoCredentialId,
        tempoPubKeyX = authState.tempoPubKeyX,
        tempoPubKeyY = authState.tempoPubKeyY,
        tempoRpId = authState.tempoRpId.ifBlank { TempoPasskeyManager.DEFAULT_RP_ID },
        initialStep = onboardingInitialStep,
        onEnsureMessagingInbox = {
          val address = activeAddress
          if (!address.isNullOrBlank()) {
            scope.launch {
              runCatching {
                if (!chatService.connected.value) {
                  chatService.connect(address)
                }
              }.onFailure { err ->
                android.util.Log.w("PirateApp", "XMTP bootstrap failed (onboarding): ${err.message}")
              }
            }
          }
        },
        onComplete = {
          onRefreshProfileIdentity()
          navController.navigate(PirateRoute.Music.route) {
            popUpTo(PirateRoute.Onboarding.route) { inclusive = true }
            launchSingleTop = true
          }
        },
      )
    }
    composable(
      route = PirateRoute.VerifyIdentity.route,
      enterTransition = {
        slideInVertically(
          animationSpec = tween(durationMillis = 220),
          initialOffsetY = { fullHeight -> fullHeight },
        )
      },
      popExitTransition = {
        slideOutVertically(
          animationSpec = tween(durationMillis = 200),
          targetOffsetY = { fullHeight -> fullHeight },
        )
      },
    ) {
      val isAuthenticated = authState.hasAnyCredentials()
      VerifyIdentityScreen(
        authState = authState,
        ownerAddress = authState.activeAddress(),
        isAuthenticated = isAuthenticated,
        onSelfVerifiedChange = { verified ->
          if (authState.selfVerified != verified) {
            onAuthStateChange(authState.copy(selfVerified = verified))
          }
        },
        onClose = { navController.popBackStack() },
        onShowMessage = onShowMessage,
      )
    }
    composable(
      route = PirateRoute.Publish.route,
      enterTransition = {
        slideInVertically(
          animationSpec = tween(durationMillis = 220),
          initialOffsetY = { fullHeight -> fullHeight },
        )
      },
      popExitTransition = {
        slideOutVertically(
          animationSpec = tween(durationMillis = 200),
          targetOffsetY = { fullHeight -> fullHeight },
        )
      },
    ) {
      val isAuthenticated = authState.hasAnyCredentials()
      PublishScreen(
        authState = authState,
        ownerAddress = authState.activeAddress(),
        heavenName = heavenName,
        isAuthenticated = isAuthenticated,
        onSelfVerifiedChange = { verified ->
          if (authState.selfVerified != verified) {
            onAuthStateChange(authState.copy(selfVerified = verified))
          }
        },
        onClose = { navController.popBackStack() },
        onShowMessage = onShowMessage,
      )
    }
    composable(
      route = PirateRoute.Player.route,
      enterTransition = {
        // Slide the player up from the bottom (Spotify-style) instead of fading.
        slideInVertically(
          animationSpec = tween(durationMillis = 220),
          initialOffsetY = { fullHeight -> fullHeight },
        )
      },
      popExitTransition = {
        slideOutVertically(
          animationSpec = tween(durationMillis = 200),
          targetOffsetY = { fullHeight -> fullHeight },
        )
      },
    ) {
      val isAuthenticated = authState.hasTempoCredentials()
      com.pirate.app.player.PlayerScreen(
        player = player,
        ownerEthAddress = authState.activeAddress(),
        isAuthenticated = isAuthenticated,
        onClose = { navController.popBackStack() },
        onShowMessage = onShowMessage,
        hostActivity = activity,
        tempoAccount = tempoAccount,
      )
    }
    composable(
      route = PirateRoute.VoiceCall.route,
      enterTransition = {
        slideInVertically(
          animationSpec = tween(durationMillis = 220),
          initialOffsetY = { fullHeight -> fullHeight },
        )
      },
      popExitTransition = {
        slideOutVertically(
          animationSpec = tween(durationMillis = 200),
          targetOffsetY = { fullHeight -> fullHeight },
        )
      },
    ) {
      ScarlettCallScreen(
        controller = voiceController,
        onMinimize = { navController.popBackStack() },
      )
    }
    composable(
      route = PirateRoute.ScheduledSessionCall.route,
      enterTransition = {
        slideInVertically(
          animationSpec = tween(durationMillis = 220),
          initialOffsetY = { fullHeight -> fullHeight },
        )
      },
      popExitTransition = {
        slideOutVertically(
          animationSpec = tween(durationMillis = 200),
          targetOffsetY = { fullHeight -> fullHeight },
        )
      },
    ) {
      ScheduledSessionCallScreen(
        controller = scheduledSessionVoiceController,
        onMinimize = { navController.popBackStack() },
      )
    }
  }
}
