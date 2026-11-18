// src/screens/PlaylistScreen.tsx
// ─────────────────────────────────────────────────────────────
// The playlist page — mobile port of web src/playlistPage.jsx (/playlist/:id).
//
// How it relates to the queue (same rules as web):
//   • Play (and tapping any row) POURS the playlist into the queue — never
//     replaces it. With songs already queued, the PlayChoiceModal asks
//     "Play now" or "Add to queue".
//   • Once it's playing, Play becomes pause/resume and tapping a row jumps to
//     that song inside the copy already queued — no re-prompt, no duplicates.
//   • Editing this screen (reorder, remove) changes the saved playlist; editing
//     the queue never touches the playlist.
// Owner: edit details, change cover, delete, reorder (row menu → move),
// remove (with confirm). Community: Songs · Suggestions (vote) · Activity.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import {
  ArrowDown, ArrowUp, Check, Disc3, EyeOff, Globe, Heart, ImagePlus, Link2, ListMusic, ListPlus, Lock, MapPin,
  MoreHorizontal, Music, Pause, Pencil, Play, Shuffle, ThumbsDown, ThumbsUp, Trash2, UserRound, X,
} from 'lucide-react-native';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import { useFeedback, errorMessage } from '../context/FeedbackContext';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { webUrl } from '../config/links';
import { useUnisTheme, mix } from '../theme/unisTheme';
import AdSlot from '../components/AdSlot';
import Sheet from '../components/ui/Sheet';

const toSeconds = (d: any) => {
  let sec = Number(d);
  if (!d || isNaN(sec)) return 0;
  if (sec > 3600) sec /= 1000;
  return sec;
};
const formatTrackTime = (d: any) => {
  const sec = toSeconds(d);
  if (!sec) return '';
  return `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`;
};
const formatTotal = (tracks: any[]) => {
  const total = Math.round(tracks.reduce((sum, t) => sum + toSeconds(t.duration), 0));
  if (!total) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} hr ${m} min`;
  if (m > 0) return s ? `${m} min ${s} sec` : `${m} min`;
  return `${s} sec`;
};
const formatAdded = (dateStr?: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 28) {
    const w = Math.floor(days / 7);
    return `${w} week${w > 1 ? 's' : ''} ago`;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const formatTimeAgo = (dateStr?: string) => {
  if (!dateStr) return '';
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};
const normalizeTrack = (track: any) => ({
  ...track,
  id: track.songId || track.id,
  songId: track.songId || track.id,
  playlistItemId: track.playlistItemId,
  title: track.title || 'Untitled',
  artist: track.artistName || track.artist || 'Unknown Artist',
  artistName: track.artistName || track.artist || 'Unknown Artist',
  artworkUrl: buildUrl(track.artworkUrl),
  artwork: buildUrl(track.artworkUrl),
  fileUrl: buildUrl(track.fileUrl),
  url: buildUrl(track.fileUrl),
  duration: track.duration || 0,
  upvotes: track.upvotes || 0,
  downvotes: track.downvotes || 0,
  status: track.status || 'active',
});

type Visibility = 'private' | 'unlisted' | 'public';

const PlaylistScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const playlistId: string = route.params?.playlistId;
  const { user } = useAuth();
  const t = useUnisTheme();
  const feedback = useFeedback();
  const {
    loadPlaylistDetails, requestPlayCollection, playQueueIndex, playLater, queue, currentMedia, isPlaying, togglePlayPause,
    removeFromPlaylist, reorderPlaylist, updatePlaylist, deletePlaylist, followPlaylist, unfollowPlaylist, voteOnSuggestion,
  } = usePlayer();

  const [playlist, setPlaylist] = useState<any>(null);
  const [tracks, setTracks] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [section, setSection] = useState<'tracks' | 'suggestions' | 'activity'>('tracks');
  const [activities, setActivities] = useState<any[]>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [coverError, setCoverError] = useState(false);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [rowMenu, setRowMenu] = useState<any>(null);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editVisibility, setEditVisibility] = useState<Visibility>('private');
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const showToast = useCallback((msg: string, kind: 'success' | 'error' | 'info' = 'success') => feedback[kind](msg), [feedback]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus('loading');
      setSection('tracks');
      setActivities([]);
      setActivityLoaded(false);
      setCoverError(false);
      setConfirmRemoveKey(null);
      const data = await loadPlaylistDetails(playlistId);
      if (cancelled) return;
      if (!data) { setStatus('unavailable'); return; }
      const all = (data.tracks || []).map(normalizeTrack);
      setPlaylist(data);
      setTracks(all.filter((x: any) => x.status === 'active'));
      setPending([]);
      setStatus('ready');
      if (data.type === 'community') {
        try {
          const res = await axiosInstance.get(`/v1/playlists/${data.playlistId || playlistId}/pending`);
          if (!cancelled) setPending((res.data || []).map(normalizeTrack));
        } catch (err) {
          console.error('Failed to load suggestions:', err);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]);

  const pid = playlist?.playlistId || playlist?.id || playlistId;
  const isOwner = !!(playlist?.isOwner ?? playlist?.owner);
  const isFollowing = !!(playlist?.isFollowing ?? playlist?.following);
  const isCommunity = playlist?.type === 'community';
  const isOfficial = playlist?.type === 'official';
  const canFollow = !!user && !isOwner && playlist?.visibility !== 'private';
  const coverUrl = playlist?.coverImageUrl && !coverError ? buildUrl(playlist.coverImageUrl) : null;

  const mosaic = useMemo(() => {
    const seen: string[] = [];
    for (const tr of tracks) {
      if (tr.artworkUrl && !seen.includes(tr.artworkUrl)) seen.push(tr.artworkUrl);
      if (seen.length === 4) break;
    }
    return seen;
  }, [tracks]);

  const heroImage = coverUrl || mosaic[0] || null;
  const playable = useMemo(() => tracks.filter((x) => x.url || x.fileUrl), [tracks]);
  const playlistRef = useMemo(() => ({ playlistId: pid, name: playlist?.name || 'Playlist', coverUrl: coverUrl || mosaic[0] || null }), [pid, playlist?.name, coverUrl, mosaic]);
  const playingFromHere = !!(currentMedia?.origin?.type === 'playlist' && currentMedia.origin.playlistId === pid);
  const currentItemId = playingFromHere ? currentMedia?.playlistItemId : null;
  const rowKey = (x: any) => x.playlistItemId || x.id;
  const totalLabel = formatTotal(tracks);

  // ── Playback ──
  const handleHeroPlay = () => {
    if (playingFromHere) { togglePlayPause(); return; }
    if (playable.length === 0) return;
    requestPlayCollection({ tracks: playable, playlist: playlistRef });
  };
  const handleShufflePlay = () => {
    if (playable.length === 0) return;
    requestPlayCollection({ tracks: playable, playlist: playlistRef, shuffle: true });
  };
  const handleRowPlay = (index: number) => {
    const track = tracks[index];
    if (!track) return;
    if (playingFromHere && currentItemId && currentItemId === track.playlistItemId) { togglePlayPause(); return; }
    if (playingFromHere && currentMedia?.origin) {
      const batch = currentMedia.origin.batchId;
      const qi = queue.findIndex((q) => q.origin?.batchId === batch && q.playlistItemId === track.playlistItemId);
      if (qi >= 0) { playQueueIndex(qi); return; }
    }
    const startIndex = playable.indexOf(track);
    if (startIndex < 0) { showToast('This song is unavailable right now', 'info'); return; }
    requestPlayCollection({ tracks: playable, playlist: playlistRef, startIndex });
  };
  const handleAddOneToQueue = (track: any) => {
    setRowMenu(null);
    playLater(track, {
      type: 'playlist',
      playlistId: pid,
      name: playlistRef.name,
      coverUrl: playlistRef.coverUrl,
      batchId: `single-${track.playlistItemId || track.id}-${Date.now()}`,
    });
  };

  // ── Owner: reorder / remove ──
  const moveRow = async (from: number, to: number) => {
    setRowMenu(null);
    if (to < 0 || to >= tracks.length || from === to) return;
    const before = tracks;
    const after = [...tracks];
    const [moved] = after.splice(from, 1);
    after.splice(to, 0, moved);
    setTracks(after);
    try {
      await reorderPlaylist(pid, after);
      showToast('Order saved');
    } catch {
      setTracks(before);
      showToast("Couldn't save the new order. Try again.", 'error');
    }
  };

  const confirmRemove = async (track: any) => {
    setConfirmRemoveKey(null);
    const before = tracks;
    setTracks((prev) => prev.filter((x) => rowKey(x) !== rowKey(track)));
    try {
      await removeFromPlaylist(pid, track.playlistItemId);
      setPlaylist((prev: any) => (prev ? { ...prev, songCount: Math.max(0, (prev.songCount || 1) - 1) } : prev));
      showToast(`Removed “${track.title}” from this playlist`);
    } catch {
      setTracks(before);
      showToast("Couldn't remove that song. Try again.", 'error');
    }
  };

  // ── Follow ──
  const handleFollow = async () => {
    const was = isFollowing;
    setPlaylist((prev: any) => ({ ...prev, isFollowing: !was, following: !was, followerCount: Math.max(0, (prev.followerCount || 0) + (was ? -1 : 1)) }));
    try {
      if (was) await unfollowPlaylist(pid);
      else await followPlaylist(pid);
      showToast(was ? `Removed “${playlist?.name || 'playlist'}” from your library` : `Added “${playlist?.name || 'playlist'}” to your library`);
    } catch {
      setPlaylist((prev: any) => ({ ...prev, isFollowing: was, following: was, followerCount: Math.max(0, (prev.followerCount || 0) + (was ? 1 : -1)) }));
      showToast(was ? "Couldn't remove it from your library. Try again." : "Couldn't add it to your library. Try again.", 'error');
    }
  };

  // ── Header menu ──
  const copyLink = async () => {
    setHeaderMenu(false);
    const url = webUrl(`/playlist/${pid}`);
    try {
      await Clipboard.setStringAsync(url);
      showToast('Link copied');
    } catch {
      showToast(`Copy this link: ${url}`, 'info');
    }
  };

  const openEdit = () => {
    setHeaderMenu(false);
    setEditName(playlist.name || '');
    setEditDescription(playlist.description || '');
    setEditVisibility(playlist.visibility || 'private');
    setEditOpen(true);
  };

  const saveEdit = async () => {
    const updates: any = {};
    if (editName.trim() && editName.trim() !== playlist.name) updates.name = editName.trim();
    if (editDescription !== (playlist.description || '')) updates.description = editDescription;
    if (!isCommunity && editVisibility !== playlist.visibility) updates.visibility = editVisibility;
    if (Object.keys(updates).length === 0) { setEditOpen(false); showToast('No changes to save', 'info'); return; }
    setSaving(true);
    try {
      await updatePlaylist(pid, updates);
      setPlaylist((prev: any) => ({ ...prev, ...updates }));
      setEditOpen(false);
      showToast('Playlist details saved');
    } catch (error) {
      showToast(errorMessage(error, "Couldn't save your changes. Try again."), 'error');
    } finally {
      setSaving(false);
    }
  };

  const pickCover = async () => {
    setHeaderMenu(false);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (a.fileSize && a.fileSize > 5 * 1024 * 1024) {
      showToast('Cover images must be under 5 MB. Pick a smaller one.', 'error');
      return;
    }
    setUploadingCover(true);
    try {
      const ext = (a.uri.split('.').pop() || 'jpg').toLowerCase();
      const fd = new FormData();
      fd.append('cover', { uri: a.uri, name: a.fileName || `cover.${ext}`, type: a.mimeType || `image/${ext === 'png' ? 'png' : 'jpeg'}` } as any);
      const r = await axiosInstance.post(`/v1/playlists/${pid}/cover`, fd);
      setCoverError(false);
      setPlaylist((prev: any) => ({ ...prev, coverImageUrl: r.data.coverImageUrl }));
      showToast('Cover updated');
    } catch (error) {
      showToast(errorMessage(error, "Couldn't upload that image. Try again."), 'error');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePlaylist(pid);
      showToast(`Deleted “${playlist?.name || 'playlist'}”`);
      navigation.goBack();
    } catch {
      setDeleting(false);
      setDeleteOpen(false);
      showToast("Couldn't delete the playlist. Try again.", 'error');
    }
  };

  // ── Community ──
  const openSection = async (next: typeof section) => {
    setSection(next);
    if (next === 'activity' && !activityLoaded) {
      try {
        const res = await axiosInstance.get(`/v1/playlists/${pid}/activity?page=0&size=30`);
        setActivities(res.data || []);
      } catch {
        setActivities([]);
      } finally {
        setActivityLoaded(true);
      }
    }
  };

  const handleVote = async (track: any, voteType: 'up' | 'down') => {
    if (!user) { showToast('Sign in to vote on suggestions', 'info'); return; }
    if (track.myVote === voteType) {
      showToast(`You already voted ${voteType === 'up' ? 'for' : 'against'} “${track.title}”`, 'info');
      return;
    }
    try {
      const result = await voteOnSuggestion(pid, track.playlistItemId, voteType);
      if (result.status === 'active') {
        setPending((prev) => prev.filter((x) => x.playlistItemId !== track.playlistItemId));
        setTracks((prev) => [...prev, normalizeTrack({ ...track, ...result, status: 'active' })]);
        showToast(`Your vote put “${track.title}” in the playlist`);
      } else if (result.status === 'removed') {
        setPending((prev) => prev.filter((x) => x.playlistItemId !== track.playlistItemId));
        showToast(`Your vote took “${track.title}” off the suggestions`);
      } else {
        showToast(voteType === 'up' ? `Voted for “${track.title}”` : `Voted against “${track.title}”`);
        setPending((prev) => prev.map((x) => (x.playlistItemId === track.playlistItemId ? { ...x, upvotes: result.upvotes, downvotes: result.downvotes, myVote: voteType } : x)));
      }
    } catch (error) {
      showToast(errorMessage(error, "Couldn't record your vote. Try again."), 'error');
    }
  };

  // ── Render ──
  if (status === 'loading') {
    return (
      <View style={[styles.root, { padding: 20, gap: 14 }]}>
        <View style={[styles.cover, styles.skel, { alignSelf: 'center' }]} />
        <View style={[styles.skel, { height: 14, width: 120 }]} />
        <View style={[styles.skel, { height: 28, width: '70%' }]} />
        {Array.from({ length: 6 }).map((_, i) => <View key={i} style={[styles.skel, { height: 54 }]} />)}
      </View>
    );
  }

  if (status === 'unavailable' || !playlist) {
    return (
      <View style={[styles.root, styles.center]}>
        <View style={[styles.unavailableIcon, { backgroundColor: t.soft }]}><ListMusic size={34} color="#fff" /></View>
        <Text style={styles.h1}>This playlist isn&rsquo;t available</Text>
        <Text style={styles.sub}>It may be private, or it may have been deleted.</Text>
        <Pressable style={[styles.pill, { backgroundColor: t.primary }]} onPress={() => navigation.navigate('Feed')}><Text style={styles.pillText}>Go home</Text></Pressable>
      </View>
    );
  }

  const typeLabel = isCommunity ? 'Community playlist' : isOfficial ? 'Official playlist' : 'Playlist';
  const showHeroPause = playingFromHere && isPlaying;

  return (
    <View style={styles.root}>
      {heroImage && <Image source={{ uri: heroImage }} style={styles.ambient} blurRadius={40} />}
      <LinearGradient colors={['rgba(7,9,15,0.3)', '#07090f']} style={styles.ambient} />

      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Hero */}
        <View style={styles.hero}>
          <Pressable onPress={isOwner ? pickCover : undefined} disabled={!isOwner || uploadingCover} style={styles.cover}>
            {coverUrl ? (
              <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} onError={() => setCoverError(true)} />
            ) : mosaic.length >= 4 ? (
              <View style={styles.mosaic}>{mosaic.map((src) => <Image key={src} source={{ uri: src }} style={styles.mosaicCell} />)}</View>
            ) : mosaic.length > 0 ? (
              <Image source={{ uri: mosaic[0] }} style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: t.soft }]}><Music size={56} color="#fff" /></View>
            )}
            {isOwner && (
              <View style={styles.coverChange}>
                {uploadingCover ? <ActivityIndicator color="#fff" size="small" /> : <ImagePlus size={16} color="#fff" />}
                <Text style={styles.coverChangeText}>{uploadingCover ? 'Uploading…' : 'Choose photo'}</Text>
              </View>
            )}
          </Pressable>
          <Text style={[styles.kicker, { color: t.textAccent }]}>{typeLabel}</Text>
          <Text style={styles.title} numberOfLines={2}>{playlist.name}</Text>
          {!!playlist.description && <Text style={styles.description}>{playlist.description}</Text>}
          <View style={styles.meta}>
            {!!playlist.creatorName && (
              <Pressable
                style={styles.creator}
                disabled={!playlist.creatorId}
                onPress={() => playlist.creatorId && navigation.navigate('Listener', { userId: playlist.creatorId })}
              >
                {playlist.creatorPhotoUrl ? (
                  <Image source={{ uri: buildUrl(playlist.creatorPhotoUrl) || undefined }} style={styles.creatorImg} />
                ) : (
                  <View style={[styles.creatorImg, { backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{playlist.creatorName.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.creatorName}>{playlist.creatorName}</Text>
              </Pressable>
            )}
            <Text style={styles.metaItem}>{tracks.length} song{tracks.length !== 1 ? 's' : ''}{totalLabel ? `, ${totalLabel}` : ''}</Text>
            {playlist.followerCount > 0 && (
              <Text style={styles.metaItem}>{Number(playlist.followerCount).toLocaleString()} follower{playlist.followerCount !== 1 ? 's' : ''}</Text>
            )}
            {isCommunity && !!playlist.jurisdictionName && (
              <View style={styles.metaPill}><MapPin size={11} color="#fff" /><Text style={styles.metaPillText}>{playlist.jurisdictionName}</Text></View>
            )}
            {isOwner && !isCommunity && (
              <View style={styles.metaPill}>
                {playlist.visibility === 'public' ? <Globe size={11} color="#fff" /> : playlist.visibility === 'unlisted' ? <EyeOff size={11} color="#fff" /> : <Lock size={11} color="#fff" />}
                <Text style={styles.metaPillText}>{playlist.visibility}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Action bar */}
        <View style={styles.actions}>
          <Pressable
            onPress={handleHeroPlay}
            disabled={!playingFromHere && playable.length === 0}
            style={[styles.play, { backgroundColor: t.primary }]}
            accessibilityLabel={showHeroPause ? 'Pause' : 'Play'}
          >
            {showHeroPause ? <Pause size={26} color="#fff" fill="#fff" /> : <Play size={26} color="#fff" fill="#fff" />}
          </Pressable>
          <Pressable onPress={handleShufflePlay} disabled={playable.length === 0} style={styles.iconBtn} accessibilityLabel="Shuffle play">
            <Shuffle size={22} color="#fff" />
          </Pressable>
          {canFollow && (
            <Pressable onPress={handleFollow} style={[styles.follow, isFollowing && { borderColor: t.border, backgroundColor: t.soft }]} accessibilityState={{ selected: isFollowing }}>
              {isFollowing ? <Check size={16} color="#fff" /> : <Heart size={16} color="#fff" />}
              <Text style={styles.followText}>{isFollowing ? 'Following' : 'Follow'}</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setHeaderMenu(true)} style={styles.iconBtn} accessibilityLabel="More options">
            <MoreHorizontal size={24} color="#fff" />
          </Pressable>
        </View>
        {playingFromHere && (
          <View style={styles.live}>
            <View style={[styles.liveDot, { backgroundColor: t.primary2 }]} />
            <Text style={styles.liveText}>Playing from this playlist</Text>
          </View>
        )}

        {/* Community tabs */}
        {isCommunity && (
          <View style={styles.tabs}>
            {([
              ['tracks', `Songs`, tracks.length],
              ['suggestions', 'Suggestions', pending.length],
              ['activity', 'Activity', null],
            ] as const).map(([key, label, count]) => (
              <Pressable key={key} onPress={() => openSection(key)} style={[styles.tab, section === key && { backgroundColor: t.soft, borderColor: t.border }]}>
                <Text style={[styles.tabText, section === key && { color: '#fff' }]}>{label}{count != null ? ` ${count}` : ''}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Songs */}
        {section === 'tracks' && (
          tracks.length === 0 ? (
            <View style={styles.empty}>
              <Music size={30} color="rgba(255,255,255,0.4)" />
              <Text style={styles.emptyTitle}>{isOwner ? 'Your playlist is empty' : 'No songs yet'}</Text>
              {isOwner && <Text style={styles.emptyHint}>While a song is playing, tap Add in the player to put it here.</Text>}
            </View>
          ) : (
            <View style={{ paddingHorizontal: 12 }}>
              {tracks.map((track, index) => {
                const key = rowKey(track);
                const isCurrentRow = !!currentItemId && currentItemId === track.playlistItemId;
                const confirming = confirmRemoveKey === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => { if (!confirming) handleRowPlay(index); }}
                    style={({ pressed }) => [styles.row, isCurrentRow && { backgroundColor: t.soft }, pressed && { backgroundColor: 'rgba(255,255,255,0.05)' }]}
                    accessibilityLabel={`Play ${track.title} by ${track.artist}`}
                  >
                    <Text style={[styles.index, isCurrentRow && { color: t.primary2 }]}>{isCurrentRow && isPlaying ? '♪' : index + 1}</Text>
                    {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={styles.art} /> : <View style={[styles.art, { backgroundColor: t.soft }]} />}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.rowTitle, isCurrentRow && { color: t.textAccent }]} numberOfLines={1}>{track.title}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {track.artist}{track.addedAt ? ` · ${formatAdded(track.addedAt)}` : ''}
                      </Text>
                    </View>
                    {confirming ? (
                      <View style={styles.confirm}>
                        <Pressable onPress={() => setConfirmRemoveKey(null)} style={styles.confirmCancel}><Text style={styles.confirmText}>Cancel</Text></Pressable>
                        <Pressable onPress={() => confirmRemove(track)} style={styles.confirmGo}><Text style={styles.confirmText}>Remove</Text></Pressable>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.time}>{formatTrackTime(track.duration)}</Text>
                        <Pressable onPress={() => setRowMenu({ track, index })} hitSlop={8} style={styles.rowMenu} accessibilityLabel={`More options for ${track.title}`}>
                          <MoreHorizontal size={18} color="rgba(255,255,255,0.7)" />
                        </Pressable>
                      </>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )
        )}

        <View style={{ paddingHorizontal: 16 }}>
          <AdSlot placement="playlist" />
        </View>

        {/* Suggestions */}
        {section === 'suggestions' && isCommunity && (
          pending.length === 0 ? (
            <View style={styles.empty}>
              <ThumbsUp size={28} color="rgba(255,255,255,0.4)" />
              <Text style={styles.emptyTitle}>No suggestions waiting</Text>
              <Text style={styles.emptyHint}>Songs suggested for this playlist get voted in here.</Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 12 }}>
              {pending.map((track) => {
                const isMine = !!user && (track.addedById ? track.addedById === user.userId : track.addedByUsername === user.username);
                return (
                  <View key={track.playlistItemId} style={styles.row}>
                    {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={styles.art} /> : <View style={[styles.art, { backgroundColor: t.soft }]} />}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{track.title}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {track.artist}{track.addedByUsername ? ` · suggested by ${track.addedByUsername}` : ''}
                      </Text>
                    </View>
                    {isMine ? (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.small}>Your suggestion</Text>
                        <Text style={styles.small}>▲ {track.upvotes}  ▼ {track.downvotes}</Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <Pressable onPress={() => handleVote(track, 'up')} style={[styles.vote, track.myVote === 'up' && { backgroundColor: 'rgba(74,222,128,0.18)' }]} accessibilityLabel={track.myVote === 'up' ? 'You voted to add' : 'Vote to add'}>
                          <ThumbsUp size={15} color="#4ade80" />
                          <Text style={styles.voteText}>{track.upvotes}</Text>
                        </Pressable>
                        <Pressable onPress={() => handleVote(track, 'down')} style={[styles.vote, track.myVote === 'down' && { backgroundColor: 'rgba(248,113,113,0.18)' }]} accessibilityLabel={track.myVote === 'down' ? 'You voted against' : 'Vote against'}>
                          <ThumbsDown size={15} color="#f87171" />
                          <Text style={styles.voteText}>{track.downvotes}</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )
        )}

        {/* Activity */}
        {section === 'activity' && isCommunity && (
          !activityLoaded ? (
            <View style={styles.empty}><ActivityIndicator color="#fff" /><Text style={styles.emptyHint}>Loading activity…</Text></View>
          ) : activities.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyTitle}>No activity yet</Text></View>
          ) : (
            <View style={{ paddingHorizontal: 16 }}>
              {activities.map((act) => (
                <View key={act.activityId} style={styles.activity}>
                  {act.userPhotoUrl ? (
                    <Image source={{ uri: buildUrl(act.userPhotoUrl) || undefined }} style={styles.actAvatar} />
                  ) : (
                    <View style={[styles.actAvatar, { backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>{(act.username || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={[styles.rowSub, { flex: 1, color: 'rgba(255,255,255,0.8)' }]}>
                    <Text style={{ fontWeight: '800', color: '#fff' }}>{act.username}</Text> {String(act.actionType || '').replace(/_/g, ' ')}
                    {act.songTitle ? <Text style={{ fontStyle: 'italic' }}> {'“'}{act.songTitle}{'”'}</Text> : null}
                  </Text>
                  <Text style={styles.small}>{formatTimeAgo(act.createdAt)}</Text>
                </View>
              ))}
            </View>
          )
        )}
      </ScrollView>

      {/* Header menu */}
      <Sheet visible={headerMenu} onClose={() => setHeaderMenu(false)} title={playlist.name}>
        <Pressable style={styles.menuItem} onPress={copyLink}><Link2 size={17} color="#fff" /><Text style={styles.menuText}>Copy link</Text></Pressable>
        {isOwner && (
          <>
            <Pressable style={styles.menuItem} onPress={openEdit}><Pencil size={17} color="#fff" /><Text style={styles.menuText}>Edit details</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={pickCover}><ImagePlus size={17} color="#fff" /><Text style={styles.menuText}>Change cover</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setHeaderMenu(false); setDeleteOpen(true); }}><Trash2 size={17} color="#ff6b6b" /><Text style={[styles.menuText, { color: '#ff6b6b' }]}>Delete playlist</Text></Pressable>
          </>
        )}
      </Sheet>

      {/* Row menu */}
      <Sheet visible={!!rowMenu} onClose={() => setRowMenu(null)} title={rowMenu?.track?.title} subtitle={rowMenu?.track?.artist}>
        {rowMenu && (
          <>
            <Pressable style={styles.menuItem} onPress={() => handleAddOneToQueue(rowMenu.track)}><ListPlus size={17} color="#fff" /><Text style={styles.menuText}>Add to queue</Text></Pressable>
            <Pressable style={styles.menuItem} onPress={() => { const tr = rowMenu.track; setRowMenu(null); navigation.navigate('Song', { songId: tr.songId || tr.id }); }}><Disc3 size={17} color="#fff" /><Text style={styles.menuText}>Go to song</Text></Pressable>
            {!!rowMenu.track.artistId && (
              <Pressable style={styles.menuItem} onPress={() => { const tr = rowMenu.track; setRowMenu(null); navigation.navigate('Artist', { artistId: tr.artistId }); }}><UserRound size={17} color="#fff" /><Text style={styles.menuText}>Go to artist</Text></Pressable>
            )}
            {isOwner && (
              <>
                <Pressable style={styles.menuItem} disabled={rowMenu.index === 0} onPress={() => moveRow(rowMenu.index, rowMenu.index - 1)}>
                  <ArrowUp size={17} color={rowMenu.index === 0 ? 'rgba(255,255,255,0.3)' : '#fff'} /><Text style={styles.menuText}>Move up</Text>
                </Pressable>
                <Pressable style={styles.menuItem} disabled={rowMenu.index >= tracks.length - 1} onPress={() => moveRow(rowMenu.index, rowMenu.index + 1)}>
                  <ArrowDown size={17} color={rowMenu.index >= tracks.length - 1 ? 'rgba(255,255,255,0.3)' : '#fff'} /><Text style={styles.menuText}>Move down</Text>
                </Pressable>
                <Pressable style={styles.menuItem} onPress={() => { const key = rowKey(rowMenu.track); setRowMenu(null); setConfirmRemoveKey(key); }}>
                  <Trash2 size={17} color="#ff6b6b" /><Text style={[styles.menuText, { color: '#ff6b6b' }]}>Remove from playlist</Text>
                </Pressable>
              </>
            )}
          </>
        )}
      </Sheet>

      {/* Edit details */}
      <Sheet visible={editOpen} onClose={() => !saving && setEditOpen(false)} title="Edit details">
        <Text style={styles.label}>Name</Text>
        <TextInput value={editName} onChangeText={setEditName} maxLength={100} style={styles.input} placeholderTextColor="rgba(255,255,255,0.35)" />
        <Text style={styles.label}>Description</Text>
        <TextInput value={editDescription} onChangeText={setEditDescription} maxLength={500} multiline placeholder="Add an optional description" placeholderTextColor="rgba(255,255,255,0.35)" style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]} />
        {!isCommunity && (
          <>
            <Text style={styles.label}>Who can see it</Text>
            <Text style={styles.hint}>
              {editVisibility === 'private' && 'Only you can open it.'}
              {editVisibility === 'unlisted' && 'Anyone with the link can open it. It won’t appear in search or on Discover.'}
              {editVisibility === 'public' && 'Anyone can open it, and it shows up in search and on Discover.'}
            </Text>
            <View style={styles.seg}>
              {(['private', 'unlisted', 'public'] as Visibility[]).map((v) => {
                const Icon = v === 'private' ? Lock : v === 'unlisted' ? EyeOff : Globe;
                const on = editVisibility === v;
                return (
                  <Pressable key={v} onPress={() => setEditVisibility(v)} style={[styles.segBtn, on && { backgroundColor: t.soft, borderColor: t.border }]} accessibilityState={{ selected: on }}>
                    <Icon size={14} color="#fff" />
                    <Text style={styles.segText}>{v[0].toUpperCase() + v.slice(1)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
        <View style={styles.dialogActions}>
          <Pressable style={styles.ghost} onPress={() => setEditOpen(false)} disabled={saving}><Text style={styles.ghostText}>Cancel</Text></Pressable>
          <Pressable style={[styles.pill, { backgroundColor: t.primary }, (saving || !editName.trim()) && { opacity: 0.5 }]} onPress={saveEdit} disabled={saving || !editName.trim()}>
            <Text style={styles.pillText}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>
      </Sheet>

      {/* Delete */}
      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => !deleting && setDeleteOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => !deleting && setDeleteOpen(false)}>
          <Pressable style={[styles.dialog, { backgroundColor: mix(t.primary, '#14151b', 0.91) }]}>
            <Text style={styles.dialogTitle}>Delete this playlist?</Text>
            <Text style={styles.dialogText}>
              {'“'}{playlist.name}{'”'} will be removed from your library. This can&rsquo;t be undone. Songs already in your queue will keep playing.
            </Text>
            {playlist.ownerPointsEarned > 0 && (
              <Text style={[styles.dialogText, { color: '#fbbf24' }]}>You&rsquo;ll also lose the {playlist.ownerPointsEarned} points this playlist earned you.</Text>
            )}
            <View style={styles.dialogActions}>
              <Pressable style={styles.ghost} onPress={() => setDeleteOpen(false)} disabled={deleting}><Text style={styles.ghostText}>Cancel</Text></Pressable>
              <Pressable style={[styles.pill, { backgroundColor: '#d63a3a' }]} onPress={handleDelete} disabled={deleting}>
                <Text style={styles.pillText}>{deleting ? 'Deleting…' : 'Delete'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const COVER = 220;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07090f' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30 },
  ambient: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
  skel: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10 },
  unavailableIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  h1: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  sub: { color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center' },
  hero: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 22 },
  cover: { width: COVER, height: COVER, borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 12 },
  mosaic: { flexDirection: 'row', flexWrap: 'wrap', width: COVER, height: COVER },
  mosaicCell: { width: COVER / 2, height: COVER / 2 },
  coverChange: { position: 'absolute', bottom: 8, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.6)' },
  coverChangeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  kicker: { marginTop: 18, fontSize: 11.5, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center', marginTop: 4, letterSpacing: -0.6 },
  description: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 10 },
  creator: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  creatorImg: { width: 22, height: 22, borderRadius: 11 },
  creatorName: { color: '#fff', fontWeight: '800', fontSize: 13 },
  metaItem: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)' },
  metaPillText: { color: '#fff', fontSize: 11.5, fontWeight: '600', textTransform: 'capitalize' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, marginTop: 20 },
  play: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  follow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  followText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, marginTop: 10 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5, fontWeight: '600' },
  tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginTop: 18 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  tabText: { color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: 13.5 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 30 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  emptyHint: { color: 'rgba(255,255,255,0.55)', fontSize: 13.5, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12, marginTop: 4 },
  index: { width: 22, textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },
  art: { width: 46, height: 46, borderRadius: 6 },
  rowTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  rowSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginTop: 1 },
  time: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontVariant: ['tabular-nums'] },
  rowMenu: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  confirm: { flexDirection: 'row', gap: 6 },
  confirmCancel: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  confirmGo: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#d63a3a' },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
  small: { color: 'rgba(255,255,255,0.5)', fontSize: 11.5 },
  vote: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  voteText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)' },
  actAvatar: { width: 32, height: 32, borderRadius: 16 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4 },
  menuText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  label: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  hint: { color: 'rgba(255,255,255,0.5)', fontSize: 12.5, marginBottom: 8 },
  input: { color: '#fff', fontSize: 15, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  seg: { flexDirection: 'row', gap: 8 },
  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  segText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18, marginBottom: 6 },
  ghost: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  ghostText: { color: '#fff', fontWeight: '600' },
  pill: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, alignItems: 'center' },
  pillText: { color: '#fff', fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(3,4,8,0.62)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 380, borderRadius: 20, padding: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  dialogTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  dialogText: { color: 'rgba(255,255,255,0.72)', fontSize: 14.5, lineHeight: 21, marginTop: 8 },
});

export default PlaylistScreen;
