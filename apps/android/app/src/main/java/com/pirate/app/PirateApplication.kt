package com.pirate.app

import android.app.Application

class PirateApplication : Application() {
  override fun onCreate() {
    super.onCreate()
    // WalletConnect is initialized lazily (WalletConnectBootstrap) to keep cold start light.
  }
}
