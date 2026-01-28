// src/services/playlistService.ts
// Ported from web - identical API calls, just TypeScript

import axiosInstance from './axiosInstance';

// Types
export interface Track {
  songId: string;
  playlistItemId: string;
  title: string;
  jurisdiction?: string;
  artistName: string;
  artworkUrl?: string;
  fileUrl: string;
  duration?: number;
}

export interface Playlist {
  playlistId: string;
  name: string;
  tracks: Track[];
}

const playlistService = {
  // Get all playlists for the current user
  getUserPlaylists: async (): Promise<Playlist[]> => {
    const response = await axiosInstance.get('/playlists');
    return response.data;
  },

  // Get a specific playlist with all its tracks
  getPlaylistById: async (playlistId: string): Promise<Playlist> => {
    const response = await axiosInstance.get(`/playlists/${playlistId}`);
    return response.data;
  },

  // Create a new playlist
  createPlaylist: async (name: string): Promise<Playlist> => {
    const response = await axiosInstance.post('/playlists', { name });
    return response.data;
  },

  // Update playlist name
  updatePlaylist: async (playlistId: string, name: string): Promise<Playlist> => {
    const response = await axiosInstance.put(`/playlists/${playlistId}`, { name });
    return response.data;
  },

  // Delete a playlist
  deletePlaylist: async (playlistId: string): Promise<void> => {
    await axiosInstance.delete(`/playlists/${playlistId}`);
  },

  // Add a track to a playlist
  addTrackToPlaylist: async (playlistId: string, songId: string): Promise<Track> => {
    const response = await axiosInstance.post(`/playlists/${playlistId}/tracks`, { songId });
    return response.data;
  },

  // Remove a track from a playlist
  removeTrackFromPlaylist: async (playlistId: string, playlistItemId: string): Promise<void> => {
    await axiosInstance.delete(`/playlists/${playlistId}/tracks/${playlistItemId}`);
  },

  // Reorder tracks in a playlist
  reorderPlaylist: async (playlistId: string, orderedItemIds: string[]): Promise<Playlist> => {
    const response = await axiosInstance.put(`/playlists/${playlistId}/reorder`, orderedItemIds);
    return response.data;
  }
};

export default playlistService;