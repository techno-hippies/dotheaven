package com.heaven.tempo

import org.bouncycastle.jcajce.provider.digest.Keccak
import java.io.ByteArrayOutputStream

/**
 * Minimal Tempo transaction (type 0x76) builder.
 *
 * Tempo tx RLP:
 * 0x76 || rlp([
 *   chain_id, max_priority_fee_per_gas, max_fee_per_gas, gas_limit,
 *   calls, access_list, nonce_key, nonce, valid_before, valid_after,
 *   fee_token, fee_payer_signature, aa_authorization_list, key_authorization
 * ])
 *
 * Each call: [to, value, input]
 *
 * For signing, we compute keccak256(0x76 || rlp(unsigned_fields)).
 */
object TempoTransaction {

    /** Wrapper for values that are already full RLP items and must not be re-encoded. */
    private data class RawRlp(val encoded: ByteArray)

    data class Call(
        val to: ByteArray,     // 20 bytes
        val value: Long = 0,
        val input: ByteArray = ByteArray(0),
    )

    data class UnsignedTx(
        val chainId: Long = TempoClient.CHAIN_ID,
        val maxPriorityFeePerGas: Long = 1_000_000_000L, // 1 gwei
        val maxFeePerGas: Long = 2_000_000_000L,         // 2 gwei
        val gasLimit: Long = 100_000L,
        val calls: List<Call> = emptyList(),
        val nonceKey: Long = 0,
        val nonce: Long = 0,
        val feeToken: ByteArray = P256Utils.hexToBytes(TempoClient.ALPHA_USD),
        val keyAuthorization: ByteArray? = null,  // SignedKeyAuthorization RLP bytes
    )

    /** Compute the signature hash for the unsigned transaction. */
    fun signatureHash(tx: UnsignedTx): ByteArray {
        val encoded = rlpEncodeList(signingFields(tx))
        val payload = ByteArray(1) { 0x76.toByte() } + encoded
        return Keccak.Digest256().digest(payload)
    }

    /** Encode the full signed transaction with WebAuthn signature. */
    fun encodeSignedWebAuthn(
        tx: UnsignedTx,
        assertion: TempoPasskeyManager.PasskeyAssertion,
    ): String {
        // WebAuthn signature: 0x02 || webauthn_data || r || s || pub_key_x || pub_key_y
        val webauthnData = assertion.authenticatorData + assertion.clientDataJSON
        val sigBytes = byteArrayOf(0x02) +
            webauthnData +
            assertion.signatureR +
            assertion.signatureS +
            assertion.pubKey.x +
            assertion.pubKey.y

        // Signed tx: 0x76 || rlp([...full_fields, sender_signature])
        val allFields = fullFields(tx).toMutableList()
        allFields.add(sigBytes)

        val rlpPayload = rlpEncodeList(allFields)
        return "0x76" + P256Utils.bytesToHex(rlpPayload)
    }

    /** Encode a signed transaction using a session key (KeychainSignature). */
    fun encodeSignedSessionKey(
        tx: UnsignedTx,
        keychainSignature: ByteArray,  // type 0x03 || user_address || inner sig
    ): String {
        val allFields = fullFields(tx).toMutableList()
        allFields.add(keychainSignature)

        val rlpPayload = rlpEncodeList(allFields)
        return "0x76" + P256Utils.bytesToHex(rlpPayload)
    }

    // -- internal --

    /**
     * Fields for signing hash — key_authorization is EXCLUDED,
     * fee_payer_signature is encoded as None (0x80) for self-pay txs.
     */
    private fun signingFields(tx: UnsignedTx): List<Any> {
        val callsList = tx.calls.map { call ->
            listOf(call.to, call.value, call.input)
        }

        val fields = mutableListOf<Any>(
            tx.chainId,                    // chain_id
            tx.maxPriorityFeePerGas,       // max_priority_fee_per_gas
            tx.maxFeePerGas,               // max_fee_per_gas
            tx.gasLimit,                   // gas_limit
            callsList,                     // calls
            emptyList<Any>(),              // access_list (empty)
            tx.nonceKey,                   // nonce_key
            tx.nonce,                      // nonce
            0L,                            // valid_before (None → 0x80)
            0L,                            // valid_after (None → 0x80)
            tx.feeToken,                   // fee_token
            ByteArray(0),                  // fee_payer_signature (None → 0x80)
            emptyList<Any>(),              // aa_authorization_list (empty)
        )

        // key_authorization is part of the signing payload when present.
        if (tx.keyAuthorization != null) {
            fields.add(RawRlp(tx.keyAuthorization))
        }

        return fields
    }

    /**
     * Fields for the full encoded transaction — includes key_authorization
     * (only when present, completely omitted when null).
     */
    private fun fullFields(tx: UnsignedTx): List<Any> {
        val callsList = tx.calls.map { call ->
            listOf(call.to, call.value, call.input)
        }

        val fields = mutableListOf<Any>(
            tx.chainId,                    // chain_id
            tx.maxPriorityFeePerGas,       // max_priority_fee_per_gas
            tx.maxFeePerGas,               // max_fee_per_gas
            tx.gasLimit,                   // gas_limit
            callsList,                     // calls
            emptyList<Any>(),              // access_list (empty)
            tx.nonceKey,                   // nonce_key
            tx.nonce,                      // nonce
            0L,                            // valid_before (None → 0x80)
            0L,                            // valid_after (None → 0x80)
            tx.feeToken,                   // fee_token
            ByteArray(0),                  // fee_payer_signature (empty = self-pay)
            emptyList<Any>(),              // aa_authorization_list (empty)
        )

        // key_authorization: only include when present (no bytes when null)
        if (tx.keyAuthorization != null) {
            fields.add(RawRlp(tx.keyAuthorization))
        }

        return fields
    }

    // -- minimal RLP encoder --

    private fun rlpEncodeList(items: List<Any>): ByteArray {
        val buf = ByteArrayOutputStream()
        for (item in items) {
            buf.write(rlpEncode(item))
        }
        val payload = buf.toByteArray()
        return rlpLengthPrefix(payload, 0xc0)
    }

    @Suppress("UNCHECKED_CAST")
    private fun rlpEncode(item: Any): ByteArray {
        return when (item) {
            is RawRlp -> item.encoded
            is ByteArray -> rlpEncodeBytes(item)
            is Long -> rlpEncodeLong(item)
            is Int -> rlpEncodeLong(item.toLong())
            is List<*> -> rlpEncodeList(item as List<Any>)
            else -> throw IllegalArgumentException("unsupported RLP type: ${item::class}")
        }
    }

    private fun rlpEncodeBytes(bytes: ByteArray): ByteArray {
        if (bytes.size == 1 && bytes[0].toInt() and 0xFF < 0x80) {
            return bytes
        }
        return rlpLengthPrefix(bytes, 0x80)
    }

    private fun rlpEncodeLong(value: Long): ByteArray {
        if (value == 0L) return byteArrayOf(0x80.toByte())
        if (value < 128) return byteArrayOf(value.toByte())
        val bytes = longToMinimalBytes(value)
        return rlpLengthPrefix(bytes, 0x80)
    }

    private fun longToMinimalBytes(value: Long): ByteArray {
        if (value == 0L) return ByteArray(0)
        var v = value
        val buf = ByteArrayOutputStream()
        while (v > 0) {
            buf.write((v and 0xFF).toInt())
            v = v shr 8
        }
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
}
