// src/components/funnelShared.tsx
// Shared internals for FanbaseFunnel + SongStatsModal.
//
// On web these two files duplicate their constants and share fanbaseFunnel.scss
// ("reuse the funnel styling so this is a 1:1 match"). On mobile, styles live
// in JS, so the mobile equivalent of the shared stylesheet is this shared
// module: filter option sets, tooltip primitive, period stamp builder, and the
// funnel/advanced-metrics renderer. Copy differences between the artist-level
// and song-level views (stage tips, repeat tip) are passed in by each consumer.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import {
  Play, Heart, Vote, UserPlus, Star, ArrowUp, ArrowDown,
  Headphones, CalendarDays, ChevronDown,
} from 'lucide-react-native';
import SelectPill from './SelectPill';

// ── Constants (verbatim from web) ────────────────────────────────────────────

export const STAGE_ICONS: Record<string, any> = {
  plays: Headphones,
  listeners: Play,
  likers: Heart,
  voters: Vote,
  followers: UserPlus,
  supporters: Star,
};

export const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
];

export const PREV_LABEL: Record<string, string> = {
  today: 'vs yesterday',
  week: 'vs last week',
  month: 'vs last month',
  year: 'vs last year',
  all: '',
};

export const GENDER_OPTIONS = [
  { key: 'all', label: 'All genders' },
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'non-binary', label: 'Non-binary' },
  { key: 'unknown', label: 'Not specified' },
];

export const AGE_OPTIONS = [
  { key: 'all', label: 'All ages' },
  { key: '13-17', label: '13–17' },
  { key: '18-24', label: '18–24' },
  { key: '25-34', label: '25–34' },
  { key: '35-44', label: '35–44' },
  { key: '45+', label: '45+' },
  { key: 'unknown', label: 'Not specified' },
];

export const SOURCE_LABELS: Record<string, string> = {
  feed: 'Feed',
  profile: 'Profile',
  'profile-support': 'Profile (supported artist)',
  dashboard: 'Dashboard',
  'dashboard-support': 'Dashboard (supported artist)',
  search: 'Search',
  playlist: 'Playlist',
  jurisdiction: 'Jurisdiction pages',
  share: 'Shared link',
  shared: 'Shared link',
  song: 'Song page',
  artist: 'Artist page',
  unknown: 'Direct / unknown',
};

export const labelForSource = (s?: string): string => {
  if (!s) return SOURCE_LABELS.unknown;
  if (SOURCE_LABELS[s]) return SOURCE_LABELS[s];
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

export const formatNumber = (n: any) => Number(n || 0).toLocaleString();
export const initialOf = (name?: string, fallback = '?') =>
  (name ? name.charAt(0).toUpperCase() : fallback);

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const fmtFullDay = (d: Date) => `${MONTHS[d.getMonth()]} ${ordinal(d.getDate())} ${d.getFullYear()}`;

export const buildPeriodStamp = (period: string): string => {
  const now = new Date();
  switch (period) {
    case 'today':
      return fmtFullDay(now);
    case 'week': {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      const sameYear = start.getFullYear() === now.getFullYear();
      const left = `${MONTHS[start.getMonth()]} ${ordinal(start.getDate())}${
        sameYear ? '' : ` ${start.getFullYear()}`
      }`;
      const right = `${MONTHS[now.getMonth()]} ${ordinal(now.getDate())} ${now.getFullYear()}`;
      return `${left} – ${right}`;
    }
    case 'month':
      return `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    case 'year':
      return `${now.getFullYear()}`;
    case 'all':
    default:
      return 'All time';
  }
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
  delta?: number | null;
}

export interface FunnelData {
  funnel?: FunnelStage[];
  repeatListenRatio?: number;
  uniqueListeners?: number;
  availableJurisdictions?: { id: string | number; name: string }[];
  completion?: { completionRate?: number; completedPlays?: number; totalPlays?: number };
  sources?: { source: string; count: number }[];
}

export interface FunnelFilters {
  gender: string;
  age: string;
  jurisdictionId: string;
}

// ── TipValue: tap the number to toggle its explanation (web hover/tap) ──────

export const TipValue: React.FC<{
  tipKey: string;
  tip: string;
  openTip: string | null;
  onToggle: (key: string) => void;
  children: React.ReactNode;
}> = ({ tipKey, tip, openTip, onToggle, children }) => (
  <View>
    <TouchableOpacity onPress={() => onToggle(tipKey)} activeOpacity={0.7}>
      {children}
    </TouchableOpacity>
    {openTip === tipKey && (
      <View style={fs.tip}>
        <Text style={fs.tipText}>{tip}</Text>
      </View>
    )}
  </View>
);

// ── Filter controls: the compact selector row (web's 4 <select>s) ───────────

export const FunnelControls: React.FC<{
  period: string;
  setPeriod: (v: string) => void;
  filters: FunnelFilters;
  setFilters: (f: FunnelFilters) => void;
  availableJurisdictions: { id: string | number; name: string }[];
}> = ({ period, setPeriod, filters, setFilters, availableJurisdictions }) => (
  <View style={fs.controls}>
    <SelectPill ariaLabel="Time interval" value={period} options={PERIODS} onChange={setPeriod} />
    <SelectPill
      ariaLabel="Gender"
      value={filters.gender}
      options={GENDER_OPTIONS}
      onChange={(v) => setFilters({ ...filters, gender: v })}
    />
    <SelectPill
      ariaLabel="Age"
      value={filters.age}
      options={AGE_OPTIONS}
      onChange={(v) => setFilters({ ...filters, age: v })}
    />
    <SelectPill
      ariaLabel="Location"
      value={filters.jurisdictionId}
      options={[
        { key: 'all', label: 'All locations' },
        ...availableJurisdictions.map((j) => ({ key: String(j.id), label: j.name })),
      ]}
      onChange={(v) => setFilters({ ...filters, jurisdictionId: v })}
      disabled={availableJurisdictions.length === 0}
    />
  </View>
);

// ── Summary chips: period stamp + active filters (web's aria-live row) ──────

export const FunnelSummaryChips: React.FC<{
  period: string;
  filters: FunnelFilters;
  availableJurisdictions: { id: string | number; name: string }[];
}> = ({ period, filters, availableJurisdictions }) => {
  const genderLabel = GENDER_OPTIONS.find((o) => o.key === filters.gender)?.label;
  const ageLabel = AGE_OPTIONS.find((o) => o.key === filters.age)?.label;
  const jurisdictionLabel = availableJurisdictions.find(
    (j) => String(j.id) === String(filters.jurisdictionId)
  )?.name;

  return (
    <View style={fs.summary}>
      <View style={[fs.chip, fs.chipDate]}>
        <CalendarDays size={12} color="#4a9eff" />
        <Text style={fs.chipText}>{buildPeriodStamp(period)}</Text>
      </View>
      {filters.gender !== 'all' && (
        <View style={fs.chip}><Text style={fs.chipText}>{genderLabel}</Text></View>
      )}
      {filters.age !== 'all' && (
        <View style={fs.chip}><Text style={fs.chipText}>{ageLabel}</Text></View>
      )}
      {filters.jurisdictionId !== 'all' && !!jurisdictionLabel && (
        <View style={fs.chip}><Text style={fs.chipText}>{jurisdictionLabel}</Text></View>
      )}
    </View>
  );
};

// ── FunnelBody: stages + empty state + advanced metrics ─────────────────────

export const FunnelBody: React.FC<{
  data: FunnelData | null;
  period: string;
  filters: FunnelFilters;
  stageTips: Record<string, string>;
  completionTip: string;
  sourceTip: string;
  emptyTitleAllTime: string;
  emptyBodyAllTime: string;
  openTip: string | null;
  onToggleTip: (key: string) => void;
  showAdvanced: boolean;
  setShowAdvanced: (updater: (v: boolean) => boolean) => void;
}> = ({
  data,
  period,
  filters,
  stageTips,
  completionTip,
  sourceTip,
  emptyTitleAllTime,
  emptyBodyAllTime,
  openTip,
  onToggleTip,
  showAdvanced,
  setShowAdvanced,
}) => {
  const funnel = data?.funnel || [];
  const topOfFunnel = funnel.length
    ? Math.max(...funnel.map((s) => Number(s.value || 0)))
    : 0;
  const hasAnyFanbase = funnel.some((s) => Number(s.value || 0) > 0);
  const prevLabel = PREV_LABEL[period] || '';
  const noFilters =
    filters.gender === 'all' && filters.age === 'all' && filters.jurisdictionId === 'all';

  const completion = data?.completion || {};
  const completionRate = Number(completion.completionRate || 0);
  const completedPlays = Number(completion.completedPlays || 0);
  const completionTotal = Number(completion.totalPlays || 0);
  const sources = data?.sources || [];
  const sourceTotal = sources.reduce((sum, s) => sum + Number(s.count || 0), 0);

  return (
    <>
      <View style={fs.funnel}>
        {funnel.map((stage, index) => {
          const Icon = STAGE_ICONS[stage.key] || Star;
          const value = Number(stage.value || 0);
          const prevStage = index > 0 ? funnel[index - 1] : null;
          const prevVal = prevStage ? Number(prevStage.value || 0) : null;
          const isFromPlays = prevStage?.key === 'plays';

          const conversion =
            prevVal && prevVal > 0 && !isFromPlays
              ? Math.round((value / prevVal) * 100)
              : null;

          const width =
            topOfFunnel > 0
              ? Math.max(8, Math.round((value / topOfFunnel) * 100))
              : 8;
          const tip = stageTips[stage.key];
          const isSupporter = stage.key === 'supporters';

          const delta = stage.delta;
          const hasDelta = delta !== null && delta !== undefined;
          const deltaUp = hasDelta && (delta as number) > 0;
          const deltaDown = hasDelta && (delta as number) < 0;

          return (
            <View style={fs.stage} key={stage.key}>
              {index > 0 && (
                <View style={fs.connector}>
                  <Text style={conversion !== null ? fs.connectorText : fs.connectorMuted}>
                    {conversion !== null ? `${conversion}% continue` : '—'}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[
                  fs.bar,
                  isSupporter && fs.barSupporter,
                  { width: `${width}%` },
                ]}
                onPress={() => tip && onToggleTip(stage.key)}
                activeOpacity={tip ? 0.8 : 1}
              >
                <Icon size={16} color="#FFFFFF" />
                <Text style={fs.barLabel} numberOfLines={1}>{stage.label}</Text>

                {/* ★ ui: delta arrow LEFT of the number */}
                {hasDelta && (
                  <View style={fs.delta}>
                    {deltaUp && <ArrowUp size={12} color="#22c55e" />}
                    {deltaDown && <ArrowDown size={12} color="#f87171" />}
                    <Text
                      style={[
                        fs.deltaText,
                        deltaUp && fs.deltaUp,
                        deltaDown && fs.deltaDown,
                      ]}
                    >
                      {deltaUp ? '+' : ''}{delta}
                    </Text>
                  </View>
                )}

                <Text style={fs.barValue}>{formatNumber(value)}</Text>
              </TouchableOpacity>

              {openTip === stage.key && !!tip && (
                <View style={fs.tip}>
                  <Text style={fs.tipText}>{tip}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {!hasAnyFanbase && (
        <View style={fs.empty}>
          <Star size={26} color="#888888" />
          <Text style={fs.emptyTitle}>
            {period === 'all' && noFilters ? emptyTitleAllTime : 'No activity for this slice'}
          </Text>
          <Text style={fs.emptyBody}>
            {period === 'all' && noFilters
              ? emptyBodyAllTime
              : 'Try a wider interval or fewer filters — early on, demographic data is sparse.'}
          </Text>
        </View>
      )}

      {hasAnyFanbase && (
        <>
          <TouchableOpacity
            style={fs.advToggle}
            onPress={() => setShowAdvanced((v) => !v)}
            accessibilityState={{ expanded: showAdvanced }}
          >
            <Text style={fs.advToggleText}>
              {showAdvanced ? 'Hide advanced metrics' : 'Advanced metrics'}
            </Text>
            <View style={showAdvanced ? fs.chevOpen : undefined}>
              <ChevronDown size={16} color="#AAAAAA" />
            </View>
          </TouchableOpacity>

          {showAdvanced && (
            <View>
              <View style={fs.advCard}>
                <TipValue
                  tipKey="completion"
                  tip={completionTip}
                  openTip={openTip}
                  onToggle={onToggleTip}
                >
                  <Text style={fs.advEyebrow}>Completion quality</Text>
                </TipValue>

                <View style={fs.completion}>
                  <Text style={fs.completionRate}>{completionRate.toFixed(1)}%</Text>
                  <View style={fs.completionBar}>
                    <View
                      style={[fs.completionFill, { width: `${Math.min(100, completionRate)}%` }]}
                    />
                  </View>
                  <Text style={fs.completionNote}>
                    {formatNumber(completedPlays)} of {formatNumber(completionTotal)} plays
                    finished the song.
                  </Text>
                </View>
              </View>

              <View style={fs.advCard}>
                <TipValue
                  tipKey="source"
                  tip={sourceTip}
                  openTip={openTip}
                  onToggle={onToggleTip}
                >
                  <Text style={fs.advEyebrow}>Where plays come from</Text>
                </TipValue>

                {sources.length > 0 && sourceTotal > 0 ? (
                  <View>
                    {sources.map((s) => {
                      const count = Number(s.count || 0);
                      const pct = Math.round((count / sourceTotal) * 100);
                      return (
                        <View style={fs.sourceRow} key={s.source}>
                          <View style={fs.sourceTop}>
                            <Text style={fs.sourceName}>{labelForSource(s.source)}</Text>
                            <Text style={fs.sourceCount}>
                              {formatNumber(count)} <Text style={fs.sourcePct}>({pct}%)</Text>
                            </Text>
                          </View>
                          <View style={fs.sourceBar}>
                            <View style={[fs.sourceFill, { width: `${pct}%` }]} />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={fs.advEmpty}>No play sources recorded for this slice yet.</Text>
                )}
              </View>
            </View>
          )}
        </>
      )}
    </>
  );
};

// ── Shared styles (mobile equivalent of fanbaseFunnel.scss) ─────────────────

export const fs = StyleSheet.create({
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 6,
  },
  chipDate: {
    backgroundColor: 'rgba(74, 158, 255, 0.1)',
  },
  chipText: {
    color: '#CCCCCC',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  funnel: {
    marginTop: 4,
  },
  stage: {
    marginBottom: 2,
  },
  connector: {
    paddingVertical: 4,
    paddingLeft: 14,
  },
  connectorText: {
    color: '#4a9eff',
    fontSize: 11,
    fontWeight: '600',
  },
  connectorMuted: {
    color: '#555555',
    fontSize: 11,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: '45%',
    backgroundColor: 'rgba(0, 74, 173, 0.55)',
    borderColor: 'rgba(74, 158, 255, 0.35)',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  barSupporter: {
    backgroundColor: 'rgba(196, 154, 10, 0.4)',
    borderColor: 'rgba(196, 154, 10, 0.5)',
  },
  barLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
    flexShrink: 1,
  },
  delta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    marginRight: 8,
  },
  deltaText: {
    color: '#AAAAAA',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 2,
  },
  deltaUp: {
    color: '#22c55e',
  },
  deltaDown: {
    color: '#f87171',
  },
  barValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginLeft: 'auto',
  },
  tip: {
    backgroundColor: '#181818',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
    marginBottom: 4,
  },
  tipText: {
    color: '#CCCCCC',
    fontSize: 12,
    lineHeight: 17,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 22,
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
    paddingHorizontal: 8,
  },
  advToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  advToggleText: {
    color: '#CCCCCC',
    fontSize: 13,
    fontWeight: '600',
    marginRight: 6,
  },
  chevOpen: {
    transform: [{ rotate: '180deg' }],
  },
  advCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  advEyebrow: {
    color: '#4a9eff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  completion: {},
  completionRate: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 8,
  },
  completionBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  completionFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#4a9eff',
  },
  completionNote: {
    color: '#AAAAAA',
    fontSize: 12,
  },
  sourceRow: {
    marginBottom: 10,
  },
  sourceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sourceName: {
    color: '#CCCCCC',
    fontSize: 13,
  },
  sourceCount: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  sourcePct: {
    color: '#888888',
    fontWeight: '400',
    fontSize: 11,
  },
  sourceBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  sourceFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#4a9eff',
  },
  advEmpty: {
    color: '#888888',
    fontSize: 12,
  },
});