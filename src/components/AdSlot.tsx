// src/components/AdSlot.tsx
// ─────────────────────────────────────────────────────────────
// The one ad space every screen uses — mobile port of web
// src/components/AdSlot.jsx.
//
//   <AdSlot placement="feed" />
//
// What it shows, in order (same as web):
//   1. Nothing for Unis Plus members.
//   2. A local sponsor running this week in the viewer's area
//      ("Sponsored · Local") — tap opens the API's counted redirect.
//   3. (Web only: a Google AdSense unit. AdSense doesn't run inside apps;
//      AdMob would need its native SDK in the build.)
//   4. Otherwise a Unis card: the Unis Plus card ("Support <your artist>")
//      for members, or "Your business here" (→ unismusic.com/sponsor).
//
// The space is reserved so the screen doesn't jump. Nobody is paid for
// seeing or tapping anything here (the Community Share follows listening).
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { usePlusStatus } from '../utils/plusStatus';
import { openScreen } from '../navigation/navigationRef';
import { webUrl } from '../config/links';
import { useUnisTheme, mix } from '../theme/unisTheme';
import PlusMark from './PlusMark';

const API_BASE = 'https://unismvp-production.up.railway.app/api';
export const sponsorTapUrl = (campaignId: string) => `${API_BASE}/v1/sponsors/${encodeURIComponent(campaignId)}/go`;

const validSponsor = (data: any) =>
  data && typeof data === 'object' && typeof data.campaignId === 'string' && typeof data.businessName === 'string' ? data : null;

const formatPrice = (cents: any) => {
  const n = Number(cents);
  return Number.isFinite(n) && n > 0 ? `$${(n / 100).toFixed(2)}` : '$4.99';
};

const useSupportedArtist = (artistId: string | null, enabled: boolean) => {
  const [artist, setArtist] = useState<{ userId: string; name: string; photoUrl: string | null } | null>(null);
  useEffect(() => {
    if (!enabled || !artistId) { setArtist(null); return; }
    let cancelled = false;
    axiosInstance
      .get(`/v1/users/profile/${artistId}`)
      .then((res) => {
        const d = res?.data;
        if (!cancelled && d?.username) setArtist({ userId: artistId, name: d.username, photoUrl: d.photoUrl || null });
      })
      .catch((err) => {
        console.warn('[AdSlot] supported artist failed:', err?.response?.status, err?.message);
        if (!cancelled) setArtist(null);
      });
    return () => { cancelled = true; };
  }, [artistId, enabled]);
  return artist;
};

const AdSlot: React.FC<{ placement: string; style?: any }> = ({ placement, style }) => {
  const { user, authLoaded } = useAuth();
  const t = useUnisTheme();
  const userId = user?.userId || null;
  const { status: plus, loaded: plusLoaded } = usePlusStatus(userId);
  const jurisdictionId = user?.jurisdiction?.jurisdictionId || '';
  const [sponsor, setSponsor] = useState<any>(undefined);
  const [houseKind] = useState(() => (Math.random() < 0.75 ? 'plus' : 'sponsor'));
  const blocked = Boolean(plus.plus);
  const supportedArtist = useSupportedArtist(user?.supportedArtistId || null, !blocked && Boolean(userId) && houseKind === 'plus');

  useEffect(() => {
    if (blocked) return;
    let cancelled = false;
    setSponsor(undefined);
    const q = jurisdictionId ? `?jurisdictionId=${encodeURIComponent(jurisdictionId)}` : '';
    axiosInstance
      .get(`/v1/sponsors/serve${q}`)
      .then((res) => { if (!cancelled) setSponsor(res?.status === 204 ? null : validSponsor(res?.data)); })
      .catch(() => { if (!cancelled) setSponsor(null); });
    return () => { cancelled = true; };
  }, [blocked, jurisdictionId, placement]);

  if (blocked) return null;
  if (!authLoaded || (userId && !plusLoaded)) return null;

  const surface = mix(t.primary, '#0f1016', 0.9);
  let label = '';
  let body: React.ReactNode = null;

  if (sponsor === undefined) {
    body = <View style={[styles.placeholder, { backgroundColor: surface }]} />;
  } else if (sponsor) {
    label = 'Sponsored · Local';
    const logo = sponsor.logoUrl ? buildUrl(sponsor.logoUrl) : null;
    const name = sponsor.businessName || 'Your business';
    const line = sponsor.headline || '';
    body = (
      <Pressable
        onPress={() => Linking.openURL(sponsorTapUrl(sponsor.campaignId)).catch(() => {})}
        style={({ pressed }) => [styles.sponsor, { backgroundColor: surface }, pressed && { opacity: 0.85 }]}
        accessibilityLabel={`${name}: ${line} (sponsored, opens in your browser)`}
      >
        {logo ? (
          <Image source={{ uri: logo }} style={styles.logo} />
        ) : (
          <View style={[styles.logo, { backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={styles.initial}>{name.trim().charAt(0).toUpperCase() || 'U'}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {!!line && <Text style={styles.line} numberOfLines={2}>{line}</Text>}
        </View>
        <Text style={[styles.cta, { backgroundColor: t.primary }]}>Visit</Text>
      </Pressable>
    );
  } else {
    const kind = userId && plus.available ? houseKind : 'sponsor';
    label = 'From Unis';
    if (kind === 'plus') {
      const photo = supportedArtist ? buildUrl(supportedArtist.photoUrl) : null;
      const price = formatPrice(plus.priceCents);
      body = (
        <Pressable
          onPress={() => openScreen('Plus')}
          style={({ pressed }) => [styles.house, { backgroundColor: surface, borderColor: t.border }, pressed && { opacity: 0.88 }]}
          accessibilityLabel={supportedArtist ? `Support ${supportedArtist.name} with Unis Plus` : 'Go ad-free with Unis Plus'}
        >
          <PlusMark height={15} />
          {supportedArtist ? (
            <View style={styles.supportRow}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={styles.initial}>{supportedArtist.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.houseTitle} numberOfLines={1}>Support <Text style={{ fontWeight: '900' }}>{supportedArtist.name}</Text></Text>
            </View>
          ) : (
            <Text style={styles.houseTitle}>Go ad-free</Text>
          )}
          <Text style={styles.houseBody}>
            {supportedArtist
              ? `${price} a month, no ads. Half of it goes straight to them, every month.`
              : `${price} a month. Half goes straight to the artist you support.`}
          </Text>
          <Text style={[styles.houseCta, { color: t.textAccent }]}>See Unis Plus</Text>
        </Pressable>
      );
    } else {
      body = (
        <Pressable
          onPress={() => Linking.openURL(webUrl('/sponsor')).catch(() => {})}
          style={({ pressed }) => [styles.house, { backgroundColor: surface, borderColor: 'rgba(255,255,255,0.1)' }, pressed && { opacity: 0.88 }]}
        >
          <Text style={styles.houseTitle}>Your business here</Text>
          <Text style={styles.houseBody}>Harlem shops: reach people listening in your neighborhood, from $25 a week.</Text>
          <Text style={[styles.houseCta, { color: t.textAccent }]}>Sponsor Harlem</Text>
        </Pressable>
      );
    }
  }

  return (
    <View style={[styles.slot, style]} accessibilityLabel={label || 'Advertisement'}>
      <Text style={styles.label}>{label || ' '}</Text>
      {body}
    </View>
  );
};

const styles = StyleSheet.create({
  slot: { marginVertical: 12 },
  label: { color: 'rgba(255,255,255,0.4)', fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  placeholder: { height: 92, borderRadius: 16 },
  sponsor: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, minHeight: 92, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  logo: { width: 52, height: 52, borderRadius: 12 },
  initial: { color: '#fff', fontWeight: '800', fontSize: 18 },
  name: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
  line: { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 2 },
  cta: { color: '#fff', fontWeight: '800', fontSize: 13, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, overflow: 'hidden' },
  house: { padding: 16, borderRadius: 16, minHeight: 92, borderWidth: 1, gap: 6 },
  supportRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  houseTitle: { color: '#fff', fontSize: 18, fontWeight: '800', flexShrink: 1 },
  houseBody: { color: 'rgba(255,255,255,0.7)', fontSize: 13.5, lineHeight: 19 },
  houseCta: { fontWeight: '800', fontSize: 13.5, marginTop: 2 },
});

export default AdSlot;
