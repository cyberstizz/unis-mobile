// src/components/LastWonNotification.tsx
// Full port of web LastWonNotification — NEW component for mobile
// Full-screen modal with staggered reveal, ambient color, auto-dismiss progress bar

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  Modal,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import Svg, { Path, Line, Circle, Polyline, Polygon } from 'react-native-svg';

import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';
import { INTERVAL_IDS } from '../utils/IdMappings';
import UnisLogo from '../../assets/unisLogoThree.svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const IS_SMALL = SCREEN_WIDTH < 400;
const DISPLAY_DURATION = 12000;

// ─── Design tokens ───────────────────────────────────────────
const C = {
  bgCard: '#0a0a0c',
  textPrimary: '#f0f0f2',
  textSecondary: 'rgba(255,255,255,0.55)',
  textTertiary: 'rgba(255,255,255,0.35)',
  unisBlue: '#163387',
  unisBlueHover: '#1c41ad',
  accentBlue: '#4ea8f5',
};

// ─── Award categories (matching web exactly) ─────────────────
const CATEGORIES = [
  { key: 'song-daily', type: 'song', intervalId: INTERVAL_IDS['daily'], badge: 'Song of the Day', icon: '🎵', secondaryLabel: 'Listen' },
  { key: 'song-weekly', type: 'song', intervalId: INTERVAL_IDS['weekly'], badge: 'Song of the Week', icon: '🏆', secondaryLabel: 'Listen' },
  { key: 'artist-daily', type: 'artist', intervalId: INTERVAL_IDS['daily'], badge: 'Artist of the Day', icon: '👑', secondaryLabel: 'View Profile' },
];

const toApiDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const toDisplayDate = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const toWeeklyRange = (dateStr: string) => {
  if (!dateStr) return '';
  const end = new Date(dateStr + 'T00:00:00');
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const endDay = end.getDate();
  const year = end.getFullYear();
  if (sameMonth) return `${startStr} – ${endDay}, ${year}`;
  const endStr = end.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return `${startStr} – ${endStr}, ${year}`;
};

// ─── SVG Icons ───────────────────────────────────────────────
const CloseIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={2}>
    <Line x1={18} y1={6} x2={6} y2={18} /><Line x1={6} y1={6} x2={18} y2={18} />
  </Svg>
);

const VoteIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <Polyline points="22 4 12 14.01 9 11.01" />
  </Svg>
);

const PlayIcon = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24">
    <Polygon points="5,3 19,12 5,21" fill="currentColor" />
  </Svg>
);

// ─── Interfaces ──────────────────────────────────────────────
interface NotificationData {
  category: typeof CATEGORIES[0];
  title: string;
  artist: string | null;
  jurisdiction: string;
  date: string;
  image: string | null;
  songData: any;
  navigateTo: { screen: string; params: any };
}

const atob = (input: string): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = input.replace(/=+$/, ''); let output = '';
  for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
    buffer = chars.indexOf(buffer) as any; if ((buffer as number) === -1) continue;
    bs = bc % 4 ? bs * 64 + (buffer as number) : (buffer as number);
    if (bc++ % 4) output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
  }
  return output;
};

// ═════════════════════════════════════════════════════════════
const LastWonNotification: React.FC = () => {
  const navigation = useNavigation<any>();
  const { playMedia } = usePlayer();
  const { user } = useAuth();

  const [visible, setVisible] = useState(false);
  const [notification, setNotification] = useState<NotificationData | null>(null);
  const [animStage, setAnimStage] = useState(0);
  const hasFetchedRef = useRef(false);
  const timerRef = useRef<any>(null);
  const progressTimerRef = useRef<any>(null);

  // Animated values
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const badgeTranslateX = useRef(new Animated.Value(-60)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const dateOpacity = useRef(new Animated.Value(0)).current;
  const dateTranslateY = useRef(new Animated.Value(8)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;
  const actionsOpacity = useRef(new Animated.Value(0)).current;
  const actionsTranslateY = useRef(new Animated.Value(16)).current;
  const progressWidth = useRef(new Animated.Value(100)).current;

  const jurisdictionId = user?.jurisdiction?.jurisdictionId;

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      setVisible(false);
      setAnimStage(0);
    });
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
  }, []);

  // ── Fetch winners on mount (once per session) ──
  useEffect(() => {
    if (!jurisdictionId || hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const fetchWinners = async () => {
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const endDate = toApiDate(today);
      const startDate = toApiDate(thirtyDaysAgo);

      try {
        const results = await Promise.all(
          CATEGORIES.map(async (cat) => {
            try {
              const res = await axiosInstance.get(
                `/v1/awards/past?type=${cat.type}&startDate=${startDate}&endDate=${endDate}&jurisdictionId=${jurisdictionId}&intervalId=${cat.intervalId}`
              );
              const awards = res.data || [];
              if (awards.length === 0) return null;
              const award = awards[0];

              if (cat.type === 'song' && award.song) {
                const isWeekly = cat.key === 'song-weekly';
                return {
                  category: cat,
                  title: award.song.title || 'Unknown Song',
                  artist: award.song.artist?.username || 'Unknown Artist',
                  jurisdiction: award.jurisdiction?.name || 'Unknown',
                  date: isWeekly ? toWeeklyRange(award.awardDate) : toDisplayDate(award.awardDate),
                  image: getMediaUrl(award.song.artworkUrl) || getMediaUrl(award.song.artist?.photoUrl),
                  songData: award.song,
                  navigateTo: { screen: 'Song', params: { songId: award.song.songId || award.targetId } },
                } as NotificationData;
              } else if (cat.type === 'artist' && award.user) {
                return {
                  category: cat,
                  title: award.user.username || 'Unknown Artist',
                  artist: null,
                  jurisdiction: award.jurisdiction?.name || 'Unknown',
                  date: toDisplayDate(award.awardDate),
                  image: getMediaUrl(award.user.photoUrl),
                  songData: null,
                  navigateTo: { screen: 'Artist', params: { artistId: award.user.userId || award.targetId } },
                } as NotificationData;
              }
              return null;
            } catch { return null; }
          })
        );

        const valid = results.filter(Boolean) as NotificationData[];
        if (valid.length === 0) return;
        const picked = valid[Math.floor(Math.random() * valid.length)];
        setNotification(picked);

        // Staggered reveal sequence (matching web timing)
        setTimeout(() => {
          setVisible(true);
          // Card entrance
          Animated.parallel([
            Animated.timing(overlayOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(cardOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.spring(cardScale, { toValue: 1, friction: 8, useNativeDriver: true }),
          ]).start();

          // Stage 1: Badge slides in (400ms after card)
          setTimeout(() => {
            setAnimStage(1);
            Animated.parallel([
              Animated.timing(badgeOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
              Animated.spring(badgeTranslateX, { toValue: 0, friction: 8, useNativeDriver: true }),
            ]).start();
          }, 400);

          // Stage 2: Date fades in (1.5s after badge)
          setTimeout(() => {
            setAnimStage(2);
            Animated.parallel([
              Animated.timing(dateOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
              Animated.timing(dateTranslateY, { toValue: 0, duration: 600, useNativeDriver: true }),
            ]).start();
          }, 1900);

          // Stage 3: Title + actions reveal
          setTimeout(() => {
            setAnimStage(3);
            Animated.parallel([
              Animated.timing(titleOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
              Animated.spring(titleTranslateY, { toValue: 0, friction: 8, useNativeDriver: true }),
              Animated.timing(actionsOpacity, { toValue: 1, duration: 500, delay: 150, useNativeDriver: true }),
              Animated.timing(actionsTranslateY, { toValue: 0, duration: 500, delay: 150, useNativeDriver: true }),
            ]).start();

            // Start auto-dismiss countdown
            Animated.timing(progressWidth, { toValue: 0, duration: DISPLAY_DURATION, useNativeDriver: false }).start();
            timerRef.current = setTimeout(dismiss, DISPLAY_DURATION);
          }, 2600);
        }, 1200);
      } catch (err) {
        console.error('LastWonNotification: Failed to fetch awards', err);
      }
    };

    fetchWinners();
  }, [jurisdictionId]);

  const handleVote = () => {
    dismiss();
    navigation.navigate('VoteAwards');
  };

  const handleSecondary = () => {
    dismiss();
    if (notification?.songData) {
      const song = notification.songData;
      playMedia({
        type: 'song',
        id: song.songId,
        songId: song.songId,
        url: getMediaUrl(song.fileUrl),
        title: song.title,
        artist: song.artist?.username || 'Unknown',
        artwork: getMediaUrl(song.artworkUrl),
      } as any, []);
    } else if (notification?.navigateTo) {
      navigation.navigate(notification.navigateTo.screen, notification.navigateTo.params);
    }
  };

  if (!notification || !visible) return null;

  const cat = notification.category;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={dismiss}>
      <Animated.View style={[s.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={s.overlayPress} onPress={dismiss}>
          <Animated.View style={[s.card, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
            <Pressable onPress={() => {}} /* prevent dismiss on card tap */>

              {/* ── Hero artwork ── */}
              <View style={s.hero}>
                {notification.image ? (
                  <Image source={{ uri: notification.image }} style={s.heroImg} />
                ) : (
                  <LinearGradient colors={['rgba(22,51,135,0.3)', 'rgba(78,168,245,0.1)']} style={s.heroPlaceholder} />
                )}
                <LinearGradient colors={['transparent', 'rgba(10,10,12,0.6)', 'rgba(10,10,12,0.95)']} locations={[0, 0.4, 1]} style={s.heroFade} />
                <TouchableOpacity style={s.closeBtn} onPress={dismiss}>
                  <CloseIcon />
                </TouchableOpacity>
              </View>

              {/* ── Content ── */}
              <View style={s.content}>
                <UnisLogo width={80} height={40} style={s.logo} />

                {/* Badge */}
                <Animated.View style={[s.badge, { opacity: badgeOpacity, transform: [{ translateX: badgeTranslateX }] }]}>
                  <Text style={s.badgeIcon}>{cat.icon}</Text>
                  <Text style={s.badgeText}>{cat.badge}</Text>
                </Animated.View>

                {/* Date */}
                <Animated.Text style={[s.date, { opacity: dateOpacity, transform: [{ translateY: dateTranslateY }] }]}>
                  {notification.date}
                </Animated.Text>

                {/* Title + Artist */}
                <Animated.View style={[s.titleBlock, { opacity: titleOpacity, transform: [{ translateY: titleTranslateY }] }]}>
                  <Text style={s.title}>{notification.title}</Text>
                  {notification.artist && <Text style={s.artist}>{notification.artist}</Text>}
                </Animated.View>

                {/* Jurisdiction */}
                <Animated.View style={[s.jurBadge, { opacity: titleOpacity }]}>
                  <Text style={s.jurText}>{notification.jurisdiction.toUpperCase()}</Text>
                </Animated.View>

                {/* Actions */}
                <Animated.View style={[s.actions, { opacity: actionsOpacity, transform: [{ translateY: actionsTranslateY }] }]}>
                  <TouchableOpacity style={s.btnPrimary} onPress={handleVote} activeOpacity={0.8}>
                    <VoteIcon />
                    <Text style={s.btnPrimaryText}>Vote Now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.btnSecondary} onPress={handleSecondary} activeOpacity={0.8}>
                    <Text style={s.btnSecondaryText}>{cat.secondaryLabel}</Text>
                  </TouchableOpacity>
                </Animated.View>
              </View>

              {/* Progress bar */}
              <View style={s.progressTrack}>
                <Animated.View style={[s.progressFill, { width: progressWidth.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
              </View>

            </Pressable>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  overlayPress: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' },

  card: {
    width: IS_SMALL ? '100%' : 420,
    maxWidth: '92%',
    maxHeight: '90%',
    borderRadius: IS_SMALL ? 0 : 20,
    overflow: 'hidden',
    backgroundColor: C.bgCard,
  },

  // Hero
  hero: { width: '100%', height: IS_SMALL ? 200 : 260, position: 'relative' },
  heroImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  heroPlaceholder: { width: '100%', height: '100%' },
  heroFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '70%' },
  closeBtn: { position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center' },

  // Content
  content: { paddingHorizontal: IS_SMALL ? 24 : 32, paddingBottom: 32, marginTop: -40 },
  logo: { marginBottom: 20 },

  // Badge
  badge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(78,168,245,0.12)', borderWidth: 1, borderColor: 'rgba(78,168,245,0.25)', borderRadius: 40, paddingVertical: 8, paddingHorizontal: 18, alignSelf: 'flex-start', marginBottom: 12 },
  badgeIcon: { fontSize: 14 },
  badgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: '#6ab8ff' },

  // Date
  date: { fontSize: 14, fontWeight: '500', color: C.textTertiary, marginBottom: 10 },

  // Title block
  titleBlock: { marginBottom: 14 },
  title: { fontSize: IS_SMALL ? 34 : 42, fontWeight: '900', color: C.textPrimary, letterSpacing: -1, lineHeight: IS_SMALL ? 38 : 46, marginBottom: 6 },
  artist: { fontSize: IS_SMALL ? 18 : 20, fontWeight: '700', color: C.accentBlue, letterSpacing: -0.3 },

  // Jurisdiction
  jurBadge: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 16, alignSelf: 'flex-start', marginBottom: 24 },
  jurText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: C.textSecondary },

  // Actions
  actions: { gap: 10 },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.unisBlue, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 28 },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  btnSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 28 },
  btnSecondaryText: { color: 'rgba(255,255,255,0.75)', fontSize: 15, fontWeight: '600' },

  // Progress
  progressTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.04)' },
  progressFill: { height: '100%', backgroundColor: C.accentBlue },
});

export default LastWonNotification;