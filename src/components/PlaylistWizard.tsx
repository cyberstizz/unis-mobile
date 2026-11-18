// src/components/PlaylistWizard.tsx
// Mobile port of web src/playlistWizard.jsx — "Add to…" for one song:
//   Queue:    Play Next / Play Later (the player confirms with a toast)
//   Playlist: add to a personal playlist, or SUGGEST to a community one
//   Create:   name + optional cover + visibility (private/unlisted/public)
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { EyeOff, Globe, ImageIcon, ListEnd, Lock, Plus, SkipForward, Users, X } from 'lucide-react-native';
import Sheet from './ui/Sheet';
import { usePlayer } from '../context/PlayerContext';
import { useFeedback, errorMessage } from '../context/FeedbackContext';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { useUnisTheme } from '../theme/unisTheme';

interface Props {
  open: boolean;
  onClose: () => void;
  selectedTrack: any;
}

type Visibility = 'private' | 'unlisted' | 'public';

const PlaylistWizard: React.FC<Props> = ({ open, onClose, selectedTrack }) => {
  const { playlists, createPlaylist, addToPlaylist, playNext, playLater, suggestSong, loading } = usePlayer();
  const feedback = useFeedback();
  const t = useUnisTheme();

  const [newName, setNewName] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [cover, setCover] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (!open || !selectedTrack) return null;

  const reset = () => {
    setNewName('');
    setVisibility('private');
    setCover(null);
    setShowCreate(false);
  };

  const pickCover = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (a.fileSize && a.fileSize > 5 * 1024 * 1024) {
      feedback.error('Cover images must be under 5 MB. Pick a smaller one.');
      return;
    }
    const ext = (a.uri.split('.').pop() || 'jpg').toLowerCase();
    setCover({ uri: a.uri, name: a.fileName || `cover.${ext}`, type: a.mimeType || `image/${ext === 'png' ? 'png' : 'jpeg'}` });
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      let coverUrl: string | null = null;
      if (cover) {
        const fd = new FormData();
        fd.append('cover', cover as any);
        const res = await axiosInstance.post('/v1/playlists/cover', fd);
        coverUrl = res.data.coverImageUrl;
      }
      await createPlaylist(name, 'personal', { visibility, coverImageUrl: coverUrl });
      reset();
      feedback.success(`Playlist “${name}” created — tap it to add this song`);
    } catch (error) {
      console.error('Failed to create playlist:', error);
      feedback.error(errorMessage(error, "Couldn't create the playlist. Try again."));
    } finally {
      setCreating(false);
    }
  };

  const handleAdd = async (pl: any) => {
    const songId = selectedTrack?.songId || selectedTrack?.id;
    if (!songId) {
      feedback.error("Couldn't find that song. Close this and try again.");
      return;
    }
    const playlistId = pl.id || pl.playlistId;
    setAddingTo(playlistId);
    const songName = selectedTrack.title ? `“${selectedTrack.title}”` : 'Song';
    const listName = `“${pl.name || 'your playlist'}”`;
    try {
      if (pl.type === 'community') {
        await suggestSong(playlistId, songId);
        feedback.success(`Suggested ${songName} to ${listName} — the community votes next`);
      } else {
        await addToPlaylist(playlistId, selectedTrack);
        feedback.success(`Added ${songName} to ${listName}`);
      }
      onClose();
    } catch (error: any) {
      const data = error?.response?.data;
      const msg = typeof data === 'string' ? data : data?.message || data?.error || '';
      if (msg.includes('already in or suggested')) feedback.info(`${songName} is already in or suggested for ${listName}`);
      else if (msg.includes('already in')) feedback.info(`${songName} is already in ${listName}`);
      else feedback.error(errorMessage(error, `Couldn't add ${songName} to ${listName}. Try again.`));
    } finally {
      setAddingTo(null);
    }
  };

  const typeIcon = (pl: any) => {
    if (pl.type === 'community') return <Users size={14} color="#a78bfa" />;
    if (pl.visibility === 'public') return <Globe size={14} color="#4ade80" />;
    if (pl.visibility === 'unlisted') return <EyeOff size={14} color="#fbbf24" />;
    return <Lock size={14} color="rgba(255,255,255,0.5)" />;
  };

  const art = buildUrl(selectedTrack?.artworkUrl) || buildUrl(selectedTrack?.artwork);

  return (
    <Sheet visible={open} onClose={onClose} title="Add to…" fullHeight>
      <View style={styles.track}>
        {art ? <Image source={{ uri: art }} style={styles.art} /> : <View style={[styles.art, { backgroundColor: t.soft }]} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.trackTitle} numberOfLines={1}>{selectedTrack?.title || 'Unknown'}</Text>
          <Text style={styles.trackArtist} numberOfLines={1}>{selectedTrack?.artist || selectedTrack?.artistName || 'Unknown Artist'}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Queue</Text>
        <View style={styles.queueRow}>
          <Pressable style={({ pressed }) => [styles.queueBtn, pressed && styles.pressed]} onPress={() => { playNext(selectedTrack); onClose(); }}>
            <SkipForward size={16} color={t.primary2} />
            <View style={{ flex: 1 }}>
              <Text style={styles.queueTitle}>Play Next</Text>
              <Text style={styles.queueHint}>After the current track</Text>
            </View>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.queueBtn, pressed && styles.pressed]} onPress={() => { playLater(selectedTrack); onClose(); }}>
            <ListEnd size={16} color={t.primary2} />
            <View style={{ flex: 1 }}>
              <Text style={styles.queueTitle}>Play Later</Text>
              <Text style={styles.queueHint}>At the end of your queue</Text>
            </View>
          </Pressable>
        </View>

        <Text style={[styles.label, { marginTop: 18 }]}>Save to Playlist</Text>
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={t.primary2} /><Text style={styles.queueHint}>Loading playlists...</Text></View>
        ) : (
          <>
            {showCreate && (
              <View style={styles.createForm}>
                <TextInput
                  placeholder="Playlist name"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                  maxLength={100}
                  style={styles.input}
                  returnKeyType="done"
                  onSubmitEditing={() => !creating && handleCreate()}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable style={styles.coverBtn} onPress={pickCover}>
                    {cover ? (
                      <Image source={{ uri: cover.uri }} style={styles.coverPreview} />
                    ) : (
                      <>
                        <ImageIcon size={18} color="rgba(255,255,255,0.6)" />
                        <Text style={styles.queueHint}>Add cover image</Text>
                      </>
                    )}
                  </Pressable>
                  {cover && (
                    <Pressable onPress={() => setCover(null)} style={styles.coverClear} accessibilityLabel="Remove cover">
                      <X size={14} color="#fff" />
                    </Pressable>
                  )}
                </View>
                <View style={styles.visRow}>
                  {(['private', 'unlisted', 'public'] as Visibility[]).map((v) => {
                    const active = visibility === v;
                    const Icon = v === 'private' ? Lock : v === 'unlisted' ? EyeOff : Globe;
                    return (
                      <Pressable
                        key={v}
                        onPress={() => setVisibility(v)}
                        accessibilityState={{ selected: active }}
                        style={[styles.visPill, active && { backgroundColor: t.soft, borderColor: t.border }]}
                      >
                        <Icon size={12} color={active ? '#fff' : 'rgba(255,255,255,0.6)'} />
                        <Text style={[styles.visText, active && { color: '#fff' }]}>{v[0].toUpperCase() + v.slice(1)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.createActions}>
                  <Pressable onPress={reset} style={styles.ghostBtn}><Text style={styles.ghostText}>Cancel</Text></Pressable>
                  <Pressable
                    onPress={handleCreate}
                    disabled={!newName.trim() || creating}
                    style={[styles.primaryBtn, { backgroundColor: t.primary }, (!newName.trim() || creating) && { opacity: 0.5 }]}
                  >
                    <Text style={styles.primaryText}>{creating ? 'Creating...' : 'Create'}</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {playlists.length === 0 && !showCreate ? (
              <Text style={styles.empty}>No playlists yet. Create one below!</Text>
            ) : (
              playlists.map((pl) => {
                const id = pl.id || pl.playlistId;
                const busy = addingTo === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => handleAdd(pl)}
                    disabled={busy}
                    style={({ pressed }) => [styles.plItem, pl.type === 'community' && styles.plCommunity, pressed && styles.pressed]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      {typeIcon(pl)}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.plName} numberOfLines={1}>{pl.name}</Text>
                        <Text style={styles.plCount}>
                          {pl.songCount || pl.tracks?.length || 0} songs{pl.type === 'community' ? ' · Community' : ''}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.plAction, { color: t.primary2 }]}>{busy ? '...' : pl.type === 'community' ? 'Suggest' : 'Add'}</Text>
                  </Pressable>
                );
              })
            )}

            {!showCreate && (
              <Pressable style={({ pressed }) => [styles.createBtn, pressed && styles.pressed]} onPress={() => setShowCreate(true)}>
                <Plus size={18} color="#fff" />
                <Text style={styles.createText}>Create New Playlist</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  track: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)', marginBottom: 14 },
  art: { width: 48, height: 48, borderRadius: 8 },
  trackTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  trackArtist: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 2 },
  label: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  queueRow: { flexDirection: 'row', gap: 10 },
  queueBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  queueTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  queueHint: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  loading: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12 },
  createForm: { gap: 10, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)', marginBottom: 10 },
  input: { color: '#fff', fontSize: 15, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  coverBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.18)', minHeight: 46 },
  coverPreview: { width: 56, height: 56, borderRadius: 8 },
  coverClear: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  visRow: { flexDirection: 'row', gap: 8 },
  visPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  visText: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, fontWeight: '600' },
  createActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  ghostBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  ghostText: { color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  primaryBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999 },
  primaryText: { color: '#fff', fontWeight: '700' },
  empty: { color: 'rgba(255,255,255,0.5)', fontSize: 13, paddingVertical: 10 },
  plItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)', marginBottom: 6 },
  plCommunity: { borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)' },
  plName: { color: '#fff', fontSize: 14.5, fontWeight: '600' },
  plCount: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 1 },
  plAction: { fontSize: 13, fontWeight: '700' },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.2)', marginTop: 6 },
  createText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});

export default PlaylistWizard;
