package com.pirate.app.auth

import com.pirate.app.lit.PirateAuthConfig

data class PirateAuthUiState(
  val authServiceBaseUrl: String = PirateAuthConfig.DEFAULT_AUTH_SERVICE_BASE_URL,
  val passkeyRpId: String = PirateAuthConfig.DEFAULT_PASSKEY_RP_ID,
  val litNetwork: String = PirateAuthConfig.DEFAULT_LIT_NETWORK,
  val litRpcUrl: String = PirateAuthConfig.DEFAULT_LIT_RPC_URL,
  val pkpPublicKey: String? = null,
  val pkpEthAddress: String? = null,
  val pkpTokenId: String? = null,
  val authMethodType: Int? = null,
  val authMethodId: String? = null,
  val accessToken: String? = null,
  val output: String = "Ready.",
  val busy: Boolean = false,
) {
  companion object {
    private const val PREFS_NAME = "pirate_auth"

    fun save(context: android.content.Context, state: PirateAuthUiState) {
      context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE).edit()
        .putString("pkpPublicKey", state.pkpPublicKey)
        .putString("pkpEthAddress", state.pkpEthAddress)
        .putString("pkpTokenId", state.pkpTokenId)
        .putInt("authMethodType", state.authMethodType ?: -1)
        .putString("authMethodId", state.authMethodId)
        .putString("accessToken", state.accessToken)
        .apply()
    }

    fun load(context: android.content.Context): PirateAuthUiState {
      val prefs = context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
      val amt = prefs.getInt("authMethodType", -1)
      return PirateAuthUiState(
        pkpPublicKey = prefs.getString("pkpPublicKey", null),
        pkpEthAddress = prefs.getString("pkpEthAddress", null),
        pkpTokenId = prefs.getString("pkpTokenId", null),
        authMethodType = if (amt >= 0) amt else null,
        authMethodId = prefs.getString("authMethodId", null),
        accessToken = prefs.getString("accessToken", null),
      )
    }

    fun clear(context: android.content.Context) {
      context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE).edit().clear().apply()
    }
  }
}
