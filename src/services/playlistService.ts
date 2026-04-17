// src/services/playlistService.ts
// Extended for Phase B — adds follow/unfollow, suggestions, and blocking.
//
// Route convention: `/playlists/...` (matching existing mobile convention).
// If the backend requires `/v1/playlists/...`, swap the prefix in one place
// at the top of each method body.

import axiosInstance from './axiosInstance';

// ─── Types ──────────────────────────────────────────────────────────

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

/**
 * Shape returned by the suggestions endpoint. Exact fields may vary — this is
 * a best guess based on the web doc. Refine once you've seen a live response.
 */
export interface SongSuggestion {
  suggestionId: string;
  songId: string;
  suggestedByUserId?: string;
  voteCount?: number;
  createdAt?: string;
}

// ─── Service ────────────────────────────────────────────────────────

const playlistService = {
  // ─── Existing methods (unchanged) ─────────────────────────────────

  getUserPlaylists: async (): Promise<Playlist[]> => {
    const response = await axiosInstance.get('/playlists');
    return response.data;
  },

  getPlaylistById: async (playlistId: string): Promise<Playlist> => {
    const response = await axiosInstance.get(`/playlists/${playlistId}`);
    return response.data;
  },

  createPlaylist: async (name: string): Promise<Playlist> => {
    const response = await axiosInstance.post('/playlists', { name });
    return response.data;
  },

  updatePlaylist: async (playlistId: string, name: string): Promise<Playlist> => {
    const response = await axiosInstance.put(`/playlists/${playlistId}`, { name });
    return response.data;
  },

  deletePlaylist: async (playlistId: string): Promise<void> => {
    await axiosInstance.delete(`/playlists/${playlistId}`);
  },

  addTrackToPlaylist: async (playlistId: string, songId: string): Promise<Track> => {
    const response = await axiosInstance.post(`/playlists/${playlistId}/tracks`, { songId });
    return response.data;
  },

  removeTrackFromPlaylist: async (
    playlistId: string,
    playlistItemId: string,
  ): Promise<void> => {
    await axiosInstance.delete(`/playlists/${playlistId}/tracks/${playlistItemId}`);
  },

  reorderPlaylist: async (
    playlistId: string,
    orderedItemIds: string[],
  ): Promise<Playlist> => {
    const response = await axiosInstance.put(
      `/playlists/${playlistId}/reorder`,
      orderedItemIds,
    );
    return response.data;
  },

  // ─── Phase B: Followed playlists ─────────────────────────────────

  /** GET all playlists the current user is following. */
  getFollowedPlaylists: async (): Promise<Playlist[]> => {
    const response = await axiosInstance.get('/playlists/following');
    return response.data;
  },

  /** Follow a playlist. */
  followPlaylist: async (playlistId: string): Promise<void> => {
    await axiosInstance.post(`/playlists/${playlistId}/follow`);
  },

  /** Unfollow a playlist. */
  unfollowPlaylist: async (playlistId: string): Promise<void> => {
    await axiosInstance.delete(`/playlists/${playlistId}/follow`);
  },

  // ─── Phase B: Community suggestions ──────────────────────────────
  //
  // Request body shapes below are best-guess based on the API reference.
  // If the backend rejects them (400), check the Spring controller for the
  // expected DTO and adjust accordingly.

  /** Suggest a song be added to a playlist (community-editable playlists). */
  suggestSong: async (
    playlistId: string,
    songId: string,
  ): Promise<SongSuggestion> => {
    const response = await axiosInstance.post(
      `/playlists/${playlistId}/suggestions`,
      { songId },
    );
    return response.data;
  },

  /**
   * Vote on a song suggestion. Pass `direction` if the backend supports
   * up/down; omit for simple upvote-only endpoints.
   */
  voteOnSuggestion: async (
    playlistId: string,
    suggestionId: string,
    direction?: 'up' | 'down',
  ): Promise<void> => {
    const body = direction ? { direction } : undefined;
    await axiosInstance.post(
      `/playlists/${playlistId}/suggestions/${suggestionId}/vote`,
      body,
    );
  },

  // ─── Phase B: Song blocking ──────────────────────────────────────

  /** Block a song from appearing in a playlist (for community playlists). */
  blockSong: async (playlistId: string, songId: string): Promise<void> => {
    await axiosInstance.post(`/playlists/${playlistId}/block`, { songId });
  },

  /** Unblock a previously-blocked song. */
  unblockSong: async (playlistId: string, songId: string): Promise<void> => {
    await axiosInstance.delete(`/playlists/${playlistId}/block/${songId}`);
  },
};

export default playlistService;