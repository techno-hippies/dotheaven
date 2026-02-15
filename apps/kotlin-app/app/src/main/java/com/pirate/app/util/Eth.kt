package com.pirate.app.util

import org.bouncycastle.jcajce.provider.digest.Keccak

object Eth {
  fun deriveAddressFromUncompressedPublicKeyHex(pubkeyHex: String): String? {
    val hex = pubkeyHex.trim().removePrefix("0x").removePrefix("0X")
    if (hex.length < 2) return null
    val withoutPrefix = if (hex.startsWith("04") && hex.length == 130) hex.substring(2) else hex
    if (withoutPrefix.length != 128) return null
    val pubBytes = runCatching { hexToBytes(withoutPrefix) }.getOrNull() ?: return null
    val digest = Keccak.Digest256()
    val hash = digest.digest(pubBytes)
    val addrBytes = hash.copyOfRange(hash.size - 20, hash.size)
    return "0x" + bytesToHex(addrBytes)
  }

  private fun hexToBytes(hex: String): ByteArray {
    val clean = hex.lowercase()
    require(clean.length % 2 == 0) { "hex length must be even" }
    val out = ByteArray(clean.length / 2)
    var i = 0
    while (i < clean.length) {
      val hi = clean[i].digitToInt(16)
      val lo = clean[i + 1].digitToInt(16)
      out[i / 2] = ((hi shl 4) or lo).toByte()
      i += 2
    }
    return out
  }

  private fun bytesToHex(bytes: ByteArray): String {
    val sb = StringBuilder(bytes.size * 2)
    for (b in bytes) {
      sb.append(((b.toInt() ushr 4) and 0x0f).toString(16))
      sb.append((b.toInt() and 0x0f).toString(16))
    }
    return sb.toString()
  }
}

