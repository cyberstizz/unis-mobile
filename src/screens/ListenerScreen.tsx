// src/screens/ListenerScreen.tsx
// ─────────────────────────────────────────────────────────────
// A listener's public profile — mobile port of web src/ListenerPage.jsx.
// Hero (tier ring, points / votes / supporting / followers), Follow or Edit,
// the photo grid, "same frequency" CTA, who they back, On the record tabs
// (Votes / Comments / Taste), badges, about, listeners nearby.
// Artists are redirected to their artist page.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { useAuth } from '../context/AuthContext';
import { useFeedback, errorMessage } from '../context/FeedbackContext';
import { useUnisTheme } from '../theme/unisTheme';
import VoteHistorySection from '../components/VoteHistorySection';
import ProfilePhotos from '../components/ProfilePhotos';

const TIER_COLORS: Record<string, [string, string]> = {
  silver: ['#e5e7eb', '#9ca3af'],
  gold: ['#fde68a', '#d97706'],
  platinum: ['#e0f2fe', '#7dd3fc'],
  diamond: ['#c4b5fd', '#60a5fa'],
};

const ic = (d: React.ReactNode, size = 16) => <Svg width={size} height={size} viewBox="0 0 24 24">{d}</Svg>;
const C = 'rgba(255,255,255,0.85)';
const ICONS: Record<string, React.ReactNode> = {
  bolt: ic(<Path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill={C} />, 22),
  star: ic(<Path d="M12 2l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 20l1.2-6.5L2.5 8.9 9.1 8 12 2z" fill={C} />, 22),
  fire: ic(<Path d="M12 2c1 3-2 4-2 7 0 1.5 1 2.5 2 2.5S16 12 15 9c3 2 5 5 5 8a8 8 0 11-16 0c0-4 4-6 4-9 0-2 2-4 4-6z" fill={C} />, 20),
  heart: ic(<Path d="M12 21S3 14.5 3 8.8A4.8 4.8 0 0112 6a4.8 4.8 0 019 2.8C21 14.5 12 21 12 21z" fill={C} />, 20),
  crown: ic(<Path d="M3 7l4 4 5-7 5 7 4-4-2 12H5L3 7z" fill={C} />, 22),
  lock: ic(<><Rect x={5} y={10} width={14} height={10} rx={2} stroke="rgba(255,255,255,0.4)" strokeWidth={1.8} fill="none" /><Path d="M8 10V7a4 4 0 018 0v3" stroke="rgba(255,255,255,0.4)" strokeWidth={1.8} fill="none" /></>, 18),
};

const fmtCount = (n: any) => {
  const v = Number(n) || 0;
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `${v}`;
};

const memberSince = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

// Badges from real public signals until a badges service exists.
const deriveBadges = ({ votes, supporting, level }: { votes: number; supporting: boolean; level: string }) => {
  const lvl = (level || 'silver').toLowerCase();
  return [
    { i: 'bolt', l: 'Day One', earned: true },
    { i: 'star', l: 'First Vote', earned: votes >= 1 },
    { i: 'fire', l: '100 Votes', earned: votes >= 100 },
    { i: 'heart', l: 'Backer', earned: supporting },
    { i: 'crown', l: `${lvl[0].toUpperCase()}${lvl.slice(1)} Tier`, earned: lvl !== 'silver' },
    { i: 'star', l: 'Tastemaker', earned: false },
  ];
};

const ListenerScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const feedback = useFeedback();
  const t = useUnisTheme();
  const { user: authUser } = useAuth();
  const userId: string = route.params?.userId;

  const [user, setUser] = useState<any>(null);
  const [supportedArtist, setSupportedArtist] = useState<any>(null);
  const [followers, setFollowers] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'votes' | 'comments' | 'taste'>('votes');
  const [following, setFollowing] = useState(false);

  const isSelf = !!authUser?.userId && authUser.userId === userId;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Public profile endpoint (not the owner-only profile summary).
        const profRes = await axiosInstance.get(`/v1/users/profile/${userId}`);
        if (cancelled) return;
        const u = profRes.data || {};
        if (u.role === 'artist') { navigation.replace('Artist', { artistId: userId }); return; }
        setUser(u);
        const [folRes, supRes] = await Promise.all([
          axiosInstance.get(`/v1/users/${userId}/followers/count`).catch(() => null),
          u.supportedArtistId ? axiosInstance.get(`/v1/users/profile/${u.supportedArtistId}`).catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (folRes?.data?.count != null) setFollowers(Number(folRes.data.count));
        if (supRes?.data) setSupportedArtist(supRes.data);
      } catch {
        if (!cancelled) setError("Couldn't load this profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, navigation]);

  const toggleFollow = useCallback(async () => {
    const next = !following;
    const who = user?.username || 'this listener';
    setFollowing(next);
    try {
      if (next) await axiosInstance.post(`/v1/users/${userId}/follow`);
      else await axiosInstance.delete(`/v1/users/${userId}/follow`);
      feedback.success(next ? `Following ${who}` : `Unfollowed ${who}`, { id: 'listener-follow' });
    } catch (e) {
      console.error('Failed to toggle follow:', e);
      setFollowing(!next);
      feedback.error(errorMessage(e, next ? `Couldn't follow ${who}. Try again.` : `Couldn't unfollow ${who}. Try again.`));
    }
  }, [following, userId, user?.username, feedback]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={t.primary} size="large" /></View>;
  if (error || !user) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>{error || 'Profile not found'}</Text>
        <Text style={styles.soft}>This listener may have moved or set their profile to private.</Text>
      </View>
    );
  }

  const tier = (user.level || 'silver').toLowerCase();
  const tierColors = TIER_COLORS[tier] || TIER_COLORS.silver;
  const photo = buildUrl(user.photoUrl);
  const initial = (user.username || '?').charAt(0).toUpperCase();
  const votes = user.totalVotes ?? 0;
  const jName: string | null = user.jurisdiction?.name || null;
  const jId: string | null = user.jurisdiction?.jurisdictionId || user.jurisdictionId || null;
  const since = memberSince(user.createdAt);
  const badges = deriveBadges({ votes, supporting: Boolean(supportedArtist), level: tier });
  const socials = [
    user.instagramUrl && { label: 'Instagram', url: user.instagramUrl },
    user.twitterUrl && { label: 'X', url: user.twitterUrl },
    user.tiktokUrl && { label: 'TikTok', url: user.tiktokUrl },
  ].filter(Boolean) as { label: string; url: string }[];
  const openDiscover = () => navigation.navigate('Discover', jId ? { jid: jId, jname: jName || '' } : undefined);
  const supPhoto = supportedArtist ? buildUrl(supportedArtist.photoUrl) : null;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {/* HERO */}
      <View style={styles.hero}>
        <View>
          <LinearGradient colors={tierColors} style={styles.ring}>
            <View style={styles.avaInner}>
              {photo ? <Image source={{ uri: photo }} style={styles.ava} /> : <Text style={[styles.initial, { color: t.textAccent }]}>{initial}</Text>}
            </View>
          </LinearGradient>
          <View style={[styles.hp, { backgroundColor: t.primary }]}>
            {ic(<><Path d="M4 13v-1a8 8 0 0116 0v1" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" fill="none" /><Rect x={3} y={13} width={4} height={6} rx={1.5} stroke="#fff" strokeWidth={1.8} fill="none" /><Rect x={17} y={13} width={4} height={6} rx={1.5} stroke="#fff" strokeWidth={1.8} fill="none" /></>, 14)}
          </View>
        </View>
        <Text style={[styles.eyebrow, { color: t.textAccent }]}>● Listener{jName ? ` · ${jName}` : ''}</Text>
        <Text style={styles.name}>{user.username}</Text>
        <Text style={styles.tagline}><Text style={{ color: tierColors[1], fontWeight: '900' }}>{tier.toUpperCase()}</Text>  ·  <Text style={{ fontStyle: 'italic' }}>{user.bio || "exploring Harlem's finest"}</Text></Text>

        <View style={styles.ribbon}>
          <View style={styles.stat}>
            <Text style={[styles.statV, { color: t.textAccent }]}>◆ {fmtCount(user.score)}</Text>
            <Text style={styles.statL}>Points</Text>
          </View>
          <View style={styles.stat}><Text style={styles.statV}>{fmtCount(votes)}</Text><Text style={styles.statL}>Votes cast</Text></View>
          <View style={styles.stat}><Text style={styles.statV}>{supportedArtist ? 1 : 0}</Text><Text style={styles.statL}>Supporting</Text></View>
          {followers != null && <View style={styles.stat}><Text style={styles.statV}>{fmtCount(followers)}</Text><Text style={styles.statL}>Followers</Text></View>}
        </View>

        <View style={styles.actions}>
          {isSelf ? (
            <>
              <Pressable style={[styles.btn, { backgroundColor: t.primary }]} onPress={() => navigation.navigate('Profile')}><Text style={styles.btnText}>Edit profile</Text></Pressable>
              <Pressable style={styles.btnGhost} onPress={() => navigation.navigate('Profile')}><Text style={styles.btnText}>Share my code</Text></Pressable>
            </>
          ) : (
            <>
              <Pressable style={following ? styles.btnGhost : [styles.btn, { backgroundColor: t.primary }]} onPress={toggleFollow}>
                <Text style={styles.btnText}>{following ? 'Following' : '+ Follow'}</Text>
              </Pressable>
              <Pressable style={styles.btnGhost} onPress={openDiscover}><Text style={styles.btnText}>Find similar</Text></Pressable>
            </>
          )}
        </View>
      </View>

      <ProfilePhotos ownerId={userId} ownerName={user.username} ownerAvatar={photo} isSelf={isSelf} />

      {/* Same frequency */}
      <View style={[styles.card, styles.match, { borderColor: t.border }]}>
        <View style={[styles.matchRing, { borderColor: t.primary }]}>
          <Text style={styles.matchPct}>{jName ? jName.split(' ')[0] : 'UNIS'}</Text>
          <Text style={styles.matchCap}>scene</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.matchK}>On the <Text style={{ fontWeight: '900', color: '#fff' }}>same frequency</Text></Text>
          <Text style={styles.soft}>Meet listeners {jName ? `in ${jName}` : 'near you'} who back the same artists and vote on the same records.</Text>
          <Pressable style={[styles.btn, { backgroundColor: t.primary, alignSelf: 'flex-start', marginTop: 10 }]} onPress={openDiscover}>
            <Text style={styles.btnText}>Explore {jName || 'Discover'} →</Text>
          </Pressable>
        </View>
      </View>

      {/* Supporting */}
      <View style={styles.card}>
        <Text style={styles.secTitle}>Backing <Text style={styles.secEm}>their artist</Text></Text>
        {supportedArtist ? (
          <View style={styles.support}>
            <View style={[styles.supAva, { backgroundColor: t.soft }]}>
              {supPhoto ? <Image source={{ uri: supPhoto }} style={StyleSheet.absoluteFill} /> : <Text style={[styles.initialSm, { color: t.textAccent }]}>{(supportedArtist.username || '?').charAt(0).toUpperCase()}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.supName}>{supportedArtist.username} <Text style={{ color: '#facc15' }}>♛</Text></Text>
              <Text style={styles.supSub}>Backing directly{jName ? ` · ${jName}` : ''}</Text>
            </View>
            <Pressable style={styles.btnGhost} onPress={() => navigation.navigate('Artist', { artistId: supportedArtist.userId })}><Text style={styles.btnText}>Visit</Text></Pressable>
          </View>
        ) : (
          <Text style={styles.soft}>Not backing an artist yet.</Text>
        )}
      </View>

      {/* Activity */}
      <View style={styles.card}>
        <Text style={styles.secTitle}>On the <Text style={styles.secEm}>record</Text></Text>
        <View style={styles.tabs} accessibilityRole="tablist">
          {(['votes', 'comments', 'taste'] as const).map((k) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && { borderBottomColor: t.primary }]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
              <Text style={[styles.tabText, tab === k && { color: '#fff' }]}>{k[0].toUpperCase() + k.slice(1)}</Text>
            </Pressable>
          ))}
        </View>
        {tab === 'votes' && (isSelf ? <VoteHistorySection userId={userId} /> : (
          <View style={styles.softBlock}>
            <Text style={styles.big}>{fmtCount(votes)}</Text>
            <Text style={styles.soft}>total votes cast{jName ? ` across ${jName} and beyond` : ''}.</Text>
            <Text style={styles.hint}>Full vote history is shown on a listener's own profile.</Text>
          </View>
        ))}
        {tab === 'comments' && (
          <View style={styles.softBlock}>
            <Text style={styles.soft}>No public comments yet.</Text>
            <Text style={styles.hint}>Comments {user.username} leaves on songs will show up here.</Text>
          </View>
        )}
        {tab === 'taste' && (
          <View style={styles.softBlock}>
            <Text style={styles.soft}>{supportedArtist ? `Backs ${supportedArtist.username}.` : 'Building a taste profile.'} {tier.charAt(0).toUpperCase() + tier.slice(1)} tier listener.</Text>
            <Text style={styles.hint}>Genre & artist breakdown is coming soon.</Text>
          </View>
        )}
      </View>

      {/* Badges */}
      <View style={styles.card}>
        <Text style={styles.secTitle}>Badges <Text style={styles.secEm}>earned</Text></Text>
        <View style={styles.badges}>
          {badges.map((b, i) => (
            <View key={i} style={[styles.badge, !b.earned && { opacity: 0.45 }]}>
              <View style={[styles.badgeTok, b.earned && { backgroundColor: t.soft, borderColor: t.border }]}>{b.earned ? ICONS[b.i] : ICONS.lock}</View>
              <Text style={styles.badgeLabel} numberOfLines={2}>{b.l}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* About */}
      <View style={styles.card}>
        <Text style={styles.secTitle}>About</Text>
        {!!user.bio && <Text style={styles.soft}>{user.bio}</Text>}
        <View style={{ gap: 6, marginTop: 8 }}>
          {!!jName && (
            <View style={styles.metaRow}>
              {ic(<><Path d="M12 2.4c-3.9 0-7.2 3.2-7.2 7.2 0 5.4 7.2 12 7.2 12s7.2-6.6 7.2-12c0-4-3.3-7.2-7.2-7.2z" stroke={C} strokeWidth={1.6} fill="none" /><Circle cx={12} cy={9.6} r={2.4} stroke={C} strokeWidth={1.6} fill="none" /></>, 15)}
              <Text style={styles.metaText}><Text style={{ color: '#fff', fontWeight: '800' }}>{jName}</Text></Text>
            </View>
          )}
          {!!since && (
            <View style={styles.metaRow}>
              {ic(<><Rect x={3.6} y={4.8} width={16.8} height={15.6} rx={2.4} stroke={C} strokeWidth={1.6} fill="none" /><Path d="M3.6 9.6h16.8M8.4 2.4v3.6M15.6 2.4v3.6" stroke={C} strokeWidth={1.6} strokeLinecap="round" /></>, 15)}
              <Text style={styles.metaText}>Member since <Text style={{ color: '#fff', fontWeight: '800' }}>{since}</Text></Text>
            </View>
          )}
        </View>
        {socials.length > 0 && (
          <View style={styles.socials}>
            {socials.map((sx) => (
              <Pressable key={sx.label} style={styles.soc} onPress={() => Linking.openURL(sx.url)} accessibilityLabel={sx.label}>
                <Text style={styles.socText}>{sx.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.secTitle}>Listeners <Text style={styles.secEm}>nearby</Text></Text>
        <Text style={styles.soft}>Discover people {jName ? `in ${jName}` : 'near you'} on the same wavelength.</Text>
        <Pressable style={[styles.btnGhost, { marginTop: 10, alignItems: 'center' }]} onPress={openDiscover}><Text style={styles.btnText}>Open Discover →</Text></Pressable>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 160 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 8 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  hero: { alignItems: 'center', paddingTop: 8 },
  ring: { width: 122, height: 122, borderRadius: 61, padding: 4, alignItems: 'center', justifyContent: 'center' },
  avaInner: { width: 114, height: 114, borderRadius: 57, backgroundColor: '#0b0e16', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ava: { width: '100%', height: '100%' },
  initial: { fontSize: 44, fontWeight: '900' },
  initialSm: { fontSize: 18, fontWeight: '900' },
  hp: { position: 'absolute', right: 2, bottom: 4, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#07090f' },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 14 },
  name: { color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -0.6, marginTop: 4 },
  tagline: { color: 'rgba(255,255,255,0.7)', fontSize: 13.5, marginTop: 4, textAlign: 'center' },
  ribbon: { flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: 16 },
  stat: { alignItems: 'center' },
  statV: { color: '#fff', fontSize: 18, fontWeight: '900' },
  statL: { color: 'rgba(255,255,255,0.55)', fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  btnGhost: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  card: { borderRadius: 20, padding: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },
  match: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  matchRing: { width: 84, height: 84, borderRadius: 42, borderWidth: 6, alignItems: 'center', justifyContent: 'center' },
  matchPct: { color: '#fff', fontSize: 15, fontWeight: '900' },
  matchCap: { color: 'rgba(255,255,255,0.55)', fontSize: 10.5, fontWeight: '700' },
  matchK: { color: 'rgba(255,255,255,0.8)', fontSize: 15, marginBottom: 4 },
  secTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 10 },
  secEm: { fontStyle: 'italic', fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  soft: { color: 'rgba(255,255,255,0.65)', fontSize: 13.5, lineHeight: 19 },
  support: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  supAva: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  supName: { color: '#fff', fontWeight: '800', fontSize: 15 },
  supSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 4, marginBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)' },
  tab: { paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: 14 },
  softBlock: { alignItems: 'center', paddingVertical: 14, gap: 4 },
  big: { color: '#fff', fontSize: 34, fontWeight: '900' },
  hint: { color: 'rgba(255,255,255,0.45)', fontSize: 12, textAlign: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  badge: { width: '29%', alignItems: 'center', gap: 6 },
  badgeTok: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  badgeLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11.5, fontWeight: '700', textAlign: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { color: 'rgba(255,255,255,0.7)', fontSize: 13.5 },
  socials: { flexDirection: 'row', gap: 8, marginTop: 12 },
  soc: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  socText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
});

export default ListenerScreen;
