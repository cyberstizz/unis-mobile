// src/screens/EarningsScreen.tsx
// Full port of web Earnings.jsx — summary cards, Stripe Connect,
// tabs (Overview, Referrals, Payouts, How It Works), charts, referral chain

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Image,
  Linking,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 768;

// ─── Design tokens ───
const C = {
  bgBase: '#0a0a0c',
  bgCard: 'rgba(255,255,255,0.03)',
  borderCard: 'rgba(255,255,255,0.06)',
  borderHover: 'rgba(255,255,255,0.12)',
  textPrimary: '#ffffff',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  textDim: '#4b5563',
  unisBlue: '#163387',
  unisBlueHover: '#1e44a8',
  green: '#22c55e',
  greenDim: 'rgba(34,197,94,0.12)',
  greenBorder: 'rgba(34,197,94,0.3)',
  blue: '#3b82f6',
  blueDim: 'rgba(59,130,246,0.15)',
  purple: '#a855f7',
  purpleDim: 'rgba(168,85,247,0.15)',
  gold: '#f59e0b',
  goldDim: 'rgba(245,158,11,0.15)',
  red: '#ef4444',
  redDim: 'rgba(220,53,69,0.12)',
  cyan: '#06b6d4',
};

const EarningsScreen: React.FC = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<any>(null);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [stripeStatus, setStripeStatus] = useState<any>(null);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [stripeLoading, setStripeLoading] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState('');

  const isArtist = user?.role === 'artist' || user?.isArtist;

  const fetchAllData = useCallback(async () => {
    if (!user?.userId) return;
    setError('');
    try {
      const [summaryRes, referralsRes, historyRes, stripeRes, payoutsRes] = await Promise.allSettled([
        axiosInstance.get('/v1/earnings/my-summary'),
        axiosInstance.get('/v1/earnings/my-referrals'),
        axiosInstance.get('/v1/earnings/my-history?days=30'),
        axiosInstance.get('/v1/stripe/status'),
        axiosInstance.get('/v1/stripe/payouts'),
      ]);
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value.data);
      if (referralsRes.status === 'fulfilled') setReferrals(referralsRes.value.data || []);
      if (historyRes.status === 'fulfilled') setHistory(historyRes.value.data || []);
      if (stripeRes.status === 'fulfilled') setStripeStatus(stripeRes.value.data);
      if (payoutsRes.status === 'fulfilled') setPayouts(payoutsRes.value.data || []);
    } catch {
      setError('Failed to load earnings data.');
    }
  }, [user?.userId]);

  useEffect(() => {
    if (user?.userId) {
      setLoading(true);
      fetchAllData().finally(() => setLoading(false));
    }
  }, [user?.userId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
  };

  const formatMoney = (amount: any) => {
    if (amount === null || amount === undefined) return '$0.00';
    const num = typeof amount === 'number' ? amount : parseFloat(amount);
    if (isNaN(num)) return '$0.00';
    return `$${num.toFixed(num < 0.01 && num > 0 ? 6 : num < 1 && num > 0 ? 4 : 2)}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // ── Stripe actions ──
  const handleStartOnboarding = async () => {
    setStripeLoading(true);
    try {
      const res = await axiosInstance.post('/v1/stripe/onboard');
      if (res.data?.url) Linking.openURL(res.data.url);
    } catch { setError('Failed to start Stripe setup.'); }
    finally { setStripeLoading(false); }
  };

  const handleRequestPayout = async () => {
    setPayoutLoading(true);
    setPayoutMessage('');
    try {
      const res = await axiosInstance.post('/v1/stripe/payout');
      if (res.data?.success) {
        setPayoutMessage(`Payout of ${formatMoney(res.data.amount)} initiated successfully!`);
        fetchAllData();
      }
    } catch (err: any) {
      setPayoutMessage(err.response?.data?.error || 'Payout request failed.');
    } finally { setPayoutLoading(false); }
  };

  const handleOpenStripeDashboard = async () => {
    try {
      const res = await axiosInstance.get('/v1/stripe/dashboard-link');
      if (res.data?.url) Linking.openURL(res.data.url);
    } catch { setError('Failed to open Stripe dashboard.'); }
  };

  const stripeReady = stripeStatus?.onboardingComplete && stripeStatus?.payoutsEnabled;
  const availableBalance = parseFloat(summary?.currentBalance || 0);
  const payoutProgress = summary
    ? Math.min(100, (parseFloat(summary.currentBalance) / parseFloat(summary.payoutThreshold)) * 100)
    : 0;

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="large" color={C.unisBlue} />
        <Text style={s.loadingText}>Loading your earnings...</Text>
      </View>
    );
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'referrals', label: `Referrals (${referrals.length})` },
    { key: 'payouts', label: `Payouts (${payouts.length})` },
    { key: 'how', label: 'How It Works' },
  ];

  return (
    <View style={s.container}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.unisBlue} />}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>Earnings</Text>
            <Text style={s.headerSub}>Track your revenue from referrals{isArtist ? ', supporters,' : ''} and community engagement.</Text>
          </View>
        </View>

        {error ? <View style={s.errorBanner}><Text style={s.errorText}>{error}</Text></View> : null}

        {/* ── Summary Cards ── */}
        <View style={s.summaryGrid}>
          <View style={[s.summaryCard, s.summaryHighlight]}>
            <View style={[s.iconWrap, { backgroundColor: 'rgba(34,197,94,0.15)' }]}>
              <Text style={[s.iconText, { color: C.green }]}>$</Text>
            </View>
            <View style={s.cardBody}>
              <Text style={s.cardLabel}>Current Balance</Text>
              <Text style={s.cardValue}>{formatMoney(summary?.currentBalance)}</Text>
              <Text style={s.cardSub}>This month: {formatMoney(summary?.totalEarnings?.thisMonth)}</Text>
            </View>
          </View>

          <View style={s.summaryCard}>
            <View style={[s.iconWrap, { backgroundColor: C.blueDim }]}>
              <Text style={[s.iconText, { color: C.blue }]}>👥</Text>
            </View>
            <View style={s.cardBody}>
              <Text style={s.cardLabel}>Referral Earnings</Text>
              <Text style={s.cardValue}>{formatMoney(summary?.referralEarnings?.lifetime)}</Text>
              <Text style={s.cardSub}>{summary?.referralCount || 0} referrals</Text>
            </View>
          </View>

          {isArtist && (
            <View style={s.summaryCard}>
              <View style={[s.iconWrap, { backgroundColor: C.purpleDim }]}>
                <Text style={[s.iconText, { color: C.purple }]}>📈</Text>
              </View>
              <View style={s.cardBody}>
                <Text style={s.cardLabel}>Supporter Earnings</Text>
                <Text style={s.cardValue}>{formatMoney(summary?.supporterEarnings?.lifetime)}</Text>
                <Text style={s.cardSub}>{summary?.supporterCount || 0} supporters</Text>
              </View>
            </View>
          )}

          <View style={s.summaryCard}>
            <View style={[s.iconWrap, { backgroundColor: C.goldDim }]}>
              <Text style={[s.iconText, { color: C.gold }]}>{summary?.payoutReady ? '✓' : '⏱'}</Text>
            </View>
            <View style={s.cardBody}>
              <Text style={s.cardLabel}>Payout Status</Text>
              <Text style={s.cardValue}>{summary?.payoutReady ? 'Ready!' : 'Building...'}</Text>
              <View style={s.progressBar}>
                <View style={[s.progressFill, { width: `${payoutProgress}%` }]} />
              </View>
              <Text style={s.progressText}>{formatMoney(summary?.currentBalance)} / {formatMoney(summary?.payoutThreshold)}</Text>
            </View>
          </View>
        </View>

        {/* ── Stripe Banner ── */}
        <View style={[s.stripeBanner, stripeReady && s.stripeBannerReady]}>
          {!stripeStatus?.hasAccount ? (
            <>
              <Text style={s.stripeTitle}>Set Up Payouts</Text>
              <Text style={s.stripeDesc}>Connect your bank account through Stripe to receive earnings.</Text>
              <TouchableOpacity style={s.stripeBtn} onPress={handleStartOnboarding} disabled={stripeLoading}>
                <Text style={s.stripeBtnText}>{stripeLoading ? 'Setting up...' : 'Get Started'}</Text>
              </TouchableOpacity>
            </>
          ) : !stripeReady ? (
            <>
              <Text style={s.stripeTitle}>Complete Your Setup</Text>
              <Text style={s.stripeDesc}>Your Stripe account is created but incomplete.</Text>
              <TouchableOpacity style={s.stripeBtn} onPress={handleStartOnboarding} disabled={stripeLoading}>
                <Text style={s.stripeBtnText}>{stripeLoading ? 'Loading...' : 'Continue Setup'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.stripeTitle}>Payouts Enabled ✓</Text>
              <Text style={s.stripeDesc}>Your bank account is connected. Earnings above $50 can be withdrawn.</Text>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                {availableBalance >= 50 && (
                  <TouchableOpacity style={[s.stripeBtn, { backgroundColor: C.green }]} onPress={handleRequestPayout} disabled={payoutLoading}>
                    <Text style={s.stripeBtnText}>{payoutLoading ? 'Processing...' : `Withdraw ${formatMoney(availableBalance)}`}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={s.stripeBtnSecondary} onPress={handleOpenStripeDashboard}>
                  <Text style={s.stripeBtnSecondaryText}>Stripe Dashboard</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
          {payoutMessage ? (
            <Text style={[s.payoutMsg, payoutMessage.includes('success') ? s.payoutMsgSuccess : s.payoutMsgError]}>{payoutMessage}</Text>
          ) : null}
        </View>

        {/* ── Tabs ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabRow} contentContainerStyle={s.tabRowContent}>
          {tabs.map(t => (
            <TouchableOpacity key={t.key} style={[s.tab, activeTab === t.key && s.tabActive]} onPress={() => setActiveTab(t.key)}>
              <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Tab Content ── */}
        {activeTab === 'overview' && (
          <View style={s.tabContent}>
            {/* Referral levels */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Referral Earnings by Level</Text>
              {[
                { name: 'Level 1 — Direct', pct: '10%', color: C.blue, amount: summary?.referralEarnings?.level1?.lifetime },
                { name: 'Level 2 — 2nd Degree', pct: '5%', color: C.purple, amount: summary?.referralEarnings?.level2?.lifetime },
                { name: 'Level 3 — 3rd Degree', pct: '2%', color: C.cyan, amount: summary?.referralEarnings?.level3?.lifetime },
              ].map((level, i) => (
                <View key={i} style={s.levelRow}>
                  <View style={s.levelLeft}>
                    <View style={[s.levelDot, { backgroundColor: level.color }]} />
                    <Text style={s.levelName}>{level.name}</Text>
                    <View style={s.levelPctBadge}><Text style={s.levelPctText}>{level.pct}</Text></View>
                  </View>
                  <Text style={s.levelAmount}>{formatMoney(level.amount)}</Text>
                </View>
              ))}
            </View>

            {/* Revenue streams */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Your Revenue Streams</Text>
              {[
                { color: C.blue, title: 'Referral Income (up to 17%)', desc: 'Level 1: 10%, Level 2: 5%, Level 3: 2%. Lifetime passive income.' },
                ...(isArtist ? [{ color: C.purple, title: 'Supporter Income (15%)', desc: 'Users who support you contribute 15% of their ad revenue.' }] : []),
                { color: C.gold, title: 'Audio Ad Revenue (Coming Soon)', desc: 'Pre-roll ads on songs. Artists earn 60% of net revenue.' },
              ].map((stream, i) => (
                <View key={i} style={s.streamRow}>
                  <View style={[s.streamDot, { backgroundColor: stream.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.streamTitle}>{stream.title}</Text>
                    <Text style={s.streamDesc}>{stream.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {activeTab === 'referrals' && (
          <View style={s.tabContent}>
            {referrals.length > 0 ? referrals.map((ref, i) => (
              <View key={ref.userId || i} style={s.referralItem}>
                <Image source={{ uri: getMediaUrl(ref.photoUrl) || 'https://picsum.photos/80' }} style={s.referralPhoto} />
                <View style={{ flex: 1 }}>
                  <Text style={s.referralName}>{ref.username}</Text>
                  <Text style={s.referralViews}>{ref.adViews || 0} ad views</Text>
                </View>
                <Text style={s.referralAmount}>{formatMoney(ref.earnings)}</Text>
              </View>
            )) : (
              <View style={s.emptyState}>
                <Text style={s.emptyTitle}>No Referrals Yet</Text>
                <Text style={s.emptyDesc}>Share your referral code to invite friends and earn passive income for life.</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'payouts' && (
          <View style={s.tabContent}>
            {!stripeReady && (
              <View style={s.emptyState}>
                <Text style={s.emptyTitle}>Set Up Stripe to Receive Payouts</Text>
                <Text style={s.emptyDesc}>Connect your bank account to withdraw earnings.</Text>
                <TouchableOpacity style={s.stripeBtn} onPress={handleStartOnboarding} disabled={stripeLoading}>
                  <Text style={s.stripeBtnText}>{stripeLoading ? 'Setting up...' : 'Set Up Now'}</Text>
                </TouchableOpacity>
              </View>
            )}
            {payouts.length > 0 ? payouts.map((p, i) => (
              <View key={p.payoutId || i} style={s.payoutItem}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <View style={[s.payoutDot, p.status === 'completed' && { backgroundColor: C.green }, p.status === 'processing' && { backgroundColor: C.gold }, p.status === 'failed' && { backgroundColor: C.red }]} />
                  <View>
                    <Text style={s.payoutAmount}>{formatMoney(p.amount)}</Text>
                    <Text style={s.payoutPeriod}>{formatDate(p.periodStart)} — {formatDate(p.periodEnd)}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.payoutStatus, p.status === 'completed' && { color: C.green }, p.status === 'failed' && { color: C.red }]}>{p.status}</Text>
                  <Text style={s.payoutDate}>{formatDate(p.createdAt)}</Text>
                </View>
              </View>
            )) : stripeReady ? (
              <View style={s.emptyState}>
                <Text style={s.emptyTitle}>No Payouts Yet</Text>
                <Text style={s.emptyDesc}>Once your balance reaches $50, you can request a withdrawal.</Text>
              </View>
            ) : null}
          </View>
        )}

        {activeTab === 'how' && (
          <View style={s.tabContent}>
            {/* Revenue split visual */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Display Ad Revenue Split</Text>
              <View style={s.splitBar}>
                {[
                  { w: '68%', bg: C.unisBlue, label: 'Unis 68%' },
                  { w: '15%', bg: C.purple, label: 'Artist 15%' },
                  { w: '10%', bg: C.blue, label: 'L1 10%' },
                  { w: '5%', bg: '#8b5cf6', label: 'L2' },
                  { w: '2%', bg: C.cyan, label: '' },
                ].map((seg, i) => (
                  <View key={i} style={[s.splitSeg, { width: seg.w, backgroundColor: seg.bg }]}>
                    <Text style={s.splitSegText}>{seg.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.howNote}>Every ad view is tracked and attributed. If any referral level doesn't exist, that share goes to Unis.</Text>
            </View>

            {/* Referral chain */}
            <View style={s.card}>
              <Text style={s.cardTitle}>3-Level Referral Chain</Text>
              <View style={s.chain}>
                <View style={[s.chainNode, s.chainYou]}><Text style={s.chainNodeText}>YOU</Text></View>
                <Text style={s.chainArrow}>↓ refers</Text>
                <View style={[s.chainNode, s.chainL1]}><Text style={s.chainNodeText}>User A</Text><Text style={s.chainTag}>You earn 10%</Text></View>
                <Text style={s.chainArrow}>↓ refers</Text>
                <View style={[s.chainNode, s.chainL2]}><Text style={s.chainNodeText}>User B</Text><Text style={s.chainTag}>You earn 5%</Text></View>
                <Text style={s.chainArrow}>↓ refers</Text>
                <View style={[s.chainNode, s.chainL3]}><Text style={s.chainNodeText}>User C</Text><Text style={s.chainTag}>You earn 2%</Text></View>
              </View>
              <Text style={s.howNote}>When anyone in your 3-level chain browses Unis and sees ads, you earn. This is lifetime passive income.</Text>
            </View>

            {/* Payout rules */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Payout Rules</Text>
              {['Minimum payout: $50.00', 'Payout frequency: Monthly', 'Earnings under $50 roll over', 'Payment via Stripe Connect', '1099-NEC for US users earning $600+/year'].map((rule, i) => (
                <View key={i} style={s.ruleRow}>
                  <Text style={s.ruleArrow}>→</Text>
                  <Text style={s.ruleText}>{rule}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bgBase },
  scroll: { flex: 1 },
  scrollContent: { padding: IS_MOBILE ? 16 : 24, maxWidth: 900, alignSelf: 'center', width: '100%' },
  loadingWrap: { flex: 1, backgroundColor: C.bgBase, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: C.textSecondary, marginTop: 16, fontSize: 15 },

  header: { marginBottom: 24 },
  headerTitle: { color: C.textPrimary, fontSize: 28, fontWeight: '700', marginBottom: 4 },
  headerSub: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },

  errorBanner: { backgroundColor: C.redDim, borderWidth: 1, borderColor: 'rgba(220,53,69,0.3)', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText: { color: '#ff6b7a', fontSize: 13 },

  // Summary
  summaryGrid: { gap: 12, marginBottom: 24 },
  summaryCard: { backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.borderCard, borderRadius: 14, padding: 18, flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  summaryHighlight: { borderColor: C.greenBorder, backgroundColor: 'rgba(34,197,94,0.04)' },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 20, fontWeight: '700' },
  cardBody: { flex: 1 },
  cardLabel: { color: C.textSecondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  cardValue: { color: C.textPrimary, fontSize: 24, fontWeight: '700', marginBottom: 2 },
  cardSub: { color: C.textMuted, fontSize: 12 },
  progressBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginTop: 8 },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: C.unisBlue },
  progressText: { color: C.textMuted, fontSize: 11, marginTop: 4 },

  // Stripe
  stripeBanner: { backgroundColor: C.bgCard, borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)', borderRadius: 14, padding: 20, marginBottom: 24 },
  stripeBannerReady: { borderColor: C.greenBorder, backgroundColor: 'rgba(34,197,94,0.03)' },
  stripeTitle: { color: C.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  stripeDesc: { color: C.textMuted, fontSize: 13, lineHeight: 20, marginBottom: 14 },
  stripeBtn: { backgroundColor: C.unisBlue, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, alignSelf: 'flex-start' },
  stripeBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  stripeBtnSecondary: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  stripeBtnSecondaryText: { color: C.textSecondary, fontSize: 13 },
  payoutMsg: { marginTop: 12, padding: 12, borderRadius: 10, fontSize: 13, fontWeight: '500' },
  payoutMsgSuccess: { backgroundColor: C.greenDim, color: C.green },
  payoutMsgError: { backgroundColor: C.redDim, color: '#ff6b7a' },

  // Tabs
  tabRow: { marginBottom: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  tabRowContent: { gap: 4 },
  tab: { paddingVertical: 12, paddingHorizontal: 18, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: C.unisBlue },
  tabText: { color: C.textMuted, fontSize: 14, fontWeight: '500' },
  tabTextActive: { color: C.textPrimary },
  tabContent: { gap: 16 },

  // Cards
  card: { backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.borderCard, borderRadius: 14, padding: 20 },
  cardTitle: { color: C.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 16 },

  // Levels
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12, marginBottom: 8 },
  levelLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  levelDot: { width: 10, height: 10, borderRadius: 5 },
  levelName: { color: '#d1d5db', fontSize: 13, fontWeight: '500', flex: 1 },
  levelPctBadge: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  levelPctText: { color: C.textMuted, fontSize: 11 },
  levelAmount: { color: C.green, fontWeight: '700', fontSize: 14 },

  // Streams
  streamRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 14 },
  streamDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  streamTitle: { color: '#d1d5db', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  streamDesc: { color: C.textMuted, fontSize: 12, lineHeight: 18 },

  // Referrals
  referralItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.borderCard, borderRadius: 12, padding: 14 },
  referralPhoto: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  referralName: { color: C.textPrimary, fontWeight: '600', fontSize: 14 },
  referralViews: { color: C.textMuted, fontSize: 12 },
  referralAmount: { color: C.green, fontWeight: '700', fontSize: 14 },

  // Payouts
  payoutItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.borderCard, borderRadius: 12, padding: 16, marginBottom: 8 },
  payoutDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.textMuted },
  payoutAmount: { color: C.textPrimary, fontWeight: '700', fontSize: 15 },
  payoutPeriod: { color: C.textMuted, fontSize: 11 },
  payoutStatus: { color: C.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  payoutDate: { color: C.textDim, fontSize: 11 },

  // How
  splitBar: { flexDirection: 'row', height: 32, borderRadius: 8, overflow: 'hidden', gap: 2, marginBottom: 12 },
  splitSeg: { justifyContent: 'center', alignItems: 'center' },
  splitSegText: { color: '#fff', fontSize: 9, fontWeight: '600' },
  howNote: { color: C.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  chain: { alignItems: 'center', gap: 4, paddingVertical: 16 },
  chainNode: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center', width: '80%', maxWidth: 240 },
  chainNodeText: { color: '#d1d5db', fontWeight: '600', fontSize: 14 },
  chainYou: { backgroundColor: 'rgba(22,51,135,0.3)', borderWidth: 2, borderColor: C.unisBlue },
  chainL1: { backgroundColor: 'rgba(59,130,246,0.12)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)' },
  chainL2: { backgroundColor: 'rgba(139,92,246,0.12)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  chainL3: { backgroundColor: 'rgba(6,182,212,0.12)', borderWidth: 1, borderColor: 'rgba(6,182,212,0.3)' },
  chainTag: { color: C.green, fontSize: 11, marginTop: 2 },
  chainArrow: { color: C.textDim, fontSize: 13 },
  ruleRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  ruleArrow: { color: C.unisBlue, fontSize: 14 },
  ruleText: { color: C.textSecondary, fontSize: 13, flex: 1 },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { color: C.textSecondary, fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptyDesc: { color: C.textMuted, fontSize: 13, textAlign: 'center', maxWidth: 320, lineHeight: 20 },
});

export default EarningsScreen;