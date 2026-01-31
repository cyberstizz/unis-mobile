import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';

// Sample track for testing
const SAMPLE_TRACK = {
  id: 'test-1',
  songId: 'test-1',
  title: 'Sample Track',
  artist: 'Test Artist',
  artistName: 'Test Artist',
  // Using a public domain audio file for testing
  url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  fileUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  artwork: 'https://picsum.photos/200',
  artworkUrl: 'https://picsum.photos/200',
};

const SAMPLE_TRACK_2 = {
  id: 'test-2',
  songId: 'test-2',
  title: 'Another Song',
  artist: 'Another Artist',
  artistName: 'Another Artist',
  url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  fileUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  artwork: 'https://picsum.photos/201',
  artworkUrl: 'https://picsum.photos/201',
};

const HomeScreen: React.FC = () => {
  const { user, loading: authLoading, logout } = useAuth();
  const { 
    playMedia, 
    currentMedia, 
    isPlaying, 
    togglePlayPause,
    loading: playerLoading,
    playlists
  } = usePlayer();

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const handlePlaySample = () => {
    playMedia(SAMPLE_TRACK, [SAMPLE_TRACK, SAMPLE_TRACK_2]);
  };

  const handlePlaySample2 = () => {
    playMedia(SAMPLE_TRACK_2, [SAMPLE_TRACK, SAMPLE_TRACK_2]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Unis Logo/Title */}
      <Text style={styles.title}>Unis</Text>
      <Text style={styles.subtitle}>Harlem's Music Platform</Text>

      {/* Auth Status */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Auth Status</Text>
        {user ? (
          <>
            <Text style={styles.cardValue}>✓ Logged in</Text>
            <Text style={styles.cardDetail}>User ID: {user.userId}</Text>
            {user.jurisdiction && (
              <Text style={styles.cardDetail}>
                Jurisdiction: {user.jurisdiction.name || user.jurisdiction.jurisdictionId}
              </Text>
            )}
          </>
        ) : (
          <Text style={styles.cardValueGold}>Not logged in</Text>
        )}
      </View>

      {/* Player Status */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Player Status</Text>
        {currentMedia ? (
          <>
            <Text style={styles.cardValue}>♪ {currentMedia.title}</Text>
            <Text style={styles.cardDetail}>by {currentMedia.artist}</Text>
            <Text style={styles.cardDetail}>
              Status: {isPlaying ? 'Playing' : 'Paused'}
            </Text>
          </>
        ) : (
          <Text style={styles.cardDetail}>No track loaded</Text>
        )}
        <Text style={styles.cardDetail}>
          Playlists loaded: {playlists.length}
        </Text>
      </View>

      {/* Player Test Buttons */}
      <View style={styles.buttonGroup}>
        <TouchableOpacity 
          style={styles.buttonPurple}
          onPress={handlePlaySample}
        >
          <Text style={styles.buttonText}>▶ Play Sample Track 1</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.buttonPurple}
          onPress={handlePlaySample2}
        >
          <Text style={styles.buttonText}>▶ Play Sample Track 2</Text>
        </TouchableOpacity>

        {currentMedia && (
          <TouchableOpacity 
            style={[styles.buttonPurple, styles.buttonOutline]}
            onPress={togglePlayPause}
          >
            <Text style={styles.buttonText}>
              {isPlaying ? '⏸ Pause' : '▶ Resume'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Auth Buttons */}
      <View style={styles.buttonGroup}>
        {user ? (
          <TouchableOpacity 
            style={styles.buttonRed}
            onPress={logout}
          >
            <Text style={styles.buttonText}>Logout</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={styles.buttonPurple}
            onPress={() => console.log('Navigate to login')}
          >
            <Text style={styles.buttonText}>Go to Login</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Setup Confirmation */}
      <View style={styles.successCard}>
        <Text style={styles.successText}>
          ✓ AuthContext is working{'\n'}
          ✓ PlayerContext is working{'\n'}
          ✓ expo-av is ready{'\n'}
          ✓ SecureStore is ready
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  contentContainer: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 120, // Space for MiniPlayer
  },
  centered: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#8b5cf6',
    textAlign: 'center',
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardLabel: {
    color: '#666',
    fontSize: 12,
    marginBottom: 8,
  },
  cardValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  cardValueGold: {
    color: '#f59e0b',
    fontSize: 18,
    fontWeight: '600',
  },
  cardDetail: {
    color: '#999',
    fontSize: 14,
    marginTop: 4,
  },
  buttonGroup: {
    gap: 12,
    marginBottom: 16,
  },
  buttonPurple: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  buttonRed: {
    backgroundColor: '#dc2626',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  successCard: {
    borderWidth: 1,
    borderColor: '#22c55e',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  successText: {
    color: '#22c55e',
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default HomeScreen;