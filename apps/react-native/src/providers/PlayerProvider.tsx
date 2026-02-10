import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { createScrobbleService, type ScrobbleService } from '../services/scrobble-service';
import { useLitBridge } from './LitProvider';
import { useAuth } from './AuthProvider';
import type { MusicTrack } from '../services/music-scanner';

interface PlayerCoreContextValue {
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  queue: MusicTrack[];
  queueIndex: number;
  playTrack: (track: MusicTrack, allTracks: MusicTrack[]) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  skipNext: () => Promise<void>;
  skipPrevious: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
}

interface PlayerProgressState {
  position: number;
  duration: number;
}

const PlayerCoreContext = createContext<PlayerCoreContextValue | null>(null);
const PlayerProgressContext = createContext<PlayerProgressState | null>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { bridge } = useLitBridge();
  const { pkpInfo, createAuthContext } = useAuth();

  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState<PlayerProgressState>({ position: 0, duration: 0 });

  const soundRef = useRef<Audio.Sound | null>(null);
  const scrobbleServiceRef = useRef<ScrobbleService | null>(null);
  const isPlayingRef = useRef(false);
  const togglingRef = useRef(false);
  const switchingTrackRef = useRef(false);
  const queueStateRef = useRef({ queue: [] as MusicTrack[], index: 0 });

  // Refs to access current auth state from within the scrobble service
  const authRef = useRef({
    bridge,
    ethAddress: pkpInfo?.ethAddress ?? null,
    pkpPubkey: pkpInfo?.pubkey ?? null,
    createAuthContext,
  });

  // Keep refs in sync
  useEffect(() => {
    queueStateRef.current = { queue, index: queueIndex };
  }, [queue, queueIndex]);

  useEffect(() => {
    authRef.current = {
      bridge,
      ethAddress: pkpInfo?.ethAddress ?? null,
      pkpPubkey: pkpInfo?.pubkey ?? null,
      createAuthContext,
    };
  }, [bridge, pkpInfo, createAuthContext]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Initialize audio mode and scrobble service
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
    });

    const service = createScrobbleService(
      () => authRef.current.createAuthContext(),
      () => authRef.current.ethAddress,
      () => authRef.current.pkpPubkey,
      () => authRef.current.bridge,
    );
    scrobbleServiceRef.current = service;
    service.start();

    return () => {
      service.stop();
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;

    isPlayingRef.current = status.isPlaying;
    setIsPlaying(status.isPlaying);
    setProgress({
      position: (status.positionMillis || 0) / 1000,
      duration: (status.durationMillis || 0) / 1000,
    });

    scrobbleServiceRef.current?.onPlaybackChange(status.isPlaying);

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

      // Feed scrobble service
      scrobbleServiceRef.current?.onTrackStart({
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

  const coreValue = useMemo<PlayerCoreContextValue>(() => ({
    currentTrack,
    isPlaying,
    queue,
    queueIndex,
    playTrack,
    togglePlayPause,
    skipNext,
    skipPrevious,
    seekTo,
  }), [
    currentTrack,
    isPlaying,
    queue,
    queueIndex,
    playTrack,
    togglePlayPause,
    skipNext,
    skipPrevious,
    seekTo,
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
