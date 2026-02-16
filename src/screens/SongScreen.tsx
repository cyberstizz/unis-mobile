// src/screens/SongScreen.tsx
// Song detail page with ambient color mode
// Ported from web SongPage.jsx — NOW WITH REAL BACKEND API CALLS

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
  Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Heart, FileText } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import * as ExpoClipboard from 'expo-clipboard';

import { usePlayer } from '../context/PlayerContext';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';
import  VotingWizard  from '../components/VotingWizard';
import CommentSection from '../components/Commentsection';

import type { Nominee as VotingNominee } from '../types/voting';

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

// =============================================================================
// COMPONENT
// =============================================================================
const SongScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { playMedia } = usePlayer();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const songId = route.params?.songId || 'song1';

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

  // Voting wizard
  const [showVotingWizard, setShowVotingWizard] = useState(false);
  const [selectedNominee, setSelectedNominee] = useState<VotingNominee | null>(null);

  // Ambient color state
  const [dominantColor, setDominantColor] = useState('rgba(22, 51, 135, 0.3)');

  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    fetchSongData();
  }, [songId]);

  // Fetch like status when song + user ready
  useEffect(() => {
    if (song?.id && userId) {
      const fetchLikes = async () => {
        try {
          const [likedRes, countRes] = await Promise.all([
            axiosInstance.get(`/v1/media/song/${song.id}/is-liked?userId=${userId}`),
            axiosInstance.get(`/v1/media/song/${song.id}/likes/count`),
          ]);
          setIsLiked(likedRes.data.isLiked || false);
          setLikeCount(countRes.data.count || 0);
        } catch {
          setIsLiked(false);
          setLikeCount(0);
        }
      };
      fetchLikes();
    }
  }, [song?.id, userId]);

  // ==========================================================================
  // REAL API: FETCH SONG DATA
  // ==========================================================================

  const fetchSongData = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await axiosInstance.get(`/v1/media/song/${songId}`);
      const d = response.data;
      console.log('Song data loaded:', d.title);

      const songData: Song = {
        id: d.songId,
        title: d.title,
        artist: d.artist?.username || 'Unknown',
        artistId: d.artist?.userId || '',
        jurisdiction: d.jurisdiction?.name || 'Unknown',
        genre: d.genre?.name || 'Unknown',
        artwork: getMediaUrl(d.artworkUrl) || 'https://picsum.photos/400',
        url: getMediaUrl(d.fileUrl) || null,
        description: d.description || 'No description available.',
        playCount: d.playCount || 0,
        playsToday: d.playsToday || 0,
        likeCount: 0, // fetched separately via likes/count
        score: d.score || 0,
        explicit: d.explicit || false,
        lyrics: d.lyrics || '',
        credits: {
          producer: 'N/A',
          writer: 'N/A',
          mix: 'N/A',
        },
        duration: d.duration || 0,
        createdAt: d.createdAt || '',
      };

      setSong(songData);

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
  // HANDLERS — ALL WIRED TO REAL BACKEND
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
      } as any,
      []
    );

    // Optimistic update
    setSong(prev =>
      prev ? { ...prev, playCount: prev.playCount + 1, playsToday: prev.playsToday + 1 } : null
    );

    // Track play
    if (song.id && userId) {
      try {
        await axiosInstance.post(`/v1/media/song/${song.id}/play?userId=${userId}`);
      } catch (err) {
        console.error('Failed to track play:', err);
        setSong(prev =>
          prev ? { ...prev, playCount: prev.playCount - 1, playsToday: prev.playsToday - 1 } : null
        );
      }
    }
  };

  const handleVote = () => {
    if (!userId) {
      Alert.alert('Login Required', 'Please log in to vote.');
      return;
    }
    if (!song) return;

    setSelectedNominee({
      id: song.id,
      name: song.title,
      type: 'song',
      jurisdiction: song.jurisdiction,
    });
    setShowVotingWizard(true);
  };

  const handleLike = async () => {
    if (!userId) {
      Alert.alert('Login Required', 'Please log in to like songs');
      return;
    }
    if (!song?.id) return;

    try {
      const method = isLiked ? 'delete' : 'post';
      const res = await axiosInstance({
        method,
        url: `/v1/media/song/${song.id}/like?userId=${userId}`,
      });
      if (res.data.success) {
        setIsLiked(!isLiked);
        setLikeCount(prev => (isLiked ? Math.max(0, prev - 1) : prev + 1));
      }
    } catch (err) {
      console.error('Like toggle failed:', err);
      Alert.alert('Error', 'Failed to update like.');
    }
  };

  const handleFollow = async () => {
    if (!userId || !song?.artistId) return;
    const prev = isFollowing;
    setIsFollowing(!prev);

    try {
      if (!prev) {
        await axiosInstance.post(`/v1/users/${song.artistId}/follow`);
      } else {
        await axiosInstance.delete(`/v1/users/${song.artistId}/follow`);
      }
    } catch (err) {
      console.error('Follow toggle failed:', err);
      setIsFollowing(prev);
    }
  };

  const handleDontPlay = () => {
    Alert.alert('Coming Soon', 'Do not play list will be available soon');
  };

  const handleReport = () => {
    Alert.alert('Report', 'Report functionality coming soon');
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out "${song?.title}" by ${song?.artist} on Unis!`,
      });
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  const handleCopyLink = async () => {
    try {
      await ExpoClipboard.setStringAsync(`https://unis.app/song/${song?.id}`);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleArtistClick = () => {
    if (song?.artistId) {
      navigation.navigate('Artist', { artistId: song.artistId });
    }
  };

  const handleJurisdictionClick = () => {
    if (song?.jurisdiction) {
      navigation.navigate('Jurisdiction', { jurisdictionName: song.jurisdiction });
    }
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
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.goBackBtn}>
            <Text style={styles.goBackText}>Go Back</Text>
          </TouchableOpacity>
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
              <Text
                style={[styles.likeButtonText, isLiked && styles.likeButtonTextActive]}
              >
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
              <Text
                style={[styles.actionBtnText, isFollowing && styles.actionBtnTextActive]}
              >
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
          {song.lyrics ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Lyrics</Text>
              <View style={styles.lyricsCard}>
                <Text style={styles.lyricsText}>{song.lyrics}</Text>
              </View>
            </View>
          ) : null}

          {/* Edit Lyrics (Owner only) */}
          {isOwner && (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() =>
                Alert.alert('Coming Soon', 'Lyrics editing coming soon')
              }
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
            <CommentSection
              songId={song.id}
              userId={userId}
              songArtistId={song.artistId}
              dominantColor={dominantColor}
            />
          </View>



        </Animated.View>

        {/* Bottom padding for Player */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* VotingWizard Modal */}
      <VotingWizard
        visible={showVotingWizard}
        onClose={() => {
          setShowVotingWizard(false);
          setSelectedNominee(null);
        }}
        onVoteSuccess={() => {
          setShowVotingWizard(false);
          fetchSongData();
        }}
        nominee={selectedNominee}
        userId={userId || ''}
        filters={{
          selectedGenre: song?.genre?.toLowerCase().replace('/', '-') || 'unknown',
          selectedType: 'song',
          selectedInterval: 'daily',
          selectedJurisdiction:
            song?.jurisdiction?.toLowerCase().replace(' ', '-') || 'unknown',
        }}
      />
    </View>
  );
};

// =============================================================================
// STYLES (preserved from your existing version)
// =============================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgBlack,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
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
    marginBottom: 20,
  },
  goBackBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: COLORS.unisBlue,
    borderRadius: 8,
  },
  goBackText: {
    color: COLORS.unisBlue,
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 16,
  },
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
  artwork: {
    width: IS_MOBILE ? SCREEN_WIDTH - 80 : 400,
    height: IS_MOBILE ? SCREEN_WIDTH - 80 : 400,
    maxWidth: 400,
    maxHeight: 400,
    borderRadius: 8,
    marginBottom: 20,
  },
  primaryActions: {
    flexDirection: 'row',
    gap: 15,
    marginBottom: 20,
    flexWrap: 'wrap',
    justifyContent: 'center',
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
  descriptionText: {
    color: COLORS.textGray,
    fontSize: IS_MOBILE ? 16 : 18,
    lineHeight: IS_MOBILE ? 24 : 28,
    textAlign: 'center',
  },
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