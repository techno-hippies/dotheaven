package com.pirate.app.chat

data class ConversationItem(
  val id: String,
  val peerAddress: String,
  val peerInboxId: String,
  val lastMessage: String,
  val lastMessageTimestampMs: Long,
  val unreadCount: Int = 0,
)

data class ChatMessage(
  val id: String,
  val senderAddress: String,
  val senderInboxId: String,
  val text: String,
  val timestampMs: Long,
  val isFromMe: Boolean,
)
