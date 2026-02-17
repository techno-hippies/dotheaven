package com.pirate.app.widget

import android.content.Context
import android.content.SharedPreferences

/**
 * Writes current player state to SharedPreferences so the Glance widget
 * can read it even if the app process was restarted.
 *
 * Widget refresh (updateAll) is handled by PlayerController after calling update/clear.
 */
object PlayerStateStore {
  private const val PREFS_NAME = "now_playing_widget"
  private const val KEY_TITLE = "title"
  private const val KEY_ARTIST = "artist"
  private const val KEY_ARTWORK_URI = "artworkUri"
  private const val KEY_IS_PLAYING = "isPlaying"

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun update(
    context: Context,
    title: String,
    artist: String,
    artworkUri: String?,
    isPlaying: Boolean,
  ) {
    prefs(context).edit()
      .putString(KEY_TITLE, title)
      .putString(KEY_ARTIST, artist)
      .putString(KEY_ARTWORK_URI, artworkUri)
      .putBoolean(KEY_IS_PLAYING, isPlaying)
      .commit() // commit() is synchronous — ensures data is written before widget reads
  }

  fun clear(context: Context) {
    prefs(context).edit().clear().commit()
  }

  fun title(context: Context): String = prefs(context).getString(KEY_TITLE, "") ?: ""
  fun artist(context: Context): String = prefs(context).getString(KEY_ARTIST, "") ?: ""
  fun artworkUri(context: Context): String? = prefs(context).getString(KEY_ARTWORK_URI, null)
  fun isPlaying(context: Context): Boolean = prefs(context).getBoolean(KEY_IS_PLAYING, false)
}
