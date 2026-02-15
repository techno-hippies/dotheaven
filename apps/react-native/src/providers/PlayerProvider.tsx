import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { createScrobbleService, type ScrobbleService } from '../services/scrobble-service';
import { useLitBridge } from './LitProvider';
import { useAuth } from './AuthProvider';
import type { MusicTrack } from '../services/music-scanner';

const RECENT_TRACKS_KEY = 'heaven:recent-tracks';
const MAX_RECENT_TRACKS = 30;
const CONTENT_DECRYPT_V1_CID =
  process.env.EXPO_PUBLIC_CONTENT_DECRYPT_V1_CID || 'QmUmVkMxC57nAqUmJPZmoBKeBfiZS6ZR8qzYQJvWe4W12w';
const LOAD_GATEWAY_URL =
  process.env.EXPO_PUBLIC_LOAD_GATEWAY_URL || 'https://gateway.s3-node-1.load.network';

interface PlayerCoreContextValue {
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  queue: MusicTrack[];
  queueIndex: number;
  recentTracks: MusicTrack[];
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

type CloudTrack = MusicTrack & {
  contentId: string;
  pieceCid: string;
  datasetOwner?: string;
};

function isCloudTrack(track: MusicTrack): track is CloudTrack {
  return !track.uri && !!track.contentId && !!track.pieceCid;
}

function sanitizeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 48) || 'audio';
}

function extensionFromMime(mimeType?: string): string {
  switch (mimeType) {
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/flac':
      return 'flac';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/wav':
      return 'wav';
    case 'audio/mp4':
      return 'm4a';
    default:
      return 'bin';
  }
}

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { bridge } = useLitBridge();
  const { pkpInfo, createAuthContext } = useAuth();

  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState<PlayerProgressState>({ position: 0, duration: 0 });
  const [recentTracks, setRecentTracks] = useState<MusicTrack[]>([]);

  const soundRef = useRef<Audio.Sound | null>(null);
  const scrobbleServiceRef = useRef<ScrobbleService | null>(null);
  const isPlayingRef = useRef(false);
  const togglingRef = useRef(false);
  const switchingTrackRef = useRef(false);
  const queueStateRef = useRef({ queue: [] as MusicTrack[], index: 0 });
  const decryptedFileCacheRef = useRef<Map<string, string>>(new Map());

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

  // Load recent tracks from storage
  useEffect(() => {
    AsyncStorage.getItem(RECENT_TRACKS_KEY).then((stored) => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) setRecentTracks(parsed);
        } catch {}
      }
    });
  }, []);

  // Initialize audio mode and scrobble service
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
    });

    const service = createScrobbleService(
      (options) => authRef.current.createAuthContext(options),
      () => authRef.current.ethAddress,
      () => authRef.current.pkpPubkey,
      () => authRef.current.bridge,
      (options) => authRef.current.createAuthContext(options),
    );
    scrobbleServiceRef.current = service;
    service.start();

    return () => {
      service.stop();
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
      for (const uri of decryptedFileCacheRef.current.values()) {
        try {
          const file = new File(uri);
          if (file.exists) file.delete();
        } catch {
          // ignore cleanup errors for cached temp files
        }
      }
      decryptedFileCacheRef.current.clear();
    };
  }, []);

  const resolvePlayableUri = useCallback(async (track: MusicTrack): Promise<string> => {
    if (track.uri) return track.uri;
    if (!isCloudTrack(track)) {
      throw new Error('Track has no playable URI and no cloud metadata');
    }

    const cachedUri = decryptedFileCacheRef.current.get(track.contentId);
    if (cachedUri) {
      try {
        const cachedFile = new File(cachedUri);
        if (cachedFile.exists) {
          console.log('[Player] Using cached decrypted file:', track.contentId, cachedUri);
          return cachedUri;
        }
      } catch {
        // Continue and rebuild the cache entry.
      }
      decryptedFileCacheRef.current.delete(track.contentId);
    }

    const auth = authRef.current;
    if (!auth.bridge) {
      throw new Error('Lit bridge is not ready');
    }
    if (!auth.pkpPubkey) {
      throw new Error('Missing PKP public key for cloud decrypt');
    }

    console.log('[Player] Cloud decrypt start:', {
      trackId: track.id,
      contentId: track.contentId,
      pieceCid: track.pieceCid,
      datasetOwner: track.datasetOwner,
      algo: track.algo ?? 1,
    });

    await auth.createAuthContext();
    const result = await auth.bridge.fetchAndDecryptContent({
      datasetOwner: track.datasetOwner ?? '',
      pieceCid: track.pieceCid,
      contentId: track.contentId,
      userPkpPublicKey: auth.pkpPubkey,
      contentDecryptCid: CONTENT_DECRYPT_V1_CID,
      algo: track.algo ?? 1,
      network: 'mainnet',
      gatewayUrl: LOAD_GATEWAY_URL,
    });

    const ext = extensionFromMime(result.mimeType);
    const filename = `heaven-${sanitizeFileSegment(track.contentId)}-${Date.now()}.${ext}`;
    const file = new File(Paths.cache, filename);
    file.create({ intermediates: true, overwrite: true });
    file.write(result.audioBase64, { encoding: 'base64' });

    decryptedFileCacheRef.current.set(track.contentId, file.uri);
    console.log('[Player] Cloud decrypt done:', {
      trackId: track.id,
      contentId: track.contentId,
      bytes: result.bytes,
      mimeType: result.mimeType ?? 'unknown',
      sourceUrl: result.sourceUrl,
      fileUri: file.uri,
    });

    return file.uri;
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

      // Update recent tracks
      setRecentTracks((prev) => {
        const next = [track, ...prev.filter((t) => t.id !== track.id)].slice(0, MAX_RECENT_TRACKS);
        AsyncStorage.setItem(RECENT_TRACKS_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });

      // Feed scrobble service
      scrobbleServiceRef.current?.onTrackStart({
        artist: track.artist,
        title: track.title,
        album: track.album || null,
        durationMs: track.duration ? track.duration * 1000 : null,
      });

      const playableUri = await resolvePlayableUri(track);
      if (!track.uri && playableUri) {
        setCurrentTrack({ ...track, uri: playableUri });
      }
      console.log('[Player] Loading track source:', {
        trackId: track.id,
        source: playableUri,
        cloud: !track.uri,
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
        { uri: playableUri },
        { shouldPlay: true, progressUpdateIntervalMillis: 500 },
        onPlaybackStatusUpdate,
      );
      soundRef.current = sound;

      if (previousSound) {
        void previousSound.unloadAsync().catch((err) => {
          console.warn('[Player] Failed to unload previous sound:', err);
        });
      }
    } catch (err) {
      console.error('[Player] Failed to load track:', {
        trackId: track.id,
        title: track.title,
        error: err,
      });
      isPlayingRef.current = false;
      setIsPlaying(false);
      throw err;
    } finally {
      switchingTrackRef.current = false;
    }
  }, [onPlaybackStatusUpdate, resolvePlayableUri]);

  const playTrack = useCallback(async (track: MusicTrack, allTracks: MusicTrack[]) => {
    const trackIndex = allTracks.findIndex((t) => t.id === track.id);
    setQueue(allTracks);
    try {
      await loadAndPlay(track, trackIndex >= 0 ? trackIndex : 0);
    } catch (err) {
      console.error('[Player] playTrack failed:', err);
    }
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
    recentTracks,
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
    recentTracks,
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
