// src/screens/MessagesScreen.tsx
// Ported from web `MessagePage.jsx`.
//
// Web is a two-pane layout (conversation list + open thread side by side). On a
// phone that becomes master/detail: the list fills the screen; selecting a
// conversation swaps to the thread; back returns to the list. Same data model,
// same socket wiring, same draft/compose hand-off.
//
// Compose hand-off: a "Message" button elsewhere (SupporterSection, an artist
// profile) navigates here with route params { compose: { userId, username?,
// photoUrl? } }. If a conversation with that user exists we open it; otherwise
// we open a DRAFT thread whose first sent message creates the real row.
//
// GET /v1/conversations

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { MessageCircle, ArrowLeft } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';
import buildUrl from '../utils/buildUrl';
import { useAuth } from '../context/AuthContext';
import useMessagingSocket from '../hooks/useMessagingSocket';
import MessageThread, { Conversation } from '../components/MessageThread';

function initials(name = ''): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface ComposeParam {
  userId: string;
  username?: string;
  photoUrl?: string | null;
}
type MessagesRouteParams = { compose?: ComposeParam; openWith?: string };

const MessagesScreen: React.FC = () => {
  const { user } = useAuth();
  const currentUserId = user?.userId;
  const route = useRoute<RouteProp<Record<string, MessagesRouteParams>, string>>();
  const navigation = useNavigation<any>();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Conversation | null>(null);
  const [incoming, setIncoming] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Hand-off from a "Message" button. compose = { userId, username?, photoUrl? }.
  // Legacy openWith still supported.
  const compose: ComposeParam | null =
    route.params?.compose ||
    (route.params?.openWith ? { userId: route.params.openWith } : null);
  const composeHandled = useRef(false);

  const loadConversations = useCallback(async (): Promise<Conversation[]> => {
    try {
      const res = await axiosInstance.get('/v1/conversations');
      setConversations(res.data || []);
      return res.data || [];
    } catch (_) {
      setConversations([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const openExisting = useCallback((conv: Conversation) => {
    setDraft(null);
    setSelectedId(conv.id);
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c)));
  }, []);

  // Hand-off: open the target user's thread immediately. If no conversation
  // exists yet, open a draft thread — the first message creates it.
  useEffect(() => {
    if (!compose || loading || composeHandled.current) return;
    composeHandled.current = true;

    const targetId = compose.userId;
    const existing = conversations.find((c) => c.otherUserId === targetId);
    if (existing) {
      openExisting(existing);
    } else {
      setSelectedId(null);
      setDraft({
        id: `draft-${targetId}`,
        otherUserId: targetId,
        otherUsername: compose.username || 'Member',
        otherPhotoUrl: compose.photoUrl || null,
        _draft: true,
        lastMessageAt: null,
        lastMessagePreview: '',
        unreadCount: 0,
      });
    }
    // Clear the param so re-focus doesn't re-trigger the hand-off.
    navigation.setParams({ compose: undefined, openWith: undefined } as any);
  }, [compose, loading, conversations, openExisting, navigation]);

  // Once a draft's real conversation exists (after the first message), swap to it.
  useEffect(() => {
    if (!draft) return;
    const real = conversations.find((c) => c.otherUserId === draft.otherUserId);
    if (real) { setSelectedId(real.id); setDraft(null); }
  }, [conversations, draft]);

  const onSocketMessage = useCallback((message: any) => {
    setIncoming(message);
    loadConversations();
  }, [loadConversations]);

  const { connected } = useMessagingSocket(onSocketMessage);

  const realSelected = useMemo(
    () => conversations.find((c) => c.id === selectedId) || null,
    [conversations, selectedId],
  );
  const selected = realSelected || draft;

  const totalUnread = conversations.reduce((n, c) => n + (c.unreadCount || 0), 0);

  // ── Detail view: an open thread fills the screen ──
  if (selected) {
    return (
      <View style={styles.screen}>
        <MessageThread
          key={selected.otherUserId}
          conversation={selected}
          currentUserId={currentUserId}
          incomingMessage={incoming}
          onBack={() => { setSelectedId(null); setDraft(null); }}
          onActivity={() => loadConversations()}
        />
      </View>
    );
  }

  // ── Master view: conversation list ──
  const renderConversation = ({ item: c }: { item: Conversation }) => (
    <TouchableOpacity
      style={[styles.conv, c.unreadCount ? styles.convUnread : null]}
      onPress={() => openExisting(c)}
    >
      <View style={styles.avatar}>
        {c.otherPhotoUrl ? (
          <Image source={{ uri: buildUrl(c.otherPhotoUrl) || undefined }} style={styles.avatarImg} />
        ) : (
          <Text style={styles.avatarInitials}>{initials(c.otherUsername)}</Text>
        )}
      </View>
      <View style={styles.convBody}>
        <View style={styles.convTop}>
          <Text style={styles.convName} numberOfLines={1}>{c.otherUsername || 'Unknown'}</Text>
          <Text style={styles.convTime}>{relativeTime(c.lastMessageAt)}</Text>
        </View>
        <View style={styles.convPreviewRow}>
          <Text
            style={[styles.convPreview, c.unreadCount ? styles.convPreviewUnread : null]}
            numberOfLines={1}
          >
            {c.lastMessagePreview || 'No messages yet'}
          </Text>
          {(c.unreadCount || 0) > 0 && (
            <View style={styles.convBadge}>
              <Text style={styles.convBadgeText}>{c.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.head}>
        <TouchableOpacity style={styles.headBack} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headTitle}>Messages</Text>
        <View style={[styles.dot, connected ? styles.dotOn : styles.dotOff]} />
        {totalUnread > 0 && (
          <View style={styles.headCount}>
            <Text style={styles.headCountText}>{totalUnread}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.hint}>
          <Text style={styles.hintText}>Loading…</Text>
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.empty}>
          <MessageCircle size={28} color="#888888" />
          <Text style={styles.emptyLead}>No conversations yet</Text>
          <Text style={styles.emptySub}>
            Reach out to an artist from their profile to start one.
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => String(c.id)}
          renderItem={renderConversation}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomWidth: 1,
  },
  headBack: {
    padding: 4,
    marginRight: 8,
  },
  headTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    flex: 1,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 8,
  },
  dotOn: {
    backgroundColor: '#22c55e',
  },
  dotOff: {
    backgroundColor: '#666666',
  },
  headCount: {
    backgroundColor: '#004aad',
    borderRadius: 11,
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignItems: 'center',
  },
  headCountText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  hint: {
    padding: 20,
  },
  hintText: {
    color: '#888888',
    fontSize: 14,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyLead: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySub: {
    color: '#888888',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  conv: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomWidth: 1,
  },
  convUnread: {
    backgroundColor: 'rgba(74, 158, 255, 0.04)',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  convBody: {
    flex: 1,
    marginLeft: 12,
  },
  convTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  convName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    paddingRight: 8,
  },
  convTime: {
    color: '#888888',
    fontSize: 12,
  },
  convPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  convPreview: {
    color: '#AAAAAA',
    fontSize: 13,
    flex: 1,
    paddingRight: 8,
  },
  convPreviewUnread: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  convBadge: {
    backgroundColor: '#004aad',
    borderRadius: 10,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignItems: 'center',
  },
  convBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});

export default MessagesScreen;