import React, { useState } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronDown } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { usePlayer } from '../context/PlayerContext';
import IntervalDatePicker from '../components/IntervalDatePicker';
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
  electricBlue: '#4facfe',
  gradientPurple: '#667eea',
  gradientPink: '#f5576c',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 768;

// ============================================================================
// FILTER OPTIONS
// ============================================================================
const LOCATION_OPTIONS = [
  { label: 'Downtown Harlem', value: 'downtown-harlem' },
  { label: 'Uptown Harlem', value: 'uptown-harlem' },
  { label: 'Harlem (All)', value: 'harlem' },
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
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Quarterly', value: 'quarterly' },
  { label: 'Midterm', value: 'midterm' },
  { label: 'Annual', value: 'annual' },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
const formatLocation = (loc: string): string => {
  return loc
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .toUpperCase();
};

const formatGenre = (g: string): string => {
  return g.toUpperCase();
};

const formatCategory = (cat: string): string => {
  return cat.toUpperCase();
};

const getIntervalText = (int: string): string => {
  const intervalMap: { [key: string]: string } = {
    daily: 'OF THE DAY',
    weekly: 'OF THE WEEK',
    monthly: 'OF THE MONTH',
    quarterly: 'OF THE QUARTER',
    midterm: 'OF THE MIDTERM',
    annual: 'OF THE YEAR',
  };
  return intervalMap[int] || 'OF THE DAY';
};

const formatDateDisplay = (dateString: string, intervalType: string): string => {
  if (!dateString) return '';

  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  switch (intervalType) {
    case 'daily':
      return `${days[date.getDay()]}, ${months[month - 1]} ${day}, ${year}`;

    case 'weekly': {
      const dayOfWeek = date.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(year, month - 1, day - daysToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return `Week of ${months[monday.getMonth()]} ${monday.getDate()} - ${sunday.getDate()}, ${monday.getFullYear()}`;
    }

    case 'monthly':
      return `${months[month - 1]} ${year}`;

    case 'quarterly': {
      const q = Math.floor((month - 1) / 3) + 1;
      return `Q${q} ${year}`;
    }

    case 'midterm': {
      const h = month <= 6 ? 1 : 2;
      return `${h === 1 ? 'First' : 'Second'} Half of ${year}`;
    }

    case 'annual':
      return `Year ${year}`;

    default:
      return `${months[month - 1]} ${day}, ${year}`;
  }
};

const getDateRangeForInterval = (
  selectedDate: string,
  intervalType: string
): { startDate: string; endDate: string } => {
  if (!selectedDate) return { startDate: '', endDate: '' };

  const [year, month, day] = selectedDate.split('-').map(Number);
  const startDate = new Date(year, month - 1, day);
  const endDate = new Date(year, month - 1, day);

  switch (intervalType) {
    case 'daily':
      break;
    case 'weekly': {
      const dayOfWeek = startDate.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      startDate.setDate(startDate.getDate() - daysToMonday);
      endDate.setDate(startDate.getDate() + 6);
      break;
    }
    case 'monthly':
      startDate.setDate(1);
      endDate.setDate(new Date(year, month, 0).getDate());
      break;
    case 'quarterly': {
      const quarterStartMonth = Math.floor((month - 1) / 3) * 3;
      startDate.setMonth(quarterStartMonth);
      startDate.setDate(1);
      endDate.setMonth(quarterStartMonth + 2);
      endDate.setDate(new Date(year, quarterStartMonth + 3, 0).getDate());
      break;
    }
    case 'midterm':
      if (month <= 6) {
        startDate.setMonth(0);
        startDate.setDate(1);
        endDate.setMonth(5);
        endDate.setDate(30);
      } else {
        startDate.setMonth(6);
        startDate.setDate(1);
        endDate.setMonth(11);
        endDate.setDate(31);
      }
      break;
    case 'annual':
      startDate.setMonth(0);
      startDate.setDate(1);
      endDate.setMonth(11);
      endDate.setDate(31);
      break;
  }

  const formatDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  };
};

// ============================================================================
// INTERFACES
// ============================================================================
interface MilestoneItem {
  rank: number;
  id: string;
  targetType: string;
  title: string;
  artist: string;
  jurisdiction: string;
  votes: number;
  weightedPoints: number;
  playsCount: number;
  likesCount: number;
  artwork: string | null;
  determinationMethod: string;
  tiedCandidatesCount: number;
  caption?: string;
}

interface DisplayedContext {
  location: string;
  genre: string;
  category: string;
  interval: string;
  selectedDate: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const MilestonesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { playMedia } = usePlayer();

  // Filter state
  const [location, setLocation] = useState('downtown-harlem');
  const [genre, setGenre] = useState('rap');
  const [category, setCategory] = useState<'artist' | 'song'>('artist');
  const [interval, setInterval] = useState<'daily' | 'weekly' | 'monthly' | 'quarterly' | 'midterm' | 'annual'>('daily');
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Display state (frozen when View is clicked)
  const [displayedContext, setDisplayedContext] = useState<DisplayedContext | null>(null);

  // Results state
  const [results, setResults] = useState<MilestoneItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dropdown state
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Fallback image
  const fallbackImage = require('../../assets/randomrapper.jpeg');

  // Max/Min dates as strings (YYYY-MM-DD)
  const getMaxDate = (): string => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (interval === 'annual') {
      const lastYear = new Date().getFullYear() - 1;
      return `${lastYear}-12-31`;
    }

    const year = yesterday.getFullYear();
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const day = String(yesterday.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const minDate = '2025-10-26';

  // ============================================================================
  // HELPER: Generate winner caption (fallback if backend doesn't provide one)
  // ============================================================================
  const generateWinnerCaption = (award: any): string => {
    const method = award.determinationMethod;
    if (!method || method === 'WEIGHTED_VOTES') {
      return `Winner with ${award.weightedPoints || 0} points!`;
    }
    return 'Winner!';
  };

  // ============================================================================
  // CUSTOM DROPDOWN COMPONENT
  // ============================================================================
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
  // FETCH MILESTONES — REAL API
  // ============================================================================
  const handleView = async () => {
    if (!selectedDate) {
      setError('Please select a date.');
      return;
    }

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

      const { startDate, endDate } = getDateRangeForInterval(selectedDate, interval);

      console.log('Milestones API params:', { type, startDate, endDate, jurId, genreId, intervalId });

      const response = await axiosInstance.get(
        `/v1/awards/past?type=${type}&startDate=${startDate}&endDate=${endDate}&jurisdictionId=${jurId}&genreId=${genreId}&intervalId=${intervalId}`
      );

      const rawResults = response.data;

      if (!rawResults || rawResults.length === 0) {
        setError('No awards found for this date. Try a different date.');
        setResults([]);
        return;
      }

      // Normalize API response — matches web version's mapping exactly
      const normalized: MilestoneItem[] = rawResults.map((award: any, i: number) => {
        let title: string;
        let artist: string;
        let artwork: string | null;

        if (award.targetType === 'artist') {
          title = award.user?.username || 'Unknown Artist';
          artist = award.user?.username || 'Unknown Artist';
          artwork = award.user?.photoUrl
            ? getMediaUrl(award.user.photoUrl) || null
            : null;
        } else {
          title = award.song?.title || 'Unknown Song';
          artist = award.song?.artist?.username || 'Unknown Artist';
          artwork = award.song?.artworkUrl
            ? getMediaUrl(award.song.artworkUrl) || null
            : null;
        }

        return {
          rank: i + 1,
          id: award.targetId,
          targetType: award.targetType,
          title,
          artist,
          jurisdiction: award.jurisdiction?.name || location,
          votes: award.votesCount || 0,
          weightedPoints: award.weightedPoints || 0,
          playsCount: award.playsCount || 0,
          likesCount: award.likesCount || 0,
          artwork,
          determinationMethod: award.determinationMethod,
          tiedCandidatesCount: award.tiedCandidatesCount || 0,
          caption: award.caption || generateWinnerCaption(award),
        };
      });

      setResults(normalized);

      // Freeze the displayed context so caption doesn't change until next search
      setDisplayedContext({
        location,
        genre,
        category,
        interval,
        selectedDate,
      });
    } catch (err: any) {
      console.error('Milestones fetch error:', err);
      setError(err.message || 'Failed to load milestones. Please try again.');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================================
  // DETERMINATION BADGE
  // ============================================================================
  const getDeterminationBadge = (
    method: string,
    tiedCount: number,
    weightedPoints: number,
    playsCount: number,
    likesCount: number
  ) => {
    if (!method) return null;

    const badgeStyles: { [key: string]: any } = {
      WEIGHTED_VOTES: { bg: ['#667eea', '#764ba2'], text: `${weightedPoints} pts` },
      PLAYS: { bg: ['#4facfe', '#00f2fe'], text: `${tiedCount}-way tie • ${playsCount} plays` },
      LIKES: { bg: ['#fa709a', '#fee140'], text: `${tiedCount}-way tie • ${likesCount} likes` },
      SCORE: { bg: ['#a8edea', '#fed6e3'], text: 'Tie • by score', darkText: true },
      SENIORITY: { bg: ['#d299c2', '#fef9d7'], text: 'Tie • by seniority', darkText: true },
      FALLBACK: { bg: ['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.1)'], text: 'No votes' },
    };

    const badge = badgeStyles[method];
    if (!badge) return null;

    return (
      <LinearGradient
        colors={badge.bg}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.badge}
      >
        <Text style={[styles.badgeText, badge.darkText && styles.badgeTextDark]}>
          {badge.text}
        </Text>
      </LinearGradient>
    );
  };

  // ============================================================================
  // RENDER CAPTION
  // ============================================================================
  const renderCaption = () => {
    if (!displayedContext || results.length === 0) return null;

    const locationText = formatLocation(displayedContext.location);
    const genreText = formatGenre(displayedContext.genre);
    const categoryText = formatCategory(displayedContext.category);
    const intervalText = getIntervalText(displayedContext.interval);
    const dateText = formatDateDisplay(displayedContext.selectedDate, displayedContext.interval);

    return (
      <View style={styles.captionContainer}>
        <Text style={styles.captionTop}>
          {locationText} {genreText}
        </Text>
        <Text style={styles.dramaticEffect}>
          {categoryText} {intervalText}
        </Text>
        <Text style={styles.milestoneDate}>{dateText}</Text>
      </View>
    );
  };

  // ============================================================================
  // RENDER WINNER HIGHLIGHT
  // ============================================================================
  const renderWinnerHighlight = () => {
    if (results.length === 0) return null;

    const winner = results[0];
    const winnerArtwork = winner.artwork ? { uri: winner.artwork } : fallbackImage;

    return (
      <View style={styles.winnerHighlight}>
        {/* Ambient Glow Background */}
        <Image source={winnerArtwork} style={styles.ambientGlow} blurRadius={80} />

        {/* Glass Content */}
        <View style={styles.winnerContentGlass}>
          {/* Header */}
          <View style={styles.winnerHeader}>
            <Text style={styles.winnerTitle}>{winner.title}</Text>
            <Text style={styles.winnerArtist}>{winner.artist}</Text>
            <Text style={styles.winnerJurisdiction}>{winner.jurisdiction}</Text>
          </View>

          {/* Artwork */}
          <View style={styles.winnerArtworkWrapper}>
            <Image source={winnerArtwork} style={styles.winnerArtwork} />
          </View>

          {/* Stats */}
          <View style={styles.winnerStatsContainer}>
            <View style={styles.winnerStats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{winner.weightedPoints}</Text>
                <Text style={styles.statLabel}>points</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{winner.votes}</Text>
                <Text style={styles.statLabel}>votes</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{winner.playsCount}</Text>
                <Text style={styles.statLabel}>plays</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{winner.likesCount}</Text>
                <Text style={styles.statLabel}>likes</Text>
              </View>
            </View>

            {getDeterminationBadge(
              winner.determinationMethod,
              winner.tiedCandidatesCount,
              winner.weightedPoints,
              winner.playsCount,
              winner.likesCount
            )}

            {winner.caption && (
              <Text style={styles.winnerCaption}>"{winner.caption}"</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  // ============================================================================
  // RENDER RESULT ITEM
  // ============================================================================
  const renderResultItem = (item: MilestoneItem) => {
    const itemArtwork = item.artwork ? { uri: item.artwork } : fallbackImage;

    return (
      <View key={`${item.id}-${item.rank}`} style={styles.resultItem}>
        <Text style={styles.rank}>#{item.rank}</Text>
        <Image source={itemArtwork} style={styles.itemArtwork} />
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.itemArtist} numberOfLines={1}>
            {item.artist}
          </Text>
        </View>
        <View style={styles.itemStats}>
          <Text style={styles.points}>{item.weightedPoints} pts</Text>
          {getDeterminationBadge(
            item.determinationMethod,
            item.tiedCandidatesCount,
            item.weightedPoints,
            item.playsCount,
            item.likesCount
          )}
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

              {/* Interval-Aware Date Picker */}
              <IntervalDatePicker
                interval={interval}
                value={selectedDate}
                onChange={setSelectedDate}
                maxDate={getMaxDate()}
                minDate={minDate}
              />

              {/* View Button */}
              <TouchableOpacity
                style={[styles.viewButton, isLoading && styles.viewButtonDisabled]}
                onPress={handleView}
                disabled={isLoading}
              >
                <Text style={styles.viewButtonText}>
                  {isLoading ? 'Loading…' : 'View'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Caption */}
          {renderCaption()}

          {/* Winner Highlight */}
          {renderWinnerHighlight()}

          {/* Results Section */}
          <View style={styles.resultsSection}>
            {isLoading ? (
              <View style={styles.messageContainer}>
                <ActivityIndicator size="large" color={COLORS.unisBlue} />
                <Text style={styles.messageText}>Loading milestones…</Text>
              </View>
            ) : error ? (
              <View style={styles.messageContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : results.length > 1 ? (
              <View style={styles.resultsList}>
                {results.slice(1).map(renderResultItem)}
              </View>
            ) : results.length === 0 ? (
              <View style={styles.messageContainer}>
                <Text style={styles.messageText}>
                  Select criteria and date, then tap 'View' to see past winners.
                </Text>
              </View>
            ) : null}
          </View>

          {/* Bottom spacing for player */}
          <View style={{ height: 120 }} />
        </ScrollView>
      </LinearGradient>
    </ImageBackground>
  );
};

// ============================================================================
// STYLES (converted from milestonesPage.scss)
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
    backgroundColor: 'rgba(22, 51, 135, 0.8)',
    borderRadius: 12,
    padding: IS_MOBILE ? 16 : 20,
    width: '100%',
    maxWidth: 900,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.borderSilverSolid,
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
    minWidth: IS_MOBILE ? undefined : 140,
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

  // View Button
  viewButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.textSilver,
    borderRadius: 50,
    width: IS_MOBILE ? '100%' : 'auto',
    alignItems: 'center',
  },
  viewButtonDisabled: {
    opacity: 0.5,
  },
  viewButtonText: {
    color: COLORS.textSilver,
    fontWeight: 'bold',
    fontSize: 14,
  },

  // Caption
  captionContainer: {
    marginVertical: 20,
    alignItems: 'center',
  },
  captionTop: {
    fontSize: 14,
    color: COLORS.textGray,
    textTransform: 'uppercase',
    letterSpacing: 3,
    marginBottom: 5,
  },
  dramaticEffect: {
    fontSize: IS_MOBILE ? 24 : 32,
    fontWeight: '800',
    color: COLORS.accentWhite,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginVertical: 5,
    textAlign: 'center',
  },
  milestoneDate: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.electricBlue,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(79, 172, 254, 0.3)',
  },

  // Winner Highlight
  winnerHighlight: {
    width: '100%',
    maxWidth: 900,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  ambientGlow: {
    position: 'absolute',
    top: -100,
    left: -100,
    right: -100,
    bottom: -100,
    opacity: 0.5,
  },
  winnerContentGlass: {
    backgroundColor: 'rgba(10, 10, 10, 0.65)',
    padding: IS_MOBILE ? 20 : 30,
    alignItems: 'center',
  },
  winnerHeader: {
    alignItems: 'center',
    marginBottom: 15,
  },
  winnerTitle: {
    fontSize: IS_MOBILE ? 28 : 40,
    color: COLORS.accentWhite,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
  winnerArtist: {
    fontSize: IS_MOBILE ? 18 : 24,
    color: COLORS.textSilver,
    marginTop: 5,
  },
  winnerJurisdiction: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 5,
  },
  winnerArtworkWrapper: {
    marginVertical: 20,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.6,
    shadowRadius: 35,
  },
  winnerArtwork: {
    width: IS_MOBILE ? 250 : 350,
    height: IS_MOBILE ? 250 : 350,
    borderRadius: 12,
  },
  winnerStatsContainer: {
    width: '100%',
    alignItems: 'center',
  },
  winnerStats: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: IS_MOBILE ? 16 : 32,
    marginBottom: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 15,
    paddingHorizontal: IS_MOBILE ? 15 : 30,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: IS_MOBILE ? 18 : 22,
    fontWeight: 'bold',
    color: COLORS.accentWhite,
  },
  statLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 1,
    marginTop: 2,
  },
  winnerCaption: {
    fontSize: IS_MOBILE ? 16 : 18,
    fontStyle: 'italic',
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 15,
    textAlign: 'center',
  },

  // Badge
  badge: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 10,
  },
  badgeText: {
    color: COLORS.accentWhite,
    fontSize: 12,
    fontWeight: '600',
  },
  badgeTextDark: {
    color: '#333',
  },

  // Results Section
  resultsSection: {
    width: '100%',
    maxWidth: 900,
  },
  resultsList: {
    gap: 15,
  },
  resultItem: {
    backgroundColor: 'rgba(20, 20, 20, 0.8)',
    borderRadius: 12,
    padding: IS_MOBILE ? 12 : 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  rank: {
    fontSize: IS_MOBILE ? 20 : 28,
    fontWeight: 'bold',
    color: '#444',
    width: IS_MOBILE ? 35 : 50,
    textAlign: 'center',
  },
  itemArtwork: {
    width: IS_MOBILE ? 50 : 60,
    height: IS_MOBILE ? 50 : 60,
    borderRadius: 8,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: IS_MOBILE ? 14 : 18,
    fontWeight: 'bold',
    color: COLORS.textSilver,
  },
  itemArtist: {
    fontSize: IS_MOBILE ? 12 : 14,
    color: COLORS.textGray,
    marginTop: 2,
  },
  itemStats: {
    alignItems: 'flex-end',
  },
  points: {
    fontWeight: 'bold',
    color: COLORS.gradientPurple,
    fontSize: IS_MOBILE ? 12 : 14,
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

export default MilestonesScreen;