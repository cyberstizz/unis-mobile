// src/components/FanbaseFunnel.tsx
// Ported from web `fanbaseFunnle.jsx`.
//
// ★ analytics: real fanbase funnel — replaces the old placeholder "Artist
// intelligence" collapsible. Self-fetching, handles zero states gracefully
// (pre-launch shows an intentional empty state).
//
// GET /v1/artist-analytics/artist/{id}/fanbase?period[&gender][&age][&jurisdictionId]

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ImageBackground,
  ActivityIndicator,
} from 'react-native';
import axiosInstance from '../services/axiosInstance';
import {
  FunnelBody,
  FunnelControls,
  FunnelSummaryChips,
  TipValue,
  FunnelData,
  FunnelFilters,
  initialOf,
} from './funnelShared';

const STAGE_TIPS: Record<string, string> = {
  plays:
    'Total counted plays of your songs in this window — every play past the 15s / 25% threshold, including replays. Listeners below dedupes this down to unique people.',
  listeners:
    "Unique people who've played at least one of your songs past the count threshold (15s / 25%). One person counts once, no matter how many replays.",
  likers: 'Listeners who liked at least one of your songs.',
  voters:
    'Listeners who spent a vote on you during an award cycle. Votes are scarce, so this is a stronger signal than a like.',
  followers: 'Listeners who followed you to keep up with new releases and wins.',
  supporters:
    'Listeners who chose you as their supported artist — the deepest commitment on Unis. Each member can back exactly one artist at a time.',
};

const REPEAT_TIP =
  'Total plays ÷ unique listeners. Above 1.0× means people replay your music instead of listening once and leaving.';
const COMPLETION_TIP =
  'The share of plays that reached the finish across your catalog, not skipped early. High completion means your songs hold attention.';
const SOURCE_TIP =
  'Where plays came from — the screen or surface a listener was on when they pressed play.';

interface FanbaseFunnelProps {
  artistId?: string;
  artistPhoto?: string | null;
  artistName?: string;
  ambientImage?: string | null;
}

const FanbaseFunnel: React.FC<FanbaseFunnelProps> = ({
  artistId,
  artistPhoto,
  artistName,
  ambientImage,
}) => {
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

  // ★ ambient: profile photo first — the song artwork was taking precedence,
  // which is why the glow didn't match the artist's image.
  const ambient = artistPhoto || ambientImage || null;

  const fetchFanbase = useCallback(async (id: string | undefined, p: string, f: FunnelFilters) => {
    if (!id) return;
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
        `/v1/artist-analytics/artist/${id}/fanbase?${params.toString()}`
      );
      setData(res.data || null);
    } catch (err) {
      console.error('Fanbase analytics fetch failed:', err);
      setError('Could not load your fanbase analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFanbase(artistId, period, filters);
  }, [artistId, period, filters, fetchFanbase]);

  const toggleTip = (key: string) => setOpenTip((prev) => (prev === key ? null : key));

  const repeatRatio = data?.repeatListenRatio || 0;
  const uniqueListeners = data?.uniqueListeners || 0;
  const funnel = data?.funnel || [];
  const hasAnyFanbase = funnel.some((s) => Number(s.value || 0) > 0);
  const availableJurisdictions = data?.availableJurisdictions || [];

  const retry = () => fetchFanbase(artistId, period, filters);

  const inner = (
    <View style={styles.inner}>
      <View style={styles.head}>
        <View style={styles.titleWrap}>
          <View style={styles.avatar}>
            {artistPhoto ? (
              <Image source={{ uri: artistPhoto }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarFallback}>{initialOf(artistName)}</Text>
            )}
          </View>
          <View>
            <Text style={styles.eyebrow}>Audience funnel</Text>
            <Text style={styles.title}>Your momentum</Text>
          </View>
        </View>

        {hasAnyFanbase && uniqueListeners > 0 && (
          <View style={styles.ratio}>
            <TipValue tipKey="repeat" tip={REPEAT_TIP} openTip={openTip} onToggle={toggleTip}>
              <Text style={styles.ratioValue}>{repeatRatio.toFixed(2)}×</Text>
            </TipValue>
            <Text style={styles.ratioLabel}>Repeat-listen rate</Text>
          </View>
        )}
      </View>

      {/* ★ ui: search information ABOVE the toggles */}
      <FunnelSummaryChips
        period={period}
        filters={filters}
        availableJurisdictions={availableJurisdictions}
      />

      {/* ★ ui: compact selector row */}
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
          <Text style={styles.stateText}>Loading your fanbase…</Text>
        </View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={retry}>
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
          emptyTitleAllTime="Your fanbase starts here"
          emptyBodyAllTime="As listeners discover, like, vote for, follow, and support you, this is where you'll watch casual plays turn into a real community."
          openTip={openTip}
          onToggleTip={toggleTip}
          showAdvanced={showAdvanced}
          setShowAdvanced={(updater) => setShowAdvanced(updater)}
        />
      )}
    </View>
  );

  if (ambient) {
    return (
      <View style={styles.section}>
        <ImageBackground
          source={{ uri: ambient }}
          style={styles.ambientFill}
          imageStyle={styles.ambientImage}
          blurRadius={30}
        >
          <View style={styles.ambientScrim}>{inner}</View>
        </ImageBackground>
      </View>
    );
  }

  return <View style={[styles.section, styles.sectionPlain]}>{inner}</View>;
};

const styles = StyleSheet.create({
  section: {
    borderRadius: 18,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionPlain: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  ambientFill: {
    width: '100%',
  },
  ambientImage: {
    opacity: 0.35,
  },
  ambientScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  inner: {
    padding: 18,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
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
    fontSize: 20,
    fontWeight: '700',
  },
  ratio: {
    alignItems: 'flex-end',
  },
  ratioValue: {
    color: '#4a9eff',
    fontSize: 20,
    fontWeight: '900',
  },
  ratioLabel: {
    color: '#888888',
    fontSize: 10,
    marginTop: 2,
  },
  state: {
    alignItems: 'center',
    paddingVertical: 24,
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

export default FanbaseFunnel;