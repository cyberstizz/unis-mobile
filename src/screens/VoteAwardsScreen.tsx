import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  ImageBackground,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trophy, Play } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';

import { usePlayer } from '../context/PlayerContext';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';
import { GENRE_IDS, JURISDICTION_IDS, INTERVAL_IDS } from '../utils/IdMappings';
import VotingWizard from '../components/VotingWizard';
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
  unisSilver: '#918f8f',
  borderSilver: 'rgba(192, 192, 192, 0.2)',
  playBlue: '#60a5fa',
  voteGold: '#fbbf24',
};

// =============================================================================
// FILTER OPTIONS
// =============================================================================
const GENRES = [
  { value: 'rap', label: 'Rap/Hip-Hop' },
  { value: 'rock', label: 'Rock' },
  { value: 'pop', label: 'Pop' },
];

const TYPES = [
  { value: 'artist', label: 'Artist' },
  { value: 'song', label: 'Song' },
];

const INTERVALS = [
  { value: 'daily', label: 'Day' },
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'quarterly', label: 'Quarter' },
  { value: 'annual', label: 'Year' },
];

const JURISDICTIONS = [
  { value: 'uptown-harlem', label: 'Uptown Harlem' },
  { value: 'downtown-harlem', label: 'Downtown Harlem' },
  { value: 'harlem', label: 'Harlem' },
];

// =============================================================================
// NOMINEE INTERFACE
// =============================================================================
interface Nominee {
  id: string;
  name: string;
  type: 'artist' | 'song';
  genreKey: string;
  imageUrl?: string;
  jurisdiction: string;
  jurisdictionData?: any;
  genre: string;
  votes: number;
  totalLifetimeVotes?: number;
  artist?: string;
  artistId?: string;
  mediaUrl?: string;
  plays?: number;
}

// =============================================================================
// COMPONENT
// =============================================================================
const VoteAwardsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { playMedia } = usePlayer();
  const navigation = useNavigation<any>();

  // Filter state
  const [selectedGenre, setSelectedGenre] = useState('rap');
  const [selectedType, setSelectedType] = useState<'artist' | 'song'>('artist');
  const [selectedInterval, setSelectedInterval] = useState('daily');
  const [selectedJurisdiction, setSelectedJurisdiction] = useState('harlem');
  const [searchQuery, setSearchQuery] = useState('');

  // Data state
  const [nominees, setNominees] = useState<Nominee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  // VotingWizard state
  const [showVoteWizard, setShowVoteWizard] = useState(false);
  const [selectedNominee, setSelectedNominee] = useState<VotingNominee | null>(null);

  // Active filter dropdown
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

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

  // Get userId on mount
  useEffect(() => {
    const getUserId = async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]));
          setUserId(payload.userId);
        }
      } catch (e) {
        console.error('Failed to decode token:', e);
      }
    };
    getUserId();
  }, []);

  // Fetch nominees when filters change
  useEffect(() => {
    fetchNominees();
  }, [selectedGenre, selectedType, selectedInterval, selectedJurisdiction]);

  // ─── REAL API CALL — matches web fetchNominees exactly ───
  const fetchNominees = async () => {
    setLoading(true);
    setError('');

    try {
      const genreId = GENRE_IDS[selectedGenre];
      const jurisdictionId = JURISDICTION_IDS[selectedJurisdiction];
      const intervalId = INTERVAL_IDS[selectedInterval];

      if (!genreId || !jurisdictionId || !intervalId) {
        console.warn('Missing ID mapping:', { selectedGenre, selectedJurisdiction, selectedInterval });
        setError('Invalid filter selection.');
        setNominees([]);
        return;
      }

      const response = await axiosInstance.get(
        `/v1/vote/nominees?targetType=${selectedType}&genreId=${genreId}&jurisdictionId=${jurisdictionId}&intervalId=${intervalId}&limit=20`
      );

      const nomineesData = response.data || [];
      console.log('Raw nominees response:', nomineesData.length, 'items');

      // Normalize — matches web normalization exactly
      const normalized: Nominee[] = nomineesData.map((nominee: any) => {
        if (selectedType === 'artist') {
          return {
            id: nominee.userId,
            name: nominee.username,
            type: 'artist' as const,
            genreKey: selectedGenre,
            imageUrl: getMediaUrl(nominee.photoUrl),
            votes: nominee.voteCount || 0,
            totalLifetimeVotes: nominee.totalVotes || 0,
            jurisdiction: nominee.jurisdiction?.name || 'Unknown',
            jurisdictionData: nominee.jurisdiction,
            genre: nominee.genre?.name || 'Unknown',
          };
        } else {
          return {
            id: nominee.songId,
            name: nominee.title,
            type: 'song' as const,
            genreKey: selectedGenre,
            artist: nominee.artist?.username || 'Unknown Artist',
            artistId: nominee.artist?.userId,
            imageUrl: getMediaUrl(nominee.artworkUrl),
            mediaUrl: getMediaUrl(nominee.fileUrl),
            votes: nominee.voteCount || 0,
            plays: nominee.playCount || nominee.totalPlays || 0,
            jurisdiction: nominee.jurisdiction?.name || 'Unknown',
            jurisdictionData: nominee.jurisdiction,
            genre: nominee.genre?.name || 'Unknown',
          };
        }
      });

      setNominees(normalized);
      console.log('Normalized nominees:', normalized.length);
    } catch (err: any) {
      console.error('Failed to fetch nominees:', err);
      const status = err.response?.status;
      if (status === 404) {
        setError('No nominees found for this category.');
      } else {
        setError('Failed to load nominees. Please try again.');
      }
      setNominees([]);
    } finally {
      setLoading(false);
    }
  };

  // Filter by search
  const filteredNominees = nominees.filter((nominee) => {
    if (searchQuery.length === 0) return true;
    return nominee.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Display labels
  const genreLabel = GENRES.find(g => g.value === selectedGenre)?.label || selectedGenre;
  const typeLabel = TYPES.find(t => t.value === selectedType)?.label || selectedType;
  const intervalLabel = INTERVALS.find(i => i.value === selectedInterval)?.label || selectedInterval;
  const jurisdictionLabel = JURISDICTIONS.find(j => j.value === selectedJurisdiction)?.label || selectedJurisdiction;

  // ─── VOTE — opens VotingWizard ───
  const handleVoteClick = (nominee: Nominee) => {
    if (!userId) {
      Alert.alert('Login Required', 'Please log in to vote.');
      return;
    }

    // Convert to VotingWizard's Nominee type
    const wizardNominee: VotingNominee = {
      id: nominee.id,
      name: nominee.name,
      type: nominee.type,
      genreKey: nominee.genreKey,
      jurisdiction: nominee.jurisdictionData || nominee.jurisdiction,
    };

    setSelectedNominee(wizardNominee);
    setShowVoteWizard(true);
  };

  const handleVoteSuccess = (nomineeId: string) => {
    setShowVoteWizard(false);
    setSelectedNominee(null);
    // Refresh nominees to reflect updated vote counts
    fetchNominees();
  };

  // ─── PLAY ───
  const handlePlaySong = async (nominee: Nominee) => {
    if (nominee.type === 'song' && nominee.mediaUrl) {
      playMedia(
        {
          id: nominee.id,
          songId: nominee.id,
          title: nominee.name,
          artist: nominee.artist || 'Unknown Artist',
          url: nominee.mediaUrl,
          artwork: nominee.imageUrl,
        } as any,
        []
      );

      // Track play
      if (userId) {
        try {
          await axiosInstance.post(`/v1/media/song/${nominee.id}/play?userId=${userId}`);
        } catch (err) {
          console.error('Failed to track play:', err);
        }
      }
    } else if (nominee.type === 'artist') {
      // Fetch artist's default song
      try {
        const response = await axiosInstance.get(`/v1/users/${nominee.id}/default-song`);
        const defaultSong = response.data;

        if (defaultSong?.fileUrl) {
          playMedia(
            {
              id: defaultSong.songId || nominee.id,
              songId: defaultSong.songId || nominee.id,
              title: defaultSong.title,
              artist: nominee.name,
              url: getMediaUrl(defaultSong.fileUrl)!,
              artwork: getMediaUrl(defaultSong.artworkUrl) || nominee.imageUrl,
            } as any,
            []
          );

          // Track play
          if (userId && defaultSong.songId) {
            try {
              await axiosInstance.post(`/v1/media/song/${defaultSong.songId}/play?userId=${userId}`);
            } catch (err) {
              console.error('Failed to track play:', err);
            }
          }
        } else {
          Alert.alert('No Song', 'This artist has no default song yet.');
        }
      } catch (err) {
        console.error('Failed to fetch default song:', err);
        Alert.alert('Error', 'Could not load artist song.');
      }
    }
  };

  // ─── NAVIGATION ───
  const handleNomineeClick = (nominee: Nominee) => {
    if (nominee.type === 'artist') {
      navigation.navigate('Artist', { artistId: nominee.id });
    } else {
      navigation.navigate('Song', { songId: nominee.id, type: 'song' });
    }
  };

  // ─── RENDER HELPERS ───

  const renderFilterButton = (
    value: string,
    options: { value: string; label: string }[],
    onSelect: (value: string) => void,
    filterKey: string
  ) => {
    const isActive = activeFilter === filterKey;
    const currentLabel = options.find(o => o.value === value)?.label || value;

    return (
      <View style={styles.filterWrapper}>
        <TouchableOpacity
          style={[styles.filterButton, isActive && styles.filterButtonActive]}
          onPress={() => setActiveFilter(isActive ? null : filterKey)}
        >
          <Text style={[styles.filterButtonText, isActive && styles.filterButtonTextActive]}>
            {currentLabel}
          </Text>
        </TouchableOpacity>

        {isActive && (
          <View style={styles.filterDropdown}>
            {options.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.filterOption, value === option.value && styles.filterOptionActive]}
                onPress={() => {
                  onSelect(option.value);
                  setActiveFilter(null);
                }}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    value === option.value && styles.filterOptionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderNomineeCard = (nominee: Nominee) => (
    <View key={nominee.id} style={styles.nomineeCard}>
      {/* Image */}
      <TouchableOpacity onPress={() => handleNomineeClick(nominee)}>
        <Image
          source={{ uri: nominee.imageUrl || 'https://picsum.photos/200?random=fallback' }}
          style={styles.nomineeImage}
        />
      </TouchableOpacity>

      {/* Info */}
      <TouchableOpacity style={styles.nomineeInfo} onPress={() => handleNomineeClick(nominee)}>
        <Text style={styles.nomineeName} numberOfLines={1}>{nominee.name}</Text>

        {nominee.type === 'song' && (
          <Text style={styles.nomineeArtist} numberOfLines={1}>by {nominee.artist}</Text>
        )}

        <Text style={styles.nomineeJurisdiction} numberOfLines={1}>{nominee.jurisdiction}</Text>

        {nominee.type === 'song' && (
          <View style={styles.statRow}>
            <Play size={14} color={COLORS.playBlue} />
            <Text style={styles.statTextPlays}>{nominee.plays || 0} Plays</Text>
          </View>
        )}

        {nominee.type === 'artist' && (
          <View style={styles.statRow}>
            <Trophy size={14} color={COLORS.voteGold} />
            <Text style={styles.statTextVotes}>{nominee.totalLifetimeVotes || 0} Votes</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Buttons */}
      <View style={styles.nomineeButtons}>
        <TouchableOpacity style={styles.listenButton} onPress={() => handlePlaySong(nominee)}>
          <Text style={styles.listenButtonText}>Listen</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.voteButton} onPress={() => handleVoteClick(nominee)}>
          <Text style={styles.voteButtonText}>Vote</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../assets/randomrapper.jpeg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.9)']}
          style={styles.backgroundOverlay}
        />
      </ImageBackground>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Filters */}
        <View style={styles.filtersContainer}>
          {renderFilterButton(selectedGenre, GENRES, setSelectedGenre, 'genre')}
          {renderFilterButton(selectedType, TYPES, (v) => setSelectedType(v as 'artist' | 'song'), 'type')}
          {renderFilterButton(selectedInterval, INTERVALS, setSelectedInterval, 'interval')}
          {renderFilterButton(selectedJurisdiction, JURISDICTIONS, setSelectedJurisdiction, 'jurisdiction')}
        </View>

        {/* Title */}
        <View style={styles.titleContainer}>
          <Text style={styles.titleText}>
            {genreLabel} {typeLabel} of the {intervalLabel}
          </Text>
          <Text style={styles.titleText}>in</Text>
          <Text style={styles.jurisdictionText}>{jurisdictionLabel}</Text>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder={`Search for ${selectedType}s to vote for`}
            placeholderTextColor={COLORS.textGray}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Loading */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.unisBlue} />
            <Text style={styles.loadingText}>Loading nominees...</Text>
          </View>
        )}

        {/* Error */}
        {error && !loading && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Nominee List */}
        {!loading && (
          <View style={styles.nomineeList}>
            {filteredNominees.length > 0 ? (
              filteredNominees.map(renderNomineeCard)
            ) : (
              !error && (
                <Text style={styles.noNomineesText}>
                  {searchQuery
                    ? 'No nominees match your search.'
                    : 'No nominees found for this category yet.'}
                </Text>
              )
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* VotingWizard Modal */}
      <VotingWizard
        visible={showVoteWizard}
        onClose={() => {
          setShowVoteWizard(false);
          setSelectedNominee(null);
        }}
        onVoteSuccess={handleVoteSuccess}
        nominee={selectedNominee}
        userId={userId || ''}
        filters={{
          selectedGenre,
          selectedType,
          selectedInterval,
          selectedJurisdiction,
        }}
      />
    </View>
  );
};

// =============================================================================
// STYLES
// =============================================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBlack },
  backgroundImage: { ...StyleSheet.absoluteFillObject },
  backgroundOverlay: { ...StyleSheet.absoluteFillObject },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  // Filters
  filtersContainer: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: IS_MOBILE ? 8 : 15, marginBottom: 30, zIndex: 100,
  },
  filterWrapper: { position: 'relative', zIndex: 10 },
  filterButton: {
    paddingVertical: 10, paddingHorizontal: 18,
    backgroundColor: 'rgba(26, 26, 26, 0.8)',
    borderWidth: 1, borderColor: COLORS.borderSilver, borderRadius: 50,
  },
  filterButtonActive: { borderColor: COLORS.unisBlue, backgroundColor: 'rgba(22, 51, 135, 0.1)' },
  filterButtonText: { color: COLORS.textSilver, fontSize: IS_MOBILE ? 12 : 14 },
  filterButtonTextActive: { color: COLORS.accentWhite },
  filterDropdown: {
    position: 'absolute', top: '100%' as any, left: 0, right: 0, marginTop: 4,
    backgroundColor: COLORS.subtleBlack, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.borderSilver, overflow: 'hidden', minWidth: 120,
  },
  filterOption: { paddingVertical: 10, paddingHorizontal: 14 },
  filterOptionActive: { backgroundColor: 'rgba(22, 51, 135, 0.2)' },
  filterOptionText: { color: COLORS.textSilver, fontSize: 13 },
  filterOptionTextActive: { color: COLORS.unisBlue },

  // Title
  titleContainer: { alignItems: 'center', marginBottom: 24 },
  titleText: {
    color: COLORS.accentWhite, fontSize: IS_MOBILE ? 20 : 24,
    fontWeight: '300', textAlign: 'center', letterSpacing: 1,
  },
  jurisdictionText: {
    color: COLORS.unisBlue, fontSize: IS_MOBILE ? 24 : 28,
    fontWeight: '600', textAlign: 'center', marginTop: 4,
  },

  // Search
  searchContainer: { alignItems: 'center', marginBottom: 24 },
  searchInput: {
    width: IS_MOBILE ? '90%' : '60%', maxWidth: 500,
    paddingVertical: 12, paddingHorizontal: 24,
    backgroundColor: 'rgba(26, 26, 26, 0.5)',
    borderWidth: 1, borderColor: COLORS.borderSilver, borderRadius: 50,
    color: COLORS.accentWhite, fontSize: 16, textAlign: 'center',
  },

  // Loading / Error
  loadingContainer: { alignItems: 'center', paddingVertical: 50 },
  loadingText: { color: COLORS.textSilver, marginTop: 12, fontSize: 16 },
  errorContainer: { alignItems: 'center', paddingVertical: 20 },
  errorText: { color: '#ff6b6b', fontSize: 14 },

  // Nominee List
  nomineeList: { gap: 16 },
  nomineeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(26, 26, 26, 0.95)', borderRadius: 8,
    padding: IS_MOBILE ? 12 : 20,
    borderLeftWidth: IS_MOBILE ? 3 : 4, borderLeftColor: COLORS.unisBlue,
    borderRightWidth: IS_MOBILE ? 3 : 4, borderRightColor: COLORS.unisBlue,
    borderTopWidth: 1, borderTopColor: 'rgba(192, 192, 192, 0.05)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(192, 192, 192, 0.05)',
  },
  nomineeImage: {
    width: IS_MOBILE ? 55 : 70, height: IS_MOBILE ? 55 : 70,
    borderRadius: 12, marginRight: IS_MOBILE ? 10 : 20,
    borderWidth: 1, borderColor: COLORS.borderSilver,
    backgroundColor: COLORS.subtleBlack,
  },
  nomineeInfo: { flex: 1, minWidth: 0 },
  nomineeName: {
    color: COLORS.accentWhite, fontSize: IS_MOBILE ? 15 : 22,
    fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2,
  },
  nomineeArtist: { color: COLORS.unisSilver, fontSize: IS_MOBILE ? 10 : 14, marginBottom: 2 },
  nomineeJurisdiction: {
    color: COLORS.unisBlue, fontSize: IS_MOBILE ? 10 : 14, fontWeight: '500', marginTop: 2,
  },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  statTextPlays: { color: COLORS.playBlue, fontSize: IS_MOBILE ? 11 : 13 },
  statTextVotes: { color: COLORS.voteGold, fontSize: IS_MOBILE ? 11 : 13 },

  // Buttons
  nomineeButtons: {
    flexDirection: IS_MOBILE ? 'column' : 'row', gap: IS_MOBILE ? 8 : 10,
    marginLeft: IS_MOBILE ? 10 : 0,
  },
  listenButton: {
    paddingVertical: IS_MOBILE ? 6 : 8, paddingHorizontal: IS_MOBILE ? 12 : 20,
    backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.textGray,
    borderRadius: 4, minWidth: IS_MOBILE ? 60 : 80, alignItems: 'center',
  },
  listenButtonText: {
    color: COLORS.textSilver, fontSize: IS_MOBILE ? 10 : 13,
    fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5,
  },
  voteButton: {
    paddingVertical: IS_MOBILE ? 6 : 8, paddingHorizontal: IS_MOBILE ? 12 : 20,
    backgroundColor: COLORS.unisBlue, borderWidth: 1, borderColor: COLORS.unisBlue,
    borderRadius: 4, minWidth: IS_MOBILE ? 60 : 80, alignItems: 'center',
  },
  voteButtonText: {
    color: COLORS.accentWhite, fontSize: IS_MOBILE ? 10 : 13,
    fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5,
  },
  noNomineesText: {
    color: COLORS.textGray, fontSize: 16, textAlign: 'center', marginTop: 50, fontWeight: '300',
  },
});

export default VoteAwardsScreen;