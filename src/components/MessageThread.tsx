// src/components/MessageThread.tsx
// ─────────────────────────────────────────────────────────────
// One conversation — mobile port of web src/MessageThread.jsx (Oct 2026
// premium pass, two-lane backend).
//
//   Speed     • send as fast as you type — every message gets its own bubble
//               right away and they deliver in order behind the scenes
//             • a failed message stays put: "Not delivered · Tap to retry"
//             • reactions show instantly; double-tap drops a heart
//             • threads you've opened reopen instantly (utils/dmThreads)
//   History   • older messages page in as you scroll up; the conversation
//               starts with an intro card
//             • new messages never yank you down while you're reading back —
//               a "↓ New messages" pill appears instead
//   Touch     • long-press a bubble for the reaction bar + Copy
//             • tap a bubble to see its time (web: swipe left)
//             • vibration on Android (utils/dmFeedback)
//   Lanes     • request for me: Accept / Delete / Block bar (replying accepts)
//             • my request: one text-only message, then a "sent" note
//             • a brand-new conversation sends one message, then waits for
//               the server to decide the lane
//
// Plays go through requestPlay → PlayChoiceModal; the Player counts them.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import axiosInstance from '../services/axiosInstance';
import { useFeedback, errorMessage } from '../context/FeedbackContext';
import { usePlayer } from '../context/PlayerContext';
import { buildUrl } from '../utils/buildUrl';
import { fetchStandings } from '../utils/standings';
import {
  getThread, putThread, fetchLatest, fetchOlder, parseServerTime, PAGE_SIZE, THREAD_FRESH_MS,
} from '../utils/dmThreads';
import { haptic } from '../utils/dmFeedback';
import { openScreen } from '../navigation/navigationRef';
import { useUnisTheme, mix } from '../theme/unisTheme';
import {
  ArrowBackIcon, ArrowDownIcon, MoreIcon, ShareSongIcon, SupportIcon, SendIcon,
  CopyIcon, RetryIcon, CloseIcon, FindIcon, NoteIcon, PlayGlyph, PauseGlyph,
} from '../icons/UnisIcons';
import { DmAvatar, VerifiedCheck } from './messages/DmParts';
import SupportSheet from './SupportSheet';
import MessagePickerSheet, { PickResult } from './MessagePickerSheet';

const GROUP_GAP_MS = 5 * 60 * 1000;
const SITTING_GAP_MS = 60 * 60 * 1000;
const TYPING_RESEND_MS = 3000;
const TYPING_IDLE_MS = 4000;
const DOUBLE_TAP_MS = 280;
const NEAR_BOTTOM_PX = 96;
const JUMP_SHOW_PX = 640;
const ECHO_WINDOW_MS = 2 * 60 * 1000;
const TOAST_MS = 3600;

// Same set, same order as MessagingService.REACTIONS
const HEART = '❤️';
const REACTIONS = [HEART, '🔥', '😂', '😮', '😢', '👏'];
const REPORT_REASONS = ['Spam', 'Harassment or bullying', 'Something else'];

const keyOf = (m: any) => m._key || m.id;
const timeOf = (m: any) => parseServerTime(m.createdAt).getTime();

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function clock(iso: string) {
  return parseServerTime(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function pillLabel(iso: string) {
  const d = parseServerTime(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return `Today ${clock(iso)}`;
  if (sameDay(d, yesterday)) return `Yesterday ${clock(iso)}`;
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${clock(iso)}`;
}
function money(cents: number) {
  const value = (Number(cents) || 0) / 100;
  const [whole, frac] = value.toFixed(2).split('.');
  return { whole: `$${Number(whole).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`, frac: `.${frac}` };
}

function matchesTemp(temp: any, server: any) {
  return temp._temp && temp._status === 'sending'
    && temp.senderId === server.senderId
    && (temp.body || '') === (server.body || '')
    && String(temp.sharedSongId ?? '') === String(server.sharedSongId ?? '')
    && String(temp.supportPaymentId ?? '') === String(server.supportPaymentId ?? '')
    && timeOf(server) >= timeOf(temp) - ECHO_WINDOW_MS;
}

/** Fold the newest server page into what's on screen (see web mergeLatest). */
function mergeLatest(prev: any[], latest: any[]) {
  const claimed = new Set<string>();
  const adopted = new Map<string, string>();
  const temps: any[] = [];
  prev.forEach((t) => {
    if (!t._temp) return;
    const hit = t._status === 'sending' && latest.find((s) => !claimed.has(s.id) && matchesTemp(t, s));
    if (hit) { claimed.add(hit.id); adopted.set(hit.id, t._key); } else temps.push(t);
  });
  const prevKeys = new Map(prev.filter((m) => !m._temp && m._key).map((m) => [m.id, m._key]));
  const merged = latest.map((m) => {
    const k = adopted.get(m.id) || prevKeys.get(m.id);
    return k ? { ...m, _key: k } : m;
  });
  const real = prev.filter((m) => !m._temp);
  const latestIds = new Set(latest.map((m) => m.id));
  const newestPrev = real[real.length - 1];
  const gap = latest.length >= PAGE_SIZE && newestPrev && !latestIds.has(newestPrev.id) && timeOf(newestPrev) < timeOf(latest[0]);
  const firstAt = latest.length ? timeOf(latest[0]) : Infinity;
  const older = gap ? [] : real.filter((m) => !latestIds.has(m.id) && timeOf(m) < firstAt);
  return { list: [...older, ...merged, ...temps], gap: !!gap };
}

export interface ThreadConversation {
  id: string;
  otherUserId: string;
  otherUsername?: string | null;
  otherPhotoUrl?: string | null;
  otherRole?: string | null;
  otherSupportsMe?: boolean;
  otherJurisdictionName?: string | null;
  pending?: boolean;
  initiatedByMe?: boolean;
  _draft?: boolean;
  lane?: string;
  [k: string]: any;
}

interface Props {
  conversation: ThreadConversation;
  currentUserId: string;
  incomingMessage: any;
  incomingReaction: any;
  incomingRead: any;
  otherTyping?: boolean;
  otherOnline?: boolean;
  sendTyping?: (conversationId: string, typing: boolean) => void;
  onBack: () => void;
  onActivity?: (saved: any) => void;
  onAccepted?: () => void;
  onRequestGone?: () => void;
}

// ── Shared-song card ─────────────────────────────────────────
const TrackCard: React.FC<{ song: any; rank?: any; onPlay: () => void; onOpen: () => void; sending?: boolean }> = ({ song, rank, onPlay, onOpen, sending }) => {
  const t = useUnisTheme();
  if (!song) {
    return (
      <View style={[styles.track, { opacity: 0.7 }]}>
        <View style={[styles.trackArt, styles.trackArtBlank]}><NoteIcon size={22} tone="on" color="rgba(255,255,255,0.6)" /></View>
        <View style={{ gap: 6, flex: 1 }}>
          <View style={[styles.skelLine, { width: 120 }]} />
          <View style={[styles.skelLine, { width: 80 }]} />
        </View>
      </View>
    );
  }
  const art = song.artworkUrl ? buildUrl(song.artworkUrl) : null;
  return (
    <View style={[styles.track, sending && { opacity: 0.6 }]}>
      <Pressable onPress={onOpen} style={styles.trackOpen} accessibilityLabel={`Open ${song.title}`}>
        {art ? <Image source={{ uri: art }} style={styles.trackArt} /> : <View style={[styles.trackArt, styles.trackArtBlank]}><NoteIcon size={22} tone="on" color="rgba(255,255,255,0.6)" /></View>}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.trackTitle} numberOfLines={1}>{song.title}</Text>
          <Text style={styles.trackSub} numberOfLines={1}>{song.artist?.username || 'Unknown artist'}</Text>
          {rank && (
            <View style={styles.chips}>
              <Text style={[styles.rankChip, { backgroundColor: t.soft, color: t.textAccent }]}>#{rank.rank} {rank.place}</Text>
              {typeof rank.movement === 'number' && rank.movement !== 0 && (
                <Text style={[styles.move, { color: rank.movement > 0 ? '#4ade80' : '#f87171' }]}>
                  {rank.movement > 0 ? '▲' : '▼'} {Math.abs(rank.movement)}
                </Text>
              )}
            </View>
          )}
        </View>
      </Pressable>
      <Pressable onPress={onPlay} disabled={!song.fileUrl} style={[styles.trackPlay, { backgroundColor: t.primary }]} accessibilityLabel={`Play ${song.title}`}>
        <PlayGlyph size={18} color="#fff" />
      </Pressable>
    </View>
  );
};

const MessageThread: React.FC<Props> = ({
  conversation,
  currentUserId,
  incomingMessage,
  incomingReaction,
  incomingRead,
  otherTyping = false,
  otherOnline = false,
  sendTyping,
  onBack,
  onActivity,
  onAccepted,
  onRequestGone,
}) => {
  const insets = useSafeAreaInsets();
  const t = useUnisTheme();
  const feedback = useFeedback();
  const { requestPlay, currentMedia, isPlaying, togglePlayPause, setExpanded } = usePlayer();
  const me = currentUserId;

  const [messages, setMessages] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [toast, setToast] = useState<{ text: string; kind: string } | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStep, setMenuStep] = useState<'main' | 'block' | 'report' | 'reported'>('main');
  const [profile, setProfile] = useState<any>(null);
  const [songs, setSongs] = useState<Record<string, any>>({});
  const [ranks, setRanks] = useState<Record<string, any>>({});
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [action, setAction] = useState<any>(null); // message whose action bar is open
  const [showTimeFor, setShowTimeFor] = useState<string | null>(null);
  const [burstKey, setBurstKey] = useState<string | null>(null);
  const [requestBusy, setRequestBusy] = useState<'accept' | 'delete' | null>(null);
  const [jump, setJump] = useState({ far: false, unseen: 0 });

  const listRef = useRef<FlatList>(null);
  const messagesRef = useRef(messages);
  const hasMoreRef = useRef(hasMore);
  const mountedRef = useRef(true);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const atBottomRef = useRef(true);
  const lastKeyRef = useRef<string | null>(null);
  const olderBusy = useRef(false);
  const wasDraftRef = useRef(!!conversation._draft);
  const typingState = useRef<{ on: boolean; lastSent: number; idle: any }>({ on: false, lastSent: 0, idle: null });
  const lastTap = useRef<{ key: string | null; at: number }>({ key: null, at: 0 });
  const toastTimer = useRef<any>(null);
  const requestedSongs = useRef(new Set<string>());
  const requestedAmounts = useRef(new Set<string>());
  const burstAnim = useRef(new Animated.Value(0)).current;
  messagesRef.current = messages;
  hasMoreRef.current = hasMore;

  const otherId = conversation.otherUserId;
  const otherName = conversation.otherUsername || profile?.username || 'Member';
  const otherPhoto = conversation.otherPhotoUrl || profile?.photoUrl || null;
  const isDraft = !!conversation._draft;
  const role = String(conversation.otherRole || profile?.role || '').toLowerCase();
  const isArtist = role === 'artist';
  const place = conversation.otherJurisdictionName || profile?.jurisdiction?.name || null;

  const isRequestForMe = !isDraft && conversation.pending && !conversation.initiatedByMe;
  const myRequest = !isDraft && conversation.pending && conversation.initiatedByMe;
  const accepted = !isDraft && !conversation.pending;
  const iAlreadyAsked = myRequest && messages.some((m) => m.senderId === me && m._status !== 'failed');
  const textOnly = myRequest || isDraft;
  const draftLocked = isDraft && messages.some((m) => m.senderId === me && m._status !== 'failed');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = useCallback((text: string, kind = 'error') => {
    clearTimeout(toastTimer.current);
    setToast({ text, kind });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated }));
  }, []);

  // New message at the bottom: follow it only if it's mine or you're at the bottom.
  useEffect(() => {
    const last = messages[messages.length - 1];
    const lastKey = last ? keyOf(last) : null;
    if (lastKey && lastKeyRef.current !== null && lastKey !== lastKeyRef.current) {
      if (last.senderId === me || atBottomRef.current) scrollToBottom(true);
      else setJump((j) => ({ ...j, unseen: j.unseen + 1 }));
    }
    lastKeyRef.current = lastKey;
  }, [messages, me, scrollToBottom]);

  const loadOlder = useCallback(async () => {
    if (olderBusy.current || !hasMoreRef.current || isDraft) return;
    const oldest = messagesRef.current.find((m) => !m._temp);
    if (!oldest) return;
    olderBusy.current = true;
    setLoadingOlder(true);
    try {
      const { messages: older, hasMore: more } = await fetchOlder(conversation.id, oldest.createdAt);
      if (!mountedRef.current) return;
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !ids.has(m.id)), ...prev];
      });
      setHasMore(more);
    } catch (err: any) {
      console.error('[Messages] older messages failed:', err?.message || err);
      if (mountedRef.current) showToast('Couldn’t load older messages.');
    } finally {
      olderBusy.current = false;
      if (mountedRef.current) setLoadingOlder(false);
    }
  }, [conversation.id, isDraft, showToast]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y; // inverted: 0 = newest
    atBottomRef.current = y < NEAR_BOTTOM_PX;
    const far = y > JUMP_SHOW_PX;
    setJump((j) => {
      const unseen = atBottomRef.current ? 0 : j.unseen;
      return j.far === far && j.unseen === unseen ? j : { far, unseen };
    });
  };

  // Drafts / unknown roles — fetch who we're talking to.
  useEffect(() => {
    if (!isDraft && conversation.otherRole) return;
    let alive = true;
    axiosInstance
      .get(`/v1/users/profile/${otherId}`)
      .then((res) => { if (alive) setProfile(res.data || null); })
      .catch((err) => console.error('[Messages] profile load failed (header shows name only):', err?.message || err));
    return () => { alive = false; };
  }, [otherId, isDraft, conversation.otherRole]);

  // Load the thread (cached first, then the newest page).
  useEffect(() => {
    let alive = true;
    if (isDraft) {
      setLoading(false);
      setHasMore(false);
      return () => { alive = false; };
    }
    const id = conversation.id;
    if (wasDraftRef.current) {
      wasDraftRef.current = false;
      putThread(me, id, { messages: messagesRef.current.map((m) => ({ ...m, conversationId: id })), hasMore: false });
    }
    const cached = getThread(me, id);
    setLoadError(null);
    if (cached) {
      setMessages(cached.messages);
      setHasMore(cached.hasMore);
      setLoading(false);
    } else {
      setMessages([]);
      setHasMore(false);
      setLoading(true);
    }
    lastKeyRef.current = null;
    fetchLatest(me, id, { maxAgeMs: THREAD_FRESH_MS })
      .then(({ messages: latest, hasMore: more }) => {
        if (!alive) return;
        const prev = messagesRef.current;
        if (!prev.length) {
          setMessages(latest);
          setHasMore(more);
        } else {
          const { list, gap } = mergeLatest(prev, latest);
          setMessages(list);
          setHasMore(cached && !gap ? hasMoreRef.current : more);
        }
        axiosInstance.post(`/v1/conversations/${id}/read`).catch((err) => console.error('[Messages] mark-read failed:', err?.message || err));
      })
      .catch((err) => {
        console.error('[Messages] thread load failed:', err?.message || err);
        if (!alive) return;
        if (cached) showToast('Couldn’t refresh this conversation.');
        else setLoadError('Couldn’t load this conversation.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [conversation.id, isDraft, me, reloadTick, showToast]);

  useEffect(() => {
    if (isDraft || loading || loadError) return;
    putThread(me, conversation.id, { messages: messages.filter((m) => !m._temp || m._status === 'failed'), hasMore });
  }, [messages, hasMore, isDraft, loading, loadError, me, conversation.id]);

  // ── Live events ──
  useEffect(() => {
    const msg = incomingMessage;
    if (!msg || msg.conversationId !== conversation.id) return;
    if (msg.senderId === me) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        const i = prev.findIndex((m) => matchesTemp(m, msg));
        if (i >= 0) {
          const next = prev.slice();
          next[i] = { ...msg, _key: prev[i]._key };
          return next;
        }
        return [...prev, msg];
      });
      return;
    }
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    axiosInstance.post(`/v1/conversations/${conversation.id}/read`).catch((err) => console.error('[Messages] mark-read failed:', err?.message || err));
  }, [incomingMessage, conversation.id, me]);

  useEffect(() => {
    if (!incomingReaction || incomingReaction.conversationId !== conversation.id) return;
    setMessages((prev) => prev.map((m) => (m.id === incomingReaction.messageId ? { ...m, reactions: incomingReaction.reactions || [] } : m)));
  }, [incomingReaction, conversation.id]);

  useEffect(() => {
    if (!incomingRead || incomingRead.conversationId !== conversation.id) return;
    const readAt = parseServerTime(incomingRead.readAt).getTime();
    setMessages((prev) => prev.map((m) => (m.senderId === me && !m._temp && !m.read && timeOf(m) <= readAt ? { ...m, read: true } : m)));
  }, [incomingRead, conversation.id, me]);

  const typingShown = otherTyping && accepted;
  useEffect(() => {
    if (typingShown && atBottomRef.current) scrollToBottom(true);
  }, [typingShown, scrollToBottom]);

  // ── Shared songs + support amounts ──
  const songIds = useMemo(
    () => [...new Set(messages.filter((m) => m.sharedSongId && m.supportPaymentId == null).map((m) => String(m.sharedSongId)))],
    [messages],
  );
  useEffect(() => {
    const missing = songIds.filter((id) => !requestedSongs.current.has(id));
    if (!missing.length) return;
    missing.forEach((id) => requestedSongs.current.add(id));
    Promise.allSettled(missing.map((id) => axiosInstance.get(`/v1/media/song/${id}`))).then((results) => {
      if (!mountedRef.current) return;
      const next: Record<string, any> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') next[missing[i]] = r.value.data;
        else console.error('[Messages] shared song load failed:', (r as any).reason?.message || (r as any).reason);
      });
      setSongs((prev) => ({ ...prev, ...next }));
      const byPlace: Record<string, { name: string; ids: string[] }> = {};
      Object.entries(next).forEach(([id, song]) => {
        const j = song?.jurisdiction;
        if (!j?.jurisdictionId) return;
        if (!byPlace[j.jurisdictionId]) byPlace[j.jurisdictionId] = { name: j.name, ids: [] };
        byPlace[j.jurisdictionId].ids.push(id);
      });
      Object.entries(byPlace).forEach(([jurisdictionId, { name, ids }]) => {
        fetchStandings({ type: 'song', jurisdictionId, genre: 'all', period: 'daily', limit: 50 })
          .then((board) => {
            if (!mountedRef.current || board.state !== 'LIVE') return;
            const found: Record<string, any> = {};
            board.entries.forEach((e) => {
              if (ids.includes(String(e.id)) && e.points > 0) found[String(e.id)] = { rank: e.rank, movement: e.movement, place: name };
            });
            setRanks((prev) => ({ ...prev, ...found }));
          })
          .catch((err) => console.error('[Messages] shared song rank failed (chip hidden):', err?.message || err));
      });
    });
  }, [songIds]);

  const supportIds = useMemo(
    () => [...new Set(messages.filter((m) => m.supportPaymentId != null).map((m) => String(m.supportPaymentId)))],
    [messages],
  );
  useEffect(() => {
    const missing = supportIds.filter((id) => !requestedAmounts.current.has(id) && !(id in amounts));
    if (!missing.length) return;
    missing.forEach((id) => requestedAmounts.current.add(id));
    Promise.allSettled([axiosInstance.get('/v1/support/sent'), axiosInstance.get('/v1/support/received')]).then((results) => {
      if (!mountedRef.current) return;
      const next: Record<string, number> = {};
      results.forEach((r) => {
        if (r.status !== 'fulfilled') {
          console.error('[Messages] support history load failed (amount hidden):', (r as any).reason?.message || (r as any).reason);
          return;
        }
        (Array.isArray(r.value.data) ? r.value.data : []).forEach((p: any) => {
          if (p?.id != null) next[String(p.id)] = p.amount;
        });
      });
      setAmounts((prev) => ({ ...prev, ...next }));
    });
  }, [supportIds, amounts]);

  // ── Typing out ──
  const stopTyping = useCallback(() => {
    const ts = typingState.current;
    clearTimeout(ts.idle);
    if (ts.on && accepted) sendTyping?.(conversation.id, false);
    ts.on = false;
  }, [accepted, conversation.id, sendTyping]);

  const noteTyping = useCallback((text: string) => {
    if (!accepted || !sendTyping) return;
    const ts = typingState.current;
    if (!text.trim()) { stopTyping(); return; }
    const now = Date.now();
    if (!ts.on || now - ts.lastSent > TYPING_RESEND_MS) {
      sendTyping(conversation.id, true);
      ts.on = true;
      ts.lastSent = now;
    }
    clearTimeout(ts.idle);
    ts.idle = setTimeout(stopTyping, TYPING_IDLE_MS);
  }, [accepted, sendTyping, conversation.id, stopTyping]);

  useEffect(() => () => stopTyping(), [stopTyping]);

  // ── Sending (queued, in order) ──
  const post = useCallback(async (data: any) => {
    const res = await axiosInstance.post('/v1/messages', { recipientId: otherId, source: 'dm', ...data });
    return res.data;
  }, [otherId]);

  const deliver = useCallback((temp: any) => {
    const after = isRequestForMe ? onAccepted : onActivity;
    queueRef.current = queueRef.current.then(async () => {
      try {
        const saved = await post(temp._payload);
        if (!mountedRef.current) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === saved.id)) return prev.filter((m) => m._key !== temp._key || m.id === saved.id);
          return prev.map((m) => (m._key === temp._key ? { ...saved, _key: temp._key } : m));
        });
        (after as any)?.(saved);
      } catch (e: any) {
        console.error('[Messages] send failed:', e?.message || e);
        if (!mountedRef.current) return;
        const reason = e?.response?.data?.error || null;
        setMessages((prev) => prev.map((m) => (m._key === temp._key ? { ...m, _status: 'failed', _error: reason } : m)));
        haptic('error');
        showToast(reason || errorMessage(e, 'Message not sent. Tap it to try again.'));
      }
    });
  }, [post, isRequestForMe, onAccepted, onActivity, showToast]);

  const enqueue = useCallback((payload: any) => {
    const key = `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const temp = {
      id: key,
      _key: key,
      _temp: true,
      _status: 'sending',
      _payload: payload,
      conversationId: conversation.id,
      senderId: me,
      body: payload.body || '',
      sharedSongId: payload.sharedSongId ?? null,
      supportPaymentId: payload.supportPaymentId ?? null,
      createdAt: new Date().toISOString(),
      read: false,
      reactions: [],
    };
    setMessages((prev) => [...prev, temp]);
    haptic('send');
    deliver(temp);
  }, [conversation.id, me, deliver]);

  const send = useCallback(() => {
    const body = draft.trim();
    if (!body || draftLocked) return;
    setDraft('');
    stopTyping();
    enqueue({ body });
  }, [draft, draftLocked, stopTyping, enqueue]);

  const retry = useCallback((m: any) => {
    haptic('tap');
    const again = { ...m, _status: 'sending', _error: null, createdAt: new Date().toISOString() };
    setMessages((prev) => prev.map((x) => (x._key === m._key ? again : x)));
    deliver(again);
  }, [deliver]);

  const removeFailed = useCallback((m: any) => setMessages((prev) => prev.filter((x) => x._key !== m._key)), []);

  const shareSong = useCallback((result: PickResult) => {
    setShareOpen(false);
    setSongs((prev) => (prev[result.id] ? prev : {
      ...prev,
      [result.id]: { songId: result.id, title: result.name, artworkUrl: result.artworkUrl, artist: { username: result.subtitle } },
    }));
    enqueue({ sharedSongId: result.id, body: '' });
  }, [enqueue]);

  const handleSupportSent = useCallback(({ supportId, note, amount }: any) => {
    if (supportId == null) return;
    if (amount != null) setAmounts((prev) => ({ ...prev, [String(supportId)]: amount }));
    requestedAmounts.current.add(String(supportId));
    enqueue({ body: note || '', supportPaymentId: supportId });
    haptic('success');
  }, [enqueue]);

  // ── Requests ──
  const acceptRequest = async () => {
    setRequestBusy('accept');
    try {
      await axiosInstance.post(`/v1/conversations/${conversation.id}/accept`);
      haptic('success');
      feedback.success(`You can now message ${otherName}`);
      onAccepted?.();
    } catch (e) {
      console.error('[Messages] accept failed:', e);
      feedback.error(errorMessage(e, 'Couldn’t accept this request. Try again.'));
    } finally {
      if (mountedRef.current) setRequestBusy(null);
    }
  };

  const deleteRequest = async () => {
    setRequestBusy('delete');
    try {
      await axiosInstance.post(`/v1/conversations/${conversation.id}/decline`);
      feedback.success(`Request from ${otherName} deleted`);
      onRequestGone?.();
    } catch (e) {
      console.error('[Messages] delete request failed:', e);
      feedback.error(errorMessage(e, 'Couldn’t delete this request. Try again.'));
      if (mountedRef.current) setRequestBusy(null);
    }
  };

  const block = async () => {
    try {
      await axiosInstance.post(`/v1/users/${otherId}/block`);
      setMenuOpen(false);
      setMenuStep('main');
      feedback.success(`${otherName} is blocked — they can't message you`);
      onRequestGone?.();
    } catch (e) {
      console.error('[Messages] block failed:', e);
      feedback.error(errorMessage(e, `Couldn’t block ${otherName}. Try again.`));
      setMenuOpen(false);
      setMenuStep('main');
    }
  };

  const report = async (reason: string) => {
    try {
      await axiosInstance.post('/v1/messages/report', { reportedUserId: otherId, reason });
      setMenuStep('reported');
      feedback.success('Report sent — our moderators will take it from here');
    } catch (e) {
      console.error('[Messages] report failed:', e);
      feedback.error(errorMessage(e, 'Couldn’t send that report. Try again.'));
      setMenuOpen(false);
      setMenuStep('main');
    }
  };

  // ── Reactions ──
  const react = useCallback(async (m: any, emoji: string, { add = false } = {}) => {
    setAction(null);
    if (!accepted || m._temp) return;
    const before = m.reactions || [];
    const mine = before.find((r: any) => r.userId === me);
    if (add && mine?.emoji === emoji) { haptic('react'); return; }
    const next = before.filter((r: any) => r.userId !== me);
    if (mine?.emoji !== emoji) next.push({ userId: me, emoji });
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: next } : x)));
    haptic('react');
    try {
      const res = await axiosInstance.post(`/v1/messages/${m.id}/reaction`, { emoji });
      if (mountedRef.current && Array.isArray(res.data)) {
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: res.data } : x)));
      }
    } catch (e: any) {
      console.error('[Messages] reaction failed:', e?.message || e);
      if (!mountedRef.current) return;
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: before } : x)));
      showToast(e?.response?.data?.error || 'Couldn’t add that reaction.');
    }
  }, [accepted, me, showToast]);

  const heart = useCallback((m: any) => {
    if (!accepted || m._temp) return;
    setBurstKey(keyOf(m));
    burstAnim.setValue(0);
    Animated.timing(burstAnim, { toValue: 1, duration: 820, useNativeDriver: true }).start(() => setBurstKey(null));
    react(m, HEART, { add: true });
  }, [accepted, react, burstAnim]);

  const copyText = useCallback(async (m: any) => {
    setAction(null);
    try {
      await Clipboard.setStringAsync(m.body || '');
      haptic('tap');
      showToast('Copied', 'info');
    } catch (err) {
      console.error('[Messages] copy failed:', err);
      showToast('Couldn’t copy that message.');
    }
  }, [showToast]);

  const openActions = useCallback((m: any) => {
    const canReact = accepted && !m._temp;
    const canCopy = !!(m.body || '').trim();
    if (!canReact && !canCopy) return;
    haptic('press');
    setAction(m);
  }, [accepted]);

  const onBubblePress = (m: any) => {
    const k = keyOf(m);
    const now = Date.now();
    if (accepted && !m._temp && lastTap.current.key === k && now - lastTap.current.at < DOUBLE_TAP_MS) {
      lastTap.current = { key: null, at: 0 };
      heart(m);
      return;
    }
    lastTap.current = { key: k, at: now };
    setShowTimeFor((cur) => (cur === k ? null : k));
  };

  const playSong = (song: any) => {
    if (!song?.fileUrl) return;
    const url = buildUrl(song.fileUrl);
    const art = buildUrl(song.artworkUrl);
    requestPlay({
      type: 'song', id: song.songId, songId: song.songId, url, fileUrl: url, title: song.title,
      artist: song.artist?.username, artistId: song.artist?.userId, artwork: art, artworkUrl: art, source: 'dm',
    });
  };

  const openProfile = () => {
    setMenuOpen(false);
    onBack();
    setTimeout(() => openScreen(isArtist ? 'Artist' : 'Listener', isArtist ? { artistId: otherId } : { userId: otherId }), 250);
  };

  const jumpToBottom = () => {
    haptic('tap');
    atBottomRef.current = true;
    setJump({ far: false, unseen: 0 });
    scrollToBottom(true);
  };

  // Rows oldest → newest with dividers, then reversed for the inverted list.
  const rows = useMemo(() => {
    const out: any[] = [];
    messages.forEach((m, i) => {
      const prev = messages[i - 1];
      const next = messages[i + 1];
      const tm = timeOf(m);
      const d = parseServerTime(m.createdAt);
      const pill = !prev || !sameDay(parseServerTime(prev.createdAt), d) || tm - timeOf(prev) > SITTING_GAP_MS;
      if (pill) out.push({ kind: 'pill', id: `pill-${keyOf(m)}`, label: pillLabel(m.createdAt) });
      const joinsPrev = prev && !pill && prev.senderId === m.senderId && tm - timeOf(prev) < GROUP_GAP_MS;
      const joinsNext = next && next.senderId === m.senderId && timeOf(next) - tm < GROUP_GAP_MS && sameDay(parseServerTime(next.createdAt), d);
      out.push({ kind: 'msg', id: keyOf(m), m, first: !joinsPrev, last: !joinsNext });
    });
    const lastMsg = messages[messages.length - 1];
    if (typingShown) out.push({ kind: 'typing', id: '__typing' });
    else if (accepted && lastMsg && lastMsg.senderId === me && lastMsg.read && !lastMsg._temp) out.push({ kind: 'seen', id: '__seen' });
    return out.reverse();
  }, [messages, typingShown, accepted, me]);

  const canSend = !!draft.trim() && !draftLocked;
  const mineBg = t.primary;
  const theirsBg = 'rgba(255,255,255,0.08)';

  const renderMessage = ({ m, first, last }: any) => {
    const k = keyOf(m);
    const mine = m.senderId === me;
    const isSupport = m.supportPaymentId != null;
    const isTrack = m.sharedSongId != null && !isSupport;
    const sending = m._status === 'sending';
    const failed = m._status === 'failed';
    const canReact = accepted && !m._temp;
    const radius = {
      borderTopLeftRadius: !mine && !first ? 6 : 20,
      borderBottomLeftRadius: !mine && !last ? 6 : 20,
      borderTopRightRadius: mine && !first ? 6 : 20,
      borderBottomRightRadius: mine && !last ? 6 : 20,
    };

    let content: React.ReactNode;
    if (isSupport) {
      const cents = amounts[String(m.supportPaymentId)];
      const amt = cents != null ? money(cents) : null;
      content = (
        <Pressable onPress={() => onBubblePress(m)} onLongPress={() => openActions(m)} delayLongPress={420}>
          <View style={[styles.support, { borderColor: '#22c55e55' }, radius]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <SupportIcon size={15} tone="on" color="#4ade80" />
              <Text style={styles.supportTop}>{mine ? 'Support sent' : `${otherName} sent support`}</Text>
            </View>
            {amt && <Text style={styles.supportAmount}>{amt.whole}<Text style={styles.supportFrac}>{amt.frac}</Text></Text>}
            {!!m.body && <Text style={styles.supportNote}>{m.body}</Text>}
          </View>
        </Pressable>
      );
    } else if (isTrack) {
      const song = songs[String(m.sharedSongId)];
      content = (
        <>
          <TrackCard
            song={song}
            rank={ranks[String(m.sharedSongId)]}
            onPlay={() => playSong(song)}
            onOpen={() => { if (song?.songId) { onBack(); setTimeout(() => openScreen('Song', { songId: song.songId }), 250); } }}
            sending={sending}
          />
          {!!m.body && (
            <Pressable onPress={() => onBubblePress(m)} onLongPress={() => openActions(m)} delayLongPress={420} style={({ pressed }) => pressed && { transform: [{ scale: 0.97 }] }}>
              <View style={[styles.bubble, { backgroundColor: mine ? mineBg : theirsBg, marginTop: 4 }, radius]}>
                <Text style={styles.bubbleText}>{m.body}</Text>
              </View>
            </Pressable>
          )}
        </>
      );
    } else {
      content = (
        <Pressable onPress={() => (failed ? retry(m) : onBubblePress(m))} onLongPress={() => openActions(m)} delayLongPress={420} style={({ pressed }) => pressed && { transform: [{ scale: 0.97 }] }}>
          <View style={[styles.bubble, { backgroundColor: mine ? mineBg : theirsBg }, radius, sending && { opacity: 0.7 }, failed && styles.failedBubble]}>
            <Text style={styles.bubbleText}>{m.body}</Text>
          </View>
        </Pressable>
      );
    }

    const groups: { emoji: string; count: number; mine: boolean }[] = [];
    (m.reactions || []).forEach((r: any) => {
      const g = groups.find((x) => x.emoji === r.emoji);
      if (g) { g.count += 1; g.mine = g.mine || r.userId === me; } else groups.push({ emoji: r.emoji, count: 1, mine: r.userId === me });
    });

    return (
      <View style={[styles.line, mine ? styles.lineMine : styles.lineTheirs, first && { marginTop: 8 }]}>
        {!mine && (
          <View style={styles.face}>{last ? <DmAvatar name={otherName} photoUrl={otherPhoto} size={28} /> : null}</View>
        )}
        <View style={[styles.stack, mine ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}>
          {content}
          {groups.length > 0 && (
            <View style={[styles.reacts, mine ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
              {groups.map((g) => (
                <Pressable
                  key={g.emoji}
                  disabled={!canReact}
                  onPress={() => react(m, g.emoji)}
                  style={[styles.react, g.mine && { borderColor: t.border, backgroundColor: t.soft }]}
                  accessibilityLabel={`${g.emoji} ${g.count}${g.mine ? ', yours — tap to remove' : ''}`}
                >
                  <Text style={styles.reactEmoji}>{g.emoji}</Text>
                  {g.count > 1 && <Text style={styles.reactN}>{g.count}</Text>}
                </Pressable>
              ))}
            </View>
          )}
          {burstKey === k && (
            <Animated.Text
              style={[
                styles.burst,
                {
                  opacity: burstAnim.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                  transform: [
                    { scale: burstAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.4, 1.1] }) },
                    { translateY: burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -30] }) },
                  ],
                },
              ]}
            >
              {HEART}
            </Animated.Text>
          )}
          {failed && (
            <View style={styles.failedRow}>
              <Pressable onPress={() => retry(m)} style={styles.failedRetry}>
                <RetryIcon size={14} tone="on" color="#ff8a8a" />
                <Text style={styles.failedText}>Not delivered · Tap to retry</Text>
              </Pressable>
              <Pressable onPress={() => removeFailed(m)} hitSlop={8} accessibilityLabel="Remove this message">
                <CloseIcon size={13} tone="on" color="#ff8a8a" />
              </Pressable>
            </View>
          )}
          {(showTimeFor === k || (sending && last)) && (
            <Text style={styles.stamp}>{sending ? 'Sending…' : clock(m.createdAt)}</Text>
          )}
        </View>
      </View>
    );
  };

  const renderItem = ({ item }: { item: any }) => {
    if (item.kind === 'pill') return <Text style={styles.pill}>{item.label}</Text>;
    if (item.kind === 'typing') {
      return (
        <View style={[styles.line, styles.lineTheirs, { marginTop: 8 }]} accessibilityLabel={`${otherName} is typing`}>
          <View style={styles.face}><DmAvatar name={otherName} photoUrl={otherPhoto} size={28} /></View>
          <View style={[styles.typing, { backgroundColor: theirsBg }]}>
            {[0, 1, 2].map((i) => <View key={i} style={styles.typingDot} />)}
          </View>
        </View>
      );
    }
    if (item.kind === 'seen') {
      return (
        <View style={styles.seen}>
          <Text style={styles.seenText}>Seen</Text>
          <DmAvatar name={otherName} photoUrl={otherPhoto} size={16} />
        </View>
      );
    }
    return renderMessage(item);
  };

  const intro = !loading && !loadError && !hasMore ? (
    <View style={styles.intro}>
      <DmAvatar name={otherName} photoUrl={otherPhoto} size={84} ring={!!conversation.otherSupportsMe} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
        <Text style={styles.introName}>{otherName}</Text>
        {isArtist && <VerifiedCheck size={18} />}
      </View>
      {(!!role || !!place) && (
        <Text style={styles.introSub}>
          {role ? (isArtist ? 'Artist' : 'Listener') : ''}
          {role && place ? ' · ' : ''}
          {place}
        </Text>
      )}
      <Pressable onPress={openProfile} style={styles.introBtn}><Text style={styles.introBtnText}>View profile</Text></Pressable>
      {messages.length === 0 && (
        <Text style={styles.introHint}>
          {isDraft || myRequest
            ? `Say hi to ${otherName}. If you don’t know each other yet, your first message goes to their Requests.`
            : `Say something to ${otherName}.`}
        </Text>
      )}
    </View>
  ) : hasMore ? (
    <View style={{ paddingVertical: 14, alignItems: 'center' }}>{loadingOlder ? <ActivityIndicator color={t.primary2} /> : null}</View>
  ) : null;

  const myEmoji = action ? (action.reactions || []).find((r: any) => r.userId === me)?.emoji : null;

  return (
    <View style={[styles.root, { backgroundColor: mix(t.primary, '#07090f', 0.95) }]}>
      {/* Header */}
      <View style={[styles.head, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={onBack} style={styles.round} accessibilityLabel="Back to messages">
          <ArrowBackIcon size={22} color="#fff" />
        </Pressable>
        <Pressable onPress={openProfile} style={styles.who} accessibilityLabel={`View ${otherName}'s profile`}>
          <DmAvatar name={otherName} photoUrl={otherPhoto} size={40} ring={!!conversation.otherSupportsMe} online={otherOnline} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={styles.name} numberOfLines={1}>{otherName}</Text>
              {isArtist && <VerifiedCheck />}
            </View>
            {(otherOnline || !!place) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                {otherOnline && <Text style={styles.active}>Active now</Text>}
                {!!place && (
                  <View style={[styles.chip, { backgroundColor: t.subtle }]}>
                    <FindIcon size={11} tone="on" color={t.textAccent} />
                    <Text style={[styles.chipText, { color: t.textAccent }]} numberOfLines={1}>{place}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </Pressable>
        {currentMedia && (
          <View style={styles.np}>
            <Pressable onPress={() => setExpanded(true)} accessibilityLabel={`Now playing: ${currentMedia.title}. Open the player`}>
              {currentMedia.artwork ? <Image source={{ uri: currentMedia.artwork }} style={styles.npArt} /> : <View style={[styles.npArt, { backgroundColor: t.soft }]} />}
            </Pressable>
            <Pressable onPress={togglePlayPause} style={styles.npToggle} accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <PauseGlyph size={14} color="#fff" /> : <PlayGlyph size={14} color="#fff" />}
            </Pressable>
          </View>
        )}
        <Pressable onPress={() => { setMenuOpen((o) => !o); setMenuStep('main'); }} style={styles.round} accessibilityLabel="Conversation options">
          <MoreIcon size={22} color="#fff" />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading && messages.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'flex-end', padding: 16, gap: 10 }}>
            {[['theirs', 62], ['theirs', 44], ['mine', 56], ['theirs', 38], ['mine', 70], ['mine', 34]].map(([side, w]) => (
              <View key={`${side}-${w}`} style={{ alignItems: side === 'mine' ? 'flex-end' : 'flex-start' }}>
                <View style={[styles.skelBubble, { width: `${w}%` as any }]} />
              </View>
            ))}
          </View>
        ) : loadError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable onPress={() => setReloadTick((n) => n + 1)}><Text style={[styles.link, { color: t.textAccent }]}>Try again</Text></Pressable>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            inverted
            keyExtractor={(r) => r.id}
            renderItem={renderItem}
            onScroll={onScroll}
            scrollEventThrottle={64}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.4}
            ListFooterComponent={intro}
            maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}
            keyboardShouldPersistTaps="handled"
            accessibilityLabel={`Conversation with ${otherName}`}
          />
        )}

        {(jump.unseen > 0 || jump.far) && (
          <Pressable onPress={jumpToBottom} style={[styles.jump, { backgroundColor: jump.unseen > 0 ? t.primary : 'rgba(30,31,38,0.95)' }]} accessibilityLabel={jump.unseen > 0 ? `${jump.unseen} new messages, jump to latest` : 'Jump to latest'}>
            <ArrowDownIcon size={17} tone="on" color="#fff" />
            {jump.unseen > 0 && <Text style={styles.jumpText}>{jump.unseen === 1 ? 'New message' : `${jump.unseen} new messages`}</Text>}
          </Pressable>
        )}

        {toast && (
          <View style={[styles.toast, toast.kind === 'error' ? styles.toastError : styles.toastInfo]} accessibilityLiveRegion="polite">
            <Text style={styles.toastText}>{toast.text}</Text>
          </View>
        )}

        {/* Composer */}
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {isRequestForMe && (
            <View style={styles.request}>
              <Text style={styles.requestLead}><Text style={{ fontWeight: '800' }}>{otherName}</Text> wants to message you</Text>
              <Text style={styles.requestSub}>They won&rsquo;t know you&rsquo;ve seen this until you accept. Replying accepts too.</Text>
              <View style={styles.requestActions}>
                <Pressable onPress={deleteRequest} disabled={!!requestBusy} style={styles.reqBtn}>
                  {requestBusy === 'delete' ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.reqBtnText}>Delete</Text>}
                </Pressable>
                <Pressable onPress={() => { setMenuOpen(true); setMenuStep('block'); }} disabled={!!requestBusy} style={styles.reqBtn}>
                  <Text style={[styles.reqBtnText, { color: '#ff6b6b' }]}>Block</Text>
                </Pressable>
                <Pressable onPress={acceptRequest} disabled={!!requestBusy} style={[styles.reqBtn, { backgroundColor: t.primary }]}>
                  {requestBusy === 'accept' ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.reqBtnText}>Accept</Text>}
                </Pressable>
              </View>
            </View>
          )}
          {iAlreadyAsked ? (
            <Text style={styles.composerNote}>Message request sent. You can send more once {otherName} accepts.</Text>
          ) : (
            <View style={styles.bar}>
              {!textOnly && (
                <Pressable onPress={() => { haptic('tap'); setShareOpen(true); }} style={styles.icon} accessibilityLabel="Share a song">
                  <ShareSongIcon size={22} color="rgba(255,255,255,0.75)" />
                </Pressable>
              )}
              <TextInput
                style={[styles.input, textOnly && { marginLeft: 4 }]}
                placeholder={myRequest ? 'Your one message request…' : `Message ${otherName}…`}
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={draft}
                multiline
                onChangeText={(v) => { setDraft(v); noteTyping(v); }}
                onBlur={stopTyping}
                accessibilityLabel={`Message ${otherName}`}
                maxLength={2000}
              />
              {!textOnly && isArtist && (
                <Pressable onPress={() => { haptic('tap'); setSupportOpen(true); }} style={[styles.icon, styles.supportBtn]} accessibilityLabel="Send support">
                  <SupportIcon size={21} tone="on" color="#fff" />
                </Pressable>
              )}
              <Pressable onPress={send} disabled={!canSend} style={[styles.send, { backgroundColor: canSend ? t.primary : 'rgba(255,255,255,0.1)' }]} accessibilityLabel="Send message">
                <SendIcon size={21} tone="on" color="#fff" />
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Long-press actions */}
      {action && (
        <Pressable style={styles.overlay} onPress={() => setAction(null)}>
          <View style={[styles.actions, { backgroundColor: mix(t.primary, '#14151b', 0.9) }]}>
            {accepted && !action._temp && (
              <View style={styles.emojiRow}>
                {REACTIONS.map((emoji) => (
                  <Pressable key={emoji} onPress={() => react(action, emoji)} style={[styles.emojiBtn, myEmoji === emoji && { backgroundColor: t.soft }]} accessibilityLabel={`React ${emoji}`}>
                    <Text style={styles.emoji}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {!!(action.body || '').trim() && (
              <Pressable onPress={() => copyText(action)} style={styles.actionBtn}>
                <CopyIcon size={17} color="#fff" />
                <Text style={styles.actionText}>Copy</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      )}

      {/* Conversation menu */}
      {menuOpen && (
        <Pressable style={styles.overlay} onPress={() => { setMenuOpen(false); setMenuStep('main'); }}>
          <Pressable style={[styles.menu, { top: insets.top + 56, backgroundColor: mix(t.primary, '#14151b', 0.9) }]}>
            {menuStep === 'main' && (
              <>
                <Pressable onPress={openProfile} style={styles.menuItem}><Text style={styles.menuText}>View profile</Text></Pressable>
                <Pressable onPress={() => setMenuStep('report')} style={styles.menuItem}><Text style={styles.menuText}>Report</Text></Pressable>
                <Pressable onPress={() => setMenuStep('block')} style={styles.menuItem}><Text style={[styles.menuText, { color: '#ff6b6b' }]}>Block {otherName}</Text></Pressable>
              </>
            )}
            {menuStep === 'block' && (
              <View style={styles.menuConfirm}>
                <Text style={styles.menuCopy}>Block {otherName}? Neither of you can message the other until you unblock.</Text>
                <View style={styles.menuBtns}>
                  <Pressable onPress={() => setMenuStep('main')} style={styles.menuBtn}><Text style={styles.menuBtnText}>Cancel</Text></Pressable>
                  <Pressable onPress={block} style={[styles.menuBtn, { backgroundColor: '#d63a3a' }]}><Text style={styles.menuBtnText}>Block</Text></Pressable>
                </View>
              </View>
            )}
            {menuStep === 'report' && (
              <View style={styles.menuConfirm}>
                <Text style={styles.menuCopy}>What&rsquo;s wrong? Unis reviews every report. Reporting doesn&rsquo;t block on its own.</Text>
                {REPORT_REASONS.map((r) => (
                  <Pressable key={r} onPress={() => report(r)} style={styles.menuItem}><Text style={styles.menuText}>{r}</Text></Pressable>
                ))}
              </View>
            )}
            {menuStep === 'reported' && (
              <View style={styles.menuConfirm}>
                <Text style={styles.menuCopy}>Thanks &mdash; it&rsquo;s with Unis for review.</Text>
                <View style={styles.menuBtns}>
                  <Pressable onPress={() => { setMenuOpen(false); setMenuStep('main'); }} style={styles.menuBtn}><Text style={styles.menuBtnText}>Done</Text></Pressable>
                  <Pressable onPress={() => setMenuStep('block')} style={[styles.menuBtn, { backgroundColor: '#d63a3a' }]}><Text style={styles.menuBtnText}>Block too</Text></Pressable>
                </View>
              </View>
            )}
          </Pressable>
        </Pressable>
      )}

      <SupportSheet
        isOpen={supportOpen}
        onClose={() => setSupportOpen(false)}
        artistId={otherId}
        artistName={otherName}
        source="dm"
        onSuccess={handleSupportSent}
      />
      <MessagePickerSheet open={shareOpen} mode="song" onClose={() => setShareOpen(false)} onPick={shareSong} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  name: { color: '#fff', fontSize: 16, fontWeight: '700', flexShrink: 1 },
  active: { color: '#4ade80', fontSize: 12, fontWeight: '600' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, flexShrink: 1 },
  chipText: { fontSize: 11.5, fontWeight: '600' },
  np: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  npArt: { width: 28, height: 28, borderRadius: 14 },
  npToggle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pill: { alignSelf: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 11.5, fontWeight: '600', marginVertical: 12 },
  line: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 },
  lineMine: { justifyContent: 'flex-end' },
  lineTheirs: { justifyContent: 'flex-start' },
  face: { width: 32, marginRight: 4 },
  stack: { maxWidth: '78%' },
  bubble: { paddingHorizontal: 14, paddingVertical: 9 },
  bubbleText: { color: '#fff', fontSize: 15.5, lineHeight: 21 },
  failedBubble: { borderWidth: 1, borderColor: '#ff6b6b' },
  support: { padding: 14, borderWidth: 1, backgroundColor: 'rgba(34,197,94,0.1)', minWidth: 180 },
  supportTop: { color: '#4ade80', fontSize: 12.5, fontWeight: '700' },
  supportAmount: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 6, letterSpacing: -0.5 },
  supportFrac: { fontSize: 18 },
  supportNote: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 6 },
  track: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', width: 270 },
  trackOpen: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  trackArt: { width: 52, height: 52, borderRadius: 10 },
  trackArtBlank: { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  trackTitle: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  trackSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginTop: 1 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  rankChip: { fontSize: 11, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  move: { fontSize: 11, fontWeight: '700' },
  trackPlay: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  reacts: { flexDirection: 'row', gap: 4, marginTop: -6, marginHorizontal: 6 },
  react: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(20,21,27,0.95)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  reactEmoji: { fontSize: 13 },
  reactN: { color: '#fff', fontSize: 11, fontWeight: '700' },
  burst: { position: 'absolute', alignSelf: 'center', top: -10, fontSize: 42 },
  failedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  failedRetry: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  failedText: { color: '#ff8a8a', fontSize: 12, fontWeight: '600' },
  stamp: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 3, marginHorizontal: 4 },
  typing: { flexDirection: 'row', gap: 4, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 20 },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.6)' },
  seen: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 4 },
  seenText: { color: 'rgba(255,255,255,0.5)', fontSize: 11.5 },
  intro: { alignItems: 'center', paddingTop: 24, paddingBottom: 18 },
  introName: { color: '#fff', fontSize: 20, fontWeight: '800' },
  introSub: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 3 },
  introBtn: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  introBtnText: { color: '#fff', fontWeight: '600', fontSize: 13.5 },
  introHint: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginTop: 14, paddingHorizontal: 30, lineHeight: 19 },
  skelBubble: { height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.07)' },
  skelLine: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.08)' },
  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  errorText: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  link: { fontWeight: '700', fontSize: 14 },
  jump: { position: 'absolute', alignSelf: 'center', bottom: 90, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  jumpText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 96, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, maxWidth: '86%' },
  toastError: { backgroundColor: 'rgba(214,58,58,0.95)' },
  toastInfo: { backgroundColor: 'rgba(40,41,48,0.96)' },
  toastText: { color: '#fff', fontSize: 13.5, fontWeight: '600', textAlign: 'center' },
  composer: { paddingHorizontal: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  request: { padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 8 },
  requestLead: { color: '#fff', fontSize: 15 },
  requestSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginTop: 4, lineHeight: 17 },
  requestActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  reqBtn: { flex: 1, minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  reqBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  composerNote: { color: 'rgba(255,255,255,0.6)', fontSize: 13.5, textAlign: 'center', paddingVertical: 12 },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, padding: 5, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  supportBtn: { backgroundColor: '#16a34a' },
  input: { flex: 1, color: '#fff', fontSize: 15.5, maxHeight: 120, paddingTop: Platform.OS === 'ios' ? 10 : 8, paddingBottom: Platform.OS === 'ios' ? 10 : 8 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  actions: { borderRadius: 20, padding: 10, gap: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', minWidth: 260 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  emojiBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 24 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' },
  actionText: { color: '#fff', fontWeight: '600', fontSize: 14.5 },
  menu: { position: 'absolute', right: 12, width: 260, borderRadius: 16, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', elevation: 12, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18 },
  menuItem: { paddingHorizontal: 16, paddingVertical: 12 },
  menuText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  menuConfirm: { padding: 12, gap: 8 },
  menuCopy: { color: 'rgba(255,255,255,0.8)', fontSize: 13.5, lineHeight: 19 },
  menuBtns: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  menuBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  menuBtnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
});

export default MessageThread;
