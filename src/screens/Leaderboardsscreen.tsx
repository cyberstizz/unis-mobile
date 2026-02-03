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
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { usePlayer } from '../context/PlayerContext';
// import axiosInstance from '../services/axiosInstance';
import { GENRE_IDS, JURISDICTION_IDS, INTERVAL_IDS } from '../utils/idMappings';

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
// DUMMY DATA (for testing without API)
// ============================================================================
const DUMMY_ARTISTS = [
  { id: 'artist-1', type: 'artist', rank: 1, name: 'The Quiet', title: 'The Quiet', artist: 'The Quiet', votes: 1250, artwork: null },
  { id: 'artist-2', type: 'artist', rank: 2, name: 'Tony Fadd', title: 'Tony Fadd', artist: 'Tony Fadd', votes: 980, artwork: null },
  { id: 'artist-3', type: 'artist', rank: 3, name: 'SD Boomin', title: 'SD Boomin', artist: 'SD Boomin', votes: 756, artwork: null },
  { id: 'artist-4', type: 'artist', rank: 4, name: 'Harlem Heat', title: 'Harlem Heat', artist: 'Harlem Heat', votes: 623, artwork: null },
  { id: 'artist-5', type: 'artist', rank: 5, name: 'Uptown Flow', title: 'Uptown Flow', artist: 'Uptown Flow', votes: 512, artwork: null },
];

const DUMMY_SONGS = [
  { id: 'song-1', type: 'song', rank: 1, title: 'Midnight in Harlem', artist: 'The Quiet', votes: 890, artwork: null, fileUrl: null },
  { id: 'song-2', type: 'song', rank: 2, title: 'Paranoid', artist: 'Tony Fadd', votes: 745, artwork: null, fileUrl: null },
  { id: 'song-3', type: 'song', rank: 3, title: 'Block Party', artist: 'SD Boomin', votes: 632, artwork: null, fileUrl: null },
  { id: 'song-4', type: 'song', rank: 4, title: 'Street Dreams', artist: 'Harlem Heat', votes: 521, artwork: null, fileUrl: null },
  { id: 'song-5', type: 'song', rank: 5, title: 'Uptown Anthem', artist: 'Uptown Flow', votes: 445, artwork: null, fileUrl: null },
];

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
const API_BASE_URL = 'http://localhost:8080';

const buildUrl = (url: string | null): string | null => {
  if (!url) return null;
  return url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
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
  // FETCH LEADERBOARDS
  // ============================================================================
  const handleViewCurrent = async () => {
    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      // TODO: Replace with actual API call
      // const jurId = JURISDICTION_IDS[location];
      // const genreId = GENRE_IDS[genre];
      // const intervalId = INTERVAL_IDS[interval];
      // 
      // const response = await axiosInstance.get(
      //   `/v1/vote/leaderboards?jurisdictionId=${jurId}&genreId=${genreId}&targetType=${category}&intervalId=${intervalId}&limit=50`
      // );
      // const rawResults = response.data;

      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Use dummy data based on category
      const dummyResults = category === 'artist' ? DUMMY_ARTISTS : DUMMY_SONGS;
      
      if (dummyResults.length === 0) {
        setError('No results found for this combination. Try different filters.');
        return;
      }

      setResults(dummyResults);
    } catch (err) {
      console.error('Leaderboards fetch error:', err);
      setError('Failed to load leaderboards. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================================
  // PLAY HANDLER
  // ============================================================================
  const handlePlay = async (item: LeaderboardItem) => {
    if (item.type === 'song' && item.fileUrl) {
      // Play song directly
      const fullUrl = buildUrl(item.fileUrl);
      playMedia(
        {
          type: 'song',
          url: fullUrl || '',
          title: item.title,
          artist: item.artist,
          artwork: buildUrl(item.artwork),
        },
        []
      );

      // Track play
      // if (userId) {
      //   try {
      //     await axiosInstance.post(`/v1/media/song/${item.id}/play?userId=${userId}`);
      //   } catch (err) {
      //     console.error('Failed to track play:', err);
      //   }
      // }
    } else if (item.type === 'artist') {
      // Fetch and play default song for artist
      console.log('Fetching default song for artist:', item.name);
      // TODO: Implement default song fetch
      // try {
      //   const response = await axiosInstance.get(`/v1/users/${item.id}/default-song`);
      //   const defaultSong = response.data;
      //   if (defaultSong?.fileUrl) {
      //     playMedia({ ... }, []);
      //   }
      // } catch (err) {
      //   console.error('Failed to fetch default song:', err);
      // }
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
  // RENDER FILTER PICKER
  // ============================================================================
  const renderPicker = (
    value: string,
    onValueChange: (value: string) => void,
    options: { label: string; value: string }[]
  ) => (
    <View style={styles.pickerContainer}>
      <Picker
        selectedValue={value}
        onValueChange={onValueChange}
        style={styles.picker}
        dropdownIconColor={COLORS.accentWhite}
        mode="dropdown"
      >
        {options.map((option) => (
          <Picker.Item
            key={option.value}
            label={option.label}
            value={option.value}
            color={COLORS.accentWhite}
            style={styles.pickerItem}
          />
        ))}
      </Picker>
    </View>
  );

  // ============================================================================
  // RENDER RESULT ITEM
  // ============================================================================
  const renderResultItem = (item: LeaderboardItem) => (
    <View key={`${item.type}-${item.id}-${item.rank}`} style={styles.resultItem}>
      {/* Rank */}
      <Text style={styles.rank}>#{item.rank}</Text>

      {/* Artwork */}
      <Image
        source={item.artwork ? { uri: item.artwork } : fallbackImage}
        style={styles.itemArtwork}
      />

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
              {/* Location Picker */}
              {renderPicker(location, setLocation, LOCATION_OPTIONS)}

              {/* Genre Picker */}
              {renderPicker(genre, setGenre, GENRE_OPTIONS)}

              {/* Category Picker */}
              {renderPicker(category, (val) => setCategory(val as 'artist' | 'song'), CATEGORY_OPTIONS)}

              {/* Interval Picker */}
              {renderPicker(interval, setInterval, INTERVAL_OPTIONS)}

              {/* View Current Button */}
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

  // Picker
  pickerContainer: {
    backgroundColor: COLORS.bgBlack,
    borderRadius: IS_MOBILE ? 12 : 50,
    borderWidth: 1,
    borderColor: COLORS.borderSilver,
    overflow: 'hidden',
    width: IS_MOBILE ? '100%' : 'auto',
    minWidth: IS_MOBILE ? undefined : 140,
  },
  picker: {
    color: COLORS.accentWhite,
    height: 45,
    width: '100%',
    backgroundColor: 'transparent',
  },
  pickerItem: {
    backgroundColor: COLORS.bgBlack,
    fontSize: 14,
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