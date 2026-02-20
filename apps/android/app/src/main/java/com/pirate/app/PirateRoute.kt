package com.pirate.app

import android.net.Uri
import com.pirate.app.profile.FollowListMode

internal sealed class PirateRoute(val route: String, val label: String) {
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
