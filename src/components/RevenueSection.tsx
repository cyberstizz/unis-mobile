// src/components/RevenueSection.tsx
// Ported from web `revenueSection.jsx`.
//
// Three income streams (Sales / Referrals / Supporters) with expandable
// detail, plus the CashoutPanel. Money helpers preserved: sales come back as
// integer cents; the earnings summary returns decimal dollars (BigDecimal) —
// everything is normalised to cents internally so the UI formats one way.
//
// GET  /v1/artist-analytics/artist/{id}/sales-total
// POST /v1/stripe/payout        (via CashoutPanel onRequestPayout)
// POST /v1/stripe/onboard       (web redirects; mobile opens the URL)

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Linking,
} from 'react-native';
import {
  DollarSign,
  ShoppingBag,
  Share2,
  Heart,
  ChevronDown,
  TrendingUp,
  ArrowUpRight,
} from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';
import CashoutPanel, { PayoutHistoryItem } from './CashoutPanel';

// ---------------------------------------------------------------------------
// Money helpers (web parity)
// ---------------------------------------------------------------------------
const money = (cents: number) =>
  `$${(Number(cents || 0) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const toCents = (dollars: any) => Math.round(Number(dollars || 0) * 100);

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// A single labelled value row inside an expanded stream detail.
// ---------------------------------------------------------------------------
const DetailRow: React.FC<{
  label: string;
  sub?: string;
  value: string;
  accent?: boolean;
}> = ({ label, sub, value, accent = false }) => (
  <View style={[styles.detailRow, accent && styles.detailRowAccent]}>
    <View style={styles.detailLabel}>
      <Text style={styles.detailLabelText}>{label}</Text>
      {!!sub && <Text style={styles.detailSub}>{sub}</Text>}
    </View>
    <Text style={[styles.detailValue, accent && styles.detailValueAccent]}>{value}</Text>
  </View>
);

type StreamKey = 'sales' | 'referrals' | 'supporters';

interface RevenueSectionProps {
  artistId?: string;
  artistPhoto?: string | null;         // ★ ambient backdrop (already a built URL)
  earningsSummary?: any;               // /v1/earnings/my-summary payload
  stripeStatus?: any;
  payoutHistory?: any[];
  isStripeReady?: boolean;
  onPayoutSuccess?: () => void;        // refresh parent stats after a payout
}

const RevenueSection: React.FC<RevenueSectionProps> = ({
  artistId,
  artistPhoto,
  earningsSummary,
  stripeStatus,
  payoutHistory = [],
  isStripeReady = false,
  onPayoutSuccess,
}) => {
  const [salesTotal, setSalesTotal] = useState<any>(null);
  const [salesLoading, setSalesLoading] = useState(true);
  const [openStream, setOpenStream] = useState<StreamKey | null>(null);

  // -- artist-level sales aggregate (per-song detail lives in SongSalesModal) --
  useEffect(() => {
    if (!artistId) return;
    let cancelled = false;
    setSalesLoading(true);
    axiosInstance.get(`/v1/artist-analytics/artist/${artistId}/sales-total`)
      .then((res) => { if (!cancelled) setSalesTotal(res.data || null); })
      .catch(() => { if (!cancelled) setSalesTotal(null); })
      .finally(() => { if (!cancelled) setSalesLoading(false); });
    return () => { cancelled = true; };
  }, [artistId]);

  // -- cashout handlers (web parity; Stripe onboarding opens in the browser) --
  const handleRequestPayout = useCallback(async () => {
    const res = await axiosInstance.post('/v1/stripe/payout');
    if (res.data?.success) onPayoutSuccess?.();
  }, [onPayoutSuccess]);

  const handleConnectStripe = useCallback(async () => {
    const res = await axiosInstance.post('/v1/stripe/onboard');
    // Web: window.location.href = url. Mobile: open in the system browser —
    // Stripe Connect onboarding completes on the web and status syncs via
    // /v1/stripe/status on the next dashboard load.
    if (res.data?.url) Linking.openURL(res.data.url).catch(() => {});
  }, []);

  // -- derive the three streams (all in cents) --
  const copies = Number(salesTotal?.copies || 0);
  const salesGrossCents = Number(salesTotal?.grossCents || 0);
  const salesNetCents = Number(salesTotal?.netCents || 0);

  const ref = earningsSummary?.referralEarnings || {};
  const referralCents = toCents(ref.lifetime);
  const referralMonthCents = toCents(ref.thisMonth);
  const l1 = ref.level1 || {};
  const l2 = ref.level2 || {};
  const l3 = ref.level3 || {};
  const referralCount = Number(earningsSummary?.referralCount || 0);
  const referralViews = Number(earningsSummary?.referralViewsThisMonth || 0);

  const sup = earningsSummary?.supporterEarnings || {};
  const supporterCents = toCents(sup.lifetime);
  const supporterMonthCents = toCents(sup.thisMonth);
  const supporterCount = Number(earningsSummary?.supporterCount || 0);

  const balanceCents = toCents(earningsSummary?.currentBalance);
  const minimumPayoutCents = toCents(earningsSummary?.payoutThreshold) || 5000;

  const streams: {
    key: StreamKey;
    label: string;
    Icon: any;
    amount: number;
    loading: boolean;
    sub: string;
  }[] = [
    {
      key: 'sales',
      label: 'Sales',
      Icon: ShoppingBag,
      amount: salesNetCents,
      loading: salesLoading,
      sub: copies > 0 ? plural(copies, 'copy sold', 'copies sold') : 'No sales yet',
    },
    {
      key: 'referrals',
      label: 'Referrals',
      Icon: Share2,
      amount: referralCents,
      loading: false,
      sub: plural(referralCount, 'referral', 'referrals'),
    },
    {
      key: 'supporters',
      label: 'Supporters',
      Icon: Heart,
      amount: supporterCents,
      loading: false,
      sub: plural(supporterCount, 'supporter', 'supporters'),
    },
  ];

  const toggle = (key: StreamKey) => setOpenStream((cur) => (cur === key ? null : key));

  const inner = (
    <View style={styles.inner}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.eyebrow}>Revenue</Text>
          <Text style={styles.title}>Earnings & cashout</Text>
        </View>
        <View style={[styles.statusPill, isStripeReady && styles.statusPillReady]}>
          <DollarSign size={13} color={isStripeReady ? '#22c55e' : '#ffb13c'} />
          <Text style={[styles.statusText, isStripeReady && styles.statusTextReady]}>
            {isStripeReady ? 'Payout ready' : 'Setup needed'}
          </Text>
        </View>
      </View>

      <Text style={styles.intro}>
        Your three income streams at a glance. Tap any one to see how it breaks down.
      </Text>

      {/* ── the three top-level streams ── */}
      <View style={styles.streams}>
        {streams.map(({ key, label, Icon, amount, sub, loading }) => {
          const isOpen = openStream === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.stream, isOpen && styles.streamOpen]}
              onPress={() => toggle(key)}
              accessibilityState={{ expanded: isOpen }}
            >
              <View style={styles.streamTop}>
                <View style={styles.streamIcon}>
                  <Icon size={17} color="#4a9eff" />
                </View>
                <View style={isOpen ? styles.chevOpen : undefined}>
                  <ChevronDown size={16} color="#AAAAAA" />
                </View>
              </View>
              <Text style={styles.streamLabel}>{label}</Text>
              {loading ? (
                <View style={styles.streamSkeleton} />
              ) : (
                <Text style={styles.streamAmount}>{money(amount)}</Text>
              )}
              <Text style={styles.streamSub} numberOfLines={1}>{sub}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── expanded detail for the open stream ── */}
      {openStream === 'sales' && (
        <View style={styles.detail}>
          <DetailRow label="Copies sold" value={copies.toLocaleString()} />
          <DetailRow label="Gross sales" sub="Before platform fee" value={money(salesGrossCents)} />
          <DetailRow label="Your cut" sub="Net to you" value={money(salesNetCents)} accent />
          <View style={styles.note}>
            <TrendingUp size={13} color="#888888" />
            <Text style={styles.noteText}>
              Open any track in your catalog for its day-by-day sales trend.
            </Text>
          </View>
        </View>
      )}

      {openStream === 'referrals' && (
        <View style={styles.detail}>
          <DetailRow
            label="Tier 1 · direct"
            sub="10% of referred ad revenue"
            value={money(toCents(l1.lifetime))}
          />
          <DetailRow label="Tier 2" sub="5% of their referrals" value={money(toCents(l2.lifetime))} />
          <DetailRow label="Tier 3" sub="2%, one level deeper" value={money(toCents(l3.lifetime))} />
          <DetailRow label="This month" value={money(referralMonthCents)} accent />
          <View style={styles.note}>
            <ArrowUpRight size={13} color="#888888" />
            <Text style={styles.noteText}>
              {plural(referralCount, 'person in your network', 'people in your network')}
              {referralViews > 0 ? ` · ${referralViews.toLocaleString()} ad-views this month` : ''}
            </Text>
          </View>
        </View>
      )}

      {openStream === 'supporters' && (
        <View style={styles.detail}>
          <DetailRow label="Lifetime" value={money(supporterCents)} />
          <DetailRow label="This month" value={money(supporterMonthCents)} accent />
          <DetailRow label="Backed by" value={plural(supporterCount, 'supporter', 'supporters')} />
          <View style={styles.note}>
            <Heart size={13} color="#888888" />
            <Text style={styles.noteText}>
              You earn 15% of the ad revenue from listeners who name you as their artist.
            </Text>
          </View>
        </View>
      )}

      {/* ── balance + cashout ── */}
      <View style={styles.cashout}>
        <CashoutPanel
          balance={balanceCents}
          pendingBalance={0}
          minimumPayout={minimumPayoutCents}
          stripeConnected={isStripeReady}
          onRequestPayout={handleRequestPayout}
          onConnectStripe={handleConnectStripe}
          payoutHistory={((payoutHistory || []) as any[]).map((p: any): PayoutHistoryItem => ({
            id: p.payoutId,
            amount: Math.round(parseFloat(p.amount || 0) * 100),
            status: p.status || 'pending',
            date: p.createdAt,
          }))}
        />
      </View>
    </View>
  );

  // ★ ambient: blurred profile image, same recipe as the collapsibles
  if (artistPhoto) {
    return (
      <View style={styles.section}>
        <ImageBackground
          source={{ uri: artistPhoto }}
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
    marginBottom: 6,
  },
  headText: {
    flex: 1,
    paddingRight: 10,
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
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 177, 60, 0.1)',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  statusPillReady: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  statusText: {
    color: '#ffb13c',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  statusTextReady: {
    color: '#22c55e',
  },
  intro: {
    color: '#AAAAAA',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  streams: {
    flexDirection: 'row',
  },
  stream: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'transparent',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginRight: 8,
  },
  streamOpen: {
    borderColor: 'rgba(74, 158, 255, 0.5)',
    backgroundColor: 'rgba(74, 158, 255, 0.06)',
  },
  streamTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  streamIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(74, 158, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevOpen: {
    transform: [{ rotate: '180deg' }],
  },
  streamLabel: {
    color: '#AAAAAA',
    fontSize: 11,
    fontWeight: '600',
  },
  streamAmount: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  streamSkeleton: {
    height: 18,
    width: 60,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: 3,
  },
  streamSub: {
    color: '#888888',
    fontSize: 10,
    marginTop: 2,
  },
  detail: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomWidth: 1,
  },
  detailRowAccent: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    flex: 1,
    paddingRight: 10,
  },
  detailLabelText: {
    color: '#CCCCCC',
    fontSize: 13,
  },
  detailSub: {
    color: '#777777',
    fontSize: 11,
    marginTop: 1,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  detailValueAccent: {
    color: '#4a9eff',
    fontSize: 16,
    fontWeight: '900',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  noteText: {
    color: '#888888',
    fontSize: 12,
    marginLeft: 6,
    flex: 1,
  },
  cashout: {
    marginTop: 16,
  },
});

export default RevenueSection;