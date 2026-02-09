// src/context/PlayerContext.tsx
// Ported from web - uses expo-av instead of HTML5 <audio>

import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as SecureStore from 'expo-secure-store';
import playlistService, { Playlist, Track } from '../services/playlistService';
import { getMediaUrl } from '../services/axiosInstance';

// Types for our media/track objects
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
}

// Normalized track type (consistent field names)
interface NormalizedTrack {
  id: string;
  songId: string;
  playlistItemId?: string;
  title: string;
  artist: string;
  artwork: string;
  url: string;
  duration?: number;
  jurisdiction?: string;
}

// Transform playlist from backend format to normalized format
const transformPlaylist = (pl: Playlist) => ({
  id: pl.playlistId,
  playlistId: pl.playlistId,
  name: pl.name,
  tracks: pl.tracks.map(track => normalizeTrack(track))
});

// Normalize a track/media item to consistent field names
const normalizeTrack = (track: Track | MediaItem): NormalizedTrack => ({
  id: (track as any).songId || (track as any).id,
  songId: (track as any).songId || (track as any).id,
  playlistItemId: (track as any).playlistItemId,
  title: track.title,
  artist: (track as any).artistName || (track as any).artist || '',
  artwork: getMediaUrl((track as any).artworkUrl || (track as any).artwork) || '',
  url: getMediaUrl((track as any).fileUrl || (track as any).url) || '',
  duration: track.duration,
  jurisdiction: track.jurisdiction
});

interface TransformedPlaylist {
  id: string;
  playlistId: string;
  name: string;
  tracks: NormalizedTrack[];
}

interface PlayerContextType {
  // Playback state
  isPlaying: boolean;
  isExpanded: boolean;
  currentMedia: NormalizedTrack | null;
  playlist: NormalizedTrack[];
  currentIndex: number;
  
  // Playback position
  position: number;
  duration: number;
  
  // Loading states
  loading: boolean;
  isBuffering: boolean;
  
  // Playlist management
  playlists: TransformedPlaylist[];
  showPlaylistManager: boolean;
  
  // Playback controls
  playMedia: (media: MediaItem, newPlaylist?: MediaItem[]) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  
  // UI controls
  toggleExpand: () => void;
  openPlaylistManager: () => void;
  closePlaylistManager: () => void;
  
  // Playlist operations
  createPlaylist: (name: string) => Promise<void>;
  addToPlaylist: (playlistId: string, track: MediaItem) => Promise<void>;
  removeFromPlaylist: (playlistId: string, playlistItemId: string) => Promise<void>;
  reorderPlaylist: (playlistId: string, newOrderedTracks: NormalizedTrack[]) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  updatePlaylistName: (playlistId: string, newName: string) => Promise<void>;
  loadPlaylist: (playlist: TransformedPlaylist) => void;
  refreshPlaylists: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export const usePlayer = (): PlayerContextType => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within PlayerProvider');
  }
  return context;
};

interface PlayerProviderProps {
  children: React.ReactNode;
}

export const PlayerProvider: React.FC<PlayerProviderProps> = ({ children }) => {
  // Playback state
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentMedia, setCurrentMedia] = useState<NormalizedTrack | null>(null);
  const [playlist, setPlaylist] = useState<NormalizedTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Playback position
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Playlist state
  const [playlists, setPlaylists] = useState<TransformedPlaylist[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPlaylistManager, setShowPlaylistManager] = useState(false);
  
  // Audio reference - using useRef to persist across renders
  const soundRef = useRef<Audio.Sound | null>(null);

  // Configure audio mode on mount
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
    
    // Cleanup on unmount
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  // Load playlists on mount (only if authenticated)
  useEffect(() => {
    const loadPlaylists = async () => {
      const token = await SecureStore.getItemAsync('token');
      if (token) {
        console.log('Token found, loading playlists');
        await loadUserPlaylists();
      } else {
        console.log('No token found, skipping playlist load');
      }
    };
    
    loadPlaylists();
  }, []);

  // Playback status update handler
  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      // Error handling
      if (status.error) {
        console.error('Playback error:', status.error);
      }
      return;
    }

    setIsPlaying(status.isPlaying);
    setIsBuffering(status.isBuffering);
    setPosition(status.positionMillis);
    setDuration(status.durationMillis || 0);

    // Handle track ended
    if (status.didJustFinish && !status.isLooping) {
      console.log('Track finished, playing next');
      handleTrackEnd();
    }
  }, [playlist.length]);

  const handleTrackEnd = useCallback(async () => {
    if (playlist.length > 1) {
      const nextIndex = (currentIndex + 1) % playlist.length;
      await playTrackAtIndex(nextIndex);
    } else {
      setIsPlaying(false);
    }
  }, [playlist, currentIndex]);

  // Load and play a track
  const loadAndPlayTrack = async (track: NormalizedTrack) => {
    try {
      // Unload previous sound
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      console.log('Loading track:', track.title, track.url);

      // Create and load new sound
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.url },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );

      soundRef.current = sound;
      setCurrentMedia(track);
      setIsPlaying(true);
      
    } catch (error) {
      console.error('Failed to load track:', error);
      setIsPlaying(false);
    }
  };

  const playTrackAtIndex = async (index: number) => {
    if (playlist[index]) {
      setCurrentIndex(index);
      await loadAndPlayTrack(playlist[index]);
    }
  };

  // Public API: Play media
  const playMedia = async (media: MediaItem, newPlaylist: MediaItem[] = []) => {
    const normalizedMedia = normalizeTrack(media as any);
    
    if (newPlaylist.length > 0) {
      const normalizedPlaylist = newPlaylist.map(t => normalizeTrack(t as any));
      setPlaylist(normalizedPlaylist);
      const index = normalizedPlaylist.findIndex(t => t.id === normalizedMedia.id);
      setCurrentIndex(index >= 0 ? index : 0);
    } else {
      // Find in existing playlist or set as single track
      const existingIndex = playlist.findIndex(t => t.id === normalizedMedia.id);
      if (existingIndex >= 0) {
        setCurrentIndex(existingIndex);
      } else {
        setPlaylist([normalizedMedia]);
        setCurrentIndex(0);
      }
    }

    await loadAndPlayTrack(normalizedMedia);
  };

  // Toggle play/pause
  const togglePlayPause = useCallback(async () => {
    if (!soundRef.current) {
      // No sound loaded, try to load current media
      if (currentMedia) {
        await loadAndPlayTrack(currentMedia);
      }
      return;
    }

    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;

    if (status.isPlaying) {
      await soundRef.current.pauseAsync();
    } else {
      await soundRef.current.playAsync();
    }
  }, [currentMedia]);

  // Next track
  const next = async () => {
    if (playlist.length === 0) return;
    const nextIndex = (currentIndex + 1) % playlist.length;
    await playTrackAtIndex(nextIndex);
  };

  // Previous track
  const prev = async () => {
    if (playlist.length === 0) return;
    const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    await playTrackAtIndex(prevIndex);
  };

  // Seek to position
  const seekTo = async (positionMs: number) => {
    if (soundRef.current) {
      await soundRef.current.setPositionAsync(positionMs);
    }
  };

  // Toggle expanded view
  const toggleExpand = () => setIsExpanded(!isExpanded);

  // Playlist management functions
  const loadUserPlaylists = async () => {
    const token = await SecureStore.getItemAsync('token');
    if (!token) {
      console.log('No token, aborting playlist load');
      return;
    }

    try {
      setLoading(true);
      const data = await playlistService.getUserPlaylists();
      console.log('Raw playlist data from backend:', data);
      
      const transformed = data.map(transformPlaylist);
      console.log('Transformed playlists:', transformed);
      setPlaylists(transformed);
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

  const reorderPlaylist = async (playlistId: string, newOrderedTracks: NormalizedTrack[]) => {
    try {
      const orderedIds = newOrderedTracks.map(t => t.playlistItemId!).filter(Boolean);
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
    setPlaylist(pl.tracks);
    setCurrentIndex(0);
    if (pl.tracks.length > 0) {
      setCurrentMedia(pl.tracks[0]);
    }
  };

  const value: PlayerContextType = {
    // Playback state
    isPlaying,
    isExpanded,
    currentMedia,
    playlist,
    currentIndex,
    
    // Playback position
    position,
    duration,
    
    // Loading states
    loading,
    isBuffering,
    
    // Playlist management
    playlists,
    showPlaylistManager,
    
    // Playback controls
    playMedia,
    togglePlayPause,
    next,
    prev,
    seekTo,
    
    // UI controls
    toggleExpand,
    openPlaylistManager: () => setShowPlaylistManager(true),
    closePlaylistManager: () => setShowPlaylistManager(false),
    
    // Playlist operations
    createPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    reorderPlaylist,
    deletePlaylist,
    updatePlaylistName,
    loadPlaylist,
    refreshPlaylists: loadUserPlaylists,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
};

export default PlayerContext;