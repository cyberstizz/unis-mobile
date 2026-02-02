// src/screens/SongScreen.tsx
// Song detail page with ambient color mode
// Ported from web SongPage.jsx

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ImageBackground,
  ActivityIndicator,
  Dimensions,
  Alert,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Heart, FileText, Share2, Flag, Ban, Link, UserPlus } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import * as ExpoClipboard from 'expo-clipboard';


import { usePlayer } from '../context/PlayerContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 768;

// =============================================================================
// DESIGN TOKENS
// =============================================================================
const COLORS = {
  bgBlack: '#000000',
  subtleBlack: '#1a1a1a',
  textSilver: '#C0C0C0',
  textGray: '#A9A9A9',
  accentWhite: '#FFFFFF',
  unisBlue: '#163387',
  borderSilver: 'rgba(192, 192, 192, 0.5)',
  explicitRed: 'rgba(255, 0, 0, 0.85)',
};

// =============================================================================
// DUMMY SONG DATA
// =============================================================================
const getDummySong = (songId: string) => ({
  id: songId,
  title: 'Paranoid',
  artist: 'Tony Fadd',
  artistId: 'artist1',
  jurisdiction: 'Uptown Harlem',
  genre: 'Rap/Hip-Hop',
  artwork: 'https://picsum.photos/400?random=song1',
  url: 'https://example.com/paranoid.mp3',
  description: 'A introspective track about the pressures of street life and staying vigilant. Produced in the heart of Harlem with authentic sounds that capture the essence of uptown.',
  playCount: 2450,
  playsToday: 156,
  likeCount: 342,
  score: 89,
  explicit: true,
  lyrics: `[Verse 1]
Walking through these streets at night
Every shadow got me feeling tight
Can't trust nobody, that's the code
Paranoid mind, heavy load

[Chorus]
I'm paranoid, paranoid
Can't let my guard down
Paranoid, paranoid
In this part of town

[Verse 2]
Phone ringing, who that be?
Unknown numbers calling me
Mama praying for my soul
While I'm chasing all this gold`,
  credits: {
    producer: 'SD Boomin',
    writer: 'Tony Fadd',
    mix: 'Harlem Studios',
  },
  duration: 214,
  createdAt: '2024-01-15',
});

// =============================================================================
// INTERFACES
// =============================================================================
interface Song {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  jurisdiction: string;
  genre: string;
  artwork: string;
  url: string | null;
  description: string;
  playCount: number;
  playsToday: number;
  likeCount: number;
  score: number;
  explicit: boolean;
  lyrics: string;
  credits: {
    producer: string;
    writer: string;
    mix: string;
  };
  duration: number;
  createdAt: string;
}

interface SongScreenProps {
  route?: {
    params?: {
      songId?: string;
    };
  };
}

// =============================================================================
// COMPONENT
// =============================================================================
const SongScreen: React.FC<SongScreenProps> = ({ route }) => {
  const insets = useSafeAreaInsets();
  const { playMedia } = usePlayer();
  
  // Get songId from route params or use default
  const songId = route?.params?.songId || 'song1';

  // State
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  
  // Interaction state
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Ambient color state
  const [dominantColor, setDominantColor] = useState('rgba(22, 51, 135, 0.3)');
  
  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  useEffect(() => {
    const getUserId = async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]));
          setUserId(payload.userId);
        }
      } catch (err) {
        console.error('Failed to get userId:', err);
      }
    };
    getUserId();
  }, []);

  // Base64 decode helper
  const atob = (input: string): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = input.replace(/=+$/, '');
    let output = '';
    for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
      buffer = chars.indexOf(buffer) as any;
      if (buffer === -1) continue;
      bs = bc % 4 ? bs * 64 + buffer : buffer;
      if (bc++ % 4) {
        output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
      }
    }
    return output;
  };

  // Fetch song data
  useEffect(() => {
    fetchSongData();
  }, [songId]);

  const fetchSongData = async () => {
    setLoading(true);
    setError('');

    try {
      // Simulate API call with dummy data
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const songData = getDummySong(songId);
      setSong(songData);
      setLikeCount(songData.likeCount);

      // Animate in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();

    } catch (err) {
      console.error('Failed to load song:', err);
      setError('Failed to load song details');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handlePlay = async () => {
    if (!song?.url) {
      Alert.alert('Unavailable', 'This song is not available for playback');
      return;
    }

    playMedia(
      {
        id: song.id,
        songId: song.id,
        title: song.title,
        artist: song.artist,
        url: song.url,
        artwork: song.artwork,
      },
      []
    );

    // Optimistic update
    setSong(prev => prev ? {
      ...prev,
      playCount: prev.playCount + 1,
      playsToday: prev.playsToday + 1,
    } : null);
  };

  const handleVote = () => {
    if (!userId) {
      Alert.alert('Login Required', 'Please log in to vote');
      return;
    }
    // TODO: Open VotingWizard
    Alert.alert('Coming Soon', 'Voting will be available soon');
  };

  const handleLike = async () => {
    if (!userId) {
      Alert.alert('Login Required', 'Please log in to like songs');
      return;
    }

    // Optimistic update
    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    setLikeCount(prev => newIsLiked ? prev + 1 : Math.max(0, prev - 1));

    // TODO: API call to toggle like
    console.log('Toggle like:', newIsLiked);
  };

  const handleFollow = async () => {
    if (!userId) {
      Alert.alert('Login Required', 'Please log in to follow artists');
      return;
    }

    const newIsFollowing = !isFollowing;
    setIsFollowing(newIsFollowing);

    // TODO: API call to toggle follow
    console.log('Toggle follow:', newIsFollowing);
  };

  const handleDontPlay = () => {
    Alert.alert('Coming Soon', 'Do not play list will be available soon');
  };

  const handleReport = () => {
    Alert.alert('Report', 'Report functionality coming soon');
  };

  const handleShare = () => {
    Alert.alert('Share', 'Share functionality coming soon');
  };

  const handleCopyLink = async () => {
    try {
      await Clipboard.setStringAsync(`https://unis.app/song/${song?.id}`);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleArtistClick = () => {
    console.log('Navigate to artist:', song?.artistId);
    // TODO: navigation.navigate('Artist', { artistId: song.artistId });
  };

  const handleJurisdictionClick = () => {
    console.log('Navigate to jurisdiction:', song?.jurisdiction);
    // TODO: navigation.navigate('Jurisdiction', { name: song.jurisdiction });
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (loading) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['rgba(0,0,0,0.8)', '#000000']}
          style={styles.loadingContainer}
        >
          <ActivityIndicator size="large" color={COLORS.unisBlue} />
          <Text style={styles.loadingText}>Loading song...</Text>
        </LinearGradient>
      </View>
    );
  }

  if (error || !song) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['rgba(0,0,0,0.8)', '#000000']}
          style={styles.loadingContainer}
        >
          <Text style={styles.errorText}>{error || 'Song not found'}</Text>
        </LinearGradient>
      </View>
    );
  }

  const isOwner = userId && song.artistId === userId;

  return (
    <View style={styles.container}>
      {/* Background with artwork blur */}
      <ImageBackground
        source={{ uri: song.artwork }}
        style={styles.backgroundImage}
        blurRadius={30}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)']}
          style={styles.backgroundOverlay}
        />
      </ImageBackground>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.mainCard, { opacity: fadeAnim }]}>
          {/* Ambient glow effect */}
          <LinearGradient
            colors={['rgba(10, 10, 10, 0.95)', dominantColor]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ambientGradient}
          />

          {/* Title with Explicit Badge */}
          <View style={styles.titleRow}>
            <Text style={styles.trackTitle}>{song.title}</Text>
            {song.explicit && (
              <View style={styles.explicitBadge}>
                <Text style={styles.explicitText}>EXPLICIT</Text>
              </View>
            )}
          </View>

          {/* Artwork */}
          <Image source={{ uri: song.artwork }} style={styles.artwork} />

          {/* Primary Actions */}
          <View style={styles.primaryActions}>
            <TouchableOpacity style={styles.playButton} onPress={handlePlay}>
              <Text style={styles.playButtonText}>Play</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.voteButton} onPress={handleVote}>
              <Text style={styles.voteButtonText}>Vote</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.likeButton, isLiked && styles.likeButtonActive]}
              onPress={handleLike}
            >
              <Heart
                size={18}
                color={isLiked ? COLORS.accentWhite : COLORS.textGray}
                fill={isLiked ? COLORS.accentWhite : 'none'}
              />
              <Text style={[styles.likeButtonText, isLiked && styles.likeButtonTextActive]}>
                {isLiked ? 'Liked' : 'Like'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Artist & Location */}
          <TouchableOpacity onPress={handleArtistClick}>
            <Text style={styles.artistName}>{song.artist}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleJurisdictionClick}>
            <Text style={styles.jurisdiction}>{song.jurisdiction}</Text>
          </TouchableOpacity>

          <Text style={styles.genre}>{song.genre}</Text>

          {/* Stats */}
          <View style={styles.stats}>
            <Text style={styles.statItem}>
              <Text style={styles.statLabel}>Plays </Text>
              {song.playCount.toLocaleString()}
            </Text>
            <Text style={styles.statItem}>
              <Text style={styles.statLabel}>Likes </Text>
              {likeCount.toLocaleString()}
            </Text>
            {song.playsToday > 100 && (
              <Text style={styles.hotStat}>
                🔥 {song.playsToday} plays today
              </Text>
            )}
          </View>

          {/* Secondary Actions */}
          <View style={styles.secondaryActions}>
            <TouchableOpacity
              style={[styles.actionBtn, isFollowing && styles.actionBtnActive]}
              onPress={handleFollow}
            >
              <Text style={[styles.actionBtnText, isFollowing && styles.actionBtnTextActive]}>
                {isFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={handleDontPlay}>
              <Text style={styles.actionBtnText}>Don't Play</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={handleReport}>
              <Text style={styles.actionBtnText}>Report</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
              <Text style={styles.actionBtnText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={handleCopyLink}>
              <Text style={styles.actionBtnText}>
                {copySuccess ? 'Copied!' : 'Copy Link'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Lyrics Section */}
          {song.lyrics && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Lyrics</Text>
              <View style={styles.lyricsCard}>
                <Text style={styles.lyricsText}>{song.lyrics}</Text>
              </View>
            </View>
          )}

          {/* Edit Lyrics (Owner only) */}
          {isOwner && (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => Alert.alert('Coming Soon', 'Lyrics editing coming soon')}
            >
              <FileText size={16} color={COLORS.accentWhite} />
              <Text style={styles.editButtonText}>
                {song.lyrics ? 'Edit Lyrics' : 'Add Lyrics'}
              </Text>
            </TouchableOpacity>
          )}

          {/* About Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.descriptionText}>{song.description}</Text>
          </View>

          {/* Credits Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Credits</Text>
            <View style={styles.creditsGrid}>
              <View style={styles.creditItem}>
                <Text style={styles.creditLabel}>Producer</Text>
                <Text style={styles.creditValue}>{song.credits.producer}</Text>
              </View>
              <View style={styles.creditItem}>
                <Text style={styles.creditLabel}>Writer</Text>
                <Text style={styles.creditValue}>{song.credits.writer}</Text>
              </View>
              <View style={styles.creditItem}>
                <Text style={styles.creditLabel}>Mix Engineer</Text>
                <Text style={styles.creditValue}>{song.credits.mix}</Text>
              </View>
            </View>
          </View>

          {/* Comments Section Placeholder */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Comments</Text>
            <View style={styles.commentsPlaceholder}>
              <Text style={styles.placeholderText}>
                Comments coming soon...
              </Text>
            </View>
          </View>

        </Animated.View>

        {/* Bottom padding for Player */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
};

// =============================================================================
// STYLES
// =============================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgBlack,
  },

  // Background
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textSilver,
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 16,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 16,
  },

  // Main Card
  mainCard: {
    width: '100%',
    maxWidth: 800,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(22, 51, 135, 0.3)',
  },
  ambientGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
  },

  // Title
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 12,
  },
  trackTitle: {
    color: COLORS.textSilver,
    fontSize: IS_MOBILE ? 32 : 48,
    fontWeight: '600',
    textAlign: 'center',
  },
  explicitBadge: {
    backgroundColor: COLORS.explicitRed,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  explicitText: {
    color: COLORS.accentWhite,
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Artwork
  artwork: {
    width: IS_MOBILE ? SCREEN_WIDTH - 80 : 400,
    height: IS_MOBILE ? SCREEN_WIDTH - 80 : 400,
    maxWidth: 400,
    maxHeight: 400,
    borderRadius: 8,
    marginBottom: 20,
  },

  // Primary Actions
  primaryActions: {
    flexDirection: 'row',
    gap: 15,
    marginBottom: 20,
  },
  playButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.borderSilver,
    borderRadius: 50,
  },
  playButtonText: {
    color: COLORS.textSilver,
    fontWeight: 'bold',
    fontSize: 14,
  },
  voteButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: COLORS.unisBlue,
    borderRadius: 50,
  },
  voteButtonText: {
    color: COLORS.textSilver,
    fontWeight: 'bold',
    fontSize: 14,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: COLORS.unisBlue,
    borderRadius: 4,
  },
  likeButtonActive: {
    backgroundColor: COLORS.unisBlue,
  },
  likeButtonText: {
    color: COLORS.textGray,
    fontSize: 14,
  },
  likeButtonTextActive: {
    color: COLORS.accentWhite,
  },

  // Artist & Location
  artistName: {
    color: COLORS.accentWhite,
    fontSize: IS_MOBILE ? 24 : 32,
    marginVertical: 8,
  },
  jurisdiction: {
    color: COLORS.unisBlue,
    fontSize: IS_MOBILE ? 18 : 24,
    marginBottom: 4,
  },
  genre: {
    color: COLORS.textGray,
    fontSize: IS_MOBILE ? 14 : 18,
    marginBottom: 20,
  },

  // Stats
  stats: {
    alignItems: 'center',
    marginBottom: 20,
  },
  statItem: {
    color: COLORS.textGray,
    fontSize: IS_MOBILE ? 18 : 24,
    marginVertical: 4,
  },
  statLabel: {
    color: COLORS.unisBlue,
  },
  hotStat: {
    color: '#4CAF50',
    fontWeight: 'bold',
    fontSize: IS_MOBILE ? 14 : 16,
    marginTop: 8,
  },

  // Secondary Actions
  secondaryActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 20,
    paddingBottom: 20,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.textGray,
    width: '80%',
    marginBottom: 20,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(192, 192, 192, 0.5)',
    borderRadius: 20,
  },
  actionBtnActive: {
    backgroundColor: COLORS.unisBlue,
    borderColor: COLORS.unisBlue,
  },
  actionBtnText: {
    color: COLORS.textSilver,
    fontSize: 12,
    fontWeight: '500',
  },
  actionBtnTextActive: {
    color: COLORS.accentWhite,
  },

  // Sections
  section: {
    width: '100%',
    marginBottom: 30,
  },
  sectionTitle: {
    color: COLORS.unisBlue,
    fontSize: IS_MOBILE ? 20 : 24,
    fontWeight: '600',
    marginBottom: 15,
    textAlign: 'center',
  },

  // Lyrics
  lyricsCard: {
    backgroundColor: 'rgba(20, 20, 20, 0.7)',
    borderRadius: 16,
    padding: IS_MOBILE ? 20 : 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  lyricsText: {
    color: '#e0e0e0',
    fontSize: IS_MOBILE ? 16 : 18,
    lineHeight: IS_MOBILE ? 28 : 36,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Edit Button
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: COLORS.unisBlue,
    borderRadius: 8,
    marginBottom: 30,
  },
  editButtonText: {
    color: COLORS.accentWhite,
    fontSize: 14,
    fontWeight: '600',
  },

  // Description
  descriptionText: {
    color: COLORS.textGray,
    fontSize: IS_MOBILE ? 16 : 18,
    lineHeight: IS_MOBILE ? 24 : 28,
    textAlign: 'center',
  },

  // Credits
  creditsGrid: {
    gap: 12,
  },
  creditItem: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  creditLabel: {
    color: COLORS.unisBlue,
    fontSize: IS_MOBILE ? 14 : 16,
    fontWeight: '600',
  },
  creditValue: {
    color: COLORS.textGray,
    fontSize: IS_MOBILE ? 14 : 16,
  },

  // Comments Placeholder
  commentsPlaceholder: {
    padding: 30,
    backgroundColor: 'rgba(26, 26, 26, 0.5)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(22, 51, 135, 0.3)',
    alignItems: 'center',
  },
  placeholderText: {
    color: COLORS.textGray,
    fontStyle: 'italic',
  },
});

export default SongScreen;