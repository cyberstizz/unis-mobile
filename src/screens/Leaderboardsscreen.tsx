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
  Modal,
  FlatList,
  Pressable,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronDown } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { usePlayer } from '../context/PlayerContext';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';
import { GENRE_IDS, JURISDICTION_IDS, INTERVAL_IDS } from '../utils/IdMappings';

// ============================================================================
// COLORS & SIZES (matches web SCSS variables)
// ============================================================================
const COLORS = {
  bgBlack: '#000000',
  subtleBlack: '#1a1a1a',
  textSilver: '#C0C0C0',
  textGray: '#A9A9A9',
  accentWhite: '#FFFFFF',
  unisBlue: '#163387',
  unisSilver: '#918f8f',
  borderSilver: 'rgba(192, 192, 192, 0.3)',
  borderSilverSolid: '#C0C0C0',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 768;

// ============================================================================
// FILTER OPTIONS
// ============================================================================
const LOCATION_OPTIONS = [
  { label: 'Downtown Harlem', value: 'downtown-harlem' },
  { label: 'Uptown Harlem', value: 'uptown-harlem' },
  { label: 'Harlem-wide', value: 'harlem-wide' },
];

const GENRE_OPTIONS = [
  { label: 'Rap', value: 'rap' },
  { label: 'Rock', value: 'rock' },
  { label: 'Pop', value: 'pop' },
];

const CATEGORY_OPTIONS = [
  { label: 'Artist', value: 'artist' },
  { label: 'Song', value: 'song' },
];

const INTERVAL_OPTIONS = [
  { label: 'Today', value: 'daily' },
  { label: 'Week', value: 'weekly' },
  { label: 'Month', value: 'monthly' },
  { label: 'Quarter', value: 'quarterly' },
  { label: 'Midterm', value: 'midterm' },
  { label: 'Annual', value: 'annual' },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
// RESULT ITEM INTERFACE
// ============================================================================
interface LeaderboardItem {
  id: string;
  type: 'artist' | 'song';
  rank: number;
  name?: string;
  title: string;
  artist: string;
  votes: number;
  artwork: string | null;
  fileUrl?: string | null;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const LeaderboardsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { playMedia } = usePlayer();

  // Filter state
  const [location, setLocation] = useState('downtown-harlem');
  const [genre, setGenre] = useState('rap');
  const [category, setCategory] = useState<'artist' | 'song'>('artist');
  const [interval, setInterval] = useState('daily');

  // Results state
  const [results, setResults] = useState<LeaderboardItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Fallback image
  const fallbackImage = require('../../assets/randomrapper.jpeg');

  // ============================================================================
  // EXTRACT USER ID FROM TOKEN
  // ============================================================================
  useEffect(() => {
    const extractUserId = async () => {
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
    extractUserId();
  }, []);

  // ============================================================================
  // FETCH LEADERBOARDS — REAL API
  // ============================================================================
  const handleViewCurrent = async () => {
    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      const jurId = JURISDICTION_IDS[location];
      const genreId = GENRE_IDS[genre];
      const intervalId = INTERVAL_IDS[interval];
      const type = category;

      if (!jurId) throw new Error('Invalid location');
      if (!genreId) throw new Error('Invalid genre');
      if (!intervalId) throw new Error('Invalid interval');

      console.log('Fetching leaderboards:', { jurId, genreId, type, intervalId });

      const response = await axiosInstance.get(
        `/v1/vote/leaderboards?jurisdictionId=${jurId}&genreId=${genreId}&targetType=${type}&intervalId=${intervalId}&limit=50`
      );

      const rawResults = response.data;
      console.log('Raw leaderboard results:', rawResults);

      if (!rawResults || rawResults.length === 0) {
        setError('No results found for this combination. Try different filters.');
        return;
      }

      // Normalize — matches web version's mapping exactly
      const normalized: LeaderboardItem[] = rawResults.map((item: any, i: number) => {
        if (type === 'artist') {
          return {
            id: item.targetId,
            type: 'artist' as const,
            rank: item.rank || i + 1,
            name: item.name || 'Unknown Artist',
            title: item.name || 'Unknown Artist',
            artist: item.name || 'Unknown Artist',
            votes: item.votes || 0,
            artwork: item.artwork ? getMediaUrl(item.artwork) || null : null,
            fileUrl: null,
          };
        } else {
          return {
            id: item.targetId,
            type: 'song' as const,
            rank: item.rank || i + 1,
            title: item.name || 'Unknown Song',
            artist: item.artist || 'Unknown',
            votes: item.votes || 0,
            fileUrl: item.fileUrl ? getMediaUrl(item.fileUrl) || null : null,
            artwork: item.artwork ? getMediaUrl(item.artwork) || null : null,
          };
        }
      });

      console.log('Normalized results:', normalized);
      setResults(normalized);
    } catch (err: any) {
      console.error('Leaderboards fetch error:', err);
      setError(
        `Failed to load leaderboards: ${err.response?.data?.message || err.message}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================================
  // PLAY HANDLER — REAL API
  // ============================================================================
  const handlePlay = async (item: LeaderboardItem) => {
    let trackingId: string | null = null;

    // Song with fileUrl — play directly
    if (item.fileUrl) {
      console.log('Playing song directly:', item.title);

      playMedia(
        {
          type: 'song',
          url: item.fileUrl,
          title: item.title,
          artist: item.artist,
          artwork: item.artwork,
        } as any,
        []
      );

      trackingId = item.id;
    }
    // Artist — fetch default song
    else if (item.type === 'artist' && item.id) {
      console.log('Fetching default song for artist:', item.name);

      try {
        const response = await axiosInstance.get(
          `/v1/users/${item.id}/default-song`
        );
        const defaultSong = response.data;

        if (defaultSong && defaultSong.fileUrl) {
          const fullUrl = getMediaUrl(defaultSong.fileUrl);

          playMedia(
            {
              type: 'song',
              url: fullUrl,
              title: defaultSong.title,
              artist: item.name || item.artist,
              artwork: getMediaUrl(defaultSong.artworkUrl) || item.artwork,
            } as any,
            []
          );

          trackingId = defaultSong.songId;
        } else {
          Alert.alert('Unavailable', `${item.name} has no default song`);
          return;
        }
      } catch (err) {
        console.error('Default song fetch failed:', err);
        Alert.alert('Error', "Could not load artist's song");
        return;
      }
    } else {
      Alert.alert('Unavailable', 'This track is not available for playback');
      return;
    }

    // Track the play
    if (trackingId && userId) {
      try {
        await axiosInstance.post(
          `/v1/media/song/${trackingId}/play?userId=${userId}`
        );
        console.log('Play tracked for:', trackingId);
      } catch (err) {
        console.error('Failed to track play:', err);
      }
    }
  };

  // ============================================================================
  // NAVIGATION HANDLERS
  // ============================================================================
  const handleArtistView = (id: string) => {
    navigation.navigate('Artist', { artistId: id });
  };

  const handleSongView = (id: string) => {
    navigation.navigate('Song', { songId: id });
  };

  // ============================================================================
  // CUSTOM DROPDOWN COMPONENT
  // ============================================================================
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const CustomDropdown = ({
    id,
    value,
    options,
    onSelect,
  }: {
    id: string;
    value: string;
    options: { label: string; value: string }[];
    onSelect: (value: string) => void;
  }) => {
    const selectedOption = options.find((opt) => opt.value === value);
    const isOpen = activeDropdown === id;

    return (
      <View style={styles.dropdownWrapper}>
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => setActiveDropdown(isOpen ? null : id)}
          activeOpacity={0.7}
        >
          <Text style={styles.dropdownButtonText}>
            {selectedOption?.label || 'Select...'}
          </Text>
          <ChevronDown size={18} color={COLORS.accentWhite} />
        </TouchableOpacity>

        <Modal
          visible={isOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setActiveDropdown(null)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setActiveDropdown(null)}
          >
            <View style={styles.dropdownModal}>
              <FlatList
                data={options}
                keyExtractor={(item) => item.value}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.dropdownOption,
                      item.value === value && styles.dropdownOptionSelected,
                    ]}
                    onPress={() => {
                      onSelect(item.value);
                      setActiveDropdown(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        item.value === value && styles.dropdownOptionTextSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </Pressable>
        </Modal>
      </View>
    );
  };

  // ============================================================================
  // RENDER RESULT ITEM
  // ============================================================================
  const renderResultItem = (item: LeaderboardItem) => {
    const itemArtwork = item.artwork ? { uri: item.artwork } : fallbackImage;

    return (
      <View key={`${item.type}-${item.id}-${item.rank}`} style={styles.resultItem}>
        {/* Rank */}
        <Text style={styles.rank}>#{item.rank}</Text>

        {/* Artwork */}
        <Image source={itemArtwork} style={styles.itemArtwork} />

        {/* Info */}
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {item.type === 'song' && (
            <Text style={styles.itemArtist} numberOfLines={1}>
              {item.artist}
            </Text>
          )}
        </View>

        {/* Actions */}
        <View style={styles.resultActions}>
          <TouchableOpacity
            style={styles.listenButton}
            onPress={() => handlePlay(item)}
          >
            <Text style={styles.listenButtonText}>Listen</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.viewButton}
            onPress={() =>
              item.type === 'artist'
                ? handleArtistView(item.id)
                : handleSongView(item.id)
            }
          >
            <Text style={styles.viewButtonText}>
              {item.type === 'artist' ? 'View' : 'View Song'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  return (
    <ImageBackground source={fallbackImage} style={styles.backgroundImage} blurRadius={20}>
      <LinearGradient
        colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.9)', COLORS.bgBlack]}
        style={styles.gradientOverlay}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Filter Card */}
          <View style={styles.filterCard}>
            <View style={styles.filterControls}>
              <CustomDropdown
                id="location"
                value={location}
                options={LOCATION_OPTIONS}
                onSelect={setLocation}
              />
              <CustomDropdown
                id="genre"
                value={genre}
                options={GENRE_OPTIONS}
                onSelect={setGenre}
              />
              <CustomDropdown
                id="category"
                value={category}
                options={CATEGORY_OPTIONS}
                onSelect={(val) => setCategory(val as 'artist' | 'song')}
              />
              <CustomDropdown
                id="interval"
                value={interval}
                options={INTERVAL_OPTIONS}
                onSelect={setInterval}
              />

              <TouchableOpacity
                style={[styles.viewCurrentButton, isLoading && styles.viewCurrentButtonDisabled]}
                onPress={handleViewCurrent}
                disabled={isLoading}
              >
                <Text style={styles.viewCurrentButtonText}>
                  {isLoading ? 'Loading...' : 'View Current'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Results Section */}
          <View style={styles.resultsSection}>
            {isLoading ? (
              <View style={styles.messageContainer}>
                <ActivityIndicator size="large" color={COLORS.unisBlue} />
                <Text style={styles.messageText}>Loading leaderboards...</Text>
              </View>
            ) : error ? (
              <View style={styles.messageContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : results.length > 0 ? (
              <View style={styles.resultsList}>
                {results.map(renderResultItem)}
              </View>
            ) : (
              <View style={styles.messageContainer}>
                <Text style={styles.messageText}>
                  Select criteria and tap 'View Current' to see ongoing leaderboards.
                </Text>
              </View>
            )}
          </View>

          {/* Bottom spacing for player */}
          <View style={{ height: 120 }} />
        </ScrollView>
      </LinearGradient>
    </ImageBackground>
  );
};

// ============================================================================
// STYLES (converted from leaderboardsPage.scss)
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
    paddingHorizontal: IS_MOBILE ? 12 : 20,
    paddingBottom: 20,
    alignItems: 'center',
  },

  // Filter Card
  filterCard: {
    backgroundColor: COLORS.unisBlue,
    borderRadius: 12,
    padding: IS_MOBILE ? 16 : 20,
    width: '100%',
    maxWidth: 900,
    marginBottom: 20,
  },
  filterControls: {
    flexDirection: IS_MOBILE ? 'column' : 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: IS_MOBILE ? 12 : 15,
  },

  // Custom Dropdown
  dropdownWrapper: {
    width: IS_MOBILE ? '100%' : 'auto',
    minWidth: IS_MOBILE ? undefined : 150,
    zIndex: 1,
  },
  dropdownButton: {
    backgroundColor: COLORS.bgBlack,
    borderRadius: IS_MOBILE ? 12 : 50,
    borderWidth: 1,
    borderColor: COLORS.borderSilver,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  dropdownButtonText: {
    color: COLORS.accentWhite,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dropdownModal: {
    backgroundColor: COLORS.subtleBlack,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.unisBlue,
    width: '80%',
    maxWidth: 300,
    maxHeight: 300,
    overflow: 'hidden',
  },
  dropdownOption: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(192, 192, 192, 0.1)',
  },
  dropdownOptionSelected: {
    backgroundColor: COLORS.unisBlue,
  },
  dropdownOptionText: {
    color: COLORS.textSilver,
    fontSize: 15,
    textAlign: 'center',
  },
  dropdownOptionTextSelected: {
    color: COLORS.accentWhite,
    fontWeight: '600',
  },

  // View Current Button
  viewCurrentButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.textSilver,
    borderRadius: 50,
    width: IS_MOBILE ? '100%' : 'auto',
    alignItems: 'center',
  },
  viewCurrentButtonDisabled: {
    opacity: 0.5,
  },
  viewCurrentButtonText: {
    color: COLORS.textSilver,
    fontWeight: 'bold',
    fontSize: 14,
  },

  // Results Section
  resultsSection: {
    width: '100%',
    maxWidth: 900,
  },
  resultsList: {
    gap: 16,
  },

  // Result Item
  resultItem: {
    backgroundColor: COLORS.subtleBlack,
    borderRadius: 8,
    padding: IS_MOBILE ? 12 : 16,
    flexDirection: IS_MOBILE ? 'column' : 'row',
    alignItems: IS_MOBILE ? 'flex-start' : 'center',
    gap: IS_MOBILE ? 12 : 15,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.unisBlue,
    borderRightWidth: 4,
    borderRightColor: COLORS.unisBlue,
  },

  // Rank
  rank: {
    fontSize: IS_MOBILE ? 24 : 32,
    fontWeight: '800',
    color: COLORS.unisBlue,
    width: IS_MOBILE ? 'auto' : 50,
    textAlign: 'center',
  },

  // Artwork
  itemArtwork: {
    width: IS_MOBILE ? 55 : 60,
    height: IS_MOBILE ? 55 : 60,
    borderRadius: 4,
  },

  // Item Info
  itemInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: IS_MOBILE ? 14 : 16,
    fontWeight: '600',
    color: COLORS.accentWhite,
  },
  itemArtist: {
    fontSize: IS_MOBILE ? 12 : 13,
    color: COLORS.unisSilver,
    marginTop: 2,
  },

  // Result Actions
  resultActions: {
    flexDirection: 'row',
    gap: 10,
    width: IS_MOBILE ? '100%' : 'auto',
  },

  // Buttons
  listenButton: {
    flex: IS_MOBILE ? 1 : undefined,
    paddingVertical: 8,
    paddingHorizontal: IS_MOBILE ? 12 : 18,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.textGray,
    borderRadius: 4,
    alignItems: 'center',
  },
  listenButtonText: {
    color: COLORS.textSilver,
    fontSize: IS_MOBILE ? 11 : 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  viewButton: {
    flex: IS_MOBILE ? 1 : undefined,
    paddingVertical: 8,
    paddingHorizontal: IS_MOBILE ? 12 : 18,
    backgroundColor: COLORS.unisBlue,
    borderWidth: 1,
    borderColor: COLORS.unisBlue,
    borderRadius: 4,
    alignItems: 'center',
  },
  viewButtonText: {
    color: COLORS.accentWhite,
    fontSize: IS_MOBILE ? 11 : 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },

  // Messages
  messageContainer: {
    padding: 20,
    alignItems: 'center',
  },
  messageText: {
    color: COLORS.textGray,
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 10,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default LeaderboardsScreen;