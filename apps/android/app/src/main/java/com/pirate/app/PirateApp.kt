package com.pirate.app

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
import com.pirate.app.lit.LitAuthContextManager
import com.pirate.app.lit.LitRust
import com.pirate.app.lit.PirateAuthConfig
import com.pirate.app.lit.WalletAuth
import com.pirate.app.music.MusicScreen
import com.pirate.app.music.PublishScreen
import com.pirate.app.player.PlayerController
import com.pirate.app.profile.ProfileEditScreen
import com.pirate.app.profile.ProfileScreen
import com.pirate.app.profile.TempoNameRecordsApi
import com.pirate.app.scarlett.AgoraVoiceController
import com.pirate.app.scarlett.ScarlettCallScreen
import com.pirate.app.scarlett.ScarlettService
import com.pirate.app.scarlett.ScarlettVoiceBar
import com.pirate.app.scarlett.VoiceCallState
import com.pirate.app.scarlett.clearWorkerAuthCache
import com.pirate.app.schedule.ScheduleScreen
import com.pirate.app.scrobble.ScrobbleService
import com.pirate.app.tempo.TempoPasskeyManager
import com.pirate.app.ui.PirateMiniPlayer
import com.pirate.app.ui.PirateSideMenuDrawer
import com.pirate.app.ui.PirateTopBar
import com.pirate.app.onboarding.OnboardingScreen
import com.pirate.app.onboarding.OnboardingStep
import com.pirate.app.onboarding.checkOnboardingStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private sealed class PirateRoute(val route: String, val label: String) {
  data object Music : PirateRoute("music", "Music")
  data object Chat : PirateRoute("chat", "Chat")
  data object Learn : PirateRoute("learn", "Learn")
  data object Schedule : PirateRoute("schedule", "Schedule")
  data object Rooms : PirateRoute("rooms", "Community")
  data object Profile : PirateRoute("profile", "Profile")
  data object PublicProfile : PirateRoute("profile/public/{address}", "Profile") {
    const val ARG_ADDRESS = "address"
    fun buildRoute(address: String): String = "profile/public/${address.trim()}"
  }
  data object EditProfile : PirateRoute("profile/edit", "Edit Profile")
  data object Player : PirateRoute("player", "Player")
  data object VoiceCall : PirateRoute("voice_call", "Voice Call")
  data object Onboarding : PirateRoute("onboarding", "Onboarding")
  data object Publish : PirateRoute("publish", "Publish Song")
}

private suspend fun resolveProfileIdentity(address: String): Pair<String?, String?> = withContext(Dispatchers.IO) {
  val tempoName = TempoNameRecordsApi.getPrimaryName(address)
  if (!tempoName.isNullOrBlank()) {
    val node = TempoNameRecordsApi.computeNode(tempoName)
    val avatar = TempoNameRecordsApi.getTextRecord(node, "avatar") ?: OnboardingRpcHelpers.getTextRecord(node, "avatar")
    return@withContext tempoName to avatar
  }

  val legacyName = OnboardingRpcHelpers.getPrimaryName(address)
  if (legacyName.isNullOrBlank()) return@withContext null to null
  val node = OnboardingRpcHelpers.computeNode(legacyName)
  val avatar = TempoNameRecordsApi.getTextRecord(node, "avatar") ?: OnboardingRpcHelpers.getTextRecord(node, "avatar")
  return@withContext "$legacyName.heaven" to avatar
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

  var onboardingInitialStep by remember { mutableStateOf(OnboardingStep.NAME) }

  var authState by remember {
    val saved = PirateAuthUiState.load(appContext)
    mutableStateOf(
      saved.copy(
        authServiceBaseUrl = PirateAuthConfig.DEFAULT_AUTH_SERVICE_BASE_URL,
        passkeyRpId = saved.tempoRpId.ifBlank { PirateAuthConfig.DEFAULT_PASSKEY_RP_ID },
        litNetwork = PirateAuthConfig.DEFAULT_LIT_NETWORK,
        litRpcUrl = PirateAuthConfig.DEFAULT_LIT_RPC_URL,
        tempoRpId = saved.tempoRpId.ifBlank { TempoPasskeyManager.DEFAULT_RP_ID },
        pkpEthAddress = saved.pkpEthAddress ?: saved.tempoAddress,
      ),
    )
  }

  // Restore Lit auth context from persisted credentials on cold start
  LaunchedEffect(Unit) {
    val s = authState
    if (s.hasLitAuthContextParams()) {
      runCatching {
        LitAuthContextManager.ensureFromState(s, forceRefresh = true)
      }.onFailure { err ->
        if (LitAuthContextManager.isExpiredAuthChallengeError(err)) {
          android.util.Log.w("PirateApp", "Saved Lit auth session expired; clearing credentials")
          runCatching {
            withContext(Dispatchers.IO) {
              LitRust.clearAuthContextRaw()
            }
          }
          LitAuthContextManager.invalidateCache()
          PirateAuthUiState.clear(appContext)
          authState = authState.copy(
            busy = false,
            tempoAddress = null,
            tempoCredentialId = null,
            tempoPubKeyX = null,
            tempoPubKeyY = null,
            pkpPublicKey = null,
            pkpEthAddress = null,
            pkpTokenId = null,
            authMethodType = null,
            authMethodId = null,
            accessToken = null,
            output = "Session expired. Please sign in again.",
          )
          snackbarHostState.showSnackbar("Session expired. Please sign in again.")
        } else {
          android.util.Log.w("PirateApp", "Failed to restore Lit auth context: ${err.message}")
        }
      }
    }
  }

  val scrobbleService =
    remember {
      ScrobbleService(
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
    }
  }

  val isAuthenticated = authState.hasAnyCredentials()
  val activeAddress = authState.activeAddress()

  // Profile identity — hoisted so drawer + profile screen can share
  var heavenName by remember { mutableStateOf<String?>(null) }
  var avatarUri by remember { mutableStateOf<String?>(null) }
  var chatThreadOpen by remember { mutableStateOf(false) }
  var xmtpBootstrapKey by remember { mutableStateOf<String?>(null) }

  LaunchedEffect(activeAddress) {
    val addr = activeAddress
    if (addr.isNullOrBlank()) {
      heavenName = null; avatarUri = null; return@LaunchedEffect
    }
    val (name, avatar) = resolveProfileIdentity(addr)
    heavenName = name
    avatarUri = avatar
  }

  // Ensure each authenticated user gets an XMTP inbox as soon as possible,
  // rather than waiting until they first open the chat screen.
  LaunchedEffect(activeAddress) {
    if (!isAuthenticated) {
      xmtpBootstrapKey = null
      return@LaunchedEffect
    }
    val address = activeAddress
    if (address.isNullOrBlank()) return@LaunchedEffect

    val key = address.lowercase()
    if (chatService.connected.value || xmtpBootstrapKey == key) return@LaunchedEffect
    xmtpBootstrapKey = key

    runCatching {
      chatService.connect(address)
    }.onFailure { err ->
      android.util.Log.w("PirateApp", "XMTP bootstrap failed: ${err.message}")
    }
  }

  val navBackStackEntry by navController.currentBackStackEntryAsState()
  val currentRoute = navBackStackEntry?.destination?.route
  val showBottomChrome = currentRoute != PirateRoute.Player.route &&
    currentRoute != PirateRoute.VoiceCall.route &&
    currentRoute != PirateRoute.Onboarding.route &&
    currentRoute != PirateRoute.Publish.route &&
    currentRoute != PirateRoute.EditProfile.route &&
    currentRoute != PirateRoute.PublicProfile.route &&
    !(currentRoute == PirateRoute.Chat.route && chatThreadOpen)
  val showTopChrome = currentRoute != PirateRoute.Player.route && currentRoute != PirateRoute.Music.route &&
    currentRoute != PirateRoute.Chat.route && currentRoute != PirateRoute.Learn.route &&
    currentRoute != PirateRoute.Schedule.route && currentRoute != PirateRoute.Rooms.route &&
    currentRoute != PirateRoute.Profile.route && currentRoute != PirateRoute.PublicProfile.route &&
    currentRoute != PirateRoute.EditProfile.route &&
    currentRoute != PirateRoute.VoiceCall.route &&
    currentRoute != PirateRoute.Onboarding.route && currentRoute != PirateRoute.Publish.route
  val currentTitle = when (currentRoute) {
    PirateRoute.Music.route -> "Music"
    PirateRoute.Chat.route -> "Chat"
    PirateRoute.Learn.route -> "Learn"
    PirateRoute.Schedule.route -> "Schedule"
    PirateRoute.Rooms.route -> "Community"
    PirateRoute.Profile.route -> "Profile"
    PirateRoute.PublicProfile.route -> "Profile"
    PirateRoute.EditProfile.route -> "Edit Profile"
    PirateRoute.Player.route -> "Now Playing"
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
      val nextState =
        authState.copy(
          busy = false,
          passkeyRpId = account.rpId,
          tempoRpId = account.rpId,
          tempoAddress = account.address,
          tempoCredentialId = account.credentialId,
          tempoPubKeyX = account.pubKey.xHex,
          tempoPubKeyY = account.pubKey.yHex,
          // Transitional alias while unported screens still read pkpEthAddress.
          pkpEthAddress = account.address,
          pkpPublicKey = null,
          pkpTokenId = null,
          authMethodType = null,
          authMethodId = null,
          accessToken = null,
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
      snackbarHostState.showSnackbar("Log in failed: ${err.message ?: "unknown error"}")
    }

    result.onSuccess { account ->
      chatService.disconnect()
      clearWorkerAuthCache()
      xmtpBootstrapKey = null
      val nextState =
        authState.copy(
          busy = false,
          passkeyRpId = account.rpId,
          tempoRpId = account.rpId,
          tempoAddress = account.address,
          tempoCredentialId = account.credentialId,
          tempoPubKeyX = account.pubKey.xHex,
          tempoPubKeyY = account.pubKey.yHex,
          // Transitional alias while unported screens still read pkpEthAddress.
          pkpEthAddress = account.address,
          pkpPublicKey = null,
          pkpTokenId = null,
          authMethodType = null,
          authMethodId = null,
          accessToken = null,
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

    runCatching {
      withContext(Dispatchers.IO) {
        LitRust.clearAuthContextRaw()
      }
    }
    LitAuthContextManager.invalidateCache()

    PirateAuthUiState.clear(appContext)
    authState =
      authState.copy(
        tempoAddress = null,
        tempoCredentialId = null,
        tempoPubKeyX = null,
        tempoPubKeyY = null,
        pkpPublicKey = null,
        pkpEthAddress = null,
        pkpTokenId = null,
        authMethodType = null,
        authMethodId = null,
        accessToken = null,
        output = "Logged out.",
      )
    snackbarHostState.showSnackbar("Logged out.")
  }

  suspend fun doConnectWallet() {
    // Show AppKit wallet modal as a dialog fragment
    val sheet = com.reown.appkit.ui.AppKitSheet()
    sheet.show(activity.supportFragmentManager, "appkit")

    authState = authState.copy(busy = true, output = "Connecting wallet...")
    val result = runCatching {
      WalletAuth.connectAndAuth(
        litNetwork = authState.litNetwork,
        litRpcUrl = authState.litRpcUrl,
      )
    }

    result.onFailure { err ->
      authState = authState.copy(busy = false, output = "Wallet failed: ${err.message}")
      snackbarHostState.showSnackbar("Wallet sign in failed: ${err.message ?: "unknown error"}")
    }

    result.onSuccess { walletResult ->
      clearWorkerAuthCache()
      val derivedEthAddress = com.pirate.app.util.Eth.deriveAddressFromUncompressedPublicKeyHex(walletResult.pkpPublicKey)
        ?: walletResult.pkpEthAddress

      authState = authState.copy(
        busy = true,
        tempoAddress = null,
        tempoCredentialId = null,
        tempoPubKeyX = null,
        tempoPubKeyY = null,
        pkpPublicKey = walletResult.pkpPublicKey,
        pkpEthAddress = derivedEthAddress,
        pkpTokenId = walletResult.pkpTokenId,
        authMethodType = walletResult.authMethodType,
        authMethodId = walletResult.authMethodId,
        accessToken = walletResult.accessToken,
        output = "Creating Lit auth context...",
      )

      val ctxResult = runCatching {
        LitAuthContextManager.ensureFromState(authState, forceRefresh = true)
      }

      ctxResult.onFailure { err ->
        authState = authState.copy(
          busy = false,
          output = "Wallet connected, but Lit auth context failed: ${err.message}",
        )
        snackbarHostState.showSnackbar("Wallet sign in succeeded, but Lit auth failed: ${err.message ?: "unknown error"}")
      }

      ctxResult.onSuccess {
        authState = authState.copy(
          busy = false,
          output = "OK via wallet. PKP=${walletResult.pkpEthAddress.take(10)}... EOA=${walletResult.eoaAddress.take(10)}...",
        )
        PirateAuthUiState.save(appContext, authState)
        snackbarHostState.showSnackbar("Signed in via wallet.")
      }
    }
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
        onNavigateMusic = {
          scope.launch {
            closeDrawer()
            navController.navigate(PirateRoute.Music.route) { launchSingleTop = true }
          }
        },
        onNavigateSchedule = {
          scope.launch {
            closeDrawer()
            navController.navigate(PirateRoute.Schedule.route) { launchSingleTop = true }
          }
        },
        onNavigateChat = {
          scope.launch {
            closeDrawer()
            navController.navigate(PirateRoute.Chat.route) { launchSingleTop = true }
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
        onAuthStateChange = { authState = it },
        onRegister = { scope.launch { doRegister() } },
        onLogin = { scope.launch { doLogin() } },
        onLogout = { scope.launch { doLogout() } },
        onConnectWallet = { scope.launch { doConnectWallet() } },
        player = player,
        chatService = chatService,
        scarlettService = scarlettService,
        voiceController = voiceController,
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
              val (name, avatar) = resolveProfileIdentity(currentAddress)
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
  onConnectWallet: () -> Unit,
  player: PlayerController,
  chatService: XmtpChatService,
  scarlettService: ScarlettService,
  voiceController: AgoraVoiceController,
  onOpenDrawer: () -> Unit,
  onShowMessage: (String) -> Unit,
  onRefreshProfileIdentity: () -> Unit,
  onChatThreadVisibilityChange: (Boolean) -> Unit,
  onboardingInitialStep: OnboardingStep = OnboardingStep.NAME,
) {
  val scope = rememberCoroutineScope()
  val activeAddress = authState.activeAddress()

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
    composable(PirateRoute.Learn.route) {
      Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text("Coming soon", color = Color(0xFFA3A3A3))
      }
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
        onOpenDrawer = onOpenDrawer,
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
        onRegister = onRegister,
        onLogin = onLogin,
        onLogout = onLogout,
        onBack = { navController.popBackStack() },
        onMessage = null,
        onEditProfile = {
          navController.navigate(PirateRoute.EditProfile.route) { launchSingleTop = true }
        },
        viewerEthAddress = activeAddress,
        pkpPublicKey = authState.pkpPublicKey,
        litNetwork = authState.litNetwork,
        litRpcUrl = authState.litRpcUrl,
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
        viewerEthAddress = activeAddress,
        pkpPublicKey = authState.pkpPublicKey,
        litNetwork = authState.litNetwork,
        litRpcUrl = authState.litRpcUrl,
      )
    }
    composable(PirateRoute.EditProfile.route) {
      val address = activeAddress
      if (!authState.hasAnyCredentials() || address.isNullOrBlank()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
          Text("Sign in to edit your profile", color = Color(0xFFA3A3A3))
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
          pkpPublicKey = authState.pkpPublicKey,
          litNetwork = authState.litNetwork,
          litRpcUrl = authState.litRpcUrl,
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
        pkpEthAddress = authState.pkpEthAddress ?: "",
        tempoAddress = authState.tempoAddress,
        tempoCredentialId = authState.tempoCredentialId,
        tempoPubKeyX = authState.tempoPubKeyX,
        tempoPubKeyY = authState.tempoPubKeyY,
        tempoRpId = authState.tempoRpId.ifBlank { TempoPasskeyManager.DEFAULT_RP_ID },
        initialStep = onboardingInitialStep,
        onComplete = {
          navController.navigate(PirateRoute.Music.route) {
            popUpTo(PirateRoute.Onboarding.route) { inclusive = true }
            launchSingleTop = true
          }
        },
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
      val isAuthenticated = authState.hasLitAuthCredentials()
      PublishScreen(
        litNetwork = authState.litNetwork,
        litRpcUrl = authState.litRpcUrl,
        authState = authState,
        pkpPublicKey = authState.pkpPublicKey,
        pkpEthAddress = authState.pkpEthAddress,
        heavenName = heavenName,
        isAuthenticated = isAuthenticated,
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
  }
}
