// src/components/RecommendedSongs.tsx
// Port of web src/RecommendedSongs.jsx — the "Recommended" row on the song
// page. The backend picks the songs (same subgenre and neighborhood first, one
// more by the same artist in the second slot, widening rather than leaving
// gaps). Playing goes through requestPlay (Play now / Add to queue prompt);
// plays are counted by the Player after its listening threshold, never here.
import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import axiosInstance from '../services/axiosInstance';
import { usePlayer } from '../context/PlayerContext';
import { songToTrack } from '../utils/songTrack';
import { useUnisTheme } from '../theme/unisTheme';

const PlayIcon = () => (
  <Svg width={14} height={14} viewBox="0 0 14 14"><Path d="M3 2v10l9-5-9-5z" fill="#fff" /></Svg>
);

const RecommendedSongs: React.FC<{ songId?: string; limit?: number }> = ({ songId, limit = 8 }) => {
  const navigation = useNavigation<any>();
  const { requestPlay } = usePlayer();
  const t = useUnisTheme();
  const [songs, setSongs] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!songId) return undefined;
    let active = true;
    setLoaded(false);
    axiosInstance
      .get(`/v1/media/song/${songId}/recommended?limit=${limit}`)
      .then((res) => { if (active) setSongs(Array.isArray(res.data) ? res.data : []); })
      .catch((err) => {
        console.error('[Recommended] could not load recommendations:', err);
        if (active) setSongs([]);
      })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [songId, limit]);

  if (loaded && songs.length === 0) return null;

  const open = (id: string) => navigation.push ? navigation.push('Song', { songId: id }) : navigation.navigate('Song', { songId: id });

  return (
    <View style={styles.section}>
      <Text style={styles.title} accessibilityRole="header">Recommended</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {!loaded
          ? Array.from({ length: 4 }).map((_, i) => <View key={i} style={[styles.card, styles.ghost]} />)
          : songs.map((s) => {
              const track = songToTrack(s, 'recommended');
              if (!track) return null;
              return (
                <View key={s.songId} style={styles.card}>
                  <View style={styles.art}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => open(s.songId)} accessibilityLabel={`Open ${s.title} by ${track.artist}`}>
                      {track.artwork ? (
                        <Image source={{ uri: track.artwork }} style={StyleSheet.absoluteFill} />
                      ) : (
                        <View style={[StyleSheet.absoluteFill, styles.fallback, { backgroundColor: t.soft }]}>
                          <Text style={styles.fallbackText}>{(s.title || '?').charAt(0)}</Text>
                        </View>
                      )}
                    </Pressable>
                    {!!track.url && (
                      <Pressable style={[styles.play, { backgroundColor: t.primary }]} onPress={() => requestPlay(track as any)} accessibilityLabel={`Play ${s.title}`} hitSlop={6}>
                        <PlayIcon />
                      </Pressable>
                    )}
                  </View>
                  <Pressable onPress={() => open(s.songId)}>
                    <Text style={styles.name} numberOfLines={1}>{s.title}</Text>
                  </Pressable>
                  <Text style={styles.artist} numberOfLines={1}>{track.artist}</Text>
                  {!!s.primarySubgenre?.name && (
                    <Text style={[styles.tag, { color: t.textAccent, backgroundColor: t.subtle }]} numberOfLines={1}>{s.primarySubgenre.name}</Text>
                  )}
                </View>
              );
            })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3, paddingHorizontal: 16 },
  row: { gap: 12, paddingHorizontal: 16, paddingTop: 12 },
  card: { width: 136 },
  ghost: { height: 180, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)' },
  art: { width: 136, height: 136, borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: '#fff', fontSize: 44, fontWeight: '900' },
  play: { position: 'absolute', right: 8, bottom: 8, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  name: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 8 },
  artist: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, marginTop: 1 },
  tag: { alignSelf: 'flex-start', fontSize: 10.5, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', marginTop: 5 },
});

export default RecommendedSongs;
