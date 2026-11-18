// src/components/ArtistHomeTab.tsx
// ─────────────────────────────────────────────────────────────
// The artist dashboard's first screen — mobile port of web src/ArtistHomeTab.jsx.
// Leads with what matters today:
//   setup progress (until done) · this week vs last week · featured song ·
//   where you stand · share balance · supporters
// Three small reads of its own, each failing quietly to its own card:
//   /v1/artist-analytics/artist/{id}/fanbase?period=week
//   /v1/artist-analytics/artist/{id}/territory-rank
//   /v1/artist-analytics/artist/{id}/supporters
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, Check, Megaphone, Play, RefreshCw, Trophy } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { SetupStep } from '../utils/artistSetupSteps';
import { BroadcastComposer } from './SupporterSection';
import { useUnisTheme } from '../theme/unisTheme';

const formatNumber = (n: any) => Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const initialOf = (name?: string) => (name ? name.charAt(0).toUpperCase() : '?');

const formatDelta = (delta: any) => {
  if (delta === null || delta === undefined) return null;
  const n = Number(delta);
  if (Number.isNaN(n)) return null;
  if (n === 0) return { text: 'No change', tone: 'flat' as const };
  return { text: `${n > 0 ? '+' : '−'}${formatNumber(Math.abs(n))}`, tone: n > 0 ? ('up' as const) : ('down' as const) };
};

const RANK_PERIOD_LABEL: Record<string, string> = { today: 'Yesterday', week: 'This week', month: 'This month', year: 'This year' };
const RING_C = 2 * Math.PI * 26;

function useArtistRead(url: string | null) {
  const [state, setState] = useState<{ data: any; loading: boolean; error: string | null }>({ data: null, loading: Boolean(url), error: null });
  const load = useCallback(() => {
    if (!url) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    axiosInstance
      .get(url)
      .then((res) => { if (!cancelled) setState({ data: res.data ?? null, loading: false, error: null }); })
      .catch((err) => {
        console.error(`Dashboard home read failed (${url}):`, err);
        if (!cancelled) setState({ data: null, loading: false, error: 'Could not load this right now.' });
      });
    return () => { cancelled = true; };
  }, [url]);
  useEffect(() => load(), [load]);
  return { ...state, retry: load };
}

const CardError: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <View style={styles.errorRow}>
    <Text style={styles.note}>Could not load this right now.</Text>
    <Pressable onPress={onRetry} style={styles.retry}>
      <RefreshCw size={13} color="#fff" />
      <Text style={styles.retryText}>Retry</Text>
    </Pressable>
  </View>
);

const CardLoading: React.FC<{ label: string }> = ({ label }) => (
  <View style={styles.loadingRow}>
    <ActivityIndicator size="small" color="#fff" />
    <Text style={styles.note}>{label}</Text>
  </View>
);

const Card: React.FC<{ children: React.ReactNode; style?: any }> = ({ children, style }) => <View style={[styles.card, style]}>{children}</View>;

const LinkBtn: React.FC<{ label: string; onPress: () => void; color: string }> = ({ label, onPress, color }) => (
  <Pressable onPress={onPress} style={styles.link} accessibilityRole="button">
    <Text style={[styles.linkText, { color }]}>{label}</Text>
    <ArrowRight size={14} color={color} />
  </Pressable>
);

// ── Setup card ──
const SetupCard: React.FC<{ steps: SetupStep[]; onAction: (key: string) => void }> = ({ steps, onAction }) => {
  const t = useUnisTheme();
  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  const next = steps.find((s) => !s.done);
  const dash = `${((RING_C * doneCount) / total).toFixed(1)} ${RING_C.toFixed(1)}`;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Svg width={64} height={64} viewBox="0 0 64 64" accessibilityLabel={`${doneCount} of ${total} setup steps done`}>
          <Circle cx="32" cy="32" r="26" stroke="rgba(255,255,255,0.1)" strokeWidth={6} fill="none" />
          <Circle cx="32" cy="32" r="26" stroke={t.primary2} strokeWidth={6} fill="none" strokeDasharray={dash} strokeLinecap="round" transform="rotate(-90 32 32)" />
          <SvgText x="32" y="37" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="700">{`${doneCount}/${total}`}</SvgText>
        </Svg>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Finish setting <Text style={styles.em}>up</Text></Text>
          <Text style={styles.sub}>{next ? `Next: ${next.title.toLowerCase()}.` : 'All set.'}</Text>
        </View>
      </View>
      <View style={{ marginTop: 12, gap: 6 }}>
        {steps.map((step) => (
          <View key={step.key} style={[styles.step, step.done && { opacity: 0.55 }]}>
            <View style={[styles.check, step.done && { backgroundColor: t.primary, borderColor: t.primary }]}>
              {step.done && <Check size={13} color="#fff" strokeWidth={3} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.stepTitle, step.done && { textDecorationLine: 'line-through' }]}>{step.title}</Text>
              {!step.done && <Text style={styles.stepText}>{step.text}</Text>}
            </View>
            {!step.done && (
              <Pressable onPress={() => onAction(step.key)} style={[styles.stepAction, { backgroundColor: t.soft, borderColor: t.border }]}>
                <Text style={styles.stepActionText}>{step.action}</Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>
    </Card>
  );
};

// ── This week ──
const WeekStats: React.FC<{ artistId: string; totals: Record<string, number> }> = ({ artistId, totals }) => {
  const { data, loading, error, retry } = useArtistRead(artistId ? `/v1/artist-analytics/artist/${artistId}/fanbase?period=week` : null);
  const stages = data?.funnel || [];
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={styles.cardTitle}>This week</Text>
        <Text style={styles.note}>Compared with last week</Text>
      </View>
      {loading ? (
        <CardLoading label="Loading this week…" />
      ) : error ? (
        <CardError onRetry={retry} />
      ) : stages.length === 0 ? (
        <Text style={styles.note}>Your first plays will show up here.</Text>
      ) : (
        <View style={styles.grid}>
          {stages.map((stage: any) => {
            const delta = formatDelta(stage.delta);
            const total = totals[stage.key];
            return (
              <View key={stage.key} style={styles.stat}>
                <Text style={styles.statLabel}>{stage.label}</Text>
                <Text style={styles.statValue}>{formatNumber(stage.value)}</Text>
                {delta && (
                  <Text style={[styles.delta, delta.tone === 'up' && { color: '#4ade80' }, delta.tone === 'down' && { color: '#f87171' }]}>{delta.text}</Text>
                )}
                {total != null && <Text style={styles.statTotal}>{formatNumber(total)} all time</Text>}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

// ── Where you stand ──
const Standing: React.FC<{ artistId: string; latestWin: string | null; onOpenRaces: () => void }> = ({ artistId, latestWin, onOpenRaces }) => {
  const t = useUnisTheme();
  const { data, loading, error, retry } = useArtistRead(artistId ? `/v1/artist-analytics/artist/${artistId}/territory-rank` : null);
  const period = data?.defaultPeriod && data?.periods?.[data.defaultPeriod] ? data.defaultPeriod : 'week';
  const rows = (data?.periods?.[period] || []).slice(0, 4);
  return (
    <Card>
      <Text style={styles.cardTitle}>Where you <Text style={styles.em}>stand</Text></Text>
      {loading ? (
        <CardLoading label="Loading your rank…" />
      ) : error ? (
        <CardError onRetry={retry} />
      ) : data?.status === 'calculating' || rows.length === 0 ? (
        <Text style={styles.note}>Ranks are worked out once a night. Yours will show here after the next update.</Text>
      ) : (
        <>
          <Text style={styles.sub}>{RANK_PERIOD_LABEL[period] || 'Latest'}, as of last night</Text>
          {rows.map((row: any) => (
            <View key={row.jurisdictionId} style={styles.standRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.standName}>{row.jurisdictionName}</Text>
                {row.genreRank != null && data.genreName && <Text style={styles.note}>#{row.genreRank} in {data.genreName}</Text>}
              </View>
              <Text style={[styles.standRank, { color: t.textAccent }]}>{row.overallRank != null ? `#${formatNumber(row.overallRank)}` : '—'}</Text>
            </View>
          ))}
        </>
      )}
      {latestWin && (
        <View style={styles.win}>
          <Trophy size={16} color="#C49A0A" />
          <Text style={styles.winText}>Latest win: {latestWin}</Text>
        </View>
      )}
      <LinkBtn label="Open Races" onPress={onOpenRaces} color={t.textAccent} />
    </Card>
  );
};

// ── Share balance ──
const Balance: React.FC<{ earningsSummary: any; phoneVerified: boolean; onVerify: () => void; onOpenEarnings: () => void }> = ({ earningsSummary, phoneVerified, onVerify, onOpenEarnings }) => {
  const t = useUnisTheme();
  const balance = Number.parseFloat(earningsSummary?.currentBalance || 0) || 0;
  const threshold = Number.parseFloat(earningsSummary?.payoutThreshold || 50) || 50;
  const pct = Math.min(100, Math.round((balance / threshold) * 100));
  const toGo = Math.max(0, threshold - balance);
  return (
    <Card>
      <Text style={styles.cardTitle}>Share balance</Text>
      <Text style={styles.amount}>${balance.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</Text>
      <View style={styles.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: t.primary2 }]} />
      </View>
      <Text style={styles.note}>
        {toGo > 0 ? `$${toGo.toFixed(2)} more and you can withdraw. Banks are paid on the 1st.` : 'Ready to withdraw. Banks are paid on the 1st.'}
      </Text>
      {!phoneVerified && (
        <View style={styles.warn}>
          <Text style={styles.warnText}>Verify your phone so this reaches you.</Text>
          <Pressable onPress={onVerify} style={styles.warnBtn}><Text style={styles.warnBtnText}>Verify</Text></Pressable>
        </View>
      )}
      <LinkBtn label="Open Earnings" onPress={onOpenEarnings} color={t.textAccent} />
    </Card>
  );
};

// ── Supporters ──
const Supporters: React.FC<{ artistId: string; fallbackCount: number; onOpenFans: () => void }> = ({ artistId, fallbackCount, onOpenFans }) => {
  const t = useUnisTheme();
  const { data, loading, error, retry } = useArtistRead(artistId ? `/v1/artist-analytics/artist/${artistId}/supporters` : null);
  const [composerOpen, setComposerOpen] = useState(false);
  const count = Number(data?.supportersCount ?? fallbackCount ?? 0);
  const recent = (data?.recentSupporters || []).slice(0, 5);
  const newLast30 = (data?.supporterGrowth || []).reduce((sum: number, g: any) => sum + Number(g.count || 0), 0);
  return (
    <Card>
      <Text style={styles.cardTitle}>{formatNumber(count)} {count === 1 ? 'supporter' : 'supporters'}</Text>
      {loading ? (
        <CardLoading label="Loading your supporters…" />
      ) : error ? (
        <CardError onRetry={retry} />
      ) : count === 0 ? (
        <Text style={styles.note}>When a listener picks you as their artist, they show up here by name.</Text>
      ) : (
        <>
          <Text style={styles.sub}>
            {newLast30 > 0 ? `${formatNumber(newLast30)} new in the last 30 days. ` : ''}Each one sends you 15% of their monthly share.
          </Text>
          {recent.length > 0 && (
            <View style={styles.faces}>
              {recent.map((s: any, i: number) =>
                s.photoUrl ? (
                  <Image key={s.userId} source={{ uri: buildUrl(s.photoUrl) || undefined }} style={[styles.face, { marginLeft: i ? -10 : 0 }]} accessibilityLabel={s.username || 'Supporter'} />
                ) : (
                  <View key={s.userId} style={[styles.face, { marginLeft: i ? -10 : 0, backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{initialOf(s.username)}</Text>
                  </View>
                ),
              )}
            </View>
          )}
          <Pressable onPress={() => setComposerOpen(true)} style={[styles.cta, { backgroundColor: t.primary }]}>
            <Megaphone size={15} color="#fff" />
            <Text style={styles.ctaText}>Message all supporters</Text>
          </Pressable>
        </>
      )}
      <LinkBtn label="Open Fans" onPress={onOpenFans} color={t.textAccent} />
      {composerOpen && <BroadcastComposer supporterCount={count} onClose={() => setComposerOpen(false)} />}
    </Card>
  );
};

interface Props {
  artistId: string;
  setupSteps: SetupStep[];
  onSetupAction: (key: string) => void;
  totals: Record<string, number>;
  defaultSong: any;
  featuredArtwork: any;
  onPlayFeatured: () => void;
  onChooseFeatured: () => void;
  latestWin: string | null;
  earningsSummary: any;
  phoneVerified: boolean;
  onVerifyPhone: () => void;
  supportersCount: number;
  onGoTab: (id: string) => void;
  onViewPage: () => void;
}

const ArtistHomeTab: React.FC<Props> = (p) => {
  const t = useUnisTheme();
  const setupDone = p.setupSteps.every((s) => s.done);
  const featuredSource = typeof p.featuredArtwork === 'string' ? { uri: p.featuredArtwork } : p.featuredArtwork;
  return (
    <View style={{ gap: 14 }}>
      {!setupDone && <SetupCard steps={p.setupSteps} onAction={p.onSetupAction} />}
      <WeekStats artistId={p.artistId} totals={p.totals} />
      <ImageBackground source={featuredSource} style={styles.featured} imageStyle={{ borderRadius: 20 }} blurRadius={2}>
        <LinearGradient colors={['rgba(7,9,15,0.2)', 'rgba(7,9,15,0.92)']} style={[StyleSheet.absoluteFill, { borderRadius: 20 }]} />
        <View style={{ padding: 18 }}>
          <Text style={[styles.tag, { color: t.textAccent }]}>Featured song</Text>
          <Text style={styles.featuredTitle} numberOfLines={2}>{p.defaultSong?.title || 'No featured song set'}</Text>
          <Text style={styles.featuredSub}>
            {p.defaultSong
              ? `${formatNumber(p.defaultSong.playCount)} plays · the first song people hear on your page.`
              : 'Choose the song that should represent you first.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Pressable onPress={p.onPlayFeatured} style={styles.play}>
              <Play size={13} color="#000" fill="#000" />
              <Text style={styles.playText}>{p.defaultSong ? 'Play' : 'Choose'}</Text>
            </Pressable>
            {p.defaultSong && (
              <Pressable onPress={p.onChooseFeatured} style={styles.change}>
                <Text style={styles.changeText}>Change</Text>
              </Pressable>
            )}
          </View>
        </View>
      </ImageBackground>
      <Standing artistId={p.artistId} latestWin={p.latestWin} onOpenRaces={() => p.onGoTab('races')} />
      <Balance earningsSummary={p.earningsSummary} phoneVerified={p.phoneVerified} onVerify={p.onVerifyPhone} onOpenEarnings={() => p.onGoTab('earnings')} />
      <Supporters artistId={p.artistId} fallbackCount={p.supportersCount} onOpenFans={() => p.onGoTab('fans')} />
      <LinkBtn label="See your page the way fans do" onPress={p.onViewPage} color={t.textAccent} />
    </View>
  );
};

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', gap: 6 },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  em: { fontStyle: 'italic', fontWeight: '400' },
  sub: { color: 'rgba(255,255,255,0.65)', fontSize: 13.5, lineHeight: 19 },
  note: { color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 18 },
  errorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 6 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 12.5 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  stepTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  stepText: { color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginTop: 1 },
  stepAction: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  stepActionText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '47%', flexGrow: 1, padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  statLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  statValue: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 4 },
  delta: { color: 'rgba(255,255,255,0.5)', fontSize: 12.5, fontWeight: '700', marginTop: 2 },
  statTotal: { color: 'rgba(255,255,255,0.4)', fontSize: 11.5, marginTop: 4 },
  featured: { minHeight: 200, borderRadius: 20, overflow: 'hidden', justifyContent: 'flex-end' },
  tag: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  featuredTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 4 },
  featuredSub: { color: 'rgba(255,255,255,0.75)', fontSize: 13.5, marginTop: 4 },
  play: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: '#fff' },
  playText: { color: '#000', fontWeight: '800', fontSize: 13.5 },
  change: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
  changeText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  standRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  standName: { color: '#fff', fontSize: 14.5, fontWeight: '600' },
  standRank: { fontSize: 18, fontWeight: '800' },
  win: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: 'rgba(196,154,10,0.1)', marginTop: 6 },
  winText: { color: '#f5d77a', fontSize: 13, fontWeight: '600', flex: 1 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, alignSelf: 'flex-start' },
  linkText: { fontWeight: '700', fontSize: 13.5 },
  amount: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  bar: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginVertical: 6 },
  barFill: { height: 8, borderRadius: 4 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: 'rgba(245,158,11,0.12)', marginTop: 6 },
  warnText: { color: '#fbbf24', fontSize: 13, flex: 1 },
  warnBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(245,158,11,0.25)' },
  warnBtnText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
  faces: { flexDirection: 'row', marginVertical: 8 },
  face: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#07090f' },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: 999, marginTop: 4 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

export default ArtistHomeTab;
