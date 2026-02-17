package com.pirate.app.tempo

import android.content.Context

/**
 * Manages a persistent P256 keypair for ECIES content encryption/decryption.
 *
 * WebAuthn passkeys don't expose the private key, so we generate a separate
 * P256 keypair at first-upload time and store it in SharedPreferences.
 * The public key should be published on-chain (RecordsV1 "contentPubKey") so
 * others can ECIES-encrypt AES keys to it when sharing content.
 *
 * Also stores per-contentId wrapped AES keys (ECIES envelopes) so we can
 * decrypt content we've uploaded or received.
 */
object ContentKeyManager {

    private const val PREFS_NAME = "heaven_content_key"
    private const val WRAPPED_KEYS_PREFS = "heaven_wrapped_keys"

    data class ContentKeyPair(
        val privateKey: ByteArray, // 32 bytes
        val publicKey: ByteArray,  // 65 bytes (0x04 || x || y)
    )

    /** Get or generate the content encryption keypair. */
    fun getOrCreate(context: Context): ContentKeyPair {
        load(context)?.let { return it }
        val (priv, pub) = EciesContentCrypto.generateKeyPair()
        val kp = ContentKeyPair(privateKey = priv, publicKey = pub)
        save(context, kp)
        return kp
    }

    fun load(context: Context): ContentKeyPair? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val privHex = prefs.getString("private_key", null) ?: return null
        val pubHex = prefs.getString("public_key", null) ?: return null
        return ContentKeyPair(
            privateKey = P256Utils.hexToBytes(privHex),
            publicKey = P256Utils.hexToBytes(pubHex),
        )
    }

    private fun save(context: Context, kp: ContentKeyPair) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putString("private_key", P256Utils.bytesToHex(kp.privateKey))
            .putString("public_key", P256Utils.bytesToHex(kp.publicKey))
            .apply()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().clear().apply()
        context.getSharedPreferences(WRAPPED_KEYS_PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }

    // -- Per-contentId wrapped key storage --

    /** Store an ECIES envelope (wrapped AES key) for a contentId. */
    fun saveWrappedKey(context: Context, contentId: String, envelope: EciesContentCrypto.EciesEnvelope) {
        val key = contentId.removePrefix("0x").trim().lowercase()
        val value = P256Utils.bytesToHex(envelope.ephemeralPub) + ":" +
            P256Utils.bytesToHex(envelope.iv) + ":" +
            P256Utils.bytesToHex(envelope.ciphertext)
        context.getSharedPreferences(WRAPPED_KEYS_PREFS, Context.MODE_PRIVATE).edit()
            .putString(key, value)
            .apply()
    }

    /** Load an ECIES envelope for a contentId, or null if not found. */
    fun loadWrappedKey(context: Context, contentId: String): EciesContentCrypto.EciesEnvelope? {
        val key = contentId.removePrefix("0x").trim().lowercase()
        val value = context.getSharedPreferences(WRAPPED_KEYS_PREFS, Context.MODE_PRIVATE)
            .getString(key, null) ?: return null
        val parts = value.split(":")
        if (parts.size != 3) return null
        return EciesContentCrypto.EciesEnvelope(
            ephemeralPub = P256Utils.hexToBytes(parts[0]),
            iv = P256Utils.hexToBytes(parts[1]),
            ciphertext = P256Utils.hexToBytes(parts[2]),
        )
    }
}
