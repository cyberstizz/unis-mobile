// ============================================================================
// WinnersScreen.tsx — mobile port of web `winnersTimelinePage.jsx`
//
// The full archive: /jurisdiction/:name/winners on web, route 'Winners' here.
// Params: { jurisdiction, jurisdictionId?, interval?, category? }
// Interval/category params are validated against allow-lists, same as the web
// page's query-param handling.
//
// Resolves the jurisdiction UUID once (when the caller didn't pass it) so
// switching intervals never re-runs the byName lookup.
//
// AD SLOT — on web this is a sticky right rail; on mobile it becomes a banner
// beneath the timeline, carrying the same ambient theme wash used by the
// Milestones winner plate so an unsold slot reads as part of the page rather
// than a hole in it. This is the reference implementation for ad slots
// elsewhere in the app — extract to a shared <AdSlot /> before replicating.
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';

import { useAuth } from '../context/AuthContext';
import axiosInstance from '../services/axiosInstance';
import WinnersTimeline from '../components/WinnersTimeline';

const THEME_HEX: Record<string, string> = {
  blue: '#163387',
  orange: '#C44B0A',
  red: '#B51C24',
  green: '#0F7A3E',
  purple: '#4A1A8C',
  yellow: '#C49A0A',
  dianna: '#C49A0A',
};
const getThemeHex = (theme?: string): string =>
  THEME_HEX[theme || 'blue'] || THEME_HEX.blue;

const hexToRgba = (hex: string, alpha: number): string => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const BG = '#07090f';
const INK = '#ffffff';
const INK_3 = 'rgba(255,255,255,0.5)';
const INK_4 = 'rgba(255,255,255,0.32)';
const ETCH = 'rgba(255,255,255,0.08)';

const VALID_INTERVALS = ['day', 'week', 'month', 'quarter', 'midterm', 'year'] as const;
const VALID_CATEGORIES = ['song', 'artist'] as const;

type IntervalValue = (typeof VALID_INTERVALS)[number];
type CategoryValue = (typeof VALID_CATEGORIES)[number];

const ChevronLeft = ({ color }: { color: string }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
    <Path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const WinnersScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { theme } = useAuth();
  const accent = getThemeHex(theme);

  const jurName =
    route.params?.jurisdiction || route.params?.jurisdictionName || 'Downtown Harlem';
  const passedId: string | null = route.params?.jurisdictionId || null;

  const intervalParam = route.params?.interval;
  const categoryParam = route.params?.category;

  const initialInterval: IntervalValue = VALID_INTERVALS.includes(intervalParam)
    ? intervalParam
    : 'week';
  const initialCategory: CategoryValue = VALID_CATEGORIES.includes(categoryParam)
    ? categoryParam
    : 'song';

  const [jurId, setJurId] = useState<string | null>(passedId);

  useEffect(() => {
    if (passedId) {
      setJurId(passedId);
      return;
    }

    let active = true;

    axiosInstance
      .get(`/v1/jurisdictions/byName/${encodeURIComponent(jurName)}`)
      .then((res) => {
        if (!active) return;
        const body = res.data;
        const first = Array.isArray(body) ? body[0] : body;
        if (first?.jurisdictionId) setJurId(first.jurisdictionId);
      })
      .catch((err) =>
        console.error('[WinnersScreen] byName lookup failed:', err?.message || err)
      );

    return () => {
      active = false;
    };
  }, [jurName, passedId]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          style={styles.back}
          onPress={() =>
            navigation.navigate('Jurisdiction', { jurisdictionName: jurName })
          }
          accessibilityRole="button"
          accessibilityLabel={`Back to ${jurName}`}
        >
          <ChevronLeft color={INK_3} />
          <Text style={styles.backText}>Back to {jurName}</Text>
        </TouchableOpacity>

        <WinnersTimeline
          jurisdiction={jurName}
          jurisdictionId={jurId}
          initialInterval={initialInterval}
          initialCategory={initialCategory}
          variant="full"
          initialCount={5}
          pageSize={5}
        />

        {/* Ad slot — ambient wash, same treatment as the Milestones plate.
            Replace the inner contents with the ad unit when the partner
            lands; the refresh hook is in WinnersTimeline.handleLoadMore. */}
        <View
          style={styles.adSlot}
          accessibilityRole="none"
          accessibilityLabel="Sponsored"
        >
          <LinearGradient
            colors={[hexToRgba(accent, 0.28), 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.adInner}>
            <Text style={styles.adLabel}>AD SPACE</Text>
            <Text style={styles.adNote}>
              Partnership pending — refreshes every 5 winners loaded
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  scroll: { padding: 16, paddingBottom: 120 },

  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  backText: { color: INK_3, fontSize: 14, fontWeight: '700' },

  adSlot: {
    marginTop: 32,
    minHeight: 180,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.022)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adInner: { alignItems: 'center', gap: 8, padding: 20 },
  adLabel: { color: INK_3, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  adNote: {
    maxWidth: 220,
    color: INK_4,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});

export default WinnersScreen;