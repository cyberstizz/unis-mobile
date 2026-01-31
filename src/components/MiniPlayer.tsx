
import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { usePlayer } from '../context/PlayerContext';

// Format milliseconds to mm:ss
const formatTime = (ms: number): string => {
  if (!ms || ms < 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const MiniPlayer: React.FC = () => {
  const {
    currentMedia,
    isPlaying,
    isBuffering,
    togglePlayPause,
    next,
    prev,
    position,
    duration,
    toggleExpand
  } = usePlayer();

  // Don't render if nothing is playing
  if (!currentMedia) {
    return null;
  }

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: `${progress}%` }]} />
      </View>

      <View style={styles.content}>
        {/* Artwork */}
        <TouchableOpacity onPress={toggleExpand}>
          {currentMedia.artwork ? (
            <Image 
              source={{ uri: currentMedia.artwork }} 
              style={styles.artwork}
            />
          ) : (
            <View style={[styles.artwork, styles.artworkPlaceholder]}>
              <Text style={styles.artworkPlaceholderText}>♪</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Track info */}
        <TouchableOpacity style={styles.info} onPress={toggleExpand}>
          <Text style={styles.title} numberOfLines={1}>
            {currentMedia.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {currentMedia.artist}
          </Text>
        </TouchableOpacity>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity onPress={prev} style={styles.controlButton}>
            <Text style={styles.controlIcon}>⏮</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={togglePlayPause} style={styles.playButton}>
            <Text style={styles.playIcon}>
              {isBuffering ? '⏳' : isPlaying ? '⏸' : '▶'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={next} style={styles.controlButton}>
            <Text style={styles.controlIcon}>⏭</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Time display */}
      <View style={styles.timeContainer}>
        <Text style={styles.time}>{formatTime(position)}</Text>
        <Text style={styles.time}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  progressContainer: {
    height: 2,
    backgroundColor: '#333',
    width: '100%',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#8b5cf6',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  artworkPlaceholder: {
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  artworkPlaceholderText: {
    fontSize: 24,
    color: '#666',
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  artist: {
    color: '#999',
    fontSize: 12,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlButton: {
    padding: 8,
  },
  controlIcon: {
    fontSize: 18,
    color: '#fff',
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 16,
    color: '#fff',
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  time: {
    color: '#666',
    fontSize: 10,
  },
});

export default MiniPlayer;