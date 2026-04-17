// src/context/PlayerContext.tsx
// Phase A + B complete. Full parity with web PlayerContext.
//
// Phase A (queue system):
//   - Queue state: queue, queueSource, isShuffled, originalQueue, autoplay
//   - requestPlay + PlayChoiceModal flow
//   - playNext, playLater, removeFromQueue, reorderQueue, clearQueue
//   - toggleShuffle (Fisher-Yates, keeps current track at index 0)
//   - saveQueueAsPlaylist
//   - next() / prev() stop at queue boundaries
//   - Reactive auth — playlists reload on login
//   - Self-healing openPlaylistManager
//
// Phase B (followed playlists + community features):
//   - followedPlaylists state + loadFollowedPlaylists
//   - loadPlaylistDetails (returns a normalized playlist)
//   - follow/unfollow — refreshes followedPlaylists on success
//   - suggestSong/voteOnSuggestion
//   - blockSong/unblockSong

import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import playlistService, { Playlist, Track, SongSuggestion } from '../services/playlistService';
import { getMediaUrl } from '../services/axiosInstance';
import { useAuth } from './AuthContext';

// ─── Types ──────────────────────────────────────────────────────────

export interface MediaItem {
  id: string;
  songId?: string;
  title: string;
  artist?: string;
  artistName?: string;
  url?: string;
  fileUrl?: string;
  artwork?: string;
  artworkUrl?: string;
  duration?: number;
  jurisdiction?: string;
  playlistItemId?: string;
  genre?: string;
}

export interface NormalizedTrack {
  id: string;
  songId: string;
  playlistItemId?: string;
  title: string;
  artist: string;
  artwork: string;
  url: string;
  duration?: number;
  jurisdiction?: string;
  genre?: string;
}

interface TransformedPlaylist {
  id: string;
  playlistId: string;
  name: string;
  tracks: NormalizedTrack[];
}

interface PlayChoiceModalState {
  open: boolean;
  pendingSong: MediaItem | null;
}

interface PlayerContextType {
  // Playback state
  isPlaying: boolean;
  isExpanded: boolean;
  currentMedia: NormalizedTrack | null;
  position: number;
  duration: number;
  loading: boolean;
  isBuffering: boolean;
  autoplay: boolean;

  // Queue state
  queue: NormalizedTrack[];
  currentIndex: number;
  queueSource: string;
  isShuffled: boolean;

  // Play choice modal
  playChoiceModal: PlayChoiceModalState;

  // Playlist library
  playlists: TransformedPlaylist[];
  followedPlaylists: TransformedPlaylist[];
  showPlaylistManager: boolean;

  // Playback controls
  playMedia: (media: MediaItem, newQueue?: MediaItem[], source?: string) => Promise<void>;
  requestPlay: (song: MediaItem) => void;
  confirmPlayNow: () => Promise<void>;
  confirmAddToQueue: () => void;
  cancelPlayChoice: () => void;
  togglePlayPause: () => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  setAutoplay: (on: boolean) => void;

  // Queue ops
  playNext: (song: MediaItem) => void;
  playLater: (song: MediaItem) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => Promise<void>;
  toggleShuffle: () => void;
  saveQueueAsPlaylist: (name: string) => Promise<void>;

  // UI
  toggleExpand: () => void;
  openPlaylistManager: () => Promise<void>;
  closePlaylistManager: () => void;

  // Cleanup
  clearPlayer: () => Promise<void>;

  // Playlist CRUD
  createPlaylist: (name: string) => Promise<void>;
  addToPlaylist: (playlistId: string, track: MediaItem) => Promise<void>;
  removeFromPlaylist: (playlistId: string, playlistItemId: string) => Promise<void>;
  reorderPlaylist: (playlistId: string, newOrderedTracks: NormalizedTrack[]) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  updatePlaylistName: (playlistId: string, newName: string) => Promise<void>;
  loadPlaylist: (playlist: TransformedPlaylist) => void;
  refreshPlaylists: () => Promise<void>;

  // Phase B — followed playlists + community features
  loadFollowedPlaylists: () => Promise<void>;
  loadPlaylistDetails: (playlistId: string) => Promise<TransformedPlaylist | null>;
  followPlaylist: (playlistId: string) => Promise<void>;
  unfollowPlaylist: (playlistId: string) => Promise<void>;
  suggestSong: (playlistId: string, songId: string) => Promise<SongSuggestion | null>;
  voteOnSuggestion: (
    playlistId: string,
    suggestionId: string,
    direction?: 'up' | 'down',
  ) => Promise<void>;
  blockSong: (playlistId: string, songId: string) => Promise<void>;
  unblockSong: (playlistId: string, songId: string) => Promise<void>;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export const usePlayer = (): PlayerContextType => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
};

// ─── Helpers ────────────────────────────────────────────────────────

const normalizeTrack = (track: Track | MediaItem): NormalizedTrack => ({
  id: (track as any).songId || (track as any).id,
  songId: (track as any).songId || (track as any).id,
  playlistItemId: (track as any).playlistItemId,
  title: track.title,
  artist: (track as any).artistName || (track as any).artist || '',
  artwork: getMediaUrl((track as any).artworkUrl || (track as any).artwork) || '',
  url: getMediaUrl((track as any).fileUrl || (track as any).url) || '',
  duration: track.duration,
  jurisdiction: (track as any).jurisdiction?.name || (track as any).jurisdiction,
  genre: (track as any).genre?.name || (track as any).genre,
});

const transformPlaylist = (pl: Playlist): TransformedPlaylist => ({
  id: pl.playlistId,
  playlistId: pl.playlistId,
  name: pl.name,
  tracks: pl.tracks.map(t => normalizeTrack(t)),
});

const shuffleKeepingHead = (
  head: NormalizedTrack | null,
  rest: NormalizedTrack[],
): NormalizedTrack[] => {
  const arr = [...rest];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return head ? [head, ...arr] : arr;
};

// ─── Provider ───────────────────────────────────────────────────────

interface PlayerProviderProps {
  children: React.ReactNode;
}

export const PlayerProvider: React.FC<PlayerProviderProps> = ({ children }) => {
  const { user } = useAuth();

  // Playback state
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentMedia, setCurrentMedia] = useState<NormalizedTrack | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [autoplay, setAutoplay] = useState(true);

  // Queue state
  const [queue, setQueue] = useState<NormalizedTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [queueSource, setQueueSource] = useState('');
  const [isShuffled, setIsShuffled] = useState(false);
  const [originalQueue, setOriginalQueue] = useState<NormalizedTrack[]>([]);

  // Play choice modal
  const [playChoiceModal, setPlayChoiceModal] = useState<PlayChoiceModalState>({
    open: false,
    pendingSong: null,
  });

  // Playlist library
  const [playlists, setPlaylists] = useState<TransformedPlaylist[]>([]);
  const [followedPlaylists, setFollowedPlaylists] = useState<TransformedPlaylist[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPlaylistManager, setShowPlaylistManager] = useState(false);

  // Audio ref
  const soundRef = useRef<Audio.Sound | null>(null);

  // Refs mirroring state for use inside audio status callbacks
  const queueRef = useRef<NormalizedTrack[]>([]);
  const currentIndexRef = useRef(0);
  const autoplayRef = useRef(true);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { autoplayRef.current = autoplay; }, [autoplay]);

  // ─── Audio mode setup ─────────────────────────────────────────────
  useEffect(() => {
    const setupAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
        });
      } catch (error) {
        console.error('Failed to setup audio mode:', error);
      }
    };
    setupAudio();

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  // ─── Reactive auth: load playlists on login ──────────────────────
  useEffect(() => {
    if (user?.userId) {
      loadUserPlaylists();
      loadFollowedPlaylists();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId]);

  // ─── Audio playback status callback ──────────────────────────────
  const handleTrackEnd = useCallback(async () => {
    if (!autoplayRef.current) {
      setIsPlaying(false);
      return;
    }
    const nextIdx = currentIndexRef.current + 1;
    if (nextIdx >= queueRef.current.length) {
      setIsPlaying(false);
      return;
    }
    const nextTrack = queueRef.current[nextIdx];
    if (nextTrack) {
      setCurrentIndex(nextIdx);
      await loadAndPlayTrack(nextTrack);
    }
  }, []);

  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        if (status.error) console.error('Playback error:', status.error);
        return;
      }
      setIsPlaying(status.isPlaying);
      setIsBuffering(status.isBuffering);
      setPosition(status.positionMillis);
      setDuration(status.durationMillis || 0);

      if (status.didJustFinish && !status.isLooping) {
        handleTrackEnd();
      }
    },
    [handleTrackEnd],
  );

  // ─── Core track loading ──────────────────────────────────────────
  const loadAndPlayTrack = async (track: NormalizedTrack) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: track.url },
        { shouldPlay: true },
        onPlaybackStatusUpdate,
      );
      soundRef.current = sound;
      setCurrentMedia(track);
      setIsPlaying(true);
    } catch (error) {
      console.error('Failed to load track:', error);
      setIsPlaying(false);
    }
  };

  const playTrackAtIndex = useCallback(async (index: number) => {
    const track = queueRef.current[index];
    if (track) {
      setCurrentIndex(index);
      await loadAndPlayTrack(track);
    }
  }, []);

  // ─── Public playback controls ────────────────────────────────────

  const playMedia = async (
    media: MediaItem,
    newQueue: MediaItem[] = [],
    source: string = '',
  ) => {
    const normalizedMedia = normalizeTrack(media as any);

    if (newQueue.length > 0) {
      const normalizedQueue = newQueue.map(t => normalizeTrack(t as any));
      setQueue(normalizedQueue);
      setQueueSource(source);
      setIsShuffled(false);
      setOriginalQueue([]);
      const index = normalizedQueue.findIndex(t => t.id === normalizedMedia.id);
      setCurrentIndex(index >= 0 ? index : 0);
    } else {
      const existingIndex = queue.findIndex(t => t.id === normalizedMedia.id);
      if (existingIndex >= 0) {
        setCurrentIndex(existingIndex);
      } else {
        setQueue([normalizedMedia]);
        setQueueSource(source);
        setCurrentIndex(0);
      }
    }

    await loadAndPlayTrack(normalizedMedia);
  };

  const requestPlay = useCallback((song: MediaItem) => {
    if (queue.length === 0) {
      playMedia(song, [song], '');
      return;
    }
    setPlayChoiceModal({ open: true, pendingSong: song });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length]);

  const confirmPlayNow = useCallback(async () => {
    const pending = playChoiceModal.pendingSong;
    setPlayChoiceModal({ open: false, pendingSong: null });
    if (!pending) return;

    const normalized = normalizeTrack(pending as any);
    const insertIndex = currentIndex + 1;
    const newQueue = [
      ...queue.slice(0, insertIndex),
      normalized,
      ...queue.slice(insertIndex),
    ];
    setQueue(newQueue);
    setCurrentIndex(insertIndex);
    await loadAndPlayTrack(normalized);
  }, [playChoiceModal, queue, currentIndex]);

  const confirmAddToQueue = useCallback(() => {
    const pending = playChoiceModal.pendingSong;
    setPlayChoiceModal({ open: false, pendingSong: null });
    if (!pending) return;

    const normalized = normalizeTrack(pending as any);
    setQueue(prev => [...prev, normalized]);
  }, [playChoiceModal]);

  const cancelPlayChoice = useCallback(() => {
    setPlayChoiceModal({ open: false, pendingSong: null });
  }, []);

  const togglePlayPause = useCallback(async () => {
    if (!soundRef.current) {
      if (currentMedia) await loadAndPlayTrack(currentMedia);
      return;
    }
    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) await soundRef.current.pauseAsync();
    else await soundRef.current.playAsync();
  }, [currentMedia]);

  const next = useCallback(async () => {
    if (queue.length === 0) return;
    const nextIdx = currentIndex + 1;
    if (nextIdx >= queue.length) {
      if (soundRef.current) await soundRef.current.pauseAsync();
      setIsPlaying(false);
      return;
    }
    await playTrackAtIndex(nextIdx);
  }, [queue.length, currentIndex, playTrackAtIndex]);

  const prev = useCallback(async () => {
    if (queue.length === 0) return;
    const prevIdx = currentIndex - 1;
    if (prevIdx < 0) return;
    await playTrackAtIndex(prevIdx);
  }, [queue.length, currentIndex, playTrackAtIndex]);

  const seekTo = async (positionMs: number) => {
    if (soundRef.current) await soundRef.current.setPositionAsync(positionMs);
  };

  // ─── Queue ops ───────────────────────────────────────────────────

  const playNext = useCallback((song: MediaItem) => {
    const normalized = normalizeTrack(song as any);
    setQueue(prev => {
      const insertIndex = currentIndex + 1;
      return [...prev.slice(0, insertIndex), normalized, ...prev.slice(insertIndex)];
    });
  }, [currentIndex]);

  const playLater = useCallback((song: MediaItem) => {
    const normalized = normalizeTrack(song as any);
    setQueue(prev => [...prev, normalized]);
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    if (index === currentIndex) return;
    setQueue(prev => prev.filter((_, i) => i !== index));
    if (index < currentIndex) setCurrentIndex(prev => prev - 1);
  }, [currentIndex]);

  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === currentIndex || toIndex === currentIndex) return;
    if (fromIndex === toIndex) return;

    const newQueue = [...queue];
    const [moved] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, moved);
    setQueue(newQueue);

    if (currentMedia) {
      const newIdx = newQueue.findIndex(t => t.id === currentMedia.id);
      if (newIdx >= 0) setCurrentIndex(newIdx);
    }
  }, [queue, currentIndex, currentMedia]);

  const clearQueue = useCallback(async () => {
    if (soundRef.current) {
      try { await soundRef.current.pauseAsync(); } catch {}
    }
    setQueue([]);
    setOriginalQueue([]);
    setCurrentIndex(0);
    setCurrentMedia(null);
    setIsShuffled(false);
    setIsPlaying(false);
    setPosition(0);
    setDuration(0);
    setQueueSource('');
  }, []);

  const toggleShuffle = useCallback(() => {
    if (!isShuffled) {
      const current = queue[currentIndex] ?? null;
      const rest = queue.filter((_, i) => i !== currentIndex);
      const shuffled = shuffleKeepingHead(current, rest);
      setOriginalQueue(queue);
      setQueue(shuffled);
      setCurrentIndex(0);
      setIsShuffled(true);
    } else {
      if (originalQueue.length > 0 && currentMedia) {
        const restoredIdx = originalQueue.findIndex(t => t.id === currentMedia.id);
        setQueue(originalQueue);
        setCurrentIndex(restoredIdx >= 0 ? restoredIdx : 0);
        setOriginalQueue([]);
      }
      setIsShuffled(false);
    }
  }, [queue, currentIndex, isShuffled, originalQueue, currentMedia]);

  const saveQueueAsPlaylist = useCallback(async (name: string) => {
    if (queue.length === 0) throw new Error('Queue is empty');
    try {
      const created = await playlistService.createPlaylist(name);
      const newPlaylistId = (created as any)?.playlistId;
      if (!newPlaylistId) {
        throw new Error('createPlaylist did not return playlistId');
      }
      for (const track of queue) {
        const songId = track.songId || track.id;
        await playlistService.addTrackToPlaylist(newPlaylistId, songId);
      }
      await loadUserPlaylists();
    } catch (error) {
      console.error('Failed to save queue as playlist:', error);
      throw error;
    }
  }, [queue]);

  // ─── UI ──────────────────────────────────────────────────────────

  const toggleExpand = () => setIsExpanded(v => !v);

  const openPlaylistManager = useCallback(async () => {
    setShowPlaylistManager(true);
    if (playlists.length === 0 && user?.userId) {
      await loadUserPlaylists();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlists.length, user?.userId]);

  const closePlaylistManager = () => setShowPlaylistManager(false);

  // ─── Cleanup ─────────────────────────────────────────────────────

  const clearPlayer = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch (err) {
      console.error('Error clearing player audio:', err);
    }

    setCurrentMedia(null);
    setQueue([]);
    setOriginalQueue([]);
    setCurrentIndex(0);
    setQueueSource('');
    setIsShuffled(false);
    setIsPlaying(false);
    setIsBuffering(false);
    setIsExpanded(false);
    setPosition(0);
    setDuration(0);
    setPlaylists([]);
    setFollowedPlaylists([]);
    setShowPlaylistManager(false);
    setPlayChoiceModal({ open: false, pendingSong: null });
  };

  // ─── Playlist CRUD ───────────────────────────────────────────────

  const loadUserPlaylists = async () => {
    try {
      setLoading(true);
      const data = await playlistService.getUserPlaylists();
      setPlaylists(data.map(transformPlaylist));
    } catch (error) {
      console.error('Failed to load playlists:', error);
      setPlaylists([]);
    } finally {
      setLoading(false);
    }
  };

  const createPlaylist = async (name: string) => {
    try {
      await playlistService.createPlaylist(name);
      await loadUserPlaylists();
    } catch (error) {
      console.error('Failed to create playlist:', error);
      throw error;
    }
  };

  const addToPlaylist = async (playlistId: string, track: MediaItem) => {
    try {
      const songId = track.songId || track.id;
      await playlistService.addTrackToPlaylist(playlistId, songId);
      await loadUserPlaylists();
    } catch (error) {
      console.error('Failed to add track:', error);
      throw error;
    }
  };

  const removeFromPlaylist = async (playlistId: string, playlistItemId: string) => {
    try {
      await playlistService.removeTrackFromPlaylist(playlistId, playlistItemId);
      await loadUserPlaylists();
    } catch (error) {
      console.error('Failed to remove track:', error);
      throw error;
    }
  };

  const reorderPlaylist = async (
    playlistId: string,
    newOrderedTracks: NormalizedTrack[],
  ) => {
    try {
      const orderedIds = newOrderedTracks
        .map(t => t.playlistItemId!)
        .filter(Boolean);
      await playlistService.reorderPlaylist(playlistId, orderedIds);
      await loadUserPlaylists();
    } catch (error) {
      console.error('Failed to reorder playlist:', error);
      throw error;
    }
  };

  const deletePlaylist = async (playlistId: string) => {
    try {
      await playlistService.deletePlaylist(playlistId);
      await loadUserPlaylists();
    } catch (error) {
      console.error('Failed to delete playlist:', error);
      throw error;
    }
  };

  const updatePlaylistName = async (playlistId: string, newName: string) => {
    try {
      await playlistService.updatePlaylist(playlistId, newName);
      await loadUserPlaylists();
    } catch (error) {
      console.error('Failed to update playlist:', error);
      throw error;
    }
  };

  const loadPlaylist = (pl: TransformedPlaylist) => {
    setQueue(pl.tracks);
    setQueueSource(pl.name);
    setCurrentIndex(0);
    setIsShuffled(false);
    setOriginalQueue([]);
    if (pl.tracks.length > 0) setCurrentMedia(pl.tracks[0]);
  };

  // ─── Phase B — followed playlists + community features ──────────

  const loadFollowedPlaylists = async () => {
    try {
      const data = await playlistService.getFollowedPlaylists();
      setFollowedPlaylists(data.map(transformPlaylist));
    } catch (error) {
      console.error('Failed to load followed playlists:', error);
      setFollowedPlaylists([]);
    }
  };

  const loadPlaylistDetails = async (
    playlistId: string,
  ): Promise<TransformedPlaylist | null> => {
    try {
      const data = await playlistService.getPlaylistById(playlistId);
      return transformPlaylist(data);
    } catch (error) {
      console.error('Failed to load playlist details:', error);
      return null;
    }
  };

  const followPlaylist = async (playlistId: string) => {
    try {
      await playlistService.followPlaylist(playlistId);
      await loadFollowedPlaylists();
    } catch (error) {
      console.error('Failed to follow playlist:', error);
      throw error;
    }
  };

  const unfollowPlaylist = async (playlistId: string) => {
    try {
      await playlistService.unfollowPlaylist(playlistId);
      await loadFollowedPlaylists();
    } catch (error) {
      console.error('Failed to unfollow playlist:', error);
      throw error;
    }
  };

  const suggestSong = async (
    playlistId: string,
    songId: string,
  ): Promise<SongSuggestion | null> => {
    try {
      const suggestion = await playlistService.suggestSong(playlistId, songId);
      return suggestion;
    } catch (error) {
      console.error('Failed to suggest song:', error);
      throw error;
    }
  };

  const voteOnSuggestion = async (
    playlistId: string,
    suggestionId: string,
    direction?: 'up' | 'down',
  ) => {
    try {
      await playlistService.voteOnSuggestion(playlistId, suggestionId, direction);
    } catch (error) {
      console.error('Failed to vote on suggestion:', error);
      throw error;
    }
  };

  const blockSong = async (playlistId: string, songId: string) => {
    try {
      await playlistService.blockSong(playlistId, songId);
    } catch (error) {
      console.error('Failed to block song:', error);
      throw error;
    }
  };

  const unblockSong = async (playlistId: string, songId: string) => {
    try {
      await playlistService.unblockSong(playlistId, songId);
    } catch (error) {
      console.error('Failed to unblock song:', error);
      throw error;
    }
  };

  // ─── Context value ───────────────────────────────────────────────

  const value: PlayerContextType = {
    // Playback
    isPlaying,
    isExpanded,
    currentMedia,
    position,
    duration,
    loading,
    isBuffering,
    autoplay,

    // Queue
    queue,
    currentIndex,
    queueSource,
    isShuffled,

    // Play choice
    playChoiceModal,

    // Library
    playlists,
    followedPlaylists,
    showPlaylistManager,

    // Playback controls
    playMedia,
    requestPlay,
    confirmPlayNow,
    confirmAddToQueue,
    cancelPlayChoice,
    togglePlayPause,
    next,
    prev,
    seekTo,
    setAutoplay,

    // Queue ops
    playNext,
    playLater,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    toggleShuffle,
    saveQueueAsPlaylist,

    // UI
    toggleExpand,
    openPlaylistManager,
    closePlaylistManager,

    // Cleanup
    clearPlayer,

    // Playlist CRUD
    createPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    reorderPlaylist,
    deletePlaylist,
    updatePlaylistName,
    loadPlaylist,
    refreshPlaylists: loadUserPlaylists,

    // Phase B
    loadFollowedPlaylists,
    loadPlaylistDetails,
    followPlaylist,
    unfollowPlaylist,
    suggestSong,
    voteOnSuggestion,
    blockSong,
    unblockSong,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
};

export default PlayerContext;