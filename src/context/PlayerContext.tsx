// src/context/PlayerContext.tsx
// ─────────────────────────────────────────────────────────────
// Mobile port of web src/context/playercontext.jsx (Nov 2026), on expo-av.
//
// The queue model is web's, exactly:
//   • The queue is the ONE place playback happens.
//   • requestPlay(song): empty queue → plays; otherwise PlayChoiceModal asks
//     "Play now" (insert after the current song and start) or "Add to queue".
//   • requestPlayCollection({ tracks, playlist, startIndex, shuffle }): a
//     playlist is POURED INTO the queue the same way — never replaces it.
//     Its entries carry origin { type:'playlist', name, batchId } so the queue
//     panel shows them as a group.
//   • Every entry has its own `qid` (the same song can be queued twice);
//     `id` stays the song id, which play counting relies on.
//   • next()/prev() skip songs on the user's Don't Play list and songs the
//     server says were removed. Repeat: off → all → one.
//   • Every queue change confirms itself with a toast (FeedbackContext).
//
// Not ported: queue persistence across app restarts (web keeps it in
// localStorage; SecureStore's small value limit can't hold a queue — needs
// AsyncStorage, a native module), Media Session (lock-screen controls need
// react-native-track-player).
// ─────────────────────────────────────────────────────────────
import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { useAuth } from './AuthContext';
import { useFeedback } from './FeedbackContext';

// ─── Types ──────────────────────────────────────────────────────────

/** Anything that can be played. Callers pass loose song objects. */
export interface MediaItem {
  id?: string;
  songId?: string;
  title?: string;
  artist?: string;
  artistName?: string;
  artistId?: string | null;
  url?: string | null;
  fileUrl?: string | null;
  artwork?: string | null;
  artworkUrl?: string | null;
  duration?: number;
  jurisdiction?: any;
  playlistItemId?: string;
  genre?: any;
  source?: string | null;
  type?: string;
  [key: string]: any;
}

export interface QueueOrigin {
  type: 'playlist';
  playlistId: string;
  name: string;
  coverUrl: string | null;
  batchId: string;
}

/** A queue entry: the song plus its own queue identity. */
export interface NormalizedTrack extends MediaItem {
  id: string;
  songId: string;
  qid: string;
  origin: QueueOrigin | null;
  title: string;
  artist: string;
  artwork: string;
  artworkUrl: string;
  url: string;
  fileUrl: string;
}

export interface TransformedPlaylist {
  id: string;
  playlistId: string;
  name: string;
  type?: string;
  visibility?: string;
  songCount?: number;
  followerCount?: number;
  coverImageUrl?: string | null;
  firstFourArtworks?: string[];
  creatorName?: string;
  updatedAt?: string;
  description?: string;
  tracks: NormalizedTrack[];
  [key: string]: any;
}

export interface PendingCollection {
  tracks: MediaItem[];
  origin: QueueOrigin | null;
  title: string;
  artwork: string | null;
  startTitle: string | null;
  shuffled: boolean;
}

interface PlayChoiceModalState {
  open: boolean;
  pendingSong: MediaItem | null;
  pendingCollection: PendingCollection | null;
}

export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerContextType {
  // Playback state
  isPlaying: boolean;
  isExpanded: boolean;
  currentMedia: NormalizedTrack | null;
  /** Milliseconds. */
  position: number;
  /** Milliseconds. */
  duration: number;
  loading: boolean;
  isBuffering: boolean;
  autoplay: boolean;
  repeatMode: RepeatMode;

  // Queue state
  queue: NormalizedTrack[];
  currentIndex: number;
  queueSource: string | null;
  isShuffled: boolean;

  playChoiceModal: PlayChoiceModalState;

  // Library
  playlists: TransformedPlaylist[];
  followedPlaylists: TransformedPlaylist[];
  showPlaylistManager: boolean;
  blockedSongIds: Set<string>;
  isTrackBlocked: (track: any) => boolean;
  loadBlockedSongs: () => Promise<void>;

  // Playback controls
  playMedia: (media: MediaItem, newQueue?: MediaItem[], source?: string | null) => void;
  requestPlay: (song: MediaItem) => void;
  requestPlayCollection: (args: { tracks: MediaItem[]; playlist?: { playlistId?: string; id?: string; name?: string; coverUrl?: string | null } | null; startIndex?: number; shuffle?: boolean }) => void;
  confirmPlayNow: () => void;
  confirmAddToQueue: () => void;
  cancelPlayChoice: () => void;
  togglePlayPause: () => Promise<void>;
  next: () => void;
  prev: () => void;
  seekTo: (positionMs: number) => Promise<void>;
  setAutoplay: (on: boolean) => void;
  cycleRepeat: () => void;

  // Queue ops
  playQueueIndex: (index: number) => void;
  playNext: (song: MediaItem, origin?: QueueOrigin | null) => void;
  playLater: (song: MediaItem, origin?: QueueOrigin | null) => void;
  removeFromQueue: (index: number) => void;
  removeQueueItems: (qids: string[]) => void;
  reorderQueue: (fromIndexOrQueue: number | NormalizedTrack[], toIndex?: number) => void;
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  clearQueue: (opts?: { silent?: boolean }) => Promise<void>;
  toggleShuffle: () => void;
  saveQueueAsPlaylist: (name: string) => Promise<string | undefined>;

  // UI
  toggleExpand: () => void;
  setExpanded: (v: boolean) => void;
  openPlaylistManager: () => void;
  closePlaylistManager: () => void;

  clearPlayer: () => Promise<void>;

  // Playlist CRUD
  createPlaylist: (name: string, type?: string, options?: { visibility?: string; description?: string | null; jurisdictionId?: string | null; coverImageUrl?: string | null }) => Promise<void>;
  addToPlaylist: (playlistId: string, track: MediaItem) => Promise<void>;
  removeFromPlaylist: (playlistId: string, playlistItemId: string) => Promise<void>;
  reorderPlaylist: (playlistId: string, newOrderedTracks: { playlistItemId?: string }[]) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  updatePlaylist: (playlistId: string, updates: any) => Promise<void>;
  updatePlaylistName: (playlistId: string, newName: string) => Promise<void>;
  loadPlaylist: (playlist: any) => Promise<void>;
  refreshPlaylists: () => Promise<void>;

  // Following + community
  loadFollowedPlaylists: () => Promise<void>;
  loadPlaylistDetails: (playlistId: string) => Promise<TransformedPlaylist | null>;
  followPlaylist: (playlistId: string) => Promise<void>;
  unfollowPlaylist: (playlistId: string) => Promise<void>;
  suggestSong: (playlistId: string, songId: string) => Promise<any>;
  voteOnSuggestion: (playlistId: string, itemId: string, voteType: string) => Promise<any>;
  blockSong: (songId: string) => Promise<void>;
  unblockSong: (songId: string) => Promise<void>;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export const usePlayer = (): PlayerContextType => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
};

// ─── Helpers ────────────────────────────────────────────────────────

const newQid = () => `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function fisherYatesShuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Any loose song object → a queue entry with absolute URLs and a fresh qid. */
const toQueueItem = (track: MediaItem, origin: QueueOrigin | null = null): NormalizedTrack => {
  const id = (track.songId || track.id) as string;
  const art = buildUrl(track.artworkUrl || track.artwork || null) || '';
  const url = buildUrl(track.url || track.fileUrl || null) || '';
  const jurisdiction = typeof track.jurisdiction === 'object' && track.jurisdiction ? track.jurisdiction.name : track.jurisdiction;
  const genre = typeof track.genre === 'object' && track.genre ? track.genre.name : track.genre;
  return {
    ...track,
    id,
    songId: id,
    qid: newQid(),
    origin,
    title: track.title || 'Untitled',
    artist: track.artist || track.artistName || '',
    artwork: art,
    artworkUrl: art,
    url,
    fileUrl: url,
    jurisdiction,
    genre,
  };
};

const quoted = (title?: string | null, fallback = 'Song') => (title ? `“${title}”` : fallback);
const songsWord = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`;

const transformSummary = (pl: any): TransformedPlaylist => ({
  id: pl.playlistId,
  playlistId: pl.playlistId,
  name: pl.name,
  type: pl.type || 'personal',
  visibility: pl.visibility || 'private',
  songCount: pl.songCount || 0,
  followerCount: pl.followerCount || 0,
  coverImageUrl: pl.coverImageUrl,
  creatorName: pl.creatorName,
  firstFourArtworks: pl.firstFourArtworks || [],
  updatedAt: pl.updatedAt,
  tracks: [],
});

/** Full playlist response → tracks with absolute URLs (web normalizePlaylistResponse). */
const normalizePlaylistResponse = (data: any): TransformedPlaylist | null => {
  if (!data) return null;
  return {
    ...data,
    id: data.playlistId,
    playlistId: data.playlistId,
    tracks: (data.tracks || []).map((t: any) => {
      const art = buildUrl(t.artworkUrl) || '';
      const url = buildUrl(t.fileUrl) || '';
      return {
        ...t,
        id: t.songId,
        songId: t.songId,
        qid: t.playlistItemId || t.songId,
        origin: null,
        title: t.title,
        artist: t.artistName,
        artworkUrl: art,
        artwork: art,
        fileUrl: url,
        url,
      };
    }),
  };
};

// ─── Provider ───────────────────────────────────────────────────────

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const feedback = useFeedback();

  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentMedia, setCurrentMedia] = useState<NormalizedTrack | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playChoiceModal, setPlayChoiceModal] = useState<PlayChoiceModalState>({
    open: false,
    pendingSong: null,
    pendingCollection: null,
  });

  const [queue, setQueue] = useState<NormalizedTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [queueSource, setQueueSource] = useState<string | null>(null);
  const [isShuffled, setIsShuffled] = useState(false);
  const [originalQueue, setOriginalQueue] = useState<NormalizedTrack[]>([]);
  const [autoplay, setAutoplay] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');

  const [playlists, setPlaylists] = useState<TransformedPlaylist[]>([]);
  const [followedPlaylists, setFollowedPlaylists] = useState<TransformedPlaylist[]>([]);
  const [blockedSongIds, setBlockedSongIds] = useState<Set<string>>(() => new Set());
  const [removedSongIds, setRemovedSongIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [showPlaylistManager, setShowPlaylistManager] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const loadSeq = useRef(0);
  // Bumped whenever a transition should (re)start audio for currentMedia.
  const [playToken, setPlayToken] = useState(0);
  const repeatModeRef = useRef<RepeatMode>('off');
  repeatModeRef.current = repeatMode;
  const nextRef = useRef<() => void>(() => {});

  // ─── Audio mode ────────────────────────────────────────────────
  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
    }).catch((error) => console.error('Failed to setup audio mode:', error));
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  // ─── Library loading ───────────────────────────────────────────
  const loadUserPlaylists = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get('/v1/playlists/mine');
      setPlaylists((res.data || []).map(transformSummary));
    } catch (error) {
      console.error('Failed to load playlists:', error);
      setPlaylists([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFollowedPlaylists = useCallback(async () => {
    try {
      const res = await axiosInstance.get('/v1/playlists/following');
      setFollowedPlaylists((res.data || []).map(transformSummary));
    } catch (error) {
      console.error('Failed to load followed playlists:', error);
      setFollowedPlaylists([]);
    }
  }, []);

  const loadBlockedSongs = useCallback(async () => {
    try {
      const res = await axiosInstance.get('/v1/playlists/blocked-songs');
      const ids = (res.data || []).map((b: any) => b.songId || b.song?.songId || b.id).filter(Boolean);
      setBlockedSongIds(new Set(ids));
    } catch (error) {
      // Leave the existing list alone — a blip must not un-block anything.
      console.error('Failed to load blocked songs:', error);
    }
  }, []);

  // ─── Audio core ────────────────────────────────────────────────
  const unload = useCallback(async () => {
    const s = soundRef.current;
    soundRef.current = null;
    if (s) {
      try { await s.stopAsync(); } catch { /* ignore */ }
      try { await s.unloadAsync(); } catch { /* ignore */ }
    }
  }, []);

  const handleLoadError = useCallback(
    async (media: NormalizedTrack) => {
      const songId = media?.id;
      if (!songId) return;
      const failed = () =>
        feedback.error(`Couldn’t play ${quoted(media.title, 'this song')}. Check your connection and try again.`, {
          id: 'player-play-error',
        });
      try {
        const res = await axiosInstance.get(`/v1/media/song/${songId}`);
        if (!res.data?.removed) { failed(); return; }
      } catch (err: any) {
        if (err?.response?.status !== 404) { failed(); return; }
      }
      feedback.info(`${quoted(media.title, 'A song in your queue')} is no longer on Unis — skipped`);
      setRemovedSongIds((prev) => (prev.has(songId) ? prev : new Set(prev).add(songId)));
    },
    [feedback],
  );

  const onStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if ((status as any).error) console.error('Playback error:', (status as any).error);
      return;
    }
    setIsPlaying(status.isPlaying);
    setIsBuffering(status.isBuffering);
    setPosition(status.positionMillis);
    setDuration(status.durationMillis || 0);
    if (status.didJustFinish && !status.isLooping) {
      if (repeatModeRef.current === 'one') {
        soundRef.current?.replayAsync().catch(() => {});
        return;
      }
      setIsPlaying(false);
      nextRef.current();
    }
  }, []);

  // Load + play whenever a transition asks for it (playToken) — one place
  // that touches expo-av, so rapid skips can't leave two sounds playing.
  useEffect(() => {
    if (playToken === 0) return;
    const media = currentMedia;
    const seq = ++loadSeq.current;
    (async () => {
      await unload();
      if (!media || !media.url || seq !== loadSeq.current) return;
      setPosition(0);
      setDuration(0);
      setIsBuffering(true);
      try {
        const { sound } = await Audio.Sound.createAsync({ uri: media.url }, { shouldPlay: true, progressUpdateIntervalMillis: 500 }, onStatus);
        if (seq !== loadSeq.current) {
          sound.unloadAsync().catch(() => {});
          return;
        }
        soundRef.current = sound;
        setIsPlaying(true);
      } catch (error) {
        console.error('Failed to load track:', error);
        if (seq === loadSeq.current) {
          setIsPlaying(false);
          setIsBuffering(false);
          handleLoadError(media);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playToken]);

  const go = useCallback((index: number, item: NormalizedTrack | null) => {
    setCurrentIndex(index);
    setCurrentMedia(item);
    setPlayToken((t) => t + 1);
  }, []);

  // ─── Blocked / removed ─────────────────────────────────────────
  const isTrackBlocked = useCallback(
    (track: any) => {
      if (!track) return false;
      const id = track.id || track.songId;
      return blockedSongIds.has(id) || removedSongIds.has(id);
    },
    [blockedSongIds, removedSongIds],
  );

  // ─── Transport ─────────────────────────────────────────────────
  const next = useCallback(() => {
    if (queue.length === 0) return;
    let idx = currentIndex + 1;
    while (idx < queue.length && isTrackBlocked(queue[idx])) idx++;

    if (idx >= queue.length) {
      if (repeatMode === 'all') {
        let wrapped = 0;
        while (wrapped <= currentIndex && isTrackBlocked(queue[wrapped])) wrapped++;
        if (wrapped > currentIndex || wrapped >= queue.length) {
          setIsPlaying(false);
          return;
        }
        go(wrapped, queue[wrapped]);
        return;
      }
      setIsPlaying(false);
      return;
    }
    go(idx, queue[idx]);
  }, [queue, currentIndex, repeatMode, isTrackBlocked, go]);
  nextRef.current = next;

  const prev = useCallback(() => {
    if (queue.length === 0) return;
    // Like the lock-screen rule on web: more than 3s in restarts the song.
    if (position > 3000 && soundRef.current) {
      soundRef.current.setPositionAsync(0).catch(() => {});
      return;
    }
    let idx = currentIndex;
    let steps = 0;
    do {
      idx = (idx - 1 + queue.length) % queue.length;
      steps++;
    } while (isTrackBlocked(queue[idx]) && steps < queue.length);
    if (isTrackBlocked(queue[idx])) return;
    go(idx, queue[idx]);
  }, [queue, currentIndex, isTrackBlocked, go, position]);

  const togglePlayPause = useCallback(async () => {
    const s = soundRef.current;
    if (!s) {
      // Nothing loaded (e.g. after an error) — load the current entry again.
      if (currentMedia) setPlayToken((t) => t + 1);
      return;
    }
    try {
      const status = await s.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) {
        await s.pauseAsync();
        setIsPlaying(false);
      } else {
        await s.playAsync();
        setIsPlaying(true);
      }
    } catch (err) {
      console.error('Play/pause failed:', err);
    }
  }, [currentMedia]);

  const seekTo = useCallback(async (positionMs: number) => {
    try {
      await soundRef.current?.setPositionAsync(Math.max(0, positionMs));
      setPosition(positionMs);
    } catch (err) {
      console.error('Seek failed:', err);
    }
  }, []);

  const cycleRepeat = useCallback(() => {
    const nextMode: RepeatMode = repeatModeRef.current === 'off' ? 'all' : repeatModeRef.current === 'all' ? 'one' : 'off';
    setRepeatMode(nextMode);
    feedback.info(nextMode === 'all' ? 'Repeating your queue' : nextMode === 'one' ? 'Repeating this song' : 'Repeat off', {
      id: 'player-repeat',
    });
  }, [feedback]);

  // ─── Queue engine ──────────────────────────────────────────────
  const playQueueIndex = useCallback((index: number) => {
    const item = queue[index];
    if (!item) return;
    go(index, item);
  }, [queue, go]);

  const insertCollection = useCallback(
    (collection: PendingCollection, mode: 'empty' | 'now' | 'end') => {
      const items = (collection?.tracks || []).map((t) => toQueueItem(t, collection.origin));
      if (items.length === 0) return;

      let first = 0;
      if (!collection.startTitle) {
        const i = items.findIndex((t) => !isTrackBlocked(t));
        first = i >= 0 ? i : 0;
      }

      if (mode === 'empty' || queue.length === 0) {
        setQueue(items);
        setOriginalQueue(items);
        setIsShuffled(false);
        setQueueSource(null);
        go(first, items[first]);
        return;
      }

      if (mode === 'now') {
        const insertAt = Math.min(currentIndex + 1, queue.length);
        const nq = [...queue];
        nq.splice(insertAt, 0, ...items);
        setQueue(nq);
        setOriginalQueue(isShuffled ? [...originalQueue, ...items] : nq);
        const target = insertAt + first;
        go(target, nq[target]);
        return;
      }

      setQueue((p) => [...p, ...items]);
      setOriginalQueue((p) => [...p, ...items]);
    },
    [queue, originalQueue, currentIndex, isShuffled, isTrackBlocked, go],
  );

  const requestPlay = useCallback(
    (song: MediaItem) => {
      if (!song) return;
      if (queue.length === 0) {
        const item = toQueueItem(song, null);
        setQueue([item]);
        setOriginalQueue([item]);
        setIsShuffled(false);
        setQueueSource(null);
        go(0, item);
        return;
      }
      setPlayChoiceModal({ open: true, pendingSong: song, pendingCollection: null });
    },
    [queue.length, go],
  );

  const requestPlayCollection = useCallback(
    ({ tracks, playlist, startIndex = 0, shuffle = false }: {
      tracks: MediaItem[];
      playlist?: { playlistId?: string; id?: string; name?: string; coverUrl?: string | null } | null;
      startIndex?: number;
      shuffle?: boolean;
    }) => {
      const playable = (tracks || []).filter((t) => t && (t.url || t.fileUrl));
      if (playable.length === 0) return;

      const from = Math.max(0, Math.min(startIndex, playable.length - 1));
      const ordered = shuffle ? fisherYatesShuffle(playable) : playable.slice(from);

      const origin: QueueOrigin | null = playlist
        ? {
            type: 'playlist',
            playlistId: (playlist.playlistId || playlist.id) as string,
            name: playlist.name || 'Playlist',
            coverUrl: playlist.coverUrl || null,
            batchId: newQid(),
          }
        : null;

      const collection: PendingCollection = {
        tracks: ordered,
        origin,
        title: playlist?.name || 'Playlist',
        artwork: playlist?.coverUrl || ordered[0]?.artworkUrl || ordered[0]?.artwork || null,
        startTitle: !shuffle && from > 0 ? ordered[0]?.title || null : null,
        shuffled: shuffle,
      };

      if (queue.length === 0) {
        insertCollection(collection, 'empty');
        return;
      }
      setPlayChoiceModal({ open: true, pendingSong: null, pendingCollection: collection });
    },
    [queue.length, insertCollection],
  );

  const closePlayChoice = () => setPlayChoiceModal({ open: false, pendingSong: null, pendingCollection: null });

  const confirmPlayNow = useCallback(() => {
    const { pendingSong, pendingCollection } = playChoiceModal;
    closePlayChoice();
    if (pendingCollection) {
      insertCollection(pendingCollection, 'now');
      feedback.success(`Playing ${quoted(pendingCollection.title, 'playlist')}`);
      return;
    }
    if (!pendingSong) return;
    const item = toQueueItem(pendingSong, null);
    const insertAt = Math.min(currentIndex + 1, queue.length);
    const nq = [...queue];
    nq.splice(insertAt, 0, item);
    setQueue(nq);
    setOriginalQueue(isShuffled ? [...originalQueue, item] : nq);
    go(insertAt, item);
  }, [playChoiceModal, insertCollection, queue, originalQueue, currentIndex, isShuffled, go, feedback]);

  const confirmAddToQueue = useCallback(() => {
    const { pendingSong, pendingCollection } = playChoiceModal;
    closePlayChoice();
    if (pendingCollection) {
      insertCollection(pendingCollection, 'end');
      const n = pendingCollection.tracks?.length || 0;
      feedback.success(`Added ${quoted(pendingCollection.title, 'playlist')} to your queue · ${songsWord(n)}`);
      return;
    }
    if (!pendingSong) return;
    const item = toQueueItem(pendingSong, null);
    setQueue((p) => [...p, item]);
    setOriginalQueue((p) => [...p, item]);
    feedback.success(`Added ${quoted(pendingSong.title)} to your queue`);
  }, [playChoiceModal, insertCollection, feedback]);

  const cancelPlayChoice = useCallback(() => closePlayChoice(), []);

  /** Legacy entry point. Jumps to a queued entry, or plays a song now. */
  const playMedia = useCallback(
    (media: MediaItem, newQueue: MediaItem[] = [], sourceName: string | null = null) => {
      if (!media) return;
      if (newQueue.length > 0) {
        const items = newQueue.map((t) => toQueueItem(t, null));
        const found = items.findIndex((t) => t.id === (media.songId || media.id));
        const startIdx = found >= 0 ? found : 0;
        setQueue(items);
        setOriginalQueue(items);
        setIsShuffled(false);
        setQueueSource(sourceName);
        go(startIdx, items[startIdx]);
        return;
      }
      let idx = media.qid ? queue.findIndex((t) => t.qid === media.qid) : -1;
      if (idx < 0) idx = queue.findIndex((t) => t.id === (media.songId || media.id));
      if (idx >= 0) {
        go(idx, queue[idx]);
        return;
      }
      requestPlay(media);
    },
    [queue, go, requestPlay],
  );

  const playNext = useCallback(
    (song: MediaItem, origin: QueueOrigin | null = null) => {
      if (!song) return;
      const item = toQueueItem(song, origin);
      const insertInto = (list: NormalizedTrack[]) => {
        const nq = [...list];
        nq.splice(Math.min(currentIndex + 1, list.length), 0, item);
        return nq;
      };
      setQueue(insertInto);
      setOriginalQueue((p) => (isShuffled ? [...p, item] : insertInto(p)));
      feedback.success(`${quoted(song.title)} plays next`);
    },
    [currentIndex, isShuffled, feedback],
  );

  const playLater = useCallback(
    (song: MediaItem, origin: QueueOrigin | null = null) => {
      if (!song) return;
      const item = toQueueItem(song, origin);
      setQueue((p) => [...p, item]);
      setOriginalQueue((p) => [...p, item]);
      feedback.success(`Added ${quoted(song.title)} to your queue`);
    },
    [feedback],
  );

  /** Remove entries by qid. The playing entry is never removed. */
  const removeQueueItemsQuiet = useCallback(
    (qids: string[]): NormalizedTrack[] => {
      const drop = new Set(qids || []);
      const current = queue[currentIndex];
      if (current) drop.delete(current.qid);
      if (drop.size === 0) return [];
      const removed = queue.filter((t) => drop.has(t.qid));
      const nq = queue.filter((t) => !drop.has(t.qid));
      const newIndex = current ? nq.findIndex((t) => t.qid === current.qid) : 0;
      setQueue(nq);
      setOriginalQueue((p) => p.filter((t) => !drop.has(t.qid)));
      setCurrentIndex(newIndex >= 0 ? newIndex : 0);
      return removed;
    },
    [queue, currentIndex],
  );

  const removeQueueItems = useCallback(
    (qids: string[]) => {
      const removed = removeQueueItemsQuiet(qids);
      if (removed.length === 1) feedback.success(`Removed ${quoted(removed[0].title)} from your queue`);
      else if (removed.length > 1) feedback.success(`Removed ${songsWord(removed.length)} from your queue`);
    },
    [removeQueueItemsQuiet, feedback],
  );

  const removeFromQueue = useCallback(
    (index: number) => {
      const item = queue[index];
      if (item) removeQueueItems([item.qid]);
    },
    [queue, removeQueueItems],
  );

  const applyOrder = useCallback(
    (nq: NormalizedTrack[]) => {
      const current = queue[currentIndex];
      setQueue(nq);
      if (!isShuffled) setOriginalQueue(nq);
      const newIndex = current ? nq.findIndex((t) => t.qid === current.qid) : -1;
      setCurrentIndex(newIndex >= 0 ? newIndex : 0);
    },
    [queue, currentIndex, isShuffled],
  );

  const moveQueueItem = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= queue.length || toIndex >= queue.length) return;
      const nq = [...queue];
      const [moved] = nq.splice(fromIndex, 1);
      nq.splice(toIndex, 0, moved);
      applyOrder(nq);
    },
    [queue, applyOrder],
  );

  /** reorderQueue(newQueue) like web, or reorderQueue(from, to) like the old mobile API. */
  const reorderQueue = useCallback(
    (fromOrQueue: number | NormalizedTrack[], toIndex?: number) => {
      if (Array.isArray(fromOrQueue)) applyOrder(fromOrQueue);
      else if (typeof toIndex === 'number') moveQueueItem(fromOrQueue, toIndex);
    },
    [applyOrder, moveQueueItem],
  );

  const clearQueue = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const hadSongs = queue.length > 0;
      loadSeq.current++;
      await unload();
      setQueue([]);
      setOriginalQueue([]);
      setCurrentIndex(0);
      setCurrentMedia(null);
      setQueueSource(null);
      setIsShuffled(false);
      setIsPlaying(false);
      setPosition(0);
      setDuration(0);
      if (hadSongs && !silent) feedback.success('Queue cleared');
    },
    [queue.length, unload, feedback],
  );

  const toggleShuffle = useCallback(() => {
    const current = queue[currentIndex];
    if (isShuffled) {
      setQueue(originalQueue);
      setIsShuffled(false);
      const newIndex = current ? originalQueue.findIndex((t) => t.qid === current.qid) : -1;
      setCurrentIndex(newIndex >= 0 ? newIndex : 0);
      feedback.info('Shuffle off', { id: 'player-shuffle' });
    } else {
      const rest = queue.filter((_, i) => i !== currentIndex);
      setOriginalQueue(queue);
      setQueue(current ? [current, ...fisherYatesShuffle(rest)] : fisherYatesShuffle(rest));
      setIsShuffled(true);
      setCurrentIndex(0);
      feedback.info('Shuffle on', { id: 'player-shuffle' });
    }
  }, [queue, currentIndex, isShuffled, originalQueue, feedback]);

  const saveQueueAsPlaylist = useCallback(
    async (name: string) => {
      if (queue.length === 0) throw new Error('Queue is empty');
      const createRes = await axiosInstance.post('/v1/playlists', { name });
      const newPlaylistId = createRes.data?.playlistId;
      let failed = 0;
      for (const track of queue) {
        const songId = track.songId || track.id;
        if (!songId) continue;
        try {
          await axiosInstance.post(`/v1/playlists/${newPlaylistId}/tracks`, { songId });
        } catch (err: any) {
          const data = err?.response?.data;
          const msg = typeof data === 'string' ? data : data?.message || '';
          if (!msg.includes('already in')) failed += 1;
        }
      }
      if (failed > 0) feedback.error(`${songsWord(failed)} couldn’t be added to “${name}”`);
      await loadUserPlaylists();
      return newPlaylistId;
    },
    [queue, feedback, loadUserPlaylists],
  );

  // ─── Removed songs: skip + drop ────────────────────────────────
  useEffect(() => {
    if (removedSongIds.size === 0) return;
    const currentId = currentMedia?.id;
    if (currentId && removedSongIds.has(currentId)) {
      next();
      return;
    }
    const stale = queue.filter((t) => removedSongIds.has(t.id)).map((t) => t.qid);
    if (stale.length > 0) removeQueueItemsQuiet(stale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removedSongIds, currentMedia]);

  // ─── Session lifecycle ─────────────────────────────────────────
  const clearPlayer = useCallback(async () => {
    loadSeq.current++;
    await unload();
    setCurrentMedia(null);
    setQueue([]);
    setOriginalQueue([]);
    setCurrentIndex(0);
    setQueueSource(null);
    setIsShuffled(false);
    setIsPlaying(false);
    setIsBuffering(false);
    setIsExpanded(false);
    setPosition(0);
    setDuration(0);
    setPlaylists([]);
    setFollowedPlaylists([]);
    setBlockedSongIds(new Set());
    setShowPlaylistManager(false);
    setPlayChoiceModal({ open: false, pendingSong: null, pendingCollection: null });
  }, [unload]);

  useEffect(() => {
    if (user?.userId) {
      loadUserPlaylists();
      loadFollowedPlaylists();
      loadBlockedSongs();
    }
  }, [user?.userId, loadUserPlaylists, loadFollowedPlaylists, loadBlockedSongs]);

  // ─── Playlist CRUD ─────────────────────────────────────────────
  const loadPlaylistDetails = useCallback(async (playlistId: string) => {
    try {
      const res = await axiosInstance.get(`/v1/playlists/${playlistId}`);
      return normalizePlaylistResponse(res.data);
    } catch (error) {
      console.error('Failed to load playlist details:', error);
      return null;
    }
  }, []);

  const createPlaylist = async (
    name: string,
    type = 'personal',
    options: { visibility?: string; description?: string | null; jurisdictionId?: string | null; coverImageUrl?: string | null } = {},
  ) => {
    await axiosInstance.post('/v1/playlists', {
      name,
      type,
      visibility: options.visibility || 'private',
      description: options.description || null,
      jurisdictionId: options.jurisdictionId || null,
      coverImageUrl: options.coverImageUrl || null,
    });
    await loadUserPlaylists();
  };

  const addToPlaylist = async (playlistId: string, track: MediaItem) => {
    const songId = track.songId || track.id;
    await axiosInstance.post(`/v1/playlists/${playlistId}/tracks`, { songId });
    await loadUserPlaylists();
  };

  const removeFromPlaylist = async (playlistId: string, playlistItemId: string) => {
    await axiosInstance.delete(`/v1/playlists/${playlistId}/tracks/${playlistItemId}`);
    await loadUserPlaylists();
  };

  const reorderPlaylist = async (playlistId: string, newOrderedTracks: { playlistItemId?: string }[]) => {
    const orderedIds = newOrderedTracks.map((t) => t.playlistItemId).filter(Boolean);
    await axiosInstance.put(`/v1/playlists/${playlistId}/reorder`, orderedIds);
    await loadUserPlaylists();
  };

  const deletePlaylist = async (playlistId: string) => {
    await axiosInstance.delete(`/v1/playlists/${playlistId}`);
    await loadUserPlaylists();
  };

  const updatePlaylist = async (playlistId: string, updates: any) => {
    const payload = typeof updates === 'string' ? { name: updates } : updates;
    await axiosInstance.put(`/v1/playlists/${playlistId}`, payload);
    await loadUserPlaylists();
  };

  const followPlaylist = async (playlistId: string) => {
    await axiosInstance.post(`/v1/playlists/${playlistId}/follow`);
    await loadFollowedPlaylists();
  };

  const unfollowPlaylist = async (playlistId: string) => {
    await axiosInstance.delete(`/v1/playlists/${playlistId}/follow`);
    await loadFollowedPlaylists();
  };

  const suggestSong = async (playlistId: string, songId: string) => {
    const res = await axiosInstance.post(`/v1/playlists/${playlistId}/suggest`, { songId });
    return res.data;
  };

  const voteOnSuggestion = async (playlistId: string, itemId: string, voteType: string) => {
    const res = await axiosInstance.post(`/v1/playlists/${playlistId}/tracks/${itemId}/vote`, { voteType });
    return res.data;
  };

  const blockSong = async (songId: string) => {
    await axiosInstance.post('/v1/playlists/blocked-songs', { songId });
    setBlockedSongIds((p) => new Set(p).add(songId));
  };

  const unblockSong = async (songId: string) => {
    await axiosInstance.delete(`/v1/playlists/blocked-songs/${songId}`);
    setBlockedSongIds((p) => {
      const n = new Set(p);
      n.delete(songId);
      return n;
    });
  };

  /** Pours a playlist into the queue (never replaces it). */
  const loadPlaylist = async (pl: any) => {
    if (!pl) return;
    const full = pl.tracks && pl.tracks.length > 0 ? pl : await loadPlaylistDetails(pl.playlistId || pl.id);
    if (!full || !full.tracks || full.tracks.length === 0) return;
    requestPlayCollection({
      tracks: full.tracks,
      playlist: {
        playlistId: full.playlistId || full.id,
        name: full.name,
        coverUrl: full.coverImageUrl ? buildUrl(full.coverImageUrl) : null,
      },
    });
  };

  const openPlaylistManager = useCallback(() => {
    setShowPlaylistManager(true);
    if (user?.userId && playlists.length === 0 && !loading) {
      loadUserPlaylists();
      loadFollowedPlaylists();
    }
  }, [user?.userId, playlists.length, loading, loadUserPlaylists, loadFollowedPlaylists]);

  const value: PlayerContextType = {
    isPlaying,
    isExpanded,
    currentMedia,
    position,
    duration,
    loading,
    isBuffering,
    autoplay,
    repeatMode,

    queue,
    currentIndex,
    queueSource,
    isShuffled,

    playChoiceModal,

    playlists,
    followedPlaylists,
    showPlaylistManager,
    blockedSongIds,
    isTrackBlocked,
    loadBlockedSongs,

    playMedia,
    requestPlay,
    requestPlayCollection,
    confirmPlayNow,
    confirmAddToQueue,
    cancelPlayChoice,
    togglePlayPause,
    next,
    prev,
    seekTo,
    setAutoplay,
    cycleRepeat,

    playQueueIndex,
    playNext,
    playLater,
    removeFromQueue,
    removeQueueItems,
    reorderQueue,
    moveQueueItem,
    clearQueue,
    toggleShuffle,
    saveQueueAsPlaylist,

    toggleExpand: () => setIsExpanded((v) => !v),
    setExpanded: setIsExpanded,
    openPlaylistManager,
    closePlaylistManager: () => setShowPlaylistManager(false),

    clearPlayer,

    createPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    reorderPlaylist,
    deletePlaylist,
    updatePlaylist,
    updatePlaylistName: (id, name) => updatePlaylist(id, { name }),
    loadPlaylist,
    refreshPlaylists: loadUserPlaylists,

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
