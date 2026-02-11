/**
 * Free Room Voice Hook (React Native)
 *
 * React Native hook for free voice rooms with credit metering.
 * Uses react-native-agora SDK (native Android/iOS bindings).
 *
 * NOTE: Agora is loaded lazily via require() so the app doesn't crash
 * if the native module hasn't been linked yet (needs `npx expo run:android`).
 */

import { useEffect, useRef, useState, useCallback } from 'react';

const IS_DEV = __DEV__;

// Agora App ID from env
const AGORA_APP_ID = process.env.EXPO_PUBLIC_AGORA_APP_ID || '3b76c4beb78044ac99e73ffb928c3afc';

const SESSION_VOICE_URL = process.env.EXPO_PUBLIC_SESSION_VOICE_URL || 'https://session-voice.deletion-backup782.workers.dev';

// Speaking detection constants
const SPEAK_THRESHOLD = 8;
const SPEAK_HOLD_MS = 2500;
const PRUNE_INTERVAL_MS = 300;

// =============================================================================
// Types
// =============================================================================

export interface PKPInfo {
  tokenId: string;
  publicKey: string;
  ethAddress: string;
}

export type VoiceState = 'idle' | 'connecting' | 'connected' | 'error';
export type RoomVisibility = 'open' | 'private';

export interface CreateRoomOptions {
  visibility?: RoomVisibility;
  ai_enabled?: boolean;
}

export interface UseFreeRoomVoiceOptions {
  pkpInfo: PKPInfo;
  signMessage: (message: string) => Promise<string>;
  onPeerJoined?: (uid: number) => void;
  onPeerLeft?: (uid: number) => void;
  onCreditsLow?: (remaining: number) => void;
  onCreditsExhausted?: () => void;
  onError?: (error: Error) => void;
}

interface JoinRoomResponse {
  room_id: string;
  channel: string;
  connection_id: string;
  agora_uid: number;
  host_wallet: string;
  is_host: boolean;
  agora_token: string;
  token_expires_in_seconds: number;
  renew_after_seconds: number | null;
  heartbeat_interval_seconds: number | null;
  remaining_seconds: number;
}

interface HeartbeatResponse {
  ok: boolean;
  remaining_seconds: number;
  events: RoomEvent[];
}

interface RenewResponse {
  agora_token?: string;
  token_expires_in_seconds?: number;
  remaining_seconds: number;
  events?: RoomEvent[];
  denied?: boolean;
  reason?: string;
}

interface RoomEvent {
  type: 'credits_low' | 'credits_exhausted';
  wallet: string;
  remaining_seconds: number;
  at_epoch: number;
}

// =============================================================================
// Lazy Agora loader — returns null if native module isn't linked
// =============================================================================

let _agoraModule: any = undefined; // undefined = not tried, null = failed

function getAgora() {
  if (_agoraModule === undefined) {
    try {
      _agoraModule = require('react-native-agora');
    } catch (e) {
      console.warn('[FreeRoom] react-native-agora not available (need native rebuild):', e);
      _agoraModule = null;
    }
  }
  return _agoraModule;
}

// =============================================================================
// API helpers
// =============================================================================

async function getWorkerToken(
  wallet: string,
  signMessage: (msg: string) => Promise<string>,
): Promise<string> {
  const w = wallet.toLowerCase();

  // 1. Get nonce (POST with wallet in body)
  const nonceRes = await fetch(`${SESSION_VOICE_URL}/auth/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet: w }),
  });
  if (!nonceRes.ok) {
    const err = await nonceRes.json().catch(() => ({})) as { error?: string };
    throw new Error(`Failed to get nonce: ${err.error || nonceRes.statusText}`);
  }
  const { nonce } = await nonceRes.json() as { nonce: string };

  // 2. Sign the raw nonce
  const signature = await signMessage(nonce);

  // 3. Verify signature and get JWT
  const verifyRes = await fetch(`${SESSION_VOICE_URL}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet: w, signature, nonce }),
  });
  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({})) as { error?: string };
    throw new Error(`Auth verification failed: ${err.error || verifyRes.statusText}`);
  }
  const { token } = await verifyRes.json() as { token: string };
  return token;
}

async function authedFetch(
  path: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${SESSION_VOICE_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body && { body: JSON.stringify(body) }),
  });
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    const errorData = data as { error?: string };
    throw new Error(errorData.error || `HTTP ${res.status}`);
  }
  return data as T;
}

// =============================================================================
// Hook
// =============================================================================

export function useFreeRoomVoice(options: UseFreeRoomVoiceOptions) {
  const [state, setState] = useState<VoiceState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [participantCount, setParticipantCount] = useState(0);
  const [speakingUids, setSpeakingUids] = useState<number[]>([]);
  const [isSelfSpeaking, setIsSelfSpeaking] = useState(false);

  const engineRef = useRef<any>(null);
  const connectionIdRef = useRef<string | null>(null);
  const authTokenRef = useRef<string | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const renewIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pruneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selfSpeakingUntilRef = useRef(0);
  const peerSpeakingUntilRef = useRef(new Map<number, number>());

  // Handle events from heartbeat/renew
  const handleEvents = useCallback((events?: RoomEvent[]) => {
    if (!events) return;
    for (const event of events) {
      if (event.type === 'credits_low') {
        if (IS_DEV) console.log('[FreeRoom] Credits low:', event.remaining_seconds, 's');
        options.onCreditsLow?.(event.remaining_seconds);
      } else if (event.type === 'credits_exhausted') {
        if (IS_DEV) console.log('[FreeRoom] Credits exhausted');
        options.onCreditsExhausted?.();
      }
    }
  }, [options]);

  const clearAllIntervals = useCallback(() => {
    if (durationIntervalRef.current) { clearInterval(durationIntervalRef.current); durationIntervalRef.current = null; }
    if (heartbeatIntervalRef.current) { clearInterval(heartbeatIntervalRef.current); heartbeatIntervalRef.current = null; }
    if (renewIntervalRef.current) { clearInterval(renewIntervalRef.current); renewIntervalRef.current = null; }
    if (pruneIntervalRef.current) { clearInterval(pruneIntervalRef.current); pruneIntervalRef.current = null; }
  }, []);

  // Start heartbeat + renewal intervals
  const startIntervals = useCallback((heartbeatSec: number, renewSec: number) => {
    // Heartbeat
    heartbeatIntervalRef.current = setInterval(async () => {
      const rid = roomIdRef.current;
      if (!rid || !connectionIdRef.current || !authTokenRef.current) return;
      try {
        const res = await authedFetch('/rooms/heartbeat', authTokenRef.current, {
          room_id: rid,
          connection_id: connectionIdRef.current,
        });
        const result = await handleResponse<HeartbeatResponse>(res);
        setRemainingSeconds(result.remaining_seconds);
        handleEvents(result.events);
      } catch (e) {
        console.error('[FreeRoom] Heartbeat failed:', e);
      }
    }, heartbeatSec * 1000);

    // Token renewal
    renewIntervalRef.current = setInterval(async () => {
      const rid = roomIdRef.current;
      if (!rid || !connectionIdRef.current || !authTokenRef.current || !engineRef.current) return;
      try {
        const res = await authedFetch('/rooms/token/renew', authTokenRef.current, {
          room_id: rid,
          connection_id: connectionIdRef.current,
        });
        const result = await handleResponse<RenewResponse>(res);
        setRemainingSeconds(result.remaining_seconds);
        handleEvents(result.events);

        if (result.denied) {
          if (IS_DEV) console.log('[FreeRoom] Token renewal denied:', result.reason);
          options.onCreditsExhausted?.();
          return;
        }

        if (result.agora_token && engineRef.current) {
          engineRef.current.renewToken(result.agora_token);
          if (IS_DEV) console.log('[FreeRoom] Token renewed');
        }
      } catch (e) {
        console.error('[FreeRoom] Token renewal failed:', e);
      }
    }, renewSec * 1000);

    // Duration timer
    durationIntervalRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);

    // Speaking prune interval
    pruneIntervalRef.current = setInterval(() => {
      const now = Date.now();

      // Self
      if (selfSpeakingUntilRef.current > 0 && now >= selfSpeakingUntilRef.current) {
        selfSpeakingUntilRef.current = 0;
        setIsSelfSpeaking(false);
      } else if (selfSpeakingUntilRef.current > now) {
        setIsSelfSpeaking(true);
      }

      // Peers
      let changed = false;
      for (const [uid, expiry] of peerSpeakingUntilRef.current) {
        if (now >= expiry) {
          peerSpeakingUntilRef.current.delete(uid);
          changed = true;
        }
      }
      if (changed) {
        setSpeakingUids([...peerSpeakingUntilRef.current.keys()]);
      }
    }, PRUNE_INTERVAL_MS);
  }, [handleEvents, options]);

  const cleanup = useCallback(async () => {
    clearAllIntervals();

    // Reset speaking state
    selfSpeakingUntilRef.current = 0;
    peerSpeakingUntilRef.current.clear();
    setSpeakingUids([]);
    setIsSelfSpeaking(false);

    // Leave Agora
    if (engineRef.current) {
      try {
        engineRef.current.leaveChannel();
        engineRef.current.release();
      } catch (e) {
        if (IS_DEV) console.warn('[FreeRoom] Agora cleanup error:', e);
      }
      engineRef.current = null;
    }

    // Notify backend
    const rid = roomIdRef.current;
    if (rid && connectionIdRef.current && authTokenRef.current) {
      try {
        await authedFetch('/rooms/leave', authTokenRef.current, {
          room_id: rid,
          connection_id: connectionIdRef.current,
        });
      } catch (e) {
        console.error('[FreeRoom] Failed to notify leave:', e);
      }
    }

    connectionIdRef.current = null;
    authTokenRef.current = null;
    roomIdRef.current = null;
    setCurrentRoomId(null);
    setParticipantCount(0);
    setIsHost(false);
    setIsMuted(false);
  }, [clearAllIntervals]);

  // Internal join
  const joinInternal = useCallback(async (roomId: string) => {
    const agora = getAgora();
    if (!agora) {
      const err = new Error('Agora SDK not available. Rebuild the app with: npx expo run:android');
      options.onError?.(err);
      setState('error');
      return;
    }

    setState('connecting');
    setDuration(0);
    setParticipantCount(0);
    setIsHost(false);
    setIsMuted(false);

    try {
      // Get auth token
      const token = await getWorkerToken(options.pkpInfo.ethAddress, options.signMessage);
      authTokenRef.current = token;

      // Join room API
      const res = await authedFetch('/rooms/join', token, { room_id: roomId });
      const joinResult = await handleResponse<JoinRoomResponse>(res);
      setIsHost(joinResult.is_host);
      connectionIdRef.current = joinResult.connection_id;
      roomIdRef.current = roomId;
      setCurrentRoomId(roomId);
      setRemainingSeconds(joinResult.remaining_seconds);

      if (IS_DEV) {
        console.log('[FreeRoom] Joined:', {
          channel: joinResult.channel,
          uid: joinResult.agora_uid,
          remaining: joinResult.remaining_seconds,
        });
      }

      // Create Agora engine (v4.x API: createAgoraRtcEngine + initialize)
      const { createAgoraRtcEngine, ChannelProfileType, ClientRoleType } = agora;

      const engine = createAgoraRtcEngine();
      engine.initialize({
        appId: AGORA_APP_ID,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      });
      engineRef.current = engine;

      // Enable audio
      engine.enableAudio();

      // Set client role
      if (joinResult.is_host) {
        engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
      } else {
        engine.setClientRole(ClientRoleType.ClientRoleAudience);
        setIsMuted(true);
      }

      // Event handlers
      engine.addListener('UserJoined', (_connection: any, remoteUid: number) => {
        if (IS_DEV) console.log(`[FreeRoom] Peer joined (uid: ${remoteUid})`);
        setParticipantCount((c) => c + 1);
        options.onPeerJoined?.(remoteUid);
      });

      engine.addListener('UserOffline', (_connection: any, remoteUid: number, reason: any) => {
        if (IS_DEV) console.log('[FreeRoom] Peer left:', reason);
        setParticipantCount((c) => Math.max(0, c - 1));
        options.onPeerLeft?.(remoteUid);
      });

      // Speaking detection
      engine.enableAudioVolumeIndication(300, 3, true);
      engine.addListener('AudioVolumeIndication', (_connection: any, speakers: any[], _speakerNumber: number, _totalVolume: number) => {
        const now = Date.now();
        for (const speaker of speakers) {
          if (speaker.volume < SPEAK_THRESHOLD) continue;
          const expiry = now + SPEAK_HOLD_MS;
          if (speaker.uid === 0 || speaker.uid === joinResult.agora_uid) {
            selfSpeakingUntilRef.current = expiry;
          } else {
            peerSpeakingUntilRef.current.set(speaker.uid, expiry);
          }
        }
      });

      // Join Agora channel
      engine.joinChannel(joinResult.agora_token, joinResult.channel, joinResult.agora_uid, {
        publishMicrophoneTrack: joinResult.is_host,
        publishCameraTrack: false,
        autoSubscribeAudio: true,
        autoSubscribeVideo: false,
      });

      // Start intervals
      if (joinResult.heartbeat_interval_seconds && joinResult.renew_after_seconds) {
        startIntervals(joinResult.heartbeat_interval_seconds, joinResult.renew_after_seconds);
      }

      setState('connected');
    } catch (error) {
      console.error('[FreeRoom] Failed to join:', error);
      setState('error');
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
      await cleanup();
      setState('idle');
    }
  }, [options, startIntervals, cleanup]);

  const createAndJoin = useCallback(async (createOptions?: CreateRoomOptions) => {
    if (state !== 'idle') return;

    try {
      setState('connecting');

      // Get auth token
      const token = await getWorkerToken(options.pkpInfo.ethAddress, options.signMessage);
      authTokenRef.current = token;

      // Create room
      const res = await authedFetch('/rooms/create', token, {
        visibility: createOptions?.visibility,
        ai_enabled: createOptions?.ai_enabled,
      });
      const result = await handleResponse<{ room_id: string; channel: string }>(res);
      if (IS_DEV) console.log('[FreeRoom] Created room:', result.room_id);
      await joinInternal(result.room_id);
    } catch (error) {
      console.error('[FreeRoom] Failed to create room:', error);
      setState('error');
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
      setState('idle');
    }
  }, [state, options, joinInternal]);

  const join = useCallback(async (roomId: string) => {
    if (state !== 'idle') return;
    await joinInternal(roomId);
  }, [state, joinInternal]);

  const leave = useCallback(async () => {
    if (IS_DEV) console.log('[FreeRoom] Leaving room');
    await cleanup();
    setState('idle');
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    if (!engineRef.current) return;
    const newMuted = !isMuted;
    engineRef.current.muteLocalAudioStream(newMuted);
    setIsMuted(newMuted);
  }, [isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    state,
    isMuted,
    isHost,
    createAndJoin,
    join,
    leave,
    toggleMute,
    roomId: currentRoomId,
    duration,
    remainingSeconds,
    participantCount,
    speakingUids,
    isSelfSpeaking,
  };
}
