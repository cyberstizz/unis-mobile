// src/screens/FindScreen.tsx
// Interactive map-based music discovery — "The Hook Point"
// Drill down through jurisdictions to find top artists and songs
//
// FULLY WIRED TO BACKEND:
//   - /v1/jurisdictions/byName/{name}
//   - /v1/jurisdictions/{id}/children/detailed
//   - /v1/jurisdictions/{id}/tops
//   - /v1/jurisdictions/{id} (single)
//   - /v1/users/{id}/default-song
//   - /v1/media/song/{id}/play?userId={userId}
//
// KEY FIXES vs previous version:
//   1. NO onStartShouldSetResponder — was blocking ScrollView from scrolling past map
//   2. Camera ref on Camera COMPONENT (not MapView) for flyTo/fitBounds
//   3. Full page layout preserved — filters → map → pills → results all scroll
//   4. GeoJSON properties use 1/0 for MapLibre expression compatibility
//   5. Feature IDs added for press identification
//   6. ShapeSource hitbox for reliable tap detection
//   7. US zoom 2.2 to show complete map on mobile

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
  Platform,
} from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';

import { usePlayer } from '../context/PlayerContext';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';

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
};

// CartoDB Dark Tiles (dark basemap — states render as white tiles on top)
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

const US_STATES_GEOJSON_URL =
  'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';

const ACTIVE_JURISDICTIONS = ['Harlem', 'Uptown Harlem', 'Downtown Harlem'];
const HARLEM_PARENT_CHAIN = [
  'Unis', 'New York', 'New York City Metro', 'New York City',
  'Manhattan', 'Upper Manhattan', 'Harlem', 'Uptown Harlem', 'Downtown Harlem',
];

const GENRES = [
  { value: 'rap-hiphop', label: 'Rap' },
  { value: 'rock', label: 'Rock' },
  { value: 'pop', label: 'Pop' },
];

// Camera positions — zoom 2.2 shows full US on mobile screens
const US_CENTER: [number, number] = [-98.5795, 39.8283];
const US_ZOOM = 2.4;

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
  bio?: string;
  isActive?: boolean;
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
// HELPERS
// =============================================================================
const isInHarlemChain = (name: string) => HARLEM_PARENT_CHAIN.includes(name);
const isActiveJurisdiction = (name: string) => ACTIVE_JURISDICTIONS.includes(name);

const parsePolygon = (polygon: any): any => {
  if (!polygon) return null;
  try {
    return typeof polygon === 'string' ? JSON.parse(polygon) : polygon;
  } catch (e) {
    console.error('Failed to parse polygon:', e);
    return null;
  }
};

// Returns [[sw_lng, sw_lat], [ne_lng, ne_lat]] for MapLibre
const getBoundsFromPolygon = (polygon: any): [[number, number], [number, number]] | null => {
  const geometry = parsePolygon(polygon);
  if (!geometry?.coordinates) return null;

  // Handle both Polygon and MultiPolygon
  let allCoords: number[][] = [];
  if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach((poly: number[][][]) => {
      allCoords = allCoords.concat(poly[0]);
    });
  } else if (geometry.type === 'Polygon') {
    allCoords = geometry.coordinates[0];
  }

  if (!allCoords || allCoords.length === 0) return null;

  const lngs = allCoords.map((c: number[]) => c[0]);
  const lats = allCoords.map((c: number[]) => c[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)], // SW [lng, lat]
    [Math.max(...lngs), Math.max(...lats)], // NE [lng, lat]
  ];
};

// Convert jurisdictions to GeoJSON — uses 1/0 for MapLibre expression compatibility
const jurisdictionsToGeoJSON = (jurisdictions: Jurisdiction[]) => {
  const features = jurisdictions
    .filter(j => j.polygon)
    .map((j, index) => {
      const geometry = parsePolygon(j.polygon);
      if (!geometry) return null;
      return {
        type: 'Feature' as const,
        id: index + 1, // Numeric ID for MapLibre feature identification
        properties: {
          jurisdictionId: j.jurisdictionId,
          name: j.name,
          hasChildren: j.hasChildren ? 1 : 0,
          isActive: isActiveJurisdiction(j.name) ? 1 : 0,
          isInHarlemChain: isInHarlemChain(j.name) ? 1 : 0,
        },
        geometry,
      };
    })
    .filter(Boolean);

  return { type: 'FeatureCollection' as const, features };
};

// Add numeric IDs to US states GeoJSON
const addFeatureIds = (geojson: any) => {
  if (!geojson?.features) return geojson;
  return {
    ...geojson,
    features: geojson.features.map((f: any, i: number) => ({
      ...f,
      id: i + 1,
    })),
  };
};

// Base64 decode for JWT
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

const STATE_NAMES = [
  'New York', 'California', 'Texas', 'Florida', 'Illinois',
  'Washington', 'Arizona', 'Colorado', 'Ohio', 'Georgia',
];

// =============================================================================
// COMPONENT
// =============================================================================
const FindScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { playMedia } = usePlayer();
  const navigation = useNavigation<any>();

  // Camera ref on the Camera COMPONENT for programmatic flyTo/fitBounds
  const cameraRef = useRef<MapLibreGL.Camera>(null);

  const [mapReady, setMapReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [genre, setGenre] = useState('rap-hiphop');
  const [usGeoData, setUsGeoData] = useState<any>(null);
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Navigation stack (matches web exactly)
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

  // Jurisdiction polygon GeoJSON for map layer
  const [jurisdictionGeoJSON, setJurisdictionGeoJSON] = useState<any>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [showGenreDropdown, setShowGenreDropdown] = useState(false);

  // Derived state
  const isAtUSLevel = () => navigationStack.length === 1;

  const displayTerritory =
    hoveredState ||
    selectedJurisdiction?.name ||
    (navigationStack.length > 1
      ? navigationStack[navigationStack.length - 1].name
      : 'Select a State');

  const showComingSoon =
    selectedJurisdiction && !isInHarlemChain(selectedJurisdiction.name);

  // ════════════════════════════════════════════
  // INITIALIZATION
  // ════════════════════════════════════════════

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
    fetch(US_STATES_GEOJSON_URL)
      .then(res => res.json())
      .then(data => setUsGeoData(addFeatureIds(data)))
      .catch(err => console.error('Failed to load US states:', err));
  }, []);

  // Update GeoJSON when jurisdictions change
  useEffect(() => {
    if (currentJurisdictions.length > 0) {
      const geoJSON = jurisdictionsToGeoJSON(currentJurisdictions);
      setJurisdictionGeoJSON(geoJSON.features.length > 0 ? geoJSON : null);
    } else {
      setJurisdictionGeoJSON(null);
    }
  }, [currentJurisdictions]);

  // ════════════════════════════════════════════
  // CAMERA HELPERS
  // Using Camera component ref — cameraRef.current.fitBounds / .setCamera
  // Matches web's map.flyToBounds / map.flyTo
  // ════════════════════════════════════════════

  const flyToCenter = (center: [number, number], zoom: number) => {
    cameraRef.current?.setCamera({
      centerCoordinate: center,
      zoomLevel: zoom,
      animationDuration: 800,
      animationMode: 'flyTo',
    });
  };

  const flyToBounds = (
    sw: [number, number],
    ne: [number, number],
    padding: number = 50
  ) => {
    // Camera.fitBounds(ne, sw, padding, duration)
    cameraRef.current?.fitBounds(ne, sw, [padding, padding], 800);
  };

  // ════════════════════════════════════════════
  // API CALLS (matches web FindPage exactly)
  // ════════════════════════════════════════════

  const fetchChildren = async (jurisdictionId: string): Promise<Jurisdiction[]> => {
    try {
      const response = await axiosInstance.get(
        `/v1/jurisdictions/${jurisdictionId}/children/detailed`
      );
      return response.data || [];
    } catch (err) {
      console.error('Failed to fetch children/detailed, trying fallback:', err);
      try {
        const fallbackResponse = await axiosInstance.get(
          `/v1/jurisdictions/${jurisdictionId}/children`
        );
        return (fallbackResponse.data || []).map((j: any) => ({
          ...j,
          hasChildren: true,
          isActive: isActiveJurisdiction(j.name),
        }));
      } catch (fallbackErr) {
        console.error('Fallback fetch also failed:', fallbackErr);
        return [];
      }
    }
  };

  const fetchJurisdictionByName = async (name: string): Promise<any[] | null> => {
    try {
      const response = await axiosInstance.get(
        `/v1/jurisdictions/byName/${encodeURIComponent(name)}`
      );
      return response.data;
    } catch (err) {
      console.error('Failed to fetch jurisdiction by name:', err);
      return null;
    }
  };

  const fetchTopResults = async (jurisdictionName: string) => {
    setLoading(true);
    setHasSelectedJurisdiction(true);
    fadeAnim.setValue(0);

    try {
      // If not active but in Harlem chain → resolve to Harlem (matches web)
      let resolvedName = jurisdictionName;
      if (!isActiveJurisdiction(jurisdictionName) && isInHarlemChain(jurisdictionName)) {
        resolvedName = 'Harlem';
      }

      const jurResponse = await axiosInstance.get(
        `/v1/jurisdictions/byName/${encodeURIComponent(resolvedName)}`
      );
      const jurId = jurResponse.data?.[0]?.jurisdictionId;
      if (!jurId) throw new Error('Jurisdiction not found');

      const topsResponse = await axiosInstance.get(`/v1/jurisdictions/${jurId}/tops`);
      const rawData = topsResponse.data;

      const artists: TopResult[] = (rawData.topArtists || []).slice(0, 3).map((artist: any, i: number) => ({
        id: artist.userId || String(i),
        name: artist.username,
        votes: artist.score || 0,
        artwork: getMediaUrl(artist.photoUrl) || `https://picsum.photos/200?random=a${i}`,
      }));

      const songs: TopResult[] = (rawData.topSongs || []).slice(0, 3).map((song: any, i: number) => ({
        id: song.songId || String(i),
        title: song.title,
        artist: song.artist?.username || 'Unknown',
        votes: song.score || 0,
        fileUrl: getMediaUrl(song.fileUrl) || undefined,
        artwork: getMediaUrl(song.artworkUrl) || `https://picsum.photos/200?random=s${i}`,
      }));

      setTopArtists(artists);
      setTopSongs(songs);
    } catch (err) {
      console.error('Fetch tops error:', err);
      setTopArtists([]);
      setTopSongs([]);
    } finally {
      setLoading(false);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }
  };

  // ════════════════════════════════════════════
  // EVENT HANDLERS (matches web flow)
  // ════════════════════════════════════════════

  const handleStatePress = async (stateName: string) => {
    console.log('[FindScreen] handleStatePress:', stateName);

    if (stateName !== 'New York') {
      Alert.alert('Coming Soon', `${stateName} coming to Unis soon!`);
      return;
    }

    setHoveredState(stateName);

    flyToBounds([-80.0, 40.5], [-71.8, 45.1], 50);

    const nyData = await fetchJurisdictionByName('New York');
    const jurisdiction = nyData?.[0];
    if (!jurisdiction) {
      Alert.alert('Error', 'Failed to load New York data');
      return;
    }

    const children = await fetchChildren(jurisdiction.jurisdictionId);

    setNavigationStack([
      { name: 'United States', jurisdictionId: null, tier: 0 },
      { name: 'New York', jurisdictionId: jurisdiction.jurisdictionId, tier: 2 },
    ]);
    setCurrentJurisdictions(children);
    setSelectedJurisdiction(jurisdiction);

    // Fly to NY bounds (matches web: flyToBounds with padding [50, 50])
    const bounds = getBoundsFromPolygon(jurisdiction.polygon);
    if (bounds) {
      flyToBounds(bounds[0], bounds[1], 50);
    } else {
      flyToCenter([-75.5, 42.5], 6);
    }

    fetchTopResults('New York');
  };

  const handleJurisdictionClick = async (jurisdiction: Jurisdiction) => {
    console.log('[FindScreen] handleJurisdictionClick:', jurisdiction.name);

    setSelectedJurisdiction(jurisdiction);
    setHoveredState(jurisdiction.name);

    if (jurisdiction.hasChildren) {
      const children = await fetchChildren(jurisdiction.jurisdictionId);

      if (children.length > 0) {
        setNavigationStack(prev => [
          ...prev,
          {
            name: jurisdiction.name,
            jurisdictionId: jurisdiction.jurisdictionId,
            tier: prev[prev.length - 1].tier + 1,
          },
        ]);
        setCurrentJurisdictions(children);

        // Fly to jurisdiction bounds (matches web: padding [30, 30])
        const bounds = getBoundsFromPolygon(jurisdiction.polygon);
        if (bounds) {
          flyToBounds(bounds[0], bounds[1], 30);
        }
      }
    }

    fetchTopResults(jurisdiction.name);
  };

  const handleBack = async () => {
    if (navigationStack.length <= 1) return;

    const newStack = [...navigationStack];
    newStack.pop();
    const previousLevel = newStack[newStack.length - 1];

    setNavigationStack(newStack);

    if (previousLevel.tier === 0) {
      // Back to US
      setCurrentJurisdictions([]);
      setSelectedJurisdiction(null);
      setHoveredState(null);
      setHasSelectedJurisdiction(false);
      setTopArtists([]);
      setTopSongs([]);
      flyToCenter(US_CENTER, US_ZOOM);
    } else {
      // Back to parent jurisdiction
      const children = await fetchChildren(previousLevel.jurisdictionId!);
      setCurrentJurisdictions(children);

      try {
        const response = await axiosInstance.get(
          `/v1/jurisdictions/${previousLevel.jurisdictionId}`
        );
        setSelectedJurisdiction(response.data);
        const bounds = getBoundsFromPolygon(response.data.polygon);
        if (bounds) {
          flyToBounds(bounds[0], bounds[1], 50);
        }
      } catch (err) {
        console.error('Failed to fetch parent jurisdiction:', err);
      }

      fetchTopResults(previousLevel.name);
    }
  };

  const handleRandom = () => {
    setIsAnimating(true);
    let count = 0;

    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * STATE_NAMES.length);
      setHoveredState(STATE_NAMES[randomIndex]);
      count++;

      if (count >= 10) {
        clearInterval(interval);
        setIsAnimating(false);
        const finalState = STATE_NAMES[Math.floor(Math.random() * STATE_NAMES.length)];
        setHoveredState(null);
        handleStatePress(finalState);
      }
    }, 500);
  };

  // ════════════════════════════════════════════
  // PLAYBACK (matches web handlePlay exactly)
  // ════════════════════════════════════════════

  const handlePlay = async (item: TopResult) => {
    let trackingId: string | null = null;

    if (item.fileUrl) {
      playMedia(
        {
          id: item.id,
          songId: item.id,
          title: item.title || item.name || 'Unknown',
          artist: item.artist || item.name || 'Unknown',
          url: item.fileUrl,
          artwork: item.artwork,
        } as any,
        []
      );
      trackingId = item.id;
    } else if (item.id && item.name) {
      try {
        const response = await axiosInstance.get(`/v1/users/${item.id}/default-song`);
        const defaultSong = response.data;

        if (defaultSong?.fileUrl) {
          playMedia(
            {
              id: defaultSong.songId || item.id,
              songId: defaultSong.songId || item.id,
              title: defaultSong.title,
              artist: item.name,
              url: getMediaUrl(defaultSong.fileUrl)!,
              artwork: getMediaUrl(defaultSong.artworkUrl) || item.artwork,
            } as any,
            []
          );
          trackingId = defaultSong.songId;
        } else {
          Alert.alert('No Song', 'This artist has no default song yet.');
        }
      } catch (err) {
        console.error('Default song fetch failed:', err);
        Alert.alert('Error', 'Could not load artist song.');
        return;
      }
    }

    if (trackingId && userId) {
      try {
        await axiosInstance.post(`/v1/media/song/${trackingId}/play?userId=${userId}`);
      } catch (err) {
        console.error('Failed to track play:', err);
      }
    }
  };

  const handleView = (item: TopResult, type: 'artist' | 'song') => {
    if (type === 'artist') {
      navigation.navigate('Artist', { artistId: item.id });
    } else {
      navigation.navigate('Song', { songId: item.id, type: 'song' });
    }
  };

  // ════════════════════════════════════════════
  // MAP PRESS HANDLERS
  // These use MapLibre's internal hit testing via ShapeSource.onPress + hitbox
  // They work inside ScrollView without needing responder overrides
  // ════════════════════════════════════════════

  const handleMapPress = (event: any) => {
    console.log('[FindScreen] US states onPress fired');
    const features = event?.features;
    if (features && features.length > 0) {
      const stateName = features[0]?.properties?.name;
      console.log('[FindScreen] State tapped:', stateName);
      if (stateName) handleStatePress(stateName);
    }
  };

  const handleJurisdictionMapPress = (event: any) => {
    console.log('[FindScreen] Jurisdiction onPress fired');
    const features = event?.features;
    if (features && features.length > 0) {
      const jId = features[0]?.properties?.jurisdictionId;
      console.log('[FindScreen] Jurisdiction tapped:', jId);
      const jurisdiction = currentJurisdictions.find(j => j.jurisdictionId === jId);
      if (jurisdiction) handleJurisdictionClick(jurisdiction);
    }
  };

  // ════════════════════════════════════════════
  // RENDER: RESULT CARD (ambient mode)
  // ════════════════════════════════════════════

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
        <Image source={{ uri: item.artwork }} style={styles.ambientBg} blurRadius={40} />

        <LinearGradient
          colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.1)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.glassContent}
        >
          <Text style={styles.rank}>#{index + 1}</Text>
          <Image source={{ uri: item.artwork }} style={styles.itemArtwork} />
          <View style={styles.itemInfo}>
            <Text style={styles.itemTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.itemSubtitle} numberOfLines={1}>{subtitle}</Text>
          </View>
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

  // ════════════════════════════════════════════
  // RENDER: JURISDICTION PILL
  // ════════════════════════════════════════════

  const renderJurisdictionPill = (jurisdiction: Jurisdiction) => {
    const isSelected = selectedJurisdiction?.jurisdictionId === jurisdiction.jurisdictionId;
    const inChain = isInHarlemChain(jurisdiction.name);
    const isActive = isActiveJurisdiction(jurisdiction.name);

    return (
      <TouchableOpacity
        key={jurisdiction.jurisdictionId}
        style={[
          styles.jurisdictionPill,
          isSelected && styles.jurisdictionPillSelected,
          inChain && !isSelected && styles.jurisdictionPillInChain,
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

  // ════════════════════════════════════════════
  // MAIN RENDER — full page layout:
  // Filters → Map → Jurisdiction Pills → Results
  // Everything inside a single ScrollView
  // ════════════════════════════════════════════

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
        nestedScrollEnabled={true}
      >
        {/* ── FILTERS ── */}
        <View style={[styles.filtersContainer, { zIndex: 100 }]}>
          <View style={styles.filterWrapper}>
            <TouchableOpacity
              style={[styles.filterButton, showGenreDropdown && styles.filterButtonActive]}
              onPress={() => setShowGenreDropdown(!showGenreDropdown)}
            >
              <Text style={styles.filterButtonText}>
                {GENRES.find(g => g.value === genre)?.label || 'Rap'}
              </Text>
            </TouchableOpacity>

            {showGenreDropdown && (
              <View style={styles.filterDropdown}>
                {GENRES.map(g => (
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

        {/* ── MAP SECTION ── */}
        <View style={styles.mapSection}>
          <Text style={styles.territoryName}>{displayTerritory}</Text>

          {!isAtUSLevel() && (
            <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
              <ChevronLeft size={16} color={COLORS.unisBlue} />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          )}

          <View style={styles.mapContainer}>
            <MapLibreGL.MapView
              style={styles.map}
              styleJSON={JSON.stringify(CARTO_DARK_STYLE)}
              logoEnabled={false}
              attributionEnabled={false}
              compassEnabled={false}
              scrollEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
              zoomEnabled={false}
              onDidFinishLoadingMap={() => {
                console.log('[FindScreen] Map loaded');
                setMapReady(true);
              }}
            >
              <MapLibreGL.Camera
                ref={cameraRef}
                defaultSettings={{
                  centerCoordinate: US_CENTER,
                  zoomLevel: US_ZOOM,
                }}
              />

              {/* US States — white tiles on dark basemap */}
              {usGeoData && isAtUSLevel() && (
                <MapLibreGL.ShapeSource
                  id="us-states"
                  shape={usGeoData}
                  onPress={handleMapPress}
                  hitbox={{ width: 20, height: 20 }}
                >
                  <MapLibreGL.FillLayer
                    id="states-fill"
                    style={{
                      fillColor: '#EAEAEC',
                      fillOpacity: 1,
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

              {/* Jurisdiction polygons — color-coded by activity */}
              {!isAtUSLevel() && jurisdictionGeoJSON && (
                <MapLibreGL.ShapeSource
                  id="jurisdictions"
                  shape={jurisdictionGeoJSON}
                  onPress={handleJurisdictionMapPress}
                  hitbox={{ width: 20, height: 20 }}
                >
                  <MapLibreGL.FillLayer
                    id="jurisdictions-fill"
                    style={{
                      fillColor: [
                        'case',
                        ['==', ['get', 'isActive'], 1],
                        '#2E5AAC',
                        ['==', ['get', 'isInHarlemChain'], 1],
                          '#1a3d8f',
                          '#163387',                  

                      ],
                      fillOpacity: 0.7,
                    }}
                  />
                  <MapLibreGL.LineLayer
                    id="jurisdictions-border"
                    style={{
                      lineColor: [
                        'case',
                        ['any',
                          ['==', ['get', 'isActive'], 1],
                          ['==', ['get', 'isInHarlemChain'], 1],
                        ],
                        '#FFFFFF',
                        '#999',
                      ],
                      lineWidth: 1,
                    }}
                  />
                  <MapLibreGL.SymbolLayer
                    id="jurisdictions-labels"
                    style={{
                      textField: ['get', 'name'],
                      textSize: 12,
                      textColor: '#FFFFFF',
                      textHaloColor: 'rgba(0,0,0,0.7)',
                      textHaloWidth: 1,
                      textAllowOverlap: true,
                    }}
                  />
                </MapLibreGL.ShapeSource>
              )}
            </MapLibreGL.MapView>

            {/* Loading overlay */}
            {!mapReady && (
              <View style={styles.mapLoadingOverlay}>
                <ActivityIndicator size="large" color={COLORS.unisBlue} />
                <Text style={styles.mapLoadingText}>Loading map...</Text>
              </View>
            )}
          </View>

          {/* Jurisdiction pills below map */}
          {!isAtUSLevel() && currentJurisdictions.length > 0 && (
            <View style={styles.jurisdictionList}>
              <Text style={styles.jurisdictionListTitle}>Tap a region to explore:</Text>
              <View style={styles.jurisdictionPills}>
                {currentJurisdictions.map(renderJurisdictionPill)}
              </View>
            </View>
          )}
        </View>

        {/* ── RESULTS SECTION ── */}
        {hasSelectedJurisdiction && (
          <View style={styles.resultsSection}>
            {showComingSoon ? (
              <View style={styles.comingSoonContainer}>
                <Text style={styles.comingSoonTitle}>{selectedJurisdiction?.name}</Text>
                <Text style={styles.comingSoonText}>
                  Coming soon to Unis! Join the waitlist to be notified when this area launches.
                </Text>
              </View>
            ) : loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.unisBlue} />
                <Text style={styles.loadingText}>Loading top results...</Text>
              </View>
            ) : (
              <>
                {/* Top Songs */}
                <View style={styles.resultsColumn}>
                  <TouchableOpacity
                    onPress={() => {
                      const name = selectedJurisdiction?.name || 'Harlem';
                      navigation.navigate('Jurisdiction', { jurisdictionName: name });
                    }}
                  >
                    <Text style={styles.resultsTitle}>Top Songs in {displayTerritory}</Text>
                  </TouchableOpacity>
                  <View style={styles.resultsList}>
                    {topSongs.length > 0 ? (
                      topSongs.map((song, i) => renderResultCard(song, i, 'song'))
                    ) : (
                      <Text style={styles.noResultsText}>No songs yet</Text>
                    )}
                  </View>
                </View>

                {/* Top Artists */}
                <View style={styles.resultsColumn}>
                  <TouchableOpacity
                    onPress={() => {
                      const name = selectedJurisdiction?.name || 'Harlem';
                      navigation.navigate('Jurisdiction', { jurisdictionName: name });
                    }}
                  >
                    <Text style={styles.resultsTitle}>Top Artists in {displayTerritory}</Text>
                  </TouchableOpacity>
                  <View style={styles.resultsList}>
                    {topArtists.length > 0 ? (
                      topArtists.map((artist, i) => renderResultCard(artist, i, 'artist'))
                    ) : (
                      <Text style={styles.noResultsText}>No artists yet</Text>
                    )}
                  </View>
                </View>
              </>
            )}
          </View>
        )}

        {/* Bottom padding for MiniPlayer */}
        <View style={{ height: 120 }} />
      </ScrollView>
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
  scrollContent: {
    paddingTop: 20,
    paddingHorizontal: 10,
  },

  // Filters
  filtersContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 20,
  },
  filterWrapper: { position: 'relative' },
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
  filterButtonText: { color: COLORS.textSilver, fontSize: 14, textAlign: 'center' },
  filterDropdown: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    backgroundColor: COLORS.subtleBlack,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderSilver,
    overflow: 'hidden',
    zIndex: 1000,
    elevation: 10,
  },
  filterOption: { paddingVertical: 10, paddingHorizontal: 15 },
  filterOptionActive: { backgroundColor: 'rgba(22, 51, 135, 0.2)' },
  filterOptionText: { color: COLORS.textSilver, fontSize: 14 },
  filterOptionTextActive: { color: COLORS.unisBlue },
  randomButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: COLORS.bgBlack,
    borderWidth: 1,
    borderColor: COLORS.borderSilver,
    borderRadius: 8,
    minWidth: 100,
  },
  randomButtonDisabled: { opacity: 0.5 },
  randomButtonText: { color: COLORS.textSilver, fontSize: 14, textAlign: 'center' },

  // Map section
  mapSection: {
    alignSelf: 'center',
    width: '100%',
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
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: COLORS.unisBlue,
    borderRadius: 8,
    marginBottom: 10,
  },
  backBtnText: { color: COLORS.unisBlue, fontSize: 12, marginLeft: 4 },
  mapContainer: {
    width: '100%',
    height: IS_MOBILE ? 280 : 380,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: COLORS.textSilver,
    backgroundColor: COLORS.subtleBlack,
  },
  map: { flex: 1 },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.subtleBlack,
  },
  mapLoadingText: { color: COLORS.textGray, marginTop: 10, fontSize: 14 },

  // Jurisdiction pills
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
  jurisdictionPillText: { color: COLORS.textSilver, fontSize: 13 },
  jurisdictionPillTextSelected: { color: COLORS.accentWhite },
  activeBadge: { color: '#4CAF50', fontSize: 10 },

  // Results
  resultsSection: {
    width: '100%',
    maxWidth: 1000,
    alignSelf: 'center',
    marginTop: 20,
    gap: 20,
    paddingHorizontal: 6,
  },
  resultsColumn: { width: '100%' },
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
  resultsList: { gap: 12 },
  loadingContainer: { alignItems: 'center', paddingVertical: 40 },
  loadingText: { color: COLORS.textGray, marginTop: 10 },
  noResultsText: { color: COLORS.textGray, textAlign: 'center', paddingVertical: 20 },

  // Coming soon
  comingSoonContainer: {
    width: '100%',
    alignItems: 'center',
    padding: 20,
    marginBottom: 10,
    backgroundColor: 'rgba(22, 51, 135, 0.1)',
    borderRadius: 8,
  },
  comingSoonTitle: { color: COLORS.unisBlue, fontSize: 24, marginBottom: 10 },
  comingSoonText: { color: '#888', textAlign: 'center' },

  // Result card
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
    top: -50,
    left: -50,
    width: SCREEN_WIDTH * 2,
    height: 300,
    opacity: 0.3,
  },
  glassContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: IS_MOBILE ? 10 : 15,
    gap: IS_MOBILE ? 10 : 15,
  },
  rank: {
    fontSize: 20,
    color: 'rgba(255, 255, 255, 0.4)',
    minWidth: 30,
  },
  itemArtwork: {
    width: IS_MOBILE ? 45 : 60,
    height: IS_MOBILE ? 45 : 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  itemInfo: { flex: 1, minWidth: 0 },
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
  playButtonText: { color: COLORS.textSilver, fontSize: IS_MOBILE ? 11 : 12, fontWeight: '600' },
  viewButton: {
    paddingVertical: IS_MOBILE ? 6 : 8,
    paddingHorizontal: IS_MOBILE ? 12 : 18,
    backgroundColor: COLORS.bgBlack,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 50,
  },
  viewButtonText: { color: COLORS.textSilver, fontSize: IS_MOBILE ? 11 : 12, fontWeight: '600' },
});

export default FindScreen;