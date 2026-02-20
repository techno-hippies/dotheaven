package com.pirate.app

import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.pirate.app.identity.VerifyIdentityScreen
import com.pirate.app.music.PublishScreen
import com.pirate.app.onboarding.OnboardingScreen
import com.pirate.app.scarlett.ScarlettCallScreen
import com.pirate.app.schedule.ScheduledSessionCallScreen
import kotlinx.coroutines.launch

internal fun NavGraphBuilder.registerModalRoutes(context: PirateNavHostContext) {
  composable(
    route = PirateRoute.Onboarding.route,
    enterTransition = { modalEnterTransition() },
    popExitTransition = { modalPopExitTransition() },
  ) {
    OnboardingScreen(
      activity = context.activity,
      userEthAddress = context.activeAddress.orEmpty(),
      tempoAddress = context.authState.tempoAddress,
      tempoCredentialId = context.authState.tempoCredentialId,
      tempoPubKeyX = context.authState.tempoPubKeyX,
      tempoPubKeyY = context.authState.tempoPubKeyY,
      tempoRpId = context.authState.tempoRpId.ifBlank { com.pirate.app.tempo.TempoPasskeyManager.DEFAULT_RP_ID },
      initialStep = context.onboardingInitialStep,
      onEnsureMessagingInbox = {
        val address = context.activeAddress
        if (!address.isNullOrBlank()) {
          context.scope.launch {
            runCatching {
              if (!context.chatService.connected.value) {
                context.chatService.connect(address)
              }
            }.onFailure { err ->
              android.util.Log.w("PirateApp", "XMTP bootstrap failed (onboarding): ${err.message}")
            }
          }
        }
      },
      onComplete = {
        context.onRefreshProfileIdentity()
        context.navController.navigate(PirateRoute.Music.route) {
          popUpTo(PirateRoute.Onboarding.route) { inclusive = true }
          launchSingleTop = true
        }
      },
    )
  }

  composable(
    route = PirateRoute.VerifyIdentity.route,
    enterTransition = { modalEnterTransition() },
    popExitTransition = { modalPopExitTransition() },
  ) {
    val isAuthenticated = context.authState.hasAnyCredentials()
    VerifyIdentityScreen(
      authState = context.authState,
      ownerAddress = context.authState.activeAddress(),
      isAuthenticated = isAuthenticated,
      onSelfVerifiedChange = { verified ->
        if (context.authState.selfVerified != verified) {
          context.onAuthStateChange(context.authState.copy(selfVerified = verified))
        }
      },
      onClose = { context.navController.popBackStack() },
      onShowMessage = context.onShowMessage,
    )
  }

  composable(
    route = PirateRoute.Publish.route,
    enterTransition = { modalEnterTransition() },
    popExitTransition = { modalPopExitTransition() },
  ) {
    val isAuthenticated = context.authState.hasAnyCredentials()
    PublishScreen(
      authState = context.authState,
      ownerAddress = context.authState.activeAddress(),
      heavenName = context.heavenName,
      isAuthenticated = isAuthenticated,
      onSelfVerifiedChange = { verified ->
        if (context.authState.selfVerified != verified) {
          context.onAuthStateChange(context.authState.copy(selfVerified = verified))
        }
      },
      onClose = { context.navController.popBackStack() },
      onShowMessage = context.onShowMessage,
    )
  }

  composable(
    route = PirateRoute.Player.route,
    // Slide the player up from the bottom (Spotify-style) instead of fading.
    enterTransition = { modalEnterTransition() },
    popExitTransition = { modalPopExitTransition() },
  ) {
    val isAuthenticated = context.authState.hasTempoCredentials()
    com.pirate.app.player.PlayerScreen(
      player = context.player,
      ownerEthAddress = context.authState.activeAddress(),
      isAuthenticated = isAuthenticated,
      onClose = { context.navController.popBackStack() },
      onShowMessage = context.onShowMessage,
      onOpenSongPage = { trackId, title, artist ->
        context.navController.navigate(
          PirateRoute.Song.buildRoute(trackId = trackId, title = title, artist = artist),
        ) { launchSingleTop = true }
      },
      onOpenArtistPage = { artistName ->
        context.navController.navigate(PirateRoute.Artist.buildRoute(artistName)) { launchSingleTop = true }
      },
      hostActivity = context.activity,
      tempoAccount = context.tempoAccount,
    )
  }

  composable(
    route = PirateRoute.VoiceCall.route,
    enterTransition = { modalEnterTransition() },
    popExitTransition = { modalPopExitTransition() },
  ) {
    ScarlettCallScreen(
      controller = context.voiceController,
      onMinimize = { context.navController.popBackStack() },
    )
  }

  composable(
    route = PirateRoute.ScheduledSessionCall.route,
    enterTransition = { modalEnterTransition() },
    popExitTransition = { modalPopExitTransition() },
  ) {
    ScheduledSessionCallScreen(
      controller = context.scheduledSessionVoiceController,
      onMinimize = { context.navController.popBackStack() },
    )
  }
}

private fun modalEnterTransition() =
  slideInVertically(
    animationSpec = tween(durationMillis = 220),
    initialOffsetY = { fullHeight -> fullHeight },
  )

private fun modalPopExitTransition() =
  slideOutVertically(
    animationSpec = tween(durationMillis = 200),
    targetOffsetY = { fullHeight -> fullHeight },
  )
