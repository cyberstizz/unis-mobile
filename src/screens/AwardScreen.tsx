// src/screens/AwardScreen.tsx
// ─────────────────────────────────────────────────────────────
// A winner's share page — mobile port of web src/AwardPage.jsx (the link in
// every winner email). Data: GET /v1/awards/{awardId}/card (public).
//
// The share card is the same 1080×1350 design web draws on a canvas
// (utils/awardCard.js), drawn here with react-native-svg and exported as a
// PNG (Svg.toDataURL) so it can go to the phone's share sheet:
//   Share       — the PNG with the link (Instagram, Messages…)
//   Save image  — the same PNG; the share sheet offers Save Image / Files
//   Copy link
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Defs, LinearGradient as SvgLinear, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { useFeedback } from '../context/FeedbackContext';
import { useUnisTheme } from '../theme/unisTheme';
import { WEB_ORIGIN } from '../config/links';
import UnisLogo from '../../assets/unisLogoThree.svg';

const CARD_W = 1080;
const CARD_H = 1350;
const PAD = 88;
const INNER = CARD_W - PAD * 2;

/** A file name like unis-uptown-harlem-rap-artist-of-the-day-rapking.png */
const cardFileName = (card: any) => {
  const slug = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `unis-${slug(card.title)}-${slug(card.username)}.png`.replace(/-+/g, '-');
};

/** Greedy word wrap using an average glyph width (no canvas to measure on). */
const wrap = (text: string, size: number, ratio: number, maxWidth: number, maxLines: number) => {
  const per = Math.max(1, Math.floor(maxWidth / (size * ratio)));
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length <= per || !line) line = next;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, Math.max(1, per - 1))}…`;
  return kept;
};

const AwardCard = React.forwardRef<any, { card: any; width: number }>(({ card, width }, ref) => {
  const host = WEB_ORIGIN.replace(/^https?:\/\//, '');
  const kind = card.targetType === 'song' ? 'Song' : 'Artist';
  const award = `${kind} of the ${card.unit || 'Day'}`.toUpperCase();
  const where = [card.jurisdiction, card.genre].filter(Boolean).join(' · ');
  const song = card.targetType === 'song' && card.songTitle;
  const text = song ? `“${card.songTitle}”` : String(card.username || '');
  const maxLines = song ? 3 : 2;
  const top = 476;
  const bottom = 968;
  const room = bottom - top - (song ? 72 : 0);

  // Biggest size that fits, like web's loop.
  let size = song ? 150 : 190;
  let lines: string[] = [];
  for (; size >= 60; size -= 4) {
    lines = wrap(text, size, 0.46, INNER, 99);
    if (lines.length <= maxLines && size * 0.8 + (lines.length - 1) * size * 1.02 + size * 0.25 <= room) break;
  }
  lines = wrap(text, size, 0.46, INNER, maxLines);
  const y0 = top + size * 0.8;
  const byY = y0 + (lines.length - 1) * size * 1.02 + size * 0.25 + 56;
  const decided = wrap(`Decided by ${card.jurisdiction || 'the neighborhood'}'s votes, plays and likes`, 34, 0.5, INNER, 2);

  const bars = Array.from({ length: 36 }, (_, i) => 40 + ((Math.sin(i * 1.7) + 1) / 2) * 120 + ((i * 37) % 50));
  const barW = CARD_W / 36;

  return (
    <Svg ref={ref} width={width} height={(width * CARD_H) / CARD_W} viewBox={`0 0 ${CARD_W} ${CARD_H}`}>
      <Defs>
        <SvgLinear id="bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#07080c" />
          <Stop offset="1" stopColor="#0c1430" />
        </SvgLinear>
        <RadialGradient id="glow" cx={CARD_W * 0.78} cy={120} r={900} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="rgb(30,80,235)" stopOpacity={0.55} />
          <Stop offset="1" stopColor="rgb(30,80,235)" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={CARD_W} height={CARD_H} fill="url(#bg)" />
      <Rect x={0} y={0} width={CARD_W} height={CARD_H} fill="url(#glow)" />
      {bars.map((h, i) => (
        <Rect key={i} x={i * barW + 3} y={CARD_H - h} width={barW - 6} height={h} fill="rgb(30,80,235)" fillOpacity={0.28} />
      ))}
      <UnisLogo x={PAD} y={PAD} width={260} height={(260 * 224) / 950} viewBox="40 360 950 224" />
      <SvgText x={CARD_W - PAD} y={PAD + 44} fill="#fff" fontSize={34} fontWeight="700" textAnchor="end">{host}</SvgText>
      <SvgText x={PAD} y={360} fill="#8fa8ff" fontSize={34} fontWeight="700" letterSpacing={6}>{award}</SvgText>
      <SvgText x={PAD} y={420} fill="rgba(255,255,255,0.78)" fontSize={40} fontWeight="600">{wrap(where, 40, 0.52, INNER, 1)[0] || ''}</SvgText>
      {lines.map((l, i) => (
        <SvgText key={i} x={PAD} y={y0 + i * size * 1.02} fill="#fff" fontSize={size} fontFamily="Georgia">{l}</SvgText>
      ))}
      {song ? (
        <SvgText x={PAD} y={byY} fill="rgba(255,255,255,0.86)" fontSize={48} fontWeight="600">{wrap(`by ${card.username}`, 48, 0.52, INNER, 1)[0]}</SvgText>
      ) : null}
      <SvgText x={PAD} y={1036} fill="rgba(255,255,255,0.86)" fontSize={38} fontWeight="600">{card.periodLabel ? `For ${card.periodLabel}` : ''}</SvgText>
      {decided.map((l, i) => (
        <SvgText key={i} x={PAD} y={1084 + i * 44} fill="rgba(255,255,255,0.62)" fontSize={34}>{l}</SvgText>
      ))}
    </Svg>
  );
});

const AwardScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const t = useUnisTheme();
  const feedback = useFeedback();
  const { width } = useWindowDimensions();
  const awardId = route.params?.awardId;
  const svgRef = useRef<any>(null);
  const [card, setCard] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!awardId) return undefined;
    let cancelled = false;
    setCard(null);
    setError('');
    axiosInstance
      .get(`/v1/awards/${encodeURIComponent(awardId)}/card`)
      .then((res) => { if (!cancelled) setCard(res.data); })
      .catch((err) => {
        console.error('[Award] load failed:', err?.message);
        if (!cancelled) setError(err?.response?.status === 404 ? 'This award isn’t available.' : 'This award couldn’t load. Try again in a minute.');
      });
    return () => { cancelled = true; };
  }, [awardId]);

  const shareText = useMemo(() => {
    if (!card) return '';
    return `${card.title}: ${card.targetType === 'song' ? `“${card.songTitle}” by ${card.username}` : card.username}`;
  }, [card]);

  /** Renders the card to a PNG in the cache and returns its file URI. */
  const exportPng = (): Promise<string | null> =>
    new Promise((resolve) => {
      if (!svgRef.current?.toDataURL) { resolve(null); return; }
      svgRef.current.toDataURL(async (base64: string) => {
        try {
          const uri = `${FileSystem.cacheDirectory}${cardFileName(card)}`;
          await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
          resolve(uri);
        } catch (e) {
          console.error('[Award] card export failed:', e);
          resolve(null);
        }
      }, { width: CARD_W, height: CARD_H });
    });

  const shareImage = async (title: string) => {
    if (!card) return;
    setBusy(true);
    try {
      const uri = await exportPng();
      if (uri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: title, UTI: 'public.png' });
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('[Award] share failed:', err?.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const ok = await shareImage(card.title);
    if (ok) return;
    try {
      await Share.share({ message: `${shareText}\n${card.pageUrl}`, url: card.pageUrl, title: card.title });
    } catch {
      feedback.error("Couldn't open sharing. Use Copy link instead.");
    }
  };

  const save = async () => {
    const ok = await shareImage('Save award card');
    if (!ok) feedback.error("Couldn't prepare the image. Try again.");
  };

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(card.pageUrl);
      feedback.success('Link copied', { id: 'award-share' });
    } catch {
      feedback.info(`Copy this link: ${card.pageUrl}`);
    }
  };

  const openWinner = () => {
    if (!card) return;
    if (card.targetType === 'song' && card.songId) navigation.navigate('Song', { songId: card.songId });
    else if (card.artistId) navigation.navigate('Artist', { artistId: card.artistId });
  };

  const cardWidth = Math.min(width - 32, 520);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      {!card && !error && <ActivityIndicator color="#fff" style={{ marginTop: 60 }} />}

      {card && (
        <>
          <View style={styles.cardWrap} accessibilityLabel={`${card.title}: ${card.targetType === 'song' ? card.songTitle : card.username}`}>
            <AwardCard ref={svgRef} card={card} width={cardWidth} />
          </View>

          <Text style={[styles.kicker, { color: t.textAccent }]}>{card.title}</Text>
          <Text style={styles.name}>{card.targetType === 'song' ? `“${card.songTitle}”` : card.username}</Text>
          {card.targetType === 'song' && <Text style={styles.by}>by {card.username}</Text>}
          <Text style={styles.period}>For {card.periodLabel}</Text>

          {!!card.photoUrl && <Image source={{ uri: buildUrl(card.photoUrl) || undefined }} style={styles.photo} accessibilityLabel={card.username} />}

          <Text style={styles.note}>{card.jurisdiction}{'’'}s votes, plays and likes decided it.</Text>

          <View style={styles.actions}>
            <Pressable style={[styles.btn, { backgroundColor: t.primary }]} onPress={share} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Share</Text>}
            </Pressable>
            <Pressable style={styles.btnGhost} onPress={save} disabled={busy}><Text style={styles.btnText}>Save image</Text></Pressable>
            <Pressable style={styles.btnGhost} onPress={copy}><Text style={styles.btnText}>Copy link</Text></Pressable>
          </View>

          <View style={styles.links}>
            <Text style={[styles.link, { color: t.textAccent }]} onPress={openWinner}>
              {card.targetType === 'song' ? 'Play the song' : `See ${card.username}’s page`}
            </Text>
            <Text style={[styles.link, { color: t.textAccent }]} onPress={() => navigation.navigate('Vote')}>Vote in today{'’'}s races</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 160, alignItems: 'center' },
  error: { color: '#fca5a5', fontSize: 15, marginTop: 60, textAlign: 'center' },
  cardWrap: { borderRadius: 18, overflow: 'hidden', marginBottom: 18 },
  kicker: { fontSize: 12.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', alignSelf: 'stretch' },
  name: { color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: -0.6, alignSelf: 'stretch', marginTop: 4 },
  by: { color: 'rgba(255,255,255,0.75)', fontSize: 16, alignSelf: 'stretch', marginTop: 2 },
  period: { color: 'rgba(255,255,255,0.6)', fontSize: 14, alignSelf: 'stretch', marginTop: 6 },
  photo: { width: 120, height: 120, borderRadius: 60, marginTop: 16, alignSelf: 'flex-start' },
  note: { color: 'rgba(255,255,255,0.65)', fontSize: 14, alignSelf: 'stretch', marginTop: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignSelf: 'stretch', marginTop: 18 },
  btn: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999, minWidth: 96, alignItems: 'center' },
  btnGhost: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
  links: { alignSelf: 'stretch', gap: 12, marginTop: 22 },
  link: { fontSize: 15, fontWeight: '700' },
});

export default AwardScreen;
