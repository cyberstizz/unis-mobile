// src/components/feed/FeedModules.tsx
// ─────────────────────────────────────────────────────────────
// Mobile port of web src/feedModules.jsx — the FOMO-style feed cards:
//
//   FeedSpotlight   theme-gradient carousel: today's race leader → Song of
//                   the Week → Artist of the Week (or a plain vote slide).
//   TodayRace       "Where Harlem's votes are going" — today's race drawn as
//                   bubbles (Songs / Artists), countdown to local midnight.
//   DayTiles        Votes today · Your points · Races close in.
//   MoversCard      Biggest rank moves today / this week.
//   FollowingDrops  New songs from artists you follow (story-style rings).
//
// Nothing here records plays (the Player is the only play-tracking source).
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinear, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { formatCount, Board, BoardEntry } from '../../utils/standings';
import { formatScore } from '../../context/RewardContext';
import { useUnisTheme, UnisTheme, mix } from '../../theme/unisTheme';
import { useAuth } from '../../context/AuthContext';

// ── Small shared pieces ─────────────────────────────────────
const CheckIcon: React.FC<{ size?: number; width?: number; color?: string }> = ({ size = 14, width = 3, color = '#fff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M20 6L9 17l-5-5" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const ClockIcon: React.FC<{ color?: string }> = ({ color = '#fff' }) => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={13} r={8} stroke={color} strokeWidth={2.4} />
    <Path d="M12 9v4l2.5 2M9 2h6" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
  </Svg>
);

const ExpandIcon: React.FC = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const ChevronRight: React.FC<{ color?: string }> = ({ color = '#fff' }) => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const Arrow: React.FC<{ up: boolean; color: string }> = ({ up, color }) => (
  <Svg width={9} height={9} viewBox="0 0 10 10">
    <Path d={up ? 'M5 1l4 7H1z' : 'M5 9L1 2h8z'} fill={color} />
  </Svg>
);

const votesLabel = (n: number) => `${formatCount(n)} vote${n === 1 ? '' : 's'}`;

/** Ticks every `ms` so countdowns stay live without re-rendering the feed. */
function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Time left in today's race (jurisdiction's own close, else viewer's midnight). */
export function raceClock(closesAt?: string | null, now = Date.now()) {
  let end = closesAt ? new Date(closesAt).getTime() : NaN;
  if (!Number.isFinite(end) || end <= now - 60000) {
    const d = new Date(now);
    d.setHours(24, 0, 0, 0);
    end = d.getTime();
  }
  const ms = Math.max(0, end - now);
  return {
    hours: Math.floor(ms / 3600000),
    minutes: Math.floor((ms % 3600000) / 60000),
    dayFraction: Math.min(1, Math.max(0, 1 - ms / 86400000)),
  };
}

/** Votes-only view of a standings board: who has votes, and each one's share. */
export function voteShares(board?: Board | null, max = 5) {
  const entries = (board?.entries || []).filter((e) => e.votes > 0);
  const total = entries.reduce((sum, e) => sum + e.votes, 0);
  const ranked = entries
    .slice()
    .sort((a, b) => b.votes - a.votes || a.rank - b.rank)
    .slice(0, max)
    .map((e) => ({ ...e, share: total ? Math.round((e.votes / total) * 100) : 0 }));
  return { total, ranked };
}

// ═════════════════════════════════════════════════════════════
//  SPOTLIGHT
// ═════════════════════════════════════════════════════════════

// Hand-tuned per-theme palettes (web feedModules.scss "SPOTLIGHT PALETTES").
const SPOT_PALETTES: Record<string, { a: string; b: string; c: string; base: string; shade: number }> = {
  blue: { a: '#4f7dff', b: '#ff6b45', c: '#9a46ff', base: '#110c2c', shade: 0.38 },
  purple: { a: '#8f52ff', b: '#ff5c8e', c: '#d43dff', base: '#16092a', shade: 0.38 },
  green: { a: '#1fc874', b: '#b8e83f', c: '#12a9b0', base: '#04160f', shade: 0.42 },
  red: { a: '#ff3a4c', b: '#ff9a3c', c: '#e8247f', base: '#1d0609', shade: 0.4 },
  orange: { a: '#ff7a2e', b: '#ffc23d', c: '#f23d6c', base: '#1d0b04', shade: 0.46 },
  yellow: { a: '#f2c21b', b: '#ff5a36', c: '#ff9220', base: '#1a1303', shade: 0.52 },
  dianna: { a: '#d9ab45', b: '#f0d79a', c: '#a8572a', base: '#170f05', shade: 0.5 },
};

const spotPalette = (theme: string, t: UnisTheme) =>
  SPOT_PALETTES[theme] || {
    a: mix(t.primary, '#ffffff', 0.2),
    b: mix(t.primary, '#000000', 0.15),
    c: mix(t.primary, '#ffffff', 0.4),
    base: mix(t.primary, '#08080b', 0.82),
    shade: 0.38,
  };

// Glow positions per variant (cx, cy as fractions; rx, ry radii as fractions).
const VARIANTS = [
  [{ k: 'a', cx: 0, cy: 0, rx: 1.2, ry: 1.4, stop: 0.58 }, { k: 'b', cx: 1, cy: 1, rx: 0.9, ry: 1.2, stop: 0.62 }, { k: 'c', cx: 0.72, cy: 0, rx: 0.8, ry: 1.1, stop: 0.62 }],
  [{ k: 'a', cx: 1, cy: 0, rx: 1.2, ry: 1.4, stop: 0.58 }, { k: 'c', cx: 0, cy: 1, rx: 0.9, ry: 1.2, stop: 0.62 }, { k: 'b', cx: 0.35, cy: 0, rx: 0.8, ry: 1.1, stop: 0.6 }],
  [{ k: 'a', cx: 0, cy: 1, rx: 1.2, ry: 1.4, stop: 0.58 }, { k: 'b', cx: 1, cy: 0, rx: 0.9, ry: 1.2, stop: 0.62 }, { k: 'c', cx: 0.6, cy: 1, rx: 0.8, ry: 1.1, stop: 0.6 }],
] as const;

const SpotBackground: React.FC<{ variant: number; palette: ReturnType<typeof spotPalette>; w: number; h: number }> = ({ variant, palette, w, h }) => {
  const glows = VARIANTS[variant % 3];
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        {glows.map((g, i) => (
          <RadialGradient
            key={i}
            id={`g${variant}${i}`}
            cx={g.cx * w}
            cy={g.cy * h}
            rx={g.rx * w}
            ry={g.ry * h}
            fx={g.cx * w}
            fy={g.cy * h}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={(palette as any)[g.k]} stopOpacity={1} />
            <Stop offset={String(g.stop)} stopColor={(palette as any)[g.k]} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={palette.base} />
      {glows.map((_, i) => (
        <Rect key={i} x={0} y={0} width={w} height={h} fill={`url(#g${variant}${i})`} />
      ))}
    </Svg>
  );
};

type Slide = {
  key: string;
  label: string;
  title: string;
  byline?: string | null;
  bylinePhoto?: string | null;
  image?: string | null;
  round?: boolean;
  chip?: string;
  cta?: string;
  meta?: string;
  onOpen?: () => void;
};

export const FeedSpotlight: React.FC<{
  jurisdictionName: string;
  dailyBoard: Board | null;
  weeklyWinner: any;
  artistOfWeek: any;
  onVote: () => void;
  onSongNav: (id: string, type?: string) => void;
  onArtistNav: (id: string) => void;
}> = ({ jurisdictionName, dailyBoard, weeklyWinner, artistOfWeek, onVote, onSongNav, onArtistNav }) => {
  const t = useUnisTheme();
  const { theme } = useAuth();
  const palette = spotPalette(theme, t);
  const trackRef = useRef<ScrollView>(null);
  const [active, setActive] = useState(0);
  const [w, setW] = useState(0);
  const H = 206;

  const slides = useMemo<Slide[]>(() => {
    const list: Slide[] = [];
    const scored = (dailyBoard?.entries || []).filter((e) => e.points > 0);
    if (scored.length) {
      const leader = scored[0];
      const { total } = voteShares(dailyBoard, 50);
      const live = (dailyBoard?.state || 'LIVE') === 'LIVE';
      list.push({
        key: `leader-${leader.id}`,
        label: live ? "Leading today's race" : "Yesterday's #1",
        title: leader.name,
        byline: leader.artistName,
        image: leader.artwork,
        chip: leader.votes > 0 ? votesLabel(leader.votes) : `#1 in ${jurisdictionName}`,
        meta: total > 0 && leader.votes > 0 ? `${Math.round((leader.votes / total) * 100)}% share` : `${formatCount(leader.points)} pts`,
        onOpen: () => onSongNav(leader.id, 'song'),
      });
    }
    if (weeklyWinner) {
      list.push({
        key: `sotw-${weeklyWinner.songId}`,
        label: 'Song of the Week',
        title: weeklyWinner.title,
        byline: weeklyWinner.artistName,
        image: weeklyWinner.artworkUrl,
        chip: 'Winner',
        cta: 'Vote this week',
        onOpen: () => onSongNav(weeklyWinner.songId, 'song'),
      });
    }
    if (artistOfWeek) {
      list.push({
        key: `aotw-${artistOfWeek.userId}`,
        label: 'Artist of the Week',
        title: artistOfWeek.username,
        image: artistOfWeek.photoUrl,
        round: true,
        chip: artistOfWeek.votesCount > 0 ? votesLabel(artistOfWeek.votesCount) : 'Winner',
        cta: 'Vote this week',
        onOpen: () => onArtistNav(artistOfWeek.userId),
      });
    }
    if (!list.length) {
      list.push({
        key: 'vote',
        label: `Today's race in ${jurisdictionName}`,
        title: `Who runs ${jurisdictionName} today?`,
        byline: null,
        image: null,
        meta: 'Your vote decides the #1',
      });
    }
    return list;
  }, [dailyBoard, weeklyWinner, artistOfWeek, jurisdictionName, onSongNav, onArtistNav]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!w) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / w);
    setActive((prev) => (prev === i ? prev : i));
  }, [w]);

  const goTo = (i: number) => {
    trackRef.current?.scrollTo({ x: i * w, animated: true });
    setActive(i);
  };

  useEffect(() => {
    setActive(0);
    trackRef.current?.scrollTo({ x: 0, animated: false });
  }, [slides.length]);

  const hour = new Date().getHours();
  const when = hour < 12 ? 'This morning' : hour < 17 ? 'This afternoon' : 'Tonight';

  return (
    <View style={spot.section} accessibilityLabel="Spotlight">
      <Text style={spot.headline} accessibilityRole="header">
        {when} in <Text style={{ color: t.textAccent, fontStyle: 'italic' }}>{jurisdictionName}</Text>
      </Text>

      <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <ScrollView
            ref={trackRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={32}
          >
            {slides.map((slide, i) => (
              <View key={slide.key} style={[spot.slide, { width: w, height: H }]} accessibilityLabel={`${i + 1} of ${slides.length}: ${slide.title}`}>
                <SpotBackground variant={i} palette={palette} w={w} h={H} />
                <LinearGradient
                  colors={[`rgba(0,0,0,${palette.shade})`, 'rgba(0,0,0,0)']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 0.65, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                {slide.onOpen && (
                  <Pressable style={StyleSheet.absoluteFill} onPress={slide.onOpen} accessibilityRole="button" accessibilityLabel={`Open ${slide.title}`} />
                )}
                {slide.chip && (
                  <View style={spot.chip} pointerEvents="none"><Text style={spot.chipText}>{slide.chip}</Text></View>
                )}
                {!!slide.image && (
                  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <Image source={{ uri: slide.image }} style={[spot.art, slide.round && { borderRadius: 59 }]} />
                  </View>
                )}
                <View style={[spot.body, !!slide.image && { right: 140 }]} pointerEvents="box-none">
                  <View style={spot.labelRow} pointerEvents="none">
                    <View style={spot.liveDot} />
                    <Text style={spot.label} numberOfLines={1}>{slide.label}</Text>
                  </View>
                  <Text style={spot.title} numberOfLines={2} pointerEvents="none">{slide.title}</Text>
                  {!!slide.byline && <Text style={spot.byline} numberOfLines={1} pointerEvents="none">{slide.byline}</Text>}
                  <View style={{ flex: 1 }} pointerEvents="none" />
                  <View style={spot.foot} pointerEvents="box-none">
                    <Pressable style={spot.vote} onPress={onVote} accessibilityRole="button">
                      <CheckIcon color="#0b0b0f" size={13} />
                      <Text style={spot.voteText}>{slide.cta || 'Vote'}</Text>
                    </Pressable>
                    {!!slide.meta && <Text style={spot.meta} numberOfLines={1}>{slide.meta}</Text>}
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {slides.length > 1 && (
        <View style={spot.dots}>
          {slides.map((slide, i) => (
            <Pressable key={slide.key} onPress={() => goTo(i)} hitSlop={6} accessibilityLabel={`Show slide ${i + 1}`}>
              <View style={[spot.dot, i === active && { width: 18, backgroundColor: '#fff' }]} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
};

const spot = StyleSheet.create({
  section: { marginBottom: 18 },
  headline: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.6, marginBottom: 12 },
  slide: { borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chip: { position: 'absolute', top: 14, right: 14, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  chipText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  art: { position: 'absolute', right: 18, top: 50, width: 118, height: 118, borderRadius: 18 },
  body: { position: 'absolute', left: 18, right: 18, top: 16, bottom: 16 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '80%' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ff4d4d' },
  label: { color: 'rgba(255,255,255,0.88)', fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.6, lineHeight: 31, marginTop: 8 },
  byline: { color: 'rgba(255,255,255,0.82)', fontSize: 14, fontWeight: '600', marginTop: 4 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vote: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: '#fff' },
  voteText: { color: '#0b0b0f', fontWeight: '800', fontSize: 14 },
  meta: { color: 'rgba(255,255,255,0.82)', fontSize: 12.5, fontWeight: '700', flexShrink: 1 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
});

// ═════════════════════════════════════════════════════════════
//  TODAY'S RACE (bubbles)
// ═════════════════════════════════════════════════════════════

// Fixed bubble slots (stage is 340 × 322 units), largest share in the largest slot.
const SLOTS = [
  { x: 0, y: 8, d: 190, tone: ['#ff8a5c', '#d2366e', '#5b1440'] },
  { x: 196, y: 0, d: 150, tone: ['#4aa8ff', '#1d5bd8', '#0d2361'] },
  { x: 150, y: 158, d: 126, tone: ['#f2b94a', '#9a6408', '#3d2603'] },
  { x: 28, y: 210, d: 106, tone: ['#ff6b7d', '#b3173e', '#4a0718'] },
  { x: 282, y: 200, d: 92, tone: ['#4fe0a2', '#0f7f52', '#053a24'] },
];

const Bubble: React.FC<{ d: number; tone: string[]; id: string }> = ({ d, tone, id }) => (
  <Svg width={d} height={d} style={StyleSheet.absoluteFill}>
    <Defs>
      <RadialGradient id={id} cx={d * 0.3} cy={d * 0.22} r={d * 0.85} fx={d * 0.3} fy={d * 0.22} gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor={tone[0]} />
        <Stop offset="0.55" stopColor={tone[1]} />
        <Stop offset="1" stopColor={tone[2]} />
      </RadialGradient>
    </Defs>
    <Circle cx={d / 2} cy={d / 2} r={d / 2} fill={`url(#${id})`} />
  </Svg>
);

export const TodayRace: React.FC<{
  jurisdictionName: string;
  songBoard: Board | null;
  artistBoard: Board | null;
  category: 'song' | 'artist';
  onCategoryChange: (c: 'song' | 'artist') => void;
  votedTargetIds: Set<string>;
  onVote: () => void;
  onOpenEntry: (e: BoardEntry) => void;
  onOpenStandings: () => void;
}> = ({ jurisdictionName, songBoard, artistBoard, category, onCategoryChange, votedTargetIds, onVote, onOpenEntry, onOpenStandings }) => {
  const t = useUnisTheme();
  const now = useNow();
  const [stageW, setStageW] = useState(0);
  const board = category === 'artist' ? artistBoard : songBoard;
  const { total, ranked } = useMemo(() => voteShares(board), [board]);
  const live = (board?.state || 'LIVE') === 'LIVE';
  const clock = raceClock(live ? board?.closesAt : null, now);
  const noun = category === 'artist' ? 'Artist' : 'Song';
  const votedHere = ranked.some((e) => votedTargetIds?.has(e.id)) || (board?.entries || []).some((e) => votedTargetIds?.has(e.id));
  const scale = stageW / 340;

  return (
    <View style={card.card} accessibilityLabel={`Today's ${noun.toLowerCase()} race`}>
      <View style={race.head}>
        <View style={{ flex: 1 }}>
          <Text style={card.title}>Where {jurisdictionName}{'’'}s votes are going</Text>
          <Text style={card.sub}>{live ? `${noun} of the Day` : "Yesterday's final"} · {votesLabel(total)}</Text>
        </View>
        <Pressable style={card.iconBtn} onPress={onOpenStandings} accessibilityLabel="Open full standings"><ExpandIcon /></Pressable>
      </View>

      <View style={race.controls}>
        {(['song', 'artist'] as const).map((c) => (
          <Pressable
            key={c}
            onPress={() => onCategoryChange(c)}
            style={[card.pill, category === c && { backgroundColor: '#fff' }]}
            accessibilityState={{ selected: category === c }}
          >
            <Text style={[card.pillText, category === c && { color: '#0b0b0f' }]}>{c === 'song' ? 'Songs' : 'Artists'}</Text>
          </Pressable>
        ))}
        <View style={race.clock} accessibilityLabel={`Race closes in ${clock.hours} hours ${clock.minutes} minutes`}>
          <ClockIcon color="rgba(255,255,255,0.75)" />
          <Text style={race.clockText}>{clock.hours}h {clock.minutes}m</Text>
        </View>
      </View>

      {board == null ? (
        <View style={race.empty}><ActivityIndicator color="#fff" /><Text style={race.emptyText}>Loading the race…</Text></View>
      ) : ranked.length === 0 ? (
        <View style={race.empty}><Text style={race.emptyText}>No votes yet today in {jurisdictionName}. The first one sets the pace.</Text></View>
      ) : (
        <View style={{ width: '100%', aspectRatio: 340 / 322 }} onLayout={(e) => setStageW(e.nativeEvent.layout.width)}>
          {stageW > 0 && ranked.map((entry, i) => {
            const slot = SLOTS[i];
            const d = slot.d * scale;
            const mine = votedTargetIds?.has(entry.id);
            return (
              <Pressable
                key={entry.id}
                onPress={() => onOpenEntry(entry)}
                style={[
                  race.bubble,
                  { left: slot.x * scale, top: slot.y * scale, width: d, height: d, borderRadius: d / 2 },
                  mine && { borderWidth: 3, borderColor: '#fff' },
                ]}
                accessibilityLabel={`${entry.name}, ${entry.share} percent of votes${mine ? ', your vote' : ''}`}
              >
                <Bubble d={d} tone={slot.tone} id={`bub${i}`} />
                {mine && i < 3 && (
                  <View style={race.mine}><CheckIcon size={10} width={3.4} color="#0b0b0f" /><Text style={race.mineText}>Your vote</Text></View>
                )}
                <Text style={[race.pct, { fontSize: Math.max(14, d * 0.2) }]}>{entry.share}%</Text>
                {i < 4 && <Text style={[race.name, { fontSize: Math.max(10, d * 0.075) }]} numberOfLines={1}>{entry.name}</Text>}
                {i < 3 && <Text style={race.votes}>{votesLabel(entry.votes)}</Text>}
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={race.foot}>
        {votedHere ? (
          <>
            <View style={[race.ok, { backgroundColor: t.primary }]}><CheckIcon size={14} /></View>
            <View style={{ flex: 1 }}>
              <Text style={race.footStrong}>Your vote is in</Text>
              <Text style={race.footSub}>Next {noun.toLowerCase()} vote opens at midnight</Text>
            </View>
          </>
        ) : (
          <>
            <View style={{ flex: 1 }}>
              <Text style={race.footStrong}>Today{'’'}s vote is open</Text>
              <Text style={race.footSub}>One {noun.toLowerCase()} vote per day in {jurisdictionName}</Text>
            </View>
            <Pressable style={[race.cta, { backgroundColor: t.primary }]} onPress={onVote}><Text style={race.ctaText}>Vote</Text></Pressable>
          </>
        )}
        <Pressable style={race.link} onPress={onOpenStandings} hitSlop={6}>
          <Text style={race.linkText}>Standings</Text>
          <ChevronRight color="rgba(255,255,255,0.8)" />
        </Pressable>
      </View>
    </View>
  );
};

const card = StyleSheet.create({
  card: { borderRadius: 24, padding: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 14, overflow: 'hidden' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  sub: { color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginTop: 3 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  pillSm: { paddingHorizontal: 11, paddingVertical: 5 },
  pillText: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', fontSize: 13 },
});

const race = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 12 },
  clock: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5 },
  clockText: { color: 'rgba(255,255,255,0.8)', fontWeight: '800', fontSize: 13 },
  empty: { paddingVertical: 34, alignItems: 'center', gap: 10 },
  emptyText: { color: 'rgba(255,255,255,0.6)', fontSize: 13.5, textAlign: 'center', lineHeight: 19 },
  bubble: { position: 'absolute', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 8 },
  mine: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: '#fff', marginBottom: 2 },
  mineText: { color: '#0b0b0f', fontSize: 9.5, fontWeight: '800' },
  pct: { color: '#fff', fontWeight: '900', letterSpacing: -0.5 },
  name: { color: '#fff', fontWeight: '700', maxWidth: '86%', textAlign: 'center' },
  votes: { color: 'rgba(255,255,255,0.78)', fontSize: 10, fontWeight: '600', marginTop: 1 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)' },
  ok: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  footStrong: { color: '#fff', fontWeight: '800', fontSize: 14 },
  footSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 1 },
  cta: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', fontSize: 12.5 },
});

// ═════════════════════════════════════════════════════════════
//  DAY TILES
// ═════════════════════════════════════════════════════════════

export const DayTiles: React.FC<{
  isGuest?: boolean;
  jurisdictionName: string;
  votedSongToday: boolean;
  votedArtistToday: boolean;
  score?: number | null;
  level?: string | null;
  closesAt?: string | null;
}> = ({ isGuest, jurisdictionName, votedSongToday, votedArtistToday, score, level, closesAt }) => {
  const t = useUnisTheme();
  const now = useNow();
  const clock = raceClock(closesAt, now);
  const used = (votedSongToday ? 1 : 0) + (votedArtistToday ? 1 : 0);
  const voteStatus = used === 2 ? 'Both races done' : votedSongToday ? 'Artist race still open' : votedArtistToday ? 'Song race still open' : 'Two races open';
  const R = 31;
  const C = 2 * Math.PI * R;
  const pct = Math.round(clock.dayFraction * 100);

  return (
    <View style={{ marginBottom: 14 }} accessibilityLabel={isGuest ? 'Today on Unis' : 'Your day on Unis'}>
      <Text style={day.title}>
        {isGuest ? 'Today' : 'Your day'} <Text style={{ color: t.textAccent, fontStyle: 'italic' }}>on Unis</Text>
      </Text>

      {!isGuest && (
        <View style={day.pair}>
          <View style={[card.card, day.tile]}>
            <View style={day.labelRow}>
              <View style={[day.icon, { backgroundColor: t.soft }]}><CheckIcon size={13} width={2.6} color={t.textAccent} /></View>
              <Text style={day.label}>Votes today</Text>
            </View>
            <Text style={day.big}>{used}<Text style={day.small}>/2</Text></Text>
            <View style={day.pips}>
              <View style={[day.pip, used > 0 && { backgroundColor: t.primary }]} />
              <View style={[day.pip, used === 2 && { backgroundColor: t.primary }]} />
            </View>
            <Text style={[day.note, { color: t.textAccent }]}>{voteStatus}</Text>
          </View>

          <View style={[card.card, day.tile]}>
            <View style={day.labelRow}>
              <View style={[day.icon, { backgroundColor: 'rgba(250,204,21,0.16)' }]}>
                <Svg width={13} height={13} viewBox="0 0 24 24"><Path d="M12 2l2.2 6.8H21l-5.5 4 2.1 6.7L12 15.6l-5.6 3.9 2.1-6.7-5.5-4h6.8z" fill="#facc15" /></Svg>
              </View>
              <Text style={day.label}>Your points</Text>
            </View>
            <Text style={[day.big, { fontSize: 26 }]} numberOfLines={1} adjustsFontSizeToFit>{formatScore(score ?? 0)}</Text>
            {!!level && <Text style={[day.note, { color: t.textAccent }]}>{String(level).replace(/^\w/, (c) => c.toUpperCase())} level</Text>}
          </View>
        </View>
      )}

      <View style={[card.card, day.clockCard]}>
        <View style={{ flex: 1 }}>
          <Text style={day.label}>{jurisdictionName}{'’'}s races close in</Text>
          <Text style={day.clockBig}>
            {clock.hours}<Text style={day.small}>h</Text> {clock.minutes}<Text style={day.small}>m</Text>
          </Text>
          <Text style={card.sub}>Song &amp; Artist of the Day · midnight local</Text>
        </View>
        <View style={day.ring} accessibilityLabel={`${pct} percent of the day has passed`}>
          <Svg width={76} height={76} viewBox="0 0 76 76">
            <Defs>
              <SvgLinear id="arc" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={t.primary2} />
                <Stop offset="1" stopColor={t.primary} />
              </SvgLinear>
            </Defs>
            <Circle cx={38} cy={38} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={7} />
            <Circle
              cx={38}
              cy={38}
              r={R}
              fill="none"
              stroke="url(#arc)"
              strokeWidth={7}
              strokeLinecap="round"
              strokeDasharray={`${(C * clock.dayFraction).toFixed(1)} ${C.toFixed(1)}`}
              transform="rotate(-90 38 38)"
            />
          </Svg>
          <Text style={day.ringText}>{pct}%</Text>
        </View>
      </View>
    </View>
  );
};

const day = StyleSheet.create({
  title: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.4, marginBottom: 10 },
  pair: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, marginBottom: 10 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  icon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700' },
  big: { color: '#fff', fontSize: 34, fontWeight: '900', marginTop: 8, letterSpacing: -0.6 },
  small: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
  pips: { flexDirection: 'row', gap: 5, marginTop: 6 },
  pip: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)' },
  note: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  clockCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 0 },
  clockBig: { color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: -0.6, marginVertical: 4 },
  ring: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  ringText: { position: 'absolute', color: '#fff', fontWeight: '800', fontSize: 14 },
});

// ═════════════════════════════════════════════════════════════
//  MOVERS
// ═════════════════════════════════════════════════════════════

/** Climbers first (biggest jump first), then new entries, then the drops. */
export function pickMovers(board?: Board | null, max = 4) {
  const scored = (board?.entries || []).filter((e) => e.points > 0);
  const ups = scored.filter((e) => (e.movement ?? 0) > 0).sort((a, b) => (b.movement as number) - (a.movement as number));
  const fresh = scored.filter((e) => e.movement == null && e.isNew);
  const downs = scored.filter((e) => (e.movement ?? 0) < 0).sort((a, b) => (a.movement as number) - (b.movement as number));
  return [...ups, ...fresh, ...downs].slice(0, max);
}

export const MoversCard: React.FC<{
  jurisdictionName: string;
  board: Board | null;
  period: 'daily' | 'weekly';
  onPeriodChange: (p: 'daily' | 'weekly') => void;
  onOpenEntry: (e: BoardEntry) => void;
  fallbackArt: any;
}> = ({ jurisdictionName, board, period, onPeriodChange, onOpenEntry, fallbackArt }) => {
  const movers = useMemo(() => pickMovers(board), [board]);
  const when = period === 'weekly' ? 'this week' : 'today';

  return (
    <View style={card.card} accessibilityLabel={`Movers in ${jurisdictionName}`}>
      <View style={mv.head}>
        <Text style={[card.title, { flex: 1 }]}>Movers in {jurisdictionName}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(['daily', 'weekly'] as const).map((p) => (
            <Pressable key={p} onPress={() => onPeriodChange(p)} style={[card.pill, card.pillSm, period === p && { backgroundColor: '#fff' }]} accessibilityState={{ selected: period === p }}>
              <Text style={[card.pillText, { fontSize: 12 }, period === p && { color: '#0b0b0f' }]}>{p === 'daily' ? 'Today' : 'Week'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {board == null ? (
        <View style={race.empty}><ActivityIndicator color="#fff" /><Text style={race.emptyText}>Loading…</Text></View>
      ) : movers.length === 0 ? (
        <View style={race.empty}><Text style={race.emptyText}>Nobody has moved yet {when}.</Text></View>
      ) : (
        <View style={{ marginTop: 6 }}>
          {movers.map((e) => {
            const up = (e.movement ?? 0) > 0;
            return (
              <Pressable key={e.id} style={({ pressed }) => [mv.row, pressed && { opacity: 0.7 }]} onPress={() => onOpenEntry(e)}>
                <Image source={e.artwork ? { uri: e.artwork } : fallbackArt} defaultSource={fallbackArt} style={mv.art} />
                <View style={{ flex: 1 }}>
                  <Text style={mv.title} numberOfLines={1}>{e.name}</Text>
                  <Text style={mv.sub} numberOfLines={1}>
                    {e.artistName ? `${e.artistName} · ` : ''}{formatCount(e.plays)} play{e.plays === 1 ? '' : 's'} {when}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text style={mv.pos}>#{e.rank}</Text>
                  {e.movement == null ? (
                    <Text style={mv.new}>NEW</Text>
                  ) : (
                    <View style={mv.move} accessibilityLabel={`${Math.abs(e.movement)} ${up ? 'places up' : 'places down'}`}>
                      <Arrow up={up} color={up ? '#4ade80' : '#f87171'} />
                      <Text style={[mv.moveText, { color: up ? '#4ade80' : '#f87171' }]}>{Math.abs(e.movement)}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
};

const mv = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  art: { width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
  title: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  sub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 },
  pos: { color: '#fff', fontWeight: '900', fontSize: 14 },
  new: { color: '#facc15', fontWeight: '900', fontSize: 10.5 },
  move: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  moveText: { fontWeight: '800', fontSize: 12 },
});

// ═════════════════════════════════════════════════════════════
//  NEW FROM ARTISTS YOU FOLLOW
// ═════════════════════════════════════════════════════════════

const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

export const FollowingDrops: React.FC<{ drops: any[]; onOpen: (d: any) => void }> = ({ drops, onOpen }) => {
  const t = useUnisTheme();
  if (!drops?.length) return null;
  return (
    <View style={{ marginBottom: 18 }} accessibilityLabel="New from artists you follow">
      <Text style={[card.title, { marginBottom: 12 }]}>New from artists you follow</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
        {drops.map((d) => {
          const fresh = d.createdAt && Date.now() - new Date(d.createdAt).getTime() < TWO_DAYS;
          const name = d.artistData?.username || d.artist || 'Artist';
          const photo = d.artistPhoto || d.artworkUrl;
          return (
            <Pressable key={d.id} style={dr.item} onPress={() => onOpen(d)} accessibilityLabel={`${d.title} by ${name}${fresh ? ', new' : ''}`}>
              {fresh ? (
                <LinearGradient colors={[t.primary2, t.primary, '#ff6b45']} style={dr.ring}>
                  <View style={dr.inner}>{!!photo && <Image source={{ uri: photo }} style={dr.photo} />}</View>
                </LinearGradient>
              ) : (
                <View style={[dr.ring, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                  <View style={dr.inner}>{!!photo && <Image source={{ uri: photo }} style={dr.photo} />}</View>
                </View>
              )}
              {fresh && <View style={[dr.newTag, { backgroundColor: t.primary }]}><Text style={dr.newText}>NEW</Text></View>}
              <Text style={dr.name} numberOfLines={1}>{name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const dr = StyleSheet.create({
  item: { width: 76, alignItems: 'center' },
  ring: { width: 72, height: 72, borderRadius: 36, padding: 3, alignItems: 'center', justifyContent: 'center' },
  inner: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#07090f', padding: 2, overflow: 'hidden' },
  photo: { width: '100%', height: '100%', borderRadius: 31 },
  newTag: { position: 'absolute', top: 60, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  newText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  name: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600', marginTop: 8, maxWidth: 76 },
});
