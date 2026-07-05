// src/components/TerritoryRankSection.tsx
// Ported from web `TerritoryRankSection.jsx`.
//
// ★ Dashboard shows only Week / Month / Year. All-time lives on the Discover page.
// GET /v1/artist-analytics/artist/{artistId}/territory-rank
// Handles the 'calculating' cold-start status from the nightly job.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { MapPin, Clock, Sparkles, RefreshCw } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';

const PERIOD_ORDER = ['week', 'month', 'year'] as const;
type PeriodKey = typeof PERIOD_ORDER[number];
const PERIOD_LABELS: Record<PeriodKey, string> = { week: 'Week', month: 'Month', year: 'Year' };

interface RankRow {
  jurisdictionId: string;
  jurisdictionName: string;
  overallRank?: number | null;
  genreRank?: number | null;
}

interface TerritoryRankData {
  status?: string;
  genreName?: string | null;
  defaultPeriod?: string;
  computedAt?: string;
  periods?: Partial<Record<PeriodKey, RankRow[]>>;
}

const formatUpdated = (iso?: string): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

interface TerritoryRankSectionProps {
  artistId?: string;
}

const TerritoryRankSection: React.FC<TerritoryRankSectionProps> = ({ artistId }) => {
  const [data, setData] = useState<TerritoryRankData | null>(null);
  const [period, setPeriod] = useState<PeriodKey>('year');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRank = useCallback(() => {
    if (!artistId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    axiosInstance.get(`/v1/artist-analytics/artist/${artistId}/territory-rank`)
      .then((res) => {
        if (cancelled) return;
        setData(res.data || null);
        const dp = res.data?.defaultPeriod;
        if (dp && (PERIOD_ORDER as readonly string[]).includes(dp)) setPeriod(dp as PeriodKey);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Territory rank fetch failed:', err);
        setError('Could not load territory rank.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [artistId]);

  useEffect(() => { fetchRank(); }, [fetchRank]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color="#4a9eff" />
        <Text style={styles.stateText}>Loading your rank…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchRank}>
          <RefreshCw size={14} color="#FFFFFF" />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data) return null;

  // Cold start: table not yet populated by the nightly job / manual trigger.
  if (data.status === 'calculating') {
    return (
      <View style={styles.center}>
        <Sparkles size={26} color="#4a9eff" />
        <Text style={styles.coldTitle}>Ranks are calculating</Text>
        <Text style={styles.coldBody}>
          Your standing is computed once a night. Check back after tonight's
          update to see where you place — neighborhood to national.
        </Text>
      </View>
    );
  }

  const genreName = data.genreName || null;
  const rows: RankRow[] = (data.periods && data.periods[period]) || [];
  const home = rows[0] || null; // ★ home / most-local jurisdiction
  const updated = formatUpdated(data.computedAt);

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.caption}>
          Your standing where you're from, ranked by points.
        </Text>
        {updated && (
          <View style={styles.updated}>
            <Clock size={12} color="#888888" />
            <Text style={styles.updatedText}>Updated {updated}</Text>
          </View>
        )}
      </View>

      <View style={styles.toggle}>
        {PERIOD_ORDER.map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.toggleBtn, p === period && styles.toggleBtnActive]}
            onPress={() => setPeriod(p)}
            accessibilityRole="tab"
            accessibilityState={{ selected: p === period }}
          >
            <Text style={[styles.toggleText, p === period && styles.toggleTextActive]}>
              {PERIOD_LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ★ Big standout headline — immediate "I am this rank" read */}
      {home && home.overallRank != null && (
        <View style={styles.headline}>
          <Text style={styles.headlineLead}>You're</Text>
          <Text style={styles.headlineNum}>#{home.overallRank}</Text>
          <Text style={styles.headlineIn}>in {home.jurisdictionName}</Text>
        </View>
      )}

      {rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.stateText}>No ranking yet for this period.</Text>
        </View>
      ) : (
        rows.map((j, i) => (
          <View
            key={j.jurisdictionId}
            style={[styles.row, i === 0 && styles.rowHome]}
          >
            <View style={styles.place}>
              <View style={styles.pin}>
                <MapPin size={15} color="#4a9eff" />
              </View>
              <View style={styles.placeText}>
                <Text style={styles.placeName}>{j.jurisdictionName}</Text>
                {j.genreRank != null && genreName && (
                  <Text style={styles.genre}>
                    #{j.genreRank} · {genreName}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.score}>
              {j.overallRank != null ? (
                <>
                  <Text style={styles.hash}>#</Text>
                  <Text style={styles.num}>{j.overallRank}</Text>
                </>
              ) : (
                <Text style={styles.none}>—</Text>
              )}
            </View>
          </View>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    paddingVertical: 22,
  },
  stateText: {
    color: '#AAAAAA',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  coldTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
  },
  coldBody: {
    color: '#AAAAAA',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 10,
  },
  head: {
    marginBottom: 12,
  },
  caption: {
    color: '#AAAAAA',
    fontSize: 13,
    lineHeight: 18,
  },
  updated: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  updatedText: {
    color: '#888888',
    fontSize: 11,
    marginLeft: 4,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    padding: 3,
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  toggleBtn: {
    borderRadius: 17,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  toggleBtnActive: {
    backgroundColor: '#004aad',
  },
  toggleText: {
    color: '#AAAAAA',
    fontSize: 13,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  headlineLead: {
    color: '#CCCCCC',
    fontSize: 16,
    marginRight: 8,
  },
  headlineNum: {
    color: '#4a9eff',
    fontSize: 36,
    fontWeight: '900',
    marginRight: 8,
  },
  headlineIn: {
    color: '#CCCCCC',
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  rowHome: {
    borderWidth: 1,
    borderColor: 'rgba(74, 158, 255, 0.35)',
  },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(74, 158, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeText: {
    marginLeft: 10,
    flex: 1,
  },
  placeName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  genre: {
    color: '#888888',
    fontSize: 12,
    marginTop: 2,
  },
  score: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  hash: {
    color: '#4a9eff',
    fontSize: 13,
    fontWeight: '700',
    marginRight: 1,
  },
  num: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  none: {
    color: '#666666',
    fontSize: 16,
  },
});

export default TerritoryRankSection;