// src/components/MediaCard.tsx
// Song/video card for horizontal carousels in FeedScreen
// Matches web feed.scss card design: duration badge, explicit badge,
// play button with white icon on Unis blue circle

import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Dimensions } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { getMediaUrl } from '../services/axiosInstance';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH > 768 ? 185 : 150;
const CARD_HEIGHT = CARD_WIDTH; // Square cards like web

export interface MediaItem {
  id: string;
  title: string;
  artist?: string;
  artistName?: string;
  artistData?: {
    userId: string;
    username: string;
    photoUrl?: string;
    jurisdiction?: any;
    score?: number;
  };
  artworkUrl?: string;
  artwork?: string;
  mediaUrl?: string;
  url?: string;
  fileUrl?: string;
  type?: 'song' | 'video';
  duration?: number;
  createdAt?: string;
  explicit?: boolean;
  playsToday?: number;
  playCount?: number;
  score?: number;
  artistId?: string;
  genre?: string;
  jurisdiction?: string;
}

interface MediaCardProps {
  item: MediaItem;
  onPress: () => void;
  onPlayPress: () => void;
}

const formatDuration = (ms?: number): string => {
  if (!ms) return '';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = String(totalSec % 60).padStart(2, '0');
  return `${min}:${sec}`;
};

const formatTimeAgo = (dateString?: string): string => {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now.getTime() - past.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${diffYears}y ago`;
};

// Inline SVG play icon — guaranteed white fill, same approach as web Player
const PlayIcon: React.FC = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24">
    <Polygon points="5,3 19,12 5,21" fill="#FFFFFF" />
  </Svg>
);

const MediaCard: React.FC<MediaCardProps> = ({ item, onPress, onPlayPress }) => {
  const artworkSource = getMediaUrl(item.artworkUrl || item.artwork);
  const artistName = item.artistData?.username || item.artistName || item.artist || 'Unknown';

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.imageContainer}
        onPress={onPress}
        activeOpacity={0.9}
      >
        {artworkSource ? (
          <Image
            source={{ uri: artworkSource }}
            style={styles.artwork}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.artwork, styles.placeholderArtwork]}>
            <Text style={styles.placeholderText}>♪</Text>
          </View>
        )}

        {/* Duration badge — bottom left */}
        {item.duration ? (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
          </View>
        ) : null}

        {/* Explicit badge — top right */}
        {item.explicit ? (
          <View style={styles.explicitBadge}>
            <Text style={styles.explicitText}>E</Text>
          </View>
        ) : null}

        {/* Play button — bottom right */}
        <TouchableOpacity
          style={styles.playButton}
          onPress={onPlayPress}
          activeOpacity={0.8}
        >
          <View style={styles.playIconWrap}>
            <PlayIcon />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Song info below artwork */}
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
      </TouchableOpacity>
      <Text style={styles.artist} numberOfLines={1}>{artistName}</Text>
      {item.createdAt ? (
        <Text style={styles.timeAgo}>{formatTimeAgo(item.createdAt)}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    flexShrink: 0,
  },
  imageContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#18181c',
    // Subtle shadow like web's $shadow-card
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  placeholderArtwork: {
    backgroundColor: '#18181c',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 48,
    color: '#333',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  durationText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  explicitBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(232, 69, 95, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  explicitText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  playButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#163387',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  playIconWrap: {
    marginLeft: 2, // optical centering for the triangle
  },
  title: {
    marginTop: 8,
    fontSize: 14,
    color: '#f0f0f2',
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  artist: {
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  timeAgo: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
});

export default MediaCard;