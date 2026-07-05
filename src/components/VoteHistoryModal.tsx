// src/components/VoteHistoryModal.tsx
// Ported from web `voteHistoryModal.jsx` — purely presentational. Receives the
// full vote list from VoteHistorySection (which owns the single
// /v1/vote/history fetch). No data fetching, no dummy data. Images go through
// the shared buildUrl for R2/CDN consistency. Visual language mirrors
// SupportedArtistPicker so the two modals read as one family.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Image,
} from 'react-native';
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

const formatDate = (dateString?: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
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
          <Text style={styles.voteInterval}>{getIntervalLabel(vote.interval)}</Text>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={show} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.modal} activeOpacity={1} onPress={() => {}}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityLabel="Close">
            <X size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Vote history</Text>
            <View style={styles.subtitleRow}>
              <Text style={styles.subtitleCount}>{count}</Text>
              <Text style={styles.subtitleLabel}>{countLabel}</Text>
              {count > 0 && <Text style={styles.subtitleVotedFor}>You voted for</Text>}
            </View>
          </View>

          {votes.length > 0 ? (
            <FlatList
              data={votes}
              keyExtractor={(v) => String(v.voteId)}
              renderItem={renderVote}
              style={styles.votesContainer}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <View style={styles.emptyState}>
              <History size={44} color="#888888" />
              <Text style={styles.emptyTitle}>No votes yet</Text>
              <Text style={styles.emptySub}>Go support your favorite artists and songs.</Text>
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#0d0d0d',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 20,
    maxHeight: '80%',
    padding: 20,
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    padding: 6,
  },
  header: {
    marginBottom: 16,
    paddingRight: 32,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 6,
  },
  subtitleCount: {
    color: '#4a9eff',
    fontSize: 18,
    fontWeight: '800',
    marginRight: 6,
  },
  subtitleLabel: {
    color: '#AAAAAA',
    fontSize: 13,
    marginRight: 10,
  },
  subtitleVotedFor: {
    color: '#888888',
    fontSize: 13,
  },
  votesContainer: {
    flexGrow: 0,
  },
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    borderBottomWidth: 1,
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
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  nomineePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nomineeInfo: {
    marginLeft: 12,
    flex: 1,
  },
  nomineeName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  nomineeType: {
    color: '#888888',
    fontSize: 12,
    marginTop: 2,
  },
  voteRight: {
    alignItems: 'flex-end',
  },
  voteDate: {
    color: '#CCCCCC',
    fontSize: 13,
    fontWeight: '600',
  },
  voteInterval: {
    color: '#888888',
    fontSize: 11,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySub: {
    color: '#888888',
    fontSize: 13,
    marginTop: 4,
  },
});

export default VoteHistoryModal;