package com.pirate.app.profile

import androidx.fragment.app.FragmentActivity
import com.pirate.app.tempo.P256Utils
import com.pirate.app.tempo.SessionKeyManager
import com.pirate.app.tempo.TempoClient
import com.pirate.app.tempo.TempoPasskeyManager
import com.pirate.app.tempo.TempoTransaction
import java.math.BigInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.web3j.abi.FunctionEncoder
import org.web3j.abi.datatypes.DynamicStruct
import org.web3j.abi.datatypes.Function
import org.web3j.abi.datatypes.Utf8String
import org.web3j.abi.datatypes.generated.Bytes2
import org.web3j.abi.datatypes.generated.Bytes32
import org.web3j.abi.datatypes.generated.Int32
import org.web3j.abi.datatypes.generated.Uint16
import org.web3j.abi.datatypes.generated.Uint256
import org.web3j.abi.datatypes.generated.Uint8

data class TempoProfileUpsertResult(
  val success: Boolean,
  val txHash: String? = null,
  val error: String? = null,
)

object TempoProfileContractApi {
  const val PROFILE_V2 = "0x6FDb2F5B13F8D7f365B4A75A2763d5C7270E8066"
  private const val GAS_LIMIT_UPSERT_PROFILE = 900_000L

  suspend fun upsertProfile(
    activity: FragmentActivity,
    account: TempoPasskeyManager.PasskeyAccount,
    profileInput: JSONObject,
    rpId: String = account.rpId,
    sessionKey: SessionKeyManager.SessionKey? = null,
  ): TempoProfileUpsertResult {
    return runCatching {
      val chainId = withContext(Dispatchers.IO) { TempoClient.getChainId() }
      if (chainId != TempoClient.CHAIN_ID) {
        throw IllegalStateException("Wrong chain connected: $chainId (expected ${TempoClient.CHAIN_ID})")
      }

      val nonce = withContext(Dispatchers.IO) { TempoClient.getNonce(account.address) }
      val fees = withContext(Dispatchers.IO) { TempoClient.getSuggestedFees() }
      val calldata = encodeUpsertProfileCall(profileInput)

      val tx =
        TempoTransaction.UnsignedTx(
          nonce = nonce,
          maxPriorityFeePerGas = fees.maxPriorityFeePerGas,
          maxFeePerGas = fees.maxFeePerGas,
          feeMode = TempoTransaction.FeeMode.RELAY_SPONSORED,
          gasLimit = GAS_LIMIT_UPSERT_PROFILE,
          calls =
            listOf(
              TempoTransaction.Call(
                to = P256Utils.hexToBytes(PROFILE_V2),
                value = 0,
                input = P256Utils.hexToBytes(calldata),
              ),
            ),
        )

      val sigHash = TempoTransaction.signatureHash(tx)
      val signedTxHex =
        if (sessionKey != null) {
          val keychainSig = SessionKeyManager.signWithSessionKey(
            sessionKey = sessionKey,
            userAddress = account.address,
            txHash = sigHash,
          )
          TempoTransaction.encodeSignedSessionKey(tx, keychainSig)
        } else {
          val assertion =
            TempoPasskeyManager.sign(
              activity = activity,
              challenge = sigHash,
              account = account,
              rpId = rpId,
            )
          TempoTransaction.encodeSignedWebAuthn(tx, assertion)
        }
      val txHash = withContext(Dispatchers.IO) {
        TempoClient.sendSponsoredRawTransaction(
          signedTxHex = signedTxHex,
          senderAddress = account.address,
        )
      }
      TempoProfileUpsertResult(success = true, txHash = txHash)
    }.getOrElse { err ->
      TempoProfileUpsertResult(success = false, error = err.message ?: "Tempo profile tx failed")
    }
  }

  private fun encodeUpsertProfileCall(profileInput: JSONObject): String {
    val profileStruct =
      DynamicStruct(
        uint8(profileInput.optInt("profileVersion", 2)),
        Utf8String(profileInput.optString("displayName", "")),
        bytes32(profileInput.optString("nameHash", ProfileContractApi.ZERO_HASH)),
        uint8(profileInput.optInt("age", 0)),
        uint16(profileInput.optInt("heightCm", 0)),
        bytes2(profileInput.optString("nationality", "0x0000")),
        uint256(parseUint256(profileInput.opt("languagesPacked"))),
        uint8(profileInput.optInt("friendsOpenToMask", 0)),
        bytes32(profileInput.optString("locationCityId", ProfileContractApi.ZERO_HASH)),
        int32(profileInput.optInt("locationLatE6", 0)),
        int32(profileInput.optInt("locationLngE6", 0)),
        bytes32(profileInput.optString("schoolId", ProfileContractApi.ZERO_HASH)),
        bytes32(profileInput.optString("skillsCommit", ProfileContractApi.ZERO_HASH)),
        bytes32(profileInput.optString("hobbiesCommit", ProfileContractApi.ZERO_HASH)),
        Utf8String(profileInput.optString("photoURI", "")),
        uint8(profileInput.optInt("gender", 0)),
        uint8(profileInput.optInt("relocate", 0)),
        uint8(profileInput.optInt("degree", 0)),
        uint8(profileInput.optInt("fieldBucket", 0)),
        uint8(profileInput.optInt("profession", 0)),
        uint8(profileInput.optInt("industry", 0)),
        uint8(profileInput.optInt("relationshipStatus", 0)),
        uint8(profileInput.optInt("sexuality", 0)),
        uint8(profileInput.optInt("ethnicity", 0)),
        uint8(profileInput.optInt("datingStyle", 0)),
        uint8(profileInput.optInt("children", 0)),
        uint8(profileInput.optInt("wantsChildren", 0)),
        uint8(profileInput.optInt("drinking", 0)),
        uint8(profileInput.optInt("smoking", 0)),
        uint8(profileInput.optInt("drugs", 0)),
        uint8(profileInput.optInt("lookingFor", 0)),
        uint8(profileInput.optInt("religion", 0)),
        uint8(profileInput.optInt("pets", 0)),
        uint8(profileInput.optInt("diet", 0)),
      )

    val function = Function("upsertProfile", listOf(profileStruct), emptyList())
    return FunctionEncoder.encode(function)
  }

  private fun uint8(value: Int): Uint8 = Uint8(BigInteger.valueOf(value.coerceAtLeast(0).toLong()))

  private fun uint16(value: Int): Uint16 = Uint16(BigInteger.valueOf(value.coerceAtLeast(0).toLong()))

  private fun uint256(value: BigInteger): Uint256 = Uint256(value.max(BigInteger.ZERO))

  private fun int32(value: Int): Int32 = Int32(BigInteger.valueOf(value.toLong()))

  private fun bytes2(hex: String): Bytes2 = Bytes2(fixedBytes(hex, size = 2))

  private fun bytes32(hex: String): Bytes32 = Bytes32(fixedBytes(hex, size = 32))

  private fun parseUint256(raw: Any?): BigInteger {
    return when (raw) {
      is Number -> BigInteger.valueOf(raw.toLong())
      is String -> {
        val value = raw.trim()
        if (value.isBlank()) BigInteger.ZERO
        else if (value.startsWith("0x", ignoreCase = true)) {
          value.removePrefix("0x").removePrefix("0X").toBigIntegerOrNull(16) ?: BigInteger.ZERO
        } else {
          value.toBigIntegerOrNull() ?: BigInteger.ZERO
        }
      }
      else -> BigInteger.ZERO
    }
  }

  private fun fixedBytes(hex: String, size: Int): ByteArray {
    val clean = hex.trim().removePrefix("0x").removePrefix("0X")
    if (clean.isBlank()) return ByteArray(size)
    require(clean.length <= size * 2) { "hex value exceeds ${size} bytes" }
    val padded = clean.padStart(size * 2, '0')
    return P256Utils.hexToBytes(padded)
  }
}
