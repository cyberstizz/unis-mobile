// src/screens/EarningsScreen.tsx
//
// Full port of the web `earnings.jsx` production version, carrying every fix
// from the web QA pass.
//
// PARITY WITH WEB:
//   • Same five endpoints, same Promise.allSettled degradation, same tabs
//     (Overview / Referrals / Payouts / How It Works), same copy.
//   • Payout threshold read from `summary.payoutThreshold` (never hardcoded).
//   • Stripe URLs validated (https + stripe.com) before opening.
//   • Payout success/error tracked as state, not by sniffing the message text.
//   • A successful payout refreshes only the three financial endpoints.
//   • Per-endpoint console logging under an `[EarningsScreen]` prefix.
//
// FIXED FROM THE PREVIOUS MOBILE STUB:
//   • buildUrl — was `getMediaUrl`, which cannot rewrite private-R2 URLs.
//     Now uses the shared `utils/buildUrl` like ProfileScreen and
//     SupportedArtistPicker.
//   • Theme — the old `C.unisBlue = '#163387'` hardcoded the *blue* theme's
//     primary, so the screen stayed blue on every other theme. Brand surfaces
//     now derive from `useAuth().theme` via the THEME_HEX map, matching
//     FeedScreen.
//   • `user?.role` — this was a hard TypeScript error (`Property 'role' does
//     not exist on type 'User'`). Widened locally instead of suppressed.
//   • Stripe return trip — the old screen opened the browser and never looked
//     again, so a user who finished onboarding saw a stale "Complete Your
//     Setup" banner until they killed the app. There is no `scheme` in
//     app.json, so a deep-link return is not available; we listen to AppState
//     instead and re-check Stripe status when the app comes back to the
//     foreground. See the QA report, finding M-1.
//   • Accessibility — tablist/tab semantics, progressbar, live regions,
//     touch targets, and labels on every control.
//
// NOT APPLICABLE: PlayChoiceModal. This screen has no play surface, so there
// is nothing to attribute to artist or user points.

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Linking,
  RefreshControl,
  AppState,
  AppStateStatus,
} from 'react-native';
import {
  DollarSign,
  Users,
  TrendingUp,
  ArrowUpRight,
  Clock,
  CheckCircle,
  AlertCircle,
  CreditCard,
  ExternalLink,
  Shield,
  X,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import axiosInstance from '../services/axiosInstance';
import buildUrl from '../utils/buildUrl';

const backimage = require('../../assets/randomrapper.jpeg');

// ============================================================================
// CONFIG
// ============================================================================

const HISTORY_DAYS = 30;

// Fallback only — the authoritative value is summary.payoutThreshold, so a
// backend policy change does not require an app store release.
const DEFAULT_PAYOUT_THRESHOLD = 50;

const REFERRALS_PAGE_SIZE = 25;
const PAYOUTS_PAGE_SIZE = 12;

// Stripe Account Links and Login Links are always issued on stripe.com.
// Anything else is treated as an open-redirect attempt and refused.
const ALLOWED_STRIPE_HOSTS = ['stripe.com'];

// ============================================================================
// THEME — mirrors web `--unis-primary` / ThemePicker / FeedScreen
// ============================================================================

const THEME_HEX: Record<string, string> = {
  blue: '#163387',
  orange: '#C44B0A',
  red: '#B51C24',
  green: '#0F7A3E',
  purple: '#4A1A8C',
  yellow: '#C49A0A',
  dianna: '#C49A0A',
};

const getThemeHex = (theme?: string): string => THEME_HEX[theme || 'blue'] || THEME_HEX.blue;

const lightenHex = (hex: string, amt: number = 40): string => {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + amt);
  const g = Math.min(255, ((num >> 8) & 0xff) + amt);
  const b = Math.min(255, (num & 0xff) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

const hexToRgba = (hex: string, alpha: number): string => {
  const num = parseInt(hex.replace('#', ''), 16);
  return `rgba(${num >> 16}, ${(num >> 8) & 0xff}, ${num & 0xff}, ${alpha})`;
};

// Static tones. These identify referral depth rather than brand, so they stay
// constant across themes — same decision as the web stylesheet.
const C = {
  bgCard: 'rgba(255,255,255,0.03)',
  borderCard: 'rgba(255,255,255,0.06)',
  textPrimary: '#ffffff',
  textSecondary: '#d1d5db',
  // Contrast-corrected ramp — the old #6b7280 / #4b5563 sat under 4.5:1.
  textMuted: '#8b93a1',
  textDim: '#6f7887',
  green: '#22c55e',
  greenText: '#4ade80',
  blue: '#3b82f6',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  purple: '#a855f7',
  gold: '#f59e0b',
  red: '#ef4444',
  redText: '#ff8a95',
};

// ============================================================================
// REVENUE SPLIT DATA — one source of truth for bar + legend
// ============================================================================

type Tone = 'brand' | 'purple' | 'blue' | 'violet' | 'cyan' | 'green';

interface SplitSegment {
  key: string;
  label: string;
  legend: string;
  width: number;
  tone: Tone;
}

const DISPLAY_AD_SPLIT: SplitSegment[] = [
  { key: 'unis',   label: 'Unis 68%',   legend: 'Unis (68%)',             width: 68, tone: 'brand' },
  { key: 'artist', label: 'Artist 15%', legend: 'Supported Artist (15%)', width: 15, tone: 'purple' },
  { key: 'level1', label: 'L1',         legend: 'Level 1 Referrer (10%)', width: 10, tone: 'blue' },
  { key: 'level2', label: '',           legend: 'Level 2 Referrer (5%)',  width: 5,  tone: 'violet' },
  { key: 'level3', label: '',           legend: 'Level 3 Referrer (2%)',  width: 2,  tone: 'cyan' },
];

const AUDIO_AD_SPLIT: SplitSegment[] = [
  { key: 'artist', label: 'Artist 60%', legend: 'Artist (60%)',           width: 60, tone: 'green' },
  { key: 'unis',   label: 'Unis 23%',   legend: 'Unis (23%)',             width: 23, tone: 'brand' },
  { key: 'level1', label: 'L1',         legend: 'Level 1 Referrer (10%)', width: 10, tone: 'blue' },
  { key: 'level2', label: '',           legend: 'Level 2 Referrer (5%)',  width: 5,  tone: 'violet' },
  { key: 'level3', label: '',           legend: 'Level 3 Referrer (2%)',  width: 2,  tone: 'cyan' },
];

const TABS = [
  { id: 'overview',  label: 'Overview' },
  { id: 'referrals', label: 'Referrals' },
  { id: 'payouts',   label: 'Payouts' },
  { id: 'how',       label: 'How It Works' },
] as const;

type TabId = typeof TABS[number]['id'];

// ============================================================================
// LOGGING
// ============================================================================

const log = (msg: string, ...rest: any[]) => console.log(`[EarningsScreen] ${msg}`, ...rest);
const logWarn = (msg: string, ...rest: any[]) => console.warn(`[EarningsScreen] ${msg}`, ...rest);
const logError = (msg: string, ...rest: any[]) => console.error(`[EarningsScreen] ${msg}`, ...rest);

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Guard against open redirects. The backend is trusted, but a compromised or
 * misconfigured response must never be able to hand the user's browser to an
 * arbitrary origin — this is the only place the screen opens a server-supplied
 * string.
 */
function isSafeStripeUrl(rawUrl: unknown): rawUrl is string {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_STRIPE_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

const toNumber = (value: any, fallback = 0): number => {
  const num = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(num) ? num : fallback;
};

/**
 * Micro-earnings are real here — a single ad view can be worth a fraction of a
 * cent — so precision scales with magnitude instead of rounding small balances
 * to $0.00. Identical to the web implementation.
 */
const formatMoney = (amount: any): string => {
  if (amount === null || amount === undefined) return '$0.00';
  const num = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(num)) return '$0.00';
  return `$${num.toFixed(num < 0.01 && num > 0 ? 6 : num < 1 && num > 0 ? 4 : 2)}`;
};

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// The mobile AuthContext `User` type has no `role` field (web does). Widen it
// here rather than casting to `any` at the call site.
interface UserWithRole {
  userId: string;
  isArtist?: boolean;
  role?: string;
}

interface ErrorState {
  source: 'load' | 'stripe';
  message: string;
}

type FetchScope = 'full' | 'financial';

// ============================================================================
// SCREEN
// ============================================================================

const EarningsScreen: React.FC = () => {
  const { user, loading: authLoading, theme } = useAuth();

  const accent = getThemeHex(theme);
  const accentLight = useMemo(() => lightenHex(accent, 40), [accent]);

  const [summary, setSummary] = useState<any>(null);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [stripeStatus, setStripeStatus] = useState<any>(null);
  const [payouts, setPayouts] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [stripeLoading, setStripeLoading] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState('');
  const [payoutStatus, setPayoutStatus] = useState<'success' | 'error' | null>(null);
  const [visibleReferrals, setVisibleReferrals] = useState(REFERRALS_PAGE_SIZE);
  const [visiblePayouts, setVisiblePayouts] = useState(PAYOUTS_PAGE_SIZE);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  // Set when we hand the user off to Stripe, so the AppState listener knows to
  // re-check status on return rather than refetching on every foreground.
  const awaitingStripeReturnRef = useRef(false);

  const typedUser = user as UserWithRole | null;
  const isArtist = typedUser?.role === 'artist' || typedUser?.isArtist;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Data loading ──────────────────────────────────────────────────────────

  /**
   * @param scope 'full'      — all five endpoints (mount, pull-to-refresh)
   *              'financial' — balance, Stripe status and payout list only.
   *                            Referrals and 30-day history cannot change as a
   *                            result of a withdrawal, so a payout no longer
   *                            costs five round trips on a mobile connection.
   */
  const fetchAllData = useCallback(
    async (scope: FetchScope = 'full') => {
      if (!user?.userId) return;

      if (inFlightRef.current) {
        log('Fetch already in flight — ignoring duplicate request');
        return;
      }
      inFlightRef.current = true;

      const requests: { key: string; url: string; apply: (d: any) => void }[] = [
        { key: 'summary',      url: '/v1/earnings/my-summary', apply: (d) => setSummary(d ?? null) },
        { key: 'stripeStatus', url: '/v1/stripe/status',       apply: (d) => setStripeStatus(d ?? null) },
        { key: 'payouts',      url: '/v1/stripe/payouts',      apply: (d) => setPayouts(d || []) },
      ];

      if (scope === 'full') {
        requests.push(
          { key: 'referrals', url: '/v1/earnings/my-referrals', apply: (d) => setReferrals(d || []) },
          { key: 'history',   url: `/v1/earnings/my-history?days=${HISTORY_DAYS}`, apply: (d) => setHistory(d || []) },
        );
      }

      log(`Loading earnings (scope: ${scope}, ${requests.length} endpoints)`);

      try {
        const results = await Promise.allSettled(requests.map((req) => axiosInstance.get(req.url)));

        if (!mountedRef.current) {
          log('Screen unmounted before load finished — discarding response');
          return;
        }

        const failed: string[] = [];
        results.forEach((result, index) => {
          const { key, apply } = requests[index];
          if (result.status === 'fulfilled') {
            apply(result.value?.data);
            log(`✓ ${key} loaded`);
          } else {
            failed.push(key);
            // The old screen swallowed these entirely: allSettled never throws,
            // so the catch block was unreachable and a broken endpoint was
            // invisible in a device log.
            const reason: any = result.reason;
            logError(
              `✗ ${key} failed (status ${reason?.response?.status ?? 'n/a'})`,
              reason?.message || reason
            );
          }
        });

        if (failed.length === requests.length) {
          setError({ source: 'load', message: 'Failed to load earnings data.' });
          logError('All earnings endpoints failed');
        } else {
          if (failed.length > 0) {
            logWarn(`Partial load — degraded sections: ${failed.join(', ')}`);
          } else {
            log('All earnings endpoints loaded successfully');
          }
          // Only clear a previous *load* error — a Stripe warning must survive.
          setError((prev) => (prev?.source === 'load' ? null : prev));
        }
      } catch (err) {
        logError('Unexpected failure while loading earnings', err);
        if (mountedRef.current) {
          setError({ source: 'load', message: 'Failed to load earnings data.' });
        }
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [user?.userId]
  );

  useEffect(() => {
    if (!user?.userId) {
      if (!authLoading) setLoading(false);
      return;
    }
    fetchAllData('full');
  }, [user?.userId, authLoading, fetchAllData]);

  // ── Stripe return trip ────────────────────────────────────────────────────
  //
  // Web gets `?stripe=complete` on the redirect back. Mobile has no such hook:
  // app.json declares no URL `scheme`, so Stripe cannot deep-link into the app
  // at all. Watching AppState is the reliable substitute — when the user comes
  // back from the Stripe browser flow we re-check status so the banner and the
  // Payouts tab reflect what they just did.
  useEffect(() => {
    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      if (!awaitingStripeReturnRef.current) return;

      awaitingStripeReturnRef.current = false;
      log('Returned from the Stripe browser flow — re-checking account status');
      setActiveTab('payouts');
      fetchAllData('financial');
    };

    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, [fetchAllData]);

  const onRefresh = () => {
    if (refreshing || inFlightRef.current) return;
    setRefreshing(true);
    fetchAllData('full');
  };

  // ── Stripe actions ────────────────────────────────────────────────────────

  const openExternal = async (url: string): Promise<boolean> => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        logError('No handler available for URL', url);
        return false;
      }
      await Linking.openURL(url);
      return true;
    } catch (err) {
      logError('Failed to open external URL', err);
      return false;
    }
  };

  const handleStartOnboarding = async () => {
    if (stripeLoading) return;
    setStripeLoading(true);
    log('Requesting Stripe onboarding link');
    try {
      const res = await axiosInstance.post('/v1/stripe/onboard');
      const url = res?.data?.url;

      if (!url) {
        // The old screen silently did nothing here — the button just re-enabled.
        logError('Onboarding response contained no URL', res?.data);
        setError({ source: 'stripe', message: 'Failed to start Stripe setup. Please try again.' });
        return;
      }
      if (!isSafeStripeUrl(url)) {
        logError('Refused to open non-Stripe onboarding URL', url);
        setError({ source: 'stripe', message: 'Failed to start Stripe setup. Please try again.' });
        return;
      }

      const opened = await openExternal(url);
      if (opened) {
        log('Onboarding link opened — will re-check status on return');
        awaitingStripeReturnRef.current = true;
      } else {
        setError({ source: 'stripe', message: 'Failed to start Stripe setup. Please try again.' });
      }
    } catch (err: any) {
      logError('Stripe onboarding request failed', err?.response?.status, err?.message);
      setError({ source: 'stripe', message: 'Failed to start Stripe setup. Please try again.' });
    } finally {
      if (mountedRef.current) setStripeLoading(false);
    }
  };

  const handleRequestPayout = async () => {
    if (payoutLoading) return;
    setPayoutLoading(true);
    setPayoutMessage('');
    setPayoutStatus(null);
    log('Requesting payout');
    try {
      const res = await axiosInstance.post('/v1/stripe/payout');

      if (res?.data?.success) {
        const amount = formatMoney(res.data.amount);
        log(`Payout initiated for ${amount}`);
        setPayoutMessage(`Payout of ${amount} initiated successfully!`);
        setPayoutStatus('success');
        fetchAllData('financial');
      } else {
        // A 200 with success:false previously produced no feedback at all.
        const msg = res?.data?.error || 'Payout request failed.';
        logWarn('Payout was not accepted by the server', res?.data);
        setPayoutMessage(msg);
        setPayoutStatus('error');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Payout request failed.';
      logError('Payout request failed', err?.response?.status, msg);
      setPayoutMessage(msg);
      setPayoutStatus('error');
    } finally {
      if (mountedRef.current) setPayoutLoading(false);
    }
  };

  const handleOpenStripeDashboard = async () => {
    log('Requesting Stripe dashboard link');
    try {
      const res = await axiosInstance.get('/v1/stripe/dashboard-link');
      const url = res?.data?.url;

      if (!isSafeStripeUrl(url)) {
        logError('Dashboard link missing or not a Stripe URL', url);
        setError({ source: 'stripe', message: 'Failed to open Stripe dashboard.' });
        return;
      }

      const opened = await openExternal(url);
      if (!opened) {
        setError({ source: 'stripe', message: 'Failed to open Stripe dashboard.' });
      }
    } catch (err: any) {
      logError('Stripe dashboard link request failed', err?.response?.status, err?.message);
      setError({ source: 'stripe', message: 'Failed to open Stripe dashboard.' });
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────

  const payoutThreshold = useMemo(() => {
    const fromApi = toNumber(summary?.payoutThreshold, 0);
    return fromApi > 0 ? fromApi : DEFAULT_PAYOUT_THRESHOLD;
  }, [summary?.payoutThreshold]);

  const availableBalance = toNumber(summary?.currentBalance, 0);

  // Guarded against a zero/absent threshold, which used to yield NaN and
  // render the bar at full width.
  const payoutProgress = useMemo(() => {
    if (!summary || payoutThreshold <= 0) return 0;
    const pct = (availableBalance / payoutThreshold) * 100;
    if (!Number.isFinite(pct) || pct < 0) return 0;
    return Math.round(Math.min(100, pct) * 10) / 10;
  }, [summary, availableBalance, payoutThreshold]);

  const stripeReady = Boolean(stripeStatus?.onboardingComplete && stripeStatus?.payoutsEnabled);
  const canWithdraw = stripeReady && availableBalance >= payoutThreshold;

  const toneColor = (tone: Tone): string => {
    switch (tone) {
      case 'brand': return accent;
      case 'purple': return C.purple;
      case 'blue': return C.blue;
      case 'violet': return C.violet;
      case 'cyan': return C.cyan;
      case 'green': return C.green;
      default: return accent;
    }
  };

  const tabCount = (id: TabId): number | null => {
    if (id === 'referrals') return referrals.length;
    if (id === 'payouts') return payouts.length;
    return null;
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.loadingWrap} accessibilityRole="progressbar" accessibilityLabel="Loading your earnings">
        <ActivityIndicator size="large" color={accent} />
        <Text style={s.loadingText}>Loading your earnings...</Text>
      </View>
    );
  }

  // ── Sub-renderers ─────────────────────────────────────────────────────────

  const renderSplitBar = (segments: SplitSegment[]) => (
    <View>
      <View style={s.howBar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {segments.map((seg) => (
          <View
            key={seg.key}
            style={[s.howSegment, { flex: seg.width, backgroundColor: toneColor(seg.tone) }]}
          >
            {seg.label ? (
              <Text style={s.howSegmentText} numberOfLines={1}>
                {seg.label}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      {/* The legend is the text equivalent of the bar — meaning is never
          carried by colour alone. The old screen had no legend at all. */}
      <View style={s.howLegend}>
        {segments.map((seg) => (
          <View key={seg.key} style={s.howLegendItem}>
            <View style={[s.legendDot, { backgroundColor: toneColor(seg.tone) }]} />
            <Text style={s.howLegendText}>{seg.legend}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderOverview = () => (
    <View style={s.tabPanel}>
      <View style={s.card}>
        <Text style={s.cardHeading}>Referral Earnings by Level</Text>
        <View style={s.levelBreakdown}>
          {[
            { dot: C.blue,   name: 'Level 1 — Direct Referrals',        pct: '10%', amt: summary?.referralEarnings?.level1?.lifetime },
            { dot: C.violet, name: "Level 2 — Your Referrals' Referrals", pct: '5%',  amt: summary?.referralEarnings?.level2?.lifetime },
            { dot: C.cyan,   name: 'Level 3 — Third Degree',            pct: '2%',  amt: summary?.referralEarnings?.level3?.lifetime },
          ].map((row) => (
            <View key={row.name} style={s.levelRow}>
              <View style={s.levelLabel}>
                <View style={[s.levelDot, { backgroundColor: row.dot }]} />
                <Text style={s.levelName} numberOfLines={2}>{row.name}</Text>
                <Text style={s.levelPct}>{row.pct}</Text>
              </View>
              <Text style={s.levelAmount}>{formatMoney(row.amt)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardHeading}>Last {HISTORY_DAYS} Days</Text>
        {history.length > 0 ? (
          <View
            style={s.miniChart}
            accessibilityRole="image"
            accessibilityLabel={`Daily earnings for the last ${history.length} days. Total ${formatMoney(
              history.reduce((sum, d) => sum + toNumber(d.total, 0), 0)
            )}.`}
          >
            {(() => {
              const values = history.map((d) => toNumber(d.total, 0));
              const maxVal = Math.max(...values);
              const minVal = Math.min(...values);
              const range = maxVal - minVal;
              return history.map((day, i) => {
                const val = toNumber(day.total, 0);
                const heightPct = range === 0 ? 50 : Math.max(6, ((val - minVal) / range) * 90 + 10);
                return (
                  <View key={day.date || i} style={s.chartBarWrap}>
                    <View
                      style={[s.chartBar, { height: `${heightPct}%`, backgroundColor: accent }]}
                    />
                  </View>
                );
              });
            })()}
          </View>
        ) : (
          <View style={s.emptyChart}>
            <Text style={s.emptyChartText}>
              No earnings activity yet. Share your referral code to start earning!
            </Text>
          </View>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.cardHeading}>Your Revenue Streams</Text>
        <View style={s.splitItems}>
          <View style={s.splitItem}>
            <View style={[s.splitDot, { backgroundColor: C.blue }]} />
            <View style={s.splitInfo}>
              <Text style={s.splitTitle}>Referral Income (up to 17%)</Text>
              <Text style={s.splitBody}>
                Level 1: 10% from users you directly referred. Level 2: 5% from their referrals.
                Level 3: 2% from their referrals' referrals. Lifetime passive income — forever.
              </Text>
            </View>
          </View>
          {isArtist && (
            <View style={s.splitItem}>
              <View style={[s.splitDot, { backgroundColor: C.purple }]} />
              <View style={s.splitInfo}>
                <Text style={s.splitTitle}>Supporter Income (15%)</Text>
                <Text style={s.splitBody}>
                  Users who chose to support you contribute 15% of their ad revenue to your career.
                </Text>
              </View>
            </View>
          )}
          <View style={s.splitItem}>
            <View style={[s.splitDot, { backgroundColor: C.gold }]} />
            <View style={s.splitInfo}>
              <Text style={s.splitTitle}>Audio Ad Revenue (Coming Soon)</Text>
              <Text style={s.splitBody}>
                Pre-roll ads on songs. Artists earn 60% of net revenue. Referral pool splits
                10/5/2% across 3 levels.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  const renderReferrals = () => (
    <View style={s.tabPanel}>
      {referrals.length > 0 ? (
        <>
          {referrals.slice(0, visibleReferrals).map((ref, i) => {
            const photo = buildUrl(ref.photoUrl);
            return (
              <View key={ref.userId || i} style={s.referralItem}>
                <Image
                  source={photo ? { uri: photo } : backimage}
                  style={s.referralPhoto}
                  accessibilityIgnoresInvertColors
                />
                <View style={s.referralInfo}>
                  <Text style={s.referralName} numberOfLines={1}>{ref.username}</Text>
                  <Text style={s.referralViews}>{ref.adViews || 0} ad views</Text>
                </View>
                <View style={s.referralEarnings}>
                  <Text style={s.referralAmount}>{formatMoney(ref.earnings)}</Text>
                  <ArrowUpRight size={14} color={C.greenText} />
                </View>
              </View>
            );
          })}
          {referrals.length > visibleReferrals && (
            <TouchableOpacity
              style={[s.loadMoreBtn, { borderColor: hexToRgba(accent, 0.4) }]}
              onPress={() => setVisibleReferrals((n) => n + REFERRALS_PAGE_SIZE)}
              accessibilityRole="button"
              accessibilityLabel={`Show more referrals, ${referrals.length - visibleReferrals} remaining`}
            >
              <Text style={s.loadMoreText}>
                Show more referrals ({referrals.length - visibleReferrals} remaining)
              </Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <View style={s.emptyState}>
          <Users size={48} color={C.textMuted} />
          <Text style={s.emptyTitle}>No Referrals Yet</Text>
          <Text style={s.emptyBody}>
            Share your referral code to invite friends. Every person you bring earns you passive
            income — for life.
          </Text>
        </View>
      )}
    </View>
  );

  const renderPayouts = () => (
    <View style={s.tabPanel}>
      {!stripeReady && (
        <View style={[s.setupPrompt, { borderColor: hexToRgba(accent, 0.35) }]}>
          <CreditCard size={40} color={accent} />
          <Text style={s.emptyTitle}>Set Up Stripe to Receive Payouts</Text>
          <Text style={s.emptyBody}>
            Connect your bank account through Stripe to withdraw your earnings. It only takes a few
            minutes.
          </Text>
          <TouchableOpacity
            style={[s.stripeBtn, { backgroundColor: accent }, stripeLoading && s.btnDisabled]}
            onPress={handleStartOnboarding}
            disabled={stripeLoading}
            accessibilityRole="button"
            accessibilityState={{ disabled: stripeLoading, busy: stripeLoading }}
            accessibilityLabel="Set up Stripe payouts. Opens in your browser."
          >
            <Text style={s.stripeBtnText}>{stripeLoading ? 'Setting up...' : 'Set Up Now'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {payouts.length > 0 ? (
        <View>
          <Text style={s.cardHeading}>Payout History</Text>
          {payouts.slice(0, visiblePayouts).map((p, i) => (
            <View key={p.payoutId || i} style={s.payoutItem}>
              <View style={s.payoutItemLeft}>
                <View style={[s.payoutStatusDot, { backgroundColor: statusColor(p.status) }]} />
                <View>
                  <Text style={s.payoutAmount}>{formatMoney(p.amount)}</Text>
                  <Text style={s.payoutPeriod}>
                    {formatDate(p.periodStart)} — {formatDate(p.periodEnd)}
                  </Text>
                </View>
              </View>
              <View style={s.payoutItemRight}>
                <Text style={[s.payoutStatusText, { color: statusColor(p.status) }]}>
                  {p.status}
                </Text>
                <Text style={s.payoutDate}>{formatDate(p.createdAt)}</Text>
              </View>
            </View>
          ))}
          {payouts.length > visiblePayouts && (
            <TouchableOpacity
              style={[s.loadMoreBtn, { borderColor: hexToRgba(accent, 0.4) }]}
              onPress={() => setVisiblePayouts((n) => n + PAYOUTS_PAGE_SIZE)}
              accessibilityRole="button"
              accessibilityLabel={`Show more payouts, ${payouts.length - visiblePayouts} remaining`}
            >
              <Text style={s.loadMoreText}>
                Show more payouts ({payouts.length - visiblePayouts} remaining)
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : stripeReady ? (
        <View style={s.emptyState}>
          <DollarSign size={48} color={C.textMuted} />
          <Text style={s.emptyTitle}>No Payouts Yet</Text>
          <Text style={s.emptyBody}>
            Once your balance reaches {formatMoney(payoutThreshold)}, you can request a withdrawal
            here.
          </Text>
        </View>
      ) : null}
    </View>
  );

  const renderHowItWorks = () => (
    <View style={s.tabPanel}>
      <View style={s.card}>
        <Text style={s.cardHeading}>Display Ad Revenue Split</Text>
        {renderSplitBar(DISPLAY_AD_SPLIT)}
        <Text style={s.howNote}>
          Every ad view is tracked and attributed. If any referral level doesn't exist, that share
          goes to Unis.
        </Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardHeading}>Audio Ad Revenue Split (Coming Soon)</Text>
        {renderSplitBar(AUDIO_AD_SPLIT)}
        <Text style={s.howNote}>
          Pre-roll audio ads before songs. After compulsory royalty payments, net revenue splits
          across the artist, Unis, and the 3-level referral chain.
        </Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardHeading}>3-Level Referral Chain</Text>
        <View style={s.chainVisual}>
          <View style={[s.chainNode, s.chainYou, { backgroundColor: hexToRgba(accent, 0.3), borderColor: accent }]}>
            <Text style={s.chainYouText}>YOU</Text>
          </View>
          <Text style={s.chainArrow}>↓ refers</Text>
          <View style={[s.chainNode, { backgroundColor: hexToRgba(C.blue, 0.12), borderColor: hexToRgba(C.blue, 0.3) }]}>
            <Text style={s.chainNodeText}>User A</Text>
            <Text style={s.chainTag}>You earn 10%</Text>
          </View>
          <Text style={s.chainArrow}>↓ refers</Text>
          <View style={[s.chainNode, { backgroundColor: hexToRgba(C.violet, 0.12), borderColor: hexToRgba(C.violet, 0.3) }]}>
            <Text style={s.chainNodeText}>User B</Text>
            <Text style={s.chainTag}>You earn 5%</Text>
          </View>
          <Text style={s.chainArrow}>↓ refers</Text>
          <View style={[s.chainNode, { backgroundColor: hexToRgba(C.cyan, 0.12), borderColor: hexToRgba(C.cyan, 0.3) }]}>
            <Text style={s.chainNodeText}>User C</Text>
            <Text style={s.chainTag}>You earn 2%</Text>
          </View>
        </View>
        <Text style={s.howNote}>
          When anyone in your 3-level chain browses Unis and sees ads, you earn. This is lifetime
          passive income.
        </Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardHeading}>Payout Rules</Text>
        {[
          `Minimum payout: ${formatMoney(payoutThreshold)}`,
          'Payout frequency: Monthly (first week of following month)',
          `Earnings under ${formatMoney(payoutThreshold)} roll over — nothing is lost`,
          'Payment via Stripe Connect (direct bank deposit)',
          '1099-NEC issued for US users earning over $600/year',
        ].map((rule) => (
          <View key={rule} style={s.ruleRow}>
            <Text style={[s.ruleArrow, { color: accent }]}>→</Text>
            <Text style={s.ruleText}>{rule}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
      }
    >
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle} accessibilityRole="header">Earnings</Text>
        <Text style={s.headerSub}>
          Track your revenue from referrals{isArtist ? ', supporters,' : ''} and community
          engagement.
        </Text>
      </View>

      {error && (
        <View style={s.errorBanner} accessibilityLiveRegion="polite" accessibilityRole="alert">
          <AlertCircle size={16} color={C.redText} />
          <Text style={s.errorText}>{error.message}</Text>
          <TouchableOpacity
            onPress={() => setError(null)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss message"
          >
            <X size={16} color={C.redText} />
          </TouchableOpacity>
        </View>
      )}

      {/* Summary cards */}
      <View style={s.summaryGrid}>
        <View style={[s.summaryCard, s.summaryHighlight]}>
          <View style={[s.iconWrap, { backgroundColor: hexToRgba(C.green, 0.15) }]}>
            <DollarSign size={22} color={C.green} />
          </View>
          <View style={s.cardBody}>
            <Text style={s.cardLabel}>CURRENT BALANCE</Text>
            <Text style={s.cardValue}>{formatMoney(summary?.currentBalance)}</Text>
            <Text style={s.cardSub}>
              This month: {formatMoney(summary?.totalEarnings?.thisMonth)}
            </Text>
          </View>
        </View>

        <View style={s.summaryCard}>
          <View style={[s.iconWrap, { backgroundColor: hexToRgba(C.blue, 0.15) }]}>
            <Users size={22} color={C.blue} />
          </View>
          <View style={s.cardBody}>
            <Text style={s.cardLabel}>REFERRAL EARNINGS</Text>
            <Text style={s.cardValue}>{formatMoney(summary?.referralEarnings?.lifetime)}</Text>
            <Text style={s.cardSub}>
              {summary?.referralCount || 0} referrals · {summary?.referralViewsThisMonth || 0} views
              this month
            </Text>
          </View>
        </View>

        {isArtist && (
          <View style={s.summaryCard}>
            <View style={[s.iconWrap, { backgroundColor: hexToRgba(C.purple, 0.15) }]}>
              <TrendingUp size={22} color={C.purple} />
            </View>
            <View style={s.cardBody}>
              <Text style={s.cardLabel}>SUPPORTER EARNINGS</Text>
              <Text style={s.cardValue}>{formatMoney(summary?.supporterEarnings?.lifetime)}</Text>
              <Text style={s.cardSub}>{summary?.supporterCount || 0} supporters backing you</Text>
            </View>
          </View>
        )}

        <View style={s.summaryCard}>
          <View style={[s.iconWrap, { backgroundColor: hexToRgba(C.gold, 0.15) }]}>
            {summary?.payoutReady ? (
              <CheckCircle size={22} color={C.gold} />
            ) : (
              <Clock size={22} color={C.gold} />
            )}
          </View>
          <View style={s.cardBody}>
            <Text style={s.cardLabel}>PAYOUT STATUS</Text>
            <Text style={s.cardValue}>{summary?.payoutReady ? 'Ready!' : 'Building...'}</Text>
            <View
              style={s.progressBar}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: payoutProgress }}
              accessibilityLabel={`Progress toward the ${formatMoney(payoutThreshold)} payout minimum`}
            >
              <View
                style={[s.progressFill, { width: `${payoutProgress}%`, backgroundColor: accent }]}
              />
            </View>
            <Text style={s.progressText}>
              {formatMoney(summary?.currentBalance)} / {formatMoney(payoutThreshold)}
            </Text>
          </View>
        </View>
      </View>

      {/* Stripe banner */}
      <View style={s.stripeBanner}>
        {!stripeStatus?.hasAccount ? (
          <View style={[s.bannerContent, { borderColor: hexToRgba(accent, 0.35) }]}>
            <View style={s.bannerInfo}>
              <CreditCard size={22} color={accentLight} />
              <View style={s.bannerTextWrap}>
                <Text style={s.bannerTitle}>Set Up Payouts</Text>
                <Text style={s.bannerBody}>
                  Connect your bank account through Stripe to receive earnings. Takes about 3
                  minutes.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[s.stripeBtn, { backgroundColor: accent }, stripeLoading && s.btnDisabled]}
              onPress={handleStartOnboarding}
              disabled={stripeLoading}
              accessibilityRole="button"
              accessibilityState={{ disabled: stripeLoading, busy: stripeLoading }}
              accessibilityLabel="Get started with Stripe payouts. Opens in your browser."
            >
              <Text style={s.stripeBtnText}>{stripeLoading ? 'Setting up...' : 'Get Started'}</Text>
              <ExternalLink size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : !stripeReady ? (
          <View style={[s.bannerContent, { borderColor: hexToRgba(C.gold, 0.3) }]}>
            <View style={s.bannerInfo}>
              <Clock size={22} color={C.gold} />
              <View style={s.bannerTextWrap}>
                <Text style={s.bannerTitle}>Complete Your Setup</Text>
                <Text style={s.bannerBody}>
                  Your Stripe account is created but onboarding is incomplete. Finish setup to
                  enable payouts.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[s.stripeBtn, { backgroundColor: accent }, stripeLoading && s.btnDisabled]}
              onPress={handleStartOnboarding}
              disabled={stripeLoading}
              accessibilityRole="button"
              accessibilityState={{ disabled: stripeLoading, busy: stripeLoading }}
              accessibilityLabel="Continue Stripe setup. Opens in your browser."
            >
              <Text style={s.stripeBtnText}>{stripeLoading ? 'Loading...' : 'Continue Setup'}</Text>
              <ExternalLink size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[s.bannerContent, s.bannerReady]}>
            <View style={s.bannerInfo}>
              <Shield size={22} color={C.green} />
              <View style={s.bannerTextWrap}>
                <Text style={s.bannerTitle}>Payouts Enabled</Text>
                <Text style={s.bannerBody}>
                  Your bank account is connected. Earnings above {formatMoney(payoutThreshold)} can
                  be withdrawn.
                </Text>
              </View>
            </View>
            <View style={s.stripeActions}>
              {canWithdraw && (
                <TouchableOpacity
                  style={[s.stripeBtn, s.payoutBtn, payoutLoading && s.btnDisabled]}
                  onPress={handleRequestPayout}
                  disabled={payoutLoading}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: payoutLoading, busy: payoutLoading }}
                  accessibilityLabel={`Withdraw ${formatMoney(availableBalance)}`}
                >
                  <Text style={s.stripeBtnText}>
                    {payoutLoading ? 'Processing...' : `Withdraw ${formatMoney(availableBalance)}`}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={s.secondaryBtn}
                onPress={handleOpenStripeDashboard}
                accessibilityRole="button"
                accessibilityLabel="Open the Stripe dashboard in your browser"
              >
                <Text style={s.secondaryBtnText}>Stripe Dashboard</Text>
                <ExternalLink size={12} color={C.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {payoutMessage ? (
          <View
            style={[s.payoutMessage, payoutStatus === 'success' ? s.payoutSuccess : s.payoutError]}
            accessibilityLiveRegion="polite"
          >
            <Text
              style={[
                s.payoutMessageText,
                { color: payoutStatus === 'success' ? C.greenText : C.redText },
              ]}
            >
              {payoutMessage}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabsScroll}
        contentContainerStyle={s.tabs}
        accessibilityRole="tablist"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = tabCount(tab.id);
          return (
            <TouchableOpacity
              key={tab.id}
              style={[s.tab, isActive && { borderBottomColor: accent }]}
              onPress={() => setActiveTab(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={count === null ? tab.label : `${tab.label}, ${count} items`}
            >
              <Text style={[s.tabText, isActive && s.tabTextActive]}>
                {count === null ? tab.label : `${tab.label} (${count})`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Panels */}
      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'referrals' && renderReferrals()}
      {activeTab === 'payouts' && renderPayouts()}
      {activeTab === 'how' && renderHowItWorks()}

      <View style={s.bottomSpacer} />
    </ScrollView>
  );
};

const statusColor = (status?: string): string => {
  switch (status) {
    case 'completed': return C.greenText;
    case 'processing': return C.gold;
    case 'failed': return C.red;
    default: return C.textMuted;
  }
};

// ============================================================================
// STYLES
// ============================================================================

const s = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  bottomSpacer: { height: 40 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: C.textMuted, fontSize: 15, marginTop: 12 },

  header: { marginBottom: 20 },
  headerTitle: { color: C.textPrimary, fontSize: 26, fontWeight: '700', marginBottom: 6 },
  headerSub: { color: C.textMuted, fontSize: 13, lineHeight: 19 },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(220,53,69,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(220,53,69,0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: C.redText, fontSize: 13, flex: 1 },

  summaryGrid: { gap: 12, marginBottom: 20 },
  summaryCard: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.borderCard,
    borderRadius: 14,
    padding: 16,
  },
  summaryHighlight: {
    borderColor: 'rgba(34,197,94,0.3)',
    backgroundColor: 'rgba(34,197,94,0.04)',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  cardLabel: { color: C.textMuted, fontSize: 11, letterSpacing: 0.6, marginBottom: 4 },
  cardValue: { color: C.textPrimary, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  cardSub: { color: C.textDim, fontSize: 12, lineHeight: 17 },

  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { color: C.textDim, fontSize: 11, marginTop: 6 },

  stripeBanner: { marginBottom: 20 },
  bannerContent: {
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    gap: 16,
  },
  bannerReady: {
    borderColor: 'rgba(34,197,94,0.25)',
    backgroundColor: 'rgba(34,197,94,0.03)',
  },
  bannerInfo: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  bannerTextWrap: { flex: 1 },
  bannerTitle: { color: C.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 4 },
  bannerBody: { color: C.textMuted, fontSize: 13, lineHeight: 19 },

  stripeActions: { gap: 10 },
  stripeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 48, // 48dp minimum touch target
  },
  payoutBtn: { backgroundColor: C.green },
  btnDisabled: { opacity: 0.6 },
  stripeBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  secondaryBtnText: { color: C.textMuted, fontSize: 13 },

  payoutMessage: { marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1 },
  payoutSuccess: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.3)',
  },
  payoutError: {
    backgroundColor: 'rgba(220,53,69,0.12)',
    borderColor: 'rgba(220,53,69,0.3)',
  },
  payoutMessageText: { fontSize: 13, fontWeight: '500' },

  tabsScroll: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', marginBottom: 16 },
  tabs: { gap: 4 },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    minHeight: 48,
    justifyContent: 'center',
  },
  tabText: { color: C.textDim, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: C.textPrimary },

  tabPanel: { gap: 16 },
  card: {
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.borderCard,
    borderRadius: 14,
    padding: 18,
  },
  cardHeading: { color: C.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 16 },

  levelBreakdown: { gap: 10 },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 8,
  },
  levelLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  levelDot: { width: 10, height: 10, borderRadius: 5 },
  levelName: { color: C.textSecondary, fontSize: 12, fontWeight: '500', flex: 1 },
  levelPct: {
    color: C.textMuted,
    fontSize: 11,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  levelAmount: { color: C.greenText, fontWeight: '700', fontSize: 13 },

  miniChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 120 },
  chartBarWrap: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  chartBar: { width: '100%', minHeight: 4, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  emptyChart: { paddingVertical: 32, alignItems: 'center' },
  emptyChartText: { color: C.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },

  splitItems: { gap: 16 },
  splitItem: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  splitDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  splitInfo: { flex: 1 },
  splitTitle: { color: C.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 3 },
  splitBody: { color: C.textMuted, fontSize: 12, lineHeight: 18 },

  referralItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.borderCard,
    borderRadius: 12,
    padding: 14,
  },
  referralPhoto: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  referralInfo: { flex: 1, gap: 2 },
  referralName: { color: C.textPrimary, fontWeight: '600', fontSize: 14 },
  referralViews: { color: C.textMuted, fontSize: 12 },
  referralEarnings: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  referralAmount: { color: C.greenText, fontWeight: '700', fontSize: 14 },

  loadMoreBtn: {
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  loadMoreText: { color: C.textMuted, fontSize: 13, fontWeight: '500' },

  setupPrompt: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderRadius: 14,
    gap: 12,
  },

  payoutItem: {
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.borderCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    gap: 10,
  },
  payoutItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  payoutStatusDot: { width: 10, height: 10, borderRadius: 5 },
  payoutAmount: { color: C.textPrimary, fontWeight: '700', fontSize: 15 },
  payoutPeriod: { color: C.textMuted, fontSize: 12, marginTop: 2 },
  payoutItemRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  payoutStatusText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  payoutDate: { color: C.textDim, fontSize: 11 },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { color: C.textSecondary, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  emptyBody: {
    color: C.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 320,
  },

  howBar: { flexDirection: 'row', height: 36, borderRadius: 8, overflow: 'hidden', gap: 2 },
  howSegment: { alignItems: 'center', justifyContent: 'center' },
  howSegmentText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  howLegend: { marginTop: 12, gap: 6 },
  howLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  howLegendText: { color: C.textMuted, fontSize: 12 },
  howNote: { color: C.textMuted, fontSize: 12, lineHeight: 19, marginTop: 14 },

  chainVisual: { alignItems: 'center', gap: 4, paddingVertical: 12 },
  chainNode: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 200,
  },
  chainYou: { borderWidth: 2 },
  chainYouText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  chainNodeText: { color: C.textSecondary, fontWeight: '600', fontSize: 13 },
  chainTag: { color: C.greenText, fontSize: 11, marginTop: 2 },
  chainArrow: { color: C.textDim, fontSize: 12, paddingVertical: 2 },

  ruleRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  ruleArrow: { fontSize: 13 },
  ruleText: { color: C.textMuted, fontSize: 13, flex: 1, lineHeight: 19 },
});

export default EarningsScreen;