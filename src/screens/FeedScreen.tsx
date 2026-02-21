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
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';
import MediaCard, { MediaItem } from '../components/MediaCard';
import ArtistCard, { ArtistItem } from '../components/ArtistCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─────────────────────────────────────────────
// ANIMATED SECTION — slides in from left like web
// ─────────────────────────────────────────────
const AnimatedSection: React.FC<{
  title: string;
  delay: number;
  children: React.ReactNode;
}> = ({ title, delay, children }) => {
  const slideX = useRef(new Animated.Value(-50)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const [hasAnimated, setHasAnimated] = useState(false);

useFocusEffect(
  useCallback(() => {
    // Reset to starting position
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
    <View style={styles.section}>
      <Animated.View
        style={{
          opacity: fadeIn,
          transform: [{ translateX: slideX }],
        }}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
      </Animated.View>
      <Animated.View style={{ opacity: fadeIn }}>
        {children}
      </Animated.View>
    </View>
  );
};

// ─────────────────────────────────────────────
// FOOTER LINKS
// ─────────────────────────────────────────────
const FOOTER_LINKS = [
  { label: 'About', route: 'about' },
  { label: 'Terms', route: 'terms' },
  { label: 'Privacy', route: 'privacy' },
  { label: 'Support', route: 'support' },
];

const FeedFooter: React.FC = () => {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.footer}>
      <View style={styles.footerDivider} />
      <View style={styles.footerLinks}>
        {FOOTER_LINKS.map((link, index) => (
          <React.Fragment key={link.label}>
            {index > 0 && <Text style={styles.footerDot}>·</Text>}
            <TouchableOpacity
              onPress={() => {
                // Navigate if screen exists, otherwise could open a URL
                try {
                  navigation.navigate(link.route);
                } catch {
                  console.log(`No route for ${link.route}`);
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.footerLinkText}>{link.label}</Text>
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </View>
      <Text style={styles.footerCopyright}>© {new Date().getFullYear()} Unis Music. All rights reserved.</Text>
    </View>
  );
};

// ─────────────────────────────────────────────
// DUMMY DATA (fallback)
// ─────────────────────────────────────────────
const getDummyTrending = (): MediaItem[] => [
  {
    id: 'dummy1',
    title: 'Paranoid',
    artistData: { userId: '1', username: 'Tony Fadd' },
    artworkUrl: 'https://picsum.photos/200?random=1',
    type: 'song',
    duration: 180000,
    explicit: false,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'dummy2',
    title: 'Waited All Night',
    artistData: { userId: '2', username: 'SD Boomin' },
    artworkUrl: 'https://picsum.photos/200?random=2',
    type: 'song',
    duration: 210000,
    explicit: true,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'dummy3',
    title: 'Golden Hour',
    artistData: { userId: '3', username: 'Artist Three' },
    artworkUrl: 'https://picsum.photos/200?random=3',
    type: 'song',
    duration: 195000,
    explicit: false,
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'dummy4',
    title: 'Midnight Dreams',
    artistData: { userId: '4', username: 'Artist Four' },
    artworkUrl: 'https://picsum.photos/200?random=4',
    type: 'song',
    duration: 240000,
    explicit: true,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'dummy5',
    title: 'Street Lights',
    artistData: { userId: '5', username: 'Artist Five' },
    artworkUrl: 'https://picsum.photos/200?random=5',
    type: 'song',
    duration: 175000,
    explicit: false,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const getDummyNew = (): MediaItem[] => [
  {
    id: 'dummy6',
    title: 'The Outside',
    artistData: { userId: '6', username: 'Artist Six' },
    artworkUrl: 'https://picsum.photos/200?random=6',
    type: 'song',
    duration: 155000,
    explicit: false,
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'dummy7',
    title: 'Original Man',
    artistData: { userId: '7', username: 'Artist Seven' },
    artworkUrl: 'https://picsum.photos/200?random=7',
    type: 'song',
    duration: 205000,
    explicit: true,
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'dummy8',
    title: 'Flavorfall',
    artistData: { userId: '8', username: 'Artist Eight' },
    artworkUrl: 'https://picsum.photos/200?random=8',
    type: 'song',
    duration: 175000,
    explicit: false,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
const FeedScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { playMedia } = usePlayer();
  const navigation = useNavigation<any>();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [jurisdictionId, setJurisdictionId] = useState<string | null>(null);

  // Data
  const [trendingToday, setTrendingToday] = useState<MediaItem[]>([]);
  const [newMedia, setNewMedia] = useState<MediaItem[]>([]);
  const [popularArtists, setPopularArtists] = useState<ArtistItem[]>([]);

  // ─── NORMALIZE MEDIA — uses getMediaUrl for all image/audio paths ───
  const normalizeMedia = (items: any[]): MediaItem[] => {
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
      duration: item.duration || null,
      createdAt: item.createdAt || null,
      explicit: item.explicit || false,
      playsToday: item.playsToday || 0,
      playCount: item.playCount || 0,
      genre: item.genre?.name || item.genre || null,
      jurisdiction: item.jurisdiction?.name || item.jurisdiction || null,
    }));
  };

  // ─── FETCH USER PROFILE ───
  const fetchProfile = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) throw new Error('Not authenticated');

      const payload = JSON.parse(atob(token.split('.')[1]));
      const uid = payload.userId;
      setUserId(uid);

      const profileRes = await axiosInstance.get(`/v1/users/profile/${uid}`);
      const { jurisdiction } = profileRes.data;
      const jurId = jurisdiction?.jurisdictionId;
      setJurisdictionId(jurId || '00000000-0000-0000-0000-000000000002');
    } catch (err) {
      console.error('Profile load error:', err);
      setError('Profile unavailable—using default feed.');
      setJurisdictionId('00000000-0000-0000-0000-000000000002');
    }
  };

  // ─── FETCH MEDIA DATA ───
  const fetchMediaData = async () => {
    if (!userId || !jurisdictionId) return;

    try {
      const [trendingTodayRes, newRes] = await Promise.all([
        axiosInstance.get(`/v1/media/trending/today?jurisdictionId=${jurisdictionId}&limit=10`),
        axiosInstance.get(`/v1/media/new?jurisdictionId=${jurisdictionId}&limit=5`),
      ]);

      setTrendingToday(normalizeMedia(trendingTodayRes.data || []));
      setNewMedia(normalizeMedia(newRes.data || []));

      // ─── EXTRACT ARTISTS — use getMediaUrl for photoUrl ───
      const artistMap = new Map<string, ArtistItem>();
      const allMedia = [...(trendingTodayRes.data || []), ...(newRes.data || [])];

      allMedia.forEach((media: any) => {
        if (media.artist && !artistMap.has(media.artist.userId)) {
          artistMap.set(media.artist.userId, {
            userId: media.artist.userId,
            username: media.artist.username,
            photoUrl: getMediaUrl(media.artist.photoUrl), // ← THIS was the fix
            jurisdictionId: media.artist.jurisdiction?.jurisdictionId,
            score: media.artist.score || 0,
          });
        }
      });

      const artists = Array.from(artistMap.values())
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 5);

      setPopularArtists(artists);
      setError('');
    } catch (err) {
      console.error('Media load error:', err);
      setError('Feed unavailable—showing demo content.');
      setTrendingToday(getDummyTrending());
      setNewMedia(getDummyNew());
    }
  };

  // ─── LIFECYCLE ───
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchProfile();
    };
    init();
  }, []);

  useEffect(() => {
    if (jurisdictionId) {
      if (userId) {
        fetchMediaData().finally(() => setLoading(false));
      } else {
        setTrendingToday(getDummyTrending());
        setNewMedia(getDummyNew());
        setLoading(false);
      }
    }
  }, [userId, jurisdictionId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMediaData();
    setRefreshing(false);
  }, [userId, jurisdictionId]);

  // ─── NAVIGATION ───
  const handleSongNav = (mediaId: string, type: string = 'song') => {
    navigation.navigate('Song', { songId: mediaId, type });
  };

  const handleArtistNav = (artistId: string) => {
    navigation.navigate('Artist', { artistId });
  };

  // ─── PLAY MEDIA ───
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

  // Final display lists
  const trendingList = trendingToday.length > 0 ? trendingToday : getDummyTrending();
  const newList = newMedia.length > 0 ? newMedia : getDummyNew();

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
      {/* Background with gradient */}
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
        {/* Error Message */}
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Trending Today — slides in with 100ms delay */}
        <AnimatedSection title="TRENDING TODAY" delay={100}>
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
            ItemSeparatorComponent={() => <View style={{ width: 16 }} />}
          />
        </AnimatedSection>

        {/* New Releases — slides in with 300ms delay */}
        <AnimatedSection title="NEW RELEASES" delay={300}>
          <FlatList
            data={newList}
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
            ItemSeparatorComponent={() => <View style={{ width: 16 }} />}
          />
        </AnimatedSection>

        {/* Popular Artists — slides in with 500ms delay */}
        <AnimatedSection title="POPULAR ARTISTS" delay={500}>
          <View style={styles.artistsGrid}>
            {(popularArtists.length > 0 ? popularArtists : [
              { userId: '1', username: 'Tony Fadd', photoUrl: 'https://picsum.photos/200?random=a1', score: 100 },
              { userId: '2', username: 'SD Boomin', photoUrl: 'https://picsum.photos/200?random=a2', score: 80 },
              { userId: '3', username: 'Artist Three', photoUrl: 'https://picsum.photos/200?random=a3', score: 60 },
            ]).map((artist) => (
              <ArtistCard
                key={artist.userId}
                artist={artist}
                onPress={() => handleArtistNav(artist.userId)}
                onViewPress={() => handleArtistNav(artist.userId)}
              />
            ))}
          </View>
        </AnimatedSection>

        {/* Footer */}
        <FeedFooter />

        {/* Bottom padding for MiniPlayer */}
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

  if (str.length % 4 === 1) {
    throw new Error('Invalid base64 string');
  }

  for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
    buffer = chars.indexOf(buffer);
    if (buffer === -1) continue;
    bs = bc % 4 ? bs * 64 + buffer : buffer;
    if (bc++ % 4) {
      output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
    }
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
    backgroundColor: 'rgba(255, 165, 0, 0.2)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#FFA500',
    textAlign: 'center',
    fontSize: 14,
  },

  // ── Sections ──
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    color: '#163387',
    fontSize: SCREEN_WIDTH > 768 ? 28 : 22,
    fontWeight: '400',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#C0C0C0',
  },
  carouselContent: {
    paddingRight: 16,
  },
  artistsGrid: {
    gap: 16,
  },

  // ── Footer ──
  footer: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 10,
    marginTop: 10,
  },
  footerDivider: {
    width: '40%',
    height: 1,
    backgroundColor: 'rgba(192, 192, 192, 0.15)',
    marginBottom: 16,
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 10,
  },
  footerDot: {
    color: 'rgba(192, 192, 192, 0.3)',
    marginHorizontal: 10,
    fontSize: 12,
  },
  footerLinkText: {
    color: 'rgba(192, 192, 192, 0.5)',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  footerCopyright: {
    color: 'rgba(192, 192, 192, 0.25)',
    fontSize: 10,
    letterSpacing: 0.5,
    marginTop: 4,
  },
});

export default FeedScreen;