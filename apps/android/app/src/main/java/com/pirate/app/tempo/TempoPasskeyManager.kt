package com.pirate.app.tempo

import android.app.Activity
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
import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.security.SecureRandom
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

/**
 * Manages passkey creation and assertion for Tempo.
 * No auth service needed — passkey is the account.
 */
object TempoPasskeyManager {

    const val DEFAULT_RP_ID = "dotheaven.org"
    const val DEFAULT_RP_NAME = "Heaven (Tempo)"
    private const val PREFS_NAME = "tempo_passkey"
    private const val ACCOUNTS_JSON_KEY = "accounts_json"
    private const val TAG = "TempoPasskeyManager"

    private fun prefs(activity: Activity): SharedPreferences =
        activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun normalizeRpId(value: String): String {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) throw IllegalArgumentException("rpId cannot be empty")
        val withScheme =
            if (Regex("^[a-z][a-z0-9+.-]*://", RegexOption.IGNORE_CASE).containsMatchIn(trimmed)) {
                trimmed
            } else {
                "https://$trimmed"
            }
        val host = try {
            java.net.URL(withScheme).host
        } catch (_: Throwable) {
            throw IllegalArgumentException("Invalid rpId: $value")
        }
        val normalized = host.trim().lowercase()
        if (normalized.isEmpty()) throw IllegalArgumentException("Invalid rpId: $value")
        return normalized
    }

    private fun normalizeCredentialId(value: String): String {
        return value.trim()
            .replace('+', '-')
            .replace('/', '_')
            .trimEnd('=')
    }

    data class PasskeyAccount(
        val pubKey: P256Utils.P256PublicKey,
        val address: String,
        val credentialId: String, // base64url rawId
        val rpId: String,
    )

    data class PasskeyAssertion(
        val authenticatorData: ByteArray,
        val clientDataJSON: ByteArray,
        val signatureR: ByteArray,  // 32 bytes
        val signatureS: ByteArray,  // 32 bytes
        val pubKey: P256Utils.P256PublicKey,
    )

    /** Create a new passkey and derive the Tempo account address. */
    suspend fun createAccount(
        activity: Activity,
        rpId: String = DEFAULT_RP_ID,
        rpName: String = DEFAULT_RP_NAME,
    ): PasskeyAccount {
        val normalizedRpId = normalizeRpId(rpId)
        val normalizedRpName = rpName.trim().ifEmpty { DEFAULT_RP_NAME }
        val challenge = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val userId = ByteArray(16).also { SecureRandom().nextBytes(it) }

        val options = JSONObject().apply {
            put("challenge", P256Utils.toBase64Url(challenge))
            put("rp", JSONObject().put("id", normalizedRpId).put("name", normalizedRpName))
            put("user", JSONObject()
                .put("id", P256Utils.toBase64Url(userId))
                .put("name", "tempo-user")
                .put("displayName", "Tempo User"))
            put("pubKeyCredParams", JSONArray().put(
                JSONObject().put("alg", -7).put("type", "public-key") // ES256 = P256
            ))
            put("timeout", 60000)
            put("attestation", "none")
            put("authenticatorSelection", JSONObject()
                .put("residentKey", "required")
                .put("userVerification", "required"))
        }

        val manager = CredentialManager.create(activity)
        val request = CreatePublicKeyCredentialRequest(options.toString())

        val result = suspendCoroutine { cont ->
            manager.createCredentialAsync(
                activity, request, null, activity.mainExecutor,
                object : CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException> {
                    override fun onResult(result: CreateCredentialResponse) {
                        if (result is CreatePublicKeyCredentialResponse) {
                            cont.resume(result)
                        } else {
                            cont.resumeWithException(
                                IllegalStateException("unexpected response: ${result::class.simpleName}"))
                        }
                    }
                    override fun onError(e: CreateCredentialException) {
                        cont.resumeWithException(e)
                    }
                }
            )
        }

        val regJson = JSONObject(result.registrationResponseJson)
        val response = regJson.getJSONObject("response")
        val attestationObjectB64 = response.getString("attestationObject")
        val rawId = normalizeCredentialId(regJson.getString("rawId"))

        val pubKey = P256Utils.extractP256KeyFromRegistration(attestationObjectB64)
        val address = P256Utils.deriveAddress(pubKey)

        val account = PasskeyAccount(
            pubKey = pubKey,
            address = address,
            credentialId = rawId,
            rpId = normalizedRpId,
        )
        saveAccount(activity, account)
        return account
    }

    /** Login with an existing passkey. Prompts the passkey picker (no allowCredentials filter). */
    suspend fun login(
        activity: Activity,
        rpId: String = DEFAULT_RP_ID,
    ): PasskeyAccount {
        val normalizedRpId = normalizeRpId(rpId)
        val knownAccounts = loadAccounts(activity)

        val challenge = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val options = JSONObject().apply {
            put("challenge", P256Utils.toBase64Url(challenge))
            put("timeout", 60000)
            put("userVerification", "required")
            put("rpId", normalizedRpId)
            // No allowCredentials — shows all passkeys for this RP
        }

        val manager = CredentialManager.create(activity)
        val request = GetCredentialRequest(listOf(GetPublicKeyCredentialOption(options.toString())))

        val result = suspendCoroutine { cont ->
            manager.getCredentialAsync(
                activity, request, null, activity.mainExecutor,
                object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                    override fun onResult(result: GetCredentialResponse) {
                        val credential = result.credential
                        if (credential is PublicKeyCredential) {
                            cont.resume(credential)
                        } else {
                            cont.resumeWithException(
                                IllegalStateException("unexpected credential: ${credential::class.simpleName}"))
                        }
                    }
                    override fun onError(e: GetCredentialException) {
                        cont.resumeWithException(e)
                    }
                }
            )
        }

        val authJson = JSONObject(result.authenticationResponseJson)
        val rawId = normalizeCredentialId(authJson.getString("rawId"))

        val matched =
            knownAccounts.firstOrNull {
                it.rpId == normalizedRpId && normalizeCredentialId(it.credentialId) == rawId
            }
        if (matched != null) {
            // Promote last-used account to active for legacy reads.
            saveAccount(activity, matched)
            return matched
        }

        // Some providers can return a credential-id representation that differs
        // from what was persisted during registration. Fallback to cryptographic
        // verification against known public keys.
        val response = authJson.getJSONObject("response")
        val authenticatorData = P256Utils.base64UrlToBytes(response.getString("authenticatorData"))
        val clientDataJSON = P256Utils.base64UrlToBytes(response.getString("clientDataJSON"))
        val signatureDer = P256Utils.base64UrlToBytes(response.getString("signature"))
        val signatureMatched =
            knownAccounts.firstOrNull { account ->
                account.rpId == normalizedRpId &&
                    P256Utils.verifyAssertionSignature(
                        pubKey = account.pubKey,
                        authenticatorData = authenticatorData,
                        clientDataJSON = clientDataJSON,
                        signatureDer = signatureDer,
                    )
            }
        if (signatureMatched != null) {
            Log.w(
                TAG,
                "Resolved passkey via signature fallback; credentialId mismatch (rawId len=${rawId.length})",
            )
            val updated = signatureMatched.copy(credentialId = rawId)
            saveAccount(activity, updated)
            return updated
        }

        // We can only map a passkey assertion to a Heaven account when we already
        // have that credential's public key stored from passkey registration.
        if (knownAccounts.isNotEmpty()) {
            throw IllegalStateException(
                "Selected passkey is not registered in this app. Use 'Create Passkey' for this passkey first."
            )
        }

        throw IllegalStateException(
            "No saved passkey account found. Use 'Create Passkey' first on this device."
        )
    }

    /** Load active account from SharedPreferences. */
    fun loadAccount(activity: Activity): PasskeyAccount? {
        return loadAccounts(activity).firstOrNull()
    }

    private fun loadAccounts(activity: Activity): List<PasskeyAccount> {
        val p = prefs(activity)
        val parsed = runCatching {
            val raw = p.getString(ACCOUNTS_JSON_KEY, null)?.trim().orEmpty()
            if (raw.isEmpty()) return@runCatching emptyList()
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    val xHex = item.optString("pub_key_x", "")
                    val yHex = item.optString("pub_key_y", "")
                    val address = item.optString("address", "")
                    val credentialId = normalizeCredentialId(item.optString("credential_id", ""))
                    val rpId = normalizeRpId(item.optString("rp_id", DEFAULT_RP_ID))
                    if (xHex.isEmpty() || yHex.isEmpty() || address.isEmpty() || credentialId.isEmpty()) continue
                    add(
                        PasskeyAccount(
                            pubKey = P256Utils.P256PublicKey(
                                P256Utils.hexToBytes(xHex),
                                P256Utils.hexToBytes(yHex),
                            ),
                            address = address,
                            credentialId = credentialId,
                            rpId = rpId,
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())
        if (parsed.isNotEmpty()) return parsed
        return listOfNotNull(loadLegacyAccount(p))
    }

    private fun loadLegacyAccount(p: SharedPreferences): PasskeyAccount? {
        val xHex = p.getString("pub_key_x", null) ?: return null
        val yHex = p.getString("pub_key_y", null) ?: return null
        val address = p.getString("address", null) ?: return null
        val credentialId = p.getString("credential_id", null) ?: return null
        val rpId = p.getString("rp_id", DEFAULT_RP_ID)?.trim()?.ifEmpty { DEFAULT_RP_ID } ?: DEFAULT_RP_ID
        return PasskeyAccount(
            pubKey = P256Utils.P256PublicKey(P256Utils.hexToBytes(xHex), P256Utils.hexToBytes(yHex)),
            address = address,
            credentialId = normalizeCredentialId(credentialId),
            rpId = normalizeRpId(rpId),
        )
    }

    private fun saveAccount(activity: Activity, account: PasskeyAccount) {
        val normalizedAccount = account.copy(
            credentialId = normalizeCredentialId(account.credentialId),
            rpId = normalizeRpId(account.rpId),
        )
        val remainder = loadAccounts(activity).filterNot {
            normalizeCredentialId(it.credentialId) == normalizedAccount.credentialId &&
                normalizeRpId(it.rpId) == normalizedAccount.rpId
        }
        val allAccounts = listOf(normalizedAccount) + remainder
        val serialized = JSONArray().apply {
            allAccounts.forEach { item ->
                put(
                    JSONObject()
                        .put("pub_key_x", item.pubKey.xHex)
                        .put("pub_key_y", item.pubKey.yHex)
                        .put("address", item.address)
                        .put("credential_id", item.credentialId)
                        .put("rp_id", item.rpId),
                )
            }
        }

        prefs(activity).edit()
            .putString(ACCOUNTS_JSON_KEY, serialized.toString())
            .putString("pub_key_x", normalizedAccount.pubKey.xHex)
            .putString("pub_key_y", normalizedAccount.pubKey.yHex)
            .putString("address", normalizedAccount.address)
            .putString("credential_id", normalizedAccount.credentialId)
            .putString("rp_id", normalizedAccount.rpId)
            .apply()
    }

    /**
     * Sign a challenge (e.g., tx hash) with the passkey.
     * Returns the raw WebAuthn assertion components needed for a Tempo WebAuthn signature.
     */
    suspend fun sign(
        activity: Activity,
        challenge: ByteArray,
        account: PasskeyAccount,
        rpId: String = DEFAULT_RP_ID,
    ): PasskeyAssertion {
        val caller =
            Throwable().stackTrace.firstOrNull { frame ->
                !frame.className.contains("TempoPasskeyManager")
            }
        Log.w(
            TAG,
            "Passkey sign requested for ${account.address} via ${caller?.className}.${caller?.methodName}:${caller?.lineNumber}",
        )

        val normalizedRpId = normalizeRpId(rpId)
        if (account.rpId != normalizedRpId) {
            throw IllegalStateException(
                "Passkey account is bound to ${account.rpId}; requested rpId is $normalizedRpId",
            )
        }

        val options = JSONObject().apply {
            put("challenge", P256Utils.toBase64Url(challenge))
            put("timeout", 60000)
            put("userVerification", "required")
            put("rpId", normalizedRpId)
            put("allowCredentials", JSONArray().put(
                JSONObject().put("id", account.credentialId).put("type", "public-key")
            ))
        }

        val manager = CredentialManager.create(activity)
        val request = GetCredentialRequest(listOf(GetPublicKeyCredentialOption(options.toString())))

        val result = suspendCoroutine { cont ->
            manager.getCredentialAsync(
                activity, request, null, activity.mainExecutor,
                object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                    override fun onResult(result: GetCredentialResponse) {
                        val credential = result.credential
                        if (credential is PublicKeyCredential) {
                            cont.resume(credential)
                        } else {
                            cont.resumeWithException(
                                IllegalStateException("unexpected credential: ${credential::class.simpleName}"))
                        }
                    }
                    override fun onError(e: GetCredentialException) {
                        cont.resumeWithException(e)
                    }
                }
            )
        }

        val authJson = JSONObject(result.authenticationResponseJson)
        val response = authJson.getJSONObject("response")

        val authenticatorData = P256Utils.base64UrlToBytes(response.getString("authenticatorData"))
        val clientDataJSON = P256Utils.base64UrlToBytes(response.getString("clientDataJSON"))
        val signatureBytes = P256Utils.base64UrlToBytes(response.getString("signature"))

        // Parse DER signature into (r, s)
        val (r, s) = P256Utils.parseDerSignature(signatureBytes)

        return PasskeyAssertion(
            authenticatorData = authenticatorData,
            clientDataJSON = clientDataJSON,
            signatureR = r,
            signatureS = s,
            pubKey = account.pubKey,
        )
    }
}
