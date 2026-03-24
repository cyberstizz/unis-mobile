// src/screens/JurisdictionScreen.tsx
// Full port of web jurisdictionPage.jsx redesign
// Hero with serif name, search bar, top artists list, local anthems, editorial

import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import Svg, { Path, Circle, Line } from 'react-native-svg';

import { usePlayer } from '../context/PlayerContext';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 600;

// ─── Design tokens (matching web jurisdictionPage.scss) ──────
const C = {
  bgBase: '#0a0a0c',
  bgSurface: 'rgba(255,255,255,0.03)',
  bgElevated: 'rgba(255,255,255,0.05)',
  bgHover: 'rgba(255,255,255,0.08)',
  borderDim: 'rgba(255,255,255,0.06)',
  borderHover: 'rgba(255,255,255,0.12)',
  unisBlue: '#163387',
  unisBlueLight: '#2e5aac',
  unisBlueGlow: 'rgba(22,51,135,0.3)',
  textPrimary: '#f0f0f2',
  textSecondary: 'rgba(255,255,255,0.55)',
  textTertiary: 'rgba(255,255,255,0.3)',
  textMuted: 'rgba(255,255,255,0.18)',
};

// ─── SVGs ────────────────────────────────────────────────────
const SearchIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.textTertiary} strokeWidth={2}>
    <Circle cx={11} cy={11} r={7} />
    <Line x1={16.5} y1={16.5} x2={21} y2={21} strokeLinecap="round" />
  </Svg>
);

const ChevronRightIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.textTertiary} strokeWidth={2}>
    <Path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const PlayIconSvg = ({ size = 12 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M8 5v14l11-7z" fill="#FFFFFF" />
  </Svg>
);

const EyeIcon = () => (
  <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={C.textTertiary} strokeWidth={2}>
    <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <Circle cx={12} cy={12} r={3} />
  </Svg>
);

// ─── Interfaces ──────────────────────────────────────────────
interface Artist { id: string; rank: number; name: string; genre?: string; supporters: number; plays: number; thumbnail: string | null; }
interface Song { id: string; rank: number; title: string; artist: string; artistId?: string; plays: number; likes: number; thumbnail: string | null; fileUrl: string | null; }
interface TopItem { id: string; name?: string; title?: string; artist?: string; image: string | null; fileUrl?: string | null; }

const atob = (input: string): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = input.replace(/=+$/, ''); let output = '';
  for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
    buffer = chars.indexOf(buffer) as any; if ((buffer as number) === -1) continue;
    bs = bc % 4 ? bs * 64 + (buffer as number) : (buffer as number);
    if (bc++ % 4) output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
  }
  return output;
};

// ═════════════════════════════════════════════════════════════
const JurisdictionScreen: React.FC<{ jurisdiction?: string }> = ({ jurisdiction = 'Harlem' }) => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const { playMedia } = usePlayer();

  const jurName = (route.params as any)?.jurisdictionName || (route.params as any)?.jurisdiction || jurisdiction;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const getUserId = async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (token) setUserId(JSON.parse(atob(token.split('.')[1])).userId);
      } catch {}
    };
    getUserId();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!jurName) { setError('No jurisdiction specified.'); setLoading(false); return; }
      try {
        setLoading(true); setError(null);
        const jurRes = await axiosInstance.get(`/v1/jurisdictions/byName/${encodeURIComponent(jurName)}`);
        const first = jurRes.data?.[0];
        if (!first) throw new Error('Jurisdiction not found');
        const topsRes = await axiosInstance.get(`/v1/jurisdictions/${first.jurisdictionId}/tops`);
        const raw = { ...topsRes.data, jurisdiction: first };
        const topArtist = raw.topArtist || (raw.topArtists || [])[0];
        const topSong = raw.topSong || (raw.topSongs || [])[0];

        setData({
          description: raw.jurisdiction.bio || `The heartbeat of ${jurName}. Where local artists define the sound of the streets.`,
          artistOfMonth: topArtist ? { id: topArtist.userId, name: topArtist.username, image: getMediaUrl(topArtist.photoUrl) } : null,
          songOfWeek: topSong ? { id: topSong.songId, title: topSong.title, artist: topSong.artist?.username || 'Unknown', artistId: topSong.artist?.userId, plays: topSong.plays || topSong.score || 0, image: getMediaUrl(topSong.artworkUrl), fileUrl: getMediaUrl(topSong.fileUrl) } : null,
          topArtists: (raw.topArtists || []).map((a: any, i: number) => ({ id: a.userId, rank: i + 1, name: a.username, genre: a.genre?.name || '', supporters: a.score || 0, plays: a.score || 0, thumbnail: getMediaUrl(a.photoUrl) })),
          topSongs: (raw.topSongs || []).map((s: any, i: number) => ({ id: s.songId, rank: i + 1, title: s.title, artist: s.artist?.username || 'Unknown', artistId: s.artist?.userId, plays: s.plays || s.score || 0, likes: s.likes || 0, thumbnail: getMediaUrl(s.artworkUrl), fileUrl: getMediaUrl(s.fileUrl) })),
        });
      } catch { setError(`Failed to load data for ${jurName}.`); setData(null); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [jurName]);

  // ── Play handlers ──
  const handlePlayArtist = async (artist: Artist) => {
    try {
      const res = await axiosInstance.get(`/v1/users/${artist.id}/default-song`);
      const ds = res.data;
      if (ds?.fileUrl) {
        playMedia({ type: 'song', url: getMediaUrl(ds.fileUrl), title: ds.title, artist: artist.name, artwork: getMediaUrl(ds.artworkUrl) || artist.thumbnail } as any, []);
        if (ds.songId && userId) axiosInstance.post(`/v1/media/song/${ds.songId}/play?userId=${userId}`).catch(() => {});
      } else Alert.alert('Unavailable', `${artist.name} has no default song`);
    } catch { Alert.alert('Error', "Could not load artist's song"); }
  };

  const handlePlaySong = async (song: Song) => {
    if (!song.fileUrl) { Alert.alert('Unavailable', 'Song not available'); return; }
    playMedia({ type: 'song', url: song.fileUrl, title: song.title, artist: song.artist, artwork: song.thumbnail } as any, []);
    if (song.id && userId) axiosInstance.post(`/v1/media/song/${song.id}/play?userId=${userId}`).catch(() => {});
  };

  const handlePlayTopSong = () => { if (data?.songOfWeek) handlePlaySong(data.songOfWeek as any); };

  const handleViewArtist = (id: string) => navigation.navigate('Artist', { artistId: id });
  const handleViewSong = (id: string) => navigation.navigate('Song', { songId: id });

  if (loading) return <View style={s.loadingWrap}><ActivityIndicator size="large" color={C.unisBlue} /><Text style={s.loadingText}>Loading {jurName}...</Text></View>;
  if (!data) return <View style={s.loadingWrap}><Text style={s.errorText}>{error || `No data for ${jurName}`}</Text></View>;

  const nameParts = jurName.split(' ');
  const firstWord = nameParts.slice(0, -1).join(' ') || '';
  const lastWord = nameParts[nameParts.length - 1] || jurName;

  return (
    <View style={s.container}>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ═══ HERO ═══ */}
        <View style={s.hero}>
          <Text style={s.heroLabel}>Current Jurisdiction</Text>
          {firstWord ? <Text style={s.nameFirst}>{firstWord}</Text> : null}
          <Text style={s.nameAccent}>{lastWord}</Text>
          <Text style={s.heroDesc}>{data.description}</Text>
        </View>

        {/* ═══ SEARCH BAR ═══ */}
        <TouchableOpacity style={s.searchBar} onPress={() => navigation.navigate('Find')} activeOpacity={0.7}>
          <SearchIcon />
          <Text style={s.searchText}>Search artists...</Text>
        </TouchableOpacity>

        {/* ═══ TOP ARTISTS ═══ */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitleItalic}>Top {data.topArtists.length} </Text>
            <Text style={s.sectionTitleCaps}>Artists</Text>
          </View>

          {data.topArtists.length > 0 ? data.topArtists.map((artist: Artist) => (
            <TouchableOpacity key={artist.id} style={s.artistRow} onPress={() => handleViewArtist(artist.id)} activeOpacity={0.7}>
              <Text style={s.artistRank}>{String(artist.rank).padStart(2, '0')}</Text>
              <Image source={{ uri: artist.thumbnail || 'https://picsum.photos/80' }} style={s.artistPhoto} />
              <View style={s.artistInfo}>
                <Text style={s.artistName} numberOfLines={1}>{artist.name}</Text>
                {artist.genre ? <Text style={s.artistGenre}>{artist.genre}</Text> : null}
              </View>
              <ChevronRightIcon />
            </TouchableOpacity>
          )) : <Text style={s.emptyText}>No artists yet in {jurName}</Text>}
        </View>

        {/* ═══ LOCAL ANTHEMS ═══ */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitleItalic}>Local </Text>
            <Text style={s.sectionTitleCaps}>Anthems</Text>
          </View>

          {data.songOfWeek && (
            <TouchableOpacity activeOpacity={0.9} onPress={() => handleViewSong(data.songOfWeek.id)}>
              <ImageBackground source={{ uri: data.songOfWeek.image || 'https://picsum.photos/400' }} style={s.anthemHero} imageStyle={{ borderRadius: 14 }}>
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.88)']} locations={[0, 0.5, 1]} style={s.anthemOverlay}>
                  <View style={s.anthemBadge}><Text style={s.anthemBadgeText}>#1 This Week</Text></View>
                  <Text style={s.anthemTitle}>{data.songOfWeek.title}</Text>
                  <Text style={s.anthemArtist}>{data.songOfWeek.artist}</Text>
                  <TouchableOpacity style={s.listenBtn} onPress={(e) => { e.stopPropagation?.(); handlePlayTopSong(); }}>
                    <PlayIconSvg size={14} />
                    <Text style={s.listenBtnText}>Listen Now</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </ImageBackground>
            </TouchableOpacity>
          )}

          {data.topSongs.slice(1).map((song: Song) => (
            <TouchableOpacity key={song.id} style={s.songRow} onPress={() => handleViewSong(song.id)} activeOpacity={0.7}>
              <Image source={{ uri: song.thumbnail || 'https://picsum.photos/80' }} style={s.songThumb} />
              <View style={s.songInfo}>
                <Text style={s.songRank}>#{song.rank}</Text>
                <Text style={s.songTitle} numberOfLines={1}>{song.title}</Text>
                <Text style={s.songArtist}>{song.artist}</Text>
                <View style={s.songStatRow}><EyeIcon /><Text style={s.songStat}>{song.plays.toLocaleString()}</Text></View>
              </View>
              <TouchableOpacity style={s.songPlayBtn} onPress={() => handlePlaySong(song)}>
                <PlayIconSvg size={12} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>

        {/* ═══ EDITORIAL ═══ */}
        <View style={s.editorial}>
          <Text style={s.editorialTitle}>
            <Text style={s.editorialItalic}>Discover the{'\n'}Rhythm of </Text>
            <Text style={s.editorialAccent}>Your</Text>
            <Text style={s.editorialItalic}>{'\n'}Streets</Text>
          </Text>
          <Text style={s.editorialBody}>
            UNIS Jurisdictions use localized streaming data to show you exactly what's trending in your neighborhood. No global algorithms, just the heartbeat of {jurName}.
          </Text>
          <View style={s.editorialStats}>
            <View style={s.editorialStat}><Text style={s.editorialStatLabel}>Local Artists</Text><Text style={s.editorialStatValue}>{data.topArtists.length}</Text></View>
            <View style={s.editorialStat}><Text style={s.editorialStatLabel}>Local Songs</Text><Text style={s.editorialStatValue}>{data.topSongs.length}</Text></View>
          </View>
        </View>

        {error && <View style={s.errorBanner}><Text style={s.errorBannerText}>{error}</Text></View>}
        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bgBase },
  scroll: { flex: 1 },
  scrollContent: { padding: IS_MOBILE ? 14 : 32, paddingTop: 8 },
  loadingWrap: { flex: 1, backgroundColor: C.bgBase, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: C.textSecondary, marginTop: 12 },
  errorText: { color: '#e74c3c', fontSize: 15 },

  // Hero
  hero: { paddingTop: 32, paddingBottom: 28 },
  heroLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 2.5, textTransform: 'uppercase', color: C.unisBlueLight, marginBottom: 10 },
  nameFirst: { fontSize: IS_MOBILE ? 36 : 56, fontWeight: '800', fontStyle: 'italic', color: C.textPrimary, letterSpacing: -1, lineHeight: IS_MOBILE ? 40 : 58 },
  nameAccent: { fontSize: IS_MOBILE ? 36 : 56, fontWeight: '800', fontStyle: 'italic', color: C.unisBlue, letterSpacing: -1, lineHeight: IS_MOBILE ? 40 : 58, marginBottom: 16 },
  heroDesc: { fontSize: 14, lineHeight: 22, color: C.textSecondary, maxWidth: 400 },

  // Search
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.bgElevated, borderWidth: 1, borderColor: C.borderDim, borderRadius: 100, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 28, maxWidth: 280 },
  searchText: { color: C.textTertiary, fontSize: 14 },

  // Sections
  section: { marginBottom: 40 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 16 },
  sectionTitleItalic: { fontSize: IS_MOBILE ? 20 : 24, fontWeight: '700', fontStyle: 'italic', color: C.textPrimary },
  sectionTitleCaps: { fontSize: IS_MOBILE ? 12 : 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2, color: C.textSecondary, marginLeft: 4 },

  // Artist rows
  artistRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10 },
  artistRank: { fontSize: 16, fontWeight: '300', color: C.textMuted, minWidth: 28, textAlign: 'center' },
  artistPhoto: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.borderDim },
  artistInfo: { flex: 1, gap: 2 },
  artistName: { fontSize: 14, fontWeight: '600', color: C.textPrimary },
  artistGenre: { fontSize: 11, color: C.textTertiary },
  emptyText: { color: C.textTertiary, fontSize: 14, paddingVertical: 20 },

  // Anthem hero
  anthemHero: { width: '100%', aspectRatio: 16 / 10, borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  anthemOverlay: { flex: 1, justifyContent: 'flex-end', padding: 18 },
  anthemBadge: { backgroundColor: 'rgba(22,51,135,0.15)', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 8 },
  anthemBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: C.unisBlueLight },
  anthemTitle: { fontSize: IS_MOBILE ? 22 : 26, fontWeight: '700', fontStyle: 'italic', color: C.textPrimary, marginBottom: 4 },
  anthemArtist: { fontSize: 13, color: C.textSecondary, marginBottom: 12 },
  listenBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.unisBlue, borderRadius: 100, paddingVertical: 9, paddingHorizontal: 20, alignSelf: 'flex-start' },
  listenBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Song rows
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, marginBottom: 4 },
  songThumb: { width: 48, height: 48, borderRadius: 6 },
  songInfo: { flex: 1, gap: 1 },
  songRank: { fontSize: 10, fontWeight: '600', color: C.textMuted, letterSpacing: 0.5 },
  songTitle: { fontSize: 14, fontWeight: '600', color: C.textPrimary },
  songArtist: { fontSize: 12, color: C.textSecondary },
  songStatRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  songStat: { fontSize: 11, color: C.textTertiary },
  songPlayBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.unisBlue, justifyContent: 'center', alignItems: 'center' },

  // Editorial
  editorial: { paddingTop: 40, borderTopWidth: 1, borderTopColor: C.borderDim },
  editorialTitle: { fontSize: IS_MOBILE ? 28 : 42, lineHeight: IS_MOBILE ? 34 : 50, marginBottom: 16 },
  editorialItalic: { fontWeight: '700', fontStyle: 'italic', color: C.textPrimary },
  editorialAccent: { fontWeight: '700', fontStyle: 'italic', color: C.unisBlue },
  editorialBody: { fontSize: 14, lineHeight: 22, color: C.textSecondary, maxWidth: 400, marginBottom: 24 },
  editorialStats: { gap: 14 },
  editorialStat: { gap: 2 },
  editorialStatLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1.5, textTransform: 'uppercase', color: C.textTertiary },
  editorialStatValue: { fontSize: 20, fontWeight: '700', color: C.textPrimary },

  errorBanner: { marginTop: 20, padding: 12, backgroundColor: 'rgba(255,100,100,0.08)', borderWidth: 1, borderColor: 'rgba(255,100,100,0.2)', borderRadius: 10 },
  errorBannerText: { color: '#f5a623', textAlign: 'center', fontSize: 14 },
});

export default JurisdictionScreen;