// src/components/SongStatsModal.tsx
// Ported from web `SongStatsModal.jsx` — ★ D: per-song funnel modal.
//
// Same funnel body as FanbaseFunnel (shared via funnelShared, the mobile
// equivalent of web's shared fanbaseFunnel.scss), scoped to one song with
// per-song copy for the stage tips.
//
// GET /v1/artist-analytics/artist/{artistId}/song/{songId}/funnel?period[&filters]
// Filters reset each time the modal opens for a (different) song.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { X } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';
import buildUrl from '../utils/buildUrl';
import {
  FunnelBody,
  FunnelControls,
  FunnelSummaryChips,
  TipValue,
  FunnelData,
  FunnelFilters,
} from './funnelShared';

const STAGE_TIPS: Record<string, string> = {
  plays:
    'Total counted plays of this song in this window — every play past the 15s / 25% threshold, including replays. Listeners below dedupes this down to unique people.',
  listeners:
    "Unique people who've played this song past the count threshold (15s / 25%). One person counts once, no matter how many replays.",
  likers: 'People who liked this specific song.',
  voters: 'People who spent a vote on this song during an award cycle.',
  followers:
    'Your followers who have actually played this song. A follower who never played this track is not counted here.',
  supporters:
    'Your supporters who have actually played this song. A supporter who never played this track is not counted here.',
};

const REPEAT_TIP =
  'Total plays of this song ÷ unique listeners. Above 1.0× means people replay this track instead of hearing it once.';
const COMPLETION_TIP =
  'The share of plays that reached the finish, not skipped early. High completion means the track holds attention.';
const SOURCE_TIP =
  'Where plays came from — the screen or surface a listener was on when they pressed play.';

interface SongLike {
  songId?: string;
  id?: string;
  title?: string;
  artworkUrl?: string | null;
}

interface SongStatsModalProps {
  show: boolean;
  onClose: () => void;
  artistId?: string;
  song: SongLike | null;
}

const SongStatsModal: React.FC<SongStatsModalProps> = ({ show, onClose, artistId, song }) => {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openTip, setOpenTip] = useState<string | null>(null);

  const [period, setPeriod] = useState('all');
  const [filters, setFilters] = useState<FunnelFilters>({
    gender: 'all',
    age: 'all',
    jurisdictionId: 'all',
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const songId = song?.songId || song?.id;
  const artworkUrl = buildUrl(song?.artworkUrl) || null;

  const fetchFunnel = useCallback(async (p: string, f: FunnelFilters) => {
    if (!artistId || !songId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period: p });
      if (f.gender && f.gender !== 'all') params.set('gender', f.gender);
      if (f.age && f.age !== 'all') params.set('age', f.age);
      if (f.jurisdictionId && f.jurisdictionId !== 'all') {
        params.set('jurisdictionId', f.jurisdictionId);
      }
      const res = await axiosInstance.get(
        `/v1/artist-analytics/artist/${artistId}/song/${songId}/funnel?${params.toString()}`
      );
      setData(res.data || null);
    } catch (err) {
      console.error('Song funnel fetch failed:', err);
      setError("Could not load this song's stats.");
    } finally {
      setLoading(false);
    }
  }, [artistId, songId]);

  useEffect(() => {
    if (show) fetchFunnel(period, filters);
  }, [show, period, filters, fetchFunnel]);

  // reset filters when the modal opens for a (different) song
  useEffect(() => {
    if (show) {
      setPeriod('all');
      setFilters({ gender: 'all', age: 'all', jurisdictionId: 'all' });
      setShowAdvanced(false);
      setOpenTip(null);
    }
  }, [show, songId]);

  const toggleTip = (key: string) => setOpenTip((prev) => (prev === key ? null : key));

  const repeatRatio = data?.repeatListenRatio || 0;
  const uniqueListeners = data?.uniqueListeners || 0;
  const funnel = data?.funnel || [];
  const hasAnyFanbase = funnel.some((s) => Number(s.value || 0) > 0);
  const availableJurisdictions = data?.availableJurisdictions || [];

  return (
    <Modal visible={show} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Close">
            <X size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.head}>
              {artworkUrl && (
                <Image source={{ uri: artworkUrl }} style={styles.artwork} />
              )}
              <View style={styles.headText}>
                <Text style={styles.eyebrow}>Song stats</Text>
                <Text style={styles.title} numberOfLines={2}>
                  {song?.title || 'Song'}
                </Text>
              </View>
              {hasAnyFanbase && uniqueListeners > 0 && (
                <View style={styles.ratio}>
                  <TipValue tipKey="repeat" tip={REPEAT_TIP} openTip={openTip} onToggle={toggleTip}>
                    <Text style={styles.ratioValue}>{repeatRatio.toFixed(2)}×</Text>
                  </TipValue>
                  <Text style={styles.ratioLabel}>Repeat rate</Text>
                </View>
              )}
            </View>

            <FunnelSummaryChips
              period={period}
              filters={filters}
              availableJurisdictions={availableJurisdictions}
            />

            <FunnelControls
              period={period}
              setPeriod={setPeriod}
              filters={filters}
              setFilters={setFilters}
              availableJurisdictions={availableJurisdictions}
            />

            {loading ? (
              <View style={styles.state}>
                <ActivityIndicator size="small" color="#4a9eff" />
                <Text style={styles.stateText}>Loading stats…</Text>
              </View>
            ) : error ? (
              <View style={styles.state}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => fetchFunnel(period, filters)}
                >
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FunnelBody
                data={data}
                period={period}
                filters={filters}
                stageTips={STAGE_TIPS}
                completionTip={COMPLETION_TIP}
                sourceTip={SOURCE_TIP}
                emptyTitleAllTime="No plays on this track yet"
                emptyBodyAllTime="Once listeners start playing this song, its funnel — plays through supporters — appears here."
                openTip={openTip}
                onToggleTip={toggleTip}
                showAdvanced={showAdvanced}
                setShowAdvanced={(updater) => setShowAdvanced(updater)}
              />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    padding: 16,
  },
  modal: {
    backgroundColor: '#0d0d0d',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 20,
    maxHeight: '88%',
    padding: 18,
  },
  close: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 2,
    padding: 6,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingRight: 34,
  },
  artwork: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginRight: 12,
  },
  headText: {
    flex: 1,
    paddingRight: 8,
  },
  eyebrow: {
    color: '#4a9eff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
  },
  ratio: {
    alignItems: 'flex-end',
  },
  ratioValue: {
    color: '#4a9eff',
    fontSize: 18,
    fontWeight: '900',
  },
  ratioLabel: {
    color: '#888888',
    fontSize: 10,
    marginTop: 2,
  },
  state: {
    alignItems: 'center',
    paddingVertical: 26,
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
});

export default SongStatsModal;