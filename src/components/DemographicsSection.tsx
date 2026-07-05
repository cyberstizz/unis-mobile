// src/components/DemographicsSection.tsx
// Ported from web `dempgraphicsSection.jsx`.
//
// Two tabs:
//   1. Top areas   — donut of top jurisdictions by metric
//      GET /v1/artist-analytics/artist/{id}/demographics/top-jurisdictions?period&metric
//   2. Territory explorer — drill-down stats through the jurisdiction tree
//      GET /v1/artist-analytics/artist/{id}/demographics/territory?period[&jurisdictionId]
//
// Web's donut is a stroke-dasharray <circle> stack; ported 1:1 with
// react-native-svg. Web's ScrollSelect drill control maps to SelectPill.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import {
  PieChart, Map as MapIcon, ChevronRight, ArrowLeft, Headphones, Play,
  Heart, UserPlus, Star,
} from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';
import SelectPill from './SelectPill';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
];

const METRICS = [
  { key: 'plays', label: 'Plays' },
  { key: 'listeners', label: 'Listeners' },
  { key: 'likes', label: 'Likes' },
  { key: 'followers', label: 'Followers' },
  { key: 'supporters', label: 'Supporters' },
];

// plays/listeners are tagged on the play event; the rest only exist as people
const BASIS_NOTE: Record<string, string> = {
  plays: 'Where listeners were when each play happened.',
  listeners: 'Where listeners were when they played your music.',
  likes: "Based on each member's home neighborhood on Unis.",
  followers: "Based on each follower's home neighborhood on Unis.",
  supporters: "Based on each supporter's home neighborhood on Unis.",
};

const STAT_DEFS = [
  { key: 'plays', label: 'Plays', Icon: Headphones },
  { key: 'listeners', label: 'Listeners', Icon: Play },
  { key: 'likes', label: 'Likes', Icon: Heart },
  { key: 'followers', label: 'Followers', Icon: UserPlus },
  { key: 'supporters', label: 'Supporters', Icon: Star },
];

const MAX_SLICES = 6;
const formatNumber = (n: any) => Number(n || 0).toLocaleString();

interface Slice {
  id: string;
  name: string;
  count: number;
}

interface TerritoryChild {
  id: string;
  name: string;
  hasChildren?: boolean;
}

interface TerritoryData {
  jurisdiction?: { id: string; name: string };
  stats?: Record<string, number>;
  children?: TerritoryChild[];
}

interface DemographicsSectionProps {
  artistId?: string;
}

const DemographicsSection: React.FC<DemographicsSectionProps> = ({ artistId }) => {
  const [tab, setTab] = useState<'areas' | 'map'>('areas');
  const [period, setPeriod] = useState('all');

  // ---- tab 1: pie ---------------------------------------------------------
  const [metric, setMetric] = useState('plays');
  const [pieData, setPieData] = useState<{ slices?: Slice[] } | null>(null);
  const [pieLoading, setPieLoading] = useState(true);
  const [pieError, setPieError] = useState<string | null>(null);

  // ---- tab 2: territory explorer -----------------------------------------
  const [territory, setTerritory] = useState<TerritoryData | null>(null);
  const [terLoading, setTerLoading] = useState(true);
  const [terError, setTerError] = useState<string | null>(null);
  // navigation stack of visited territories: [{id, name}]
  const [stack, setStack] = useState<{ id: string; name: string }[]>([]);

  const fetchPie = useCallback(async (id: string | undefined, p: string, m: string) => {
    if (!id) return;
    setPieLoading(true);
    setPieError(null);
    try {
      const res = await axiosInstance.get(
        `/v1/artist-analytics/artist/${id}/demographics/top-jurisdictions?period=${p}&metric=${m}`
      );
      setPieData(res.data || null);
    } catch (err) {
      console.error('Demographics pie fetch failed:', err);
      setPieError('Could not load your top areas.');
    } finally {
      setPieLoading(false);
    }
  }, []);

  const fetchTerritory = useCallback(async (
    id: string | undefined,
    p: string,
    jurisdictionId: string | null
  ) => {
    if (!id) return;
    setTerLoading(true);
    setTerError(null);
    try {
      const params = new URLSearchParams({ period: p });
      if (jurisdictionId) params.set('jurisdictionId', jurisdictionId);
      const res = await axiosInstance.get(
        `/v1/artist-analytics/artist/${id}/demographics/territory?${params.toString()}`
      );
      setTerritory(res.data || null);
    } catch (err) {
      console.error('Territory fetch failed:', err);
      setTerError('Could not load this territory.');
    } finally {
      setTerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'areas') fetchPie(artistId, period, metric);
  }, [artistId, tab, period, metric, fetchPie]);

  useEffect(() => {
    if (tab === 'map') {
      const current = stack.length > 0 ? stack[stack.length - 1].id : null;
      fetchTerritory(artistId, period, current);
    }
  }, [artistId, tab, period, stack, fetchTerritory]);

  const drillInto = (child: TerritoryChild) => {
    setStack((prev) => [...prev, { id: child.id, name: child.name }]);
  };

  const goBack = () => {
    setStack((prev) => prev.slice(0, -1));
  };

  const jumpTo = (index: number) => {
    // index -1 = root
    setStack((prev) => (index < 0 ? [] : prev.slice(0, index + 1)));
  };

  // ---- pie derivations ----------------------------------------------------
  const rawSlices: Slice[] = pieData?.slices || [];
  const pieTotal = rawSlices.reduce((sum, s) => sum + Number(s.count || 0), 0);
  const topSlices = rawSlices.slice(0, MAX_SLICES);
  const otherCount = rawSlices
    .slice(MAX_SLICES)
    .reduce((sum, s) => sum + Number(s.count || 0), 0);
  const slices: Slice[] = otherCount > 0
    ? [...topSlices, { id: 'other', name: 'Other areas', count: otherCount }]
    : topSlices;

  // donut geometry (web parity: R=70, strokeWidth=26, 180×180 viewBox)
  const R = 70;
  const C = 2 * Math.PI * R;
  let acc = 0;

  const stats = territory?.stats || {};
  const children = territory?.children || [];
  const currentName =
    territory?.jurisdiction?.name || (stack.length ? stack[stack.length - 1].name : '…');

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>Demographics</Text>
        <Text style={styles.title}>Where your audience lives</Text>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === 'areas' && styles.tabActive]}
            onPress={() => setTab('areas')}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'areas' }}
          >
            <PieChart size={14} color={tab === 'areas' ? '#FFFFFF' : '#AAAAAA'} />
            <Text style={[styles.tabText, tab === 'areas' && styles.tabTextActive]}>Top areas</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'map' && styles.tabActive]}
            onPress={() => setTab('map')}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'map' }}
          >
            <MapIcon size={14} color={tab === 'map' ? '#FFFFFF' : '#AAAAAA'} />
            <Text style={[styles.tabText, tab === 'map' && styles.tabTextActive]}>
              Territory explorer
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* shared period control + (tab 1 only) metric control */}
      <View style={styles.controls}>
        <SelectPill
          ariaLabel="Time interval"
          value={period}
          options={PERIODS}
          onChange={setPeriod}
        />
        {tab === 'areas' && (
          <SelectPill
            ariaLabel="Metric"
            value={metric}
            options={METRICS}
            onChange={setMetric}
          />
        )}
      </View>

      {/* ====================== TAB 1: TOP AREAS (PIE) ====================== */}
      {tab === 'areas' && (
        pieLoading ? (
          <View style={styles.state}>
            <ActivityIndicator size="small" color="#4a9eff" />
            <Text style={styles.stateText}>Loading top areas…</Text>
          </View>
        ) : pieError ? (
          <View style={styles.state}>
            <Text style={styles.errorText}>{pieError}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => fetchPie(artistId, period, metric)}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : slices.length === 0 || pieTotal === 0 ? (
          <View style={styles.state}>
            <PieChart size={26} color="#888888" />
            <Text style={styles.emptyTitle}>No location data for this slice yet</Text>
            <Text style={styles.emptyBody}>
              As plays come in, the neighborhoods, cities, and states your audience
              comes from will appear here.
            </Text>
          </View>
        ) : (
          <View>
            <View style={styles.donutWrap}>
              <Svg
                width={180}
                height={180}
                viewBox="0 0 180 180"
                accessibilityLabel={`Top areas by ${metric}`}
              >
                <G rotation={-90} origin="90, 90">
                  {slices.map((s, i) => {
                    const frac = Number(s.count || 0) / pieTotal;
                    const dash = frac * C;
                    const seg = (
                      <Circle
                        key={s.id}
                        cx="90"
                        cy="90"
                        r={R}
                        fill="none"
                        strokeWidth={26}
                        stroke={s.id === 'other' ? 'rgba(255,255,255,0.18)' : '#4a9eff'}
                        strokeOpacity={s.id === 'other' ? 1 : 1 - i * 0.13}
                        strokeDasharray={`${dash} ${C - dash}`}
                        strokeDashoffset={-acc}
                      />
                    );
                    acc += dash;
                    return seg;
                  })}
                </G>
                <SvgText
                  x="90"
                  y="86"
                  fill="#FFFFFF"
                  fontSize="22"
                  fontWeight="800"
                  textAnchor="middle"
                >
                  {formatNumber(pieTotal)}
                </SvgText>
                <SvgText x="90" y="104" fill="#888888" fontSize="11" textAnchor="middle">
                  {METRICS.find((m) => m.key === metric)?.label}
                </SvgText>
              </Svg>
            </View>

            <View style={styles.legend}>
              {slices.map((s, i) => {
                const pct = Math.round((Number(s.count || 0) / pieTotal) * 100);
                return (
                  <View style={styles.legendRow} key={s.id}>
                    <View
                      style={[
                        styles.swatch,
                        s.id === 'other'
                          ? styles.swatchOther
                          : { opacity: 1 - i * 0.13 },
                      ]}
                    />
                    <Text style={styles.legendName} numberOfLines={1}>{s.name}</Text>
                    <Text style={styles.legendCount}>{formatNumber(s.count)}</Text>
                    <Text style={styles.legendPct}>{pct}%</Text>
                  </View>
                );
              })}
              <Text style={styles.basis}>{BASIS_NOTE[metric]}</Text>
            </View>
          </View>
        )
      )}

      {/* ================== TAB 2: TERRITORY EXPLORER ================== */}
      {tab === 'map' && (
        terLoading ? (
          <View style={styles.state}>
            <ActivityIndicator size="small" color="#4a9eff" />
            <Text style={styles.stateText}>Loading territory…</Text>
          </View>
        ) : terError ? (
          <View style={styles.state}>
            <Text style={styles.errorText}>{terError}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() =>
                fetchTerritory(artistId, period, stack.length ? stack[stack.length - 1].id : null)
              }
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ★ drill control at the TOP (web parity) */}
            <View style={styles.explorerBar}>
              {stack.length > 0 && (
                <TouchableOpacity style={styles.backBtn} onPress={goBack}>
                  <ArrowLeft size={13} color="#4a9eff" />
                  <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
              )}

              <SelectPill
                ariaLabel="Choose a sub-territory"
                value="__current"
                options={[
                  { key: '__current', label: `${currentName} (current)` },
                  ...children.map((c) => ({
                    key: c.id,
                    label: c.hasChildren ? `${c.name} ›` : c.name,
                  })),
                ]}
                onChange={(val) => {
                  if (val === '__current') return; // re-selected current → no-op
                  const child = children.find((c) => c.id === val);
                  if (child) drillInto(child);
                }}
              />
            </View>

            {/* breadcrumb trail for orientation */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.crumbs}>
              <TouchableOpacity
                onPress={() => jumpTo(-1)}
                disabled={stack.length === 0}
              >
                <Text style={[styles.crumb, stack.length === 0 && styles.crumbCurrent]}>
                  {stack.length === 0 ? currentName : 'Unis'}
                </Text>
              </TouchableOpacity>
              {stack.map((s, i) => (
                <React.Fragment key={s.id}>
                  <ChevronRight size={12} color="#666666" style={styles.crumbSep} />
                  <TouchableOpacity
                    onPress={() => jumpTo(i)}
                    disabled={i === stack.length - 1}
                  >
                    <Text
                      style={[styles.crumb, i === stack.length - 1 && styles.crumbCurrent]}
                    >
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </ScrollView>

            <View style={styles.stats}>
              {STAT_DEFS.map(({ key, label, Icon }) => (
                <View style={styles.stat} key={key}>
                  <Icon size={16} color="#4a9eff" />
                  <Text style={styles.statNum}>{formatNumber(stats[key])}</Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>

            {children.length === 0 && (
              <Text style={styles.leafNote}>
                This is the most local level — no smaller territories inside {currentName}.
              </Text>
            )}
          </>
        )
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
    marginBottom: 12,
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
    marginBottom: 12,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    padding: 3,
    alignSelf: 'flex-start',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 17,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  tabActive: {
    backgroundColor: '#004aad',
  },
  tabText: {
    color: '#AAAAAA',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
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
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
    textAlign: 'center',
  },
  emptyBody: {
    color: '#AAAAAA',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 6,
  },
  donutWrap: {
    alignItems: 'center',
    marginBottom: 14,
  },
  legend: {},
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomWidth: 1,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: '#4a9eff',
    marginRight: 10,
  },
  swatchOther: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  legendName: {
    color: '#CCCCCC',
    fontSize: 13,
    flex: 1,
    paddingRight: 8,
  },
  legendCount: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginRight: 8,
  },
  legendPct: {
    color: '#888888',
    fontSize: 12,
    width: 36,
    textAlign: 'right',
  },
  basis: {
    color: '#777777',
    fontSize: 11,
    marginTop: 10,
    fontStyle: 'italic',
  },
  explorerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
    marginBottom: 8,
    paddingVertical: 7,
  },
  backText: {
    color: '#4a9eff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 3,
  },
  crumbs: {
    flexDirection: 'row',
    marginBottom: 12,
    flexGrow: 0,
  },
  crumb: {
    color: '#4a9eff',
    fontSize: 12,
    fontWeight: '600',
  },
  crumbCurrent: {
    color: '#FFFFFF',
  },
  crumbSep: {
    marginHorizontal: 5,
    alignSelf: 'center',
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  stat: {
    width: '33.33%',
    alignItems: 'center',
    paddingVertical: 12,
  },
  statNum: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 6,
  },
  statLabel: {
    color: '#888888',
    fontSize: 11,
    marginTop: 2,
  },
  leafNote: {
    color: '#888888',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
  },
});

export default DemographicsSection;