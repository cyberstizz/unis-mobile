// src/components/DownloadModal.tsx
// ─────────────────────────────────────────────────────────────
// Mobile port of web src/DownloadModal.jsx — free downloads and purchases.
// Asks the server what this person may do (GET /v1/songs/{id}/download):
//   free / owned → the file downloads into the app, then the share sheet
//                  opens so it can be saved to Files / shared (web: browser
//                  download with the real "Artist - Title.mp3" name)
//   paid         → buying happens on unismusic.com (card details go to Stripe
//                  there). The app has no Stripe native module, and in-app
//                  sales of digital goods carry App Store rules — so the app
//                  hands off to the web checkout, then re-checks on return.
//   unavailable / removed → streaming only
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Check, DollarSign, Download, Lock, Sparkles } from 'lucide-react-native';
import Sheet from './ui/Sheet';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { useUnisTheme } from '../theme/unisTheme';
import { webUrl } from '../config/links';

interface SongArg {
  id?: string;
  title?: string;
  artist?: any;
  artworkUrl?: string | null;
  fileName?: string;
}

type Status = 'loading' | 'idle' | 'downloading' | 'complete' | 'error' | 'signin' | 'checkout';

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Unis track';

const DownloadModal: React.FC<{ isOpen: boolean; onClose: () => void; song: SongArg }> = ({ isOpen, onClose, song }) => {
  const t = useUnisTheme();
  const [status, setStatus] = useState<Status>('loading');
  const [info, setInfo] = useState<any>(null);
  const [message, setMessage] = useState('');
  const awaitingCheckout = useRef(false);

  const { id, title = 'Untitled', artist = 'Unknown Artist', artworkUrl, fileName } = song || {};
  const artistName = typeof artist === 'string' ? artist : artist?.name || artist?.username || 'Unknown Artist';
  const policy = info?.downloadPolicy || 'free';
  const owned = Boolean(info?.alreadyPurchased);
  const price = info?.price ?? null;
  const priceFormatted = price ? `$${(Number(price) / 100).toFixed(2)}` : 'Free';
  const file = safeName(fileName || `${artistName} - ${title}.mp3`);

  const loadInfo = useCallback(async () => {
    if (!id) {
      setMessage("This song can't be downloaded right now.");
      setStatus('error');
      return;
    }
    setStatus('loading');
    setMessage('');
    try {
      const res = await axiosInstance.get(`/v1/songs/${id}/download`);
      setInfo(res?.data || {});
      setStatus('idle');
    } catch (err: any) {
      const code = err?.response?.status;
      if (code === 401 || code === 403) setStatus('signin');
      else {
        console.error('[Download] info failed', id, code, err?.message);
        setMessage("We couldn't load this song's download options.");
        setStatus('error');
      }
    }
  }, [id]);

  useEffect(() => {
    if (!isOpen) return;
    setInfo(null);
    loadInfo();
  }, [isOpen, id, loadInfo]);

  // Back from the web checkout → ask the server again.
  useEffect(() => {
    if (!isOpen) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && awaitingCheckout.current) {
        awaitingCheckout.current = false;
        loadInfo();
      }
    });
    return () => sub.remove();
  }, [isOpen, loadInfo]);

  const download = async (rawUrl: string) => {
    setStatus('downloading');
    setMessage('');
    try {
      const url = buildUrl(rawUrl) || rawUrl;
      if (!url) throw new Error('No file address');
      const target = `${FileSystem.cacheDirectory}${file}`;
      const res = await FileSystem.downloadAsync(url, target);
      if (res.status && res.status >= 400) throw new Error(`File request returned ${res.status}`);
      setStatus('complete');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri, { mimeType: 'audio/mpeg', dialogTitle: `Save ${file}`, UTI: 'public.mp3' });
      }
    } catch (err: any) {
      console.error('[Download] save failed', id, err?.message);
      setMessage("We couldn't save the file. Please try again.");
      setStatus('error');
    }
  };

  const startCheckout = async () => {
    awaitingCheckout.current = true;
    setStatus('checkout');
    try {
      await Linking.openURL(webUrl(`/song/${id}`));
    } catch {
      awaitingCheckout.current = false;
      setMessage("Couldn't open unismusic.com. Try again.");
      setStatus('error');
    }
  };

  const art = buildUrl(artworkUrl || null);

  const body = () => {
    if (status === 'loading' || status === 'downloading') {
      return (
        <View style={styles.state}>
          <ActivityIndicator color={t.primary2} />
          <Text style={styles.copy}>{status === 'loading' ? 'Getting the download ready...' : 'Downloading...'}</Text>
        </View>
      );
    }
    if (status === 'signin') {
      return (
        <View style={styles.state}>
          <Text style={styles.stateTitle}>Sign in to download</Text>
          <Text style={styles.copy}>Downloads and purchases are saved to your Unis account.</Text>
          <Pressable style={styles.secondary} onPress={onClose}><Text style={styles.secondaryText}>Got it</Text></Pressable>
        </View>
      );
    }
    if (status === 'complete') {
      return (
        <View style={styles.state}>
          <View style={[styles.orb, { backgroundColor: t.primary }]}><Check size={22} color="#fff" /></View>
          <Text style={styles.stateTitle}>Download ready</Text>
          <Text style={styles.copy}>Saved as {file}. Use the share sheet to keep it in Files.</Text>
          <Pressable style={styles.secondary} onPress={onClose}><Text style={styles.secondaryText}>Done</Text></Pressable>
        </View>
      );
    }
    if (status === 'checkout') {
      return (
        <View style={styles.state}>
          <Text style={styles.stateTitle}>Finish on unismusic.com</Text>
          <Text style={styles.copy}>Tap Download on the song page to pay. Come back here when you're done and the download will be ready.</Text>
          <Pressable style={[styles.primary, { backgroundColor: t.primary }]} onPress={loadInfo}><Text style={styles.primaryText}>I've paid — check again</Text></Pressable>
        </View>
      );
    }
    if (status === 'error') {
      return (
        <View style={styles.state}>
          <Text style={styles.stateTitle}>Something went wrong</Text>
          <Text style={styles.copy}>{message || 'Please try again.'}</Text>
          <Pressable style={styles.secondary} onPress={loadInfo}><Text style={styles.secondaryText}>Try again</Text></Pressable>
        </View>
      );
    }
    if (info?.removed || policy === 'unavailable') {
      return (
        <>
          <View style={styles.badge}><Lock size={20} color="rgba(255,255,255,0.8)" /><Text style={styles.badgeText}>Streaming only</Text></View>
          <Text style={styles.description}>
            {info?.removed
              ? "This song was removed, so it can't be downloaded or bought."
              : 'The artist has not enabled downloads for this track. You can still keep it in rotation on Unis.'}
          </Text>
          <Pressable style={styles.secondary} onPress={onClose}><Text style={styles.secondaryText}>Got it</Text></Pressable>
        </>
      );
    }
    if (policy === 'paid' && !owned) {
      return (
        <>
          <View style={[styles.badge, { backgroundColor: t.soft }]}><DollarSign size={20} color="#fff" /><Text style={styles.badgeText}>{priceFormatted}</Text></View>
          <Text style={styles.description}>Own a high-quality copy of this track and support the artist directly.</Text>
          <View style={styles.notice}>
            <Sparkles size={16} color={t.primary2} />
            <Text style={styles.noticeText}>Digital downloads are final after purchase. You have already had the chance to preview this track on Unis.</Text>
          </View>
          <Pressable style={[styles.primary, { backgroundColor: t.primary }]} onPress={startCheckout}>
            <Text style={styles.primaryText}>Buy for {priceFormatted} on unismusic.com</Text>
          </Pressable>
          <Pressable style={styles.ghost} onPress={onClose}><Text style={styles.ghostText}>Not now</Text></Pressable>
          <Text style={styles.fine}>Card details go to Stripe. Unis never sees them. Stripe emails your receipt.</Text>
        </>
      );
    }
    return (
      <>
        <View style={[styles.badge, { backgroundColor: t.soft }]}>
          {owned ? <Check size={20} color="#fff" /> : <Download size={20} color="#fff" />}
          <Text style={styles.badgeText}>{owned ? 'You own this' : 'Free'}</Text>
        </View>
        <Text style={styles.description}>
          {owned
            ? 'You bought this track. Download it again any time.'
            : 'The artist made this track available for you to save and enjoy offline.'}
        </Text>
        <Pressable
          style={[styles.primary, { backgroundColor: t.primary }]}
          onPress={() => (info?.downloadUrl ? download(info.downloadUrl) : (setMessage("This song's file isn't available right now."), setStatus('error')))}
        >
          <Text style={styles.primaryText}>Download Track</Text>
        </Pressable>
        <Pressable style={styles.ghost} onPress={onClose}><Text style={styles.ghostText}>Cancel</Text></Pressable>
      </>
    );
  };

  return (
    <Sheet visible={isOpen} onClose={onClose} kicker={policy === 'paid' && !owned ? 'Buy' : 'Download'} title={title} subtitle={artistName}>
      {art ? <Image source={{ uri: art }} style={styles.art} /> : null}
      {body()}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  art: { width: 88, height: 88, borderRadius: 12, alignSelf: 'center', marginBottom: 14 },
  state: { alignItems: 'center', gap: 10, paddingVertical: 14 },
  stateTitle: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  copy: { color: 'rgba(255,255,255,0.65)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  orb: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  badge: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  description: { color: 'rgba(255,255,255,0.72)', fontSize: 14.5, lineHeight: 21, textAlign: 'center', marginVertical: 14 },
  notice: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', marginBottom: 14 },
  noticeText: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, lineHeight: 18, flex: 1 },
  primary: { minHeight: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 4 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondary: { minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'stretch', marginTop: 6 },
  secondaryText: { color: '#fff', fontWeight: '600', fontSize: 14.5 },
  ghost: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  ghostText: { color: 'rgba(255,255,255,0.6)', fontWeight: '600', fontSize: 14 },
  fine: { color: 'rgba(255,255,255,0.45)', fontSize: 11.5, textAlign: 'center', marginTop: 10 },
});

export default DownloadModal;
