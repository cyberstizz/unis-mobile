// src/screens/MessageScreen.tsx
// ─────────────────────────────────────────────────────────────
// Inbox — mobile port of web src/MessagePage.jsx (Oct 2026 premium pass on
// the two-lane backend):
//   • Chats | Requests tabs with a sliding highlight; Filtered requests folder
//   • Active now row (presence from the socket overrides the last fetch)
//   • rows start loading their thread the moment a finger lands
//     (utils/dmThreads.prefetchThread); "now · 2m · 5m" stay live
//   • new messages update the row instantly, then the server confirms
//   • New message (people picker), Message settings, Search
//   • an open thread takes the whole screen (slides in over the inbox)
// One socket connection lives here and feeds the open thread.
//
// Hand-off from a profile/dashboard "Message" button:
//   navigation.navigate('Messages', { compose: { userId, username, photoUrl } })
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import axiosInstance from '../services/axiosInstance';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';
import { useMessagingSocket } from '../hooks/useMessagingSocket';
import { prefetchThread, previewFor } from '../utils/dmThreads';
import { haptic } from '../utils/dmFeedback';
import { emitAppEvent } from '../utils/appEvents';
import { useUnisTheme } from '../theme/unisTheme';
import {
  ArrowBackIcon, SlidersIcon, ComposeIcon, SearchIcon, CloseIcon, FilterIcon,
  MessagesIcon, NoteIcon, SupportIcon, FindIcon,
} from '../icons/UnisIcons';
import { DmAvatar, VerifiedCheck, relativeTime } from '../components/messages/DmParts';
import MessageThread from '../components/MessageThread';
import MessagePickerSheet, { PickResult } from '../components/MessagePickerSheet';
import MessageSettingsSheet from '../components/MessageSettingsSheet';

const TYPING_TTL_MS = 6000;
const REFRESH_DEBOUNCE_MS = 400;
const TICK_MS = 30000;
const PREVIEW_SUPPORT = 'Sent support';
const PREVIEW_TRACK = 'Shared a track';

const pingUnread = () => emitAppEvent('messages-updated');

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const Preview: React.FC<{ conv: any; typing: boolean; accent: string }> = ({ conv, typing, accent }) => {
  if (typing) return <Text style={[styles.preview, { color: accent }]}>typing…</Text>;
  const text = conv.lastMessagePreview;
  const you = conv.lastMessageMine ? 'You: ' : '';
  const unread = conv.unreadCount > 0;
  if (text === PREVIEW_SUPPORT) {
    return (
      <View style={styles.previewRow}>
        <SupportIcon size={14} tone="on" color="#4ade80" />
        <Text style={[styles.preview, { color: '#4ade80' }]} numberOfLines={1}>{conv.lastMessageMine ? 'You sent support' : 'Sent you support'}</Text>
      </View>
    );
  }
  if (text === PREVIEW_TRACK) {
    return (
      <View style={styles.previewRow}>
        <NoteIcon size={14} tone="on" color="rgba(255,255,255,0.6)" />
        <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>{you}Shared a song</Text>
      </View>
    );
  }
  return <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>{text ? `${you}${text}` : 'No messages yet'}</Text>;
};

const MessageScreen: React.FC = () => {
  const { user } = useAuth();
  const me = user?.userId as string;
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const feedback = useFeedback();
  const t = useUnisTheme();
  const now = useNow(TICK_MS);

  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'chats' | 'requests'>('chats');
  const [showFiltered, setShowFiltered] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const [incoming, setIncoming] = useState<any>(null);
  const [liveReaction, setLiveReaction] = useState<any>(null);
  const [liveRead, setLiveRead] = useState<any>(null);
  const [typingMap, setTypingMap] = useState<Record<string, boolean>>({});
  const [presence, setPresence] = useState<Record<string, boolean>>({});

  const tabLayouts = useRef<Record<string, { x: number; w: number }>>({});
  const indX = useRef(new Animated.Value(0)).current;
  const indW = useRef(new Animated.Value(0)).current;
  const typingTimers = useRef<Record<string, any>>({});
  const refreshTimer = useRef<any>(null);
  const conversationsRef = useRef(conversations);
  const selectedIdRef = useRef(selectedId);
  conversationsRef.current = conversations;
  selectedIdRef.current = selectedId;

  const loadConversations = useCallback(async () => {
    try {
      const res = await axiosInstance.get('/v1/conversations');
      setConversations(res.data || []);
      setPresence({});
      return res.data || [];
    } catch (err: any) {
      console.error('[Messages] inbox load failed:', err?.message || err);
      feedback.error("Couldn't refresh your messages. Check your connection.", { id: 'dm-inbox' });
      return conversationsRef.current;
    } finally {
      setLoading(false);
      setRefreshing(false);
      pingUnread();
    }
  }, [feedback]);

  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(loadConversations, REFRESH_DEBOUNCE_MS);
  }, [loadConversations]);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => () => {
    clearTimeout(refreshTimer.current);
    Object.values(typingTimers.current).forEach(clearTimeout);
  }, []);

  const patchRow = useCallback((msg: any, { mine, open }: { mine: boolean; open: boolean }) => {
    setConversations((prev) => {
      const i = prev.findIndex((c) => c.id === msg.conversationId);
      if (i < 0) return prev;
      const c = prev[i];
      const next = {
        ...c,
        lastMessagePreview: previewFor(msg) || c.lastMessagePreview,
        lastMessageMine: mine,
        lastMessageAt: msg.createdAt || c.lastMessageAt,
        lastMessageSeen: false,
        unreadCount: mine || open ? 0 : (c.unreadCount || 0) + 1,
      };
      return [next, ...prev.slice(0, i), ...prev.slice(i + 1)];
    });
  }, []);

  // ── Opening / closing threads ──
  const openExisting = useCallback((conv: any) => {
    setDraft(null);
    setSelectedId(conv.id);
    setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c)));
    pingUnread();
  }, []);

  const openWithUser = useCallback(({ userId, username, photoUrl }: { userId: string; username?: string | null; photoUrl?: string | null }) => {
    const existing = conversationsRef.current.find((c) => c.otherUserId === userId);
    if (existing) {
      if (existing.lane && existing.lane !== 'chats') {
        setTab('requests');
        setShowFiltered(existing.lane === 'filtered');
      }
      openExisting(existing);
      return;
    }
    setSelectedId(null);
    setTab('chats');
    setDraft({
      id: `draft-${userId}`,
      otherUserId: userId,
      otherUsername: username || null,
      otherPhotoUrl: photoUrl || null,
      _draft: true,
      lane: 'chats',
      lastMessageAt: null,
      lastMessagePreview: '',
      unreadCount: 0,
    });
  }, [openExisting]);

  const closeThread = useCallback(() => {
    haptic('tap');
    setSelectedId(null);
    setDraft(null);
  }, []);

  // Compose hand-off (one shot per navigation).
  const compose = route.params?.compose || (route.params?.recipientId
    ? { userId: route.params.recipientId, username: route.params.recipientName, photoUrl: route.params.recipientPhoto }
    : null);
  useEffect(() => {
    if (!compose || loading) return;
    navigation.setParams({ compose: undefined, recipientId: undefined, recipientName: undefined, recipientPhoto: undefined });
    openWithUser(compose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compose?.userId, loading]);

  // Draft → real conversation after the first message.
  useEffect(() => {
    if (!draft) return;
    const real = conversations.find((c) => c.otherUserId === draft.otherUserId);
    if (!real) return;
    setSelectedId(real.id);
    setDraft(null);
  }, [conversations, draft]);

  // ── Socket ──
  const setTyping = useCallback((conversationId: string, on: boolean) => {
    clearTimeout(typingTimers.current[conversationId]);
    setTypingMap((m) => {
      if (!!m[conversationId] === on) return m;
      const next = { ...m };
      if (on) next[conversationId] = true;
      else delete next[conversationId];
      return next;
    });
    if (on) typingTimers.current[conversationId] = setTimeout(() => setTyping(conversationId, false), TYPING_TTL_MS);
  }, []);

  const onSocketMessage = useCallback((message: any) => {
    setIncoming(message);
    const mine = message.senderId === me;
    if (!mine) setTyping(message.conversationId, false);
    patchRow(message, { mine, open: message.conversationId === selectedIdRef.current });
    scheduleRefresh();
  }, [me, setTyping, patchRow, scheduleRefresh]);

  const { sendTyping } = useMessagingSocket(onSocketMessage, {
    onTyping: (e) => setTyping(e.conversationId, !!e.typing),
    onPresence: (e) => setPresence((p) => ({ ...p, [e.userId]: !!e.online })),
    onReaction: (e) => setLiveReaction({ ...e, _at: Date.now() }),
    onRead: (e) => { setLiveRead({ ...e, _at: Date.now() }); scheduleRefresh(); },
    onConversation: () => scheduleRefresh(),
  });

  // ── Derived ──
  const isOnline = useCallback((c: any) => (c.otherUserId in presence ? presence[c.otherUserId] : !!c.otherOnline), [presence]);
  const chats = useMemo(() => conversations.filter((c) => (c.lane || 'chats') === 'chats'), [conversations]);
  const requests = useMemo(() => conversations.filter((c) => c.lane === 'requests'), [conversations]);
  const filtered = useMemo(() => conversations.filter((c) => c.lane === 'filtered'), [conversations]);
  const activeNow = useMemo(() => chats.filter(isOnline).slice(0, 12), [chats, isOnline]);
  const unreadThreads = chats.filter((c) => c.unreadCount > 0).length;
  const laneRows = tab === 'requests' ? (showFiltered ? filtered : requests) : chats;
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return laneRows;
    return laneRows.filter((c) => (c.otherUsername || '').toLowerCase().includes(q) || (c.lastMessagePreview || '').toLowerCase().includes(q));
  }, [laneRows, filter]);
  const realSelected = useMemo(() => conversations.find((c) => c.id === selectedId) || null, [conversations, selectedId]);
  const selected = realSelected || draft;

  // Sliding tab highlight.
  const moveIndicator = useCallback((key: string, animated = true) => {
    const l = tabLayouts.current[key];
    if (!l) return;
    if (animated) {
      Animated.parallel([
        Animated.spring(indX, { toValue: l.x, useNativeDriver: false, friction: 9 }),
        Animated.spring(indW, { toValue: l.w, useNativeDriver: false, friction: 9 }),
      ]).start();
    } else {
      indX.setValue(l.x);
      indW.setValue(l.w);
    }
  }, [indX, indW]);
  useEffect(() => { moveIndicator(tab); }, [tab, moveIndicator]);

  const onTabLayout = (key: string) => (e: LayoutChangeEvent) => {
    tabLayouts.current[key] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
    if (key === tab) moveIndicator(key, false);
  };

  const switchTab = (next: 'chats' | 'requests') => {
    if (next !== tab) haptic('tap');
    setTab(next);
    setShowFiltered(false);
  };

  const pickPerson = (person: PickResult) => {
    setPickerOpen(false);
    setTimeout(() => openWithUser({ userId: person.id, username: person.name, photoUrl: person.artworkUrl }), 250);
  };

  const onThreadActivity = useCallback((saved: any) => {
    const known = saved && conversationsRef.current.some((c) => c.id === saved.conversationId);
    if (!known) { loadConversations(); return; }
    patchRow(saved, { mine: true, open: true });
    scheduleRefresh();
  }, [loadConversations, patchRow, scheduleRefresh]);

  const subline = loading
    ? ' '
    : [
        unreadThreads > 0 ? `${unreadThreads} unread` : 'All caught up',
        requests.length > 0 ? `${requests.length} request${requests.length === 1 ? '' : 's'}` : null,
      ].filter(Boolean).join(' · ');

  const emptyActions = (
    <View style={styles.emptyActions}>
      <Pressable onPress={() => { haptic('tap'); setPickerOpen(true); }} style={[styles.newBtn, { backgroundColor: t.primary }]}>
        <ComposeIcon size={18} tone="on" color="#fff" />
        <Text style={styles.newText}>New message</Text>
      </Pressable>
      <Pressable onPress={() => navigation.navigate('Find')} style={styles.ghost}>
        <FindIcon size={17} color="rgba(255,255,255,0.8)" />
        <Text style={styles.ghostText}>Find artists near you</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.glow, { backgroundColor: t.glow1 }]} pointerEvents="none" />
      <View style={styles.head}>
        <View style={styles.toprow}>
          <Pressable style={styles.round} onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))} accessibilityLabel="Back">
            <ArrowBackIcon size={22} color="#fff" />
          </Pressable>
          <Pressable style={styles.round} onPress={() => { haptic('tap'); setSettingsOpen(true); }} accessibilityLabel="Message settings">
            <SlidersIcon size={22} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.titlerow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} accessibilityRole="header">Messages</Text>
            <Text style={styles.sub}>{subline}</Text>
          </View>
          <Pressable onPress={() => { haptic('tap'); setPickerOpen(true); }} style={({ pressed }) => [styles.newBtn, { backgroundColor: t.primary }, pressed && { transform: [{ scale: 0.95 }] }]} accessibilityLabel="New message">
            <ComposeIcon size={19} tone="on" color="#fff" />
            <Text style={styles.newText}>New</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} tintColor="#fff" onRefresh={() => { setRefreshing(true); loadConversations(); }} />}
      >
        {tab === 'chats' && activeNow.length > 0 && (
          <View style={styles.active}>
            <View style={styles.activeLabelRow}>
              <View style={styles.pulse} />
              <Text style={styles.activeLabel}>Active now</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 18 }}>
              {activeNow.map((c) => (
                <Pressable key={c.id} onPressIn={() => prefetchThread(me, c.id)} onPress={() => openExisting(c)} style={styles.activeItem} accessibilityLabel={`${c.otherUsername || 'Unknown'}, active now`}>
                  <DmAvatar name={c.otherUsername} photoUrl={c.otherPhotoUrl} size={62} ring={c.otherSupportsMe} online />
                  <Text style={styles.activeName} numberOfLines={1}>{(c.otherUsername || 'Unknown').split(' ')[0]}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.tabs} accessibilityRole="tablist">
          <Animated.View style={[styles.tabInd, { backgroundColor: t.soft, borderColor: t.border, left: indX, width: indW }]} />
          <Pressable onLayout={onTabLayout('chats')} onPress={() => switchTab('chats')} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: tab === 'chats' }}>
            <Text style={[styles.tabText, tab === 'chats' && styles.tabOn]}>Chats</Text>
          </Pressable>
          <Pressable onLayout={onTabLayout('requests')} onPress={() => switchTab('requests')} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: tab === 'requests' }}>
            <Text style={[styles.tabText, tab === 'requests' && styles.tabOn]}>Requests</Text>
            {requests.length > 0 && (
              <View style={[styles.tabCount, { backgroundColor: t.primary }]}><Text style={styles.tabCountText}>{requests.length}</Text></View>
            )}
          </Pressable>
        </View>

        {tab === 'requests' && showFiltered && (
          <Pressable style={styles.folder} onPress={() => setShowFiltered(false)}>
            <ArrowBackIcon size={18} tone="on" color="#fff" />
            <Text style={styles.folderText}>Filtered requests</Text>
          </Pressable>
        )}

        {loading &&
          [58, 72, 46, 64, 52, 68, 40].map((w) => (
            <View key={w} style={styles.skelRow}>
              <View style={styles.skelCircle} />
              <View style={{ flex: 1, gap: 7 }}>
                <View style={[styles.skelLine, { width: `${w}%` }]} />
                <View style={[styles.skelLine, { width: `${Math.min(95, w + 18)}%`, opacity: 0.5 }]} />
              </View>
            </View>
          ))}

        {!loading && laneRows.length === 0 && !(tab === 'chats' && draft) && (
          tab === 'chats' ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: t.soft }]}><MessagesIcon size={34} color="#fff" /></View>
              <Text style={styles.emptyTitle}>No chats <Text style={styles.em}>yet</Text></Text>
              <Text style={styles.emptySub}>Message an artist near you, or anyone on Unis.</Text>
              {emptyActions}
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                {showFiltered ? <FilterIcon size={30} color="#fff" /> : <MessagesIcon size={30} color="#fff" />}
              </View>
              <Text style={styles.emptyTitle}>{showFiltered ? <>Nothing <Text style={styles.em}>filtered</Text></> : <>No <Text style={styles.em}>requests</Text></>}</Text>
              <Text style={styles.emptySub}>
                {showFiltered ? 'Bulk and low-quality requests would show up here.' : 'Messages from people you don’t know yet wait here. They never notify you.'}
              </Text>
            </View>
          )
        )}

        {!loading && !!filter && laneRows.length > 0 && visible.length === 0 && (
          <Text style={styles.hint}>No conversations match {'“'}{filter.trim()}{'”'}.</Text>
        )}

        {!loading &&
          visible.map((c) => {
            const unread = c.unreadCount > 0;
            const typing = !!typingMap[c.id];
            const online = isOnline(c);
            return (
              <Pressable
                key={c.id}
                onPressIn={() => prefetchThread(me, c.id)}
                onPress={() => openExisting(c)}
                style={({ pressed }) => [styles.conv, pressed && { backgroundColor: 'rgba(255,255,255,0.05)' }]}
                accessibilityLabel={`${c.otherUsername || 'Unknown'}${online ? ', active now' : ''}${unread ? `, ${c.unreadCount} unread` : ''}`}
              >
                <DmAvatar name={c.otherUsername} photoUrl={c.otherPhotoUrl} ring={c.otherSupportsMe} online={online} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={[styles.convName, unread && { fontWeight: '800' }]} numberOfLines={1}>{c.otherUsername || 'Unknown'}</Text>
                    {c.otherRole === 'artist' && <VerifiedCheck />}
                  </View>
                  <Preview conv={c} typing={typing} accent={t.textAccent} />
                </View>
                <View style={styles.side}>
                  <Text style={[styles.time, unread && { color: t.textAccent }]}>{relativeTime(c.lastMessageAt, now)}</Text>
                  {unread ? (
                    <View style={[styles.badge, { backgroundColor: t.primary }]}><Text style={styles.badgeText}>{c.unreadCount}</Text></View>
                  ) : c.lastMessageSeen ? (
                    <DmAvatar name={c.otherUsername} photoUrl={c.otherPhotoUrl} size={18} />
                  ) : (
                    <View style={{ height: 18 }} />
                  )}
                </View>
              </Pressable>
            );
          })}

        {tab === 'requests' && !showFiltered && !loading && (
          <>
            {requests.length > 0 && <Text style={styles.note}>They won&rsquo;t know you&rsquo;ve seen a request until you accept it.</Text>}
            <Pressable style={styles.folder} onPress={() => { haptic('tap'); setShowFiltered(true); }}>
              <FilterIcon size={19} color="rgba(255,255,255,0.75)" />
              <Text style={[styles.folderText, { flex: 1 }]}>Filtered requests</Text>
              <Text style={styles.folderCount}>{filtered.length}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {searchOpen ? (
        <View style={styles.floatInput}>
          <SearchIcon size={19} color="rgba(255,255,255,0.7)" />
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder="Search conversations"
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={styles.floatField}
            autoFocus
            autoCorrect={false}
            accessibilityLabel="Search conversations"
          />
          <Pressable onPress={() => { setSearchOpen(false); setFilter(''); }} hitSlop={8} accessibilityLabel="Close search">
            <CloseIcon size={17} tone="on" color="#fff" />
          </Pressable>
        </View>
      ) : (
        conversations.length > 0 && (
          <Pressable style={styles.float} onPress={() => { haptic('tap'); setSearchOpen(true); }}>
            <SearchIcon size={19} color="#fff" />
            <Text style={styles.floatText}>Search</Text>
          </Pressable>
        )
      )}

      <Modal visible={!!selected} animationType="slide" onRequestClose={closeThread} statusBarTranslucent>
        {selected && (
          <MessageThread
            key={selected.otherUserId}
            conversation={selected}
            currentUserId={me}
            incomingMessage={incoming}
            incomingReaction={liveReaction}
            incomingRead={liveRead}
            otherTyping={!!typingMap[selected.id]}
            otherOnline={selected._draft ? false : isOnline(selected)}
            sendTyping={sendTyping}
            onBack={closeThread}
            onActivity={onThreadActivity}
            onAccepted={() => { setTab('chats'); setShowFiltered(false); loadConversations(); }}
            onRequestGone={() => { closeThread(); loadConversations(); }}
          />
        )}
      </Modal>

      <MessagePickerSheet open={pickerOpen} mode="people" onClose={() => setPickerOpen(false)} onPick={pickPerson} excludeUserId={me} />
      <MessageSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} onChanged={scheduleRefresh} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07090f' },
  glow: { position: 'absolute', top: -120, left: -80, width: 320, height: 320, borderRadius: 160 },
  head: { paddingHorizontal: 18, paddingTop: 8 },
  toprow: { flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  titlerow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 14, marginBottom: 6 },
  title: { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  sub: { color: 'rgba(255,255,255,0.5)', fontSize: 13.5, marginTop: 2 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 42, borderRadius: 21 },
  newText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  active: { marginTop: 14 },
  activeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 18, marginBottom: 10 },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  activeLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  activeItem: { alignItems: 'center', width: 68, gap: 5 },
  activeName: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  tabs: { flexDirection: 'row', marginHorizontal: 18, marginTop: 16, marginBottom: 8, padding: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.05)', alignSelf: 'flex-start' },
  tabInd: { position: 'absolute', top: 4, bottom: 4, borderRadius: 999, borderWidth: 1 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 8 },
  tabText: { color: 'rgba(255,255,255,0.55)', fontWeight: '700', fontSize: 14 },
  tabOn: { color: '#fff' },
  tabCount: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  tabCountText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  folder: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 18, marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)' },
  folderText: { color: '#fff', fontWeight: '600', fontSize: 14.5 },
  folderCount: { color: 'rgba(255,255,255,0.5)', fontWeight: '700' },
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 10 },
  skelCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.06)' },
  skelLine: { height: 11, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.07)' },
  empty: { alignItems: 'center', paddingHorizontal: 30, paddingTop: 50, gap: 8 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  em: { fontStyle: 'italic', fontWeight: '400' },
  emptySub: { color: 'rgba(255,255,255,0.55)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyActions: { gap: 10, marginTop: 14, alignItems: 'center' },
  ghost: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
  ghostText: { color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  hint: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: 20 },
  conv: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 10 },
  convName: { color: '#fff', fontSize: 15.5, fontWeight: '600', flexShrink: 1 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  preview: { color: 'rgba(255,255,255,0.5)', fontSize: 13.5, marginTop: 3, flexShrink: 1 },
  previewUnread: { color: '#fff', fontWeight: '600' },
  side: { alignItems: 'flex-end', gap: 6 },
  time: { color: 'rgba(255,255,255,0.45)', fontSize: 12 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  note: { color: 'rgba(255,255,255,0.45)', fontSize: 12.5, textAlign: 'center', paddingHorizontal: 30, paddingTop: 14 },
  float: { position: 'absolute', alignSelf: 'center', bottom: 108, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, height: 46, borderRadius: 23, backgroundColor: 'rgba(30,31,38,0.96)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  floatText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  floatInput: { position: 'absolute', left: 18, right: 18, bottom: 108, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 48, borderRadius: 24, backgroundColor: 'rgba(30,31,38,0.98)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  floatField: { flex: 1, color: '#fff', fontSize: 15 },
});

export default MessageScreen;
