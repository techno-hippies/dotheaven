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
  val authMethodId: String? = null,
  val accessToken: String? = null,
  val output: String = "Ready.",
  val busy: Boolean = false,
)
