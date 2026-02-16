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
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Music, Play, Heart, Eye } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { usePlayer } from '../context/PlayerContext';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';
import HarlemGif from '../../assets/downtownHarlem.gif';

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
  const fallbackImage = HarlemGif;

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
  // FETCH JURISDICTION DATA — REAL API
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

        // Step 1: Get jurisdiction ID by name
        const jurResponse = await axiosInstance.get(
          `/v1/jurisdictions/byName/${encodeURIComponent(jurName)}`
        );
        const firstResult = jurResponse.data?.[0];
        if (!firstResult) throw new Error('Jurisdiction not found');
        const jurId = firstResult.jurisdictionId;
        const jurDetails = firstResult;
        if (!jurId) throw new Error('Jurisdiction not found');

        // Step 2: Get tops
        const topsResponse = await axiosInstance.get(`/v1/jurisdictions/${jurId}/tops`);
        const rawData = { ...topsResponse.data, jurisdiction: jurDetails };

        // Normalize — matches web version's mapping exactly
        const topArtist = rawData.topArtist || (rawData.topArtists || [])[0];
        const topSong = rawData.topSong || (rawData.topSongs || [])[0];

        const normalized: JurisdictionData = {
          symbolImage: rawData.jurisdiction.symbolUrl
            ? getMediaUrl(rawData.jurisdiction.symbolUrl) || null
            : null,
          description: rawData.jurisdiction.bio || `Explore ${jurName}`,

          // Only set if exists — no dummy fallbacks
          artistOfMonth: topArtist
            ? {
                id: topArtist.userId,
                name: topArtist.username,
                image: getMediaUrl(topArtist.photoUrl) || null,
                bio: topArtist.bio || 'Rising star in the community.',
                supporters: topArtist.score || 0,
                plays: topArtist.score || 0,
              }
            : null,

          songOfWeek: topSong
            ? {
                id: topSong.songId,
                title: topSong.title,
                artist: topSong.artist?.username || 'Unknown',
                artistId: topSong.artist?.userId,
                plays: topSong.plays || topSong.score || 0,
                likes: topSong.likes || 0,
                image: getMediaUrl(topSong.artworkUrl) || null,
                fileUrl: getMediaUrl(topSong.fileUrl) || null,
              }
            : null,

          // Only real artists
          topArtists: (rawData.topArtists || []).map((artist: any, i: number) => ({
            id: artist.userId,
            rank: i + 1,
            name: artist.username,
            supporters: artist.score || 0,
            plays: artist.score || 0,
            thumbnail: getMediaUrl(artist.photoUrl) || null,
          })),

          // Only real songs
          topSongs: (rawData.topSongs || []).map((song: any, i: number) => ({
            id: song.songId,
            rank: i + 1,
            title: song.title,
            artist: song.artist?.username || 'Unknown',
            artistId: song.artist?.userId,
            plays: song.plays || song.score || 0,
            likes: song.likes || 0,
            thumbnail: getMediaUrl(song.artworkUrl) || null,
            fileUrl: getMediaUrl(song.fileUrl) || null,
          })),
        };

        setData(normalized);
      } catch (err: any) {
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
  // PLAY HANDLERS — ALL WIRED TO REAL BACKEND
  // ============================================================================

  // Play top artist's default song
  const handlePlayTopArtist = async () => {
    if (!data?.artistOfMonth) return;

    try {
      const response = await axiosInstance.get(
        `/v1/users/${data.artistOfMonth.id}/default-song`
      );
      const defaultSong = response.data;

      if (defaultSong && defaultSong.fileUrl) {
        const fullUrl = getMediaUrl(defaultSong.fileUrl);

        playMedia(
          {
            type: 'song',
            url: fullUrl,
            title: defaultSong.title,
            artist: data.artistOfMonth.name,
            artwork: getMediaUrl(defaultSong.artworkUrl) || data.artistOfMonth.image,
          } as any,
          []
        );

        // Track the play
        if (defaultSong.songId && userId) {
          try {
            await axiosInstance.post(
              `/v1/media/song/${defaultSong.songId}/play?userId=${userId}`
            );
            console.log('Top artist play tracked');
          } catch (err) {
            console.error('Failed to track play:', err);
          }
        }
      } else {
        Alert.alert('Unavailable', 'No default song available for this artist');
      }
    } catch (err) {
      console.error('Failed to fetch default song:', err);
      Alert.alert('Error', "Could not load artist's song");
    }
  };

  // Play top song
  const handlePlayTopSong = async () => {
    if (!data?.songOfWeek?.fileUrl) {
      Alert.alert('Unavailable', 'Song not available');
      return;
    }

    playMedia(
      {
        type: 'song',
        url: data.songOfWeek.fileUrl,
        title: data.songOfWeek.title,
        artist: data.songOfWeek.artist,
        artwork: data.songOfWeek.image,
      } as any,
      []
    );

    // Track the play
    if (data.songOfWeek.id && userId) {
      try {
        await axiosInstance.post(
          `/v1/media/song/${data.songOfWeek.id}/play?userId=${userId}`
        );
        console.log('Top song play tracked');
      } catch (err) {
        console.error('Failed to track play:', err);
      }
    }
  };

  // Play artist from list — fetches their default song
  const handlePlayArtist = async (artist: Artist) => {
    try {
      const response = await axiosInstance.get(
        `/v1/users/${artist.id}/default-song`
      );
      const defaultSong = response.data;

      if (defaultSong && defaultSong.fileUrl) {
        const fullUrl = getMediaUrl(defaultSong.fileUrl);

        playMedia(
          {
            type: 'song',
            url: fullUrl,
            title: defaultSong.title,
            artist: artist.name,
            artwork: getMediaUrl(defaultSong.artworkUrl) || artist.thumbnail,
          } as any,
          []
        );

        // Track the play
        if (defaultSong.songId && userId) {
          try {
            await axiosInstance.post(
              `/v1/media/song/${defaultSong.songId}/play?userId=${userId}`
            );
            console.log('Artist play tracked');
          } catch (err) {
            console.error('Failed to track play:', err);
          }
        }
      } else {
        Alert.alert('Unavailable', `${artist.name} has no default song`);
      }
    } catch (err) {
      console.error('Failed to fetch default song:', err);
      Alert.alert('Error', "Could not load artist's song");
    }
  };

  // Play song from list
  const handlePlaySong = async (song: Song) => {
    if (!song.fileUrl) {
      Alert.alert('Unavailable', 'Song not available');
      return;
    }

    playMedia(
      {
        type: 'song',
        url: song.fileUrl,
        title: song.title,
        artist: song.artist,
        artwork: song.thumbnail,
      } as any,
      []
    );

    // Track the play
    if (song.id && userId) {
      try {
        await axiosInstance.post(
          `/v1/media/song/${song.id}/play?userId=${userId}`
        );
        console.log(`Song play tracked for ${song.id}`);
      } catch (err) {
        console.error('Failed to track play:', err);
      }
    }
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
      source={
        data.artistOfMonth?.image ? { uri: data.artistOfMonth.image } : fallbackImage
      }
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
                    <Text style={styles.highlightSectionTitle}>
                      #1 Artist in {jurName}
                    </Text>
                  </View>

                  <View style={styles.highlightContent}>
                    <TouchableOpacity
                      onPress={() => handleViewArtist(data.artistOfMonth!.id)}
                    >
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
                      <TouchableOpacity
                        onPress={() => handleViewArtist(data.artistOfMonth!.id)}
                      >
                        <Text style={styles.highlightName}>
                          {data.artistOfMonth.name}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.listenButton}
                        onPress={handlePlayTopArtist}
                      >
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
                source={
                  data.songOfWeek.image
                    ? { uri: data.songOfWeek.image }
                    : fallbackImage
                }
                style={styles.highlightCard}
                imageStyle={styles.highlightCardImage}
              >
                <LinearGradient
                  colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)']}
                  style={styles.highlightOverlay}
                >
                  <View style={styles.sectionHeaderContainer}>
                    <Text style={styles.highlightSectionTitle}>
                      #1 Song in {jurName}
                    </Text>
                  </View>

                  <View style={styles.highlightContent}>
                    <View style={styles.songIcon}>
                      <Play
                        size={28}
                        color={COLORS.accentWhite}
                        fill={COLORS.accentWhite}
                      />
                    </View>

                    <View style={styles.highlightInfo}>
                      <TouchableOpacity
                        onPress={() => handleViewSong(data.songOfWeek!.id)}
                      >
                        <Text style={styles.highlightName}>
                          {data.songOfWeek.title}
                        </Text>
                      </TouchableOpacity>
                      <Text style={styles.highlightArtist}>
                        by {data.songOfWeek.artist}
                      </Text>

                      <TouchableOpacity
                        style={styles.listenButton}
                        onPress={handlePlayTopSong}
                      >
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
                          source={
                            artist.thumbnail
                              ? { uri: artist.thumbnail }
                              : fallbackImage
                          }
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
                            <Text style={styles.statText}>
                              {artist.plays.toLocaleString()}
                            </Text>
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
                          source={
                            song.thumbnail
                              ? { uri: song.thumbnail }
                              : fallbackImage
                          }
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
                            <Text style={styles.statText}>
                              {song.plays.toLocaleString()}
                            </Text>
                          </View>
                          <View style={styles.statItem}>
                            <Heart size={12} color={COLORS.textGray} />
                            <Text style={styles.statText}>
                              {song.likes.toLocaleString()}
                            </Text>
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