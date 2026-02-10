import React, { useState, useCallback, useRef, useContext, useEffect } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CaretLeft,
  DotsThreeVertical,
  PaperPlaneTilt,
  PencilSimple,
  Phone,
} from 'phosphor-react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MobileHeader } from '../components/MobileHeader';
import { Avatar } from '../ui/Avatar';
import { IconButton } from '../ui/IconButton';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../providers/AuthProvider';
import { useXMTP, type XMTPMessage, type ChatListItem } from '../providers/XMTPProvider';
import { DrawerContext } from '../navigation/TabNavigator';
import { getWorkerToken } from '../lib/worker-auth';
import { colors, fontSize, radii } from '../lib/theme';

const CHAT_WORKER_URL = 'https://neodate-voice.deletion-backup782.workers.dev';
const CHAT_STORAGE_KEY = 'heaven:ai-chat-scarlett';

// ── Types ───────────────────────────────────────────────────────────

type ChatView = 'list' | 'chat';

interface ConversationItem {
  id: string;
  name: string;
  handle?: string;
  avatar?: string;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
  isAI?: boolean;
  peerAddress?: string;
}

interface Message {
  id: string;
  sender: 'me' | 'them';
  senderName?: string;
  content: string;
  time: string;
}

// ── Mock data (Scarlett AI only) ─────────────────────────────────────

const SCARLETT_INTRO =
  "Hey, I'm Scarlett. I will match you with other users who like your music and meet your preferences to make new friends or date!";

const SCARLETT_CONVERSATION: ConversationItem = {
  id: 'ai-scarlett',
  name: 'Scarlett',
  lastMessage: SCARLETT_INTRO,
  timestamp: '',
  unreadCount: 0,
  isAI: true,
};

const SCARLETT_MESSAGES: Message[] = [
  {
    id: 's1',
    sender: 'them',
    senderName: 'Scarlett',
    content:
      SCARLETT_INTRO +
      '\n\nThen one of you can book a karaoke room and sing with each other. A great way to break the ice and make new friends in the metaverse.',
    time: '',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

function formatTimestamp(date?: Date): string {
  if (!date) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

function formatMessageTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function xmtpToConversationItem(item: ChatListItem): ConversationItem {
  return {
    id: item.id,
    name: item.name,
    lastMessage: item.lastMessage || '',
    timestamp: formatTimestamp(item.timestamp),
    unreadCount: item.hasUnread ? 1 : 0,
    peerAddress: item.peerAddress,
  };
}

function xmtpToMessage(msg: XMTPMessage): Message {
  return {
    id: msg.id,
    sender: msg.sender === 'user' ? 'me' : 'them',
    content: msg.content,
    time: formatMessageTime(msg.timestamp),
  };
}

function getConnectErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && typeof (error as any).message === 'string') {
    return (error as any).message;
  }
  return String(error);
}

function isUserRejectedSignatureError(error: unknown): boolean {
  const message = getConnectErrorMessage(error).toLowerCase();
  return /user rejected|rejected signature|signature rejected|action rejected|request rejected|user denied|cancelled|canceled/.test(
    message,
  );
}

// ── Chat List Row ───────────────────────────────────────────────────

const ChatListRow: React.FC<{
  conversation: ConversationItem;
  onPress: () => void;
}> = ({ conversation, onPress }) => {
  const hasUnread = conversation.unreadCount > 0;

  return (
    <TouchableOpacity
      style={styles.chatRow}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <Avatar size="lg" />
      <View style={styles.chatRowContent}>
        <View style={styles.chatRowTopLine}>
          <Text
            style={[
              styles.chatRowName,
              hasUnread && styles.chatRowNameUnread,
            ]}
            numberOfLines={1}
          >
            {conversation.name}
          </Text>
          {conversation.handle ? (
            <Text style={styles.chatRowHandle} numberOfLines={1}>
              {conversation.handle}
            </Text>
          ) : null}
          <View style={styles.flex1} />
          {conversation.timestamp ? (
            <Text
              style={[
                styles.chatRowTimestamp,
                hasUnread && styles.chatRowTimestampUnread,
              ]}
            >
              {conversation.timestamp}
            </Text>
          ) : null}
        </View>
        <View style={styles.chatRowBottomLine}>
          <Text
            style={[
              styles.chatRowMessage,
              hasUnread && styles.chatRowMessageUnread,
            ]}
            numberOfLines={1}
          >
            {conversation.lastMessage}
          </Text>
          {hasUnread && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {conversation.unreadCount > 99
                  ? '99+'
                  : conversation.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ── Message Bubble ──────────────────────────────────────────────────

const MessageBubbleRow: React.FC<{
  message: Message;
  isFirstInGroup: boolean;
}> = ({ message, isFirstInGroup }) => {
  const isOwn = message.sender === 'me';

  return (
    <View style={[styles.bubbleRow, isFirstInGroup && styles.bubbleRowFirst]}>
      {isFirstInGroup ? (
        <Avatar size="md" style={styles.bubbleAvatar} />
      ) : (
        <View style={styles.bubbleAvatarSpacer} />
      )}
      <View style={styles.bubbleContent}>
        {isFirstInGroup && (
          <View style={styles.bubbleHeader}>
            {message.senderName || isOwn ? (
              <Text
                style={[
                  styles.bubbleSenderName,
                  isOwn && styles.bubbleSenderNameOwn,
                ]}
              >
                {isOwn ? 'You' : message.senderName}
              </Text>
            ) : null}
            {message.time ? (
              <Text style={styles.bubbleTimestamp}>{message.time}</Text>
            ) : null}
          </View>
        )}
        <Text style={styles.bubbleText}>{message.content}</Text>
      </View>
    </View>
  );
};

// ── Chat Input ──────────────────────────────────────────────────────

const ChatInput: React.FC<{
  onSend: (text: string) => void;
  placeholder?: string;
}> = ({ onSend, placeholder }) => {
  const [text, setText] = useState('');
  const insets = useSafeAreaInsets();

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }, [text, onSend]);

  return (
    <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <TextInput
        style={styles.inputField}
        value={text}
        onChangeText={setText}
        placeholder={placeholder || 'Type a message...'}
        placeholderTextColor={colors.textMuted}
        returnKeyType="send"
        onSubmitEditing={handleSend}
        blurOnSubmit={false}
      />
      <IconButton
        variant="send"
        size="xl"
        accessibilityLabel="Send message"
        disabled={!text.trim()}
        onPress={handleSend}
      >
        <PaperPlaneTilt
          size={20}
          color={text.trim() ? '#171717' : colors.textMuted}
          weight="fill"
        />
      </IconButton>
    </View>
  );
};

// ═════════════════════════════════════════════════════════════════════
// VIEW 1: Chat List
// ═════════════════════════════════════════════════════════════════════

const ChatList: React.FC<{
  conversations: ConversationItem[];
  isConnecting: boolean;
  isAvailable: boolean;
  onSelectChat: (conversation: ConversationItem) => void;
}> = ({ conversations, isConnecting, isAvailable, onSelectChat }) => (
  <ScrollView
    contentContainerStyle={styles.listContent}
    showsVerticalScrollIndicator={false}
  >
    {/* Scarlett AI always pinned at top */}
    <ChatListRow
      conversation={SCARLETT_CONVERSATION}
      onPress={() => onSelectChat(SCARLETT_CONVERSATION)}
    />

    {/* XMTP conversations */}
    {conversations.map((conv) => (
      <ChatListRow
        key={conv.id}
        conversation={conv}
        onPress={() => onSelectChat(conv)}
      />
    ))}

    {/* Loading state */}
    {isConnecting && (
      <View style={styles.connectingRow}>
        <ActivityIndicator size="small" color={colors.accentBlue} />
        <Text style={styles.connectingText}>Connecting to XMTP...</Text>
      </View>
    )}

    {/* Native module not available */}
    {!isAvailable && (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>
          XMTP requires a native build. Peer messaging will be available after rebuilding the app.
        </Text>
      </View>
    )}

  </ScrollView>
);

// ═════════════════════════════════════════════════════════════════════
// VIEW 2: Chat Detail (AI)
// ═════════════════════════════════════════════════════════════════════

const AIChatDetail: React.FC<{
  onBack: () => void;
}> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const { pkpInfo, signMessage } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);

  // Load persisted messages on mount
  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(CHAT_STORAGE_KEY);
      if (stored) {
        try {
          setMessages(JSON.parse(stored));
        } catch {}
      }
    })();
  }, []);

  // Persist messages when they change
  useEffect(() => {
    if (messages.length > 0) {
      AsyncStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)).catch(() => {});
    }
  }, [messages]);

  // All display messages: intro + persisted
  const allMessages: Message[] = [
    ...SCARLETT_MESSAGES,
    ...messages,
  ];

  const getIsFirstInGroup = (index: number): boolean => {
    if (index === 0) return true;
    return allMessages[index].sender !== allMessages[index - 1].sender;
  };

  const handleSend = useCallback(async (text: string) => {
    const now = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: 'me',
      content: text,
      time: now,
    };
    setMessages((prev) => [...prev, userMsg]);

    if (!pkpInfo?.ethAddress) {
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        sender: 'them',
        senderName: 'Scarlett',
        content: 'Please sign in to chat with me!',
        time: now,
      };
      setMessages((prev) => [...prev, errorMsg]);
      return;
    }

    setIsSending(true);

    try {
      const token = await getWorkerToken({
        workerUrl: CHAT_WORKER_URL,
        wallet: pkpInfo.ethAddress,
        signMessage,
      });

      // Build history for context (last 20 messages)
      const history = [...messages, userMsg]
        .slice(-20)
        .map((m) => ({
          role: m.sender === 'me' ? 'user' : 'assistant',
          content: m.content,
        }));

      const response = await fetch(`${CHAT_WORKER_URL}/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text, history }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error((err as { error?: string }).error || 'Failed to get response');
      }

      const data = (await response.json()) as { message?: string };
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        sender: 'them',
        senderName: 'Scarlett',
        content: data.message || "Sorry, I couldn't generate a response.",
        time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      console.error('[ChatScreen] AI send failed:', error);
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        sender: 'them',
        senderName: 'Scarlett',
        content: 'Sorry, something went wrong. Please try again.',
        time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  }, [pkpInfo, signMessage, messages]);

  return (
    <KeyboardAvoidingView
      style={styles.flex1}
      behavior="padding"
    >
      <View style={[styles.chatHeader, { paddingTop: insets.top + 8 }]}>
        <View style={styles.chatHeaderLeft}>
          <IconButton variant="ghost" size="md" accessibilityLabel="Back" onPress={onBack}>
            <CaretLeft size={20} color={colors.textPrimary} weight="bold" />
          </IconButton>
          <Avatar size="md" />
          <Text style={styles.chatHeaderName} numberOfLines={1}>Scarlett</Text>
        </View>
        <View style={styles.chatHeaderRight}>
          <IconButton
            variant="ghost"
            size="md"
            accessibilityLabel="Start voice call"
            onPress={() => console.log('[ChatScreen] Start call')}
          >
            <Phone size={20} color={colors.textSecondary} />
          </IconButton>
          <IconButton
            variant="ghost"
            size="md"
            accessibilityLabel="More options"
            onPress={() => console.log('[ChatScreen] Options')}
          >
            <DotsThreeVertical size={20} color={colors.textSecondary} weight="bold" />
          </IconButton>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.flex1}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {allMessages.map((msg, i) => (
          <MessageBubbleRow key={msg.id} message={msg} isFirstInGroup={getIsFirstInGroup(i)} />
        ))}
        {isSending && (
          <View style={styles.typingRow}>
            <ActivityIndicator size="small" color={colors.accentPurple} />
            <Text style={styles.typingText}>Scarlett is typing...</Text>
          </View>
        )}
      </ScrollView>

      <ChatInput
        onSend={handleSend}
        placeholder="Message Scarlett..."
      />
    </KeyboardAvoidingView>
  );
};

// ═════════════════════════════════════════════════════════════════════
// VIEW 2: Chat Detail (XMTP Peer)
// ═════════════════════════════════════════════════════════════════════

const XMTPChatDetail: React.FC<{
  conversation: ConversationItem;
  onBack: () => void;
}> = ({ conversation, onBack }) => {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const xmtp = useXMTP();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  // Load messages on mount
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const xmtpMsgs = await xmtp.loadMessages(conversation.id);
        if (mounted) {
          setMessages(xmtpMsgs.map(xmtpToMessage));
          xmtp.markRead(conversation.id);
        }
      } catch (error) {
        console.error('[ChatScreen] Failed to load messages:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [conversation.id]);

  // Sync messages from provider state
  useEffect(() => {
    const providerMsgs = xmtp.getMessages(conversation.id);
    if (providerMsgs.length > 0) {
      setMessages(providerMsgs.map(xmtpToMessage));
    }
  }, [xmtp.getMessages(conversation.id).length]);

  const getIsFirstInGroup = (index: number): boolean => {
    if (index === 0) return true;
    return messages[index].sender !== messages[index - 1].sender;
  };

  const handleSend = useCallback(
    async (text: string) => {
      try {
        await xmtp.sendMessage(conversation.id, text);
        // Reload messages after send
        const updated = await xmtp.loadMessages(conversation.id);
        setMessages(updated.map(xmtpToMessage));
      } catch (error) {
        console.error('[ChatScreen] Send failed:', error);
      }
    },
    [conversation.id, xmtp],
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex1}
      behavior="padding"
    >
      <View style={[styles.chatHeader, { paddingTop: insets.top + 8 }]}>
        <View style={styles.chatHeaderLeft}>
          <IconButton variant="ghost" size="md" accessibilityLabel="Back" onPress={onBack}>
            <CaretLeft size={20} color={colors.textPrimary} weight="bold" />
          </IconButton>
          <Avatar size="md" />
          <Text style={styles.chatHeaderName} numberOfLines={1}>
            {conversation.name}
          </Text>
        </View>
        <View style={styles.chatHeaderRight}>
          <IconButton
            variant="ghost"
            size="md"
            accessibilityLabel="More options"
            onPress={() => console.log('[ChatScreen] Options')}
          >
            <DotsThreeVertical size={20} color={colors.textSecondary} weight="bold" />
          </IconButton>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.flex1}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {loading ? (
          <View style={styles.emptyMessages}>
            <ActivityIndicator size="small" color={colors.accentBlue} />
            <Text style={styles.emptyMessagesText}>Loading messages...</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyMessages}>
            <Text style={styles.emptyMessagesText}>
              No messages yet. Start a conversation!
            </Text>
          </View>
        ) : (
          messages.map((msg, i) => (
            <MessageBubbleRow
              key={msg.id}
              message={msg}
              isFirstInGroup={getIsFirstInGroup(i)}
            />
          ))
        )}
      </ScrollView>

      <ChatInput
        onSend={handleSend}
        placeholder={`Message ${conversation.name}...`}
      />
    </KeyboardAvoidingView>
  );
};

// ═════════════════════════════════════════════════════════════════════
// Main Component
// ═════════════════════════════════════════════════════════════════════

export const ChatScreen: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const xmtp = useXMTP();
  const drawer = useContext(DrawerContext);
  const navigation = useNavigation();
  const [view, setView] = useState<ChatView>('list');
  const [activeConversation, setActiveConversation] =
    useState<ConversationItem | null>(null);

  // Auto-connect to XMTP when authenticated and native module is available
  useEffect(() => {
    if (isAuthenticated && xmtp.isAvailable && !xmtp.isConnected && !xmtp.isConnecting) {
      xmtp.connect().catch((err) => {
        if (isUserRejectedSignatureError(err)) {
          if (__DEV__) {
            console.warn('[ChatScreen] XMTP auto-connect cancelled by user');
          }
          return;
        }
        console.error('[ChatScreen] XMTP auto-connect failed:', err);
      });
    }
  }, [isAuthenticated, xmtp.isAvailable, xmtp.isConnected, xmtp.isConnecting]);

  // Hide tab bar when in chat detail view
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: view === 'chat' ? { display: 'none' as const } : undefined,
    });
  }, [view, navigation]);

  const handleSelectChat = useCallback((conversation: ConversationItem) => {
    setActiveConversation(conversation);
    setView('chat');
  }, []);

  const handleBack = useCallback(() => {
    setView('list');
    setActiveConversation(null);
    // Refresh conversation list on back
    if (xmtp.isConnected) {
      xmtp.refreshConversations().catch(() => {});
    }
  }, [xmtp.isConnected]);

  if (view === 'chat' && activeConversation) {
    return (
      <View style={styles.container}>
        {activeConversation.isAI ? (
          <AIChatDetail onBack={handleBack} />
        ) : (
          <XMTPChatDetail conversation={activeConversation} onBack={handleBack} />
        )}
      </View>
    );
  }

  // Convert XMTP conversations to display items
  const xmtpConversations = xmtp.conversations.map(xmtpToConversationItem);

  return (
    <View style={styles.container}>
      <MobileHeader
        title="Messages"
        isAuthenticated={isAuthenticated}
        onAvatarPress={drawer.open}
        rightSlot={
          <IconButton
            variant="soft"
            size="md"
            accessibilityLabel="New message"
            onPress={() => console.log('[ChatScreen] New message')}
          >
            <PencilSimple size={18} color={colors.textSecondary} />
          </IconButton>
        }
      />

      <ChatList
        conversations={xmtpConversations}
        isConnecting={xmtp.isConnecting}
        isAvailable={xmtp.isAvailable}
        onSelectChat={handleSelectChat}
      />
    </View>
  );
};

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  flex1: {
    flex: 1,
  },

  // ── List view ─────────────────────────────────────────────────────

  listContent: {
    paddingBottom: 140,
  },

  // ── Connecting / empty states ──────────────────────────────────────

  connectingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  connectingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },

  // ── Chat row ──────────────────────────────────────────────────────

  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  chatRowContent: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  chatRowTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chatRowName: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  chatRowNameUnread: {
    fontWeight: '700',
  },
  chatRowHandle: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    flexShrink: 1,
  },
  chatRowTimestamp: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    flexShrink: 0,
  },
  chatRowTimestampUnread: {
    color: colors.accentBlue,
  },
  chatRowBottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatRowMessage: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    flex: 1,
  },
  chatRowMessageUnread: {
    color: colors.textPrimary,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },

  // ── Chat detail header ────────────────────────────────────────────

  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  chatHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  chatHeaderName: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  chatHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  // ── Messages ──────────────────────────────────────────────────────

  messagesContent: {
    paddingVertical: 16,
  },
  emptyMessages: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyMessagesText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },

  // ── Typing indicator ─────────────────────────────────────────────

  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginLeft: 52, // avatar width + gap
  },
  typingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
  },

  // ── Bubble row ────────────────────────────────────────────────────

  bubbleRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 3,
    gap: 12,
  },
  bubbleRowFirst: {
    marginTop: 16,
  },
  bubbleAvatar: {
    marginTop: 2,
  },
  bubbleAvatarSpacer: {
    width: 40, // matches Avatar md size
  },
  bubbleContent: {
    flex: 1,
    minWidth: 0,
  },
  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 2,
  },
  bubbleSenderName: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  bubbleSenderNameOwn: {
    color: colors.accentBlue,
  },
  bubbleTimestamp: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  bubbleText: {
    fontSize: fontSize.base,
    color: colors.textPrimary,
    lineHeight: 22,
  },

  // ── Input bar ─────────────────────────────────────────────────────

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
    backgroundColor: colors.bgPage,
  },
  inputField: {
    flex: 1,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: radii.full,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    color: colors.textPrimary,
    fontSize: fontSize.base,
  },
});
