package com.pirate.app.chat

import org.xmtp.android.library.libxmtp.DecodedMessage

internal fun sanitizeXmtpBody(message: DecodedMessage): String {
  val body = runCatching { message.body }.getOrDefault("")
  val trimmed = body.trim()
  if (trimmed.isBlank()) return ""
  if (trimmed.startsWith("@")) {
    val tail = trimmed.drop(1)
    val looksLikeBlob = looksLikeEncodedBlobToken(tail)
    if (looksLikeBlob) return "[Unsupported XMTP message]"
  }
  return trimmed
}

private fun looksLikeEncodedBlobToken(value: String): Boolean {
  if (value.length < 32) return false
  if (value.any { it.isWhitespace() }) return false

  val allowedCount =
    value.count {
      it.isLetterOrDigit() ||
        it == '-' ||
        it == '_' ||
        it == '=' ||
        it == '+' ||
        it == '/' ||
        it == '.'
    }
  if (allowedCount != value.length) return false

  val alphaNumericRatio = value.count { it.isLetterOrDigit() }.toDouble() / value.length.toDouble()
  return alphaNumericRatio >= 0.7
}
