package com.heaven.tempo

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

    private const val RP_ID = "dotheaven.org"
    private const val RP_NAME = "Heaven (Tempo)"
    private const val PREFS_NAME = "tempo_passkey"

    private fun prefs(activity: Activity): SharedPreferences =
        activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    data class PasskeyAccount(
        val pubKey: P256Utils.P256PublicKey,
        val address: String,
        val credentialId: String, // base64url rawId
    )

    data class PasskeyAssertion(
        val authenticatorData: ByteArray,
        val clientDataJSON: ByteArray,
        val signatureR: ByteArray,  // 32 bytes
        val signatureS: ByteArray,  // 32 bytes
        val pubKey: P256Utils.P256PublicKey,
    )

    /** Create a new passkey and derive the Tempo account address. */
    suspend fun createAccount(activity: Activity): PasskeyAccount {
        val challenge = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val userId = ByteArray(16).also { SecureRandom().nextBytes(it) }

        val options = JSONObject().apply {
            put("challenge", P256Utils.toBase64Url(challenge))
            put("rp", JSONObject().put("id", RP_ID).put("name", RP_NAME))
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
        val rawId = regJson.getString("rawId")

        val pubKey = P256Utils.extractP256KeyFromRegistration(attestationObjectB64)
        val address = P256Utils.deriveAddress(pubKey)

        val account = PasskeyAccount(pubKey = pubKey, address = address, credentialId = rawId)
        saveAccount(activity, account)
        return account
    }

    /** Login with an existing passkey. Prompts the passkey picker (no allowCredentials filter). */
    suspend fun login(activity: Activity): PasskeyAccount {
        // First try loading saved account
        val saved = loadAccount(activity)

        val challenge = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val options = JSONObject().apply {
            put("challenge", P256Utils.toBase64Url(challenge))
            put("timeout", 60000)
            put("userVerification", "required")
            put("rpId", RP_ID)
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
        val rawId = authJson.getString("rawId")

        // If we have a saved account matching this credential, use it
        if (saved != null && saved.credentialId == rawId) {
            return saved
        }

        // If saved account has different credentialId or no saved account,
        // we can't derive the address without the public key from registration.
        // Check if we have ANY saved account (might be same key, different encoding)
        if (saved != null) {
            return saved
        }

        throw IllegalStateException(
            "No saved account found. You must 'Create Passkey' first on this device to register the public key."
        )
    }

    /** Load saved account from SharedPreferences. */
    fun loadAccount(activity: Activity): PasskeyAccount? {
        val p = prefs(activity)
        val xHex = p.getString("pub_key_x", null) ?: return null
        val yHex = p.getString("pub_key_y", null) ?: return null
        val address = p.getString("address", null) ?: return null
        val credId = p.getString("credential_id", null) ?: return null
        return PasskeyAccount(
            pubKey = P256Utils.P256PublicKey(P256Utils.hexToBytes(xHex), P256Utils.hexToBytes(yHex)),
            address = address,
            credentialId = credId,
        )
    }

    private fun saveAccount(activity: Activity, account: PasskeyAccount) {
        prefs(activity).edit()
            .putString("pub_key_x", account.pubKey.xHex)
            .putString("pub_key_y", account.pubKey.yHex)
            .putString("address", account.address)
            .putString("credential_id", account.credentialId)
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
    ): PasskeyAssertion {
        val options = JSONObject().apply {
            put("challenge", P256Utils.toBase64Url(challenge))
            put("timeout", 60000)
            put("userVerification", "required")
            put("rpId", RP_ID)
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
