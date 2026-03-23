// src/screens/FeedScreen.tsx
// Full port of web Feed.jsx with hero banner, jurisdiction selector,
// all 5 sections, and matching design language.
// Header is handled by LayoutWrapper in AppNavigator.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  RefreshControl,
  ImageBackground,
  Animated,
  Easing,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';
import MediaCard, { MediaItem } from '../components/MediaCard';
import ArtistCard, { ArtistItem } from '../components/ArtistCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 480;

// ─── Active jurisdictions (matches web + backend) ───
const ACTIVE_JURISDICTIONS = [
  { id: '1cf6ceb1-aae6-4113-98c0-d9fe8ad8b5e3', name: 'Harlem' },
  { id: '52740de0-e4e9-4c9e-b68e-1e170f6788c4', name: 'Uptown Harlem' },
  { id: '4b09eaa2-03bc-4778-b7c2-db8b42c9e732', name: 'Downtown Harlem' },
];

// ─────────────────────────────────────────────
// ANIMATED SECTION — slides in from left like web
// ─────────────────────────────────────────────
const AnimatedSection: React.FC<{
  children: React.ReactNode;
  delay: number;
}> = ({ children, delay }) => {
  const slideX = useRef(new Animated.Value(-50)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      slideX.setValue(-50);
      fadeIn.setValue(0);

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(slideX, {
            toValue: 0,
            duration: 600,
            delay,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(fadeIn, {
            toValue: 1,
            duration: 600,
            delay,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
      }, 50);

      return () => clearTimeout(timer);
    }, [])
  );

  return (
    <Animated.View
      style={{
        opacity: fadeIn,
        transform: [{ translateX: slideX }],
      }}
    >
      {children}
    </Animated.View>
  );
};

// ─────────────────────────────────────────────
// HERO PARTICLES — floating circles like web
// ─────────────────────────────────────────────
const HeroParticles: React.FC = () => {
  const float1 = useRef(new Animated.Value(0)).current;
  const float2 = useRef(new Animated.Value(0)).current;
  const float3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createFloat = (anim: Animated.Value, duration: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: -12,
            duration: duration / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: duration / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();
    };
    createFloat(float1, 6000);
    createFloat(float2, 8000);
    createFloat(float3, 5000);
  }, []);

  return (
    <View style={particleStyles.container}>
      <Animated.View
        style={[
          particleStyles.particle,
          particleStyles.p1,
          { transform: [{ translateY: float1 }] },
        ]}
      />
      <Animated.View
        style={[
          particleStyles.particle,
          particleStyles.p2,
          { transform: [{ translateY: float2 }] },
        ]}
      />
      <Animated.View
        style={[
          particleStyles.particle,
          particleStyles.p3,
          { transform: [{ translateY: float3 }] },
        ]}
      />
    </View>
  );
};

const particleStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 30,
    top: 0,
    bottom: 0,
    width: 150,
  },
  particle: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.4,
  },
  p1: {
    width: 60,
    height: 60,
    backgroundColor: 'rgba(78, 168, 245, 0.25)',
    top: 20,
    right: 30,
  },
  p2: {
    width: 90,
    height: 90,
    backgroundColor: 'rgba(124, 94, 245, 0.15)',
    top: 40,
    right: 70,
  },
  p3: {
    width: 45,
    height: 45,
    backgroundColor: 'rgba(78, 168, 245, 0.2)',
    top: 70,
    right: 5,
  },
});

// ─────────────────────────────────────────────
// GHOST JURISDICTION SELECTOR (inline in title)
// ─────────────────────────────────────────────
const JurisdictionSelect: React.FC<{
  selectedId: string;
  onChange: (id: string) => void;
}> = ({ selectedId, onChange }) => {
  const selectedName = ACTIVE_JURISDICTIONS.find(j => j.id === selectedId)?.name || 'Harlem';
  const [showPicker, setShowPicker] = useState(false);

  if (Platform.OS === 'ios') {
    return (
      <>
        <TouchableOpacity
          style={ghostStyles.wrapper}
          onPress={() => setShowPicker(!showPicker)}
          activeOpacity={0.7}
        >
          <Text style={ghostStyles.label}>{selectedName}</Text>
          <Text style={ghostStyles.arrow}>▾</Text>
        </TouchableOpacity>
        {showPicker && (
          <View style={ghostStyles.pickerContainer}>
            <Picker
              selectedValue={selectedId}
              onValueChange={(val) => {
                onChange(val);
                setShowPicker(false);
              }}
              style={ghostStyles.picker}
              itemStyle={ghostStyles.pickerItem}
            >
              {ACTIVE_JURISDICTIONS.map((j) => (
                <Picker.Item key={j.id} label={j.name} value={j.id} />
              ))}
            </Picker>
          </View>
        )}
      </>
    );
  }

  // Android — native picker inline
  return (
    <View style={ghostStyles.androidWrapper}>
      <Picker
        selectedValue={selectedId}
        onValueChange={onChange}
        style={ghostStyles.androidPicker}
        dropdownIconColor="#4ea8f5"
        mode="dropdown"
      >
        {ACTIVE_JURISDICTIONS.map((j) => (
          <Picker.Item
            key={j.id}
            label={j.name}
            value={j.id}
            style={ghostStyles.androidItem}
          />
        ))}
      </Picker>
    </View>
  );
};

const ghostStyles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  label: {
    color: '#FFFFFF',
    fontSize: IS_MOBILE ? 18 : 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  arrow: {
    color: '#4ea8f5',
    fontSize: 12,
    marginLeft: 4,
    opacity: 0.5,
  },
  pickerContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    marginTop: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  picker: {
    color: '#fff',
    backgroundColor: '#1a1a1a',
  },
  pickerItem: {
    color: '#fff',
    fontSize: 16,
  },
  androidWrapper: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 6,
    overflow: 'hidden',
    minWidth: 140,
    height: 36,
    justifyContent: 'center',
  },
  androidPicker: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: -8,
    marginBottom: -8,
  },
  androidItem: {
    backgroundColor: '#1a1a1a',
    color: '#FFFFFF',
    fontSize: 14,
  },
});

// ─────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────
const FeedFooter: React.FC = () => (
  <View style={footerStyles.container}>
    <View style={footerStyles.divider} />
    <Text style={footerStyles.copyright}>
      © {new Date().getFullYear()} Unis Music. All rights reserved.
    </Text>
  </View>
);

const footerStyles = StyleSheet.create({
  container: { alignItems: 'center', paddingTop: 20, paddingBottom: 10, marginTop: 10 },
  divider: { width: '40%', height: 1, backgroundColor: 'rgba(192,192,192,0.15)', marginBottom: 16 },
  copyright: { color: 'rgba(192,192,192,0.25)', fontSize: 10, letterSpacing: 0.5 },
});

// ─────────────────────────────────────────────
// DUMMY DATA
// ─────────────────────────────────────────────
const getDummyTrending = (): MediaItem[] => [
  { id: 'd1', title: 'Paranoid', artistData: { userId: '1', username: 'Tony Fadd' }, artworkUrl: 'https://picsum.photos/200?random=1', type: 'song', duration: 180000, explicit: false, createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
  { id: 'd2', title: 'Waited All Night', artistData: { userId: '2', username: 'SD Boomin' }, artworkUrl: 'https://picsum.photos/200?random=2', type: 'song', duration: 210000, explicit: true, createdAt: new Date(Date.now() - 5 * 86400000).toISOString() },
  { id: 'd3', title: 'Golden Hour', artistData: { userId: '3', username: 'Artist Three' }, artworkUrl: 'https://picsum.photos/200?random=3', type: 'song', duration: 195000, explicit: false, createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: 'd4', title: 'Midnight Dreams', artistData: { userId: '4', username: 'Artist Four' }, artworkUrl: 'https://picsum.photos/200?random=4', type: 'song', duration: 240000, explicit: true, createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
  { id: 'd5', title: 'Street Lights', artistData: { userId: '5', username: 'Artist Five' }, artworkUrl: 'https://picsum.photos/200?random=5', type: 'song', duration: 175000, explicit: false, createdAt: new Date(Date.now() - 7 * 86400000).toISOString() },
];

const getDummyNew = (): MediaItem[] => [
  { id: 'd6', title: 'The Outside', artistData: { userId: '6', username: 'Artist Six' }, artworkUrl: 'https://picsum.photos/200?random=6', type: 'song', duration: 155000, explicit: false, createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: 'd7', title: 'Original Man', artistData: { userId: '7', username: 'Artist Seven' }, artworkUrl: 'https://picsum.photos/200?random=7', type: 'song', duration: 205000, explicit: true, createdAt: new Date(Date.now() - 43200000).toISOString() },
  { id: 'd8', title: 'Flavorfall', artistData: { userId: '8', username: 'Artist Eight' }, artworkUrl: 'https://picsum.photos/200?random=8', type: 'song', duration: 175000, explicit: false, createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
];

const getDummyAwards = () => [
  { id: 'a1', name: 'Best Rap Song', winner: { id: 'w1', username: 'Tony Fadd' } },
  { id: 'a2', name: 'Top Video', winner: { id: 'w2', username: 'SD Boomin' } },
  { id: 'a3', name: 'Rising Artist', winner: { id: 'w3', username: 'Artist Three' } },
];

const getDummyArtists = (): ArtistItem[] => [
  { userId: 'art1', username: 'Tony Fadd', photoUrl: 'https://picsum.photos/400/300?random=a1', score: 100 },
  { userId: 'art2', username: 'SD Boomin', photoUrl: 'https://picsum.photos/400/300?random=a2', score: 80 },
  { userId: 'art3', username: 'Artist Three', photoUrl: 'https://picsum.photos/400/300?random=a3', score: 60 },
];

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
const FeedScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { playMedia } = usePlayer();
  const navigation = useNavigation<any>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  // Jurisdiction selector
  const userJurisdictionId = user?.jurisdiction?.jurisdictionId || '1cf6ceb1-aae6-4113-98c0-d9fe8ad8b5e3';
  const [selectedJurisdictionId, setSelectedJurisdictionId] = useState(userJurisdictionId);
  const selectedJurisdictionName = ACTIVE_JURISDICTIONS.find(j => j.id === selectedJurisdictionId)?.name || 'Harlem';

  useEffect(() => {
    if (userJurisdictionId) setSelectedJurisdictionId(userJurisdictionId);
  }, [userJurisdictionId]);

  // Data
  const [trendingToday, setTrendingToday] = useState<MediaItem[]>([]);
  const [topRated, setTopRated] = useState<MediaItem[]>([]);
  const [newMedia, setNewMedia] = useState<MediaItem[]>([]);
  const [awards, setAwards] = useState<any[]>([]);
  const [popularArtists, setPopularArtists] = useState<ArtistItem[]>([]);

  // ─── Normalize media (same as web) ───
  const normalizeMedia = useCallback((items: any[]): MediaItem[] => {
    return (items || []).map(item => ({
      id: item.songId || item.videoId,
      title: item.title,
      artist: item.artist?.username || 'Unknown',
      artistData: item.artist || { userId: 'unknown', username: 'Unknown' },
      artworkUrl: getMediaUrl(item.artworkUrl),
      mediaUrl: getMediaUrl(item.fileUrl),
      url: getMediaUrl(item.fileUrl),
      artwork: getMediaUrl(item.artworkUrl),
      type: item.songId ? 'song' : 'video',
      score: item.score || 0,
      artistId: item.artist?.userId || 'unknown',
      duration: item.duration || null,
      createdAt: item.createdAt || null,
      explicit: item.explicit || false,
      playsToday: item.playsToday || 0,
      playCount: item.playCount || 0,
    }));
  }, []);

  // ─── Fetch profile ───
  const fetchProfile = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) throw new Error('Not authenticated');
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUserId(payload.userId);
    } catch (err) {
      console.error('Profile load error:', err);
      setError('Profile unavailable—using default feed.');
    }
  };

  // ─── Fetch all feed data (same 6 calls as web) ───
  const fetchMediaData = async () => {
    if (!userId || !selectedJurisdictionId) return;

    try {
      const jId = selectedJurisdictionId;

      const [trendingTodayRes, topRatedRes, newRes, songAwardsRes, artistAwardsRes, popularRes] = await Promise.all([
        axiosInstance.get(`/v1/media/trending/today?jurisdictionId=${jId}&limit=10`),
        axiosInstance.get(`/v1/media/trending?jurisdictionId=${jId}&limit=5`),
        axiosInstance.get(`/v1/media/new?jurisdictionId=${jId}&limit=5`),
        axiosInstance.get(`/v1/awards/leaderboards?type=song&jurisdictionId=${jId}`),
        axiosInstance.get(`/v1/awards/leaderboards?type=artist&jurisdictionId=${jId}`),
        axiosInstance.get(`/v1/users/artist/top?jurisdictionId=${jId}&limit=5`),
      ]);

      setTrendingToday(normalizeMedia(trendingTodayRes.data || []));
      setTopRated(normalizeMedia(topRatedRes.data || []));
      setNewMedia(normalizeMedia(newRes.data || []));

      const combinedAwards = [
        ...(songAwardsRes.data || []),
        ...(artistAwardsRes.data || []),
      ].slice(0, 5);
      setAwards(combinedAwards);

      // Normalize artists with photoUrl
      const normalizedArtists = (popularRes.data || []).map((artist: any) => ({
        ...artist,
        photoUrl: getMediaUrl(
          artist.photoUrl || artist.imageUrl || artist.profilePhotoUrl || artist.avatarUrl || artist.photo
        ) || undefined,
      }));
      setPopularArtists(normalizedArtists);

      // Fallback: extract artists from media if API returns none
      if (normalizedArtists.length === 0) {
        const artistMap = new Map<string, ArtistItem>();
        const allMedia = [...(trendingTodayRes.data || []), ...(newRes.data || [])];
        allMedia.forEach((media: any) => {
          if (media.artist && !artistMap.has(media.artist.userId)) {
            artistMap.set(media.artist.userId, {
              userId: media.artist.userId,
              username: media.artist.username,
              photoUrl: getMediaUrl(media.artist.photoUrl) || undefined,
              score: media.artist.score || 0,
            });
          }
        });
        setPopularArtists(
          Array.from(artistMap.values()).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5)
        );
      }

      setError('');
    } catch (err) {
      console.error('Media load error:', err);
      setError('Feed unavailable—showing demo content.');
      setTrendingToday(getDummyTrending());
      setNewMedia(getDummyNew());
    }
  };

  // ─── Lifecycle ───
  useEffect(() => {
    fetchProfile().finally(() => {});
  }, []);

  useEffect(() => {
    if (userId && selectedJurisdictionId) {
      setLoading(true);
      fetchMediaData().finally(() => setLoading(false));
    }
  }, [userId, selectedJurisdictionId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMediaData();
    setRefreshing(false);
  }, [userId, selectedJurisdictionId]);

  // ─── Navigation ───
  const handleSongNav = (mediaId: string, type: string = 'song') => {
    navigation.navigate('Song', { songId: mediaId, type });
  };

  const handleArtistNav = (artistId: string) => {
    navigation.navigate('Artist', { artistId });
  };

  // ─── Play media (same logic as web) ───
  const handlePlayMedia = async (media: MediaItem) => {
    try {
      const endpoint = media.type === 'song'
        ? `/v1/media/song/${media.id}/play?userId=${userId}`
        : `/v1/media/video/${media.id}/play?userId=${userId}`;
      await axiosInstance.post(endpoint);
    } catch (err) {
      console.error('Failed to track play:', err);
    }

    const playlist = [media, ...newMedia.slice(0, 2).filter(m => m.id !== media.id)];
    playMedia(media as any, playlist as any);
  };

  // ─── Display lists with fallback ───
  const trendingList = trendingToday.length > 0 ? trendingToday.slice(0, 10) : getDummyTrending();
  const topRatedList = topRated.length > 0 ? topRated.slice(0, 5) : getDummyTrending();
  const newMediaList = newMedia.length > 0 ? newMedia.slice(0, 5) : getDummyNew();
  const awardsList = awards.length > 0 ? awards.slice(0, 5) : getDummyAwards();
  const artistsList = popularArtists.length > 0 ? popularArtists.slice(0, 5) : getDummyArtists();

  // ─── Loading state ───
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#163387" />
        <Text style={styles.loadingText}>Loading your feed...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../assets/randomrapper.jpeg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['transparent', '#000000']}
          locations={[0, 0.9]}
          style={styles.backgroundGradient}
        />
      </ImageBackground>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#163387"
            colors={['#163387']}
          />
        }
      >
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* ═══════ HERO BANNER ═══════ */}
        <TouchableOpacity
          style={styles.heroBanner}
          onPress={() => navigation.navigate('VoteAwards')}
          activeOpacity={0.95}
        >
          <LinearGradient
            colors={['#1a1a2e', '#16213e', '#0f3460']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(10,10,12,0.9)', 'rgba(10,10,12,0.4)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <HeroParticles />
          <View style={styles.heroContent}>
            <Text style={styles.heroLabel}>
              Featured in {selectedJurisdictionName}
            </Text>
            <Text style={styles.heroTitle}>
              Vote for This Week's Top Track
            </Text>
            <Text style={styles.heroSubtitle}>
              Your vote decides who tops the neighborhood leaderboard.
            </Text>
            <TouchableOpacity
              style={styles.heroCta}
              onPress={() => navigation.navigate('VoteAwards')}
              activeOpacity={0.8}
            >
              <Text style={styles.heroCtaText}>✓ Vote Now</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* ═══════ TRENDING TODAY ═══════ */}
        <AnimatedSection delay={100}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Trending Today in </Text>
                <JurisdictionSelect
                  selectedId={selectedJurisdictionId}
                  onChange={setSelectedJurisdictionId}
                />
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('Find')}>
                <Text style={styles.seeAll}>Show all</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={trendingList}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselContent}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <MediaCard
                  item={item}
                  onPress={() => handleSongNav(item.id, item.type)}
                  onPlayPress={() => handlePlayMedia(item)}
                />
              )}
              ItemSeparatorComponent={() => <View style={{ width: 14 }} />}
            />
          </View>
        </AnimatedSection>

        {/* ═══════ TOP RATED ═══════ */}
        <AnimatedSection delay={200}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Top Rated</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Find')}>
                <Text style={styles.seeAll}>Show all</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={topRatedList}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselContent}
              keyExtractor={(item) => `top-${item.id}`}
              renderItem={({ item }) => (
                <MediaCard
                  item={item}
                  onPress={() => handleSongNav(item.id, item.type)}
                  onPlayPress={() => handlePlayMedia(item)}
                />
              )}
              ItemSeparatorComponent={() => <View style={{ width: 14 }} />}
            />
          </View>
        </AnimatedSection>

        {/* ═══════ NEW RELEASES ═══════ */}
        <AnimatedSection delay={300}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>New Releases</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Find')}>
                <Text style={styles.seeAll}>Show all</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={newMediaList}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselContent}
              keyExtractor={(item) => `new-${item.id}`}
              renderItem={({ item }) => (
                <MediaCard
                  item={item}
                  onPress={() => handleSongNav(item.id, item.type)}
                  onPlayPress={() => handlePlayMedia(item)}
                />
              )}
              ItemSeparatorComponent={() => <View style={{ width: 14 }} />}
            />
          </View>
        </AnimatedSection>

        {/* ═══════ AWARDS ═══════ */}
        <AnimatedSection delay={400}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Awards</Text>
            </View>
            <View style={styles.awardsGrid}>
              {awardsList.map((award, index) => (
                <View key={award.id || index} style={styles.awardCard}>
                  <Text style={styles.awardName} numberOfLines={1}>
                    {award.name || award.targetType || 'Award'}
                  </Text>
                  <Text style={styles.awardWinner} numberOfLines={1}>
                    {award.winner?.username || award.artistName || award.songTitle || '—'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </AnimatedSection>

        {/* ═══════ POPULAR ARTISTS ═══════ */}
        <AnimatedSection delay={500}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Popular Artists</Text>
            </View>
            <View style={styles.artistsGrid}>
              {artistsList.map((artist, index) => (
                <ArtistCard
                  key={artist.userId}
                  artist={artist}
                  index={index}
                  onPress={() => handleArtistNav(artist.userId)}
                  onViewPress={() => handleArtistNav(artist.userId)}
                />
              ))}
            </View>
          </View>
        </AnimatedSection>

        <FeedFooter />
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
};

// ─── Base64 decode for token parsing ───
const atob = (input: string): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = input.replace(/=+$/, '');
  let output = '';
  if (str.length % 4 === 1) throw new Error('Invalid base64 string');
  for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
    buffer = chars.indexOf(buffer) as any;
    if ((buffer as number) === -1) continue;
    bs = bc % 4 ? bs * 64 + (buffer as number) : (buffer as number);
    if (bc++ % 4) output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
  }
  return output;
};

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0.15,
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#A9A9A9',
    marginTop: 16,
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 165, 0, 0.15)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 165, 0, 0.2)',
  },
  errorText: {
    color: '#FFA500',
    textAlign: 'center',
    fontSize: 14,
  },

  // ── Hero banner ──
  heroBanner: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 32,
    height: IS_MOBILE ? 170 : 200,
    position: 'relative',
  },
  heroContent: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    padding: IS_MOBILE ? 20 : 32,
    justifyContent: 'center',
    zIndex: 2,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#4ea8f5',
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: IS_MOBILE ? 22 : 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: '#f0f0f2',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: IS_MOBILE ? 12 : 14,
    color: 'rgba(255,255,255,0.55)',
    maxWidth: 280,
    lineHeight: 18,
  },
  heroCta: {
    marginTop: 14,
    backgroundColor: '#4ea8f5',
    borderRadius: 40,
    paddingHorizontal: 20,
    paddingVertical: 9,
    alignSelf: 'flex-start',
  },
  heroCtaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Sections ──
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
  },
  sectionTitle: {
    color: '#f0f0f2',
    fontSize: IS_MOBILE ? 20 : 24,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  seeAll: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
  },
  carouselContent: {
    paddingRight: 16,
  },

  // ── Awards ──
  awardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  awardCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: IS_MOBILE ? '47%' : 140,
    flexGrow: 1,
  },
  awardName: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  awardWinner: {
    color: '#f0f0f2',
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Artists ──
  artistsGrid: {
    gap: 16,
  },
});

export default FeedScreen;