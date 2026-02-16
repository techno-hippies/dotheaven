package com.pirate.app.lit

import android.app.Activity
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.bouncycastle.jcajce.provider.digest.Keccak
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.security.MessageDigest
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

object NativePasskeyAuth {
  const val AUTH_METHOD_TYPE_WEBAUTHN = 3
  private const val BLOCKHASH_URL = "https://block-indexer.litgateway.com/get_most_recent_valid_block"
  private const val MINT_STATUS_MAX_ATTEMPTS = 20
  private const val MINT_STATUS_POLL_DELAY_MS = 3000L

  private val client = OkHttpClient()
  private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

  data class AuthData(
    val authMethodType: Int,
    val authMethodId: String,
    val accessToken: String,
  )

  data class RegisterAndMintResult(
    val pkpInfo: JSONObject,
    val webAuthnPublicKey: String,
    val authData: AuthData,
  )

  suspend fun registerAndMintPkp(
    activity: Activity,
    authServiceBaseUrl: String,
    expectedRpId: String,
    username: String,
    rpName: String,
    scopes: List<String>,
    litNetwork: String,
    litRpcUrl: String,
  ): RegisterAndMintResult {
    val baseUrl = sanitizeBaseUrl(authServiceBaseUrl)
    val rpIdHost = normalizeRpIdHost(expectedRpId)

    val registrationOptions = getRegistrationOptions(
      authServiceBaseUrl = baseUrl,
      username = username,
      expectedRpId = rpIdHost,
      rpName = rpName,
    )

    val registration = createPasskey(activity, registrationOptions.toString())
    val registrationResponse = JSONObject(registration.registrationResponseJson)
    val registrationRawId = canonicalizeCredentialId(
      requireString(registrationResponse.optString("rawId", ""), "registration response rawId"),
    )
    val registrationAuthMethodId = deriveWebAuthnAuthMethodId(registrationRawId)

    val pkpInfo = mintPkpWithAuthService(
      authServiceBaseUrl = baseUrl,
      passkeyRpId = rpIdHost,
      registrationAuthMethodId = registrationAuthMethodId,
      credentialPublicKey = registration.credentialPublicKey,
      scopes = scopes,
    )

    // Warm Lit node handshake before prompting passkey for assertion.
    withContext(Dispatchers.IO) {
      LitRust.testConnectRaw(litNetwork, litRpcUrl)
    }

    val authData = getNativeWebAuthnAssertion(
      activity = activity,
      passkeyRpId = rpIdHost,
      registrationRawId = registrationRawId,
    )

    return RegisterAndMintResult(
      pkpInfo = pkpInfo,
      webAuthnPublicKey = registration.credentialPublicKey,
      authData = authData,
    )
  }

  suspend fun authenticateWithPasskey(
    activity: Activity,
    expectedRpId: String,
  ): AuthData {
    val rpIdHost = normalizeRpIdHost(expectedRpId)
    return getNativeWebAuthnAssertion(activity = activity, passkeyRpId = rpIdHost, registrationRawId = null)
  }

  private suspend fun getNativeWebAuthnAssertion(
    activity: Activity,
    passkeyRpId: String,
    registrationRawId: String?,
  ): AuthData {
    val before = fetchLatestBlockhashInfo()
    val challenge = toBase64Url(hexToBytes(before.getString("blockhash")))

    val authenticationOptions = JSONObject()
      .put("challenge", challenge)
      .put("timeout", 60000)
      .put("userVerification", "required")
      .put("rpId", passkeyRpId)

    if (registrationRawId != null) {
      val allowCredentials = JSONArray()
        .put(JSONObject().put("id", registrationRawId).put("type", "public-key"))
      authenticationOptions.put("allowCredentials", allowCredentials)
    }

    val authentication = getPasskey(activity, authenticationOptions.toString())
    val rawAuthenticationResponse = JSONObject(authentication.authenticationResponseJson)
    val normalized = normalizeAuthenticationResponse(rawAuthenticationResponse)

    val rawId = requireString(normalized.optString("rawId", ""), "authentication response rawId")
    val authMethodId = deriveWebAuthnAuthMethodId(rawId)

    val inspection = inspectWebAuthnAssertion(normalized, passkeyRpId)
    if (!inspection.rpIdHashMatchesExpected) {
      throw IllegalStateException(
        "Native passkey assertion RP hash mismatch before Lit call. " +
          "expected=${inspection.expectedRpIdHashHex} actual=${inspection.authenticatorRpIdHashHex ?: "(missing)"} " +
          "origin=${inspection.clientDataOrigin ?: "(missing)"}",
      )
    }

    return AuthData(
      authMethodType = AUTH_METHOD_TYPE_WEBAUTHN,
      authMethodId = authMethodId,
      accessToken = normalized.toString(),
    )
  }

  private fun sanitizeBaseUrl(value: String): String {
    val trimmed = requireString(value, "authServiceBaseUrl").trim()
    return trimmed.replace(Regex("/+$"), "")
  }

  private fun requireString(value: String?, fieldName: String): String {
    val parsed = value?.trim().orEmpty()
    if (parsed.isEmpty()) throw IllegalArgumentException("$fieldName cannot be empty")
    return parsed
  }

  private fun parseHostname(value: String, fieldName: String): String {
    val trimmed = requireString(value, fieldName)
    val withScheme = if (Regex("^[a-z][a-z0-9+.-]*://", RegexOption.IGNORE_CASE).containsMatchIn(trimmed)) {
      trimmed
    } else {
      "https://$trimmed"
    }
    val host = try {
      java.net.URL(withScheme).host
    } catch (_: Throwable) {
      throw IllegalArgumentException("Invalid $fieldName: $value")
    }
    val normalized = host.trim().lowercase()
    if (normalized.isEmpty()) throw IllegalArgumentException("Invalid $fieldName: $value")
    return normalized
  }

  private fun normalizeRpIdHost(value: String): String = parseHostname(value, "passkeyRpId")

  private fun buildAuthServiceHeaders(passkeyRpId: String): Map<String, String> {
    val origin = "https://$passkeyRpId"
    return mapOf(
      "Origin" to origin,
      "Referer" to "$origin/",
    )
  }

  private suspend fun fetchJson(url: String, headers: Map<String, String> = emptyMap()): JSONObject {
    return withContext(Dispatchers.IO) {
      val req = Request.Builder().url(url).get().apply {
        headers.forEach { (k, v) -> addHeader(k, v) }
      }.build()
      client.newCall(req).execute().use { resp ->
        val body = resp.body?.string().orEmpty()
        if (!resp.isSuccessful) {
          throw IllegalStateException("Request failed (${resp.code}) $url: $body")
        }
        try {
          JSONObject(body)
        } catch (_: Throwable) {
          throw IllegalStateException("Request returned non-JSON payload for $url: $body")
        }
      }
    }
  }

  private suspend fun fetchLatestBlockhashInfo(): JSONObject {
    val data = fetchJson(BLOCKHASH_URL)
    val blockhash = data.optString("blockhash", "").trim()
    if (blockhash.isEmpty()) throw IllegalStateException("latest blockhash cannot be empty")
    return JSONObject().put("blockhash", blockhash)
  }

  private suspend fun getRegistrationOptions(
    authServiceBaseUrl: String,
    username: String,
    expectedRpId: String,
    rpName: String,
  ): JSONObject {
    val url = "${authServiceBaseUrl}/auth/webauthn/generate-registration-options?username=${java.net.URLEncoder.encode(username, "UTF-8")}"
    val options = fetchJson(url, headers = buildAuthServiceHeaders(expectedRpId))

    val rp = options.optJSONObject("rp") ?: JSONObject()
    val returnedRpId = rp.optString("id", "").trim().lowercase()
    if (returnedRpId.isNotEmpty() && returnedRpId != expectedRpId) {
      throw IllegalStateException("Auth service returned rp.id=$returnedRpId but expected passkeyRpId=$expectedRpId")
    }

    rp.put("id", expectedRpId)
    rp.put("name", requireString(rpName, "rpName"))
    options.put("rp", rp)
    return options
  }

  private suspend fun mintPkpWithAuthService(
    authServiceBaseUrl: String,
    passkeyRpId: String,
    registrationAuthMethodId: String,
    credentialPublicKey: String,
    scopes: List<String>,
  ): JSONObject {
    val bodyJson = JSONObject()
      .put("authMethodType", AUTH_METHOD_TYPE_WEBAUTHN)
      .put("authMethodId", registrationAuthMethodId)
      .put("pubkey", requireString(credentialPublicKey, "credentialPublicKey"))
      .put("scopes", JSONArray(scopes))

    val req = Request.Builder()
      .url("${authServiceBaseUrl}/pkp/mint")
      .post(bodyJson.toString().toRequestBody(jsonMediaType))
      .apply {
        addHeader("Content-Type", "application/json")
        buildAuthServiceHeaders(passkeyRpId).forEach { (k, v) -> addHeader(k, v) }
      }
      .build()

    val jobId = withContext(Dispatchers.IO) {
      client.newCall(req).execute().use { resp ->
        val body = resp.body?.string().orEmpty()
        if (resp.code != 202) {
          throw IllegalStateException("PKP mint failed: ${resp.code} $body")
        }
        val parsed = JSONObject(body)
        requireString(parsed.optString("jobId", ""), "pkp mint jobId")
      }
    }

    for (attempt in 1..MINT_STATUS_MAX_ATTEMPTS) {
      delay(MINT_STATUS_POLL_DELAY_MS)
      val status = fetchJson("${authServiceBaseUrl}/status/${jobId}", headers = buildAuthServiceHeaders(passkeyRpId))
      val state = status.optString("state", "").trim().lowercase()

      if (state == "completed") {
        val returnValue = status.optJSONObject("returnValue")
        val data = returnValue?.opt("data")
        if (data is JSONObject) return data
        if (data != null) return JSONObject(data.toString())
      }

      if (state == "failed" || state == "error") {
        throw IllegalStateException("PKP mint job failed: ${status}")
      }
    }

    throw IllegalStateException("PKP mint timed out")
  }

  private fun hexToBytes(value: String): ByteArray {
    val normalized = value.removePrefix("0x").removePrefix("0X")
    if (!Regex("^[0-9a-fA-F]+$").matches(normalized) || normalized.length % 2 != 0) {
      throw IllegalArgumentException("Invalid hex value: $value")
    }
    val out = ByteArray(normalized.length / 2)
    var i = 0
    while (i < normalized.length) {
      out[i / 2] = normalized.substring(i, i + 2).toInt(16).toByte()
      i += 2
    }
    return out
  }

  private fun toBase64Url(value: ByteArray): String {
    val base64 = Base64.encodeToString(value, Base64.NO_WRAP)
    return base64.replace('+', '-').replace('/', '_').trimEnd('=')
  }

  private fun base64UrlToBytes(value: String): ByteArray {
    val normalized = value.replace('-', '+').replace('_', '/')
    val padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
    return Base64.decode(padded, Base64.DEFAULT)
  }

  private fun canonicalizeBase64Like(value: String): String {
    return toBase64Url(base64UrlToBytes(value))
  }

  private fun canonicalizeCredentialId(value: String): String = canonicalizeBase64Like(value)

  private fun bytesToHex(value: ByteArray): String {
    val sb = StringBuilder(value.size * 2)
    for (b in value) sb.append(String.format("%02x", b.toInt() and 0xFF))
    return sb.toString()
  }

  private fun deriveWebAuthnAuthMethodId(rawId: String): String {
    val input = "$rawId:lit".toByteArray(Charsets.UTF_8)
    val digest = Keccak.Digest256().digest(input)
    return "0x${bytesToHex(digest)}"
  }

  private data class AssertionInspection(
    val expectedRpIdHashHex: String,
    val authenticatorRpIdHashHex: String?,
    val rpIdHashMatchesExpected: Boolean,
    val clientDataOrigin: String?,
  )

  private fun inspectWebAuthnAssertion(authenticationResponse: JSONObject, expectedRpId: String): AssertionInspection {
    val expectedHashBytes = MessageDigest.getInstance("SHA-256")
      .digest(expectedRpId.toByteArray(Charsets.UTF_8))
    val expectedHashHex = bytesToHex(expectedHashBytes).lowercase()

    var clientDataOrigin: String? = null
    var authenticatorRpIdHashHex: String? = null

    try {
      val response = authenticationResponse.optJSONObject("response") ?: JSONObject()
      val clientDataJsonB64 = response.optString("clientDataJSON", "").takeIf { it.isNotBlank() }
      val authenticatorDataB64 = response.optString("authenticatorData", "").takeIf { it.isNotBlank() }

      if (clientDataJsonB64 != null) {
        val clientDataJson = String(base64UrlToBytes(clientDataJsonB64), Charsets.UTF_8)
        val clientData = JSONObject(clientDataJson)
        clientDataOrigin = clientData.optString("origin", "").takeIf { it.isNotBlank() }
      }

      if (authenticatorDataB64 != null) {
        val authenticatorData = base64UrlToBytes(authenticatorDataB64)
        if (authenticatorData.size >= 32) {
          authenticatorRpIdHashHex = bytesToHex(authenticatorData.copyOfRange(0, 32)).lowercase()
        }
      }
    } catch (_: Throwable) {
      // best-effort only
    }

    val matches = authenticatorRpIdHashHex != null && authenticatorRpIdHashHex == expectedHashHex
    return AssertionInspection(
      expectedRpIdHashHex = expectedHashHex,
      authenticatorRpIdHashHex = authenticatorRpIdHashHex,
      rpIdHashMatchesExpected = matches,
      clientDataOrigin = clientDataOrigin,
    )
  }

  private fun normalizeAuthenticationResponse(authenticationResponse: JSONObject): JSONObject {
    val response = authenticationResponse.optJSONObject("response") ?: JSONObject()

    val rawIdInput = requireString(authenticationResponse.optString("rawId", ""), "authentication response rawId")
    val normalizedRawId = canonicalizeCredentialId(rawIdInput)

    val normalizedId = authenticationResponse.optString("id", "").trim().takeIf { it.isNotEmpty() }?.let {
      canonicalizeCredentialId(it)
    } ?: normalizedRawId

    fun normalizeMaybeB64(field: Any?): Any? {
      val asString = field as? String ?: return field
      if (asString.trim().isEmpty()) return field
      return try { canonicalizeBase64Like(asString) } catch (_: Throwable) { field }
    }

    val normalizedResponse = JSONObject(response.toString())
    normalizedResponse.put("clientDataJSON", normalizeMaybeB64(response.opt("clientDataJSON")))
    normalizedResponse.put("authenticatorData", normalizeMaybeB64(response.opt("authenticatorData")))
    normalizedResponse.put("signature", normalizeMaybeB64(response.opt("signature")))
    if (response.has("userHandle")) {
      normalizedResponse.put("userHandle", normalizeMaybeB64(response.opt("userHandle")))
    } else {
      normalizedResponse.put("userHandle", JSONObject.NULL)
    }

    val out = JSONObject(authenticationResponse.toString())
    out.put("id", normalizedId)
    out.put("rawId", normalizedRawId)
    out.put("type", authenticationResponse.optString("type", "public-key").ifBlank { "public-key" })
    if (authenticationResponse.opt("clientExtensionResults") !is JSONObject) {
      out.put("clientExtensionResults", JSONObject())
    }
    out.put("response", normalizedResponse)
    return out
  }

  data class CreatePasskeyResult(
    val registrationResponseJson: String,
    val credentialPublicKey: String,
  )

  data class GetPasskeyResult(
    val authenticationResponseJson: String,
  )

  private suspend fun createPasskey(activity: Activity, optionsJson: String): CreatePasskeyResult {
    val manager = CredentialManager.create(activity)
    val request = CreatePublicKeyCredentialRequest(optionsJson)

    return suspendCoroutine { cont ->
      manager.createCredentialAsync(
        activity,
        request,
        null,
        activity.mainExecutor,
        object : CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException> {
          override fun onResult(result: CreateCredentialResponse) {
            try {
              if (result !is CreatePublicKeyCredentialResponse) {
                cont.resumeWithException(IllegalStateException("Unexpected credential response type: ${result::class.java.simpleName}"))
                return
              }
              val registrationResponseJson = result.registrationResponseJson
              val credentialPublicKey = extractCredentialPublicKeyHexFromRegistrationResponse(registrationResponseJson)
              cont.resume(CreatePasskeyResult(registrationResponseJson, credentialPublicKey))
            } catch (t: Throwable) {
              cont.resumeWithException(t)
            }
          }

          override fun onError(e: CreateCredentialException) {
            cont.resumeWithException(e)
          }
        },
      )
    }
  }

  private suspend fun getPasskey(activity: Activity, optionsJson: String): GetPasskeyResult {
    val manager = CredentialManager.create(activity)
    val request = GetCredentialRequest(listOf(GetPublicKeyCredentialOption(optionsJson)))

    return suspendCoroutine { cont ->
      manager.getCredentialAsync(
        activity,
        request,
        null,
        activity.mainExecutor,
        object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
          override fun onResult(result: GetCredentialResponse) {
            val credential = result.credential
            if (credential !is PublicKeyCredential) {
              cont.resumeWithException(IllegalStateException("Unexpected credential type: ${credential::class.java.simpleName}"))
              return
            }
            cont.resume(GetPasskeyResult(authenticationResponseJson = credential.authenticationResponseJson))
          }

          override fun onError(e: GetCredentialException) {
            cont.resumeWithException(e)
          }
        },
      )
    }
  }

  private fun extractCredentialPublicKeyHexFromRegistrationResponse(registrationResponseJson: String): String {
    val registrationJson = JSONObject(registrationResponseJson)
    val response = registrationJson.optJSONObject("response")
      ?: throw IllegalArgumentException("registration response missing `response` object")
    val attestationObject = response.optString("attestationObject", "")
    if (attestationObject.isBlank()) {
      throw IllegalArgumentException("registration response missing `response.attestationObject`")
    }

    val attestationBytes = base64UrlToBytes(attestationObject)
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
}

