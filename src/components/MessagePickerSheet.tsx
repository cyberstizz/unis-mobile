// src/components/MessagePickerSheet.tsx
// Mobile port of web src/MessagePickerSheet.jsx — one sheet, two jobs:
//   mode="people" → the inbox "New" button: find someone to message
//   mode="song"   → the thread "Share a song" button: pick a song to share
// Both search GET /v1/search (debounced 250ms, 2+ characters).
import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Sheet from './ui/Sheet';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { SearchIcon } from '../icons/UnisIcons';
import { initials } from './messages/DmParts';
import { useUnisTheme } from '../theme/unisTheme';

const COPY = {
  people: { title: 'New message', placeholder: 'Search people', type: 'user', empty: 'Search for an artist or listener by name.' },
  song: { title: 'Share a song', placeholder: 'Search songs', type: 'song', empty: 'Search for a song to share.' },
};

export interface PickResult {
  id: string;
  name: string;
  subtitle?: string;
  artworkUrl?: string | null;
  type?: string;
  extra?: any;
}

interface Props {
  open: boolean;
  mode?: 'people' | 'song';
  onClose: () => void;
  onPick: (r: PickResult) => void;
  excludeUserId?: string;
}

const MessagePickerSheet: React.FC<Props> = ({ open, mode = 'people', onClose, onPick, excludeUserId }) => {
  const copy = COPY[mode] || COPY.people;
  const t = useUnisTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickResult[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setStatus('idle');
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const res = await axiosInstance.get(`/v1/search?q=${encodeURIComponent(q)}&type=${copy.type}&limit=20`);
        if (cancelled) return;
        setResults((res.data?.results || []).filter((r: PickResult) => r.id !== excludeUserId));
        setStatus('done');
      } catch (err: any) {
        console.error(`[Messages] ${mode} search failed:`, err?.message || err);
        if (!cancelled) {
          setResults([]);
          setStatus('error');
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, copy.type, mode, excludeUserId]);

  return (
    <Sheet visible={open} onClose={onClose} bare fullHeight>
      <View style={styles.head}>
        <View style={styles.search}>
          <SearchIcon size={19} color="rgba(255,255,255,0.6)" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={copy.placeholder}
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={styles.input}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel={copy.placeholder}
          />
        </View>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={[styles.cancel, { color: t.textAccent }]}>Cancel</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>{copy.title}</Text>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }}>
        {status === 'idle' && <Text style={styles.hint}>{copy.empty}</Text>}
        {status === 'loading' &&
          [62, 48, 70, 54].map((w) => (
            <View key={w} style={styles.skelRow}>
              <View style={[styles.skelFace, mode === 'song' ? { borderRadius: 8 } : { borderRadius: 22 }]} />
              <View style={{ flex: 1, gap: 6 }}>
                <View style={[styles.skelLine, { width: `${w}%` }]} />
                <View style={[styles.skelLine, { width: `${w - 20}%`, opacity: 0.5 }]} />
              </View>
            </View>
          ))}
        {status === 'error' && <Text style={styles.hint}>Search isn&rsquo;t available right now.</Text>}
        {status === 'done' && results.length === 0 && <Text style={styles.hint}>No matches for {'“'}{query.trim()}{'”'}.</Text>}
        {status !== 'loading' &&
          results.map((r) => {
            const img = r.artworkUrl ? buildUrl(r.artworkUrl) : null;
            const isArtist = String(r.type).toLowerCase() === 'artist' || String(r.extra?.role || '').toLowerCase() === 'artist';
            const shape = mode === 'song' ? styles.art : styles.avatar;
            return (
              <Pressable key={r.id} onPress={() => onPick(r)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                {img ? (
                  <Image source={{ uri: img }} style={shape} />
                ) : (
                  <View style={[shape, { backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{initials(r.name)}</Text>
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{r.name}</Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {mode === 'song' ? r.subtitle || 'Song' : isArtist ? 'Artist' : 'Listener'}
                    {mode === 'people' && r.subtitle ? ` · ${r.subtitle}` : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })}
      </ScrollView>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.07)' },
  input: { flex: 1, color: '#fff', fontSize: 15.5 },
  cancel: { fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 10, letterSpacing: -0.3 },
  hint: { color: 'rgba(255,255,255,0.5)', fontSize: 14, paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  art: { width: 46, height: 46, borderRadius: 8 },
  name: { color: '#fff', fontSize: 15, fontWeight: '600' },
  sub: { color: 'rgba(255,255,255,0.5)', fontSize: 12.5, marginTop: 2 },
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  skelFace: { width: 46, height: 46, backgroundColor: 'rgba(255,255,255,0.07)' },
  skelLine: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.08)' },
});

export default MessagePickerSheet;
