// src/components/MediaCard.tsx
// Reusable card for songs/videos in carousels

import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH > 768 ? 180 : 140;
const CARD_HEIGHT = SCREEN_WIDTH > 768 ? 180 : 140;

export interface MediaItem {
  id: string;
  title: string;
  artist?: string;
  artistName?: string;
  artistData?: {
    userId: string;
    username: string;
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
}

interface MediaCardProps {
  item: MediaItem;
  onPress: () => void;
  onPlayPress: () => void;
}

// Format milliseconds to mm:ss
const formatDuration = (ms?: number): string => {
  if (!ms) return '';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = String(totalSec % 60).padStart(2, '0');
  return `${min}:${sec}`;
};

// Format time ago
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

const MediaCard: React.FC<MediaCardProps> = ({ item, onPress, onPlayPress }) => {
  const artworkSource = item.artworkUrl || item.artwork;
  const artistName = item.artistData?.username || item.artistName || item.artist || 'Unknown';
  
  return (
    <View style={styles.container}>
      {/* Card Image */}
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
        
        {/* Duration Badge - Bottom Left */}
        {item.duration && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
          </View>
        )}
        
        {/* Explicit Badge - Top Right */}
        {item.explicit && (
          <View style={styles.explicitBadge}>
            <Text style={styles.explicitText}>E</Text>
          </View>
        )}
        
        {/* Play Button */}
        <TouchableOpacity 
          style={styles.playButton}
          onPress={onPlayPress}
          activeOpacity={0.8}
        >
          <Text style={styles.playIcon}>▶</Text>
        </TouchableOpacity>
      </TouchableOpacity>
      
      {/* Title */}
      <TouchableOpacity onPress={onPress}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
      </TouchableOpacity>
      
      {/* Artist Name */}
      <Text style={styles.artist} numberOfLines={1}>
        {artistName}
      </Text>
      
      {/* Time Ago */}
      <Text style={styles.timeAgo}>
        {formatTimeAgo(item.createdAt)}
      </Text>
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
    borderRadius: 12,
    overflow: 'hidden',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#163387', // Unis blue
    position: 'relative',
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  placeholderArtwork: {
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 48,
    color: '#666',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  durationText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  explicitBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 0, 0, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  explicitText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  playButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#163387', // Unis blue
    justifyContent: 'center',
    alignItems: 'center',
    // On mobile, always show play button (no hover)
    opacity: 1,
  },
  playIcon: {
    color: '#918f8f', // Unis silver
    fontSize: 14,
    marginLeft: 2, // Optical centering for play icon
  },
  title: {
    marginTop: 10,
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    paddingLeft: 4,
  },
  artist: {
    fontSize: 13,
    color: '#aaa',
    paddingLeft: 4,
    marginTop: 2,
  },
  timeAgo: {
    fontSize: 11,
    color: '#888',
    paddingLeft: 4,
    marginTop: 2,
  },
});

export default MediaCard;