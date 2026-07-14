// src/components/TerritoryRankSection.tsx
// Ported from web `TerritoryRankSection.jsx`.
//
// GET /v1/artist-analytics/artist/{artistId}/territory-rank
// Handles the 'calculating' cold-start status from the nightly job.
//
// ★ PARITY PASS (matches the web QA fixes):
//   1. DAY PERIOD ADDED. Mobile was still on Week/Month/Year; web ships
//      Day/Week/Month/Year. 'today' is staged nightly against the last COMPLETE
//      day, so the Day tab shows yesterday's standing.
//   2. CAPTION REBUILD. Was a flat grey sentence. Now a proper header band:
//      accent rule, uppercase eyebrow, weighted subline that changes with the
//      selected period.
//   3. PERIOD STAMP. The old chip printed `computedAt` — i.e. when the nightly
//      job last ran — which never changed when you moved the toggle, so the
//      selected window was never communicated. The stamp is now built FROM THE
//      SELECTED PERIOD, in the same language as FanbaseFunnel's date chip.
//      `computedAt` is demoted to a small note beside it.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { MapPin, CalendarDays, Sparkles, RefreshCw } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';

const ACCENT = '#4a9eff';

const PERIOD_ORDER = ['today', 'week', 'month', 'year'] as const;
type PeriodKey = typeof PERIOD_ORDER[number];

const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

const PERIOD_SUBLINE: Record<PeriodKey, string> = {
  today: 'Where you placed yesterday, across every territory you reach.',
  week: 'Where you placed over the last seven days, across every territory you reach.',
  month: 'Where you placed this month, across every territory you reach.',
  year: 'Where you placed this year, across every territory you reach.',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

const fmtFullDay = (d: Date) => `${MONTHS[d.getMonth()]} ${ordinal(d.getDate())} ${d.getFullYear()}`;
const fmtShortDay = (d: Date) => `${MONTHS[d.getMonth()].slice(0, 3)} ${ordinal(d.getDate())}`;

// ★ Ranks are staged against complete days, so every window ends yesterday.
const buildPeriodStamp = (period: PeriodKey): string => {
  const end = new Date();
  end.setDate(end.getDate() - 1);

  switch (period) {
    case 'today':
      return fmtFullDay(end);
    case 'week': {
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      return `${fmtShortDay(start)} – ${fmtShortDay(end)} ${end.getFullYear()}`;
    }
    case 'month':
      return `${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
    case 'year':
      return `${end.getFullYear()}`;
    default:
      return '';
  }
};

const formatComputed = (iso?: string): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

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

    axiosInstance
      .get(`/v1/artist-analytics/artist/${artistId}/territory-rank`)
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

    return () => {
      cancelled = true;
    };
  }, [artistId]);

  useEffect(() => {
    fetchRank();
  }, [fetchRank]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color={ACCENT} />
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

  if (data.status === 'calculating') {
    return (
      <View style={styles.center}>
        <Sparkles size={26} color={ACCENT} />
        <Text style={styles.coldTitle}>Ranks are calculating</Text>
        <Text style={styles.coldBody}>
          Your standing is computed once a night. Check back after tonight&apos;s
          update to see where you place — neighborhood to national.
        </Text>
      </View>
    );
  }

  const genreName = data.genreName || null;
  const rows: RankRow[] = (data.periods && data.periods[period]) || [];
  const home = rows[0] || null;
  const computed = formatComputed(data.computedAt);
  const periodStamp = buildPeriodStamp(period);

  return (
    <View>
      {/* ★ caption band */}
      <View style={styles.caption}>
        <View style={styles.captionRule} />
        <View style={styles.captionEyebrowRow}>
          <View style={styles.captionDot} />
          <Text style={styles.captionEyebrow}>TERRITORY RANK</Text>
        </View>
        <Text style={styles.captionSub}>{PERIOD_SUBLINE[period]}</Text>
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

      {/* ★ period stamp — actually changes with the toggle */}
      <View style={styles.stampLine}>
        <View style={styles.stamp}>
          <CalendarDays size={12} color={ACCENT} />
          <Text style={styles.stampText}>{periodStamp}</Text>
        </View>
        {computed && <Text style={styles.computedText}>COMPUTED {computed.toUpperCase()}</Text>}
      </View>

      {home && home.overallRank != null && (
        <View style={styles.headline}>
          <Text style={styles.headlineLead}>You&apos;re</Text>
          <Text style={styles.headlineNum}>#{home.overallRank}</Text>
          <Text style={styles.headlineIn}>in {home.jurisdictionName}</Text>
        </View>
      )}

      {rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.stateText}>No ranking yet for {periodStamp}.</Text>
        </View>
      ) : (
        rows.map((j, i) => (
          <View key={j.jurisdictionId} style={[styles.row, i === 0 && styles.rowHome]}>
            <View style={styles.place}>
              <View style={styles.pin}>
                <MapPin size={15} color={ACCENT} />
              </View>
              <View style={styles.placeText}>
                <Text style={styles.placeName} numberOfLines={1}>
                  {j.jurisdictionName}
                </Text>
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
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  stateText: {
    color: '#AAAAAA',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 13,
    marginBottom: 8,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 13,
  },

  // ---- caption band -------------------------------------------------------
  caption: {
    position: 'relative',
    overflow: 'hidden',
    paddingVertical: 14,
    paddingLeft: 20,
    paddingRight: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 14,
  },
  captionRule: {
    position: 'absolute',
    top: 10,
    bottom: 10,
    left: 0,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: ACCENT,
  },
  captionEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  captionDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  captionEyebrow: {
    color: ACCENT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  captionSub: {
    color: 'rgba(244, 244, 245, 0.82)',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    marginTop: 8,
  },

  // ---- period stamp -------------------------------------------------------
  stampLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
    marginBottom: 4,
  },
  stamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(74, 158, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(74, 158, 255, 0.35)',
  },
  stampText: {
    color: ACCENT,
    fontSize: 12,
    fontWeight: '800',
  },
  computedText: {
    color: 'rgba(244, 244, 245, 0.45)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // ---- toggle -------------------------------------------------------------
  toggle: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: ACCENT,
  },
  toggleText: {
    color: 'rgba(244, 244, 245, 0.6)',
    fontSize: 13,
    fontWeight: '700',
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },

  // ---- headline -----------------------------------------------------------
  headline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 10,
  },
  headlineLead: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(244, 244, 245, 0.7)',
  },
  headlineNum: {
    fontSize: 38,
    fontWeight: '800',
    fontStyle: 'italic',
    color: ACCENT,
  },
  headlineIn: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f4f4f5',
  },

  // ---- rows ---------------------------------------------------------------
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 8,
  },
  rowHome: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(74, 158, 255, 0.12)',
  },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  pin: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(74, 158, 255, 0.16)',
  },
  placeText: {
    flex: 1,
    minWidth: 0,
  },
  placeName: {
    fontSize: 15,
    color: '#f4f4f5',
    fontWeight: '600',
  },
  genre: {
    fontSize: 12,
    color: 'rgba(244, 244, 245, 0.6)',
    marginTop: 2,
  },
  score: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  hash: {
    fontSize: 16,
    color: 'rgba(244, 244, 245, 0.55)',
  },
  num: {
    fontSize: 28,
    fontStyle: 'italic',
    fontWeight: '700',
    color: '#f4f4f5',
  },
  none: {
    fontSize: 18,
    color: 'rgba(244, 244, 245, 0.4)',
  },

  // ---- cold start ---------------------------------------------------------
  coldTitle: {
    marginTop: 8,
    fontSize: 17,
    fontWeight: '700',
    color: '#f4f4f5',
  },
  coldBody: {
    marginTop: 6,
    maxWidth: 340,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: 'rgba(244, 244, 245, 0.65)',
  },
});

export default TerritoryRankSection;