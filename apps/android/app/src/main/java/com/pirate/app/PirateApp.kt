package com.pirate.app
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.pirate.app.auth.PirateAuthUiState
import com.pirate.app.chat.XmtpChatService
import com.pirate.app.scarlett.AgoraVoiceController
import com.pirate.app.scarlett.ScarlettService
import com.pirate.app.scarlett.clearWorkerAuthCache
import com.pirate.app.schedule.ScheduledSessionVoiceController
import com.pirate.app.scrobble.ScrobbleService
import com.pirate.app.tempo.TempoPasskeyManager
import com.pirate.app.ui.PirateTopBar
import com.pirate.app.player.PlayerController
import com.pirate.app.onboarding.OnboardingStep
import com.pirate.app.onboarding.checkOnboardingStatus
import kotlinx.coroutines.launch

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
  val showBottomChrome = showBottomChromeForRoute(currentRoute = currentRoute, chatThreadOpen = chatThreadOpen)
  val showTopChrome = showTopChromeForRoute(currentRoute = currentRoute)
  val currentTitle = routeTitle(currentRoute = currentRoute)

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
      PirateDrawerContent(
        drawerState = drawerState,
        navController = navController,
        isAuthenticated = isAuthenticated,
        busy = authState.busy,
        ethAddress = activeAddress,
        heavenName = heavenName,
        avatarUri = avatarUri,
        selfVerified = authState.selfVerified,
        onRegister = { doRegister() },
        onLogin = { doLogin() },
        onLogout = { doLogout() },
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
          PirateBottomBar(
            routes = routes,
            navController = navController,
            currentRoute = currentRoute,
            voiceController = voiceController,
            player = player,
          )
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
