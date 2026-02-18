package com.pirate.app.tempo

import android.app.Activity
import android.content.Context
import org.bouncycastle.jcajce.provider.digest.Keccak
import java.io.ByteArrayOutputStream
import java.math.BigInteger
import java.security.SecureRandom

/**
 * Manages ephemeral secp256k1 session keys for silent transaction signing.
 *
 * Flow:
 * 1. Generate session key (secp256k1 private key)
 * 2. Passkey signs a KeyAuthorization to register the session key on AccountKeychain
 * 3. Session key signs all subsequent txs silently (no biometric)
 */
object SessionKeyManager {

    private const val PREFS_NAME = "tempo_session"
    private data class RawRlp(val encoded: ByteArray)
    private fun prefs(context: Context) = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // Session key validity: 7 days
    private const val SESSION_DURATION_SECS = 7 * 24 * 60 * 60L

    data class SessionKey(
        val privateKey: ByteArray,  // 32 bytes secp256k1
        val publicKeyX: ByteArray,  // 32 bytes
        val publicKeyY: ByteArray,  // 32 bytes
        val address: String,        // derived ethereum address
        val ownerAddress: String?,  // Tempo account this key is authorized for
        val keyAuthorization: ByteArray?, // signed key authorization RLP blob
        val expiresAt: Long,        // unix timestamp
    )

    /** Generate a new ephemeral secp256k1 session key. */
    fun generate(ownerAddress: String? = null): SessionKey {
        // Generate random 32-byte private key
        val privKey = ByteArray(32).also { SecureRandom().nextBytes(it) }

        // Derive public key using BouncyCastle
        val ecSpec = org.bouncycastle.jce.ECNamedCurveTable.getParameterSpec("secp256k1")
        val point = ecSpec.g.multiply(BigInteger(1, privKey)).normalize()
        val pubX = point.affineXCoord.encoded.let { padTo32(it) }
        val pubY = point.affineYCoord.encoded.let { padTo32(it) }

        // Derive address: keccak256(pubX || pubY)[12:]
        val hash = Keccak.Digest256().digest(pubX + pubY)
        val address = "0x" + P256Utils.bytesToHex(hash.copyOfRange(12, 32))

        val expiresAt = System.currentTimeMillis() / 1000 + SESSION_DURATION_SECS

        return SessionKey(
            privateKey = privKey,
            publicKeyX = pubX,
            publicKeyY = pubY,
            address = address,
            ownerAddress = ownerAddress?.trim()?.lowercase()?.ifBlank { null },
            keyAuthorization = null,
            expiresAt = expiresAt,
        )
    }

    /**
     * Build the KeyAuthorization digest that the admin passkey needs to sign.
     *
     * digest = keccak256(rlp([chain_id, key_type, key_id, expiry, limits]))
     * limits = None (0x80) = unlimited spending
     */
    fun buildKeyAuthDigest(sessionKey: SessionKey): ByteArray {
        return Keccak.Digest256().digest(rlpEncodeList(buildKeyAuthorizationFields(sessionKey)))
    }

    /**
     * Build the SignedKeyAuthorization bytes to include in a transaction's key_authorization field.
     *
     * Format: rlp([key_authorization, signature])
     * where key_authorization = rlp([chain_id, key_type, key_id, expiry, limits?]).
     */
    fun buildSignedKeyAuthorization(
        sessionKey: SessionKey,
        assertion: TempoPasskeyManager.PasskeyAssertion,
    ): ByteArray {
        // Build WebAuthn signature bytes (type 0x02)
        val webauthnData = assertion.authenticatorData + assertion.clientDataJSON
        val sigBytes = byteArrayOf(0x02) +
            webauthnData +
            assertion.signatureR +
            assertion.signatureS +
            assertion.pubKey.x +
            assertion.pubKey.y

        val keyAuthorizationRlp = rlpEncodeList(buildKeyAuthorizationFields(sessionKey))
        val fields = listOf<Any>(
            RawRlp(keyAuthorizationRlp),
            sigBytes,
        )
        return rlpEncodeList(fields)
    }

    private fun buildKeyAuthorizationFields(sessionKey: SessionKey): List<Any> {
        return listOf(
            0L,                                              // chain_id
            0L,                                              // key_type: 0 = secp256k1 (RLP integer)
            P256Utils.hexToBytes(sessionKey.address),        // key_id
            sessionKey.expiresAt,                             // expiry
            // limits omitted (None)
        )
    }

    /**
     * Sign a transaction hash with the session key (secp256k1).
     * Returns a KeychainSignature (type 0x03) wrapping the secp256k1 signature.
     */
    fun signWithSessionKey(
        sessionKey: SessionKey,
        userAddress: String,
        txHash: ByteArray,
    ): ByteArray {
        // Sign with secp256k1
        val ecSpec = org.bouncycastle.jce.ECNamedCurveTable.getParameterSpec("secp256k1")
        val privKeyParam = org.bouncycastle.crypto.params.ECPrivateKeyParameters(
            BigInteger(1, sessionKey.privateKey), ecSpec.let {
                org.bouncycastle.crypto.params.ECDomainParameters(it.curve, it.g, it.n, it.h)
            }
        )

        val signer = org.bouncycastle.crypto.signers.ECDSASigner(
            org.bouncycastle.crypto.signers.HMacDSAKCalculator(
                org.bouncycastle.crypto.digests.SHA256Digest()
            )
        )
        signer.init(true, privKeyParam)
        val components = signer.generateSignature(txHash)
        var r = components[0]
        var s = components[1]

        // Normalize s to low-s (s <= n/2)
        val halfN = ecSpec.n.shiftRight(1)
        if (s > halfN) {
            s = ecSpec.n.subtract(s)
        }

        // Compute recovery id (yParity)
        val rBytes = padTo32(r.toByteArray().let { if (it[0] == 0.toByte()) it.copyOfRange(1, it.size) else it })
        val sBytes = padTo32(s.toByteArray().let { if (it[0] == 0.toByte()) it.copyOfRange(1, it.size) else it })

        // Try v=0 and v=1 to find the correct recovery id
        val yParity = recoverYParity(txHash, rBytes, sBytes, sessionKey.publicKeyX, sessionKey.publicKeyY, ecSpec)

        // Secp256k1 signature: r(32) || s(32) || v(1) — 65 bytes, no type prefix.
        // Use Electrum notation for v (27/28), matching canonical Ethereum signature bytes.
        val v = (27 + (yParity.toInt() and 0x01)).toByte()
        val secp256k1Sig = rBytes + sBytes + byteArrayOf(v)

        // KeychainSignature: 0x03 || user_address(20) || inner_signature
        val userAddrBytes = P256Utils.hexToBytes(userAddress)
        return byteArrayOf(0x03) + userAddrBytes + secp256k1Sig
    }

    private fun recoverYParity(
        hash: ByteArray,
        r: ByteArray,
        s: ByteArray,
        expectedX: ByteArray,
        expectedY: ByteArray,
        ecSpec: org.bouncycastle.jce.spec.ECNamedCurveParameterSpec,
    ): Byte {
        val rBig = BigInteger(1, r)
        val sBig = BigInteger(1, s)
        val n = ecSpec.n
        val curve = ecSpec.curve
        val g = ecSpec.g
        val msgHash = BigInteger(1, hash)

        for (v in 0..1) {
            try {
                // Recover public key
                val x = rBig
                val yBit = v == 1
                val rPoint = curve.decodePoint(
                    byteArrayOf(if (yBit) 0x03 else 0x02) + padTo32(x.toByteArray().let {
                        if (it[0] == 0.toByte()) it.copyOfRange(1, it.size) else it
                    })
                )
                val rInv = rBig.modInverse(n)
                val u1 = msgHash.negate().mod(n).multiply(rInv).mod(n)
                val u2 = sBig.multiply(rInv).mod(n)
                val recovered = g.multiply(u1).add(rPoint.multiply(u2)).normalize()

                val recoveredX = padTo32(recovered.affineXCoord.encoded)
                val recoveredY = padTo32(recovered.affineYCoord.encoded)

                if (recoveredX.contentEquals(expectedX) && recoveredY.contentEquals(expectedY)) {
                    return v.toByte()
                }
            } catch (_: Exception) {
                continue
            }
        }
        return 0 // default
    }

    /** Check if session key is still valid. */
    fun isValid(sessionKey: SessionKey?, ownerAddress: String? = null): Boolean {
        if (sessionKey == null) return false
        if (ownerAddress != null) {
            val owner = sessionKey.ownerAddress?.trim()?.lowercase().orEmpty()
            val expected = ownerAddress.trim().lowercase()
            if (owner.isBlank() || owner != expected) return false
        }
        return System.currentTimeMillis() / 1000 < sessionKey.expiresAt
    }

    // -- persistence --

    fun save(activity: Activity, sessionKey: SessionKey) {
        save(activity as Context, sessionKey)
    }

    fun save(context: Context, sessionKey: SessionKey) {
        prefs(context).edit()
            .putString("private_key", P256Utils.bytesToHex(sessionKey.privateKey))
            .putString("public_key_x", P256Utils.bytesToHex(sessionKey.publicKeyX))
            .putString("public_key_y", P256Utils.bytesToHex(sessionKey.publicKeyY))
            .putString("address", sessionKey.address)
            .putString("owner_address", sessionKey.ownerAddress)
            .putString("key_authorization", sessionKey.keyAuthorization?.let { P256Utils.bytesToHex(it) })
            .putLong("expires_at", sessionKey.expiresAt)
            .apply()
    }

    fun load(activity: Activity): SessionKey? = load(activity as Context)

    fun load(context: Context): SessionKey? {
        val p = prefs(context)
        val privHex = p.getString("private_key", null) ?: return null
        val pubXHex = p.getString("public_key_x", null) ?: return null
        val pubYHex = p.getString("public_key_y", null) ?: return null
        val address = p.getString("address", null) ?: return null
        val ownerAddress = p.getString("owner_address", null)
        val keyAuthorizationHex = p.getString("key_authorization", null)
        val expiresAt = p.getLong("expires_at", 0)
        if (expiresAt == 0L) return null

        return SessionKey(
            privateKey = P256Utils.hexToBytes(privHex),
            publicKeyX = P256Utils.hexToBytes(pubXHex),
            publicKeyY = P256Utils.hexToBytes(pubYHex),
            address = address,
            ownerAddress = ownerAddress?.trim()?.lowercase()?.ifBlank { null },
            keyAuthorization = keyAuthorizationHex?.let { P256Utils.hexToBytes(it) },
            expiresAt = expiresAt,
        )
    }

    fun clear(activity: Activity) = clear(activity as Context)

    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
    }

    // -- RLP helpers (reuse from TempoTransaction would be better, but keep self-contained) --

    private fun rlpEncodeList(items: List<Any>): ByteArray {
        val buf = ByteArrayOutputStream()
        for (item in items) buf.write(rlpEncode(item))
        val payload = buf.toByteArray()
        return rlpLengthPrefix(payload, 0xc0)
    }

    @Suppress("UNCHECKED_CAST")
    private fun rlpEncode(item: Any): ByteArray = when (item) {
        is RawRlp -> item.encoded
        is ByteArray -> rlpEncodeBytes(item)
        is Long -> rlpEncodeLong(item)
        is Int -> rlpEncodeLong(item.toLong())
        is Byte -> rlpEncodeBytes(byteArrayOf(item))
        is List<*> -> rlpEncodeList(item as List<Any>)
        else -> throw IllegalArgumentException("unsupported RLP type: ${item::class}")
    }

    private fun rlpEncodeBytes(bytes: ByteArray): ByteArray {
        if (bytes.size == 1 && bytes[0].toInt() and 0xFF < 0x80) return bytes
        return rlpLengthPrefix(bytes, 0x80)
    }

    private fun rlpEncodeLong(value: Long): ByteArray {
        if (value == 0L) return byteArrayOf(0x80.toByte())
        if (value < 128) return byteArrayOf(value.toByte())
        return rlpLengthPrefix(longToMinimalBytes(value), 0x80)
    }

    private fun longToMinimalBytes(value: Long): ByteArray {
        if (value == 0L) return ByteArray(0)
        var v = value
        val buf = ByteArrayOutputStream()
        while (v > 0) { buf.write((v and 0xFF).toInt()); v = v shr 8 }
        return buf.toByteArray().reversedArray()
    }

    private fun rlpLengthPrefix(payload: ByteArray, offset: Int): ByteArray {
        return if (payload.size < 56) {
            byteArrayOf((offset + payload.size).toByte()) + payload
        } else {
            val lenBytes = longToMinimalBytes(payload.size.toLong())
            byteArrayOf((offset + 55 + lenBytes.size).toByte()) + lenBytes + payload
        }
    }

    private fun padTo32(b: ByteArray): ByteArray {
        if (b.size >= 32) return b.copyOfRange(b.size - 32, b.size)
        return ByteArray(32 - b.size) + b
    }
}
