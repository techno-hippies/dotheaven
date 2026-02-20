package com.pirate.app

private val bottomChromeHiddenRoutes =
  setOf(
    PirateRoute.Player.route,
    PirateRoute.VoiceCall.route,
    PirateRoute.ScheduledSessionCall.route,
    PirateRoute.ScheduleAvailability.route,
    PirateRoute.Onboarding.route,
    PirateRoute.Publish.route,
    PirateRoute.VerifyIdentity.route,
    PirateRoute.EditProfile.route,
    PirateRoute.Wallet.route,
    PirateRoute.NameStore.route,
    PirateRoute.Song.route,
    PirateRoute.Artist.route,
    PirateRoute.PublicProfile.route,
    PirateRoute.FollowList.route,
  )

private val topChromeHiddenRoutes =
  setOf(
    PirateRoute.Player.route,
    PirateRoute.Music.route,
    PirateRoute.Chat.route,
    PirateRoute.Learn.route,
    PirateRoute.Schedule.route,
    PirateRoute.Rooms.route,
    PirateRoute.ScheduleAvailability.route,
    PirateRoute.Profile.route,
    PirateRoute.Wallet.route,
    PirateRoute.NameStore.route,
    PirateRoute.Song.route,
    PirateRoute.Artist.route,
    PirateRoute.PublicProfile.route,
    PirateRoute.EditProfile.route,
    PirateRoute.FollowList.route,
    PirateRoute.VoiceCall.route,
    PirateRoute.ScheduledSessionCall.route,
    PirateRoute.Onboarding.route,
    PirateRoute.Publish.route,
    PirateRoute.VerifyIdentity.route,
  )

private val routeTitles =
  mapOf(
    PirateRoute.Music.route to "Music",
    PirateRoute.Chat.route to "Chat",
    PirateRoute.Wallet.route to "Wallet",
    PirateRoute.NameStore.route to "Store",
    PirateRoute.Song.route to "Song",
    PirateRoute.Artist.route to "Artist",
    PirateRoute.Learn.route to "Learn",
    PirateRoute.Schedule.route to "Schedule",
    PirateRoute.ScheduleAvailability.route to "Availability",
    PirateRoute.Rooms.route to "Community",
    PirateRoute.Profile.route to "Profile",
    PirateRoute.PublicProfile.route to "Profile",
    PirateRoute.EditProfile.route to "Edit Profile",
    PirateRoute.Player.route to "Now Playing",
    PirateRoute.ScheduledSessionCall.route to "Session Call",
    PirateRoute.VerifyIdentity.route to "Verify Identity",
  )

internal fun showBottomChromeForRoute(currentRoute: String?, chatThreadOpen: Boolean): Boolean {
  if (currentRoute == PirateRoute.Chat.route && chatThreadOpen) return false
  return currentRoute !in bottomChromeHiddenRoutes
}

internal fun showTopChromeForRoute(currentRoute: String?): Boolean = currentRoute !in topChromeHiddenRoutes

internal fun routeTitle(currentRoute: String?): String = routeTitles[currentRoute] ?: "Heaven"
