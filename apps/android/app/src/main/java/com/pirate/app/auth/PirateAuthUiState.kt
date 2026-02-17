package com.pirate.app.auth

import com.pirate.app.lit.PirateAuthConfig
import com.pirate.app.tempo.TempoClient
import com.pirate.app.tempo.TempoPasskeyManager

data class PirateAuthUiState(
  val authServiceBaseUrl: String = PirateAuthConfig.DEFAULT_AUTH_SERVICE_BASE_URL,
  val passkeyRpId: String = PirateAuthConfig.DEFAULT_PASSKEY_RP_ID,
  val litNetwork: String = PirateAuthConfig.DEFAULT_LIT_NETWORK,
  val litRpcUrl: String = PirateAuthConfig.DEFAULT_LIT_RPC_URL,
  val tempoRpcUrl: String = TempoClient.RPC_URL,
  val tempoFeePayerUrl: String = TempoClient.SPONSOR_URL,
  val tempoChainId: Long = TempoClient.CHAIN_ID,
  val tempoAddress: String? = null,
  val tempoCredentialId: String? = null,
  val tempoPubKeyX: String? = null,
  val tempoPubKeyY: String? = null,
  val tempoRpId: String = TempoPasskeyManager.DEFAULT_RP_ID,
  val pkpPublicKey: String? = null,
  val pkpEthAddress: String? = null,
  val pkpTokenId: String? = null,
  val authMethodType: Int? = null,
  val authMethodId: String? = null,
  val accessToken: String? = null,
  val output: String = "Ready.",
  val busy: Boolean = false,
) {
  fun hasTempoCredentials(): Boolean {
    return !tempoAddress.isNullOrBlank() &&
      !tempoCredentialId.isNullOrBlank() &&
      !tempoPubKeyX.isNullOrBlank() &&
      !tempoPubKeyY.isNullOrBlank()
  }

  fun hasLitAuthContextParams(): Boolean {
    return !pkpPublicKey.isNullOrBlank() &&
      authMethodType != null &&
      !authMethodId.isNullOrBlank() &&
      !accessToken.isNullOrBlank()
  }

  fun hasLitAuthCredentials(): Boolean {
    return hasLitAuthContextParams() && !pkpEthAddress.isNullOrBlank()
  }

  fun hasAnyCredentials(): Boolean {
    return hasTempoCredentials() || hasLitAuthCredentials()
  }

  fun activeAddress(): String? {
    return tempoAddress?.takeIf { it.isNotBlank() } ?: pkpEthAddress
  }

  /** Build 65-byte uncompressed P256 public key (0x04 || x || y) from stored hex coords. */
  fun tempoP256PubKeyUncompressed(): ByteArray? {
    val xHex = tempoPubKeyX?.takeIf { it.isNotBlank() } ?: return null
    val yHex = tempoPubKeyY?.takeIf { it.isNotBlank() } ?: return null
    val x = hexToBytes(xHex)
    val y = hexToBytes(yHex)
    if (x.size != 32 || y.size != 32) return null
    return byteArrayOf(0x04) + x + y
  }

  private fun hexToBytes(hex: String): ByteArray {
    val h = hex.removePrefix("0x").removePrefix("0X")
    if (h.length % 2 != 0) return ByteArray(0)
    return ByteArray(h.length / 2) { i -> h.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
  }

  companion object {
    private const val PREFS_NAME = "pirate_auth"

    fun save(context: android.content.Context, state: PirateAuthUiState) {
      context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE).edit()
        .putString("pkpPublicKey", state.pkpPublicKey)
        .putString("pkpEthAddress", state.pkpEthAddress)
        .putString("pkpTokenId", state.pkpTokenId)
        .putString("tempoAddress", state.tempoAddress)
        .putString("tempoCredentialId", state.tempoCredentialId)
        .putString("tempoPubKeyX", state.tempoPubKeyX)
        .putString("tempoPubKeyY", state.tempoPubKeyY)
        .putString("tempoRpId", state.tempoRpId)
        .putString("tempoFeePayerUrl", state.tempoFeePayerUrl)
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
        tempoAddress = prefs.getString("tempoAddress", null),
        tempoCredentialId = prefs.getString("tempoCredentialId", null),
        tempoPubKeyX = prefs.getString("tempoPubKeyX", null),
        tempoPubKeyY = prefs.getString("tempoPubKeyY", null),
        tempoRpId = prefs.getString("tempoRpId", null) ?: TempoPasskeyManager.DEFAULT_RP_ID,
        tempoFeePayerUrl = prefs.getString("tempoFeePayerUrl", null) ?: TempoClient.SPONSOR_URL,
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
