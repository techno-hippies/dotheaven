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
      try {
        WalletConnectBootstrap.ensureInitialized(application)
        AppKit.handleDeepLink(uri) { error ->
          android.util.Log.e("MainActivity", "AppKit deep link error: ${error.throwable.message}")
        }
      } catch (error: Throwable) {
        android.util.Log.e("MainActivity", "AppKit init failed for deep link: ${error.message}")
      }
    } else if (uri.startsWith("heaven://self")) {
      // Self.xyz verification callback — the polling loop in SelfVerificationGate
      // will detect the verified status automatically. Just log the return.
      android.util.Log.i("MainActivity", "Self.xyz callback received: $uri")
    }
  }
}
