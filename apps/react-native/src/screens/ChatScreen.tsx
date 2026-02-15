import React, { useState, useCallback, useRef, useContext, useEffect } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  View,
} from 'react-native';
import {
  CaretLeft,
  DotsThreeVertical,
  PaperPlaneTilt,
  PencilSimple,
} from 'phosphor-react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MobileHeader } from '../components/MobileHeader';
import { Avatar } from '../ui/Avatar';
import { IconButton } from '../ui/IconButton';
import { BottomSheet } from '../ui/BottomSheet';
import { OptionPicker } from '../ui/OptionPicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../providers/AuthProvider';
import { useXMTP, type XMTPMessage, type ChatListItem } from '../providers/XMTPProvider';
import { DrawerContext } from '../navigation/DrawerContext';
import { getWorkerToken } from '../lib/worker-auth';
import { colors, fontSize, radii } from '../lib/theme';

const CHAT_WORKER_URL = 'https://neodate-voice.deletion-backup782.workers.dev';
const CHAT_STORAGE_KEY = 'heaven:ai-chat-scarlett';
const CHAT_DISAPPEARING_KEY_PREFIX = 'heaven:chat-disappearing-seconds:';

const CHAT_DISAPPEARING_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 15, label: '15 seconds' },
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 3600, label: '1 hour' },
];

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
  createdAt?: number;
}

const THINK_OPEN_TAG = '<think>';
const THINK_CLOSE_TAG = '</think>';

function stripThinkSections(input: string): string {
  const lower = input.toLowerCase();
  let output = '';
  let cursor = 0;

  while (true) {
    const start = lower.indexOf(THINK_OPEN_TAG, cursor);
    if (start === -1) {
      output += input.slice(cursor);
      break;
    }

    output += input.slice(cursor, start);
    const bodyStart = start + THINK_OPEN_TAG.length;
    const end = lower.indexOf(THINK_CLOSE_TAG, bodyStart);
    if (end === -1) {
      break;
    }
    cursor = end + THINK_CLOSE_TAG.length;
  }

  return output;
}

function sanitizeAssistantMessage(raw: unknown): string {
  const base = typeof raw === 'string' ? raw : '';
  const stripped = stripThinkSections(base);
  const cleaned = stripped.replace(/<\/?think>/gi, '').trim();
  return cleaned || "Sorry, I couldn't generate a response.";
}

function formatDisappearingLabel(seconds: number): string {
  if (seconds <= 0) return 'Off';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

function formatDisappearingMenuValue(seconds: number): string {
  const match = CHAT_DISAPPEARING_OPTIONS.find((opt) => opt.value === seconds);
  return match ? match.label : formatDisappearingLabel(seconds);
}

function parseSavedMessages(raw: string): Message[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((row: unknown, index: number) => {
        if (!row || typeof row !== 'object') return null;
        const item = row as Partial<Message> & {
          id?: unknown;
          sender?: unknown;
          content?: unknown;
          time?: unknown;
        };

        return {
          id: String(item.id ?? `saved-${index}`),
          sender: item.sender === 'me' ? 'me' : 'them',
          senderName:
            typeof item.senderName === 'string' && item.senderName.length > 0
              ? item.senderName
              : undefined,
          content: typeof item.content === 'string' ? item.content : String(item.content ?? ''),
          time:
            typeof item.time === 'string'
              ? item.time
              : formatMessageTime(new Date()),
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : undefined,
        };
      })
      .filter((msg): msg is Message => Boolean(msg));
  } catch {
    return [];
  }
}

function pruneByDisappearingWindow(
  messages: Message[],
  seconds: number,
  disappearStartingAtMs?: number | null,
): Message[] {
  if (seconds <= 0) return messages;
  const cutoffMs = Date.now() - seconds * 1000;
  const startAtMs =
    typeof disappearStartingAtMs === 'number' && disappearStartingAtMs > 0
      ? disappearStartingAtMs
      : 0;

  let pruned = false;
  const next = messages.filter((msg) => {
    if (typeof msg.createdAt !== 'number') return true;
    // XMTP semantics: only messages sent after the policy start can expire.
    if (startAtMs > 0 && msg.createdAt < startAtMs) return true;

    const keep = msg.createdAt >= cutoffMs;
    if (!keep) pruned = true;
    return keep;
  });
  return pruned ? next : messages;
}

function formatWalletSummary(address?: string): string {
  if (!address) return 'Unavailable';
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function shareWalletAddress(address: string): Promise<boolean> {
  try {
    await Share.share({
      message: address,
      title: 'Wallet Address',
    });
    return true;
  } catch {
    return false;
  }
}

interface ChatMenuProps {
  open: boolean;
  onClose: () => void;
  onOpenDisappearingPicker: () => void;
  onCopyWallet: () => void;
  walletAddress?: string;
  disappearingSeconds: number;
}

const ChatMenu: React.FC<ChatMenuProps> = ({
  open,
  onClose,
  onOpenDisappearingPicker,
  onCopyWallet,
  walletAddress,
  disappearingSeconds,
}) => {
  const canCopy = Boolean(walletAddress);
  const copyLabel = formatWalletSummary(walletAddress);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={styles.chatMenuTitle}>Chat options</Text>

      <TouchableOpacity
        style={styles.chatMenuItem}
        activeOpacity={0.7}
        onPress={() => {
          onClose();
          onCopyWallet();
        }}
        disabled={!canCopy}
      >
        <Text style={styles.chatMenuItemLabel}>Copy wallet address</Text>
        <Text style={styles.chatMenuItemValue}>{copyLabel}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.chatMenuItem}
        activeOpacity={0.7}
        onPress={() => {
          onClose();
          onOpenDisappearingPicker();
        }}
      >
        <Text style={styles.chatMenuItemLabel}>Disappearing message timer</Text>
        <Text style={styles.chatMenuItemValue}>
          {formatDisappearingMenuValue(disappearingSeconds)}
        </Text>
      </TouchableOpacity>
    </BottomSheet>
  );
};

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
    createdAt: msg.timestamp.getTime(),
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
  const [disappearingSeconds, setDisappearingSeconds] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [disappearingPickerOpen, setDisappearingPickerOpen] = useState(false);

  // Load persisted settings/messages
  useEffect(() => {
    (async () => {
      const storageKey = `${CHAT_DISAPPEARING_KEY_PREFIX}${SCARLETT_CONVERSATION.id}`;
      const storedSetting = await AsyncStorage.getItem(storageKey);
      const nextSeconds = storedSetting ? Number(storedSetting) : 0;
      const safeSeconds = Number.isFinite(nextSeconds) && nextSeconds >= 0 ? nextSeconds : 0;

      setDisappearingSeconds(safeSeconds);

      const stored = await AsyncStorage.getItem(CHAT_STORAGE_KEY);
      const saved = stored ? parseSavedMessages(stored) : [];
      setMessages(pruneByDisappearingWindow(saved, safeSeconds));
    })();
  }, []);

  // Persist messages when they change
  useEffect(() => {
    AsyncStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)).catch(() => {});
  }, [messages]);

  useEffect(() => {
    const storageKey = `${CHAT_DISAPPEARING_KEY_PREFIX}${SCARLETT_CONVERSATION.id}`;
    AsyncStorage.setItem(storageKey, String(disappearingSeconds)).catch(() => {});
  }, [disappearingSeconds]);

  useEffect(() => {
    setMessages((prev) => pruneByDisappearingWindow(prev, disappearingSeconds));
  }, [disappearingSeconds]);

  useEffect(() => {
    if (disappearingSeconds <= 0) return;
    const id = setInterval(() => {
      setMessages((prev) => pruneByDisappearingWindow(prev, disappearingSeconds));
    }, 1000);
    return () => clearInterval(id);
  }, [disappearingSeconds]);

  // All display messages: intro + persisted
  const allMessages: Message[] = [
    ...SCARLETT_MESSAGES,
    ...messages,
  ];

  const handleCopyWallet = useCallback(async () => {
    if (!pkpInfo?.ethAddress) {
      Alert.alert('Wallet address', 'Sign in to connect a wallet first.');
      return;
    }

    const copied = await shareWalletAddress(pkpInfo.ethAddress);
    if (!copied) {
      Alert.alert('Wallet address', pkpInfo.ethAddress);
    } else {
      Alert.alert('Copied', 'Wallet address is ready to share or copy.');
    }
  }, [pkpInfo?.ethAddress]);

  const getIsFirstInGroup = (index: number): boolean => {
    if (index === 0) return true;
    return allMessages[index].sender !== allMessages[index - 1].sender;
  };

  const handleSend = useCallback(async (text: string) => {
    const now = Date.now();
    const nowLabel = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const userMsg: Message = {
      id: `user-${now}`,
      sender: 'me',
      content: text,
      createdAt: now,
      time: nowLabel,
    };
    setMessages((prev) => pruneByDisappearingWindow([...prev, userMsg], disappearingSeconds));

    if (!pkpInfo?.ethAddress) {
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        sender: 'them',
        senderName: 'Scarlett',
        content: 'Please sign in to chat with me!',
        createdAt: now,
        time: nowLabel,
      };
      setMessages((prev) => pruneByDisappearingWindow([...prev, errorMsg], disappearingSeconds));
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
        content: sanitizeAssistantMessage(data.message),
        createdAt: Date.now(),
        time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      };
      setMessages((prev) => pruneByDisappearingWindow([...prev, assistantMsg], disappearingSeconds));
    } catch (error) {
      console.error('[ChatScreen] AI send failed:', error);
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        sender: 'them',
        senderName: 'Scarlett',
        content: 'Sorry, something went wrong. Please try again.',
        createdAt: Date.now(),
        time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      };
      setMessages((prev) => pruneByDisappearingWindow([...prev, errorMsg], disappearingSeconds));
    } finally {
      setIsSending(false);
    }
  }, [disappearingSeconds, pkpInfo, signMessage]);

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
          {disappearingSeconds > 0 && (
            <View style={styles.disappearingChip}>
              <Text style={styles.disappearingChipText}>
                {formatDisappearingLabel(disappearingSeconds)}
              </Text>
            </View>
          )}
          <IconButton
            variant="ghost"
            size="md"
            accessibilityLabel="More options"
            onPress={() => setMenuOpen(true)}
          >
            <DotsThreeVertical size={20} color={colors.textSecondary} weight="bold" />
          </IconButton>
        </View>
      </View>

      <ChatMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenDisappearingPicker={() => {
          setMenuOpen(false);
          setDisappearingPickerOpen(true);
        }}
        onCopyWallet={handleCopyWallet}
        walletAddress={pkpInfo?.ethAddress}
        disappearingSeconds={disappearingSeconds}
      />

      <OptionPicker
        open={disappearingPickerOpen}
        onClose={() => setDisappearingPickerOpen(false)}
        title="Disappearing messages"
        options={CHAT_DISAPPEARING_OPTIONS}
        selected={disappearingSeconds}
        onSelect={(seconds) => setDisappearingSeconds(seconds)}
        allowClear={false}
      />

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
  const [disappearingSeconds, setDisappearingSeconds] = useState(0);
  const [disappearingStartAtMs, setDisappearingStartAtMs] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [disappearingPickerOpen, setDisappearingPickerOpen] = useState(false);

  // Load messages on mount
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const xmtpMsgs = await xmtp.loadMessages(conversation.id);
        const timer = await xmtp.getDisappearingTimer(conversation.id).catch((error) => {
          console.error('[ChatScreen] Failed to load XMTP disappearing timer:', error);
          return null;
        });
        const nextSeconds = timer?.retentionSeconds ?? 0;
        const nextStartAtMs = timer?.disappearStartingAtMs ?? null;
        if (mounted) {
          setDisappearingSeconds(nextSeconds);
          setDisappearingStartAtMs(nextStartAtMs);
          setMessages(
            pruneByDisappearingWindow(
              xmtpMsgs.map(xmtpToMessage),
              nextSeconds,
              nextStartAtMs,
            ),
          );
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

  useEffect(() => {
    setMessages((prev) =>
      pruneByDisappearingWindow(prev, disappearingSeconds, disappearingStartAtMs),
    );
  }, [disappearingSeconds, disappearingStartAtMs, conversation.id]);

  useEffect(() => {
    if (disappearingSeconds <= 0) return;
    const id = setInterval(() => {
      setMessages((prev) =>
        pruneByDisappearingWindow(prev, disappearingSeconds, disappearingStartAtMs),
      );
    }, 1000);
    return () => clearInterval(id);
  }, [disappearingSeconds, disappearingStartAtMs]);

  // Sync messages from provider state
  useEffect(() => {
    const providerMsgs = xmtp.getMessages(conversation.id);
    if (providerMsgs.length > 0) {
      setMessages(
        pruneByDisappearingWindow(
          providerMsgs.map(xmtpToMessage),
          disappearingSeconds,
          disappearingStartAtMs,
        ),
      );
    }
  }, [
    xmtp.getMessages(conversation.id).length,
    conversation.id,
    disappearingSeconds,
    disappearingStartAtMs,
  ]);

  const handleCopyWallet = useCallback(async () => {
    if (!conversation.peerAddress) {
      Alert.alert('Wallet address', 'No wallet address is available for this conversation.');
      return;
    }

    const copied = await shareWalletAddress(conversation.peerAddress);
    if (!copied) {
      Alert.alert('Wallet address', conversation.peerAddress);
    } else {
      Alert.alert('Copied', 'Wallet address is ready to share or copy.');
    }
  }, [conversation.peerAddress]);

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
        setMessages(
          pruneByDisappearingWindow(
            updated.map(xmtpToMessage),
            disappearingSeconds,
            disappearingStartAtMs,
          ),
        );
      } catch (error) {
        console.error('[ChatScreen] Send failed:', error);
      }
    },
    [conversation.id, disappearingSeconds, disappearingStartAtMs, xmtp],
  );

  const handleSelectDisappearingTimer = useCallback(
    async (seconds: number) => {
      try {
        const timer = await xmtp.setDisappearingTimer(conversation.id, seconds);
        const nextSeconds = timer?.retentionSeconds ?? 0;
        const nextStartAtMs = timer?.disappearStartingAtMs ?? null;

        setDisappearingSeconds(nextSeconds);
        setDisappearingStartAtMs(nextStartAtMs);

        const updated = await xmtp.loadMessages(conversation.id);
        setMessages(
          pruneByDisappearingWindow(
            updated.map(xmtpToMessage),
            nextSeconds,
            nextStartAtMs,
          ),
        );
      } catch (error) {
        console.error('[ChatScreen] Failed to update disappearing timer:', error);
        Alert.alert(
          'Disappearing messages',
          'Failed to update disappearing message timer. Please try again.',
        );
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
          {disappearingSeconds > 0 && (
            <View style={styles.disappearingChip}>
              <Text style={styles.disappearingChipText}>
                {formatDisappearingLabel(disappearingSeconds)}
              </Text>
            </View>
          )}
          <IconButton
            variant="ghost"
            size="md"
            accessibilityLabel="More options"
            onPress={() => setMenuOpen(true)}
          >
            <DotsThreeVertical size={20} color={colors.textSecondary} weight="bold" />
          </IconButton>
        </View>
      </View>

      <ChatMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenDisappearingPicker={() => {
          setMenuOpen(false);
          setDisappearingPickerOpen(true);
        }}
        onCopyWallet={handleCopyWallet}
        walletAddress={conversation.peerAddress}
        disappearingSeconds={disappearingSeconds}
      />

      <OptionPicker
        open={disappearingPickerOpen}
        onClose={() => setDisappearingPickerOpen(false)}
        title="Disappearing messages"
        options={CHAT_DISAPPEARING_OPTIONS}
        selected={disappearingSeconds}
        onSelect={handleSelectDisappearingTimer}
        allowClear={false}
      />

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
            <PencilSimple size={20} color={colors.textSecondary} />
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
  disappearingChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.full,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  disappearingChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  chatMenuTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  chatMenuItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  chatMenuItemLabel: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  chatMenuItemValue: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
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
