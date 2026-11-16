// src/components/Uploadwizard.tsx
// ─────────────────────────────────────────────────────────────
// Mobile port of web src/uploadWizard.jsx.
//
//   Step 1 Type    — Song (MP3) or Video (MP4 / MOV / AVI); genre and
//                    jurisdiction come from the artist's profile
//   Step 2 Details — title, description, ISRC, Sound & discovery (songs),
//                    explicit toggle, download policy (Free / Paid ≥ 94¢ /
//                    No download), media file, cover artwork
//   Step 3 Review  — summary, the rights box (Terms 3.6), Upload now
//   Step 4 Clean   — explicit songs: optional clean version, linked to the
//                    explicit one with PATCH cleanVersionId
//
// Uploads go through utils/multipart (fetch, not axios — axios + FormData in
// React Native sets the boundary wrong) with a 10-minute ceiling so a 50 MB
// video can finish.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { CheckCircle, FileText, Music, Upload, Video, X } from 'lucide-react-native';
import SoundDiscoveryFields from './SoundDiscoveryFields';
import RightsConfirm from './RightsConfirm';
import { MIN_SONG_PRICE_CENTS, dollarsToCents, formatCents, priceHint } from '../utils/platformFee';
import {
  EMPTY_DISCOVERY,
  isDiscoveryComplete,
  discoveryProblem,
  toDiscoveryPayload,
  describeDiscovery,
  useTaxonomy,
  DiscoveryValue,
} from '../utils/taxonomy';
import { buildUrl } from '../utils/buildUrl';
import { useUnisTheme } from '../theme/unisTheme';
import { sendMultipart } from '../utils/multipart';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAX_MEDIA_MB = 50;
const MAX_ARTWORK_MB = 1;

const STEP_LABELS = ['Type', 'Details', 'Review'];

interface MediaAsset { uri: string; name: string; mimeType: string; size: number }
interface ArtworkAsset { uri: string; name: string; type: string; size: number }

interface UploadWizardProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (result?: any) => void;
  userId: string;
  defaultGenreId?: string;
  defaultJurisdictionId?: string;
  /** For the avatar + ambient photo in the header. */
  userProfile?: { photoUrl?: string | null; displayName?: string | null; username?: string | null };
}

const postMultipart = (url: string, body: FormData, method: 'POST' | 'PATCH' = 'POST') => sendMultipart(url, body, method);

const UploadWizard: React.FC<UploadWizardProps> = ({
  visible,
  onClose,
  onSuccess,
  userId,
  defaultGenreId = '00000000-0000-0000-0000-000000000101',
  defaultJurisdictionId = '00000000-0000-0000-0000-000000000002',
  userProfile,
}) => {
  const t = useUnisTheme();
  const { taxonomy } = useTaxonomy();
  const genreId = defaultGenreId;
  const jurisdictionId = defaultJurisdictionId;

  const [step, setStep] = useState(1);
  const [mediaType, setMediaType] = useState<'song' | 'video'>('song');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<MediaAsset | null>(null);
  const [artwork, setArtwork] = useState<ArtworkAsset | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isrc, setIsrc] = useState('');
  const [explicit, setExplicit] = useState(false);
  const [downloadPolicy, setDownloadPolicy] = useState<'free' | 'paid' | 'unavailable'>('free');
  const [downloadPrice, setDownloadPrice] = useState('');
  const [discovery, setDiscovery] = useState<DiscoveryValue>(EMPTY_DISCOVERY);
  const [showDiscoveryErrors, setShowDiscoveryErrors] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [showRightsAlert, setShowRightsAlert] = useState(false);

  const [uploadedSong, setUploadedSong] = useState<any>(null);
  const [cleanVersionChoice, setCleanVersionChoice] = useState<null | 'yes'>(null);
  const [cleanFile, setCleanFile] = useState<MediaAsset | null>(null);
  const [cleanLoading, setCleanLoading] = useState(false);

  const ambient = userProfile?.photoUrl ? buildUrl(userProfile.photoUrl) : null;
  const displayName = userProfile?.displayName || userProfile?.username || '';

  const resetWizard = () => {
    setStep(1); setMediaType('song'); setTitle(''); setDescription(''); setFile(null);
    setArtwork(null); setError(''); setLoading(false);
    setIsrc(''); setExplicit(false); setUploadedSong(null);
    setCleanVersionChoice(null); setCleanFile(null); setCleanLoading(false);
    setDownloadPolicy('free'); setDownloadPrice('');
    setDiscovery(EMPTY_DISCOVERY); setShowDiscoveryErrors(false);
    setRightsConfirmed(false); setShowRightsAlert(false);
  };

  useEffect(() => { if (!visible) resetWizard(); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    if (loading || cleanLoading) return;
    onClose();
  };

  const handleNext = () => {
    setError('');
    if (step === 2 && mediaType === 'song' && !isDiscoveryComplete(discovery)) {
      setShowDiscoveryErrors(true);
      setError(discoveryProblem(discovery));
      return;
    }
    if (step < 3) setStep(step + 1);
  };
  const handleBack = () => { setError(''); if (step > 1) setStep(step - 1); };

  // ── File picking ─────────────────────────────────────────
  const pickMedia = async (forClean = false) => {
    try {
      const type = forClean || mediaType === 'song' ? 'audio/*' : 'video/*';
      const result = await DocumentPicker.getDocumentAsync({ type, copyToCacheDirectory: true });
      if (result.canceled) return;
      const a = result.assets[0];
      const name = a.name || 'upload';
      const ext = name.split('.').pop()?.toLowerCase();
      const mime = a.mimeType || (forClean || mediaType === 'song' ? 'audio/mpeg' : 'video/mp4');
      const isSong = forClean || mediaType === 'song';
      const okSong = mime === 'audio/mpeg' || mime === 'audio/mp3' || ext === 'mp3';
      const okVideo = ['video/mp4', 'video/quicktime', 'video/x-msvideo'].includes(mime) || ['mp4', 'mov', 'avi'].includes(ext || '');
      if (isSong ? !okSong : !okVideo) {
        setError(forClean ? 'Clean version must be MP3' : `${mediaType} must be ${isSong ? 'MP3' : 'MP4 / MOV / AVI'}`);
        return;
      }
      if ((a.size ?? 0) > MAX_MEDIA_MB * 1024 * 1024) {
        setError(`File too large (max ${MAX_MEDIA_MB} MB)`);
        return;
      }
      const asset = { uri: a.uri, name, mimeType: isSong ? 'audio/mpeg' : mime, size: a.size ?? 0 };
      if (forClean) setCleanFile(asset);
      else setFile(asset);
      setError('');
    } catch (err) {
      console.error('Media pick error:', err);
      setError('Couldn’t open that file. Try again.');
    }
  };

  const pickArtwork = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (result.canceled) return;
    const a = result.assets[0];
    const mime = a.mimeType || 'image/jpeg';
    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(mime)) { setError('Artwork must be JPEG or PNG'); return; }
    if (a.fileSize && a.fileSize > MAX_ARTWORK_MB * 1024 * 1024) { setError('Artwork too large (max 1 MB)'); return; }
    setArtwork({ uri: a.uri, name: a.fileName || `artwork.${mime === 'image/png' ? 'png' : 'jpg'}`, type: mime === 'image/jpg' ? 'image/jpeg' : mime, size: a.fileSize || 0 });
    setError('');
  };

  // ── Upload ────────────────────────────────────────────────
  const handleUpload = async () => {
    setError('');
    if (!title || !file || !genreId || !jurisdictionId) { setError('All fields required'); return; }
    if (mediaType === 'song' && !isDiscoveryComplete(discovery)) { setError(discoveryProblem(discovery)); return; }
    if (downloadPolicy === 'paid' && !((dollarsToCents(downloadPrice) ?? 0) >= MIN_SONG_PRICE_CENTS)) {
      setError(`Minimum download price is ${formatCents(MIN_SONG_PRICE_CENTS)}`);
      return;
    }
    if (!rightsConfirmed) { setShowRightsAlert(true); return; }

    setLoading(true);
    try {
      const baseMetadata = { title, description, genreId, artistId: userId, jurisdictionId, rightsConfirmed: true };
      const metadata = mediaType === 'song'
        ? {
            ...baseMetadata,
            explicit,
            isrc: isrc || null,
            downloadPolicy,
            downloadPrice: downloadPolicy === 'paid' ? dollarsToCents(downloadPrice) : null,
            ...toDiscoveryPayload(discovery),
          }
        : baseMetadata;

      const formData = new FormData();
      formData.append(mediaType, JSON.stringify(metadata));
      formData.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
      if (artwork) formData.append('artwork', { uri: artwork.uri, name: artwork.name, type: artwork.type } as any);

      const data = await postMultipart(`/v1/media/${mediaType}`, formData);
      if (explicit && mediaType === 'song') {
        setUploadedSong(data);
        setStep(4);
      } else {
        onSuccess(data || { message: 'Upload successful' });
        onClose();
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err?.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCleanVersionUpload = async () => {
    if (!cleanFile) { setError('Please select a clean version audio file'); return; }
    setError('');
    setCleanLoading(true);
    try {
      const cleanMetadata = {
        title: `${title} (Clean)`,
        description,
        genreId,
        artistId: userId,
        jurisdictionId,
        explicit: false,
        isrc: null,
        isCleanVersion: true,
        rightsConfirmed: true,
        ...toDiscoveryPayload(discovery),
      };
      const fd = new FormData();
      fd.append('song', JSON.stringify(cleanMetadata));
      fd.append('file', { uri: cleanFile.uri, name: cleanFile.name, type: 'audio/mpeg' } as any);
      if (artwork) fd.append('artwork', { uri: artwork.uri, name: artwork.name, type: artwork.type } as any);
      const clean = await postMultipart('/v1/media/song', fd);

      const cleanSongId = clean?.songId;
      const explicitSongId = uploadedSong?.songId;
      if (cleanSongId && explicitSongId) {
        const link = new FormData();
        link.append('cleanVersionId', cleanSongId);
        await postMultipart(`/v1/media/song/${explicitSongId}`, link, 'PATCH');
      }
      onSuccess(uploadedSong || { message: 'Upload successful with clean version' });
      onClose();
    } catch (err: any) {
      console.error('Clean version upload error:', err);
      setError(err?.message || 'Clean version upload failed');
    } finally {
      setCleanLoading(false);
    }
  };

  const handleSkipCleanVersion = () => {
    onSuccess(uploadedSong || { message: 'Upload successful' });
    onClose();
  };

  // ── Pieces ────────────────────────────────────────────────
  const ErrorBox = () => (error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null);

  const FileZone: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
    <Pressable style={styles.fileZone} onPress={onPress} accessibilityRole="button">
      <Upload size={15} color="rgba(255,255,255,0.8)" />
      <Text style={styles.fileZoneText} numberOfLines={1}>{label}</Text>
    </Pressable>
  );

  const renderStep1 = () => (
    <>
      <Text style={styles.intro}>Your genre and jurisdiction are pre-filled from your profile.</Text>
      <ErrorBox />
      <Text style={styles.label}>Media type</Text>
      <View style={styles.typeRow}>
        {(['song', 'video'] as const).map((type) => {
          const on = mediaType === type;
          const Icon = type === 'song' ? Music : Video;
          return (
            <Pressable
              key={type}
              style={[styles.typeCard, on && { borderColor: t.primary, backgroundColor: t.soft }]}
              onPress={() => { setMediaType(type); setFile(null); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <Icon size={26} color={on ? '#fff' : 'rgba(255,255,255,0.6)'} />
              <Text style={[styles.typeLabel, on && { color: '#fff' }]}>{type === 'song' ? 'Song (MP3)' : 'Video (MP4 / MOV / AVI)'}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  const renderStep2 = () => (
    <>
      <Text style={styles.intro}>Add your title, description, and upload your file.</Text>
      <ErrorBox />

      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Enter song or video title" placeholderTextColor="rgba(255,255,255,0.35)" maxLength={120} />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={description}
        onChangeText={setDescription}
        placeholder="Brief description (optional)"
        placeholderTextColor="rgba(255,255,255,0.35)"
        multiline
        textAlignVertical="top"
      />

      <Text style={styles.label}>ISRC <Text style={styles.opt}>(optional)</Text></Text>
      <TextInput
        style={styles.input}
        value={isrc}
        onChangeText={(v) => setIsrc(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        placeholder="e.g. USRC17607839"
        placeholderTextColor="rgba(255,255,255,0.35)"
        maxLength={15}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Text style={styles.hint}>12-character International Standard Recording Code. You can add this later from your dashboard.</Text>

      {mediaType === 'song' && (
        <SoundDiscoveryFields
          genreId={genreId}
          value={discovery}
          onChange={(next) => { setDiscovery(next); if (error) setError(''); }}
          showErrors={showDiscoveryErrors}
        />
      )}

      {mediaType === 'song' && (
        <>
          <Pressable style={styles.toggleRow} onPress={() => setExplicit(!explicit)} accessibilityRole="switch" accessibilityState={{ checked: explicit }}>
            <Text style={styles.toggleLabel}>Explicit content</Text>
            <View style={[styles.track, explicit && { backgroundColor: t.primary }]}>
              <View style={[styles.thumb, explicit && { transform: [{ translateX: 18 }] }]} />
            </View>
          </Pressable>
          <Text style={styles.hint}>
            Mark as explicit if it contains strong language, violence, or adult themes.
            {explicit ? " After uploading, you'll be prompted to add an optional clean version." : ''}
          </Text>
        </>
      )}

      {mediaType === 'song' && (
        <>
          <Text style={styles.label}>Download availability</Text>
          <View style={styles.policyRow}>
            {([
              { value: 'free', label: 'Free' },
              { value: 'paid', label: 'Paid' },
              { value: 'unavailable', label: 'No download' },
            ] as const).map((opt) => {
              const on = downloadPolicy === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.policyBtn, on && { backgroundColor: t.primary, borderColor: t.primary }]}
                  onPress={() => { setDownloadPolicy(opt.value); if (opt.value !== 'paid') setDownloadPrice(''); }}
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
                value={downloadPrice}
                onChangeText={setDownloadPrice}
              />
            </View>
          )}
          <Text style={styles.hint}>
            {downloadPolicy === 'free' && 'Listeners can download this track for free.'}
            {downloadPolicy === 'paid' && priceHint(downloadPrice)}
            {downloadPolicy === 'unavailable' && 'Listeners can stream but not download this track.'}
          </Text>
        </>
      )}

      <View style={styles.sectionLabel}>
        {mediaType === 'song' ? <Music size={12} color="rgba(255,255,255,0.6)" /> : <Video size={12} color="rgba(255,255,255,0.6)" />}
        <Text style={styles.sectionLabelText}>{mediaType === 'song' ? 'Audio file' : 'Video file'}</Text>
      </View>
      <FileZone label={file ? file.name : `Choose ${mediaType === 'song' ? 'MP3' : 'MP4 / MOV / AVI'}`} onPress={() => pickMedia(false)} />
      {file && <Text style={styles.filePreview}>{file.name} — {(file.size / 1024 / 1024).toFixed(1)} MB</Text>}

      <View style={styles.sectionLabel}>
        <FileText size={12} color="rgba(255,255,255,0.6)" />
        <Text style={styles.sectionLabelText}>Cover artwork <Text style={styles.opt}>(optional)</Text></Text>
      </View>
      <FileZone label={artwork ? artwork.name : 'JPEG or PNG, max 1 MB'} onPress={pickArtwork} />
      {artwork && <Text style={styles.filePreview}>{artwork.name}{artwork.size ? ` — ${(artwork.size / 1024 / 1024).toFixed(1)} MB` : ''}</Text>}
    </>
  );

  const renderStep3 = () => {
    const d = describeDiscovery(discovery, taxonomy);
    const rows: [string, string][] = [
      ['Title', title],
      ['Description', description || '—'],
      ['File', file?.name || '—'],
      ['Artwork', artwork ? artwork.name : '—'],
      ['ISRC', isrc || '—'],
    ];
    if (mediaType === 'song') {
      rows.push(['Subgenre', d.subgenres], ['Mood', d.moods], ['Language', d.language], ['Explicit', explicit ? 'Yes' : 'No']);
      rows.push(['Download', downloadPolicy === 'free' ? 'Free' : downloadPolicy === 'paid' ? `$${parseFloat(downloadPrice || '0').toFixed(2)}` : 'Not available']);
    }
    return (
      <>
        <Text style={styles.intro}>Review everything before it goes live.</Text>
        <ErrorBox />
        <View style={styles.summary}>
          {rows.map(([k, v], i) => (
            <View key={k} style={[styles.summaryRow, i > 0 && styles.summaryDivider]}>
              <Text style={styles.summaryKey}>{k}</Text>
              <Text style={styles.summaryVal} numberOfLines={3}>{v}</Text>
            </View>
          ))}
        </View>
        {artwork && <Image source={{ uri: artwork.uri }} style={styles.artPreview} />}

        <RightsConfirm
          mediaType={mediaType}
          checked={rightsConfirmed}
          onChange={(value) => { setRightsConfirmed(value); if (value) setShowRightsAlert(false); }}
          showAlert={showRightsAlert}
        />

        <Text style={styles.warning}>This upload cannot be undone.</Text>
        <Pressable style={[styles.primary, { backgroundColor: t.primary }, loading && { opacity: 0.6 }]} onPress={handleUpload} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Upload now</Text>}
        </Pressable>
      </>
    );
  };

  const renderStep4 = () => (
    <>
      <Text style={styles.intro}>
        <Text style={{ color: '#fff', fontWeight: '800' }}>"{title}"</Text> has been uploaded. Would you like to add a clean version? This lets listeners with explicit content disabled still enjoy your music.
      </Text>
      <ErrorBox />
      {cleanVersionChoice === null ? (
        <>
          <Pressable style={[styles.primary, { backgroundColor: t.primary }]} onPress={() => setCleanVersionChoice('yes')}>
            <Text style={styles.primaryText}>Yes, upload a clean version</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={handleSkipCleanVersion}>
            <Text style={styles.secondaryText}>No, skip for now</Text>
          </Pressable>
          <Text style={[styles.hint, { textAlign: 'center', marginTop: 12 }]}>You can always add a clean version later from your dashboard.</Text>
        </>
      ) : (
        <>
          <Text style={styles.label}>Clean version audio (MP3)</Text>
          <FileZone label={cleanFile ? cleanFile.name : 'Choose MP3'} onPress={() => pickMedia(true)} />
          {cleanFile && <Text style={styles.filePreview}>{cleanFile.name} — {(cleanFile.size / 1024 / 1024).toFixed(1)} MB</Text>}
          <View style={styles.cleanInfo}>
            <Text style={styles.cleanInfoText}>
              The clean version will inherit the title ("{title} (Clean)"), artwork, genre, subgenre, mood, language and jurisdiction from the explicit version.
            </Text>
          </View>
          <Pressable
            style={[styles.primary, { backgroundColor: t.primary }, (!cleanFile || cleanLoading) && { opacity: 0.5 }]}
            onPress={handleCleanVersionUpload}
            disabled={!cleanFile || cleanLoading}
          >
            {cleanLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Upload clean version</Text>}
          </Pressable>
          <Pressable style={styles.secondary} onPress={handleSkipCleanVersion} disabled={cleanLoading}>
            <Text style={styles.secondaryText}>Skip</Text>
          </Pressable>
        </>
      )}
    </>
  );

  const eyebrow = ['', 'Step 1 of 3', 'Step 2 of 3', 'Step 3 of 3', 'Optional'][step];
  const heading = step === 3 ? ['Review ', 'upload'] : step === 4 ? ['Clean ', 'version'] : ['Upload ', mediaType];

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ justifyContent: 'flex-end' }}>
          <View style={[styles.sheet, { borderColor: t.border }]}>
            {!!ambient && <Image source={{ uri: ambient }} style={styles.ambient} blurRadius={40} />}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,12,18,0.86)' }]} />

            <View style={styles.header}>
              <View style={[styles.avatar, { backgroundColor: t.soft }]}>
                {ambient ? <Image source={{ uri: ambient }} style={StyleSheet.absoluteFill} /> : <Text style={[styles.avatarText, { color: t.textAccent }]}>{displayName ? displayName.charAt(0).toUpperCase() : '?'}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eyebrow, { color: t.textAccent }]}>{eyebrow}</Text>
                <Text style={styles.h2}>{heading[0]}<Text style={{ fontStyle: 'italic', color: t.textAccent }}>{heading[1]}</Text></Text>
              </View>
              <Pressable onPress={handleClose} style={styles.close} accessibilityLabel="Close" hitSlop={8}><X size={16} color="#fff" /></Pressable>
            </View>

            {step <= 3 && (
              <View style={styles.progress} accessibilityLabel="Upload progress">
                {STEP_LABELS.map((label, i) => {
                  const num = i + 1;
                  const done = step > num;
                  const active = step === num;
                  return (
                    <React.Fragment key={label}>
                      <View style={styles.progressItem}>
                        <View style={[styles.dot, (done || active) && { backgroundColor: t.primary, borderColor: t.primary }]}>
                          {done ? <CheckCircle size={13} color="#fff" /> : <Text style={[styles.dotText, active && { color: '#fff' }]}>{num}</Text>}
                        </View>
                        <Text style={[styles.dotLabel, active && { color: '#fff' }]}>{label}</Text>
                      </View>
                      {i < STEP_LABELS.length - 1 && <View style={[styles.line, done && { backgroundColor: t.primary }]} />}
                    </React.Fragment>
                  );
                })}
              </View>
            )}

            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {step === 1 && renderStep1()}
              {step === 2 && renderStep2()}
              {step === 3 && renderStep3()}
              {step === 4 && renderStep4()}
            </ScrollView>

            {step <= 2 && (
              <View style={styles.footer}>
                {step > 1 && (
                  <Pressable style={styles.back} onPress={handleBack}><Text style={styles.backText}>Back</Text></Pressable>
                )}
                <Pressable
                  style={[styles.next, { backgroundColor: t.primary }, step === 2 && (!title || !file) && { opacity: 0.45 }]}
                  onPress={handleNext}
                  disabled={step === 2 && (!title || !file)}
                >
                  <Text style={styles.primaryText}>{step === 2 ? 'Review' : 'Next'}</Text>
                </Pressable>
              </View>
            )}
            {step === 3 && (
              <View style={styles.footer}>
                <Pressable style={styles.back} onPress={handleBack} disabled={loading}><Text style={styles.backText}>Back</Text></Pressable>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: { maxHeight: SCREEN_HEIGHT * 0.92, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, overflow: 'hidden', backgroundColor: '#0b0d13', paddingBottom: Platform.OS === 'ios' ? 34 : 18 },
  ambient: { ...StyleSheet.absoluteFillObject, opacity: 0.5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '900', fontSize: 18 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  h2: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.4, marginTop: 2 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 8 },
  progressItem: { alignItems: 'center', gap: 4 },
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  dotText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '800' },
  dotLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10.5, fontWeight: '700' },
  line: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: 14, marginHorizontal: 6 },
  body: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12 },
  intro: { color: 'rgba(255,255,255,0.7)', fontSize: 13.5, lineHeight: 19, marginBottom: 6 },
  label: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  opt: { color: 'rgba(255,255,255,0.45)', fontWeight: '500' },
  input: { color: '#fff', fontSize: 15, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)' },
  textarea: { minHeight: 84 },
  hint: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 5, lineHeight: 16 },
  typeRow: { flexDirection: 'row', gap: 12 },
  typeCard: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 22, paddingHorizontal: 8, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)' },
  typeLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  toggleLabel: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  track: { width: 44, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.15)', padding: 3 },
  thumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  policyRow: { flexDirection: 'row', gap: 8 },
  policyBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  policyText: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', fontSize: 13.5 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)' },
  dollar: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '700' },
  priceInput: { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 11 },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, marginBottom: 6 },
  sectionLabelText: { color: 'rgba(255,255,255,0.6)', fontSize: 11.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  fileZone: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.03)' },
  fileZoneText: { color: 'rgba(255,255,255,0.85)', fontWeight: '600', fontSize: 14, flexShrink: 1 },
  filePreview: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 6 },
  summary: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 12, marginTop: 6 },
  summaryRow: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  summaryDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)' },
  summaryKey: { color: 'rgba(255,255,255,0.55)', fontSize: 13, width: 92 },
  summaryVal: { color: '#fff', fontSize: 13.5, flex: 1, fontWeight: '600' },
  artPreview: { width: 110, height: 110, borderRadius: 12, alignSelf: 'center', marginTop: 14 },
  warning: { color: '#fca5a5', fontSize: 12.5, textAlign: 'center', marginTop: 6, marginBottom: 12 },
  primary: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 6 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondary: { paddingVertical: 13, borderRadius: 14, alignItems: 'center', marginTop: 8, backgroundColor: 'rgba(255,255,255,0.07)' },
  secondaryText: { color: 'rgba(255,255,255,0.88)', fontWeight: '700', fontSize: 15 },
  cleanInfo: { padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 12 },
  cleanInfoText: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5, lineHeight: 18 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 10 },
  back: { paddingHorizontal: 20, paddingVertical: 13, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center' },
  backText: { color: 'rgba(255,255,255,0.88)', fontWeight: '700', fontSize: 15 },
  next: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center' },
  errorBox: { padding: 11, borderRadius: 12, backgroundColor: 'rgba(220,38,38,0.12)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.4)', marginVertical: 6 },
  errorText: { color: '#fca5a5', fontSize: 13, fontWeight: '600' },
});

export default UploadWizard;
