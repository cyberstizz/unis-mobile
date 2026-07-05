// src/components/VoteHistorySection.tsx
// Ported from web `VoteHistorySection.jsx`.
//
// Owns the vote-history read path. Fetches GET /v1/vote/history ONCE, shows the
// two most recent votes as a premium preview, and opens VoteHistoryModal (fed
// the already-fetched full list — no second fetch) when the user wants more.
//
// This is a deliberate separate fetch from the profile summary: the summary
// can't cheaply resolve nominee names/images/intervals, but /vote/history
// already does. The modal stays purely presentational.
//
// Props:
//   userId: UUID

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { History, Music, User, ArrowRight } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';
import buildUrl from '../utils/buildUrl';
import VoteHistoryModal, { VoteHistoryItem } from './VoteHistoryModal';

const PREVIEW_COUNT = 2;

interface VoteHistorySectionProps {
  userId: string;
}

const VoteHistorySection: React.FC<VoteHistorySectionProps> = ({ userId }) => {
  const [votes, setVotes] = useState<VoteHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const startedAt = Date.now();
    try {
      const res = await axiosInstance.get('/v1/vote/history');
      const list: VoteHistoryItem[] = Array.isArray(res.data) ? res.data : [];
      setVotes(list);
      console.log(`[VoteHistory] action=fetch status=ok count=${list.length} durationMs=${Date.now() - startedAt}`);
    } catch (err) {
      console.error(`[VoteHistory] action=fetch status=fail durationMs=${Date.now() - startedAt} err=`, err);
      setError('Could not load your vote history.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const preview = votes.slice(0, PREVIEW_COUNT);
  const remaining = Math.max(0, votes.length - PREVIEW_COUNT);

  // ---- States ----
  if (loading) {
    return (
      <View>
        <View style={styles.skeletonRow} />
        <View style={styles.skeletonRow} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchHistory}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (votes.length === 0) {
    return (
      <View style={styles.empty}>
        <History size={32} color="#888888" />
        <Text style={styles.emptyTitle}>No votes yet</Text>
        <Text style={styles.emptySub}>Go back your favorite artists and songs.</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.countRow}>
        <Text style={styles.countNum}>{votes.length}</Text>
        <Text style={styles.countLabel}>
          total {votes.length === 1 ? 'vote' : 'votes'} cast
        </Text>
      </View>

      {preview.map((vote) => {
        const img = buildUrl(vote.nomineeImage);
        const isArtist = vote.targetType === 'artist';
        return (
          <View key={String(vote.voteId)} style={styles.row}>
            {img ? (
              <Image source={{ uri: img }} style={styles.rowImg} />
            ) : (
              <View style={[styles.rowImg, styles.rowImgPh]}>
                {isArtist ? <User size={18} color="#AAAAAA" /> : <Music size={18} color="#AAAAAA" />}
              </View>
            )}
            <View style={styles.rowInfo}>
              <Text style={styles.rowName} numberOfLines={1}>{vote.nomineeName || 'Unknown'}</Text>
              <Text style={styles.rowType}>{isArtist ? 'Artist' : 'Song'}</Text>
            </View>
            <Text style={styles.rowDate}>{formatDate(vote.voteDate)}</Text>
          </View>
        );
      })}

      {remaining > 0 && (
        <TouchableOpacity style={styles.viewAll} onPress={() => setShowModal(true)}>
          <Text style={styles.viewAllText}>View all {votes.length} votes</Text>
          <ArrowRight size={14} color="#4a9eff" />
        </TouchableOpacity>
      )}

      <VoteHistoryModal
        show={showModal}
        onClose={() => setShowModal(false)}
        votes={votes}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  skeletonRow: {
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 10,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 10,
  },
  emptySub: {
    color: '#888888',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  countNum: {
    color: '#4a9eff',
    fontSize: 26,
    fontWeight: '800',
    marginRight: 8,
  },
  countLabel: {
    color: '#AAAAAA',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    borderBottomWidth: 1,
  },
  rowImg: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  rowImgPh: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: {
    flex: 1,
    marginLeft: 12,
    paddingRight: 8,
  },
  rowName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  rowType: {
    color: '#888888',
    fontSize: 12,
    marginTop: 2,
  },
  rowDate: {
    color: '#AAAAAA',
    fontSize: 12,
  },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(74, 158, 255, 0.08)',
  },
  viewAllText: {
    color: '#4a9eff',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 6,
  },
});

export default VoteHistorySection;