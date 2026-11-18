// src/screens/BrowseTagScreen.tsx
// ─────────────────────────────────────────────────────────────
// A shelf of songs for one subgenre or one mood — port of web
// src/BrowseTagPage.jsx. Params: { kind: 'subgenre' | 'mood', slug, jid? }.
// Songs from `jid` (default: your area) come first. Reached from the chips on
// a song page and on Discover. Playing goes through requestPlay only.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import axiosInstance from '../services/axiosInstance';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import { JURISDICTION_IDS } from '../utils/IdMappings';
import { GENRE_LABELS } from '../utils/taxonomy';
import { songToTrack } from '../utils/songTrack';
import { useUnisTheme } from '../theme/unisTheme';

const AREA_NAMES: Record<string, string> = {
  [JURISDICTION_IDS.harlem]: 'Harlem',
  [JURISDICTION_IDS['uptown-harlem']]: 'Uptown Harlem',
  [JURISDICTION_IDS['downtown-harlem']]: 'Downtown Harlem',
};

const PlayIcon = () => (<Svg width={14} height={14} viewBox="0 0 14 14"><Path d="M3 2v10l9-5-9-5z" fill="#fff" /></Svg>);

const BrowseTagScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const t = useUnisTheme();
  const { requestPlay } = usePlayer();
  const { user } = useAuth();
  const kind: string = route.params?.kind;
  const slug: string = route.params?.slug;
  const isMood = kind === 'mood';
  const jid: string | null = route.params?.jid || user?.jurisdiction?.jurisdictionId || null;
  const areaName = jid ? AREA_NAMES[jid] || (jid === user?.jurisdiction?.jurisdictionId ? user?.jurisdiction?.name : null) : null;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (kind !== 'subgenre' && kind !== 'mood') {
      setError('That page does not exist.');
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError('');
    const params = [`${isMood ? 'mood' : 'subgenre'}=${encodeURIComponent(slug)}`, 'limit=60'];
    if (jid) params.push(`jurisdictionId=${jid}`);
    axiosInstance
      .get(`/v1/media/songs/browse?${params.join('&')}`)
      .then((res) => { if (active) setData(res.data); })
      .catch((err) => {
        console.error('[Browse] failed:', err);
        if (active) {
          setError(err?.response?.status === 404
            ? `We couldn't find that ${isMood ? 'mood' : 'subgenre'}.`
            : "We couldn't load these songs. Please try again in a moment.");
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind, slug, jid, isMood]);

  const tag = isMood ? data?.mood : data?.subgenre;
  const songs: any[] = data?.songs || [];
  const openSong = (id: string) => navigation.push('Song', { songId: id });

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={[styles.eyebrow, { color: t.textAccent }]}>
        {isMood ? 'Mood' : `Subgenre${tag?.genreId && GENRE_LABELS[tag.genreId] ? ` · ${GENRE_LABELS[tag.genreId]}` : ''}`}
      </Text>
      <Text style={styles.title} accessibilityRole="header">{tag?.name || (loading ? '…' : 'Browse')}</Text>
      {tag && (isMood ? tag.description : tag.soundsLike) ? (
        <Text style={styles.sub}>{isMood ? tag.description : `Sounds like ${tag.soundsLike}`}</Text>
      ) : null}
      {tag && areaName ? <Text style={styles.area}>Songs from {areaName} come first.</Text> : null}

      {loading && <View style={styles.status}><ActivityIndicator color="#fff" /><Text style={styles.statusText}>Loading songs…</Text></View>}
      {!loading && !!error && <Text style={[styles.statusText, { color: '#fca5a5', marginTop: 30 }]} accessibilityRole="alert">{error}</Text>}
      {!loading && !error && songs.length === 0 && (
        <Text style={[styles.statusText, { marginTop: 30 }]}>
          No songs here yet. When artists tag their songs {tag?.name || 'this way'}, they'll show up here.
        </Text>
      )}

      {!loading && !error && songs.length > 0 && (
        <View style={styles.grid}>
          {songs.map((s) => {
            const track = songToTrack(s, `browse-${kind}`);
            if (!track) return null;
            return (
              <View key={s.songId} style={styles.card}>
                <View style={styles.art}>
                  <Pressable style={StyleSheet.absoluteFill} onPress={() => openSong(s.songId)} accessibilityLabel={`Open ${s.title} by ${track.artist}`}>
                    {track.artwork ? (
                      <Image source={{ uri: track.artwork }} style={StyleSheet.absoluteFill} />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, styles.fallback, { backgroundColor: t.soft }]}><Text style={styles.fallbackText}>{(s.title || '?').charAt(0)}</Text></View>
                    )}
                  </Pressable>
                  {!!track.url && (
                    <Pressable style={[styles.play, { backgroundColor: t.primary }]} onPress={() => requestPlay(track as any)} accessibilityLabel={`Play ${s.title}`} hitSlop={6}>
                      <PlayIcon />
                    </Pressable>
                  )}
                </View>
                <Pressable onPress={() => openSong(s.songId)}><Text style={styles.name} numberOfLines={1}>{s.title}</Text></Pressable>
                <Text style={styles.artist} numberOfLines={1}>{track.artist}{track.jurisdiction ? ` · ${track.jurisdiction}` : ''}</Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 160 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: -0.6, marginTop: 4 },
  sub: { color: 'rgba(255,255,255,0.7)', fontSize: 14.5, lineHeight: 20, marginTop: 6 },
  area: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 6 },
  status: { alignItems: 'center', gap: 10, marginTop: 40 },
  statusText: { color: 'rgba(255,255,255,0.65)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 20 },
  card: { width: '47%', flexGrow: 1, maxWidth: '48.5%' },
  art: { width: '100%', aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: '#fff', fontSize: 44, fontWeight: '900' },
  play: { position: 'absolute', right: 8, bottom: 8, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  name: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 8 },
  artist: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, marginTop: 1 },
});

export default BrowseTagScreen;
