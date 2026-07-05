// src/components/MessageThread.tsx
// Ported from web `MessageThread.jsx`.
//
// Owns one conversation: loads history (or shows an empty composer for a draft
// conversation that has no row yet), renders regular / support / shared-track
// bubbles, sends optimistically with a temp bubble that's reconciled by id, and
// merges live socket messages (deduped by id). Support sent from inside the
// thread posts a DM carrying the supportPaymentId.
//
// GET  /v1/conversations/{id}/messages
// POST /v1/conversations/{id}/read
// POST /v1/messages  { recipientId, body, source:'dm' [, supportPaymentId] }

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { ChevronLeft, Music, Zap, Play, ArrowUp } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';
import buildUrl from '../utils/buildUrl';
import SupportSheet from './SupportSheet';

function initials(name = ''): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function timeLabel(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export interface Conversation {
  id: string;
  otherUserId: string;
  otherUsername?: string;
  otherPhotoUrl?: string | null;
  _draft?: boolean;
  lastMessageAt?: string | null;
  lastMessagePreview?: string;
  unreadCount?: number;
}

interface ChatMessage {
  id: string;
  _temp?: boolean;
  conversationId?: string;
  senderId?: string;
  body?: string;
  createdAt?: string;
  read?: boolean;
  supportPaymentId?: string | null;
  sharedSongId?: string | null;
}

interface MessageThreadProps {
  conversation: Conversation;
  currentUserId?: string;
  incomingMessage?: ChatMessage | null;
  onBack: () => void;
  onActivity?: (saved?: ChatMessage) => void;
}

const MessageThread: React.FC<MessageThreadProps> = ({
  conversation,
  currentUserId,
  incomingMessage,
  onBack,
  onActivity,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [supportOpen, setSupportOpen] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const otherId = conversation.otherUserId;
  const otherName = conversation.otherUsername || 'Unknown';
  const isDraft = !!conversation._draft;

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const appendDeduped = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev.filter((m) => !m._temp), msg];
    });
    scrollToBottom();
  }, [scrollToBottom]);

  // Load thread. A draft conversation has no row yet — show an empty, ready
  // composer instead of fetching (which would 404).
  useEffect(() => {
    let alive = true;
    if (isDraft) {
      setMessages([]);
      setLoading(false);
      return () => { alive = false; };
    }
    setLoading(true);
    setError(null);
    axiosInstance.get(`/v1/conversations/${conversation.id}/messages`)
      .then((res) => {
        if (!alive) return;
        setMessages(res.data || []);
        scrollToBottom(false);
      })
      .catch(() => { if (alive) setError('Could not load this conversation.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [conversation.id, isDraft, scrollToBottom]);

  // Live messages for this thread (deduped by id)
  useEffect(() => {
    if (!incomingMessage || incomingMessage.conversationId !== conversation.id) return;
    appendDeduped(incomingMessage);
    if (incomingMessage.senderId !== currentUserId) {
      axiosInstance.post(`/v1/conversations/${conversation.id}/read`).catch(() => {});
    }
  }, [incomingMessage, conversation.id, currentUserId, appendDeduped]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);

    const temp: ChatMessage = {
      id: `temp-${Date.now()}`,
      _temp: true,
      conversationId: conversation.id,
      senderId: currentUserId,
      body,
      createdAt: new Date().toISOString(),
      read: false,
    };
    setMessages((prev) => [...prev, temp]);
    setDraft('');
    scrollToBottom();

    try {
      const res = await axiosInstance.post('/v1/messages', {
        recipientId: otherId,
        body,
        source: 'dm',
      });
      const saved: ChatMessage = res.data;
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== temp.id);
        if (withoutTemp.some((m) => m.id === saved.id)) return withoutTemp;
        return [...withoutTemp, saved];
      });
      onActivity?.(saved);
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
      setDraft(body);
      setError(e?.response?.data?.error || 'Message failed to send.');
    } finally {
      setSending(false);
    }
  }, [draft, sending, conversation.id, currentUserId, otherId, onActivity, scrollToBottom]);

  // Support sent from inside the thread → post a DM carrying the supportPaymentId
  const handleSupportSent = useCallback(async ({ supportId, note }: { supportId?: string; note?: string }) => {
    try {
      const res = await axiosInstance.post('/v1/messages', {
        recipientId: otherId,
        body: note || '',
        supportPaymentId: supportId,
        source: 'dm',
      });
      appendDeduped(res.data);
      onActivity?.(res.data);
    } catch (_) {
      /* support recorded; bubble will appear on next load */
    }
  }, [otherId, appendDeduped, onActivity]);

  const renderMessage = ({ item: m }: { item: ChatMessage }) => {
    const mine = m.senderId === currentUserId;
    const isSupport = m.supportPaymentId != null;
    const isTrack = m.sharedSongId != null && !isSupport;
    const rowStyle = [styles.row, mine ? styles.rowMine : styles.rowTheirs];

    if (isSupport) {
      return (
        <View style={rowStyle}>
          <View style={styles.support}>
            <View style={styles.supportTop}>
              <Zap size={16} color="#C49A0A" />
              <Text style={styles.supportTopText}>
                {mine ? 'You sent support' : `${otherName} sent support`}
              </Text>
            </View>
            {!!m.body && <Text style={styles.supportNote}>"{m.body}"</Text>}
          </View>
          <Text style={styles.time}>{timeLabel(m.createdAt)}</Text>
        </View>
      );
    }

    if (isTrack) {
      return (
        <View style={rowStyle}>
          <View style={styles.track}>
            <View style={styles.trackIcon}>
              <Music size={20} color="#4a9eff" />
            </View>
            <View style={styles.trackMeta}>
              <Text style={styles.trackTitle}>Shared a track</Text>
              <Text style={styles.trackSub}>Tap to listen</Text>
            </View>
            <Play size={20} color="#4a9eff" />
          </View>
          {!!m.body && (
            <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
              <Text style={styles.bubbleText}>{m.body}</Text>
            </View>
          )}
          <Text style={styles.time}>{timeLabel(m.createdAt)}</Text>
        </View>
      );
    }

    return (
      <View style={rowStyle}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text style={styles.bubbleText}>{m.body}</Text>
        </View>
        <Text style={styles.time}>{timeLabel(m.createdAt)}</Text>
      </View>
    );
  };

  return (
    <View style={styles.thread}>
      <View style={styles.head}>
        <TouchableOpacity style={styles.back} onPress={onBack} accessibilityLabel="Back to messages">
          <ChevronLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.avatar}>
          {conversation.otherPhotoUrl ? (
            <Image source={{ uri: buildUrl(conversation.otherPhotoUrl) || undefined }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarInitials}>{initials(otherName)}</Text>
          )}
        </View>
        <View style={styles.who}>
          <Text style={styles.whoName}>{otherName}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.stateFill}>
          <ActivityIndicator size="small" color="#4a9eff" />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.stateFill}>
          <Text style={styles.emptyText}>
            Say something to <Text style={styles.emptyStrong}>{otherName}</Text>.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          renderItem={renderMessage}
          contentContainerStyle={styles.scrollContent}
          onContentSizeChange={() => scrollToBottom(false)}
          showsVerticalScrollIndicator={false}
        />
      )}

      {!!error && <Text style={styles.threadError}>{error}</Text>}

      <View style={styles.composer}>
        <TouchableOpacity style={styles.composerIcon} accessibilityLabel="Share a track">
          <Music size={20} color="#AAAAAA" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.composerIcon}
          accessibilityLabel="Send support"
          onPress={() => setSupportOpen(true)}
        >
          <Zap size={20} color="#C49A0A" />
        </TouchableOpacity>
        <TextInput
          style={styles.composerInput}
          placeholder={`Message ${otherName}…`}
          placeholderTextColor="#666666"
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <TouchableOpacity
          style={[styles.composerSend, (!draft.trim() || sending) && styles.composerSendDisabled]}
          onPress={send}
          disabled={!draft.trim() || sending}
          accessibilityLabel="Send message"
        >
          <ArrowUp size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <SupportSheet
        isOpen={supportOpen}
        onClose={() => setSupportOpen(false)}
        artistId={otherId}
        artistName={otherName}
        source="dm"
        onSuccess={handleSupportSent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  thread: {
    flex: 1,
    backgroundColor: '#000000',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomWidth: 1,
  },
  back: {
    padding: 4,
    marginRight: 6,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
    fontSize: 14,
    fontWeight: '700',
  },
  who: {
    marginLeft: 12,
  },
  whoName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  stateFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#AAAAAA',
    fontSize: 14,
  },
  emptyStrong: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  scrollContent: {
    padding: 14,
  },
  row: {
    marginBottom: 12,
    maxWidth: '82%',
  },
  rowMine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  rowTheirs: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bubbleMine: {
    backgroundColor: '#004aad',
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
  },
  time: {
    color: '#666666',
    fontSize: 10,
    marginTop: 3,
    paddingHorizontal: 4,
  },
  support: {
    backgroundColor: 'rgba(196, 154, 10, 0.1)',
    borderColor: 'rgba(196, 154, 10, 0.3)',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  supportTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  supportTopText: {
    color: '#C49A0A',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
  supportNote: {
    color: '#FFFFFF',
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 6,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 158, 255, 0.08)',
    borderColor: 'rgba(74, 158, 255, 0.25)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
    minWidth: 220,
  },
  trackIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(74, 158, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackMeta: {
    flex: 1,
    marginLeft: 10,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  trackSub: {
    color: '#AAAAAA',
    fontSize: 12,
    marginTop: 1,
  },
  threadError: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 6,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    borderTopWidth: 1,
  },
  composerIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInput: {
    flex: 1,
    maxHeight: 110,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 15,
    marginHorizontal: 6,
  },
  composerSend: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#004aad',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerSendDisabled: {
    opacity: 0.4,
  },
});

export default MessageThread;