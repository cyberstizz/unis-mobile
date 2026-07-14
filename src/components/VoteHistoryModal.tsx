// src/components/VoteHistoryModal.tsx
// Ported from web `voteHistoryModal.jsx` — purely presentational. Receives the
// full vote list from VoteHistorySection (which owns the single
// /v1/vote/history fetch). No data fetching, no dummy data. Images go through
// the shared buildUrl for R2/CDN consistency.
//
// ★ PARITY PASS (matches the web QA fixes):
//   1. Full-screen sheet with a STICKY header close button and a STICKY footer
//      "Done" button. On web the popup could be scrolled away from its own
//      close control; here there is no scroll position that strands the user.
//      RN's <Modal> already renders in a native overlay window, so the web
//      containment bug (a transformed ancestor capturing position:fixed) cannot
//      occur on mobile — but the UX is now identical.
//   2. Timezone-safe date parsing. A bare YYYY-MM-DD parses as UTC midnight and
//      renders as the PREVIOUS day in negative-offset zones (New York). Anchor
//      to local noon.
//   3. Removed the dangling "You voted for" subtitle fragment.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Image,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, History, Music, User } from 'lucide-react-native';
import buildUrl from '../utils/buildUrl';

export interface VoteHistoryItem {
  voteId: string | number;
  nomineeName?: string;
  nomineeImage?: string | null;
  targetType?: string; // 'artist' | 'song'
  voteDate?: string;
  interval?: string;
}

interface VoteHistoryModalProps {
  show: boolean;
  onClose: () => void;
  votes?: VoteHistoryItem[];
}

// ★ tz-safe: date-only strings anchored to local noon
const formatDate = (dateString?: string): string => {
  if (!dateString) return '';
  const str = String(dateString);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(str)
    ? new Date(`${str}T12:00:00`)
    : new Date(str);
  if (Number.isNaN(date.getTime())) return '';
  const month = date.getMonth() + 1;
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
};

const getIntervalLabel = (interval?: string): string => {
  const labels: Record<string, string> = {
    day: 'Daily',
    week: 'Weekly',
    month: 'Monthly',
    quarter: 'Quarterly',
    midterm: 'Midterm',
    year: 'Yearly',
  };
  return labels[interval?.toLowerCase() || ''] || interval || 'Daily';
};

const VoteHistoryModal: React.FC<VoteHistoryModalProps> = ({ show, onClose, votes = [] }) => {
  const count = votes.length;
  const countLabel = count === 1 ? 'vote cast' : 'votes cast';

  const renderVote = ({ item: vote }: { item: VoteHistoryItem }) => {
    const img = buildUrl(vote.nomineeImage);
    const isArtist = vote.targetType === 'artist';
    return (
      <View style={styles.voteRow}>
        <View style={styles.voteLeft}>
          {img ? (
            <Image source={{ uri: img }} style={styles.nomineeImage} />
          ) : (
            <View style={[styles.nomineeImage, styles.nomineePlaceholder]}>
              {isArtist ? <User size={20} color="#AAAAAA" /> : <Music size={20} color="#AAAAAA" />}
            </View>
          )}
          <View style={styles.nomineeInfo}>
            <Text style={styles.nomineeName} numberOfLines={1}>
              {vote.nomineeName || 'Unknown'}
            </Text>
            <Text style={styles.nomineeType}>{isArtist ? 'Artist' : 'Song'}</Text>
          </View>
        </View>
        <View style={styles.voteRight}>
          <Text style={styles.voteDate}>{formatDate(vote.voteDate)}</Text>
          <View style={styles.intervalChip}>
            <Text style={styles.intervalText}>{getIntervalLabel(vote.interval)}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={show}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
        {/* ★ sticky header — close is always on screen */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Vote history</Text>
            <View style={styles.subtitleRow}>
              <Text style={styles.subtitleCount}>{count}</Text>
              <Text style={styles.subtitleLabel}>{countLabel.toUpperCase()}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Close vote history"
          >
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {votes.length > 0 ? (
          <FlatList
            data={votes}
            keyExtractor={(v) => String(v.voteId)}
            renderItem={renderVote}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.emptyState}>
            <History size={44} color="#4a9eff" />
            <Text style={styles.emptyTitle}>No votes yet</Text>
            <Text style={styles.emptySub}>Go support your favorite artists and songs.</Text>
          </View>
        )}

        {/* ★ sticky footer — a second, unmissable exit */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.doneBtn} onPress={onClose} accessibilityRole="button">
            <Text style={styles.doneText}>DONE</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomWidth: 1,
  },
  headerText: {
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 8,
  },
  subtitleCount: {
    color: '#4a9eff',
    fontSize: 24,
    fontWeight: '800',
    marginRight: 8,
  },
  subtitleLabel: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
  },
  voteLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  nomineeImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 2,
    borderColor: '#4a9eff',
  },
  nomineePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  nomineeInfo: {
    marginLeft: 12,
    flex: 1,
  },
  nomineeName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  nomineeType: {
    color: '#888888',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 3,
    textTransform: 'uppercase',
  },
  voteRight: {
    alignItems: 'flex-end',
  },
  voteDate: {
    color: '#CCCCCC',
    fontSize: 13,
    fontWeight: '600',
  },
  intervalChip: {
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(74, 158, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(74, 158, 255, 0.35)',
  },
  intervalText: {
    color: '#4a9eff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 14,
  },
  emptySub: {
    color: '#888888',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    borderTopWidth: 1,
    backgroundColor: '#0d0d0d',
  },
  doneBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4a9eff',
  },
  doneText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
});

export default VoteHistoryModal;