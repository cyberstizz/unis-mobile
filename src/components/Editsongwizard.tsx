// src/components/Editsongwizard.tsx
// ─────────────────────────────────────────────────────────────
// Mobile port of web src/editSongWizard.jsx.
//   PATCH /v1/media/song/:songId            — artwork, description, isrc (multipart)
//   PATCH /v1/media/song/:songId/discovery  — subgenre, mood, language (JSON)
//   PUT   /v1/songs/:songId/download-settings — policy + price (integer cents)
// Inline validation (minimum paid price 94¢, discovery complete), toast on save.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AlertCircle, Download, Image as ImageIcon, Music, ShieldCheck, Type, Upload, X } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { sendMultipart } from '../utils/multipart';
import { useFeedback } from '../context/FeedbackContext';
import { useUnisTheme } from '../theme/unisTheme';
import SoundDiscoveryFields from './SoundDiscoveryFields';
import { MIN_SONG_PRICE_CENTS, dollarsToCents, formatCents, priceHint } from '../utils/platformFee';
import { discoveryFromSong, isDiscoveryComplete, discoveryProblem, toDiscoveryPayload, DiscoveryValue } from '../utils/taxonomy';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface EditSongWizardProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  song: any | null;
  /** Used when the song record doesn't carry its genre. */
  fallbackGenreId?: string;
}

const POLICY_OPTIONS = [
  { value: 'free', label: 'Free Download' },
  { value: 'paid', label: 'Paid Download' },
  { value: 'unavailable', label: 'No Download' },
] as const;

const priceFrom = (song: any) => (song?.downloadPrice ? (song.downloadPrice / 100).toFixed(2) : '');

const EditSongWizard: React.FC<EditSongWizardProps> = ({ visible, onClose, onSuccess, song, fallbackGenreId }) => {
  const t = useUnisTheme();
  const feedback = useFeedback();
  const [description, setDescription] = useState(song?.description || '');
  const [artwork, setArtwork] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [isrc, setIsrc] = useState(song?.isrc || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadPolicy, setDownloadPolicy] = useState<string>(song?.downloadPolicy || 'free');
  const [downloadPrice, setDownloadPrice] = useState(priceFrom(song));
  const [discovery, setDiscovery] = useState<DiscoveryValue>(() => discoveryFromSong(song));
  const [showDiscoveryErrors, setShowDiscoveryErrors] = useState(false);

  // Re-sync when the wizard opens for a (possibly different) song.
  useEffect(() => {
    if (visible) {
      setDescription(song?.description || '');
      setArtwork(null);
      setIsrc(song?.isrc || '');
      setError(null);
      setDownloadPolicy(song?.downloadPolicy || 'free');
      setDownloadPrice(priceFrom(song));
      setDiscovery(discoveryFromSong(song));
      setShowDiscoveryErrors(false);
    }
  }, [visible, song?.songId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!song) return null;

  const preview = artwork?.uri || buildUrl(song.artworkUrl);
  const genreId = song.genre?.genreId || song.genreId || fallbackGenreId || '';

  const pickArtwork = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    const type = a.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    setArtwork({ uri: a.uri, name: a.fileName || (type === 'image/png' ? 'artwork.png' : 'artwork.jpg'), type });
    setError(null);
  };

  // Songs uploaded before subgenres existed have none; saving here tags them.
  const discoveryChanged = JSON.stringify(toDiscoveryPayload(discovery)) !== JSON.stringify(toDiscoveryPayload(discoveryFromSong(song)));
  const origDescription = song.description || '';
  const hasChanges = !!artwork
    || discoveryChanged
    || description !== origDescription
    || isrc !== (song.isrc || '')
    || downloadPolicy !== (song.downloadPolicy || 'free')
    || (downloadPolicy === 'paid' && downloadPrice !== ((song.downloadPrice || 0) / 100).toFixed(2));

  const handleSubmit = async () => {
    if (!hasChanges) { onClose(); return; }
    if (downloadPolicy === 'paid' && !((dollarsToCents(downloadPrice) ?? 0) >= MIN_SONG_PRICE_CENTS)) {
      setError(`Minimum download price is ${formatCents(MIN_SONG_PRICE_CENTS)}.`);
      return;
    }
    if (discoveryChanged && !isDiscoveryComplete(discovery)) {
      setShowDiscoveryErrors(true);
      setError(discoveryProblem(discovery));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // 1. Description, artwork, isrc
      const hasMediaChanges = !!artwork || description !== origDescription || isrc !== (song.isrc || '');
      if (hasMediaChanges) {
        const fd = new FormData();
        if (artwork) fd.append('artwork', { uri: artwork.uri, name: artwork.name, type: artwork.type } as any);
        if (description !== origDescription) fd.append('description', description);
        if (isrc !== (song.isrc || '')) fd.append('isrc', isrc || '');
        await sendMultipart(`/v1/media/song/${song.songId}`, fd, 'PATCH', 60000);
      }
      // 2. Subgenre / mood / language
      if (discoveryChanged) {
        await axiosInstance.patch(`/v1/media/song/${song.songId}/discovery`, toDiscoveryPayload(discovery));
      }
      // 3. Download settings
      const policyChanged = downloadPolicy !== (song.downloadPolicy || 'free');
      const priceChanged = downloadPolicy === 'paid' && downloadPrice !== ((song.downloadPrice || 0) / 100).toFixed(2);
      if (policyChanged || priceChanged) {
        await axiosInstance.put(`/v1/songs/${song.songId}/download-settings`, {
          downloadPolicy,
          downloadPrice: downloadPolicy === 'paid' ? Math.round(parseFloat(downloadPrice) * 100) : null,
        });
      }
      feedback.success(`“${song.title}” updated`);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to update song:', err);
      setError(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to update the song. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { borderColor: t.border }]}>
            <View style={styles.header}>
              <View style={[styles.icon, { backgroundColor: t.soft }]}><Music size={17} color={t.textAccent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eyebrow, { color: t.textAccent }]}>Edit song</Text>
                <Text style={styles.h2} numberOfLines={1}>{song.title}</Text>
              </View>
              <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Close" hitSlop={8}><X size={16} color="#fff" /></Pressable>
            </View>

            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {!!error && (
                <View style={styles.error} accessibilityRole="alert">
                  <AlertCircle size={15} color="#fca5a5" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <View style={styles.labelRow}><ImageIcon size={13} color="rgba(255,255,255,0.7)" /><Text style={styles.label}>Artwork</Text></View>
              <View style={styles.artwork}>
                {preview ? <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} /> : <Music size={38} color="rgba(255,255,255,0.4)" />}
              </View>
              <Pressable style={styles.fileBtn} onPress={pickArtwork}>
                <Upload size={15} color="#fff" />
                <Text style={styles.fileBtnText}>Choose New Artwork</Text>
              </Pressable>
              {artwork && <Text style={styles.hint}>Selected: {artwork.name}</Text>}

              <View style={styles.labelRow}><Type size={13} color="rgba(255,255,255,0.7)" /><Text style={styles.label}>Description</Text></View>
              <TextInput
                style={[styles.input, { minHeight: 96 }]}
                value={description}
                onChangeText={setDescription}
                multiline
                textAlignVertical="top"
                maxLength={500}
                placeholder="Describe your track, the inspiration behind it, or any credits..."
                placeholderTextColor="rgba(255,255,255,0.35)"
              />
              <Text style={[styles.hint, { textAlign: 'right' }]}>{description.length}/500</Text>

              <View style={styles.labelRow}><ShieldCheck size={13} color="rgba(255,255,255,0.7)" /><Text style={styles.label}>ISRC</Text></View>
              <TextInput
                style={styles.input}
                value={isrc}
                onChangeText={(v) => setIsrc(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="e.g., USRC17607839"
                placeholderTextColor="rgba(255,255,255,0.35)"
                maxLength={15}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <Text style={styles.hint}>12-character International Standard Recording Code</Text>

              <SoundDiscoveryFields genreId={genreId} value={discovery} onChange={(next) => { setDiscovery(next); setError(null); }} showErrors={showDiscoveryErrors} />

              <View style={styles.labelRow}><Download size={13} color="rgba(255,255,255,0.7)" /><Text style={styles.label}>Download Availability</Text></View>
              <View style={styles.policyRow}>
                {POLICY_OPTIONS.map((opt) => {
                  const on = downloadPolicy === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.policyBtn, on && { backgroundColor: t.primary, borderColor: t.primary }]}
                      onPress={() => { setDownloadPolicy(opt.value); if (opt.value !== 'paid') setDownloadPrice(''); setError(null); }}
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.policyText, on && { color: '#fff' }]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {downloadPolicy === 'paid' && (
                <View style={styles.priceRow}>
                  <Text style={styles.dollar}>$</Text>
                  <TextInput
                    style={styles.priceInput}
                    keyboardType="decimal-pad"
                    placeholder={(MIN_SONG_PRICE_CENTS / 100).toFixed(2)}
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    accessibilityLabel="Download price in dollars"
                    value={downloadPrice}
                    onChangeText={(v) => { setDownloadPrice(v); setError(null); }}
                  />
                </View>
              )}
              <Text style={styles.hint}>
                {downloadPolicy === 'free' && 'Listeners can download this track for free.'}
                {downloadPolicy === 'paid' && priceHint(downloadPrice)}
                {downloadPolicy === 'unavailable' && 'Listeners can stream but not download this track.'}
              </Text>
            </ScrollView>

            <View style={styles.footer}>
              <Pressable style={styles.back} onPress={onClose}><Text style={styles.backText}>Cancel</Text></Pressable>
              <Pressable
                style={[styles.save, { backgroundColor: t.primary }, (loading || !hasChanges) && { opacity: 0.5 }]}
                onPress={handleSubmit}
                disabled={loading || !hasChanges}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Changes</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: { maxHeight: SCREEN_HEIGHT * 0.92, backgroundColor: '#0b0d13', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingBottom: Platform.OS === 'ios' ? 34 : 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, paddingBottom: 10 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  h2: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 2 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 18, paddingBottom: 12 },
  error: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 11, borderRadius: 12, backgroundColor: 'rgba(220,38,38,0.12)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.4)', marginBottom: 8 },
  errorText: { color: '#fca5a5', fontSize: 13, fontWeight: '600', flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 7 },
  label: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700' },
  artwork: { width: 150, height: 150, borderRadius: 14, overflow: 'hidden', alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  fileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.25)' },
  fileBtnText: { color: '#fff', fontWeight: '700' },
  input: { color: '#fff', fontSize: 15, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)' },
  hint: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 5 },
  policyRow: { flexDirection: 'row', gap: 8 },
  policyBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  policyText: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', fontSize: 12.5, textAlign: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)' },
  dollar: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '700' },
  priceInput: { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 11 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 10 },
  back: { paddingHorizontal: 20, paddingVertical: 13, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)' },
  backText: { color: 'rgba(255,255,255,0.88)', fontWeight: '700', fontSize: 15 },
  save: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

export default EditSongWizard;
