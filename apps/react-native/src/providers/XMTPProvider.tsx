import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoCrypto from 'expo-crypto';
import { useAuth } from './AuthProvider';

// ---------------------------------------------------------------------------
// Lazy XMTP SDK import — the native module may not be available (Expo Go,
// dev client without native rebuild). We import lazily so the provider still
// mounts and the rest of the app works; connect() will fail gracefully.
// ---------------------------------------------------------------------------

let XMTPSdk: typeof import('@xmtp/react-native-sdk') | null = null;
let xmtpLoadError: string | null = null;

try {
  XMTPSdk = require('@xmtp/react-native-sdk');
} catch (e: any) {
  xmtpLoadError = e?.message ?? 'XMTP native module not available';
  console.warn('[XMTPProvider] Native module not available:', xmtpLoadError);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_KEY_STORAGE = 'heaven:xmtp:dbKey';
const READ_STATE_KEY = 'heaven:xmtp:lastRead';
const XMTP_ENV = 'production' as const;
const CONNECT_RETRY_COOLDOWN_MS = 30_000;
const USER_REJECTED_RETRY_COOLDOWN_MS = 5 * 60_000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface XMTPMessage {
  id: string;
  content: string;
  sender: 'user' | 'other';
  timestamp: Date;
  optimistic?: boolean;
}

export interface ChatListItem {
  id: string;
  peerInboxId: string;
  peerAddress: string;
  name: string;
  lastMessage?: string;
  timestamp?: Date;
  hasUnread?: boolean;
}

interface XMTPContextValue {
  /** Whether the native XMTP module is available at all */
  isAvailable: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  inboxId: string | null;
  conversations: ChatListItem[];
  refreshConversations: () => Promise<void>;
  getOrCreateDm: (peerAddress: string) => Promise<any>;
  getMessages: (conversationId: string) => XMTPMessage[];
  sendMessage: (conversationId: string, content: string) => Promise<void>;
  loadMessages: (conversationId: string) => Promise<XMTPMessage[]>;
  getDisappearingTimer: (
    conversationId: string,
  ) => Promise<{ disappearStartingAtMs: number; retentionSeconds: number } | null>;
  setDisappearingTimer: (
    conversationId: string,
    seconds: number,
  ) => Promise<{ disappearStartingAtMs: number; retentionSeconds: number } | null>;
  markRead: (conversationId: string) => void;
}

const XMTPContext = createContext<XMTPContextValue | null>(null);

// ---------------------------------------------------------------------------
// Read state helpers (AsyncStorage-backed)
// ---------------------------------------------------------------------------

async function loadReadState(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(READ_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveReadState(state: Record<string, number>) {
  try {
    await AsyncStorage.setItem(READ_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

async function persistMarkRead(key: string): Promise<number> {
  const state = await loadReadState();
  const now = Date.now();
  state[key] = now;
  await saveReadState(state);
  return now;
}

// ---------------------------------------------------------------------------
// DB encryption key management
// ---------------------------------------------------------------------------

async function getOrCreateDbKey(): Promise<Uint8Array> {
  const stored = await AsyncStorage.getItem(DB_KEY_STORAGE);
  if (stored) {
    const arr = stored.split(',').map(Number);
    return new Uint8Array(arr);
  }

  const key = ExpoCrypto.getRandomBytes(32);
  await AsyncStorage.setItem(DB_KEY_STORAGE, Array.from(key).join(','));
  return key;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAddress(address: string): string {
  if (!address.startsWith('0x')) {
    return address.length > 20
      ? `${address.slice(0, 8)}...${address.slice(-4)}`
      : address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function toLocalMessage(msg: any, myInboxId: string): XMTPMessage {
  const content = typeof msg.content() === 'string'
    ? (msg.content() as string)
    : String(msg.content());
  return {
    id: msg.id,
    content,
    sender: msg.senderInboxId === myInboxId ? 'user' : 'other',
    timestamp: new Date(Number(msg.sentNs) / 1_000_000),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  const record = asRecord(error);
  if (!record) return String(error);
  if (typeof record.message === 'string') return record.message;
  if (typeof record.reason === 'string') return record.reason;
  if (typeof record.error === 'string') return record.error;

  return String(error);
}

function getErrorCode(error: unknown): string | number | null {
  const record = asRecord(error);
  if (!record) return null;
  if (typeof record.code === 'string' || typeof record.code === 'number') {
    return record.code;
  }

  const nested = asRecord(record.cause) ?? asRecord(record.error);
  if (!nested) return null;
  if (typeof nested.code === 'string' || typeof nested.code === 'number') {
    return nested.code;
  }

  return null;
}

function isUserRejectedSignatureError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  if (
    /user rejected|rejected signature|signature rejected|action rejected|request rejected|user denied|cancelled|canceled/.test(
      message,
    )
  ) {
    return true;
  }

  const code = getErrorCode(error);
  if (code === 4001 || code === '4001' || code === 'ACTION_REJECTED') {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const XMTPProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const auth = useAuth();
  const isAvailable = XMTPSdk !== null;
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [myInboxId, setMyInboxId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ChatListItem[]>([]);
  const [messagesMap, setMessagesMap] = useState<Record<string, XMTPMessage[]>>(
    {},
  );

  // Use `any` for client ref since the SDK may not be loaded
  const clientRef = useRef<any>(null);
  const globalStreamCleanupRef = useRef<(() => void) | null>(null);
  const lastConnectFailureAtRef = useRef(0);
  const lastConnectFailureAddressRef = useRef<string | null>(null);
  const lastConnectFailureCooldownMsRef = useRef(0);

  // Auto-disconnect when auth logs out
  useEffect(() => {
    if (!auth.isAuthenticated && isConnected) {
      disconnect();
    }
  }, [auth.isAuthenticated, isConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      globalStreamCleanupRef.current?.();
      globalStreamCleanupRef.current = null;
    };
  }, []);

  // ── Connect ──────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (!XMTPSdk) {
      console.warn('[XMTPProvider] Cannot connect — native module not available');
      return;
    }

    const ethAddress = auth.pkpInfo?.ethAddress;
    if (!ethAddress) {
      throw new Error('Not authenticated — please sign in first');
    }
    const normalizedAddress = ethAddress.toLowerCase();
    if (isConnected || isConnecting) return;

    const msSinceFailure = Date.now() - lastConnectFailureAtRef.current;
    if (
      lastConnectFailureAddressRef.current === normalizedAddress &&
      lastConnectFailureAtRef.current > 0 &&
      msSinceFailure < lastConnectFailureCooldownMsRef.current
    ) {
      if (__DEV__) {
        const remainingSeconds = Math.ceil(
          (lastConnectFailureCooldownMsRef.current - msSinceFailure) / 1000,
        );
        console.warn(
          `[XMTPProvider] Skipping reconnect for ${remainingSeconds}s after previous failure`,
        );
      }
      return;
    }

    setIsConnecting(true);
    try {
      const dbEncryptionKey = await getOrCreateDbKey();
      const { Client, PublicIdentity } = XMTPSdk;

      const signer = {
        getIdentifier: async () =>
          new PublicIdentity(ethAddress, 'ETHEREUM'),
        getChainId: () => undefined,
        getBlockNumber: () => undefined,
        signerType: () => 'EOA' as const,
        signMessage: async (message: string) => {
          const signature = await auth.signMessage(message);
          return { signature };
        },
      };

      const client = await Client.create(signer, {
        env: XMTP_ENV,
        dbEncryptionKey,
      });

      clientRef.current = client;
      setMyInboxId(client.inboxId);
      setIsConnected(true);
      lastConnectFailureAtRef.current = 0;
      lastConnectFailureAddressRef.current = null;
      lastConnectFailureCooldownMsRef.current = 0;

      await client.conversations.sync();
      await refreshConversationsInner(client);
      startGlobalStream(client);
    } catch (error) {
      const isUserRejected = isUserRejectedSignatureError(error);
      lastConnectFailureAtRef.current = Date.now();
      lastConnectFailureAddressRef.current = normalizedAddress;
      lastConnectFailureCooldownMsRef.current = isUserRejected
        ? USER_REJECTED_RETRY_COOLDOWN_MS
        : CONNECT_RETRY_COOLDOWN_MS;

      if (isUserRejected) {
        console.warn(
          '[XMTPProvider] Connect signature was rejected by user; backing off auto-retry',
        );
      } else {
        console.error('[XMTPProvider] Failed to connect:', error);
      }
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [auth.pkpInfo?.ethAddress, auth.signMessage, isConnected, isConnecting]);

  // ── Disconnect ───────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    globalStreamCleanupRef.current?.();
    globalStreamCleanupRef.current = null;

    clientRef.current = null;
    setIsConnected(false);
    setMyInboxId(null);
    setConversations([]);
    setMessagesMap({});
    lastConnectFailureAtRef.current = 0;
    lastConnectFailureAddressRef.current = null;
    lastConnectFailureCooldownMsRef.current = 0;
  }, []);

  // ── Global stream (drives unread indicators) ─────────────────────────

  const startGlobalStream = useCallback((client: any) => {
    globalStreamCleanupRef.current?.();

    client.conversations
      .streamAllMessages(async (msg: any) => {
        const inbox = client.inboxId;
        if (!inbox) return;
        if (msg.senderInboxId === inbox) return;

        const content =
          typeof msg.content() === 'string'
            ? (msg.content() as string)
            : String(msg.content());
        const sentAt = new Date(Number(msg.sentNs) / 1_000_000);

        setConversations((prev) =>
          prev
            .map((c) => {
              if (c.id !== msg.topic) return c;
              return { ...c, lastMessage: content, timestamp: sentAt, hasUnread: true };
            })
            .sort((a, b) => {
              if (!a.timestamp && !b.timestamp) return 0;
              if (!a.timestamp) return 1;
              if (!b.timestamp) return -1;
              return b.timestamp.getTime() - a.timestamp.getTime();
            }),
        );
      })
      .catch((error: any) => {
        console.error('[XMTPProvider] Global stream error:', error);
      });

    globalStreamCleanupRef.current = () => {
      client.conversations.cancelStreamAllMessages();
    };
  }, []);

  // ── Conversations ────────────────────────────────────────────────────

  const refreshConversationsInner = useCallback(async (client: any) => {
    const dms = await client.conversations.listDms();
    const inbox = client.inboxId;
    const readState = await loadReadState();

    const items: ChatListItem[] = await Promise.all(
      dms.map(async (dm: any) => {
        const peerInbox = await dm.peerInboxId();
        const lastMsg = dm.lastMessage;
        const lastContent = lastMsg
          ? typeof lastMsg.content() === 'string'
            ? (lastMsg.content() as string)
            : String(lastMsg.content())
          : undefined;
        const lastTimestamp = lastMsg
          ? new Date(Number(lastMsg.sentNs) / 1_000_000)
          : undefined;
        const isFromPeer = lastMsg ? lastMsg.senderInboxId !== inbox : false;
        const lastReadAt = readState[dm.id] ?? 0;
        const hasUnread =
          isFromPeer && lastTimestamp
            ? lastTimestamp.getTime() > lastReadAt
            : false;

        return {
          id: dm.id,
          peerInboxId: peerInbox,
          peerAddress: peerInbox,
          name: formatAddress(peerInbox),
          lastMessage: lastContent,
          timestamp: lastTimestamp,
          hasUnread,
        };
      }),
    );

    items.sort((a, b) => {
      if (!a.timestamp && !b.timestamp) return 0;
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    setConversations(items);
  }, []);

  const refreshConversations = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    await client.conversations.sync();
    await refreshConversationsInner(client);
  }, [refreshConversationsInner]);

  // ── Get or create DM ─────────────────────────────────────────────────

  const getOrCreateDm = useCallback(async (peerAddress: string): Promise<any> => {
    const client = clientRef.current;
    if (!client || !XMTPSdk) throw new Error('Not connected');

    const peerIdentity = new XMTPSdk.PublicIdentity(peerAddress, 'ETHEREUM');
    return client.conversations.findOrCreateDmWithIdentity(peerIdentity);
  }, []);

  // ── Messages ─────────────────────────────────────────────────────────

  const getMessages = useCallback(
    (conversationId: string): XMTPMessage[] => {
      return messagesMap[conversationId] || [];
    },
    [messagesMap],
  );

  const loadMessages = useCallback(
    async (conversationId: string): Promise<XMTPMessage[]> => {
      const client = clientRef.current;
      if (!client) throw new Error('Not connected');

      const conv = await client.conversations.findConversation(conversationId);
      if (!conv) throw new Error('Conversation not found');

      await conv.sync();
      const msgs = await conv.messages({ limit: 100 });
      const inbox = client.inboxId;
      const localMsgs = msgs
        .map((m: any) => toLocalMessage(m, inbox))
        .reverse();

      setMessagesMap((prev) => ({ ...prev, [conversationId]: localMsgs }));
      return localMsgs;
    },
    [],
  );

  const sendMessage = useCallback(
    async (conversationId: string, content: string) => {
      const client = clientRef.current;
      if (!client) throw new Error('Not connected');

      const conv = await client.conversations.findConversation(conversationId);
      if (!conv) throw new Error('Conversation not found');

      const optimisticMsg: XMTPMessage = {
        id: `optimistic-${Date.now()}`,
        content,
        sender: 'user',
        timestamp: new Date(),
        optimistic: true,
      };

      setMessagesMap((prev) => ({
        ...prev,
        [conversationId]: [...(prev[conversationId] || []), optimisticMsg],
      }));

      try {
        await conv.send(content);

        setConversations((prev) => {
          const now = new Date();
          const updated = prev.map((c) =>
            c.id === conversationId
              ? { ...c, lastMessage: content, timestamp: now }
              : c,
          );
          return updated.sort((a, b) => {
            if (!a.timestamp && !b.timestamp) return 0;
            if (!a.timestamp) return 1;
            if (!b.timestamp) return -1;
            return b.timestamp.getTime() - a.timestamp.getTime();
          });
        });
      } catch (error) {
        setMessagesMap((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] || []).filter(
            (m) => m.id !== optimisticMsg.id,
          ),
        }));
        throw error;
      }
    },
    [],
  );

  // ── Mark read ────────────────────────────────────────────────────────

  const markReadFn = useCallback((conversationId: string) => {
    persistMarkRead(conversationId);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, hasUnread: false } : c,
      ),
    );
  }, []);

  // ── Disappearing messages (native / libxmtp) ─────────────────────────

  const getDisappearingTimer = useCallback(
    async (
      conversationId: string,
    ): Promise<{ disappearStartingAtMs: number; retentionSeconds: number } | null> => {
      const client = clientRef.current;
      if (!client) throw new Error('Not connected');

      const conv = await client.conversations.findConversation(conversationId);
      if (!conv) throw new Error('Conversation not found');

      const settings = await conv.disappearingMessageSettings();
      if (!settings) return null;

      const disappearStartingAtMs = Math.floor(settings.disappearStartingAtNs / 1_000_000);
      const retentionSeconds = Math.max(
        0,
        Math.round(settings.retentionDurationInNs / 1_000_000_000),
      );

      if (!Number.isFinite(disappearStartingAtMs) || !Number.isFinite(retentionSeconds)) {
        return null;
      }

      return { disappearStartingAtMs, retentionSeconds };
    },
    [],
  );

  const setDisappearingTimer = useCallback(
    async (
      conversationId: string,
      seconds: number,
    ): Promise<{ disappearStartingAtMs: number; retentionSeconds: number } | null> => {
      const client = clientRef.current;
      if (!client || !XMTPSdk) throw new Error('Not connected');

      const conv = await client.conversations.findConversation(conversationId);
      if (!conv) throw new Error('Conversation not found');

      const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;

      if (safeSeconds <= 0) {
        await conv.clearDisappearingMessageSettings();
        return null;
      }

      const disappearStartingAtMs = Date.now();
      const startAtNs = disappearStartingAtMs * 1_000_000;
      const durationInNs = safeSeconds * 1_000_000_000;

      const settings = new XMTPSdk.DisappearingMessageSettings(startAtNs, durationInNs);
      await conv.updateDisappearingMessageSettings(settings);

      return { disappearStartingAtMs, retentionSeconds: safeSeconds };
    },
    [],
  );

  // ── Context value ────────────────────────────────────────────────────

  const value: XMTPContextValue = {
    isAvailable,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    inboxId: myInboxId,
    conversations,
    refreshConversations,
    getOrCreateDm,
    getMessages,
    sendMessage,
    loadMessages,
    getDisappearingTimer,
    setDisappearingTimer,
    markRead: markReadFn,
  };

  return (
    <XMTPContext.Provider value={value}>{children}</XMTPContext.Provider>
  );
};

export function useXMTP(): XMTPContextValue {
  const ctx = useContext(XMTPContext);
  if (!ctx) {
    throw new Error('useXMTP must be used within XMTPProvider');
  }
  return ctx;
}
