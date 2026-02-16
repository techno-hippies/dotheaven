package com.pirate.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.fragment.app.FragmentActivity
import com.pirate.app.theme.PirateTheme
import com.reown.appkit.client.AppKit

class MainActivity : FragmentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handleDeepLink(intent)
    setContent {
      PirateTheme { PirateApp(activity = this@MainActivity) }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleDeepLink(intent)
  }

  private fun handleDeepLink(intent: Intent?) {
    val uri = intent?.dataString ?: return
    if (uri.contains("wc_ev") || uri.contains("pirate-wc")) {
      AppKit.handleDeepLink(uri) { error ->
        android.util.Log.e("MainActivity", "AppKit deep link error: ${error.throwable.message}")
      }
    }
  }
}
