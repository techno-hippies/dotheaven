package com.pirate.app

import android.app.Application
import android.util.Log
import com.reown.android.Core
import com.reown.android.CoreClient
import com.reown.appkit.client.AppKit
import com.reown.appkit.client.Modal
import com.reown.appkit.presets.AppKitChainsPresets

private const val TAG = "PirateApplication"

// Get a project ID from https://cloud.reown.com
private const val WALLETCONNECT_PROJECT_ID = "ce42103ef9ca7f760e736b44f32e20b7"

class PirateApplication : Application() {
  override fun onCreate() {
    super.onCreate()

    val appMetaData = Core.Model.AppMetaData(
      name = "Heaven",
      description = "Decentralized music player",
      url = "https://dotheaven.org",
      icons = listOf("https://dotheaven.org/icon.png"),
      redirect = "pirate-wc://request",
      appLink = "https://dotheaven.org/wc",
      linkMode = true,
    )

    CoreClient.initialize(
      application = this,
      projectId = WALLETCONNECT_PROJECT_ID,
      metaData = appMetaData,
    ) { error ->
      Log.e(TAG, "CoreClient init error: ${error.throwable.stackTraceToString()}")
    }

    AppKit.initialize(Modal.Params.Init(core = CoreClient)) { error ->
      Log.e(TAG, "AppKit init error: ${error.throwable.stackTraceToString()}")
    }

    // Only need Ethereum mainnet for SIWE signing
    AppKitChainsPresets.ethChains["1"]?.let { eth ->
      AppKit.setChains(listOf(eth))
    }
  }
}
