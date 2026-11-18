// src/components/SearchOverlay.tsx
// ─────────────────────────────────────────────────────────────
// Full-screen search — mobile port of web src/components/SearchBar.jsx (the
// phone overlay the header's search button opens).
//
//   • Zero state: Recent (last 5, stored on the device) + Trending
//   • Typing (2+ chars, debounced 250ms): /v1/search/suggestions —
//     top result, then artists, songs, jurisdictions, with the match bolded
//   • Search key → Discover with the query (web's /discover?q=)
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import Svg, { Circle, Path } from 'react-native-svg';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { useUnisTheme } from '../theme/unisTheme';
import { SearchIcon, ArrowBackIcon, CloseIcon } from '../icons/UnisIcons';

const RECENT_KEY = 'unis_recent_searches';

type Item = { id: string; name: string; type: string; subtitle?: string; artworkUrl?: string | null };

const Placeholder: React.FC<{ type: string }> = ({ type }) => {
  const c = 'rgba(255,255,255,0.55)';
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      {type === 'artist' && (<><Circle cx={10} cy={7} r={4} stroke={c} strokeWidth={1.5} /><Path d="M3 18c0-3.87 3.13-7 7-7s7 3.13 7 7" stroke={c} strokeWidth={1.5} strokeLinecap="round" /></>)}
      {type === 'song' && (<><Path d="M8 16V4l9-2v12" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /><Circle cx={5.5} cy={16} r={2.5} stroke={c} strokeWidth={1.5} /><Circle cx={14.5} cy={14} r={2.5} stroke={c} strokeWidth={1.5} /></>)}
      {type === 'jurisdiction' && (<><Path d="M10 2C6.69 2 4 4.69 4 8c0 4.5 6 10 6 10s6-5.5 6-10c0-3.31-2.69-6-6-6z" stroke={c} strokeWidth={1.5} /><Circle cx={10} cy={8} r={2} stroke={c} strokeWidth={1.5} /></>)}
    </Svg>
  );
};

const BADGE: Record<string, { bg: string; fg: string }> = {
  artist: { bg: 'rgba(167,139,250,0.18)', fg: '#c4b5fd' },
  song: { bg: 'rgba(96,165,250,0.18)', fg: '#93c5fd' },
  jurisdiction: { bg: 'rgba(74,222,128,0.15)', fg: '#86efac' },
};

const SearchOverlay: React.FC<{ visible: boolean; onClose: () => void; onNavigate: (screen: string, params: any) => void }> = ({ visible, onClose, onNavigate }) => {
  const t = useUnisTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [suggestions, setSuggestions] = useState<any>(null);
  const [trending, setTrending] = useState<Item[]>([]);
  const [recent, setRecent] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!visible) return;
    setTimeout(() => inputRef.current?.focus(), 150);
    SecureStore.getItemAsync(RECENT_KEY)
      .then((raw) => setRecent(raw ? JSON.parse(raw).slice(0, 5) : []))
      .catch(() => setRecent([]));
    if (trending.length === 0) {
      axiosInstance.get('/v1/search/trending?limit=5').then((r) => setTrending(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (debounced.length < 2) { setSuggestions(null); return; }
    let active = true;
    setLoading(true);
    axiosInstance.get(`/v1/search/suggestions?q=${encodeURIComponent(debounced)}&limit=10`)
      .then((r) => { if (active) setSuggestions(r.data); })
      .catch(() => { if (active) setSuggestions(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [debounced]);

  const saveRecent = useCallback(async (item: Item) => {
    const updated = [{ id: item.id, name: item.name, type: item.type, artworkUrl: item.artworkUrl }, ...recent.filter((s) => s.id !== item.id)].slice(0, 5);
    setRecent(updated);
    SecureStore.setItemAsync(RECENT_KEY, JSON.stringify(updated)).catch(() => {});
  }, [recent]);

  const removeRecent = (id: string) => {
    const updated = recent.filter((s) => s.id !== id);
    setRecent(updated);
    SecureStore.setItemAsync(RECENT_KEY, JSON.stringify(updated)).catch(() => {});
  };
  const clearRecent = () => {
    setRecent([]);
    SecureStore.deleteItemAsync(RECENT_KEY).catch(() => {});
  };

  const close = () => {
    setQuery('');
    setSuggestions(null);
    onClose();
  };

  const select = (item: Item) => {
    saveRecent(item);
    close();
    if (item.type === 'artist') onNavigate('Artist', { artistId: item.id });
    else if (item.type === 'song') onNavigate('Song', { songId: item.id });
    else if (item.type === 'jurisdiction') onNavigate('Jurisdiction', { jurisdictionId: item.id, jurisdictionName: item.name });
  };

  const fullSearch = () => {
    const q = query.trim();
    if (!q) return;
    close();
    onNavigate('Discover', { q });
  };

  const highlight = (text: string) => {
    if (query.length < 2) return <Text>{text}</Text>;
    const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = String(text || '').split(new RegExp(`(${esc})`, 'gi'));
    return parts.map((p, i) => (p.toLowerCase() === query.toLowerCase()
      ? <Text key={i} style={{ color: t.textAccent, fontWeight: '900' }}>{p}</Text>
      : <Text key={i}>{p}</Text>));
  };

  const flat: { item: Item; top: boolean }[] = [];
  if (suggestions) {
    const top = suggestions.topResult;
    if (top) flat.push({ item: top, top: true });
    ['artists', 'songs', 'jurisdictions'].forEach((k) => (suggestions[k] || []).forEach((x: Item) => { if (!top || x.id !== top.id) flat.push({ item: x, top: false }); }));
  }

  const Row: React.FC<{ item: Item; top?: boolean; onRemove?: () => void }> = ({ item, top, onRemove }) => {
    const art = buildUrl(item.artworkUrl || undefined);
    const size = top ? 56 : 44;
    const badge = BADGE[item.type] || BADGE.song;
    return (
      <Pressable style={({ pressed }) => [styles.row, top && styles.rowTop, pressed && { backgroundColor: 'rgba(255,255,255,0.06)' }]} onPress={() => select(item)}>
        <View style={[styles.art, { width: size, height: size, borderRadius: item.type === 'artist' ? size / 2 : 10 }]}>
          {art ? <Image source={{ uri: art }} style={StyleSheet.absoluteFill} /> : <Placeholder type={item.type} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, top && { fontSize: 17 }]} numberOfLines={1}>{highlight(item.name)}</Text>
          {!!item.subtitle && <Text style={styles.subtitle} numberOfLines={1}>{item.subtitle}</Text>}
        </View>
        {onRemove ? (
          <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel="Remove"><CloseIcon size={16} /></Pressable>
        ) : (
          <Text style={[styles.badge, { backgroundColor: badge.bg, color: badge.fg }]}>{item.type}</Text>
        )}
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
        <View style={styles.bar}>
          <Pressable onPress={close} style={styles.back} accessibilityLabel="Close search" hitSlop={6}><ArrowBackIcon size={20} /></Pressable>
          <View style={[styles.inputWrap, { borderColor: t.border }]}>
            <SearchIcon size={16} active />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="Search artists, songs, jurisdictions..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={styles.input}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={fullSearch}
            />
            {loading && <ActivityIndicator size="small" color="#fff" />}
            {query.length > 0 && !loading && (
              <Pressable onPress={() => { setQuery(''); setSuggestions(null); inputRef.current?.focus(); }} hitSlop={8} accessibilityLabel="Clear search"><CloseIcon size={16} /></Pressable>
            )}
          </View>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          {query.length < 2 ? (
            <>
              {recent.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionTitle}>Recent</Text>
                    <Pressable onPress={clearRecent} hitSlop={6}><Text style={[styles.action, { color: t.textAccent }]}>Clear</Text></Pressable>
                  </View>
                  {recent.map((item) => <Row key={`r-${item.id}`} item={item} onRemove={() => removeRecent(item.id)} />)}
                </View>
              )}
              {trending.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Trending</Text></View>
                  {trending.map((item) => <Row key={`t-${item.id}`} item={{ ...item, type: item.type || 'song' }} />)}
                </View>
              )}
            </>
          ) : suggestions && suggestions.totalCount > 0 ? (
            <View style={styles.section}>
              {flat.map(({ item, top }) => <Row key={`${item.type}-${item.id}`} item={item} top={top} />)}
              <Pressable style={styles.all} onPress={fullSearch}>
                <Text style={[styles.action, { color: t.textAccent }]}>See all results for “{query}”</Text>
              </Pressable>
            </View>
          ) : suggestions ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No results for “{query}”</Text>
              <Text style={styles.subtitle}>Try a different spelling or a shorter search.</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07090f' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 44, borderRadius: 22, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  input: { flex: 1, color: '#fff', fontSize: 15.5 },
  section: { paddingHorizontal: 8, marginTop: 8 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8 },
  sectionTitle: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  action: { fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 12 },
  rowTop: { backgroundColor: 'rgba(255,255,255,0.04)', marginBottom: 6 },
  art: { backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  name: { color: '#fff', fontSize: 15, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginTop: 2 },
  badge: { fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  all: { alignItems: 'center', paddingVertical: 14 },
  empty: { alignItems: 'center', paddingTop: 50, gap: 6 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

export default SearchOverlay;
