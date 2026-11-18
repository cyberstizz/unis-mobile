// src/components/QueuePanel.tsx
// ─────────────────────────────────────────────────────────────
// Mobile port of web src/QueuePanel.jsx — the "playback cockpit":
//   • header: Queue · N songs · M upcoming · your avatar
//   • now playing hero with scrubber + transport (shuffle, prev, play, next, repeat)
//   • Up next list. Songs poured in from a playlist share a coloured rail and
//     a "From <playlist>" label (tap to open it, Remove all for the group).
//   • Every removal asks first (inline "Remove? Cancel / Remove"), as on web.
//   • Overflow: Save queue as playlist · Clear queue (confirm).
// Reordering: web drags rows; here each row's grip opens Move up / Move down
// / Move to next (no drag library in the app yet).
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { openScreen } from '../navigation/navigationRef';
import {
  ArrowDown, ArrowUp, Bookmark, ChevronDown, ChevronRight, GripVertical, ListMusic, ListX,
  MoreHorizontal, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Trash2, User, X, CornerDownRight,
} from 'lucide-react-native';
import { usePlayer, NormalizedTrack } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import { useFeedback, errorMessage, FeedbackToasts } from '../context/FeedbackContext';
import { buildUrl } from '../utils/buildUrl';
import { useUnisTheme, mix } from '../theme/unisTheme';
import { PlayGlyph, PauseGlyph } from '../icons/UnisIcons';

const fmtClock = (ms: number) => {
  if (!ms || !isFinite(ms)) return '0:00';
  const sec = ms / 1000;
  return `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`;
};

const artOf = (t: any) => buildUrl(t?.artworkUrl || t?.artwork) || null;

type Confirming =
  | { kind: 'item'; qid: string }
  | { kind: 'group'; batchId: string; start: number }
  | { kind: 'clear' }
  | null;

interface RunInfo {
  batchId: string | null;
  start: number;
  end: number;
  isFirst: boolean;
  isLast: boolean;
  count: number;
  qids: string[];
}

const NowBars: React.FC<{ playing: boolean; color: string }> = ({ playing, color }) => (
  <View style={styles.bars}>
    {[0.55, 1, 0.75].map((h, i) => (
      <View key={i} style={[styles.bar, { height: 14 * (playing ? h : 0.35), backgroundColor: color }]} />
    ))}
  </View>
);

const QueuePanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const insets = useSafeAreaInsets();
  const t = useUnisTheme();
  const { user } = useAuth();
  const feedback = useFeedback();
  const {
    queue, currentIndex, currentMedia, removeQueueItems, moveQueueItem, clearQueue, saveQueueAsPlaylist,
    playQueueIndex, isShuffled, toggleShuffle, isPlaying, togglePlayPause, next, prev, repeatMode, cycleRepeat,
    position, duration, seekTo,
  } = usePlayer();

  const [confirming, setConfirming] = useState<Confirming>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveFor, setMoveFor] = useState<number | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [seekPreview, setSeekPreview] = useState<number | null>(null);
  const barWidth = useRef(1);
  const durationRef = useRef(0);
  durationRef.current = duration;

  useEffect(() => {
    if (!open) {
      setConfirming(null);
      setMenuOpen(false);
      setMoveFor(null);
    }
  }, [open]);

  const runs = useMemo<RunInfo[]>(() => {
    const info: RunInfo[] = new Array(queue.length);
    let i = 0;
    while (i < queue.length) {
      const batch = queue[i]?.origin?.batchId || null;
      let j = i;
      while (batch && j + 1 < queue.length && queue[j + 1]?.origin?.batchId === batch) j++;
      const qids = queue.slice(i, j + 1).map((x) => x.qid);
      for (let k = i; k <= j; k++) info[k] = { batchId: batch, start: i, end: j, isFirst: k === i, isLast: k === j, count: j - i + 1, qids };
      i = j + 1;
    }
    return info;
  }, [queue]);

  const seekPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => setSeekPreview(Math.min(1, Math.max(0, e.nativeEvent.locationX / barWidth.current))),
        onPanResponderMove: (e) => setSeekPreview(Math.min(1, Math.max(0, e.nativeEvent.locationX / barWidth.current))),
        onPanResponderRelease: (e) => {
          const r = Math.min(1, Math.max(0, e.nativeEvent.locationX / barWidth.current));
          seekTo(r * durationRef.current);
          setSeekPreview(null);
        },
        onPanResponderTerminate: () => setSeekPreview(null),
      }),
    [seekTo],
  );

  if (!open) return null;

  const currentQid = queue[currentIndex]?.qid;
  const upcomingCount = Math.max(0, queue.length - currentIndex - 1);
  const nowPlaying = currentMedia || queue[currentIndex] || null;
  const progress = seekPreview ?? (duration ? Math.min(1, position / duration) : 0);
  const elapsed = seekPreview != null ? seekPreview * duration : position;
  const avatarUrl = buildUrl(user?.photoUrl);
  const initial = user?.username ? user.username.charAt(0).toUpperCase() : '';

  const openPlaylist = (playlistId?: string) => {
    if (!playlistId) return;
    onClose();
    openScreen('Playlist', { playlistId });
  };

  const handleSave = async () => {
    const name = saveName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const playlistId = await saveQueueAsPlaylist(name);
      setSaveOpen(false);
      setSaveName('');
      feedback.success(
        `Saved your queue as “${name}”`,
        playlistId ? { action: { label: 'View', onClick: () => openPlaylist(playlistId) } } : undefined,
      );
    } catch (error) {
      console.error('Failed to save queue:', error);
      feedback.error(errorMessage(error, "Couldn't save your queue as a playlist. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const renderRow = (track: NormalizedTrack, index: number) => {
    const isCurrent = index === currentIndex;
    const isPast = index < currentIndex;
    const run = runs[index];
    const origin = track.origin;
    const inGroup = !!(origin && origin.type === 'playlist');
    const confirmingThis = confirming?.kind === 'item' && confirming.qid === track.qid;
    const removableInGroup = run && inGroup ? run.qids.filter((q) => q !== currentQid) : [];
    const confirmingGroup = confirming?.kind === 'group' && run && confirming.batchId === run.batchId && confirming.start === run.start;
    const art = artOf(track);

    return (
      <View key={track.qid} style={inGroup ? [styles.railed, { borderLeftColor: t.border }, run?.isFirst && styles.railFirst, run?.isLast && styles.railLast] : undefined}>
        {inGroup && run?.isFirst && origin && (
          <View style={styles.groupLabel}>
            {confirmingGroup ? (
              <View style={styles.confirmRow}>
                <Text style={styles.confirmQ} numberOfLines={2}>
                  Remove {removableInGroup.length} song{removableInGroup.length !== 1 ? 's' : ''} from {'“'}{origin.name}{'”'}?
                </Text>
                <Pressable onPress={() => setConfirming(null)} style={styles.confirmCancel}><Text style={styles.confirmCancelText}>Cancel</Text></Pressable>
                <Pressable onPress={() => { setConfirming(null); removeQueueItems(removableInGroup); }} style={styles.confirmGo}><Text style={styles.confirmGoText}>Remove</Text></Pressable>
              </View>
            ) : (
              <>
                <Pressable onPress={() => openPlaylist(origin.playlistId)} style={styles.groupLink} accessibilityLabel={`Open ${origin.name}`}>
                  {origin.coverUrl ? (
                    <Image source={{ uri: origin.coverUrl }} style={styles.groupCover} />
                  ) : (
                    <View style={[styles.groupCover, styles.groupCoverEmpty]}><ListMusic size={11} color="rgba(255,255,255,0.6)" /></View>
                  )}
                  <Text style={styles.groupFrom}>From</Text>
                  <Text style={styles.groupName} numberOfLines={1}>{origin.name}</Text>
                  <ChevronRight size={13} color="rgba(255,255,255,0.5)" />
                </Pressable>
                <Text style={styles.groupCount}>{run.count}</Text>
                {removableInGroup.length > 1 && (
                  <Pressable onPress={() => setConfirming({ kind: 'group', batchId: run.batchId as string, start: run.start })} style={styles.groupRemove}>
                    <X size={12} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.groupRemoveText}>Remove all</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        )}
        <Pressable
          onPress={() => { if (!confirmingThis) { setConfirming(null); playQueueIndex(index); } }}
          accessibilityRole="button"
          accessibilityState={{ selected: isCurrent }}
          style={({ pressed }) => [
            styles.item,
            isCurrent && { backgroundColor: t.soft, borderColor: t.border },
            isPast && { opacity: 0.5 },
            pressed && { backgroundColor: 'rgba(255,255,255,0.06)' },
          ]}
        >
          {isCurrent ? (
            <View style={styles.grip}><NowBars playing={isPlaying} color={t.primary2} /></View>
          ) : (
            <Pressable onPress={() => setMoveFor(index)} hitSlop={6} style={styles.grip} accessibilityLabel={`Reorder ${track.title || 'track'}`}>
              <GripVertical size={16} color="rgba(255,255,255,0.4)" />
            </Pressable>
          )}
          {art ? <Image source={{ uri: art }} style={styles.art} /> : <View style={[styles.art, { backgroundColor: t.soft }]} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, isCurrent && { color: t.textAccent }]} numberOfLines={1}>{track.title || 'Untitled'}</Text>
            <Text style={styles.artist} numberOfLines={1}>{track.artist || 'Unknown'}</Text>
          </View>
          {confirmingThis ? (
            <View style={styles.confirmInline}>
              <Text style={styles.confirmQ}>Remove?</Text>
              <Pressable onPress={() => setConfirming(null)} style={styles.confirmCancel}><Text style={styles.confirmCancelText}>Cancel</Text></Pressable>
              <Pressable onPress={() => { setConfirming(null); removeQueueItems([track.qid]); }} style={styles.confirmGo}><Text style={styles.confirmGoText}>Remove</Text></Pressable>
            </View>
          ) : (
            !isCurrent && (
              <Pressable
                onPress={() => setConfirming({ kind: 'item', qid: track.qid })}
                hitSlop={8}
                style={styles.remove}
                accessibilityLabel={`Remove ${track.title || 'track'} from queue`}
              >
                <Trash2 size={15} color="rgba(255,255,255,0.45)" />
              </Pressable>
            )
          )}
        </Pressable>
      </View>
    );
  };

  const moveTrack = moveFor != null ? queue[moveFor] : null;

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.container, { backgroundColor: mix(t.primary, '#08090d', 0.94), paddingTop: insets.top + 6 }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.iconBtn} accessibilityLabel="Close queue"><ChevronDown size={22} color="#fff" /></Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.h3}>Queue</Text>
            <Text style={styles.sub}>
              {queue.length} song{queue.length !== 1 ? 's' : ''}{upcomingCount > 0 ? ` · ${upcomingCount} upcoming` : ''}
            </Text>
          </View>
          <View style={[styles.avatar, { backgroundColor: t.soft }]}>
            {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImg} /> : initial ? <Text style={styles.avatarText}>{initial}</Text> : <User size={18} color="#fff" />}
          </View>
        </View>

        {nowPlaying && (
          <View style={styles.now}>
            {artOf(nowPlaying) && <Image source={{ uri: artOf(nowPlaying)! }} style={StyleSheet.absoluteFill} blurRadius={30} />}
            <LinearGradient colors={['rgba(8,9,13,0.55)', 'rgba(8,9,13,0.92)']} style={StyleSheet.absoluteFill} />
            <View style={styles.nowTop}>
              {artOf(nowPlaying) ? <Image source={{ uri: artOf(nowPlaying)! }} style={styles.nowArt} /> : <View style={[styles.nowArt, { backgroundColor: t.soft }]} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.nowKicker, { color: t.textAccent }]}>Now playing</Text>
                <Text style={styles.nowTitle} numberOfLines={1}>{nowPlaying.title || 'Untitled'}</Text>
                <Text style={styles.nowArtist} numberOfLines={1}>{nowPlaying.artist || 'Unknown'}</Text>
                {nowPlaying.origin?.type === 'playlist' && (
                  <Pressable onPress={() => openPlaylist(nowPlaying.origin?.playlistId)} style={styles.playingFrom}>
                    <Text style={styles.playingFromK}>Playing from</Text>
                    <Text style={styles.playingFromName} numberOfLines={1}>{nowPlaying.origin.name}</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <View style={styles.seek} onLayout={(e) => { barWidth.current = e.nativeEvent.layout.width || 1; }} {...seekPan.panHandlers}>
              <View style={styles.seekBar}>
                <View style={[styles.seekFill, { width: `${progress * 100}%`, backgroundColor: t.primary2 }]} />
                <View style={[styles.seekKnob, { left: `${progress * 100}%` }]} />
              </View>
            </View>
            <View style={styles.seekTimes}>
              <Text style={styles.time}>{fmtClock(elapsed)}</Text>
              <Text style={styles.time}>-{fmtClock(Math.max(0, duration - elapsed))}</Text>
            </View>

            <View style={styles.transport}>
              <Pressable onPress={toggleShuffle} style={styles.tbtn} accessibilityLabel={isShuffled ? 'Shuffle on' : 'Shuffle off'} accessibilityState={{ selected: isShuffled }}>
                <Shuffle size={18} color={isShuffled ? t.primary2 : 'rgba(255,255,255,0.6)'} />
              </Pressable>
              <Pressable onPress={prev} style={styles.tbtn} accessibilityLabel="Previous"><SkipBack size={22} color="#fff" fill="#fff" /></Pressable>
              <Pressable onPress={togglePlayPause} style={[styles.play, { backgroundColor: '#fff' }]} accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
                {isPlaying ? <PauseGlyph size={26} color="#0b0c10" /> : <PlayGlyph size={26} color="#0b0c10" />}
              </Pressable>
              <Pressable onPress={next} style={styles.tbtn} accessibilityLabel="Next"><SkipForward size={22} color="#fff" fill="#fff" /></Pressable>
              <Pressable onPress={cycleRepeat} style={styles.tbtn} accessibilityLabel={repeatMode === 'one' ? 'Repeat one' : repeatMode === 'all' ? 'Repeat all' : 'Repeat off'}>
                {repeatMode === 'one' ? <Repeat1 size={18} color={t.primary2} /> : <Repeat size={18} color={repeatMode === 'all' ? t.primary2 : 'rgba(255,255,255,0.6)'} />}
              </Pressable>
            </View>
          </View>
        )}

        {confirming?.kind === 'clear' ? (
          <View style={[styles.section, styles.confirmRow]}>
            <Text style={[styles.confirmQ, { flex: 1 }]}>Clear the entire queue? Playback will stop.</Text>
            <Pressable onPress={() => setConfirming(null)} style={styles.confirmCancel}><Text style={styles.confirmCancelText}>Cancel</Text></Pressable>
            <Pressable onPress={() => { setConfirming(null); clearQueue(); }} style={styles.confirmGo}><Text style={styles.confirmGoText}>Clear</Text></Pressable>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.sectionLabel}>Up next</Text>
              <Text style={styles.count}>{upcomingCount}</Text>
            </View>
            <View>
              <Pressable onPress={() => setMenuOpen((v) => !v)} style={styles.iconBtn} accessibilityLabel="Queue options">
                <MoreHorizontal size={20} color="#fff" />
              </Pressable>
              {menuOpen && (
                <View style={[styles.menu, { backgroundColor: mix(t.primary, '#14151b', 0.9) }]}>
                  <Pressable onPress={() => { setMenuOpen(false); setSaveOpen(true); }} style={styles.menuItem} disabled={queue.length === 0}>
                    <Bookmark size={15} color="#fff" /><Text style={styles.menuText}>Save as playlist</Text>
                  </Pressable>
                  <Pressable onPress={() => { setMenuOpen(false); if (queue.length) setConfirming({ kind: 'clear' }); }} style={styles.menuItem} disabled={queue.length === 0}>
                    <ListX size={15} color="#ff6b6b" /><Text style={[styles.menuText, { color: '#ff6b6b' }]}>Clear queue</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        )}

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 30 }}>
          {queue.length === 0 ? (
            <View style={styles.empty}>
              <ListMusic size={34} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyTitle}>Your queue is empty</Text>
              <Text style={styles.emptyHint}>Play a song or add tracks with "Play Next" or "Play Later"</Text>
            </View>
          ) : (
            queue.map(renderRow)
          )}
        </ScrollView>

        {/* Reorder actions for one row */}
        {moveTrack && moveFor != null && (
          <Pressable style={styles.moveBackdrop} onPress={() => setMoveFor(null)}>
            <View style={[styles.moveCard, { backgroundColor: mix(t.primary, '#14151b', 0.9), paddingBottom: insets.bottom + 12 }]}>
              <Text style={styles.moveTitle} numberOfLines={1}>{moveTrack.title}</Text>
              <Pressable style={styles.menuItem} disabled={moveFor === 0} onPress={() => { moveQueueItem(moveFor, moveFor - 1); setMoveFor(null); }}>
                <ArrowUp size={16} color={moveFor === 0 ? 'rgba(255,255,255,0.3)' : '#fff'} /><Text style={styles.menuText}>Move up</Text>
              </Pressable>
              <Pressable style={styles.menuItem} disabled={moveFor >= queue.length - 1} onPress={() => { moveQueueItem(moveFor, moveFor + 1); setMoveFor(null); }}>
                <ArrowDown size={16} color={moveFor >= queue.length - 1 ? 'rgba(255,255,255,0.3)' : '#fff'} /><Text style={styles.menuText}>Move down</Text>
              </Pressable>
              {moveFor > currentIndex + 1 || moveFor < currentIndex ? (
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    const to = moveFor < currentIndex ? currentIndex : currentIndex + 1;
                    moveQueueItem(moveFor, to);
                    setMoveFor(null);
                  }}
                >
                  <CornerDownRight size={16} color="#fff" /><Text style={styles.menuText}>Play next</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        )}

        {saveOpen && (
          <Pressable style={styles.moveBackdrop} onPress={() => !saving && setSaveOpen(false)}>
            <Pressable style={[styles.saveCard, { backgroundColor: mix(t.primary, '#14151b', 0.9) }]}>
              <Text style={styles.moveTitle}>Save Queue as Playlist</Text>
              <TextInput
                value={saveName}
                onChangeText={setSaveName}
                placeholder="Playlist name"
                placeholderTextColor="rgba(255,255,255,0.35)"
                autoFocus
                maxLength={100}
                style={styles.input}
                onSubmitEditing={handleSave}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <Pressable onPress={() => setSaveOpen(false)} style={styles.confirmCancel}><Text style={styles.confirmCancelText}>Cancel</Text></Pressable>
                <Pressable onPress={handleSave} disabled={!saveName.trim() || saving} style={[styles.confirmGo, { backgroundColor: t.primary }, (!saveName.trim() || saving) && { opacity: 0.5 }]}>
                  <Text style={styles.confirmGoText}>{saving ? 'Saving...' : 'Save'}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        )}
        <FeedbackToasts onlyAndroid />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  h3: { color: '#fff', fontSize: 17, fontWeight: '700' },
  sub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 36, height: 36 },
  avatarText: { color: '#fff', fontWeight: '700' },
  now: { marginHorizontal: 14, borderRadius: 20, overflow: 'hidden', padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  nowTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nowArt: { width: 76, height: 76, borderRadius: 12 },
  nowKicker: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  nowTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 2 },
  nowArtist: { color: 'rgba(255,255,255,0.65)', fontSize: 14, marginTop: 1 },
  playingFrom: { flexDirection: 'row', gap: 5, marginTop: 4, alignItems: 'center' },
  playingFromK: { color: 'rgba(255,255,255,0.45)', fontSize: 11.5 },
  playingFromName: { color: '#fff', fontSize: 11.5, fontWeight: '700', flexShrink: 1 },
  seek: { height: 26, justifyContent: 'center', marginTop: 14 },
  seekBar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)' },
  seekFill: { height: 4, borderRadius: 2 },
  seekKnob: { position: 'absolute', top: -5, width: 14, height: 14, borderRadius: 7, marginLeft: -7, backgroundColor: '#fff' },
  seekTimes: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { color: 'rgba(255,255,255,0.5)', fontSize: 11.5, fontVariant: ['tabular-nums'] },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 6 },
  tbtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  play: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6, zIndex: 5 },
  sectionLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
  count: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },
  menu: { position: 'absolute', right: 0, top: 42, width: 200, borderRadius: 14, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', elevation: 10, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 16 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  menuText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  railed: { borderLeftWidth: 2, marginLeft: 2, paddingLeft: 6 },
  railFirst: { borderTopLeftRadius: 6, marginTop: 6 },
  railLast: { borderBottomLeftRadius: 6, marginBottom: 6 },
  groupLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  groupLink: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  groupCover: { width: 18, height: 18, borderRadius: 4 },
  groupCoverEmpty: { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  groupFrom: { color: 'rgba(255,255,255,0.45)', fontSize: 12 },
  groupName: { color: '#fff', fontSize: 12.5, fontWeight: '700', flexShrink: 1 },
  groupCount: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '600' },
  groupRemove: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  groupRemoveText: { color: 'rgba(255,255,255,0.7)', fontSize: 11.5, fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', marginBottom: 2 },
  grip: { width: 24, alignItems: 'center', justifyContent: 'center', height: 40 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 14 },
  bar: { width: 3, borderRadius: 1.5 },
  art: { width: 44, height: 44, borderRadius: 8 },
  title: { color: '#fff', fontSize: 14.5, fontWeight: '600' },
  artist: { color: 'rgba(255,255,255,0.5)', fontSize: 12.5, marginTop: 1 },
  remove: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  confirmInline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  confirmQ: { color: '#fff', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  confirmCancel: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  confirmCancelText: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '600' },
  confirmGo: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#d63a3a' },
  confirmGoText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  emptyHint: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', paddingHorizontal: 30 },
  moveBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  moveCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 14, paddingHorizontal: 8 },
  moveTitle: { color: '#fff', fontSize: 16, fontWeight: '700', paddingHorizontal: 14, paddingBottom: 6 },
  saveCard: { margin: 20, marginBottom: 'auto', marginTop: 'auto', borderRadius: 20, padding: 18 },
  input: { color: '#fff', fontSize: 15, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginTop: 10 },
});

export default QueuePanel;
