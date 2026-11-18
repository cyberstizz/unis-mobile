// src/screens/PlusScreen.tsx
// ─────────────────────────────────────────────────────────────
// Unis Plus — mobile port of web src/PlusPage.jsx.
//
// The ad-free plan: $4.99 a month through Stripe's hosted checkout. Half of
// each payment goes first to the member's supported artist; of the rest after
// Stripe's fees, half goes to the artists they played and half joins the
// Community Share. The page is built around the supported artist (photo in
// the hero, named in the headline and the split table, what the plan has
// credited them so far). With no supported artist it offers the picker.
//
// Checkout and Manage plan open Stripe in the browser (the same hosted pages
// web uses — no card details in the app). When you come back to the app the
// screen re-checks your plan a few times until Stripe's webhook turns Plus on.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import axiosInstance from '../services/axiosInstance';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';
import { refreshPlusStatus, DEFAULT_PLUS_STATUS, PlusStatus } from '../utils/plusStatus';
import { buildUrl } from '../utils/buildUrl';
import { useUnisTheme, rgba } from '../theme/unisTheme';
import { webUrl } from '../config/links';
import PlusMark from '../components/PlusMark';
import SupportedArtistPicker from '../components/SupportedArtistPicker';

const POLL_MS = 2500;
const POLL_TRIES = 12;

const isSafeStripeUrl = (raw: any) => {
  try {
    const m = String(raw).match(/^https:\/\/([^/]+)/i);
    if (!m) return false;
    const host = m[1].toLowerCase();
    return host === 'stripe.com' || host.endsWith('.stripe.com');
  } catch {
    return false;
  }
};

const dollars = (cents: any) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

/** Mirrors CommunityShareService (plusSupportedPart / plusPlayedPart). On $4.99: fees 49¢, supported $2.50, played $1.00, pot $1.00. */
export const plusSplit = (cents: any) => {
  const price = Math.max(0, Math.round(Number(cents) || 0));
  const card = Math.ceil((price * 29) / 1000) + 30;
  const billing = Math.ceil((price * 7) / 1000);
  const fees = Math.min(price, card + billing);
  const net = price - fees;
  const supported = Math.max(0, Math.min(net, Math.round(price / 2)));
  const rest = Math.max(0, net - supported);
  const played = Math.floor(rest / 2);
  return { price, fees, net, supported, played, artists: supported + played, pot: rest - played };
};

const longDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

type SupportedArtist = { userId: string; name: string; photo: string | null; backdrop: string | null; area: string; genre: string; weekRank: number | null };

const useSupportedArtist = (artistId: string | null) => {
  const [artist, setArtist] = useState<SupportedArtist | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'failed'>(artistId ? 'loading' : 'idle');
  useEffect(() => {
    if (!artistId) { setArtist(null); setState('idle'); return undefined; }
    let cancelled = false;
    setState('loading');
    (async () => {
      try {
        const [profileRes, rankRes] = await Promise.all([
          axiosInstance.get(`/v1/users/profile/${artistId}`),
          axiosInstance.get(`/v1/users/${artistId}/territory-rank`).catch(() => null),
        ]);
        const p = profileRes?.data;
        if (!p?.username) throw new Error('No artist profile');
        const photo = buildUrl(p.photoUrl) || null;
        let artwork: string | null = null;
        if (!photo) {
          const songRes = await axiosInstance.get(`/v1/users/${artistId}/default-song`).catch(() => null);
          artwork = buildUrl(songRes?.data?.artworkUrl) || null;
        }
        const week = rankRes?.data?.periods?.week;
        const home = Array.isArray(week) ? week[0] : null;
        if (cancelled) return;
        setArtist({
          userId: artistId,
          name: p.username,
          photo,
          backdrop: photo || artwork,
          area: home?.jurisdictionName || p.jurisdiction?.name || '',
          genre: p.genre?.name || '',
          weekRank: home && home.overallRank != null ? home.overallRank : null,
        });
        setState('ready');
      } catch (err: any) {
        console.error('[Plus] load_artist failed', artistId, err?.response?.status, err?.message);
        if (!cancelled) { setArtist(null); setState('failed'); }
      }
    })();
    return () => { cancelled = true; };
  }, [artistId]);
  return { artist, state };
};

const Avatar: React.FC<{ artist: SupportedArtist | null; size?: number }> = ({ artist, size = 48 }) => {
  const t = useUnisTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }}>
      {artist?.photo ? <Image source={{ uri: artist.photo }} style={{ width: size, height: size }} /> : (
        <Text style={{ color: t.textAccent, fontWeight: '900', fontSize: size * 0.42 }}>{(artist?.name || '?').charAt(0).toUpperCase()}</Text>
      )}
    </View>
  );
};

const PlusScreen: React.FC = () => {
  const t = useUnisTheme();
  const navigation = useNavigation<any>();
  const feedback = useFeedback();
  const { user, refreshUser } = useAuth() as any;
  const [status, setStatus] = useState<PlusStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [picking, setPicking] = useState(false);
  const awaitingStripe = useRef<'checkout' | 'portal' | null>(null);

  const load = useCallback(() => refreshPlusStatus().then((s) => { setStatus(s); return s; }), []);
  useEffect(() => { load(); }, [load]);

  // Back in the app after Stripe: re-check until the webhook has turned Plus on.
  useEffect(() => {
    let timer: any = null;
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active' || !awaitingStripe.current) return;
      const kind = awaitingStripe.current;
      awaitingStripe.current = null;
      if (kind === 'portal') { load(); return; }
      setWaiting(true);
      let tries = 0;
      const tick = async () => {
        const s = await load();
        tries += 1;
        if (s.plus) {
          setWaiting(false);
          feedback.success('Unis Plus is on — no more ads, and your artist earns more');
          return;
        }
        if (tries >= POLL_TRIES) {
          setWaiting(false);
          return;
        }
        timer = setTimeout(tick, POLL_MS);
      };
      tick();
    });
    return () => { sub.remove(); clearTimeout(timer); };
  }, [load, feedback]);

  const go = async (path: string, fallback: string, kind: 'checkout' | 'portal') => {
    setBusy(true);
    setError('');
    try {
      const res = await axiosInstance.post(path);
      const url = res?.data?.url;
      if (!isSafeStripeUrl(url)) throw new Error('Not a Stripe address');
      awaitingStripe.current = kind;
      await Linking.openURL(url);
    } catch (err: any) {
      console.error('[Plus]', path, err?.response?.status, err?.message);
      setError(err?.response?.data?.error || fallback);
    } finally {
      setBusy(false);
    }
  };

  const s = status || DEFAULT_PLUS_STATUS;
  const price = s.priceCents || 499;
  const split = plusSplit(price);
  const loaded = status !== null;
  const hasPlan = Boolean(s.status) && s.status !== 'incomplete' && s.status !== 'incomplete_expired';
  const artistId: string | null = user?.supportedArtistId || s.supportedArtistId || null;
  const { artist, state: artistState } = useSupportedArtist(artistId);
  const withArtist = Boolean(artistId) && artistState !== 'failed';
  const name = artist?.name || 'your artist';
  const credited = s.supportedArtistId && s.supportedArtistId === artistId ? Number(s.creditedToSupportedCents || 0) : 0;
  const chipSub = artist ? [artist.area, artist.genre, artist.weekRank != null ? `#${artist.weekRank} this week` : ''].filter(Boolean).join(' · ') : '';

  const splitRows: { who: React.ReactNode; why?: string; amount: number; hi?: boolean }[] = [
    {
      who: artist ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Avatar artist={artist} size={24} /><Text style={styles.splitWho}>{artist.name}</Text></View>
      ) : <Text style={styles.splitWho}>The artist you support</Text>,
      why: 'half of what you pay',
      amount: split.supported,
      hi: true,
    },
    { who: <Text style={styles.splitWho}>Stripe (card and billing fees)</Text>, amount: split.fees },
    { who: <Text style={styles.splitWho}>Artists you play that month</Text>, why: 'half of the rest', amount: split.played, hi: true },
    { who: <Text style={styles.splitWho}>Unis{'’'}s part, into the Community Share</Text>, why: 'the other half', amount: split.pot },
  ];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {/* HERO */}
      <View style={[styles.hero, { borderColor: t.border }]}>
        {withArtist && !!artist?.backdrop && <Image source={{ uri: artist.backdrop }} style={styles.heroPhoto} blurRadius={6} />}
        <LinearGradient
          colors={[rgba(t.primaryDeep, withArtist ? 0.55 : 0.9), 'rgba(5,7,13,0.92)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroInner}>
          <View style={styles.brand}>
            <PlusMark height={34} />
            {loaded && s.plus && <Text style={[styles.chip, { backgroundColor: t.primary }]}>Member</Text>}
          </View>
          {withArtist ? (
            <>
              <Text style={styles.h1}>
                {s.plus ? 'You’re backing ' : 'Back '}
                <Text style={{ fontStyle: 'italic', color: t.textAccent }}>{name}</Text>
                {s.plus ? '' : ' every month.'}
              </Text>
              <Text style={styles.heroP}>
                {s.plus
                  ? `${dollars(split.supported)}, half of your ${dollars(price)}, reaches ${name} every month, whatever you play — and ${dollars(split.played)} goes to the artists you do play.`
                  : `${dollars(price)} a month, no ads — and half of it, ${dollars(split.supported)}, goes straight to ${name} every month, whatever you play.`}
              </Text>
              {artist ? (
                <Pressable style={styles.artistChip} onPress={() => navigation.navigate('Home', { screen: 'Artist', params: { artistId: artist.userId } })} accessibilityLabel={`${artist.name} — view their page`}>
                  <Avatar artist={artist} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.artistName}>{artist.name}</Text>
                    {!!chipSub && <Text style={styles.artistSub}>{chipSub}</Text>}
                  </View>
                  <Text style={styles.go}>›</Text>
                </Pressable>
              ) : (
                <View style={styles.artistChip}><ActivityIndicator color="#fff" /></View>
              )}
            </>
          ) : (
            <>
              <Text style={styles.h1}>No ads. Your money backs <Text style={{ fontStyle: 'italic', color: t.textAccent }}>the artists you play.</Text></Text>
              <Text style={styles.heroP}>
                {dollars(price)} a month. Half of it goes straight to the artist you support, whatever you play. Of the rest after Stripe{'’'}s fees, half goes to the artists you play and half to the Community Share.
              </Text>
              {user && artistState === 'idle' && (
                <Pressable style={styles.artistChip} onPress={() => setPicking(true)}>
                  <View style={[styles.plusAv, { borderColor: t.textAccent }]}><Text style={[styles.plusAvText, { color: t.textAccent }]}>+</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.artistName}>Pick an artist to support</Text>
                    <Text style={styles.artistSub}>They{'’'}d get {dollars(split.supported)} of every month, whatever you play</Text>
                  </View>
                  <Text style={styles.go}>›</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </View>

      {waiting && (
        <View style={[styles.note, { borderColor: t.border }]}>
          <ActivityIndicator color="#fff" size="small" />
          <Text style={styles.noteText}>Checking your plan… Plus can take a minute to turn on after payment.</Text>
        </View>
      )}
      {!!error && <View style={[styles.note, styles.noteBad]}><Text style={styles.noteText}>{error}</Text></View>}

      <View style={styles.card}>
        {!loaded ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : s.plus ? (
          <>
            <Text style={styles.h2}>You{'’'}re ad-free</Text>
            {s.status === 'past_due' ? (
              <Text style={styles.warn}>Your last payment didn{'’'}t go through. Stripe will try your card again over the next few days; update it in Manage plan to keep Plus.</Text>
            ) : s.cancelAtPeriodEnd ? (
              <Text style={styles.p}>Your plan is canceled. Plus stays on until {longDate(s.paidThrough)}, and you won{'’'}t be charged again.</Text>
            ) : (
              <Text style={styles.p}>Ads are gone on every device you sign in on. Your plan renews on {longDate(s.paidThrough)} for {dollars(price)}.</Text>
            )}
            {artist && credited > 0 && (
              <View style={styles.credited}>
                <Avatar artist={artist} size={32} />
                <Text style={[styles.creditedN, { color: t.textAccent }]}>{dollars(credited)}</Text>
                <Text style={styles.creditedL}>credited to {artist.name} from your plan so far</Text>
              </View>
            )}
            <Pressable style={styles.btnGhost} disabled={busy} onPress={() => go('/v1/plus/portal', 'Couldn’t open plan settings. Please try again.', 'portal')}>
              <Text style={styles.btnText}>{busy ? 'Opening…' : 'Manage plan'}</Text>
            </Pressable>
            <Text style={styles.muted}>Change your card, see receipts, or cancel. Stripe runs this page.</Text>
          </>
        ) : !s.available ? (
          <>
            <Text style={styles.h2}>Coming soon</Text>
            <Text style={styles.p}>Unis Plus isn{'’'}t on sale yet. Check back soon.</Text>
          </>
        ) : (
          <>
            <Text style={styles.h2}>Go ad-free</Text>
            {[
              'No ads anywhere on Unis, on every device you sign in on.',
              `${dollars(split.supported)} of every month goes to ${withArtist ? name : 'the artist you support'}, whatever you play, and ${dollars(split.played)} to the artists you play.`,
              'Cancel any time. Plus stays on until the end of the month you paid for.',
            ].map((li) => (
              <View key={li} style={styles.li}><Text style={[styles.check, { color: t.textAccent }]}>✓</Text><Text style={styles.liText}>{li}</Text></View>
            ))}
            <Pressable style={[styles.btn, { backgroundColor: t.primary }]} disabled={busy} onPress={() => go('/v1/plus/checkout', 'Checkout couldn’t start. Please try again.', 'checkout')}>
              <Text style={styles.btnText}>{busy ? 'Opening checkout…' : `Get Unis Plus · ${dollars(price)}/month`}</Text>
            </Pressable>
            {hasPlan && (
              <Pressable onPress={() => go('/v1/plus/portal', 'Couldn’t open plan settings. Please try again.', 'portal')} disabled={busy} style={{ alignSelf: 'center', marginTop: 10 }}>
                <Text style={[styles.link, { color: t.textAccent }]}>Manage a previous plan</Text>
              </Pressable>
            )}
            <Text style={styles.muted}>Payment is handled by Stripe in your browser. Unis never sees your card. Renews monthly until you cancel.</Text>
          </>
        )}
      </View>

      {artist && (
        <View style={styles.card}>
          <Text style={styles.h2}>What your support does</Text>
          {[
            ['They get paid every month.', `${dollars(split.supported)} reaches ${artist.name} whether or not you press play. It doesn’t depend on streams, ads or anyone’s algorithm.`],
            ['Your plays move them up the chart.', `The subscription pays them; the listening ranks them. Every play you give ${artist.name} counts toward their standing${artist.area ? ` in ${artist.area}` : ''}.`],
            ['Direct, and ongoing.', 'Not a one-night ticket with the promoter keeping the door — the same amount reaches them every month until you stop.'],
          ].map(([title, body], i) => (
            <View key={title} style={styles.why}>
              <Text style={[styles.whyN, { color: t.textAccent, borderColor: t.border }]}>{i + 1}</Text>
              <Text style={styles.liText}><Text style={{ fontWeight: '800', color: '#fff' }}>{title}</Text> {body}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.h2}>Where your {dollars(price)} goes</Text>
        <View style={styles.split}>
          {splitRows.map((r, i) => (
            <View key={i} style={[styles.splitRow, i > 0 && styles.splitDivider, r.hi && { backgroundColor: t.subtle }]}>
              <View style={{ flex: 1 }}>
                {r.who}
                {!!r.why && <Text style={styles.splitWhy}>{r.why}</Text>}
              </View>
              <Text style={[styles.splitAmt, r.hi && { color: t.textAccent }]}>{dollars(r.amount)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.muted}>
          {artist ? artist.name : 'The artist you support'} gets that half whatever you played. The artists{'’'} half of the rest is split by how much you played each artist that month, with the same rules as the Community Share (up to 50 plays a day count; your own songs don{'’'}t), so {artist ? artist.name : 'your supported artist'} gets part of that too when you play them. If you didn{'’'}t play anyone, it goes to {artist ? artist.name : 'your supported artist'} as well. If you don{'’'}t support anyone, their half is split by your plays instead. To be paid, an artist needs a verified phone number. Unis{'’'}s part joins the monthly Community Share, which is shared with supported artists and referrers by listening. Amounts are credited when each month closes.
        </Text>
      </View>

      <Text style={styles.fine}>
        Unis Plus renews automatically each month at the price shown until you cancel in Manage plan. Canceling stops the next payment; it doesn{'’'}t refund the current month. See the{' '}
        <Text style={[styles.link, { color: t.textAccent }]} onPress={() => Linking.openURL(webUrl('/terms'))}>Terms of Service</Text> (Unis Plus).
      </Text>

      {user && (
        <SupportedArtistPicker
          show={picking}
          onClose={() => setPicking(false)}
          userId={user.userId}
          currentArtistId={artistId}
          userJurisdictionId={user.jurisdiction?.jurisdictionId}
          userJurisdictionName={user.jurisdiction?.name}
          onSuccess={() => { refreshUser?.(); load(); }}
        />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 160 },
  hero: { borderRadius: 26, overflow: 'hidden', borderWidth: 1, marginBottom: 14 },
  heroPhoto: { ...StyleSheet.absoluteFillObject, opacity: 0.85 },
  heroInner: { padding: 20, paddingTop: 22 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  chip: { color: '#fff', fontSize: 11, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', textTransform: 'uppercase', letterSpacing: 0.6 },
  h1: { color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -0.6, lineHeight: 35 },
  heroP: { color: 'rgba(255,255,255,0.82)', fontSize: 14.5, lineHeight: 21, marginTop: 10 },
  artistChip: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, padding: 10, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  artistName: { color: '#fff', fontWeight: '800', fontSize: 15 },
  artistSub: { color: 'rgba(255,255,255,0.65)', fontSize: 12.5, marginTop: 2 },
  go: { color: 'rgba(255,255,255,0.7)', fontSize: 26, fontWeight: '300' },
  plusAv: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  plusAvText: { fontSize: 24, fontWeight: '800' },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 12 },
  noteBad: { borderColor: 'rgba(248,113,113,0.5)', backgroundColor: 'rgba(220,38,38,0.1)' },
  noteText: { color: 'rgba(255,255,255,0.85)', fontSize: 13.5, flex: 1 },
  card: { borderRadius: 20, padding: 18, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },
  h2: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 8 },
  p: { color: 'rgba(255,255,255,0.8)', fontSize: 14.5, lineHeight: 21 },
  warn: { color: '#fcd34d', fontSize: 14, lineHeight: 20 },
  muted: { color: 'rgba(255,255,255,0.5)', fontSize: 12.5, lineHeight: 18, marginTop: 10 },
  credited: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  creditedN: { fontSize: 20, fontWeight: '900' },
  creditedL: { color: 'rgba(255,255,255,0.7)', fontSize: 13, flex: 1 },
  li: { flexDirection: 'row', gap: 8, marginTop: 8 },
  check: { fontWeight: '900', fontSize: 14 },
  liText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 20, flex: 1 },
  btn: { marginTop: 16, paddingVertical: 14, borderRadius: 999, alignItems: 'center' },
  btnGhost: { marginTop: 16, paddingVertical: 13, borderRadius: 999, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  link: { fontWeight: '700', textDecorationLine: 'underline' },
  why: { flexDirection: 'row', gap: 10, marginTop: 10 },
  whyN: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, textAlign: 'center', lineHeight: 22, fontWeight: '900', fontSize: 12 },
  split: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 4 },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11 },
  splitDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)' },
  splitWho: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  splitWhy: { color: 'rgba(255,255,255,0.5)', fontSize: 11.5, marginTop: 2 },
  splitAmt: { color: '#fff', fontWeight: '900', fontSize: 15 },
  fine: { color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 17, marginTop: 6 },
});

export default PlusScreen;
