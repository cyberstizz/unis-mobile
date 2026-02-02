// src/screens/FindScreen.tsx
// Interactive map-based music discovery - "The Hook Point"
// Drill down through jurisdictions to find top artists and songs
// Ported from web FindPage.jsx
// Uses MapLibre (free, open source) with CartoDB dark tiles

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import MapLibreGL from '@maplibre/maplibre-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';

import { usePlayer } from '../context/PlayerContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 768;

// Initialize MapLibre
MapLibreGL.setAccessToken(null); // No token needed for free tiles

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
};

// CartoDB Dark Tiles - same as your web Leaflet map!
const CARTO_DARK_STYLE = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

// US States GeoJSON URL (same as web app)
const US_STATES_GEOJSON_URL =
  'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';

// Active jurisdictions - only these have real data
const ACTIVE_JURISDICTIONS = ['Harlem', 'Uptown Harlem', 'Downtown Harlem'];

// Harlem's parent chain - these show Harlem data
const HARLEM_PARENT_CHAIN = [
  'Unis', 'New York', 'New York City Metro', 'New York City',
  'Manhattan', 'Upper Manhattan', 'Harlem', 'Uptown Harlem', 'Downtown Harlem',
];

// =============================================================================
// FILTER OPTIONS
// =============================================================================
const GENRES = [
  { value: 'rap-hiphop', label: 'Rap' },
  { value: 'rock', label: 'Rock' },
  { value: 'pop', label: 'Pop' },
];

// =============================================================================
// DUMMY DATA
// =============================================================================
const getDummyArtists = () => [
  {
    id: 'artist1',
    name: 'Tony Fadd',
    votes: 1250,
    artwork: 'https://picsum.photos/200?random=fa1',
  },
  {
    id: 'artist2',
    name: 'SD Boomin',
    votes: 890,
    artwork: 'https://picsum.photos/200?random=fa2',
  },
  {
    id: 'artist3',
    name: 'Harlem Rose',
    votes: 654,
    artwork: 'https://picsum.photos/200?random=fa3',
  },
];

const getDummySongs = () => [
  {
    id: 'song1',
    title: 'Paranoid',
    artist: 'Tony Fadd',
    votes: 2450,
    fileUrl: 'https://example.com/song1.mp3',
    artwork: 'https://picsum.photos/200?random=fs1',
  },
  {
    id: 'song2',
    title: 'Waited All Night',
    artist: 'SD Boomin',
    votes: 1890,
    fileUrl: 'https://example.com/song2.mp3',
    artwork: 'https://picsum.photos/200?random=fs2',
  },
  {
    id: 'song3',
    title: 'Golden Hour',
    artist: 'Harlem Rose',
    votes: 1560,
    fileUrl: 'https://example.com/song3.mp3',
    artwork: 'https://picsum.photos/200?random=fs3',
  },
];

const getDummyJurisdictions = () => [
  { jurisdictionId: 'nyc-metro', name: 'New York City Metro', hasChildren: true },
  { jurisdictionId: 'buffalo', name: 'Buffalo', hasChildren: false },
  { jurisdictionId: 'albany', name: 'Albany', hasChildren: false },
];

const getDummyNYCChildren = () => [
  { jurisdictionId: 'manhattan', name: 'Manhattan', hasChildren: true },
  { jurisdictionId: 'brooklyn', name: 'Brooklyn', hasChildren: true },
  { jurisdictionId: 'queens', name: 'Queens', hasChildren: true },
  { jurisdictionId: 'bronx', name: 'Bronx', hasChildren: true },
  { jurisdictionId: 'staten-island', name: 'Staten Island', hasChildren: false },
];

const getDummyManhattanChildren = () => [
  { jurisdictionId: 'upper-manhattan', name: 'Upper Manhattan', hasChildren: true },
  { jurisdictionId: 'midtown', name: 'Midtown', hasChildren: false },
  { jurisdictionId: 'downtown', name: 'Downtown', hasChildren: false },
];

const getDummyUpperManhattanChildren = () => [
  { jurisdictionId: 'harlem', name: 'Harlem', hasChildren: true },
  { jurisdictionId: 'washington-heights', name: 'Washington Heights', hasChildren: false },
  { jurisdictionId: 'inwood', name: 'Inwood', hasChildren: false },
];

const getDummyHarlemChildren = () => [
  { jurisdictionId: 'uptown-harlem', name: 'Uptown Harlem', hasChildren: false },
  { jurisdictionId: 'downtown-harlem', name: 'Downtown Harlem', hasChildren: false },
];

// =============================================================================
// INTERFACES
// =============================================================================
interface NavigationItem {
  name: string;
  jurisdictionId: string | null;
  tier: number;
}

interface Jurisdiction {
  jurisdictionId: string;
  name: string;
  hasChildren: boolean;
  polygon?: any;
}

interface TopResult {
  id: string;
  name?: string;
  title?: string;
  artist?: string;
  votes: number;
  artwork: string;
  fileUrl?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================
const FindScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { playMedia } = usePlayer();
  const mapRef = useRef<MapLibreGL.MapView>(null);
  const cameraRef = useRef<MapLibreGL.Camera>(null);

  // State
  const [userId, setUserId] = useState<string | null>(null);
  const [genre, setGenre] = useState('rap-hiphop');
  const [usGeoData, setUsGeoData] = useState<any>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Navigation
  const [navigationStack, setNavigationStack] = useState<NavigationItem[]>([
    { name: 'United States', jurisdictionId: null, tier: 0 },
  ]);
  const [currentJurisdictions, setCurrentJurisdictions] = useState<Jurisdiction[]>([]);
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<Jurisdiction | null>(null);

  // Results
  const [topArtists, setTopArtists] = useState<TopResult[]>([]);
  const [topSongs, setTopSongs] = useState<TopResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSelectedJurisdiction, setHasSelectedJurisdiction] = useState(false);

  // Animation values for result cards
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Active filter dropdown
  const [showGenreDropdown, setShowGenreDropdown] = useState(false);

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

  // Fetch US GeoJSON on mount
  useEffect(() => {
    fetch(US_STATES_GEOJSON_URL)
      .then((res) => res.json())
      .then((data) => {
        console.log('US GeoJSON loaded successfully');
        setUsGeoData(data);
      })
      .catch((err) => console.error('Failed to load US states:', err));
  }, []);

  // ==========================================================================
  // HELPER FUNCTIONS
  // ==========================================================================

  const isInHarlemChain = (name: string) => HARLEM_PARENT_CHAIN.includes(name);
  const isActiveJurisdiction = (name: string) => ACTIVE_JURISDICTIONS.includes(name);
  const isAtUSLevel = () => navigationStack.length === 1;

  const displayTerritory =
    selectedJurisdiction?.name ||
    (navigationStack.length > 1
      ? navigationStack[navigationStack.length - 1].name
      : 'Select a State');

  // ==========================================================================
  // CAMERA POSITIONS
  // ==========================================================================

  const US_CENTER = [-98.5795, 39.8283]; // [lng, lat]
  const US_ZOOM = 3;

  const NY_CENTER = [-75.5, 42.5];
  const NY_ZOOM = 6;

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  const handleStatePress = async (stateName: string) => {
    if (stateName !== 'New York') {
      Alert.alert('Coming Soon', `${stateName} coming to Unis soon!`);
      return;
    }

    setSelectedState(stateName);
    setHasSelectedJurisdiction(true);

    // Navigate to NY
    setNavigationStack([
      { name: 'United States', jurisdictionId: null, tier: 0 },
      { name: 'New York', jurisdictionId: 'new-york', tier: 2 },
    ]);

    // Load dummy children
    setCurrentJurisdictions(getDummyJurisdictions());

    // Animate map to NY
    cameraRef.current?.setCamera({
      centerCoordinate: NY_CENTER,
      zoomLevel: NY_ZOOM,
      animationDuration: 1000,
    });

    // Load results
    loadTopResults('New York');
  };

  const handleJurisdictionClick = async (jurisdiction: Jurisdiction) => {
    setSelectedJurisdiction(jurisdiction);
    setHasSelectedJurisdiction(true);

    if (jurisdiction.hasChildren) {
      // Get children based on which jurisdiction was clicked
      let children: Jurisdiction[] = [];

      switch (jurisdiction.name) {
        case 'New York City Metro':
          children = getDummyNYCChildren();
          break;
        case 'Manhattan':
          children = getDummyManhattanChildren();
          break;
        case 'Upper Manhattan':
          children = getDummyUpperManhattanChildren();
          break;
        case 'Harlem':
          children = getDummyHarlemChildren();
          break;
        default:
          children = [];
      }

      if (children.length > 0) {
        setNavigationStack((prev) => [
          ...prev,
          {
            name: jurisdiction.name,
            jurisdictionId: jurisdiction.jurisdictionId,
            tier: prev[prev.length - 1].tier + 1,
          },
        ]);
        setCurrentJurisdictions(children);
      }
    }

    loadTopResults(jurisdiction.name);
  };

  const handleBack = () => {
    if (navigationStack.length <= 1) return;

    const newStack = [...navigationStack];
    newStack.pop();
    const previousLevel = newStack[newStack.length - 1];

    setNavigationStack(newStack);

    if (previousLevel.tier === 0) {
      // Back to US level
      setCurrentJurisdictions([]);
      setSelectedJurisdiction(null);
      setSelectedState(null);
      setHasSelectedJurisdiction(false);
      setTopArtists([]);
      setTopSongs([]);

      cameraRef.current?.setCamera({
        centerCoordinate: US_CENTER,
        zoomLevel: US_ZOOM,
        animationDuration: 1000,
      });
    } else {
      // Get previous level's children
      let children: Jurisdiction[] = [];

      switch (previousLevel.name) {
        case 'New York':
          children = getDummyJurisdictions();
          break;
        case 'New York City Metro':
          children = getDummyNYCChildren();
          break;
        case 'Manhattan':
          children = getDummyManhattanChildren();
          break;
        case 'Upper Manhattan':
          children = getDummyUpperManhattanChildren();
          break;
        case 'Harlem':
          children = getDummyHarlemChildren();
          break;
      }

      setCurrentJurisdictions(children);
      loadTopResults(previousLevel.name);
    }
  };

  const handleRandom = () => {
    const states = [
      'New York', 'California', 'Texas', 'Florida', 'Illinois',
      'Washington', 'Arizona', 'Colorado', 'Ohio', 'Georgia',
    ];

    setIsAnimating(true);
    let count = 0;

    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * states.length);
      setHoveredState(states[randomIndex]);
      count++;

      if (count >= 10) {
        clearInterval(interval);
        setIsAnimating(false);
        const finalState = states[Math.floor(Math.random() * states.length)];
        setHoveredState(null);
        handleStatePress(finalState);
      }
    }, 200);
  };

  // Handle map feature press
  const handleMapPress = (event: any) => {
    const { features } = event;
    if (features && features.length > 0) {
      const feature = features[0];
      const stateName = feature.properties?.name;
      if (stateName) {
        handleStatePress(stateName);
      }
    }
  };

  // ==========================================================================
  // DATA LOADING
  // ==========================================================================

  const loadTopResults = async (jurisdictionName: string) => {
    setLoading(true);
    fadeAnim.setValue(0);

    // Simulate API call with dummy data
    await new Promise((resolve) => setTimeout(resolve, 500));

    setTopArtists(getDummyArtists());
    setTopSongs(getDummySongs());
    setLoading(false);

    // Animate results in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  };

  // ==========================================================================
  // PLAYBACK
  // ==========================================================================

  const handlePlay = (item: TopResult) => {
    if (item.fileUrl) {
      playMedia(
        {
          id: item.id,
          songId: item.id,
          title: item.title || item.name || 'Unknown',
          artist: item.artist || item.name || 'Unknown',
          url: item.fileUrl,
          artwork: item.artwork,
        },
        []
      );
    } else {
      console.log('Play artist default song:', item.id);
      Alert.alert('Coming Soon', 'Artist playback will be available when connected to backend');
    }
  };

  const handleView = (item: TopResult, type: 'artist' | 'song') => {
    console.log(`Navigate to ${type}:`, item.id);
  };

  // ==========================================================================
  // RENDER HELPERS
  // ==========================================================================

  // Render ambient result card
  const renderResultCard = (item: TopResult, index: number, type: 'artist' | 'song') => {
    const title = type === 'song' ? item.title : item.name;
    const subtitle = type === 'song' ? item.artist : `${item.votes} votes`;

    return (
      <Animated.View
        key={item.id}
        style={[
          styles.resultCard,
          {
            opacity: fadeAnim,
            transform: [
              {
                translateX: fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-20, 0],
                }),
              },
            ],
          },
        ]}
      >
        {/* Ambient glow background */}
        <Image
          source={{ uri: item.artwork }}
          style={styles.ambientBg}
          blurRadius={40}
        />

        {/* Glass content */}
        <LinearGradient
          colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.1)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.glassContent}
        >
          {/* Rank */}
          {!IS_MOBILE && <Text style={styles.rank}>#{index + 1}</Text>}

          {/* Artwork */}
          <Image source={{ uri: item.artwork }} style={styles.itemArtwork} />

          {/* Info */}
          <View style={styles.itemInfo}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.itemSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>

          {/* Buttons */}
          <TouchableOpacity style={styles.playButton} onPress={() => handlePlay(item)}>
            <Text style={styles.playButtonText}>Play</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.viewButton} onPress={() => handleView(item, type)}>
            <Text style={styles.viewButtonText}>View</Text>
          </TouchableOpacity>
        </LinearGradient>
      </Animated.View>
    );
  };

  // Render jurisdiction pill
  const renderJurisdictionPill = (jurisdiction: Jurisdiction) => {
    const isSelected = selectedJurisdiction?.jurisdictionId === jurisdiction.jurisdictionId;
    const isActive = isActiveJurisdiction(jurisdiction.name);
    const inChain = isInHarlemChain(jurisdiction.name);

    return (
      <TouchableOpacity
        key={jurisdiction.jurisdictionId}
        style={[
          styles.jurisdictionPill,
          isSelected && styles.jurisdictionPillSelected,
          inChain && styles.jurisdictionPillInChain,
        ]}
        onPress={() => handleJurisdictionClick(jurisdiction)}
      >
        <Text
          style={[
            styles.jurisdictionPillText,
            isSelected && styles.jurisdictionPillTextSelected,
          ]}
        >
          {jurisdiction.name}
        </Text>
        {isActive && <Text style={styles.activeBadge}>●</Text>}
      </TouchableOpacity>
    );
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <View style={styles.container}>
      {/* Background */}
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
          {/* Genre Dropdown */}
          <View style={styles.filterWrapper}>
            <TouchableOpacity
              style={[styles.filterButton, showGenreDropdown && styles.filterButtonActive]}
              onPress={() => setShowGenreDropdown(!showGenreDropdown)}
            >
              <Text style={styles.filterButtonText}>
                {GENRES.find((g) => g.value === genre)?.label || 'Rap'}
              </Text>
            </TouchableOpacity>

            {showGenreDropdown && (
              <View style={styles.filterDropdown}>
                {GENRES.map((g) => (
                  <TouchableOpacity
                    key={g.value}
                    style={[styles.filterOption, genre === g.value && styles.filterOptionActive]}
                    onPress={() => {
                      setGenre(g.value);
                      setShowGenreDropdown(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.filterOptionText,
                        genre === g.value && styles.filterOptionTextActive,
                      ]}
                    >
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Random Button */}
          <TouchableOpacity
            style={[styles.randomButton, isAnimating && styles.randomButtonDisabled]}
            onPress={handleRandom}
            disabled={isAnimating || loading}
          >
            <Text style={styles.randomButtonText}>
              {isAnimating ? 'Spinning...' : 'Random'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Map Section */}
        <View style={styles.mapSection}>
          {/* Territory Name */}
          <Text style={styles.territoryName}>{displayTerritory}</Text>

          {/* Back Button */}
          {!isAtUSLevel() && (
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <ChevronLeft size={16} color={COLORS.unisBlue} />
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          )}

          {/* Map Container */}
          <View style={styles.mapContainer}>
            <MapLibreGL.MapView
              ref={mapRef}
              style={styles.map}
              styleJSON={JSON.stringify(CARTO_DARK_STYLE)}
              logoEnabled={false}
              attributionEnabled={false}
              onPress={handleMapPress}
            >
              <MapLibreGL.Camera
                ref={cameraRef}
                defaultSettings={{
                  centerCoordinate: US_CENTER,
                  zoomLevel: US_ZOOM,
                }}
              />

              {/* US States GeoJSON Layer */}
              {usGeoData && isAtUSLevel() && (
                <MapLibreGL.ShapeSource
                  id="us-states"
                  shape={usGeoData}
                  onPress={(e) => {
                    const feature = e.features[0];
                    if (feature?.properties?.name) {
                      handleStatePress(feature.properties.name);
                    }
                  }}
                >
                  <MapLibreGL.FillLayer
                    id="states-fill"
                    style={{
                      fillColor: '#EAEAEC',
                      fillOpacity: 0.9,
                    }}
                  />
                  <MapLibreGL.LineLayer
                    id="states-border"
                    style={{
                      lineColor: '#999',
                      lineWidth: 1,
                    }}
                  />
                </MapLibreGL.ShapeSource>
              )}
            </MapLibreGL.MapView>
          </View>

          {/* Jurisdiction List (Mobile-style, below map) */}
          {!isAtUSLevel() && currentJurisdictions.length > 0 && (
            <View style={styles.jurisdictionList}>
              <Text style={styles.jurisdictionListTitle}>Tap a region to explore:</Text>
              <View style={styles.jurisdictionPills}>
                {currentJurisdictions.map(renderJurisdictionPill)}
              </View>
            </View>
          )}
        </View>

        {/* Results Section */}
        {hasSelectedJurisdiction && (
          <View style={styles.resultsSection}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.unisBlue} />
                <Text style={styles.loadingText}>Loading top results...</Text>
              </View>
            ) : (
              <>
                {/* Top Songs */}
                <View style={styles.resultsColumn}>
                  <Text style={styles.resultsTitle}>Top Songs in {displayTerritory}</Text>
                  <View style={styles.resultsList}>
                    {topSongs.length > 0 ? (
                      topSongs.map((song, index) => renderResultCard(song, index, 'song'))
                    ) : (
                      <Text style={styles.noResultsText}>No songs yet</Text>
                    )}
                  </View>
                </View>

                {/* Top Artists */}
                <View style={styles.resultsColumn}>
                  <Text style={styles.resultsTitle}>Top Artists in {displayTerritory}</Text>
                  <View style={styles.resultsList}>
                    {topArtists.length > 0 ? (
                      topArtists.map((artist, index) => renderResultCard(artist, index, 'artist'))
                    ) : (
                      <Text style={styles.noResultsText}>No artists yet</Text>
                    )}
                  </View>
                </View>
              </>
            )}
          </View>
        )}

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

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 20,
    alignItems: 'center',
  },

  // Filters
  filtersContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 20,
    zIndex: 100,
  },
  filterWrapper: {
    position: 'relative',
  },
  filterButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: COLORS.bgBlack,
    borderWidth: 1,
    borderColor: COLORS.borderSilver,
    borderRadius: 8,
    minWidth: 100,
  },
  filterButtonActive: {
    borderColor: COLORS.unisBlue,
    backgroundColor: 'rgba(22, 51, 135, 0.1)',
  },
  filterButtonText: {
    color: COLORS.textSilver,
    fontSize: 14,
    textAlign: 'center',
  },
  filterDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: COLORS.subtleBlack,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderSilver,
    overflow: 'hidden',
    zIndex: 1000,
  },
  filterOption: {
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  filterOptionActive: {
    backgroundColor: 'rgba(22, 51, 135, 0.2)',
  },
  filterOptionText: {
    color: COLORS.textSilver,
    fontSize: 14,
  },
  filterOptionTextActive: {
    color: COLORS.unisBlue,
  },
  randomButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: COLORS.bgBlack,
    borderWidth: 1,
    borderColor: COLORS.borderSilver,
    borderRadius: 8,
    minWidth: 100,
  },
  randomButtonDisabled: {
    opacity: 0.5,
  },
  randomButtonText: {
    color: COLORS.textSilver,
    fontSize: 14,
    textAlign: 'center',
  },

  // Map Section
  mapSection: {
    width: IS_MOBILE ? '95%' : '80%',
    maxWidth: 900,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.textSilver,
    paddingTop: 10,
  },
  territoryName: {
    color: COLORS.unisBlue,
    fontSize: IS_MOBILE ? 24 : 30,
    fontFamily: 'BitcountGridDouble',
    textAlign: 'center',
    marginBottom: 5,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: COLORS.unisBlue,
    borderRadius: 8,
    marginBottom: 10,
  },
  backButtonText: {
    color: COLORS.unisBlue,
    fontSize: 12,
    marginLeft: 4,
  },
  mapContainer: {
    width: '100%',
    height: IS_MOBILE ? 280 : 380,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: COLORS.textSilver,
    backgroundColor: COLORS.subtleBlack,
  },
  map: {
    flex: 1,
  },

  // Jurisdiction List
  jurisdictionList: {
    width: '100%',
    marginTop: 15,
    paddingHorizontal: 10,
  },
  jurisdictionListTitle: {
    color: COLORS.textGray,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  jurisdictionPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  jurisdictionPill: {
    backgroundColor: 'rgba(22, 51, 135, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(22, 51, 135, 0.5)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  jurisdictionPillSelected: {
    backgroundColor: COLORS.unisBlue,
    borderColor: COLORS.unisBlue,
  },
  jurisdictionPillInChain: {
    borderColor: 'rgba(46, 90, 172, 0.7)',
  },
  jurisdictionPillText: {
    color: COLORS.textSilver,
    fontSize: 13,
  },
  jurisdictionPillTextSelected: {
    color: COLORS.accentWhite,
  },
  activeBadge: {
    color: '#4CAF50',
    fontSize: 10,
  },

  // Results Section
  resultsSection: {
    width: '95%',
    maxWidth: 1000,
    marginTop: 20,
    gap: 20,
  },
  resultsColumn: {
    flex: 1,
  },
  resultsTitle: {
    color: COLORS.textSilver,
    fontSize: IS_MOBILE ? 18 : 22,
    fontWeight: '300',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 15,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  resultsList: {
    gap: 12,
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: COLORS.textGray,
    marginTop: 10,
  },
  noResultsText: {
    color: COLORS.textGray,
    textAlign: 'center',
    paddingVertical: 20,
  },

  // Result Card (Ambient Mode)
  resultCard: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(20, 20, 20, 0.6)',
  },
  ambientBg: {
    position: 'absolute',
    top: '-50%',
    left: '-50%',
    width: '200%',
    height: '200%',
    opacity: 0.3,
  },
  glassContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: IS_MOBILE ? 10 : 15,
    gap: IS_MOBILE ? 10 : 15,
  },
  rank: {
    fontSize: 24,
    color: 'rgba(255, 255, 255, 0.4)',
    minWidth: 40,
  },
  itemArtwork: {
    width: IS_MOBILE ? 45 : 60,
    height: IS_MOBILE ? 45 : 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    color: COLORS.accentWhite,
    fontSize: IS_MOBILE ? 14 : 16,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  itemSubtitle: {
    color: COLORS.textSilver,
    fontSize: IS_MOBILE ? 12 : 14,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  playButton: {
    paddingVertical: IS_MOBILE ? 6 : 8,
    paddingHorizontal: IS_MOBILE ? 12 : 18,
    backgroundColor: COLORS.unisBlue,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 50,
  },
  playButtonText: {
    color: COLORS.textSilver,
    fontSize: IS_MOBILE ? 11 : 12,
    fontWeight: '600',
  },
  viewButton: {
    paddingVertical: IS_MOBILE ? 6 : 8,
    paddingHorizontal: IS_MOBILE ? 12 : 18,
    backgroundColor: COLORS.bgBlack,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 50,
  },
  viewButtonText: {
    color: COLORS.textSilver,
    fontSize: IS_MOBILE ? 11 : 12,
    fontWeight: '600',
  },
});

export default FindScreen;