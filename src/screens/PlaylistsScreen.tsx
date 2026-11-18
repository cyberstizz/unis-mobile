// src/screens/PlaylistsScreen.tsx
// ─────────────────────────────────────────────────────────────
// The playlist library — mobile port of web src/playlistManager.jsx (opened
// from the sidebar's Playlists entry). Tabs:
//   My Playlists · Following · Discover · Community · Official
// with the same one-line hint per tab, search across public playlists,
// "Create New Playlist" (name, cover, Private/Unlisted/Public) and
// "Create Community Playlist for <your jurisdiction>". Tapping a card opens
// the full playlist screen.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Award, EyeOff, Globe, ImageIcon, Info, Lock, Music, Plus, Search, Users, X } from 'lucide-react-native';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import { useFeedback, errorMessage } from '../context/FeedbackContext';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { useUnisTheme } from '../theme/unisTheme';

const TABS = [
  { key: 'mine', label: 'My Playlists', Icon: Music },
  { key: 'following', label: 'Following', Icon: Users },
  { key: 'discover', label: 'Discover', Icon: Search },
  { key: 'community', label: 'Community', Icon: Globe },
  { key: 'official', label: 'Official', Icon: Award },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const TAB_HINTS: Record<TabKey, string> = {
  mine: 'Your personal song collections. Create playlists for any mood or occasion — only you can see them unless you make them public.',
  following: "Playlists you've followed from other users. Browse Community or Official playlists and hit Follow to save them here.",
  community: 'Playlists created by and for your neighborhood. Anyone can suggest songs — the community votes on what stays.',
  official: 'Curated by Unis from award winners and staff picks. Follow them to stay in the loop with the best of your area.',
  discover: 'Public playlists from users across the platform. Find new music and follow playlists you love.',
};

type Visibility = 'private' | 'unlisted' | 'public';
type Cover = { uri: string; name: string; type: string } | null;

const pickImage = async (onError: (m: string) => void): Promise<Cover> => {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [1, 1] });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  if (a.fileSize && a.fileSize > 5 * 1024 * 1024) {
    onError('Cover images must be under 5 MB. Pick a smaller one.');
    return null;
  }
  const ext = (a.uri.split('.').pop() || 'jpg').toLowerCase();
  return { uri: a.uri, name: a.fileName || `cover.${ext}`, type: a.mimeType || `image/${ext === 'png' ? 'png' : 'jpeg'}` };
};

const uploadCover = async (cover: Cover): Promise<string | null> => {
  if (!cover) return null;
  const fd = new FormData();
  fd.append('cover', cover as any);
  const res = await axiosInstance.post('/v1/playlists/cover', fd);
  return res.data.coverImageUrl;
};

const PlaylistsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const t = useUnisTheme();
  const feedback = useFeedback();
  const { playlists, followedPlaylists, loading, refreshPlaylists, loadFollowedPlaylists, createPlaylist } = usePlayer();

  const [activeTab, setActiveTab] = useState<TabKey>('mine');
  const [community, setCommunity] = useState<any[]>([]);
  const [official, setOfficial] = useState<any[]>([]);
  const [discover, setDiscover] = useState<any[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [dismissedHints, setDismissedHints] = useState<Record<string, boolean>>({});

  const [showCreatePersonal, setShowCreatePersonal] = useState(false);
  const [personalName, setPersonalName] = useState('');
  const [personalVisibility, setPersonalVisibility] = useState<Visibility>('private');
  const [personalCover, setPersonalCover] = useState<Cover>(null);
  const [creatingPersonal, setCreatingPersonal] = useState(false);

  const [showCreateCommunity, setShowCreateCommunity] = useState(false);
  const [communityName, setCommunityName] = useState('');
  const [communityDesc, setCommunityDesc] = useState('');
  const [communityCover, setCommunityCover] = useState<Cover>(null);
  const [creatingCommunity, setCreatingCommunity] = useState(false);

  const jurisdictionId = user?.jurisdiction?.jurisdictionId || null;
  const jurisdictionName = user?.jurisdiction?.name || null;

  const loadCommunity = useCallback(async () => {
    if (!jurisdictionId) return;
    try {
      const res = await axiosInstance.get(`/v1/playlists/community/${jurisdictionId}`);
      setCommunity(res.data || []);
    } catch (error) {
      console.error('Failed to load community playlists:', error);
      setCommunity([]);
    }
  }, [jurisdictionId]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      setTabLoading(true);
      try {
        if (activeTab === 'community') await loadCommunity();
        else if (activeTab === 'official') {
          const res = await axiosInstance.get('/v1/playlists/official').catch(() => ({ data: [] }));
          if (alive) setOfficial(res.data || []);
        } else if (activeTab === 'following') await loadFollowedPlaylists();
        else if (activeTab === 'discover') {
          const res = await axiosInstance.get('/v1/playlists/discover').catch(() => ({ data: [] }));
          if (alive) setDiscover(res.data || []);
        } else await refreshPlaylists();
      } finally {
        if (alive) setTabLoading(false);
      }
    };
    run();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, jurisdictionId]);

  // Debounced search.
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) { setSearchResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await axiosInstance.get(`/v1/playlists/search?q=${encodeURIComponent(q)}`);
        setSearchResults(res.data || []);
      } catch (error) {
        console.error('Search failed:', error);
        setSearchResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleCreatePersonal = async () => {
    const name = personalName.trim();
    if (!name) return;
    setCreatingPersonal(true);
    try {
      const coverUrl = await uploadCover(personalCover);
      await createPlaylist(name, 'personal', { visibility: personalVisibility, coverImageUrl: coverUrl });
      setPersonalName('');
      setPersonalVisibility('private');
      setPersonalCover(null);
      setShowCreatePersonal(false);
      feedback.success(`Playlist “${name}” created`);
    } catch (error) {
      console.error('Failed to create playlist:', error);
      feedback.error(errorMessage(error, "Couldn't create the playlist. Try again."));
    } finally {
      setCreatingPersonal(false);
    }
  };

  const handleCreateCommunity = async () => {
    const name = communityName.trim();
    if (!name) return;
    if (!jurisdictionId) {
      feedback.error('We need your home jurisdiction to start a community playlist. Refresh and try again.');
      return;
    }
    setCreatingCommunity(true);
    try {
      const coverUrl = await uploadCover(communityCover);
      await createPlaylist(name, 'community', {
        visibility: 'public',
        description: communityDesc.trim() || null,
        jurisdictionId,
        coverImageUrl: coverUrl,
      });
      setCommunityName('');
      setCommunityDesc('');
      setCommunityCover(null);
      setShowCreateCommunity(false);
      feedback.success(`Community playlist “${name}” is live`);
      await loadCommunity();
      await refreshPlaylists();
    } catch (error) {
      console.error('Failed to create community playlist:', error);
      feedback.error(errorMessage(error, "Couldn't create the community playlist. Try again."));
    } finally {
      setCreatingCommunity(false);
    }
  };

  const activeList = (() => {
    if (isSearching && searchQuery.trim()) return searchResults;
    switch (activeTab) {
      case 'mine': return playlists;
      case 'following': return followedPlaylists;
      case 'community': return community;
      case 'official': return official;
      case 'discover': return discover;
      default: return [];
    }
  })();

  const emptyMessage = (() => {
    if (isSearching) return 'No playlists found';
    switch (activeTab) {
      case 'mine': return 'No playlists yet. Use the button above to create your first one!';
      case 'following': return "You're not following any playlists yet. Browse Community or Official playlists and hit Follow!";
      case 'community': return 'No community playlists in your area yet. Be the first to create one!';
      case 'official': return 'Official playlists coming soon.';
      case 'discover': return 'No public playlists found yet.';
      default: return 'No playlists found';
    }
  })();

  const Cover: React.FC<{ pl: any }> = ({ pl }) => {
    if (pl.coverImageUrl) return <Image source={{ uri: buildUrl(pl.coverImageUrl) || undefined }} style={StyleSheet.absoluteFill} />;
    const arts: string[] = pl.firstFourArtworks || [];
    if (arts.length >= 4) {
      return (
        <View style={styles.mosaic}>
          {arts.slice(0, 4).map((u, i) => <Image key={i} source={{ uri: buildUrl(u) || undefined }} style={styles.mosaicCell} />)}
        </View>
      );
    }
    if (arts.length > 0) return <Image source={{ uri: buildUrl(arts[0]) || undefined }} style={StyleSheet.absoluteFill} />;
    return <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: t.soft }]}><Music size={30} color="#fff" /></View>;
  };

  const badge = (pl: any) => {
    if (pl.type === 'community') return <Text style={[styles.badge, { backgroundColor: 'rgba(167,139,250,0.2)', color: '#c4b5fd' }]}>Community</Text>;
    if (pl.type === 'official') return <Text style={[styles.badge, { backgroundColor: 'rgba(196,154,10,0.2)', color: '#f5d77a' }]}>Official</Text>;
    if (pl.visibility === 'public') return <Text style={[styles.badge, { backgroundColor: 'rgba(74,222,128,0.15)', color: '#86efac' }]}>Public</Text>;
    return null;
  };

  const VisPills: React.FC<{ value: Visibility; onChange: (v: Visibility) => void }> = ({ value, onChange }) => (
    <View style={styles.visRow}>
      {(['private', 'unlisted', 'public'] as Visibility[]).map((v) => {
        const on = value === v;
        const Icon = v === 'private' ? Lock : v === 'unlisted' ? EyeOff : Globe;
        return (
          <Pressable key={v} onPress={() => onChange(v)} style={[styles.visPill, on && { backgroundColor: t.soft, borderColor: t.border }]} accessibilityState={{ selected: on }}>
            <Icon size={12} color="#fff" />
            <Text style={styles.visText}>{v[0].toUpperCase() + v.slice(1)}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const CoverPicker: React.FC<{ value: Cover; onChange: (c: Cover) => void }> = ({ value, onChange }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable style={styles.coverBtn} onPress={async () => { const c = await pickImage((m) => feedback.error(m)); if (c) onChange(c); }}>
        {value ? <Image source={{ uri: value.uri }} style={styles.coverPreview} /> : (<><ImageIcon size={18} color="rgba(255,255,255,0.6)" /><Text style={styles.hintText}>Add cover image</Text></>)}
      </Pressable>
      {value && (
        <Pressable onPress={() => onChange(null)} style={styles.coverClear} accessibilityLabel="Remove cover"><X size={14} color="#fff" /></Pressable>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1} accessibilityRole="header">Playlists</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
          {TABS.map(({ key, label, Icon }) => {
            const on = activeTab === key;
            return (
              <Pressable
                key={key}
                onPress={() => { setActiveTab(key); setIsSearching(false); setSearchQuery(''); }}
                style={[styles.tab, on && { backgroundColor: t.soft, borderColor: t.border }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Icon size={15} color={on ? '#fff' : 'rgba(255,255,255,0.6)'} />
                <Text style={[styles.tabText, on && { color: '#fff' }]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {!dismissedHints[activeTab] && (
          <View style={[styles.hint, { borderColor: t.border, backgroundColor: t.subtle }]}>
            <Info size={14} color={t.textAccent} />
            <Text style={[styles.hintText, { flex: 1 }]}>{TAB_HINTS[activeTab]}</Text>
            <Pressable onPress={() => setDismissedHints((p) => ({ ...p, [activeTab]: true }))} hitSlop={8} accessibilityLabel="Dismiss tip"><X size={14} color="rgba(255,255,255,0.6)" /></Pressable>
          </View>
        )}

        <View style={styles.search}>
          <Search size={16} color="rgba(255,255,255,0.5)" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search playlists..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {!!searchQuery && (
            <Pressable onPress={() => { setSearchQuery(''); setSearchResults([]); setIsSearching(false); }} hitSlop={8}><X size={15} color="rgba(255,255,255,0.6)" /></Pressable>
          )}
        </View>

        {activeTab === 'mine' && !isSearching && (
          showCreatePersonal ? (
            <View style={styles.form}>
              <TextInput value={personalName} onChangeText={setPersonalName} placeholder="Playlist name (e.g. Late Night Vibes)" placeholderTextColor="rgba(255,255,255,0.35)" style={styles.input} autoFocus maxLength={100} />
              <CoverPicker value={personalCover} onChange={setPersonalCover} />
              <VisPills value={personalVisibility} onChange={setPersonalVisibility} />
              <View style={styles.formActions}>
                <Pressable onPress={() => { setShowCreatePersonal(false); setPersonalName(''); setPersonalCover(null); setPersonalVisibility('private'); }} style={styles.ghost}><Text style={styles.ghostText}>Cancel</Text></Pressable>
                <Pressable onPress={handleCreatePersonal} disabled={!personalName.trim() || creatingPersonal} style={[styles.primary, { backgroundColor: t.primary }, (!personalName.trim() || creatingPersonal) && { opacity: 0.5 }]}>
                  <Text style={styles.primaryText}>{creatingPersonal ? 'Creating...' : 'Create'}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable style={styles.createBtn} onPress={() => setShowCreatePersonal(true)}>
              <Plus size={18} color="#fff" />
              <Text style={styles.createText}>Create New Playlist</Text>
            </Pressable>
          )
        )}

        {activeTab === 'community' && !isSearching && (
          showCreateCommunity ? (
            <View style={styles.form}>
              <TextInput value={communityName} onChangeText={setCommunityName} placeholder="Playlist name (e.g. Harlem After Dark)" placeholderTextColor="rgba(255,255,255,0.35)" style={styles.input} autoFocus maxLength={100} />
              <TextInput value={communityDesc} onChangeText={setCommunityDesc} placeholder="Description (optional)" placeholderTextColor="rgba(255,255,255,0.35)" style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} multiline maxLength={500} />
              <CoverPicker value={communityCover} onChange={setCommunityCover} />
              <View style={styles.formActions}>
                <Pressable onPress={() => { setShowCreateCommunity(false); setCommunityName(''); setCommunityDesc(''); setCommunityCover(null); }} style={styles.ghost}><Text style={styles.ghostText}>Cancel</Text></Pressable>
                <Pressable onPress={handleCreateCommunity} disabled={!communityName.trim() || creatingCommunity} style={[styles.primary, { backgroundColor: t.primary }, (!communityName.trim() || creatingCommunity) && { opacity: 0.5 }]}>
                  <Text style={styles.primaryText}>{creatingCommunity ? 'Creating...' : 'Create'}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable style={styles.createBtn} onPress={() => setShowCreateCommunity(true)}>
              <Plus size={18} color="#fff" />
              <Text style={styles.createText}>Create Community Playlist{jurisdictionName ? ` for ${jurisdictionName}` : ''}</Text>
            </Pressable>
          )
        )}

        {(tabLoading || (activeTab === 'mine' && loading)) && activeList.length === 0 ? (
          <View style={styles.empty}><ActivityIndicator color="#fff" /></View>
        ) : activeList.length === 0 ? (
          <View style={styles.empty}><Text style={styles.emptyText}>{emptyMessage}</Text></View>
        ) : (
          <View style={styles.grid}>
            {activeList.map((pl: any) => (
              <Pressable
                key={pl.playlistId || pl.id}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                onPress={() => navigation.navigate('Home', { screen: 'Playlist', params: { playlistId: pl.playlistId || pl.id } })}
              >
                <View style={styles.cardArt}><Cover pl={pl} /></View>
                <Text style={styles.cardName} numberOfLines={1}>{pl.name}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {pl.songCount || pl.tracks?.length || 0} songs
                  {pl.followerCount > 0 ? ` · ${pl.followerCount} follower${pl.followerCount !== 1 ? 's' : ''}` : ''}
                  {pl.creatorName && activeTab !== 'mine' ? ` · by ${pl.creatorName}` : ''}
                </Text>
                {badge(pl)}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07090f' },
  h1: { color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -0.6 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  tabText: { color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: 13.5 },
  hint: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  hintText: { color: 'rgba(255,255,255,0.65)', fontSize: 12.5, lineHeight: 18 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 12 },
  searchInput: { flex: 1, color: '#fff', fontSize: 15 },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.22)', marginBottom: 14 },
  createText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  form: { gap: 10, padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', marginBottom: 14 },
  input: { color: '#fff', fontSize: 15, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  coverBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.18)', minHeight: 46 },
  coverPreview: { width: 56, height: 56, borderRadius: 8 },
  coverClear: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  visRow: { flexDirection: 'row', gap: 8 },
  visPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  visText: { color: '#fff', fontSize: 12.5, fontWeight: '600' },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  ghost: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  ghostText: { color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  primary: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999 },
  primaryText: { color: '#fff', fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyText: { color: 'rgba(255,255,255,0.55)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { width: '47%', flexGrow: 1, maxWidth: '48.5%' },
  cardArt: { aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' },
  mosaic: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', height: '100%' },
  mosaicCell: { width: '50%', height: '50%' },
  cardName: { color: '#fff', fontSize: 14.5, fontWeight: '700', marginTop: 8 },
  cardMeta: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  badge: { alignSelf: 'flex-start', fontSize: 10.5, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', marginTop: 5 },
});

export default PlaylistsScreen;
