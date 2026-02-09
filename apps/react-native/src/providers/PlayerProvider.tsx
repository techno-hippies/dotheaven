import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { ScrobbleEngine } from '../services/scrobble-engine';
import type { ReadyScrobble } from '../services/scrobble-engine';
import { submitScrobbleBatch } from '../lib/scrobble-submit';
import { useLitBridge } from './LitProvider';
import { useAuth } from './AuthProvider';
import type { MusicTrack } from '../services/music-scanner';

const SESSION_KEY = 'local';
const TICK_INTERVAL_MS = 15_000;

interface PlayerCoreContextValue {
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  queue: MusicTrack[];
  queueIndex: number;
  pendingScrobbles: number;
  playTrack: (track: MusicTrack, allTracks: MusicTrack[]) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  skipNext: () => Promise<void>;
  skipPrevious: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  flushScrobbles: () => Promise<void>;
}

interface PlayerProgressState {
  position: number;
  duration: number;
}

const PlayerCoreContext = createContext<PlayerCoreContextValue | null>(null);
const PlayerProgressContext = createContext<PlayerProgressState | null>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { bridge } = useLitBridge();
  const { isAuthenticated, pkpInfo, createAuthContext } = useAuth();

  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [pendingScrobbles, setPendingScrobbles] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState<PlayerProgressState>({ position: 0, duration: 0 });

  const soundRef = useRef<Audio.Sound | null>(null);
  const engineRef = useRef<ScrobbleEngine | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPlayingRef = useRef(false);
  const togglingRef = useRef(false);
  const switchingTrackRef = useRef(false);
  const queueStateRef = useRef({ queue: [] as MusicTrack[], index: 0 });
  const pendingRef = useRef<ReadyScrobble[]>([]);
  // Refs to access current auth state from within the engine callback
  const authRef = useRef({ bridge, isAuthenticated, pkpPubkey: pkpInfo?.pubkey ?? null, createAuthContext });

  // Keep refs in sync
  useEffect(() => {
    queueStateRef.current = { queue, index: queueIndex };
  }, [queue, queueIndex]);

  useEffect(() => {
    authRef.current = { bridge, isAuthenticated, pkpPubkey: pkpInfo?.pubkey ?? null, createAuthContext };
  }, [bridge, isAuthenticated, pkpInfo, createAuthContext]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Initialize audio mode and scrobble engine
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
    });

    const engine = new ScrobbleEngine((scrobble) => {
      console.log('[Scrobble] Ready:', scrobble.artist, '-', scrobble.title);
      pendingRef.current.push(scrobble);
      setPendingScrobbles(pendingRef.current.length);

      // If authenticated, submit immediately (like Tauri frontend)
      const { bridge: b, isAuthenticated: authed, pkpPubkey } = authRef.current;
      if (b && authed && pkpPubkey) {
        setTimeout(() => {
          submitSingle(scrobble).catch((err) => {
            console.error('[Scrobble] Submit failed, kept in queue:', err);
          });
        }, 2000);
      }
    });
    engineRef.current = engine;

    tickRef.current = setInterval(() => engine.tick(), TICK_INTERVAL_MS);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      engine.onSessionGone(SESSION_KEY);
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const submitSingle = async (scrobble: ReadyScrobble) => {
    const { bridge: b, pkpPubkey, createAuthContext: createCtx } = authRef.current;
    if (!b || !pkpPubkey) return;

    try {
      // Ensure auth context is created before Lit operations
      await createCtx();

      const result = await submitScrobbleBatch(b, pkpPubkey, [scrobble]);
      if (result.success) {
        pendingRef.current = pendingRef.current.filter((s) => s !== scrobble);
        setPendingScrobbles(pendingRef.current.length);
      }
    } catch (err) {
      console.error('[Scrobble] Submit error:', err);
    }
  };

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;

    isPlayingRef.current = status.isPlaying;
    setIsPlaying(status.isPlaying);
    setProgress({
      position: (status.positionMillis || 0) / 1000,
      duration: (status.durationMillis || 0) / 1000,
    });

    engineRef.current?.onPlayback(SESSION_KEY, status.isPlaying);

    // Auto-advance when track finishes
    if (status.didJustFinish) {
      const { queue: q, index: idx } = queueStateRef.current;
      if (q.length > 0 && idx < q.length - 1) {
        const nextIdx = idx + 1;
        loadAndPlay(q[nextIdx], nextIdx);
      } else {
        setIsPlaying(false);
      }
    }
  }, []);

  const loadAndPlay = useCallback(async (track: MusicTrack, index: number) => {
    if (switchingTrackRef.current) return;
    switchingTrackRef.current = true;

    try {
      // Update UI state immediately so mini player feels responsive.
      setCurrentTrack(track);
      setQueueIndex(index);
      setIsPlaying(true);
      setProgress({ position: 0, duration: track.duration ?? 0 });
      isPlayingRef.current = true;

      // Feed scrobble engine
      engineRef.current?.onMetadata(SESSION_KEY, {
        artist: track.artist,
        title: track.title,
        album: track.album || null,
        durationMs: track.duration ? track.duration * 1000 : null,
      });

      // Detach and defer previous unload so the next track can start sooner.
      const previousSound = soundRef.current;
      soundRef.current = null;
      if (previousSound) {
        try {
          previousSound.setOnPlaybackStatusUpdate(null);
        } catch (err) {
          console.warn('[Player] Failed to detach previous callback:', err);
        }
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: track.uri },
        { shouldPlay: true, progressUpdateIntervalMillis: 500 },
        onPlaybackStatusUpdate,
      );
      soundRef.current = sound;

      if (previousSound) {
        void previousSound.unloadAsync().catch((err) => {
          console.warn('[Player] Failed to unload previous sound:', err);
        });
      }
    } finally {
      switchingTrackRef.current = false;
    }
  }, [onPlaybackStatusUpdate]);

  const playTrack = useCallback(async (track: MusicTrack, allTracks: MusicTrack[]) => {
    const trackIndex = allTracks.findIndex((t) => t.id === track.id);
    setQueue(allTracks);
    await loadAndPlay(track, trackIndex >= 0 ? trackIndex : 0);
  }, [loadAndPlay]);

  const togglePlayPause = useCallback(async () => {
    const sound = soundRef.current;
    if (!sound || togglingRef.current) return;

    togglingRef.current = true;
    const nextIsPlaying = !isPlayingRef.current;
    isPlayingRef.current = nextIsPlaying;
    setIsPlaying(nextIsPlaying);

    try {
      if (nextIsPlaying) {
        await sound.playAsync();
      } else {
        await sound.pauseAsync();
      }
    } catch (err) {
      console.error('[Player] Failed to toggle playback:', err);
      try {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          isPlayingRef.current = status.isPlaying;
          setIsPlaying(status.isPlaying);
        }
      } catch {
        isPlayingRef.current = false;
        setIsPlaying(false);
      }
    } finally {
      togglingRef.current = false;
    }
  }, []);

  const skipNext = useCallback(async () => {
    const { queue: q, index: idx } = queueStateRef.current;
    if (q.length === 0) return;
    const nextIdx = (idx + 1) % q.length;
    await loadAndPlay(q[nextIdx], nextIdx);
  }, [loadAndPlay]);

  const skipPrevious = useCallback(async () => {
    const { queue: q, index: idx } = queueStateRef.current;
    if (q.length === 0) return;
    const prevIdx = (idx - 1 + q.length) % q.length;
    await loadAndPlay(q[prevIdx], prevIdx);
  }, [loadAndPlay]);

  const seekTo = useCallback(async (position: number) => {
    if (!soundRef.current) return;
    await soundRef.current.setPositionAsync(position * 1000);
  }, []);

  const flushScrobbles = useCallback(async () => {
    if (!bridge || !pkpInfo?.pubkey || pendingRef.current.length === 0) return;

    try {
      await createAuthContext();
      const result = await submitScrobbleBatch(bridge, pkpInfo.pubkey, pendingRef.current);
      if (result.success) {
        pendingRef.current = [];
        setPendingScrobbles(0);
        console.log('[Scrobble] Flushed all pending scrobbles');
      }
    } catch (err) {
      console.error('[Scrobble] Flush failed:', err);
    }
  }, [bridge, pkpInfo, createAuthContext]);

  const coreValue = useMemo<PlayerCoreContextValue>(() => ({
    currentTrack,
    isPlaying,
    queue,
    queueIndex,
    pendingScrobbles,
    playTrack,
    togglePlayPause,
    skipNext,
    skipPrevious,
    seekTo,
    flushScrobbles,
  }), [
    currentTrack,
    isPlaying,
    queue,
    queueIndex,
    pendingScrobbles,
    playTrack,
    togglePlayPause,
    skipNext,
    skipPrevious,
    seekTo,
    flushScrobbles,
  ]);

  const progressValue = useMemo<PlayerProgressState>(() => progress, [progress]);

  return (
    <PlayerCoreContext.Provider value={coreValue}>
      <PlayerProgressContext.Provider value={progressValue}>
        {children}
      </PlayerProgressContext.Provider>
    </PlayerCoreContext.Provider>
  );
};

export const usePlayer = (): PlayerCoreContextValue => {
  const ctx = useContext(PlayerCoreContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
};

export const usePlayerProgress = (): PlayerProgressState => {
  const ctx = useContext(PlayerProgressContext);
  if (!ctx) throw new Error('usePlayerProgress must be used within PlayerProvider');
  return ctx;
};
