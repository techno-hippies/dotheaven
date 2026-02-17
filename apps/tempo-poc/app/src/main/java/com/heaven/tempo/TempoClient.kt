package com.heaven.tempo

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Minimal Tempo testnet RPC client.
 */
object TempoClient {

    const val CHAIN_ID = 42431L
    const val RPC_URL = "https://rpc.moderato.tempo.xyz"
    const val EXPLORER_URL = "https://explore.tempo.xyz"
    const val ALPHA_USD = "0x20c0000000000000000000000000000000000001"

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    private val jsonType = "application/json".toMediaType()

    data class Eip1559Fees(
        val maxPriorityFeePerGas: Long,
        val maxFeePerGas: Long,
    )

    private suspend fun rpc(method: String, params: JSONArray = JSONArray()): Any? {
        val body = JSONObject()
            .put("jsonrpc", "2.0")
            .put("id", 1)
            .put("method", method)
            .put("params", params)

        return withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url(RPC_URL)
                .post(body.toString().toRequestBody(jsonType))
                .build()

            client.newCall(request).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) throw RuntimeException("RPC failed (${resp.code}): $text")
                val json = JSONObject(text)
                if (json.has("error")) {
                    val err = json.get("error")
                    throw RuntimeException("RPC error: $err")
                }
                json.opt("result")
            }
        }
    }

    /** Fund address with testnet stablecoins. */
    suspend fun fundAddress(address: String): String {
        val result = rpc("tempo_fundAddress", JSONArray().put(address))
        return result?.toString() ?: "funded"
    }

    /** Get AlphaUSD balance (ERC-20 balanceOf via eth_call). */
    suspend fun getBalance(address: String): String {
        // balanceOf(address) selector = 0x70a08231
        val addrPadded = address.removePrefix("0x").lowercase().padStart(64, '0')
        val data = "0x70a08231$addrPadded"

        val callObj = JSONObject()
            .put("to", ALPHA_USD)
            .put("data", data)

        val result = rpc("eth_call", JSONArray().put(callObj).put("latest"))
        val hex = result?.toString()?.removePrefix("0x") ?: "0"
        if (hex.isEmpty() || hex == "0" || hex.all { it == '0' }) return "0"

        // TIP-20 stablecoins use 6 decimals
        val raw = hex.toBigInteger(16)
        val whole = raw.divide(java.math.BigInteger.TEN.pow(6))
        val frac = raw.mod(java.math.BigInteger.TEN.pow(6))
        val fracStr = frac.toString().padStart(6, '0').take(2)
        return "$whole.$fracStr"
    }

    /** Get transaction count (nonce) for address. */
    suspend fun getNonce(address: String): Long {
        val result = rpc("eth_getTransactionCount", JSONArray().put(address).put("latest"))
        val hex = result?.toString()?.removePrefix("0x") ?: "0"
        return hex.toLong(16)
    }

    /** Get current gas price. */
    suspend fun getGasPrice(): Long {
        val result = rpc("eth_gasPrice")
        val hex = result?.toString()?.removePrefix("0x") ?: "0"
        return hex.toLong(16)
    }

    /** Build buffered EIP-1559 fees from current gas price to avoid base-fee race failures. */
    suspend fun getSuggestedFees(): Eip1559Fees {
        val gasPrice = getGasPrice()
        val priority = (gasPrice / 5).coerceAtLeast(1_000_000L)
        val buffered = saturatingMul(gasPrice, 4)
        val minRequired = saturatingAdd(gasPrice, priority)
        val maxFee = maxOf(buffered, minRequired)
        return Eip1559Fees(
            maxPriorityFeePerGas = priority,
            maxFeePerGas = maxFee,
        )
    }

    /** Send raw signed transaction. */
    suspend fun sendRawTransaction(signedTxHex: String): String {
        val result = rpc("eth_sendRawTransaction", JSONArray().put(signedTxHex))
        return result?.toString() ?: throw RuntimeException("no tx hash returned")
    }

    /** Get chain ID to confirm connection. */
    suspend fun getChainId(): Long {
        val result = rpc("eth_chainId")
        val hex = result?.toString()?.removePrefix("0x") ?: "0"
        return hex.toLong(16)
    }

    private fun saturatingAdd(a: Long, b: Long): Long =
        if (Long.MAX_VALUE - a < b) Long.MAX_VALUE else a + b

    private fun saturatingMul(a: Long, factor: Int): Long =
        if (a > Long.MAX_VALUE / factor) Long.MAX_VALUE else a * factor
}
