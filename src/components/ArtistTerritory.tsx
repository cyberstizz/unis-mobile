// src/components/ArtistTerritory.tsx
// Public territory standing for the artist page (mobile).
//
// WHY THIS IS NOT TerritoryRankSection:
//   The dashboard component calls
//     GET /v1/artist-analytics/artist/{artistId}/territory-rank
//   which is SELF-ONLY at the controller level:
//     if (!requesterId.equals(artistId)) return 403;
//   A fan viewing someone else's page gets 403 signed in, 401 signed out.
//   PublicTerritoryRankController exposes the ranking payload (and only the
//   ranking payload) at a public path; the rest of /artist-analytics/** stays
//   locked because it carries earnings and demographics.
//
// Data: GET /v1/users/{artistId}/territory-rank →
//   { status?, genreName, computedAt, defaultPeriod,
//     periods: { today|week|month|year: [{ jurisdictionId, jurisdictionName,
//                                          overallRank, genreRank }] } }
//
// Hides itself entirely when ranks have not been computed.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MapPin } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';

const PERIODS = ['today', 'week', 'month', 'year'] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_LABELS: Record<Period, string> = {
  today: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

interface TerritoryRow {
  jurisdictionId?: string;
  jurisdictionName?: string;
  overallRank?: number | null;
  genreRank?: number | null;
}

interface TerritoryPayload {
  status?: string;
  genreName?: string | null;
  computedAt?: string | null;
  defaultPeriod?: string;
  periods?: Record<string, TerritoryRow[]>;
}

interface ArtistTerritoryProps {
  artistId?: string;
  artistName: string;
  themeColor: string;
  cardStyle?: object;
}

const ArtistTerritory: React.FC<ArtistTerritoryProps> = ({
  artistId,
  artistName,
  themeColor,
  cardStyle,
}) => {
  const [data, setData] = useState<TerritoryPayload | null>(null);
  const [period, setPeriod] = useState<Period>('year');
  const [state, setState] = useState<'loading' | 'ready' | 'hidden'>('loading');

  useEffect(() => {
    if (!artistId) return;
    let cancelled = false;
    setState('loading');

    axiosInstance
      .get(`/v1/users/${artistId}/territory-rank`)
      .then((res) => {
        if (cancelled) return;
        const payload: TerritoryPayload | null = res.data || null;
        const hasRows =
          payload?.periods &&
          Object.values(payload.periods).some((rows) => Array.isArray(rows) && rows.length);
        if (!payload || (!hasRows && payload.status !== 'calculating')) {
          setState('hidden');
          return;
        }
        setData(payload);
        const dp = payload.defaultPeriod as Period | undefined;
        if (dp && PERIODS.includes(dp)) setPeriod(dp);
        setState('ready');
        console.log('[TerritoryRank] loaded:', { artistId, status: payload.status });
      })
      .catch((err) => {
        if (cancelled) return;
        // Never break the screen over a ranking read — just hide the section.
        console.error('[TerritoryRank] load failed:', { artistId, err: err?.message });
        setState('hidden');
      });

    return () => {
      cancelled = true;
    };
  }, [artistId]);

  if (state !== 'ready' || !data) return null;

  if (data.status === 'calculating') {
    return (
      <View style={[styles.card, { borderColor: `${themeColor}44` }, cardStyle]}>
        <Text style={styles.heading}>Territory rank</Text>
        <Text style={styles.calc}>
          Ranks are computed nightly — {artistName}&rsquo;s standing appears after tonight&rsquo;s
          update.
        </Text>
      </View>
    );
  }

  const rows = (data.periods && data.periods[period]) || [];
  const home = rows[0] || null;
  const genreName = data.genreName || null;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: `${themeColor}1A`, borderColor: `${themeColor}44` },
        cardStyle,
      ]}
    >
      <View style={styles.head}>
        <Text style={styles.heading}>Territory rank</Text>
        <View style={styles.toggle}>
          {PERIODS.map((p) => {
            const active = p === period;
            return (
              <TouchableOpacity
                key={p}
                onPress={() => setPeriod(p)}
                style={[styles.tab, active && { backgroundColor: themeColor }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {PERIOD_LABELS[p]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {home && home.overallRank != null ? (
        <View style={styles.headline}>
          <Text style={styles.headlineNum}>#{home.overallRank}</Text>
          <Text style={styles.headlineIn}>in {home.jurisdictionName}</Text>
        </View>
      ) : null}

      {rows.length === 0 ? (
        <Text style={styles.empty}>No ranking yet for this period.</Text>
      ) : (
        rows.map((j, i) => (
          <View
            key={j.jurisdictionId || `${j.jurisdictionName}-${i}`}
            style={[
              styles.row,
              i === 0 && { backgroundColor: `${themeColor}29`, borderColor: `${themeColor}55` },
            ]}
          >
            <MapPin size={14} color="#fff" style={styles.pin} />
            <View style={styles.place}>
              <Text style={styles.placeName} numberOfLines={1}>
                {j.jurisdictionName}
              </Text>
              {j.genreRank != null && genreName ? (
                <Text style={styles.genre}>
                  #{j.genreRank} · {genreName}
                </Text>
              ) : null}
            </View>
            <Text style={styles.rank}>
              {j.overallRank != null ? `#${j.overallRank}` : '—'}
            </Text>
          </View>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(20,20,24,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 18,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginBottom: 14,
    gap: 10,
  },
  heading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#6a6a78',
  },
  toggle: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tab: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 50,
  },
  tabText: { fontSize: 10.5, fontWeight: '700', color: '#6a6a78' },
  tabTextActive: { color: '#fff' },
  headline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 14,
  },
  headlineNum: {
    fontSize: 30,
    fontWeight: '800',
    fontStyle: 'italic',
    color: '#fff',
  },
  headlineIn: { fontSize: 14, fontWeight: '600', color: '#a8a8b3' },
  calc: { fontSize: 13, lineHeight: 21, color: '#a8a8b3' },
  empty: { fontSize: 13, color: '#6a6a78', textAlign: 'center', paddingVertical: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 5,
  },
  pin: { flexShrink: 0 },
  place: { flex: 1, minWidth: 0 },
  placeName: { fontSize: 13.5, fontWeight: '700', color: '#f2f2f4' },
  genre: { fontSize: 11, color: '#6a6a78', marginTop: 2 },
  rank: { fontSize: 15, fontWeight: '800', color: '#f2f2f4' },
});

export default ArtistTerritory;