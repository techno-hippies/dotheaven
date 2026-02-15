package com.pirate.app

import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.ChatBubble
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Person
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.pirate.app.about.AboutScreen
import com.pirate.app.auth.PirateAuthUiState
import com.pirate.app.chat.ChatScreen
import com.pirate.app.chat.XmtpChatService
import com.pirate.app.lit.LitRust
import com.pirate.app.lit.NativePasskeyAuth
import com.pirate.app.lit.PirateAuthConfig
import com.pirate.app.music.MusicScreen
import com.pirate.app.player.PlayerController
import com.pirate.app.profile.ProfileScreen
import com.pirate.app.schedule.ScheduleScreen
import com.pirate.app.scrobble.ScrobbleService
import com.pirate.app.ui.PirateMiniPlayer
import com.pirate.app.ui.PirateSideMenuDrawer
import com.pirate.app.ui.PirateTopBar
import com.pirate.app.util.Eth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

private sealed class PirateRoute(val route: String, val label: String) {
  data object Music : PirateRoute("music", "Music")
  data object Chat : PirateRoute("chat", "Chat")
  data object Schedule : PirateRoute("schedule", "Schedule")
  data object Auth : PirateRoute("auth", "Profile")
  data object Profile : PirateRoute("profile", "Scrobbles")
  data object Player : PirateRoute("player", "Player")
}

@Composable
fun PirateApp() {
  val appContext = LocalContext.current.applicationContext
  val navController = rememberNavController()
  val routes = listOf(PirateRoute.Music, PirateRoute.Chat, PirateRoute.Profile, PirateRoute.Schedule, PirateRoute.Auth)
  val scope = rememberCoroutineScope()
  val snackbarHostState = remember { SnackbarHostState() }
  val drawerState = androidx.compose.material3.rememberDrawerState(initialValue = DrawerValue.Closed)
  val activity = LocalContext.current as? android.app.Activity
  val player = remember { PlayerController(appContext) }
  val chatService = remember { XmtpChatService(appContext) }

  var authState by remember {
    mutableStateOf(
      PirateAuthUiState(
        authServiceBaseUrl = PirateAuthConfig.DEFAULT_AUTH_SERVICE_BASE_URL,
        passkeyRpId = PirateAuthConfig.DEFAULT_PASSKEY_RP_ID,
        litNetwork = PirateAuthConfig.DEFAULT_LIT_NETWORK,
        litRpcUrl = PirateAuthConfig.DEFAULT_LIT_RPC_URL,
      ),
    )
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
    }
  }

  val isAuthenticated = authState.pkpPublicKey != null && authState.authMethodId != null && authState.accessToken != null

  val navBackStackEntry by navController.currentBackStackEntryAsState()
  val currentRoute = navBackStackEntry?.destination?.route
  val showBottomChrome = currentRoute != PirateRoute.Player.route
  val showTopChrome = currentRoute != PirateRoute.Player.route && currentRoute != PirateRoute.Music.route &&
    currentRoute != PirateRoute.Chat.route && currentRoute != PirateRoute.Schedule.route &&
    currentRoute != PirateRoute.Profile.route
  val currentTitle = when (currentRoute) {
    PirateRoute.Music.route -> "Music"
    PirateRoute.Chat.route -> "Chat"
    PirateRoute.Schedule.route -> "Schedule"
    PirateRoute.Profile.route -> "Scrobbles"
    PirateRoute.Auth.route -> "About"
    PirateRoute.Player.route -> "Now Playing"
    else -> "Pirate"
  }

  suspend fun closeDrawer() {
    drawerState.close()
  }

  suspend fun openDrawer() {
    drawerState.open()
  }

  suspend fun doRegister() {
    if (activity == null) {
      snackbarHostState.showSnackbar("Missing Activity context for passkeys.")
      return
    }

    authState = authState.copy(busy = true, output = "Registering passkey + minting PKP...")
    val result = runCatching {
      NativePasskeyAuth.registerAndMintPkp(
        activity = activity,
        authServiceBaseUrl = authState.authServiceBaseUrl,
        expectedRpId = authState.passkeyRpId,
        username = "Pirate",
        rpName = "Pirate",
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
        snackbarHostState.showSnackbar("Signed up.")
      }
    }
  }

  suspend fun doLogin() {
    if (activity == null) {
      snackbarHostState.showSnackbar("Missing Activity context for passkeys.")
      return
    }

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
        snackbarHostState.showSnackbar("Logged in.")
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

    authState =
      authState.copy(
        pkpPublicKey = null,
        pkpEthAddress = null,
        pkpTokenId = null,
        authMethodId = null,
        accessToken = null,
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
        onNavigateAccount = {
          scope.launch {
            closeDrawer()
            navController.navigate(PirateRoute.Auth.route) { launchSingleTop = true }
          }
        },
        onSignUp = {
          scope.launch {
            closeDrawer()
            navController.navigate(PirateRoute.Auth.route) { launchSingleTop = true }
            doRegister()
          }
        },
        onSignIn = {
          scope.launch {
            closeDrawer()
            navController.navigate(PirateRoute.Auth.route) { launchSingleTop = true }
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
                      PirateRoute.Profile -> Icon(Icons.Rounded.GraphicEq, contentDescription = null)
                      PirateRoute.Schedule -> Icon(Icons.Rounded.CalendarMonth, contentDescription = null)
                      PirateRoute.Auth -> Icon(Icons.Rounded.Person, contentDescription = null)
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
        onAuthStateChange = { authState = it },
        onRegister = { scope.launch { doRegister() } },
        onLogin = { scope.launch { doLogin() } },
        onLogout = { scope.launch { doLogout() } },
        player = player,
        chatService = chatService,
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
      )
    }
  }
}

@Composable
private fun PirateNavHost(
  innerPadding: PaddingValues,
  navController: androidx.navigation.NavHostController,
  authState: PirateAuthUiState,
  onAuthStateChange: (PirateAuthUiState) -> Unit,
  onRegister: () -> Unit,
  onLogin: () -> Unit,
  onLogout: () -> Unit,
  player: PlayerController,
  chatService: XmtpChatService,
  onOpenDrawer: () -> Unit,
  onShowMessage: (String) -> Unit,
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
        isAuthenticated = isAuthenticated,
        pkpEthAddress = authState.pkpEthAddress,
        pkpPublicKey = authState.pkpPublicKey,
        litNetwork = authState.litNetwork,
        litRpcUrl = authState.litRpcUrl,
        onOpenDrawer = onOpenDrawer,
        onShowMessage = onShowMessage,
      )
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
        isAuthenticated = isAuthenticated,
        busy = authState.busy,
        onRegister = onRegister,
        onLogin = onLogin,
      )
    }
    composable(PirateRoute.Auth.route) {
      val isAuthenticated = authState.pkpPublicKey != null && authState.authMethodId != null && authState.accessToken != null
      AboutScreen(
        isAuthenticated = isAuthenticated,
        ethAddress = authState.pkpEthAddress,
        busy = authState.busy,
        onRegister = onRegister,
        onLogin = onLogin,
        onLogout = onLogout,
        onOpenDrawer = onOpenDrawer,
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
  }
}
