// src/components/SupporterSection.tsx
// Ported from web `SupporterSection.jsx`.
//
// ★ item 5: supporters pulled out of the funnel into their own section.
// GET  /v1/artist-analytics/artist/{id}/supporters
// POST /v1/messages/broadcast { body }   (BroadcastComposer)
//
// Web's message buttons navigate to /messages with a compose payload. The
// mobile app has no Messages screen yet, so messageSupporter attempts the
// navigation and falls back to an informative alert. When the Messages screen
// is ported, this works with zero changes here.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Crown, Heart, MessageCircle, Megaphone, Send, X, TrendingUp } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';
import buildUrl from '../utils/buildUrl';

const formatNumber = (n: any) => Number(n || 0).toLocaleString();
const initialOf = (name?: string) => (name ? name.charAt(0).toUpperCase() : '?');

const formatSince = (value?: string): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

interface Supporter {
  userId?: string;
  username?: string;
  photoUrl?: string | null;
  plays?: number | null;
  since?: string;
}

interface SupportersData {
  supportersCount?: number;
  topSupporter?: Supporter | null;
  recentSupporters?: Supporter[];
  supporterGrowth?: { day: string; count: number }[];
}

// ── Broadcast composer ───────────────────────────────────────
const BroadcastComposer: React.FC<{
  supporterCount: number;
  onClose: () => void;
}> = ({ supporterCount, onClose }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sent: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await axiosInstance.post('/v1/messages/broadcast', { body });
      setResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not send the broadcast.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.scbOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.scbShell} activeOpacity={1} onPress={() => {}}>
          <TouchableOpacity style={styles.scbClose} onPress={onClose} accessibilityLabel="Close">
            <X size={18} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.scbHead}>
            <View style={styles.scbIcon}>
              <Megaphone size={20} color="#4a9eff" />
            </View>
            <Text style={styles.scbTitle}>Message your supporters</Text>
            <Text style={styles.scbSub}>
              Each of your {formatNumber(supporterCount)}{' '}
              {supporterCount === 1 ? 'supporter' : 'supporters'} gets this as a direct
              message they can reply to.
            </Text>
          </View>

          {result ? (
            <View style={styles.scbDone}>
              <Send size={26} color="#4a9eff" />
              <Text style={styles.scbDoneTitle}>
                Sent to {formatNumber(result.sent)} {result.sent === 1 ? 'supporter' : 'supporters'}
              </Text>
              {result.skipped > 0 && (
                <Text style={styles.scbDoneSub}>
                  {formatNumber(result.skipped)} skipped (blocked or unavailable)
                </Text>
              )}
              <TouchableOpacity style={styles.scbBtn} onPress={onClose}>
                <Text style={styles.scbBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.scbInput}
                multiline
                numberOfLines={4}
                maxLength={1000}
                placeholder="Share a new drop, a show, or just say thanks…"
                placeholderTextColor="#666666"
                value={text}
                onChangeText={setText}
                textAlignVertical="top"
              />
              {!!error && <Text style={styles.scbError}>{error}</Text>}
              <TouchableOpacity
                style={[styles.scbBtn, (!text.trim() || busy) && styles.scbBtnDisabled]}
                onPress={send}
                disabled={!text.trim() || busy}
              >
                <Text style={styles.scbBtnText}>
                  {busy ? 'Sending…' : 'Send to all supporters'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

interface SupporterSectionProps {
  artistId?: string;
}

const SupporterSection: React.FC<SupporterSectionProps> = ({ artistId }) => {
  const navigation = useNavigation<any>();
  const [data, setData] = useState<SupportersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  const fetchSupporters = useCallback(async (id?: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get(`/v1/artist-analytics/artist/${id}/supporters`);
      setData(res.data || null);
    } catch (err) {
      console.error('Supporters fetch failed:', err);
      setError('Could not load your supporters.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSupporters(artistId);
  }, [artistId, fetchSupporters]);

  // Open a direct thread with this supporter. Passes name + photo so the thread
  // opens with the right person even before any message exists. (Web parity —
  // falls back to an alert until the Messages screen is ported to mobile.)
  const messageSupporter = (sup: Supporter) => {
    if (!sup?.userId) return;
    try {
      navigation.navigate('Messages', {
        compose: { userId: sup.userId, username: sup.username, photoUrl: sup.photoUrl },
      });
    } catch (_) {
      Alert.alert('Coming soon', 'Direct messaging is coming to the mobile app.');
    }
  };

  const count = Number(data?.supportersCount || 0);
  const topSupporter = data?.topSupporter || null;
  const recentSupporters = data?.recentSupporters || [];
  // ★ CHART REMOVED (web parity). The old sparkline plotted `supporterGrowth`,
  //   which the backend returns as *only the days that had activity* — not a
  //   padded 30-day series. With 2 new supporters that produced 2 flex-1 bars
  //   splitting the entire width: an unreadable block. Rather than fake a
  //   30-day axis client-side, the same fact is now stated in one line.
  const growth = data?.supporterGrowth || [];
  const newLast30 = growth.reduce((sum, g) => sum + Number(g.count || 0), 0);

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.eyebrow}>Who's backing you</Text>
          <Text style={styles.title}>Your supporters</Text>
        </View>
        {count > 0 && (
          <TouchableOpacity style={styles.broadcastBtn} onPress={() => setBroadcastOpen(true)}>
            <Megaphone size={15} color="#FFFFFF" />
            <Text style={styles.broadcastText}>Broadcast</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator size="small" color="#4a9eff" />
          <Text style={styles.stateText}>Loading your supporters…</Text>
        </View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchSupporters(artistId)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {topSupporter && (
            <View style={styles.topfan}>
              <View style={styles.topfanBadge}>
                <Crown size={11} color="#C49A0A" />
                <Text style={styles.topfanBadgeText}>#1 Supporter</Text>
              </View>
              {topSupporter.photoUrl ? (
                <Image
                  source={{ uri: buildUrl(topSupporter.photoUrl) || undefined }}
                  style={styles.topfanImg}
                />
              ) : (
                <View style={[styles.topfanImg, styles.phCircle]}>
                  <Text style={styles.phInitial}>{initialOf(topSupporter.username)}</Text>
                </View>
              )}
              <View style={styles.topfanMeta}>
                <Text style={styles.topfanName}>{topSupporter.username || 'Supporter'}</Text>
                <Text style={styles.topfanSince}>
                  {topSupporter.plays != null
                    ? `${formatNumber(topSupporter.plays)} plays · `
                    : ''}
                  since {formatSince(topSupporter.since)}
                </Text>
              </View>
              {!!topSupporter.userId && (
                <TouchableOpacity
                  style={styles.msgBtn}
                  onPress={() => messageSupporter(topSupporter)}
                  accessibilityLabel={`Message ${topSupporter.username || 'supporter'}`}
                >
                  <MessageCircle size={15} color="#4a9eff" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ★ headline count + the 30-day delta, on one legible line */}
          <View style={styles.countRow}>
            <Text style={styles.countNum}>{formatNumber(count)}</Text>
            <Text style={styles.countLabel}>
              {count === 1 ? 'supporter' : 'supporters'} backing you
            </Text>

            {newLast30 > 0 && (
              <View style={styles.trendChip}>
                <TrendingUp size={13} color="#4a9eff" />
                <Text style={styles.trendNum}>+{formatNumber(newLast30)}</Text>
                <Text style={styles.trendLabel}>LAST 30 DAYS</Text>
              </View>
            )}
          </View>

          {recentSupporters.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.peopleRow}>
              {recentSupporters.map((s) => (
                <View style={styles.person} key={s.userId}>
                  {s.photoUrl ? (
                    <Image source={{ uri: buildUrl(s.photoUrl) || undefined }} style={styles.personImg} />
                  ) : (
                    <View style={[styles.personImg, styles.phCircle]}>
                      <Text style={styles.phInitial}>{initialOf(s.username)}</Text>
                    </View>
                  )}
                  <Text style={styles.personName} numberOfLines={1}>
                    {s.username || 'Supporter'}
                  </Text>
                  <Text style={styles.personSince}>since {formatSince(s.since)}</Text>
                  <TouchableOpacity
                    style={styles.personMsg}
                    onPress={() => messageSupporter(s)}
                    accessibilityLabel={`Message ${s.username || 'supporter'}`}
                  >
                    <MessageCircle size={13} color="#4a9eff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.empty}>
              <Heart size={24} color="#888888" />
              <Text style={styles.emptyText}>
                No supporters yet. When a listener chooses to support you, they'll appear
                here by name — the start of your real community.
              </Text>
            </View>
          )}

        </>
      )}

      {broadcastOpen && (
        <BroadcastComposer supporterCount={count} onClose={() => setBroadcastOpen(false)} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headText: {
    flex: 1,
    paddingRight: 10,
  },
  eyebrow: {
    color: '#4a9eff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  broadcastBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004aad',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  broadcastText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },
  state: {
    alignItems: 'center',
    paddingVertical: 22,
  },
  stateText: {
    color: '#AAAAAA',
    fontSize: 13,
    marginTop: 8,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  topfan: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(196, 154, 10, 0.06)',
    borderColor: 'rgba(196, 154, 10, 0.25)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  topfanBadge: {
    position: 'absolute',
    top: -10,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1408',
    borderColor: 'rgba(196, 154, 10, 0.4)',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  topfanBadgeText: {
    color: '#C49A0A',
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 4,
  },
  topfanImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  phCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  phInitial: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  topfanMeta: {
    flex: 1,
    marginLeft: 12,
  },
  topfanName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  topfanSince: {
    color: '#888888',
    fontSize: 12,
    marginTop: 2,
  },
  msgBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(74, 158, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    rowGap: 8,
    marginBottom: 12,
  },
  countNum: {
    color: '#4a9eff',
    fontSize: 28,
    fontWeight: '900',
    marginRight: 8,
  },
  countLabel: {
    color: '#AAAAAA',
    fontSize: 13,
  },
  peopleRow: {
    marginBottom: 6,
  },
  person: {
    width: 96,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginRight: 10,
  },
  personImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 8,
  },
  personName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 84,
  },
  personSince: {
    color: '#888888',
    fontSize: 10,
    marginTop: 2,
  },
  personMsg: {
    marginTop: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(74, 158, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  emptyText: {
    color: '#AAAAAA',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
  },
  // ★ replaces the chart: the 30-day delta, stated once, unmistakably
  trendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(74, 158, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(74, 158, 255, 0.35)',
  },
  trendNum: {
    color: '#4a9eff',
    fontSize: 14,
    fontWeight: '800',
  },
  trendLabel: {
    color: '#888888',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // ===========================================================================
  // ★ BroadcastComposer styles. These were REFERENCED by the component but
  //   never defined — every `styles.scb*` lookup resolved to `undefined`, so
  //   the broadcast modal was rendering with no overlay, no card, and no button
  //   chrome. Ported from the web `.scb` block for 1:1 parity.
  // ===========================================================================
  scbOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(3, 5, 10, 0.72)',
  },
  scbShell: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '88%',
    padding: 24,
    paddingTop: 26,
    borderRadius: 20,
    backgroundColor: '#0d1119',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  scbClose: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  scbHead: {
    alignItems: 'center',
    marginBottom: 16,
  },
  scbIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(74, 158, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(74, 158, 255, 0.35)',
  },
  scbTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
  },
  scbSub: {
    color: '#888888',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 5,
  },
  scbInput: {
    width: '100%',
    minHeight: 110,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    color: '#FFFFFF',
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  scbError: {
    color: '#f0a5a5',
    fontSize: 13,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(229, 75, 74, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(229, 75, 74, 0.35)',
    marginBottom: 12,
  },
  scbBtn: {
    width: '100%',
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4a9eff',
  },
  scbBtnDisabled: {
    opacity: 0.5,
  },
  scbBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  scbDone: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  scbDoneTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 10,
  },
  scbDoneSub: {
    color: '#888888',
    fontSize: 13,
    marginTop: 5,
    marginBottom: 14,
    textAlign: 'center',
  },
});

export default SupporterSection;