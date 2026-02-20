package com.pirate.app

import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavType
import androidx.navigation.navArgument
import androidx.navigation.compose.composable
import com.pirate.app.chat.ChatScreen
import com.pirate.app.community.CommunityScreen
import com.pirate.app.learn.LearnScreen
import com.pirate.app.music.MusicScreen
import com.pirate.app.schedule.ScheduleAvailabilityScreen
import com.pirate.app.schedule.ScheduleScreen
import com.pirate.app.song.ArtistScreen
import com.pirate.app.song.SongScreen
import com.pirate.app.store.NameStoreScreen
import com.pirate.app.wallet.WalletScreen

internal fun NavGraphBuilder.registerPrimaryRoutes(context: PirateNavHostContext) {
  composable(PirateRoute.Music.route) {
    val isAuthenticated = context.authState.hasTempoCredentials()
    MusicScreen(
      player = context.player,
      ownerEthAddress = context.authState.activeAddress(),
      isAuthenticated = isAuthenticated,
      onShowMessage = context.onShowMessage,
      onOpenPlayer = {
        context.navController.navigate(PirateRoute.Player.route) { launchSingleTop = true }
      },
      onOpenDrawer = context.onOpenDrawer,
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

  composable(PirateRoute.Chat.route) {
    val isAuthenticated = context.authState.hasAnyCredentials()
    ChatScreen(
      chatService = context.chatService,
      scarlettService = context.scarlettService,
      voiceController = context.voiceController,
      isAuthenticated = isAuthenticated,
      userAddress = context.activeAddress,
      onOpenDrawer = context.onOpenDrawer,
      onShowMessage = context.onShowMessage,
      onNavigateToCall = {
        context.navController.navigate(PirateRoute.VoiceCall.route) { launchSingleTop = true }
      },
      onThreadVisibilityChange = context.onChatThreadVisibilityChange,
    )
  }

  composable(PirateRoute.Wallet.route) {
    val isAuthenticated = context.authState.hasAnyCredentials()
    WalletScreen(
      isAuthenticated = isAuthenticated,
      walletAddress = context.activeAddress,
      onClose = { context.navController.popBackStack() },
      onShowMessage = context.onShowMessage,
    )
  }

  composable(PirateRoute.NameStore.route) {
    val isAuthenticated = context.authState.hasAnyCredentials()
    NameStoreScreen(
      activity = context.activity,
      isAuthenticated = isAuthenticated,
      account = context.tempoAccount,
      onClose = { context.navController.popBackStack() },
      onShowMessage = context.onShowMessage,
    )
  }

  composable(PirateRoute.Learn.route) {
    val isAuthenticated = context.authState.hasAnyCredentials()
    LearnScreen(
      isAuthenticated = isAuthenticated,
      userAddress = context.activeAddress,
      onOpenDrawer = context.onOpenDrawer,
      onShowMessage = context.onShowMessage,
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
    val isAuthenticated = context.authState.hasAnyCredentials()
    SongScreen(
      trackId = trackId,
      initialTitle = title,
      initialArtist = artist,
      isAuthenticated = isAuthenticated,
      userAddress = context.activeAddress,
      onBack = { context.navController.popBackStack() },
      onOpenArtist = { artistName ->
        context.navController.navigate(PirateRoute.Artist.buildRoute(artistName)) { launchSingleTop = true }
      },
      onOpenProfile = { address ->
        context.navController.navigate(PirateRoute.PublicProfile.buildRoute(address)) { launchSingleTop = true }
      },
      onShowMessage = context.onShowMessage,
    )
  }

  composable(
    route = PirateRoute.Artist.route,
    arguments = listOf(navArgument(PirateRoute.Artist.ARG_ARTIST_NAME) { type = NavType.StringType }),
  ) { backStackEntry ->
    val artistName = backStackEntry.arguments?.getString(PirateRoute.Artist.ARG_ARTIST_NAME).orEmpty().trim()
    ArtistScreen(
      artistName = artistName,
      onBack = { context.navController.popBackStack() },
      onOpenSong = { trackId, title, artist ->
        context.navController.navigate(
          PirateRoute.Song.buildRoute(
            trackId = trackId,
            title = title,
            artist = artist ?: artistName,
          ),
        ) { launchSingleTop = true }
      },
      onOpenProfile = { address ->
        context.navController.navigate(PirateRoute.PublicProfile.buildRoute(address)) { launchSingleTop = true }
      },
    )
  }

  composable(PirateRoute.Rooms.route) {
    CommunityScreen(
      viewerAddress = context.activeAddress,
      onMemberClick = { address ->
        context.navController.navigate(PirateRoute.PublicProfile.buildRoute(address)) {
          launchSingleTop = true
        }
      },
    )
  }

  composable(PirateRoute.Schedule.route) {
    val isAuthenticated = context.authState.hasAnyCredentials()
    ScheduleScreen(
      isAuthenticated = isAuthenticated,
      userAddress = context.activeAddress,
      tempoAccount = context.tempoAccount,
      onOpenDrawer = context.onOpenDrawer,
      onOpenAvailability = {
        context.navController.navigate(PirateRoute.ScheduleAvailability.route) { launchSingleTop = true }
      },
      onJoinBooking = { bookingId ->
        val wallet = context.activeAddress
        if (wallet.isNullOrBlank()) {
          context.onShowMessage("Sign in to join this session.")
          return@ScheduleScreen
        }
        context.scheduledSessionVoiceController.startSession(
          bookingId = bookingId,
          userAddress = wallet,
        )
        context.navController.navigate(PirateRoute.ScheduledSessionCall.route) { launchSingleTop = true }
      },
      onShowMessage = context.onShowMessage,
    )
  }

  composable(PirateRoute.ScheduleAvailability.route) {
    val isAuthenticated = context.authState.hasAnyCredentials()
    ScheduleAvailabilityScreen(
      isAuthenticated = isAuthenticated,
      userAddress = context.activeAddress,
      tempoAccount = context.tempoAccount,
      onClose = { context.navController.popBackStack() },
      onShowMessage = context.onShowMessage,
    )
  }
}
