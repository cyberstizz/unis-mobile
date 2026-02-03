import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Music, Play, Heart, Eye } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { usePlayer } from '../context/PlayerContext';
// import axiosInstance from '../services/axiosInstance';

// ============================================================================
// COLORS & SIZES
// ============================================================================
const COLORS = {
  bgBlack: '#000000',
  subtleBlack: '#1a1a1a',
  textSilver: '#C0C0C0',
  textGray: '#A9A9A9',
  accentWhite: '#FFFFFF',
  unisBlue: '#163387',
  cardBg: 'rgba(255, 255, 255, 0.05)',
  cardBgHover: 'rgba(255, 255, 255, 0.1)',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 768;

// ============================================================================
// DUMMY DATA
// ============================================================================
const DUMMY_DATA = {
  symbolImage: null,
  description: 'Explore the vibrant music scene of Harlem',
  
  artistOfMonth: {
    id: 'artist-001',
    name: 'The Quiet',
    image: null,
    bio: 'Rising star in the community.',
    supporters: 4523,
    plays: 12847,
  },
  
  songOfWeek: {
    id: 'song-001',
    title: 'Midnight in Harlem',
    artist: 'The Quiet',
    artistId: 'artist-001',
    plays: 8934,
    likes: 2156,
    image: null,
    fileUrl: null,
  },
  
  topArtists: [
    { id: 'artist-001', rank: 1, name: 'The Quiet', supporters: 4523, plays: 12847, thumbnail: null },
    { id: 'artist-002', rank: 2, name: 'Tony Fadd', supporters: 3891, plays: 10234, thumbnail: null },
    { id: 'artist-003', rank: 3, name: 'SD Boomin', supporters: 2987, plays: 8765, thumbnail: null },
    { id: 'artist-004', rank: 4, name: 'Harlem Heat', supporters: 2456, plays: 7234, thumbnail: null },
    { id: 'artist-005', rank: 5, name: 'Uptown Flow', supporters: 1987, plays: 5678, thumbnail: null },
  ],
  
  topSongs: [
    { id: 'song-001', rank: 1, title: 'Midnight in Harlem', artist: 'The Quiet', artistId: 'artist-001', plays: 8934, likes: 2156, thumbnail: null, fileUrl: null },
    { id: 'song-002', rank: 2, title: 'Paranoid', artist: 'Tony Fadd', artistId: 'artist-002', plays: 7654, likes: 1876, thumbnail: null, fileUrl: null },
    { id: 'song-003', rank: 3, title: 'Block Party', artist: 'SD Boomin', artistId: 'artist-003', plays: 6543, likes: 1543, thumbnail: null, fileUrl: null },
    { id: 'song-004', rank: 4, title: 'Street Dreams', artist: 'Harlem Heat', artistId: 'artist-004', plays: 5432, likes: 1234, thumbnail: null, fileUrl: null },
    { id: 'song-005', rank: 5, title: 'Uptown Anthem', artist: 'Uptown Flow', artistId: 'artist-005', plays: 4321, likes: 987, thumbnail: null, fileUrl: null },
  ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
const API_BASE_URL = 'http://localhost:8080';

const buildUrl = (url: string | null): string | null => {
  if (!url) return null;
  return url.startsWith('http://') || url.startsWith('https://') ? url : `${API_BASE_URL}${url}`;
};

// Base64 decode for token parsing
const atob = (input: string): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = input.replace(/=+$/, '');
  let output = '';
  if (str.length % 4 === 1) throw new Error('Invalid base64 string');
  for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
    buffer = chars.indexOf(buffer);
    if (buffer === -1) continue;
    bs = bc % 4 ? bs * 64 + buffer : buffer;
    if (bc++ % 4) output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
  }
  return output;
};

// ============================================================================
// INTERFACES
// ============================================================================
interface Artist {
  id: string;
  rank?: number;
  name: string;
  supporters: number;
  plays: number;
  thumbnail: string | null;
  image?: string | null;
  bio?: string;
}

interface Song {
  id: string;
  rank?: number;
  title: string;
  artist: string;
  artistId?: string;
  plays: number;
  likes: number;
  thumbnail: string | null;
  image?: string | null;
  fileUrl: string | null;
}

interface JurisdictionData {
  symbolImage: string | null;
  description: string;
  artistOfMonth: Artist | null;
  songOfWeek: Song | null;
  topArtists: Artist[];
  topSongs: Song[];
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
interface JurisdictionScreenProps {
  jurisdiction?: string;
}

const JurisdictionScreen: React.FC<JurisdictionScreenProps> = ({ jurisdiction = 'Harlem' }) => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const { playMedia } = usePlayer();

  // Get jurisdiction from route params or props
  const jurName = (route.params as any)?.jurisdiction || jurisdiction;

  // State
  const [data, setData] = useState<JurisdictionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Fallback image
  const fallbackImage = require('../../assets/randomrapper.jpeg');

  // ============================================================================
  // GET USER ID FROM TOKEN
  // ============================================================================
  useEffect(() => {
    const getUserId = async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]));
          setUserId(payload.userId);
        }
      } catch (err) {
        console.error('Failed to get userId from token:', err);
      }
    };
    getUserId();
  }, []);

  // ============================================================================
  // FETCH JURISDICTION DATA
  // ============================================================================
  useEffect(() => {
    const fetchData = async () => {
      if (!jurName) {
        setError('No jurisdiction specified.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // TODO: Replace with actual API calls
        // Step 1: Get jurisdiction ID by name
        // const jurResponse = await axiosInstance.get(`/v1/jurisdictions/byName/${encodeURIComponent(jurName)}`);
        // const jurId = jurResponse.data?.[0]?.jurisdictionId;
        // 
        // Step 2: Get tops
        // const topsResponse = await axiosInstance.get(`/v1/jurisdictions/${jurId}/tops`);

        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Use dummy data
        setData(DUMMY_DATA);
      } catch (err) {
        console.error('Jurisdiction fetch error:', err);
        setError(`Failed to load data for ${jurName}.`);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [jurName]);

  // ============================================================================
  // PLAY HANDLERS
  // ============================================================================
  const handlePlayTopArtist = async () => {
    if (!data?.artistOfMonth) return;

    // TODO: Fetch default song for artist
    // try {
    //   const response = await axiosInstance.get(`/v1/users/${data.artistOfMonth.id}/default-song`);
    //   const defaultSong = response.data;
    //   if (defaultSong?.fileUrl) {
    //     playMedia({ ... }, []);
    //   }
    // } catch (err) {
    //   console.error('Failed to fetch default song:', err);
    // }

    console.log('Play top artist:', data.artistOfMonth.name);
  };

  const handlePlayTopSong = () => {
    if (!data?.songOfWeek?.fileUrl) {
      console.log('Song not available');
      return;
    }

    playMedia(
      {
        type: 'song',
        url: data.songOfWeek.fileUrl,
        title: data.songOfWeek.title,
        artist: data.songOfWeek.artist,
        artwork: buildUrl(data.songOfWeek.image),
      },
      []
    );
  };

  const handlePlayArtist = async (artist: Artist) => {
    // TODO: Fetch default song for artist
    console.log('Play artist:', artist.name);
  };

  const handlePlaySong = (song: Song) => {
    if (!song.fileUrl) {
      console.log('Song not available');
      return;
    }

    playMedia(
      {
        type: 'song',
        url: song.fileUrl,
        title: song.title,
        artist: song.artist,
        artwork: buildUrl(song.thumbnail),
      },
      []
    );
  };

  // ============================================================================
  // NAVIGATION HANDLERS
  // ============================================================================
  const handleViewArtist = (artistId: string) => {
    navigation.navigate('Artist', { artistId });
  };

  const handleViewSong = (songId: string) => {
    navigation.navigate('Song', { songId });
  };

  // ============================================================================
  // LOADING STATE
  // ============================================================================
  if (loading) {
    return (
      <ImageBackground source={fallbackImage} style={styles.backgroundImage} blurRadius={20}>
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.9)', COLORS.bgBlack]}
          style={styles.gradientOverlay}
        >
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.unisBlue} />
            <Text style={styles.loadingText}>Loading {jurName}...</Text>
          </View>
        </LinearGradient>
      </ImageBackground>
    );
  }

  // ============================================================================
  // ERROR STATE
  // ============================================================================
  if (!data) {
    return (
      <ImageBackground source={fallbackImage} style={styles.backgroundImage} blurRadius={20}>
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.9)', COLORS.bgBlack]}
          style={styles.gradientOverlay}
        >
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error || `No data available for ${jurName}`}</Text>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </ImageBackground>
    );
  }

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  return (
    <ImageBackground
      source={data.artistOfMonth?.image ? { uri: data.artistOfMonth.image } : fallbackImage}
      style={styles.backgroundImage}
      blurRadius={25}
    >
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.85)', COLORS.bgBlack]}
        style={styles.gradientOverlay}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{jurName}</Text>
          </View>

          {/* Hero GIF/Image Section */}
          <View style={styles.heroSection}>
            <Image source={fallbackImage} style={styles.heroImage} />
          </View>

          {/* Highlights Grid */}
          <View style={styles.highlightsGrid}>
            {/* Top Artist Card */}
            {data.artistOfMonth && (
              <View style={styles.highlightCard}>
                <LinearGradient
                  colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)']}
                  style={styles.highlightOverlay}
                >
                  <View style={styles.sectionHeaderContainer}>
                    <Text style={styles.highlightSectionTitle}>#1 Artist in {jurName}</Text>
                  </View>

                  <View style={styles.highlightContent}>
                    <TouchableOpacity onPress={() => handleViewArtist(data.artistOfMonth!.id)}>
                      <Image
                        source={
                          data.artistOfMonth.image
                            ? { uri: data.artistOfMonth.image }
                            : fallbackImage
                        }
                        style={styles.profileImage}
                      />
                    </TouchableOpacity>

                    <View style={styles.highlightInfo}>
                      <TouchableOpacity onPress={() => handleViewArtist(data.artistOfMonth!.id)}>
                        <Text style={styles.highlightName}>{data.artistOfMonth.name}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.listenButton} onPress={handlePlayTopArtist}>
                        <Text style={styles.listenButtonText}>Listen Now</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </LinearGradient>
              </View>
            )}

            {/* Top Song Card */}
            {data.songOfWeek && (
              <ImageBackground
                source={data.songOfWeek.image ? { uri: data.songOfWeek.image } : fallbackImage}
                style={styles.highlightCard}
                imageStyle={styles.highlightCardImage}
              >
                <LinearGradient
                  colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)']}
                  style={styles.highlightOverlay}
                >
                  <View style={styles.sectionHeaderContainer}>
                    <Text style={styles.highlightSectionTitle}>#1 Song in {jurName}</Text>
                  </View>

                  <View style={styles.highlightContent}>
                    <View style={styles.songIcon}>
                      <Play size={28} color={COLORS.accentWhite} fill={COLORS.accentWhite} />
                    </View>

                    <View style={styles.highlightInfo}>
                      <TouchableOpacity onPress={() => handleViewSong(data.songOfWeek!.id)}>
                        <Text style={styles.highlightName}>{data.songOfWeek.title}</Text>
                      </TouchableOpacity>
                      <Text style={styles.highlightArtist}>by {data.songOfWeek.artist}</Text>

                      <TouchableOpacity style={styles.listenButton} onPress={handlePlayTopSong}>
                        <Text style={styles.listenButtonText}>Play</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </LinearGradient>
              </ImageBackground>
            )}
          </View>

          {/* Content Grid - Top Artists & Top Songs */}
          <View style={styles.contentGrid}>
            {/* Top Artists Section */}
            <View style={styles.contentSection}>
              <View style={styles.contentSectionHeader}>
                <Music size={20} color={COLORS.unisBlue} />
                <Text style={styles.contentSectionTitle}>
                  Top {data.topArtists.length} Artists in {jurName}
                </Text>
              </View>

              <View style={styles.contentList}>
                {data.topArtists.length > 0 ? (
                  data.topArtists.map((artist) => (
                    <View key={artist.id} style={styles.contentItem}>
                      <Text style={styles.rankBadge}>{artist.rank}</Text>

                      <TouchableOpacity onPress={() => handleViewArtist(artist.id)}>
                        <Image
                          source={artist.thumbnail ? { uri: artist.thumbnail } : fallbackImage}
                          style={styles.topThumbnail}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.itemHeader}
                        onPress={() => handleViewArtist(artist.id)}
                      >
                        <Text style={styles.itemName} numberOfLines={1}>
                          {artist.name}
                        </Text>
                      </TouchableOpacity>

                      {!IS_MOBILE && (
                        <View style={styles.itemStats}>
                          <View style={styles.statItem}>
                            <Heart size={12} color={COLORS.textGray} />
                            <Text style={styles.statText}>
                              {artist.supporters.toLocaleString()}
                            </Text>
                          </View>
                          <View style={styles.statItem}>
                            <Eye size={12} color={COLORS.textGray} />
                            <Text style={styles.statText}>{artist.plays.toLocaleString()}</Text>
                          </View>
                        </View>
                      )}

                      <TouchableOpacity
                        style={styles.playButton}
                        onPress={() => handlePlayArtist(artist)}
                      >
                        <Text style={styles.playButtonText}>Play</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No artists yet in {jurName}</Text>
                )}
              </View>
            </View>

            {/* Top Songs Section */}
            <View style={styles.contentSection}>
              <View style={styles.contentSectionHeader}>
                <Play size={20} color={COLORS.unisBlue} />
                <Text style={styles.contentSectionTitle}>
                  Top {data.topSongs.length} Songs in {jurName}
                </Text>
              </View>

              <View style={styles.contentList}>
                {data.topSongs.length > 0 ? (
                  data.topSongs.map((song) => (
                    <View key={song.id} style={styles.contentItem}>
                      <Text style={styles.rankBadge}>{song.rank}</Text>

                      <TouchableOpacity onPress={() => handleViewSong(song.id)}>
                        <Image
                          source={song.thumbnail ? { uri: song.thumbnail } : fallbackImage}
                          style={styles.topThumbnail}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.itemHeader}
                        onPress={() => handleViewSong(song.id)}
                      >
                        <Text style={styles.itemName} numberOfLines={1}>
                          {song.title}
                        </Text>
                        <Text style={styles.itemSubtext} numberOfLines={1}>
                          {song.artist}
                        </Text>
                      </TouchableOpacity>

                      {!IS_MOBILE && (
                        <View style={styles.itemStats}>
                          <View style={styles.statItem}>
                            <Eye size={12} color={COLORS.textGray} />
                            <Text style={styles.statText}>{song.plays.toLocaleString()}</Text>
                          </View>
                          <View style={styles.statItem}>
                            <Heart size={12} color={COLORS.textGray} />
                            <Text style={styles.statText}>{song.likes.toLocaleString()}</Text>
                          </View>
                        </View>
                      )}

                      <TouchableOpacity
                        style={styles.playButton}
                        onPress={() => handlePlaySong(song)}
                      >
                        <Text style={styles.playButtonText}>Play</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No songs yet in {jurName}</Text>
                )}
              </View>
            </View>
          </View>

          {/* Error Banner */}
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          )}

          {/* Bottom spacing for player */}
          <View style={{ height: 120 }} />
        </ScrollView>
      </LinearGradient>
    </ImageBackground>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  // Background & Layout
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: IS_MOBILE ? 20 : 40,
    paddingHorizontal: IS_MOBILE ? 8 : 16,
  },

  // Loading & Error States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textSilver,
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.textSilver,
  },
  backButtonText: {
    color: COLORS.textSilver,
    fontWeight: '600',
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: IS_MOBILE ? 16 : 24,
  },
  headerTitle: {
    fontSize: IS_MOBILE ? 32 : 42,
    color: COLORS.textSilver,
    fontWeight: '400',
    fontFamily: 'System', // Would use Delicious Handrawn if available
    textAlign: 'center',
  },

  // Hero Section
  heroSection: {
    width: '100%',
    height: IS_MOBILE ? 180 : 270,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: IS_MOBILE ? 16 : 24,
  },
  heroImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },

  // Highlights Grid
  highlightsGrid: {
    flexDirection: IS_MOBILE ? 'column' : 'row',
    gap: IS_MOBILE ? 16 : 24,
    marginBottom: IS_MOBILE ? 16 : 24,
  },
  highlightCard: {
    flex: 1,
    minHeight: IS_MOBILE ? 280 : 350,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.subtleBlack,
  },
  highlightCardImage: {
    borderRadius: 12,
  },
  highlightOverlay: {
    flex: 1,
    padding: IS_MOBILE ? 16 : 24,
    justifyContent: 'space-between',
  },
  sectionHeaderContainer: {
    alignItems: 'center',
  },
  highlightSectionTitle: {
    fontSize: IS_MOBILE ? 16 : 20,
    color: COLORS.accentWhite,
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    overflow: 'hidden',
  },
  highlightContent: {
    alignItems: 'center',
    gap: 16,
  },
  profileImage: {
    width: IS_MOBILE ? 120 : 160,
    height: IS_MOBILE ? 120 : 160,
    borderRadius: IS_MOBILE ? 60 : 80,
    borderWidth: 4,
    borderColor: COLORS.accentWhite,
  },
  songIcon: {
    width: IS_MOBILE ? 60 : 80,
    height: IS_MOBILE ? 60 : 80,
    borderRadius: IS_MOBILE ? 30 : 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  highlightInfo: {
    alignItems: 'center',
    gap: 8,
  },
  highlightName: {
    fontSize: IS_MOBILE ? 20 : 24,
    color: COLORS.accentWhite,
    fontWeight: '700',
    textAlign: 'center',
  },
  highlightArtist: {
    fontSize: IS_MOBILE ? 14 : 16,
    color: COLORS.textSilver,
  },
  listenButton: {
    backgroundColor: COLORS.unisBlue,
    paddingVertical: IS_MOBILE ? 10 : 12,
    paddingHorizontal: IS_MOBILE ? 20 : 28,
    borderRadius: 8,
    marginTop: 8,
  },
  listenButtonText: {
    color: COLORS.accentWhite,
    fontWeight: '600',
    fontSize: IS_MOBILE ? 14 : 16,
  },

  // Content Grid
  contentGrid: {
    flexDirection: IS_MOBILE ? 'column' : 'row',
    gap: IS_MOBILE ? 16 : 24,
  },
  contentSection: {
    flex: 1,
    backgroundColor: COLORS.bgBlack,
    borderRadius: 12,
    padding: IS_MOBILE ? 12 : 20,
  },
  contentSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  contentSectionTitle: {
    fontSize: IS_MOBILE ? 14 : 16,
    color: COLORS.unisBlue,
    fontWeight: '600',
    flex: 1,
  },
  contentList: {
    gap: 10,
    maxHeight: IS_MOBILE ? 350 : 450,
  },
  contentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: IS_MOBILE ? 10 : 16,
    padding: IS_MOBILE ? 10 : 12,
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
  },
  rankBadge: {
    fontSize: IS_MOBILE ? 14 : 18,
    fontWeight: '700',
    color: COLORS.unisBlue,
    minWidth: IS_MOBILE ? 20 : 30,
    textAlign: 'center',
  },
  topThumbnail: {
    width: IS_MOBILE ? 40 : 50,
    height: IS_MOBILE ? 40 : 50,
    borderRadius: 6,
  },
  itemHeader: {
    flex: 1,
  },
  itemName: {
    fontSize: IS_MOBILE ? 13 : 15,
    color: COLORS.accentWhite,
    fontWeight: '600',
  },
  itemSubtext: {
    fontSize: IS_MOBILE ? 11 : 13,
    color: COLORS.textSilver,
    marginTop: 2,
  },
  itemStats: {
    flexDirection: 'row',
    gap: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: COLORS.textGray,
  },
  playButton: {
    backgroundColor: COLORS.unisBlue,
    paddingVertical: IS_MOBILE ? 6 : 8,
    paddingHorizontal: IS_MOBILE ? 12 : 16,
    borderRadius: 4,
  },
  playButtonText: {
    color: COLORS.accentWhite,
    fontSize: IS_MOBILE ? 11 : 13,
    fontWeight: '600',
  },
  emptyText: {
    color: COLORS.textGray,
    fontSize: 14,
    padding: 16,
  },

  // Error Banner
  errorBanner: {
    marginTop: 20,
    padding: 16,
    backgroundColor: 'rgba(255, 100, 100, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 100, 100, 0.3)',
    borderRadius: 8,
  },
  errorBannerText: {
    color: 'orange',
    textAlign: 'center',
    fontSize: 14,
  },
});

export default JurisdictionScreen;