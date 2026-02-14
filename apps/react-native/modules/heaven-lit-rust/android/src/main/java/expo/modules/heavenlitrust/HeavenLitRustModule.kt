package expo.modules.heavenlitrust

import android.util.Base64
import androidx.credentials.CreateCredentialResponse
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialException
import com.upokecenter.cbor.CBORObject
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayInputStream
import org.json.JSONObject

class HeavenLitRustModule : Module() {
  companion object {
    @Volatile
    private var loadError: String? = null

    init {
      try {
        System.loadLibrary("heaven_lit_rust")
      } catch (error: Throwable) {
        loadError = error.message ?: error.javaClass.simpleName
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("HeavenLitRust")

    AsyncFunction("healthcheck") {
      ensureRustLoaded()
      nativeHealthcheck()
    }

    AsyncFunction("createEthWalletAuthData") { privateKeyHex: String, nonce: String ->
      ensureRustLoaded()
      nativeCreateEthWalletAuthData(privateKeyHex, nonce)
    }

    AsyncFunction("testConnect") { network: String, rpcUrl: String ->
      ensureRustLoaded()
      nativeTestConnect(network, rpcUrl)
    }

    AsyncFunction("mintPkpAndCreateAuthContext") { network: String, rpcUrl: String, privateKeyHex: String ->
      ensureRustLoaded()
      nativeMintPkpAndCreateAuthContext(network, rpcUrl, privateKeyHex)
    }

    AsyncFunction(
      "createAuthContextFromPasskeyCallback",
    ) { network: String, rpcUrl: String, pkpPublicKey: String, authMethodType: Int, authMethodId: String, accessToken: String, authConfigJson: String ->
      ensureRustLoaded()
      nativeCreateAuthContextFromPasskeyCallback(
        network,
        rpcUrl,
        pkpPublicKey,
        authMethodType.toString(),
        authMethodId,
        accessToken,
        authConfigJson,
      )
    }

    AsyncFunction("clearAuthContext") {
      ensureRustLoaded()
      nativeClearAuthContext()
    }

    AsyncFunction(
      "viewPKPsByAuthData",
    ) { network: String, rpcUrl: String, authMethodType: Int, authMethodId: String, limit: Int, offset: Int ->
      ensureRustLoaded()
      nativeViewPKPsByAuthData(
        network,
        rpcUrl,
        authMethodType.toString(),
        authMethodId,
        limit.toString(),
        offset.toString(),
      )
    }

    AsyncFunction(
      "executeJs",
    ) { network: String, rpcUrl: String, code: String, ipfsId: String, jsParamsJson: String, useSingleNode: Boolean ->
      ensureRustLoaded()
      nativeExecuteJs(
        network,
        rpcUrl,
        code,
        ipfsId,
        jsParamsJson,
        if (useSingleNode) "1" else "0",
      )
    }

    AsyncFunction(
      "signMessage",
    ) { network: String, rpcUrl: String, message: String, publicKey: String ->
      ensureRustLoaded()
      nativeSignMessage(network, rpcUrl, message, publicKey)
    }

    AsyncFunction(
      "fetchAndDecryptContent",
    ) { network: String, rpcUrl: String, paramsJson: String ->
      ensureRustLoaded()
      nativeFetchAndDecryptContent(network, rpcUrl, paramsJson)
    }

    AsyncFunction("nativeCreatePasskey") { optionsJson: String, promise: Promise ->
      nativeCreatePasskey(optionsJson, promise)
    }

    AsyncFunction("nativeGetPasskey") { optionsJson: String, promise: Promise ->
      nativeGetPasskey(optionsJson, promise)
    }
  }

  private fun ensureRustLoaded() {
    val error = loadError
    if (error != null) {
      throw IllegalStateException(
        "Rust library was not loaded. Build Android artifacts with modules/heaven-lit-rust/scripts/build-android.sh. Cause: $error",
      )
    }
  }

  private fun nativeCreatePasskey(optionsJson: String, promise: Promise) {
    val activity = appContext.currentActivity
    if (activity == null) {
      promise.reject(
        "ERR_NO_ACTIVITY",
        "No foreground Activity available for passkey creation",
        null,
      )
      return
    }

    val credentialManager = CredentialManager.create(activity)
    val request = CreatePublicKeyCredentialRequest(optionsJson)

    credentialManager.createCredentialAsync(
      activity,
      request,
      null,
      activity.mainExecutor,
      object : CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException> {
        override fun onResult(result: CreateCredentialResponse) {
          try {
            if (result !is CreatePublicKeyCredentialResponse) {
              promise.reject(
                "ERR_CREATE_PASSKEY_UNEXPECTED_RESPONSE",
                "Unexpected credential response type: ${result::class.java.simpleName}",
                null,
              )
              return
            }

            val registrationResponseJson = result.registrationResponseJson
            val credentialPublicKey = extractCredentialPublicKeyHexFromRegistrationResponse(
              registrationResponseJson,
            )

            val payload = JSONObject()
              .put("registrationResponseJson", registrationResponseJson)
              .put("credentialPublicKey", credentialPublicKey)
              .toString()

            promise.resolve(payload)
          } catch (error: Throwable) {
            promise.reject(
              "ERR_CREATE_PASSKEY_PARSE_RESPONSE",
              error.message ?: "Failed to parse passkey registration response",
              error,
            )
          }
        }

        override fun onError(e: CreateCredentialException) {
          promise.reject(
            "ERR_CREATE_PASSKEY",
            e.message ?: "Failed to create passkey credential",
            e,
          )
        }
      },
    )
  }

  private fun nativeGetPasskey(optionsJson: String, promise: Promise) {
    val activity = appContext.currentActivity
    if (activity == null) {
      promise.reject(
        "ERR_NO_ACTIVITY",
        "No foreground Activity available for passkey authentication",
        null,
      )
      return
    }

    val credentialManager = CredentialManager.create(activity)
    val request = GetCredentialRequest(listOf(GetPublicKeyCredentialOption(optionsJson)))

    credentialManager.getCredentialAsync(
      activity,
      request,
      null,
      activity.mainExecutor,
      object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
        override fun onResult(result: GetCredentialResponse) {
          val credential = result.credential
          if (credential !is PublicKeyCredential) {
            promise.reject(
              "ERR_GET_PASSKEY_UNEXPECTED_RESPONSE",
              "Unexpected credential type: ${credential::class.java.simpleName}",
              null,
            )
            return
          }

          val payload = JSONObject()
            .put("authenticationResponseJson", credential.authenticationResponseJson)
            .toString()
          promise.resolve(payload)
        }

        override fun onError(e: GetCredentialException) {
          promise.reject(
            "ERR_GET_PASSKEY",
            e.message ?: "Failed to authenticate passkey credential",
            e,
          )
        }
      },
    )
  }

  private fun extractCredentialPublicKeyHexFromRegistrationResponse(
    registrationResponseJson: String,
  ): String {
    val registrationJson = JSONObject(registrationResponseJson)
    val response = registrationJson.optJSONObject("response")
      ?: throw IllegalArgumentException("registration response missing `response` object")
    val attestationObject = response.optString("attestationObject", "")
    if (attestationObject.isBlank()) {
      throw IllegalArgumentException("registration response missing `response.attestationObject`")
    }

    val attestationBytes = decodeBase64Url(attestationObject)
    val attestation = CBORObject.DecodeFromBytes(attestationBytes)
    val authDataObject = attestation.get("authData")
      ?: throw IllegalArgumentException("attestation object missing `authData` field")
    val authData = authDataObject.GetByteString()
    return extractCredentialPublicKeyHexFromAuthData(authData)
  }

  private fun extractCredentialPublicKeyHexFromAuthData(authData: ByteArray): String {
    // authData format: rpIdHash(32) | flags(1) | signCount(4) | attestedCredentialData...
    if (authData.size < 55) {
      throw IllegalArgumentException("authData too short to contain attested credential data")
    }

    val flags = authData[32].toInt() and 0xFF
    val hasAttestedCredentialData = (flags and 0x40) != 0
    if (!hasAttestedCredentialData) {
      throw IllegalArgumentException("attested credential data flag not set in authData")
    }

    var offset = 37 // 32 + 1 + 4
    offset += 16 // aaguid
    if (authData.size < offset + 2) {
      throw IllegalArgumentException("authData missing credentialId length")
    }

    val credentialIdLength =
      ((authData[offset].toInt() and 0xFF) shl 8) or (authData[offset + 1].toInt() and 0xFF)
    offset += 2
    if (authData.size < offset + credentialIdLength) {
      throw IllegalArgumentException("authData truncated credentialId bytes")
    }
    offset += credentialIdLength
    if (authData.size <= offset) {
      throw IllegalArgumentException("authData missing CBOR-encoded credential public key")
    }

    val remaining = authData.copyOfRange(offset, authData.size)
    val stream = ByteArrayInputStream(remaining)
    if (CBORObject.Read(stream) == null) {
      throw IllegalArgumentException("failed to parse CBOR credential public key")
    }
    val consumed = remaining.size - stream.available()
    if (consumed <= 0) {
      throw IllegalArgumentException("credential public key CBOR length could not be determined")
    }

    val credentialPublicKeyBytes = remaining.copyOfRange(0, consumed)
    return "0x" + credentialPublicKeyBytes.joinToString("") { byte ->
      "%02x".format(byte.toInt() and 0xFF)
    }
  }

  private fun decodeBase64Url(value: String): ByteArray {
    val normalized = value.replace('-', '+').replace('_', '/')
    val padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
    return Base64.decode(padded, Base64.DEFAULT)
  }

  private external fun nativeHealthcheck(): String
  private external fun nativeCreateEthWalletAuthData(privateKeyHex: String, nonce: String): String
  private external fun nativeTestConnect(network: String, rpcUrl: String): String
  private external fun nativeMintPkpAndCreateAuthContext(
    network: String,
    rpcUrl: String,
    privateKeyHex: String,
  ): String

  private external fun nativeCreateAuthContextFromPasskeyCallback(
    network: String,
    rpcUrl: String,
    pkpPublicKey: String,
    authMethodType: String,
    authMethodId: String,
    accessToken: String,
    authConfigJson: String,
  ): String

  private external fun nativeClearAuthContext(): String

  private external fun nativeViewPKPsByAuthData(
    network: String,
    rpcUrl: String,
    authMethodType: String,
    authMethodId: String,
    limit: String,
    offset: String,
  ): String

  private external fun nativeExecuteJs(
    network: String,
    rpcUrl: String,
    code: String,
    ipfsId: String,
    jsParamsJson: String,
    useSingleNode: String,
  ): String

  private external fun nativeSignMessage(
    network: String,
    rpcUrl: String,
    message: String,
    publicKey: String,
  ): String

  private external fun nativeFetchAndDecryptContent(
    network: String,
    rpcUrl: String,
    paramsJson: String,
  ): String
}
