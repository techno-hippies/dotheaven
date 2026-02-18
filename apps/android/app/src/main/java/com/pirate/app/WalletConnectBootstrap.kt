package com.pirate.app

import android.app.Application
import android.util.Log
import com.reown.android.Core
import com.reown.android.CoreClient
import com.reown.appkit.client.AppKit
import com.reown.appkit.client.Modal
import com.reown.appkit.presets.AppKitChainsPresets

private const val WALLETCONNECT_PROJECT_ID = "ce42103ef9ca7f760e736b44f32e20b7"

/**
 * Lazy WalletConnect bootstrap.
 *
 * Initializing Reown/AppKit at every cold start has shown occasional startup ANRs on-device.
 * We only initialize when wallet-connect functionality is actually needed.
 */
object WalletConnectBootstrap {
  private const val TAG = "WalletConnectBootstrap"

  @Volatile
  private var initialized = false
  private val initLock = Any()

  fun ensureInitialized(application: Application) {
    if (initialized) return
    synchronized(initLock) {
      if (initialized) return

      val appMetaData =
        Core.Model.AppMetaData(
          name = "Heaven",
          description = "Decentralized music player",
          url = "https://dotheaven.org",
          icons = listOf("https://dotheaven.org/icon.png"),
          redirect = "pirate-wc://request",
          appLink = "https://dotheaven.org/wc",
          linkMode = true,
        )

      CoreClient.initialize(
        application = application,
        projectId = WALLETCONNECT_PROJECT_ID,
        metaData = appMetaData,
      ) { error ->
        Log.e(TAG, "CoreClient init error: ${error.throwable.stackTraceToString()}")
      }

      AppKit.initialize(Modal.Params.Init(core = CoreClient)) { error ->
        Log.e(TAG, "AppKit init error: ${error.throwable.stackTraceToString()}")
      }

      AppKitChainsPresets.ethChains["1"]?.let { eth ->
        AppKit.setChains(listOf(eth))
      }

      initialized = true
      Log.d(TAG, "WalletConnect initialized")
    }
  }

  fun isInitialized(): Boolean = initialized
}
