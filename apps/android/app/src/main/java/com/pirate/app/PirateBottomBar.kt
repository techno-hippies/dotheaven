package com.pirate.app

import androidx.compose.foundation.layout.Column
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.ChatBubble
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.School
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavHostController
import com.pirate.app.player.PlayerController
import com.pirate.app.scarlett.AgoraVoiceController
import com.pirate.app.scarlett.ScarlettVoiceBar
import com.pirate.app.ui.PirateMiniPlayer

@Composable
internal fun PirateBottomBar(
  routes: List<PirateRoute>,
  navController: NavHostController,
  currentRoute: String?,
  voiceController: AgoraVoiceController,
  player: PlayerController,
) {
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
      val currentDestination = navController.currentBackStackEntry?.destination

      routes.forEach { screen ->
        val selected =
          currentDestination?.hierarchy?.any { destination -> destination.route == screen.route } == true ||
            currentRoute == screen.route
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
