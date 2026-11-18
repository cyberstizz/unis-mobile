// src/components/feed/ArtistOfWeekCard.tsx
// Port of web src/ArtistOfWeekCard.jsx — the feed's Artist of the Week.
// A full-bleed "cover" card: the winner's photo fills the card, a theme-tinted
// scrim keeps the type readable, and a gold award badge marks it as an honour.
// With no photo (or one that fails) it falls back to a theme gradient with the
// artist's initial — never a stock photo of somebody else.
//
// awardDate is the last day of the winning week, so the range is
// awardDate − 6 → awardDate (same convention as LastWonNotification).
import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useUnisTheme, rgba } from '../../theme/unisTheme';

const weekRange = (ymd?: string) => {
  if (!ymd) return '';
  const end = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(end.getTime())) return '';
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return start.getMonth() === end.getMonth() ? `${fmt(start)} – ${end.getDate()}` : `${fmt(start)} – ${fmt(end)}`;
};

const Crown = () => (
  <Svg viewBox="0 0 24 24" width={13} height={13}><Path d="M3 18h18l-1.5-9-4.5 4-3-7-3 7-4.5-4L3 18z" fill="#3d2603" /></Svg>
);

const ArrowIcon = () => (
  <Svg viewBox="0 0 24 24" width={16} height={16}>
    <Path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="#0b0b0f" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export interface ArtistOfWeek {
  userId: string;
  username: string;
  photoUrl?: string | null;
  votesCount?: number;
  awardDate?: string;
}

const ArtistOfWeekCard: React.FC<{ artist: ArtistOfWeek | null; place: string; onOpen: () => void }> = ({ artist, place, onOpen }) => {
  const t = useUnisTheme();
  const [photoBroken, setPhotoBroken] = useState(false);
  useEffect(() => { setPhotoBroken(false); }, [artist?.photoUrl]);
  if (!artist) return null;

  const name = artist.username || 'Unknown';
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const showPhoto = !!artist.photoUrl && !photoBroken;
  const votes = artist.votesCount || 0;
  const range = weekRange(artist.awardDate);

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.card, { borderColor: t.border }, pressed && { transform: [{ scale: 0.99 }] }]}
      accessibilityRole="button"
      accessibilityLabel={`Artist of the Week in ${place}: ${name}. View artist`}
    >
      {showPhoto ? (
        <Image source={{ uri: artist.photoUrl as string }} style={StyleSheet.absoluteFill} onError={() => setPhotoBroken(true)} />
      ) : (
        <LinearGradient colors={[t.primary2, t.primary, t.primaryDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.mono]}>
          <Text style={styles.monoText}>{initial}</Text>
        </LinearGradient>
      )}
      <LinearGradient
        colors={['rgba(5,7,13,0.15)', 'rgba(5,7,13,0.05)', rgba(t.primaryDeep, 0.75), 'rgba(5,7,13,0.96)']}
        locations={[0, 0.35, 0.72, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.top}>
        <View style={styles.badge}>
          <View style={styles.medal}><Crown /></View>
          <Text style={styles.badgeText}>Artist of the Week</Text>
        </View>
        <View style={styles.place}><Text style={styles.placeText}>{place}</Text></View>
      </View>

      <View style={styles.bottom}>
        <Text style={styles.kicker}>The week belonged to</Text>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        <View style={styles.foot}>
          <View style={styles.stats}>
            {votes > 0 && (
              <Text style={styles.stat}><Text style={{ color: '#fff', fontWeight: '800' }}>{votes.toLocaleString('en-US')}</Text> vote{votes !== 1 ? 's' : ''}</Text>
            )}
            {!!range && <Text style={styles.stat}>{range}</Text>}
          </View>
          <View style={styles.cta}>
            <Text style={styles.ctaText}>View artist</Text>
            <ArrowIcon />
          </View>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: { height: 380, borderRadius: 26, overflow: 'hidden', borderWidth: 1, backgroundColor: '#0b0e16', justifyContent: 'space-between' },
  mono: { alignItems: 'center', justifyContent: 'center' },
  monoText: { color: 'rgba(255,255,255,0.9)', fontSize: 140, fontWeight: '900', marginTop: -40 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 4, paddingRight: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(242,185,74,0.55)' },
  medal: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#f2b94a', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#f5d77a', fontWeight: '800', fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },
  place: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.4)' },
  placeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  bottom: { padding: 18 },
  kicker: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' },
  name: { color: '#fff', fontSize: 38, fontWeight: '900', letterSpacing: -1, lineHeight: 42, marginTop: 2 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 10 },
  stats: { flexDirection: 'row', gap: 12, flexShrink: 1, flexWrap: 'wrap' },
  stat: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#fff' },
  ctaText: { color: '#0b0b0f', fontWeight: '800', fontSize: 13.5 },
});

export default ArtistOfWeekCard;
