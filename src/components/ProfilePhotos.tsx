// src/components/ProfilePhotos.tsx
// ─────────────────────────────────────────────────────────────
// The Instagram-style photo grid on a listener's profile — mobile port of web
// src/ProfilePhotos.jsx + src/PhotoViewer.jsx.
//
// Data:   GET    /v1/users/{ownerId}/photos  → { photos, max, hidden, visibility? }
//         POST   /v1/users/{ownerId}/photos  (multipart, owner only, one at a time)
//         DELETE /v1/users/{ownerId}/photos/{photoId}           (owner only)
//         POST | DELETE /v1/users/{ownerId}/photos/{photoId}/like
//
// Visibility is decided by the server (under-17 safeguard + "Public profile").
// `hidden: true` means this viewer may not see the gallery; the owner gets
// `visibility` so we can tell them who can.
//
// Viewer: swipe left/right between photos, double-tap to like (never unlike)
// with a heart burst, heart button to like/unlike, like count, posted date,
// owner-only delete behind a confirmation. Photo likes award no points.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Defs, LinearGradient as SvgLinear, Path, Rect, Stop } from 'react-native-svg';
import { Camera, Lock, Plus, Trash2, X } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { sendMultipart } from '../utils/multipart';
import { useFeedback } from '../context/FeedbackContext';
import { FeedbackToasts } from '../context/FeedbackContext';
import { useUnisTheme, UnisTheme } from '../theme/unisTheme';

const { width: SCREEN_W } = Dimensions.get('window');
const DEFAULT_MAX = 15;
const MAX_BYTES = 10 * 1024 * 1024;
const DOUBLE_TAP_MS = 300;

const VISIBILITY_NOTES: Record<string, string> = {
  private: 'Your profile is set to private, so only people you follow back can see your photos.',
  minor: "Because you're under 17, only people you follow back can see your photos.",
};

export const likeLabel = (count: any, isSelf: boolean) => {
  const n = Number(count) || 0;
  if (n === 0) return isSelf ? 'No likes yet' : 'Be the first to like this';
  return `${n.toLocaleString()} ${n === 1 ? 'like' : 'likes'}`;
};

export const postedDate = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
};

const GridIcon = () => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={3} width={18} height={18} rx={2.5} stroke="#fff" strokeWidth={1.9} />
    <Path d="M9 3v18M15 3v18M3 9h18M3 15h18" stroke="#fff" strokeWidth={1.9} />
  </Svg>
);

const Heart: React.FC<{ filled?: boolean; size?: number; t: UnisTheme; id: string; color?: string }> = ({ filled, size = 26, t, id, color = '#fff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    {filled && (
      <Defs>
        <SvgLinear id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={t.primary2} />
          <Stop offset="1" stopColor={t.primary} />
        </SvgLinear>
      </Defs>
    )}
    <Path
      d="M12 20.4s-8.4-5.5-8.4-11.2A4.7 4.7 0 0112 6.5a4.7 4.7 0 018.4 2.7c0 5.7-8.4 11.2-8.4 11.2z"
      fill={filled ? `url(#${id})` : 'none'}
      stroke={filled ? 'none' : color}
      strokeWidth={1.9}
      strokeLinejoin="round"
    />
  </Svg>
);

// ── Viewer ──────────────────────────────────────────────────
const PhotoViewer: React.FC<{
  photos: any[];
  index: number;
  ownerName: string;
  ownerAvatar: string | null;
  isSelf: boolean;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  onSetLiked: (photoId: string, liked: boolean) => void;
  onDelete: (photoId: string) => Promise<void>;
}> = ({ photos, index, ownerName, ownerAvatar, isSelf, onClose, onIndexChange, onSetLiked, onDelete }) => {
  const t = useUnisTheme();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);
  const lastTap = useRef(0);
  const burst = useRef(new Animated.Value(0)).current;
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const photo = photos[index];

  useEffect(() => {
    listRef.current?.scrollToIndex({ index, animated: false });
  }, [index]);

  const showBurst = () => {
    burst.setValue(0);
    Animated.sequence([
      Animated.spring(burst, { toValue: 1, friction: 4, useNativeDriver: true }),
      Animated.delay(300),
      Animated.timing(burst, { toValue: 2, duration: 220, useNativeDriver: true }),
    ]).start();
  };

  const onTap = (p: any) => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      if (!p.likedByMe) onSetLiked(p.photoId, true);
      showBurst();
    } else {
      lastTap.current = now;
    }
  };

  const confirmDelete = async () => {
    if (!photo) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(photo.photoId);
      setConfirming(false);
    } catch (err: any) {
      setDeleteError(err?.response?.data?.error || "Couldn't delete that photo. Try again.");
    } finally {
      setDeleting(false);
    }
  };

  if (!photo) return null;
  const likes = Number(photo.likeCount) || 0;

  return (
    <Modal visible animationType="fade" onRequestClose={() => (confirming ? (!deleting && setConfirming(false)) : onClose())} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={vs.root}>
        <View style={[vs.top, { paddingTop: insets.top + 8 }]}>
          <View style={vs.owner}>
            {ownerAvatar ? <Image source={{ uri: ownerAvatar }} style={vs.avatar} /> : <View style={[vs.avatar, { backgroundColor: t.soft }]} />}
            <Text style={vs.ownerName} numberOfLines={1}>{ownerName}</Text>
          </View>
          <Text style={vs.counter}>{index + 1} / {photos.length}</Text>
          <Pressable onPress={onClose} style={vs.iconBtn} accessibilityLabel="Close" hitSlop={8}><X size={22} color="#fff" /></Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={photos}
          horizontal
          pagingEnabled
          initialScrollIndex={index}
          getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
          keyExtractor={(p) => p.photoId}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
            if (i !== index) { setConfirming(false); setDeleteError(null); onIndexChange(i); }
          }}
          renderItem={({ item }) => (
            <Pressable style={vs.slide} onPress={() => onTap(item)} accessibilityLabel="Photo. Double-tap to like">
              <Image source={{ uri: buildUrl(item.photoUrl) || undefined }} style={vs.image} resizeMode="contain" />
            </Pressable>
          )}
        />

        <Animated.View
          pointerEvents="none"
          style={[vs.burst, {
            opacity: burst.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
            transform: [{ scale: burst.interpolate({ inputRange: [0, 1, 2], outputRange: [0.4, 1, 1.15] }) }],
          }]}
        >
          <Heart filled size={110} t={t} id="pvburst" />
        </Animated.View>

        <View style={[vs.bottom, { paddingBottom: insets.bottom + 14 }]}>
          <View style={vs.actions}>
            <Pressable onPress={() => onSetLiked(photo.photoId, !photo.likedByMe)} accessibilityLabel={photo.likedByMe ? 'Unlike photo' : 'Like photo'} accessibilityState={{ selected: !!photo.likedByMe }} hitSlop={8}>
              <Heart filled={!!photo.likedByMe} t={t} id="pvheart" />
            </Pressable>
            {isSelf && (
              <Pressable onPress={() => { setDeleteError(null); setConfirming(true); }} style={{ marginLeft: 'auto' }} accessibilityLabel="Delete photo" hitSlop={8}>
                <Trash2 size={22} color="#fff" />
              </Pressable>
            )}
          </View>
          <Text style={vs.likes}>{likeLabel(likes, isSelf)}</Text>
          {!!postedDate(photo.createdAt) && <Text style={vs.date}>{postedDate(photo.createdAt)}</Text>}
        </View>

        {confirming && (
          <View style={vs.confirmWrap}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => !deleting && setConfirming(false)} />
            <View style={[vs.confirm, { paddingBottom: insets.bottom + 16 }]}>
              <Text style={vs.confirmTitle}>Delete this photo?</Text>
              <Text style={vs.confirmText}>It will be removed from your profile, along with its likes.</Text>
              {!!deleteError && <Text style={vs.confirmError}>{deleteError}</Text>}
              <Pressable style={[vs.confirmBtn, { backgroundColor: '#dc2626' }]} onPress={confirmDelete} disabled={deleting}>
                {deleting ? <ActivityIndicator color="#fff" /> : <Text style={vs.confirmBtnText}>Delete</Text>}
              </Pressable>
              <Pressable style={[vs.confirmBtn, { backgroundColor: 'rgba(255,255,255,0.08)' }]} onPress={() => setConfirming(false)} disabled={deleting}>
                <Text style={vs.confirmBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
        <FeedbackToasts onlyAndroid />
      </View>
    </Modal>
  );
};

// ── Grid ────────────────────────────────────────────────────
const ProfilePhotos: React.FC<{ ownerId: string; ownerName: string; ownerAvatar: string | null; isSelf: boolean }> = ({ ownerId, ownerName, ownerAvatar, isSelf }) => {
  const t = useUnisTheme();
  const feedback = useFeedback();
  const [photos, setPhotos] = useState<any[]>([]);
  const [max, setMax] = useState(DEFAULT_MAX);
  const [hidden, setHidden] = useState(false);
  const [visibility, setVisibility] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pending, setPending] = useState<{ key: string; preview: string }[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [openIndex, setOpenIndex] = useState(-1);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const likeSync = useRef<Record<string, { inFlight: boolean; want: boolean }>>({});

  // Instagram order: newest top-left
  const ordered = useMemo(() => [...photos].reverse(), [photos]);

  const load = useCallback(async () => {
    if (!ownerId) return;
    setStatus('loading');
    try {
      const res = await axiosInstance.get(`/v1/users/${ownerId}/photos`);
      const data = res.data || {};
      setPhotos(Array.isArray(data.photos) ? data.photos : []);
      if (data.max) setMax(Number(data.max));
      setHidden(Boolean(data.hidden));
      setVisibility(data.visibility || null);
      setStatus('ready');
    } catch (err) {
      console.error('Profile photos load failed:', ownerId, err);
      setStatus('error');
    }
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  const patchPhoto = (photoId: string, fn: (p: any) => any) => setPhotos((prev) => prev.map((p) => (p.photoId === photoId ? fn(p) : p)));

  const syncLike = useCallback(async (photoId: string) => {
    const s = likeSync.current[photoId];
    if (!s || s.inFlight) return;
    s.inFlight = true;
    const sending = s.want;
    try {
      const res = sending
        ? await axiosInstance.post(`/v1/users/${ownerId}/photos/${photoId}/like`)
        : await axiosInstance.delete(`/v1/users/${ownerId}/photos/${photoId}/like`);
      s.inFlight = false;
      if (s.want !== sending) { syncLike(photoId); return; }
      delete likeSync.current[photoId];
      const serverCount = Number(res.data?.likeCount);
      if (Number.isFinite(serverCount)) patchPhoto(photoId, (p) => ({ ...p, likedByMe: sending, likeCount: serverCount }));
    } catch (err) {
      s.inFlight = false;
      console.error(`Photo ${sending ? 'like' : 'unlike'} failed:`, photoId, err);
      if (s.want !== sending) { syncLike(photoId); return; }
      delete likeSync.current[photoId];
      patchPhoto(photoId, (p) => ({ ...p, likedByMe: !sending, likeCount: Math.max(0, (Number(p.likeCount) || 0) + (sending ? -1 : 1)) }));
      feedback.error(sending ? "Couldn't like that photo. Try again." : "Couldn't remove your like. Try again.");
    }
  }, [ownerId, feedback]);

  const setLiked = useCallback((photoId: string, want: boolean) => {
    const current = photosRef.current.find((p) => p.photoId === photoId);
    if (!current) return;
    if (Boolean(current.likedByMe) === want && !likeSync.current[photoId]) return;
    patchPhoto(photoId, (p) => (Boolean(p.likedByMe) === want ? p : { ...p, likedByMe: want, likeCount: Math.max(0, (Number(p.likeCount) || 0) + (want ? 1 : -1)) }));
    const s = likeSync.current[photoId] || (likeSync.current[photoId] = { inFlight: false, want });
    s.want = want;
    syncLike(photoId);
  }, [syncLike]);

  const deletePhoto = useCallback(async (photoId: string) => {
    await axiosInstance.delete(`/v1/users/${ownerId}/photos/${photoId}`);
    feedback.success('Photo deleted');
    const idx = ordered.findIndex((p) => p.photoId === photoId);
    const remainingAfter = ordered.length - 1;
    setPhotos((prev) => prev.filter((p) => p.photoId !== photoId));
    if (remainingAfter <= 0) setOpenIndex(-1);
    else setOpenIndex(Math.min(idx, remainingAfter - 1));
  }, [ownerId, ordered, feedback]);

  const remaining = Math.max(0, max - photos.length);
  const uploading = pending.length > 0;

  const pickFiles = async () => {
    setUploadError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.length) return;

    const problems: string[] = [];
    const accepted = result.assets.filter((a) => {
      if (a.fileSize && a.fileSize > MAX_BYTES) { problems.push(`${a.fileName || 'A photo'} is over 10MB.`); return false; }
      return true;
    });
    const batch = accepted.slice(0, remaining);
    if (accepted.length > batch.length) problems.push(`You can add ${remaining} more photo${remaining === 1 ? '' : 's'} (limit ${max}).`);

    const items = batch.map((a, i) => ({ key: `${Date.now()}-${i}`, asset: a }));
    setPending(items.map(({ key, asset }) => ({ key, preview: asset.uri })));
    let uploaded = 0;

    // One at a time so the server cap is enforced cleanly.
    for (const item of items) {
      const a = item.asset;
      const type = a.mimeType || 'image/jpeg';
      const fd = new FormData();
      fd.append('file', { uri: a.uri, name: a.fileName || `photo.${type === 'image/png' ? 'png' : 'jpg'}`, type } as any);
      let stop = false;
      try {
        const saved = await sendMultipart(`/v1/users/${ownerId}/photos`, fd, 'POST', 120000);
        if (saved?.photoId) {
          setPhotos((prev) => [...prev, { ...saved, likeCount: 0, likedByMe: false }]);
          uploaded += 1;
        }
      } catch (err: any) {
        console.error('Profile photo upload failed:', err);
        problems.push(err?.response?.data?.error || `${a.fileName || 'A photo'} didn't upload. Try again.`);
        stop = err?.response?.status === 409;
      } finally {
        setPending((prev) => prev.filter((p) => p.key !== item.key));
      }
      if (stop) break;
    }
    setPending([]);
    if (uploaded > 0) feedback.success(uploaded === 1 ? 'Photo added to your profile' : `${uploaded} photos added to your profile`);
    if (problems.length) {
      const text = problems[0] + (problems.length > 1 ? ` (${problems.length - 1} more didn't upload.)` : '');
      setUploadError(text);
      feedback.error(text);
    }
  };

  const count = photos.length;
  const showAdd = isSelf && status === 'ready' && remaining > 0;
  const selfNote = isSelf && visibility ? VISIBILITY_NOTES[visibility] : null;
  const tile = (SCREEN_W - 32 - 4) / 3;

  let body: React.ReactNode;
  if (status === 'loading') {
    body = (
      <View style={s.grid} accessibilityLabel="Loading photos">
        {Array.from({ length: 6 }, (_, i) => <View key={i} style={[s.tile, { width: tile, height: tile }, s.skel]} />)}
      </View>
    );
  } else if (status === 'error') {
    body = (
      <View style={s.empty}>
        <Text style={s.emptyTitle}>Couldn't load photos</Text>
        <Pressable style={s.btn} onPress={load}><Text style={s.btnText}>Try again</Text></Pressable>
      </View>
    );
  } else if (hidden && !isSelf) {
    body = (
      <View style={s.empty}>
        <Lock size={24} color="rgba(255,255,255,0.6)" />
        <Text style={s.emptyTitle}>These photos are private</Text>
        <Text style={s.emptySub}>{ownerName}'s photos are visible to people they follow back.</Text>
      </View>
    );
  } else if (count === 0 && !uploading) {
    body = isSelf ? (
      <View style={s.empty}>
        <Camera size={24} color="rgba(255,255,255,0.6)" />
        <Text style={s.emptyTitle}>Share your first photo</Text>
        <Text style={s.emptySub}>{selfNote ? 'Photos you add show up here.' : 'Photos you add show up here for anyone who visits your profile.'}</Text>
        <Pressable style={[s.btn, { backgroundColor: t.primary }]} onPress={pickFiles}><Text style={s.btnText}>Add photos</Text></Pressable>
      </View>
    ) : (
      <View style={s.empty}>
        <Camera size={22} color="rgba(255,255,255,0.5)" />
        <Text style={s.emptyTitle}>No photos yet</Text>
      </View>
    );
  } else {
    body = (
      <View style={s.grid}>
        {[...pending].reverse().map((p) => (
          <View key={p.key} style={[s.tile, { width: tile, height: tile }]} accessibilityLabel="Uploading photo">
            <Image source={{ uri: p.preview }} style={[StyleSheet.absoluteFill, { opacity: 0.5 }]} />
            <ActivityIndicator color="#fff" />
          </View>
        ))}
        {ordered.map((photo, i) => {
          const likes = Number(photo.likeCount) || 0;
          return (
            <Pressable
              key={photo.photoId}
              style={[s.tile, { width: tile, height: tile }]}
              onPress={() => setOpenIndex(i)}
              accessibilityLabel={`Open photo ${i + 1} of ${count}${likes ? `, ${likes} ${likes === 1 ? 'like' : 'likes'}` : ''}`}
            >
              <Image source={{ uri: buildUrl(photo.photoUrl) || undefined }} style={StyleSheet.absoluteFill} />
              {likes > 0 && (
                <View style={s.tileMeta}>
                  <Svg width={13} height={13} viewBox="0 0 24 24"><Path d="M12 20.4s-8.4-5.5-8.4-11.2A4.7 4.7 0 0112 6.5a4.7 4.7 0 018.4 2.7c0 5.7-8.4 11.2-8.4 11.2z" fill="#fff" /></Svg>
                  <Text style={s.tileMetaText}>{likes.toLocaleString()}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={s.section} accessibilityLabel="Photos">
      <View style={s.strip}>
        <View style={s.tab}>
          <GridIcon />
          <Text style={s.tabText}>Photos</Text>
          {status === 'ready' && !hidden && count > 0 && <Text style={[s.count, { backgroundColor: t.soft, color: t.textAccent }]}>{count}</Text>}
        </View>
        {showAdd && (
          <Pressable style={s.add} onPress={pickFiles} disabled={uploading}>
            <Plus size={15} color="#fff" />
            <Text style={s.addText}>{uploading ? 'Adding…' : 'Add'}</Text>
          </Pressable>
        )}
      </View>
      {!!selfNote && (
        <View style={s.note}><Lock size={13} color="rgba(255,255,255,0.6)" /><Text style={s.noteText}>{selfNote}</Text></View>
      )}
      {isSelf && status === 'ready' && remaining === 0 && <Text style={s.cap}>You've reached the {max}-photo limit. Delete one to add another.</Text>}
      {!!uploadError && <Text style={s.error} accessibilityRole="alert">{uploadError}</Text>}
      {body}

      {openIndex !== -1 && ordered[openIndex] && (
        <PhotoViewer
          photos={ordered}
          index={openIndex}
          ownerName={ownerName}
          ownerAvatar={ownerAvatar}
          isSelf={isSelf}
          onClose={() => setOpenIndex(-1)}
          onIndexChange={setOpenIndex}
          onSetLiked={setLiked}
          onDelete={deletePhoto}
        />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  section: { marginVertical: 14 },
  strip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.15)', marginBottom: 10 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tabText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.4, textTransform: 'uppercase' },
  count: { fontSize: 11.5, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, overflow: 'hidden' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)' },
  addText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  noteText: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, flex: 1 },
  cap: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, marginBottom: 8 },
  error: { color: '#fca5a5', fontSize: 12.5, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  tile: { backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  skel: { backgroundColor: 'rgba(255,255,255,0.06)' },
  tileMeta: { position: 'absolute', left: 6, bottom: 5, flexDirection: 'row', alignItems: 'center', gap: 3 },
  tileMetaText: { color: '#fff', fontSize: 11.5, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  empty: { alignItems: 'center', paddingVertical: 26, gap: 8 },
  emptyTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  emptySub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },
  btn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: '700' },
});

const vs = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 8 },
  owner: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  avatar: { width: 30, height: 30, borderRadius: 15 },
  ownerName: { color: '#fff', fontWeight: '700', fontSize: 14, flexShrink: 1 },
  counter: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  slide: { width: SCREEN_W, flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: SCREEN_W, height: '100%' },
  burst: { position: 'absolute', top: '40%', alignSelf: 'center' },
  bottom: { paddingHorizontal: 16, paddingTop: 12 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  likes: { color: '#fff', fontWeight: '800', fontSize: 14, marginTop: 8 },
  date: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 },
  confirmWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  confirm: { backgroundColor: '#161922', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 10 },
  confirmTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  confirmText: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  confirmError: { color: '#fca5a5', fontSize: 13 },
  confirmBtn: { paddingVertical: 13, borderRadius: 14, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

export default ProfilePhotos;
