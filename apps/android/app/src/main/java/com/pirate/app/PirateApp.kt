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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.pirate.app.auth.PirateAuthUiState
import com.pirate.app.chat.ChatScreen
import com.pirate.app.chat.XmtpChatService
import com.pirate.app.lit.LitRust
import com.pirate.app.lit.WalletAuth
import com.pirate.app.lit.NativePasskeyAuth
import com.pirate.app.lit.PirateAuthConfig
import com.pirate.app.music.MusicScreen
import com.pirate.app.music.PublishScreen
import com.pirate.app.player.PlayerController
import com.pirate.app.profile.ProfileScreen
import com.pirate.app.scarlett.AgoraVoiceController
import com.pirate.app.scarlett.ScarlettCallScreen
import com.pirate.app.scarlett.ScarlettService
import com.pirate.app.scarlett.ScarlettVoiceBar
import com.pirate.app.scarlett.VoiceCallState
import com.pirate.app.schedule.ScheduleScreen
import com.pirate.app.scrobble.ScrobbleService
import com.pirate.app.ui.PirateMiniPlayer
import com.pirate.app.ui.PirateMobileHeader
import com.pirate.app.ui.PirateSideMenuDrawer
import com.pirate.app.ui.PirateTopBar
import com.pirate.app.onboarding.OnboardingScreen
import com.pirate.app.onboarding.OnboardingStep
import com.pirate.app.onboarding.checkOnboardingStatus
import com.pirate.app.util.Eth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

private sealed class PirateRoute(val route: String, val label: String) {
  data object Music : PirateRoute("music", "Music")
  data object Chat : PirateRoute("chat", "Chat")
  data object Learn : PirateRoute("learn", "Learn")
  data object Schedule : PirateRoute("schedule", "Schedule")
  data object Rooms : PirateRoute("rooms", "Rooms")
  data object Profile : PirateRoute("profile", "Profile")
  data object Player : PirateRoute("player", "Player")
  data object VoiceCall : PirateRoute("voice_call", "Voice Call")
  data object Onboarding : PirateRoute("onboarding", "Onboarding")
  data object Publish : PirateRoute("publish", "Publish Song")
}

@Composable
fun PirateApp(activity: androidx.fragment.app.FragmentActivity) {
  val appContext = LocalContext.current.applicationContext
  val navController = rememberNavController()
  val routes = listOf(PirateRoute.Music, PirateRoute.Rooms, PirateRoute.Chat, PirateRoute.Learn, PirateRoute.Schedule)
  val scope = rememberCoroutineScope()
  val snackbarHostState = remember { SnackbarHostState() }
  val drawerState = androidx.compose.material3.rememberDrawerState(initialValue = DrawerValue.Closed)
  val player = remember { PlayerController(appContext) }
  val chatService = remember { XmtpChatService(appContext) }
  val scarlettService = remember { ScarlettService(appContext) }
  val voiceController = remember { AgoraVoiceController(appContext) }

  var onboardingInitialStep by remember { mutableStateOf(OnboardingStep.NAME) }

  var authState by remember {
    val saved = PirateAuthUiState.load(appContext)
    mutableStateOf(
      saved.copy(
        authServiceBaseUrl = PirateAuthConfig.DEFAULT_AUTH_SERVICE_BASE_URL,
        passkeyRpId = PirateAuthConfig.DEFAULT_PASSKEY_RP_ID,
        litNetwork = PirateAuthConfig.DEFAULT_LIT_NETWORK,
        litRpcUrl = PirateAuthConfig.DEFAULT_LIT_RPC_URL,
      ),
    )
  }

  // Restore Lit auth context from persisted credentials on cold start
  LaunchedEffect(Unit) {
    val s = authState
    if (s.pkpPublicKey != null && s.authMethodId != null && s.accessToken != null && s.authMethodType != null) {
      val authConfigJson = PirateAuthConfig.defaultAuthConfigJson(s.passkeyRpId)
      runCatching {
        withContext(Dispatchers.IO) {
          val raw = LitRust.createAuthContextFromPasskeyCallbackRaw(
            network = s.litNetwork,
            rpcUrl = s.litRpcUrl,
            pkpPublicKey = s.pkpPublicKey,
            authMethodType = s.authMethodType,
            authMethodId = s.authMethodId,
            accessToken = s.accessToken,
            authConfigJson = authConfigJson,
          )
          LitRust.unwrapEnvelope(raw)
        }
      }.onFailure { err ->
        android.util.Log.w("PirateApp", "Failed to restore Lit auth context: ${err.message}")
      }
    }
  }

  val scrobbleService =
    remember {
      ScrobbleService(
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

  val isAuthenticated = authState.pkpPublicKey != null && authState.authMethodId != null && authState.accessToken != null

  // Profile identity — hoisted so drawer + profile screen can share
  var heavenName by remember { mutableStateOf<String?>(null) }
  var avatarUri by remember { mutableStateOf<String?>(null) }

  LaunchedEffect(authState.pkpEthAddress) {
    val addr = authState.pkpEthAddress
    if (addr.isNullOrBlank()) {
      heavenName = null; avatarUri = null; return@LaunchedEffect
    }
    withContext(Dispatchers.IO) {
      val name = OnboardingRpcHelpers.getPrimaryName(addr)
      heavenName = name
      if (name != null) {
        val node = OnboardingRpcHelpers.computeNode(name)
        avatarUri = OnboardingRpcHelpers.getTextRecord(node, "avatar")
      }
    }
  }

  val navBackStackEntry by navController.currentBackStackEntryAsState()
  val currentRoute = navBackStackEntry?.destination?.route
  val chatInThread by chatService.activeConversationId.collectAsState()
  val showBottomChrome = currentRoute != PirateRoute.Player.route &&
    currentRoute != PirateRoute.VoiceCall.route &&
    currentRoute != PirateRoute.Onboarding.route &&
    currentRoute != PirateRoute.Publish.route &&
    !(currentRoute == PirateRoute.Chat.route && chatInThread != null)
  val showTopChrome = currentRoute != PirateRoute.Player.route && currentRoute != PirateRoute.Music.route &&
    currentRoute != PirateRoute.Chat.route && currentRoute != PirateRoute.Learn.route &&
    currentRoute != PirateRoute.Schedule.route && currentRoute != PirateRoute.Rooms.route &&
    currentRoute != PirateRoute.Profile.route && currentRoute != PirateRoute.VoiceCall.route &&
    currentRoute != PirateRoute.Onboarding.route && currentRoute != PirateRoute.Publish.route
  val currentTitle = when (currentRoute) {
    PirateRoute.Music.route -> "Music"
    PirateRoute.Chat.route -> "Chat"
    PirateRoute.Learn.route -> "Learn"
    PirateRoute.Schedule.route -> "Schedule"
    PirateRoute.Rooms.route -> "Rooms"
    PirateRoute.Profile.route -> "Profile"
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
    authState = authState.copy(busy = true, output = "Registering passkey + minting PKP...")
    val result = runCatching {
      NativePasskeyAuth.registerAndMintPkp(
        activity = activity,
        authServiceBaseUrl = authState.authServiceBaseUrl,
        expectedRpId = authState.passkeyRpId,
        username = "Heaven",
        rpName = "Heaven",
        scopes = listOf("sign-anything", "personal-sign"),
        litNetwork = authState.litNetwork,
        litRpcUrl = authState.litRpcUrl,
      )
    }

    result.onFailure { err ->
      authState = authState.copy(busy = false, output = "register failed: ${err.message}")
      snackbarHostState.showSnackbar("Sign up failed: ${err.message ?: "unknown error"}")
    }

    result.onSuccess { reg ->
      val pkp = reg.pkpInfo
      val pkpPubkey =
        pkp.optString("pubkey", pkp.optString("publicKey", "")).let { value ->
          if (value.startsWith("0x") || value.startsWith("0X")) value else "0x$value"
        }
      val pkpEthAddress = pkp.optString("ethAddress", pkp.optString("eth_address", "")).ifBlank { null }
      val pkpTokenId = pkp.optString("tokenId", pkp.optString("token_id", "")).ifBlank { null }
      // Prefer deriving from pubkey when possible (some APIs may return a different address field).
      val derivedEthAddress = Eth.deriveAddressFromUncompressedPublicKeyHex(pkpPubkey) ?: pkpEthAddress

      authState =
        authState.copy(
          busy = true,
          pkpPublicKey = pkpPubkey,
          pkpEthAddress = derivedEthAddress,
          pkpTokenId = pkpTokenId,
          authMethodType = reg.authData.authMethodType,
          authMethodId = reg.authData.authMethodId,
          accessToken = reg.authData.accessToken,
          output = "Creating Lit auth context...",
        )

      val authConfigJson = PirateAuthConfig.defaultAuthConfigJson(authState.passkeyRpId)
      val ctxResult = runCatching {
        withContext(Dispatchers.IO) {
          val raw = LitRust.createAuthContextFromPasskeyCallbackRaw(
            network = authState.litNetwork,
            rpcUrl = authState.litRpcUrl,
            pkpPublicKey = pkpPubkey,
            authMethodType = reg.authData.authMethodType,
            authMethodId = reg.authData.authMethodId,
            accessToken = reg.authData.accessToken,
            authConfigJson = authConfigJson,
          )
          LitRust.unwrapEnvelope(raw)
        }
      }

      ctxResult.onFailure { err ->
        authState =
          authState.copy(
            busy = false,
            output = "Signed up, but Lit auth context failed: ${err.message}",
          )
        snackbarHostState.showSnackbar("Signed up, but Lit auth failed: ${err.message ?: "unknown error"}")
      }

      ctxResult.onSuccess {
        authState =
          authState.copy(
            busy = false,
            output = "OK. tokenId=${pkp.optString("tokenId", "(unknown)")} pkpPubkey=${pkpPubkey.take(18)} authMethodId=${reg.authData.authMethodId.take(18)}",
          )
        PirateAuthUiState.save(appContext, authState)
        snackbarHostState.showSnackbar("Signed up.")

        // Check if onboarding needed and navigate
        val addr = derivedEthAddress ?: pkpEthAddress
        if (addr != null) {
          val step = checkOnboardingStatus(appContext, addr)
          if (step != null) {
            onboardingInitialStep = step
            navController.navigate(PirateRoute.Onboarding.route) { launchSingleTop = true }
          }
        }
      }
    }
  }

  suspend fun doLogin() {
    authState = authState.copy(busy = true, output = "Authenticating with passkey...")
    val result = runCatching {
      val auth = NativePasskeyAuth.authenticateWithPasskey(
        activity = activity,
        expectedRpId = authState.passkeyRpId,
      )

      val pkp = withContext(Dispatchers.IO) {
        val raw = LitRust.viewPkpsByAuthDataRaw(
          network = authState.litNetwork,
          rpcUrl = authState.litRpcUrl,
          authMethodType = auth.authMethodType,
          authMethodId = auth.authMethodId,
          limit = 1,
          offset = 0,
        )
        val resultJson = LitRust.unwrapEnvelope(raw)
        resultJson.getJSONArray("pkps").optJSONObject(0) ?: JSONObject()
      }

      Pair(auth, pkp)
    }

    result.onFailure { err ->
      authState = authState.copy(busy = false, output = "login failed: ${err.message}")
      snackbarHostState.showSnackbar("Log in failed: ${err.message ?: "unknown error"}")
    }

    result.onSuccess { (auth, pkp) ->
      val pkpPubkey =
        pkp.optString("pubkey", pkp.optString("publicKey", "")).let { value ->
          if (value.startsWith("0x") || value.startsWith("0X")) value else "0x$value"
        }
      val pkpEthAddress = pkp.optString("ethAddress", pkp.optString("eth_address", "")).ifBlank { null }
      val pkpTokenId = pkp.optString("tokenId", pkp.optString("token_id", "")).ifBlank { null }
      // Prefer deriving from pubkey when possible (some APIs may return a different address field).
      val derivedEthAddress = Eth.deriveAddressFromUncompressedPublicKeyHex(pkpPubkey) ?: pkpEthAddress

      authState =
        authState.copy(
          busy = true,
          pkpPublicKey = pkpPubkey,
          pkpEthAddress = derivedEthAddress,
          pkpTokenId = pkpTokenId,
          authMethodType = auth.authMethodType,
          authMethodId = auth.authMethodId,
          accessToken = auth.accessToken,
          output = "Creating Lit auth context...",
        )

      val authConfigJson = PirateAuthConfig.defaultAuthConfigJson(authState.passkeyRpId)
      val ctxResult = runCatching {
        withContext(Dispatchers.IO) {
          val raw = LitRust.createAuthContextFromPasskeyCallbackRaw(
            network = authState.litNetwork,
            rpcUrl = authState.litRpcUrl,
            pkpPublicKey = pkpPubkey,
            authMethodType = auth.authMethodType,
            authMethodId = auth.authMethodId,
            accessToken = auth.accessToken,
            authConfigJson = authConfigJson,
          )
          LitRust.unwrapEnvelope(raw)
        }
      }

      ctxResult.onFailure { err ->
        authState =
          authState.copy(
            busy = false,
            output = "Logged in, but Lit auth context failed: ${err.message}",
          )
        snackbarHostState.showSnackbar("Logged in, but Lit auth failed: ${err.message ?: "unknown error"}")
      }

      ctxResult.onSuccess {
        authState =
          authState.copy(
            busy = false,
            output = "OK. tokenId=${pkp.optString("tokenId", "(unknown)")} pkpPubkey=${pkpPubkey.take(18)} authMethodId=${auth.authMethodId.take(18)}",
          )
        PirateAuthUiState.save(appContext, authState)
        snackbarHostState.showSnackbar("Logged in.")

        // Check if onboarding needed and navigate
        val addr = derivedEthAddress ?: pkpEthAddress
        if (addr != null) {
          val step = checkOnboardingStatus(appContext, addr)
          if (step != null) {
            onboardingInitialStep = step
            navController.navigate(PirateRoute.Onboarding.route) { launchSingleTop = true }
          }
        }
      }
    }
  }

  suspend fun doLogout() {
    chatService.disconnect()

    runCatching {
      withContext(Dispatchers.IO) {
        LitRust.clearAuthContextRaw()
      }
    }

    PirateAuthUiState.clear(appContext)
    authState =
      authState.copy(
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
      val derivedEthAddress = com.pirate.app.util.Eth.deriveAddressFromUncompressedPublicKeyHex(walletResult.pkpPublicKey)
        ?: walletResult.pkpEthAddress

      authState = authState.copy(
        busy = false,
        pkpPublicKey = walletResult.pkpPublicKey,
        pkpEthAddress = derivedEthAddress,
        pkpTokenId = walletResult.pkpTokenId,
        authMethodId = walletResult.authMethodId,
        accessToken = walletResult.accessToken,
        output = "OK via wallet. PKP=${walletResult.pkpEthAddress.take(10)}... EOA=${walletResult.eoaAddress.take(10)}...",
      )
      PirateAuthUiState.save(appContext, authState)
      snackbarHostState.showSnackbar("Signed in via wallet.")

      // Check if onboarding needed
      val step = checkOnboardingStatus(appContext, derivedEthAddress)
      if (step != null) {
        onboardingInitialStep = step
        navController.navigate(PirateRoute.Onboarding.route) { launchSingleTop = true }
      }
    }
  }

  ModalNavigationDrawer(
    drawerState = drawerState,
    drawerContent = {
      PirateSideMenuDrawer(
        isAuthenticated = isAuthenticated,
        busy = authState.busy,
        ethAddress = authState.pkpEthAddress,
        heavenName = heavenName,
        avatarUri = avatarUri,
        onNavigateProfile = {
          scope.launch {
            closeDrawer()
            navController.navigate(PirateRoute.Profile.route) { launchSingleTop = true }
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
        onboardingInitialStep = onboardingInitialStep,
      )
    }
  }
}

@Composable
private fun PirateNavHost(
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
  onboardingInitialStep: OnboardingStep = OnboardingStep.NAME,
) {
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
      val isAuthenticated = authState.pkpPublicKey != null && authState.authMethodId != null && authState.accessToken != null
      MusicScreen(
        player = player,
        litNetwork = authState.litNetwork,
        litRpcUrl = authState.litRpcUrl,
        pkpPublicKey = authState.pkpPublicKey,
        ownerEthAddress = authState.pkpEthAddress,
        isAuthenticated = isAuthenticated,
        onShowMessage = onShowMessage,
        onOpenPlayer = {
          navController.navigate(PirateRoute.Player.route) { launchSingleTop = true }
        },
        onOpenDrawer = onOpenDrawer,
      )
    }
    composable(PirateRoute.Chat.route) {
      val isAuthenticated = authState.pkpPublicKey != null && authState.authMethodId != null && authState.accessToken != null
      ChatScreen(
        chatService = chatService,
        scarlettService = scarlettService,
        voiceController = voiceController,
        isAuthenticated = isAuthenticated,
        pkpEthAddress = authState.pkpEthAddress,
        pkpPublicKey = authState.pkpPublicKey,
        litNetwork = authState.litNetwork,
        litRpcUrl = authState.litRpcUrl,
        onOpenDrawer = onOpenDrawer,
        onShowMessage = onShowMessage,
        onNavigateToCall = {
          navController.navigate(PirateRoute.VoiceCall.route) { launchSingleTop = true }
        },
      )
    }
    composable(PirateRoute.Learn.route) {
      Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text("Coming soon", color = Color(0xFFA3A3A3))
      }
    }
    composable(PirateRoute.Rooms.route) {
      RoomsScreen(onOpenDrawer = onOpenDrawer)
    }
    composable(PirateRoute.Schedule.route) {
      val isAuthenticated = authState.pkpPublicKey != null && authState.authMethodId != null && authState.accessToken != null
      ScheduleScreen(
        isAuthenticated = isAuthenticated,
        onOpenDrawer = onOpenDrawer,
      )
    }
    composable(PirateRoute.Profile.route) {
      val isAuthenticated = authState.pkpPublicKey != null && authState.authMethodId != null && authState.accessToken != null
      ProfileScreen(
        ethAddress = authState.pkpEthAddress,
        heavenName = heavenName,
        avatarUri = avatarUri,
        isAuthenticated = isAuthenticated,
        busy = authState.busy,
        onRegister = onRegister,
        onLogin = onLogin,
        onLogout = onLogout,
      )
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
        pkpPublicKey = authState.pkpPublicKey ?: "",
        pkpEthAddress = authState.pkpEthAddress ?: "",
        litNetwork = authState.litNetwork,
        litRpcUrl = authState.litRpcUrl,
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
      val isAuthenticated = authState.pkpPublicKey != null && authState.authMethodId != null && authState.accessToken != null
      PublishScreen(
        litNetwork = authState.litNetwork,
        litRpcUrl = authState.litRpcUrl,
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
      val isAuthenticated = authState.pkpPublicKey != null && authState.authMethodId != null && authState.accessToken != null
      com.pirate.app.player.PlayerScreen(
        player = player,
        litNetwork = authState.litNetwork,
        litRpcUrl = authState.litRpcUrl,
        pkpPublicKey = authState.pkpPublicKey,
        ownerEthAddress = authState.pkpEthAddress,
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

@Composable
private fun RoomsScreen(onOpenDrawer: () -> Unit) {
  var searchText by remember { mutableStateOf("") }

  Column(modifier = Modifier.fillMaxSize()) {
    PirateMobileHeader(
      title = "Rooms",
      onAvatarPress = onOpenDrawer,
    )

    OutlinedTextField(
      value = searchText,
      onValueChange = { searchText = it },
      modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
      placeholder = { Text("Search rooms, people, music...") },
      leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
      singleLine = true,
      shape = RoundedCornerShape(24.dp),
      colors = OutlinedTextFieldDefaults.colors(),
    )

    Spacer(modifier = Modifier.height(24.dp))

    Box(
      modifier = Modifier.fillMaxSize(),
      contentAlignment = Alignment.Center,
    ) {
      Text("Coming soon", color = Color(0xFFA3A3A3))
    }
  }
}
