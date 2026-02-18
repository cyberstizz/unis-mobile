import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import axiosInstance from '../services/axiosInstance';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAX_AUDIO_MB = 50;
const MAX_ARTWORK_MB = 1;

// ─── Genre options (mirrors web genreId defaults) ─────────────────────────────
// Adjust UUIDs to match your backend seed data
const GENRES = [
  { label: 'Hip-Hop / Rap', value: '00000000-0000-0000-0000-000000000101' },
  { label: 'R&B / Soul', value: '00000000-0000-0000-0000-000000000102' },
  { label: 'Pop', value: '00000000-0000-0000-0000-000000000103' },
  { label: 'Electronic', value: '00000000-0000-0000-0000-000000000104' },
  { label: 'Gospel', value: '00000000-0000-0000-0000-000000000105' },
  { label: 'Latin', value: '00000000-0000-0000-0000-000000000106' },
  { label: 'Jazz', value: '00000000-0000-0000-0000-000000000107' },
  { label: 'Reggae', value: '00000000-0000-0000-0000-000000000108' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface AudioAsset {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

interface ArtworkAsset {
  uri: string;
  name: string;
}

interface UploadWizardProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void; // caller refreshes songs list
  userId: string;
  /** User's default genreId — pre-selects the genre picker */
  defaultGenreId?: string;
  /** User's home jurisdictionId — sent with upload */
  defaultJurisdictionId?: string;
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ['Type', 'Details', 'Artwork', 'Confirm'];

const StepIndicator: React.FC<{ current: number }> = ({ current }) => (
  <View style={si.row}>
    {STEPS.map((label, i) => {
      const stepNum = i + 1;
      const done = stepNum < current;
      const active = stepNum === current;
      return (
        <React.Fragment key={label}>
          <View style={si.item}>
            <View style={[si.dot, done && si.dotDone, active && si.dotActive]}>
              <Text style={[si.dotText, (done || active) && si.dotTextActive]}>
                {done ? '✓' : stepNum}
              </Text>
            </View>
            <Text style={[si.label, active && si.labelActive]}>{label}</Text>
          </View>
          {i < STEPS.length - 1 && <View style={[si.line, done && si.lineDone]} />}
        </React.Fragment>
      );
    })}
  </View>
);

const si = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  item: { alignItems: 'center', gap: 4 },
  dot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#1a1a1a', borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  dotActive: { backgroundColor: '#163387', borderColor: '#163387' },
  dotDone: { backgroundColor: '#4facfe', borderColor: '#4facfe' },
  dotText: { color: '#555', fontSize: 11, fontWeight: '700' },
  dotTextActive: { color: '#fff' },
  label: { color: '#555', fontSize: 10, fontWeight: '600' },
  labelActive: { color: '#C0C0C0' },
  line: { flex: 1, height: 1, backgroundColor: 'rgba(192,192,192,0.15)', marginBottom: 12 },
  lineDone: { backgroundColor: '#4facfe' },
});

// ─── Main component ───────────────────────────────────────────────────────────

const UploadWizard: React.FC<UploadWizardProps> = ({
  visible,
  onClose,
  onSuccess,
  userId,
  defaultGenreId = '00000000-0000-0000-0000-000000000101',
  defaultJurisdictionId = '00000000-0000-0000-0000-000000000002',
}) => {
  const [step, setStep] = useState(1);

  // Step 1
  const [mediaType, setMediaType] = useState<'song' | 'video'>('song');

  // Step 2
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genreId, setGenreId] = useState(defaultGenreId);
  const [audioAsset, setAudioAsset] = useState<AudioAsset | null>(null);

  // Step 3
  const [artworkAsset, setArtworkAsset] = useState<ArtworkAsset | null>(null);

  // Global
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showGenrePicker, setShowGenrePicker] = useState(false);

  // ── Reset ───────────────────────────────────────────────────────────────────

  const resetAll = () => {
    setStep(1);
    setMediaType('song');
    setTitle('');
    setDescription('');
    setGenreId(defaultGenreId);
    setAudioAsset(null);
    setArtworkAsset(null);
    setError('');
    setLoading(false);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  // ── Navigation ──────────────────────────────────────────────────────────────

  const validateStep = (): boolean => {
    setError('');
    if (step === 2) {
      if (!title.trim()) { setError('Please enter a title.'); return false; }
      if (!audioAsset) { setError(`Please select a ${mediaType} file.`); return false; }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    setError('');
    setStep((s) => s - 1);
  };

  // ── File picking ────────────────────────────────────────────────────────────

  const handlePickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: mediaType === 'song' ? 'audio/*' : 'video/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      const sizeMB = (asset.size ?? 0) / 1024 / 1024;

      if (sizeMB > MAX_AUDIO_MB) {
        setError(`File too large — max ${MAX_AUDIO_MB}MB. Yours is ${sizeMB.toFixed(1)}MB.`);
        return;
      }

      setAudioAsset({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? (mediaType === 'song' ? 'audio/mpeg' : 'video/mp4'),
        size: asset.size ?? 0,
      });
      setError('');
    } catch (err) {
      console.error('Audio pick error:', err);
      setError('Failed to pick file. Please try again.');
    }
  };

  const handlePickArtwork = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access for cover art.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    // Rough size check via fileSize if available
    if (asset.fileSize && asset.fileSize / 1024 / 1024 > MAX_ARTWORK_MB) {
      setError(`Artwork too large — max ${MAX_ARTWORK_MB}MB.`);
      return;
    }

    setArtworkAsset({
      uri: asset.uri,
      name: asset.fileName ?? 'artwork.jpg',
    });
    setError('');
  };

  // ── Upload ──────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!title || !audioAsset || !genreId) {
      setError('Missing required fields.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();

      // Metadata blob — matches backend expectation
      const metadata = {
        title: title.trim(),
        description: description.trim(),
        genreId,
        artistId: userId,
        jurisdictionId: defaultJurisdictionId,
      };
      formData.append(mediaType, JSON.stringify(metadata));

      // Audio/video file
      formData.append('file', {
        uri: audioAsset.uri,
        name: audioAsset.name,
        type: audioAsset.mimeType,
      } as any);

      // Artwork (optional)
      if (artworkAsset) {
        formData.append('artwork', {
          uri: artworkAsset.uri,
          name: artworkAsset.name,
          type: 'image/jpeg',
        } as any);
      }

      await axiosInstance.post(`/v1/media/${mediaType}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      onSuccess();
      handleClose();
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Genre label helper ──────────────────────────────────────────────────────

  const selectedGenreLabel = GENRES.find((g) => g.value === genreId)?.label ?? 'Select genre';

  // ── Render steps ────────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {
      // ── Step 1: Media type ─────────────────────────────────────────────────
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What are you uploading?</Text>
            <Text style={styles.intro}>Your genre and jurisdiction will be auto-applied.</Text>

            <View style={styles.typeRow}>
              {(['song', 'video'] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeCard, mediaType === type && styles.typeCardActive]}
                  onPress={() => setMediaType(type)}
                >
                  <Text style={styles.typeEmoji}>{type === 'song' ? '🎵' : '🎬'}</Text>
                  <Text style={[styles.typeLabel, mediaType === type && styles.typeLabelActive]}>
                    {type === 'song' ? 'Song\n(MP3 / WAV)' : 'Video\n(MP4 / MOV)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      // ── Step 2: Details + file ─────────────────────────────────────────────
      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>File & Details</Text>
            <Text style={styles.intro}>Add a title and select your {mediaType} file.</Text>

            <Text style={styles.fieldLabel}>Title *</Text>
            <TextInput
              style={styles.textInput}
              value={title}
              onChangeText={setTitle}
              placeholder={`Enter ${mediaType} title`}
              placeholderTextColor="#555"
              maxLength={120}
            />

            <Text style={styles.fieldLabel}>Description (optional)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Brief description..."
              placeholderTextColor="#555"
              multiline
              maxLength={300}
              textAlignVertical="top"
            />

            <Text style={styles.fieldLabel}>Genre</Text>
            <TouchableOpacity
              style={styles.pickerTrigger}
              onPress={() => setShowGenrePicker(true)}
            >
              <Text style={styles.pickerTriggerText}>{selectedGenreLabel}</Text>
              <Text style={styles.pickerChevron}>›</Text>
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>{mediaType === 'song' ? 'Audio' : 'Video'} File *</Text>
            <TouchableOpacity style={styles.pickBtn} onPress={handlePickAudio}>
              <Text style={styles.pickBtnText}>
                {audioAsset ? '✓  ' + audioAsset.name : `⬆  Choose ${mediaType === 'song' ? 'Audio' : 'Video'} File`}
              </Text>
            </TouchableOpacity>
            {audioAsset && (
              <Text style={styles.fileHint}>
                {(audioAsset.size / 1024 / 1024).toFixed(1)} MB selected
              </Text>
            )}
          </View>
        );

      // ── Step 3: Artwork ────────────────────────────────────────────────────
      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Cover Artwork</Text>
            <Text style={styles.intro}>Optional — JPEG or PNG, max 1MB, square crop recommended.</Text>

            {artworkAsset ? (
              <View style={styles.artworkPreviewWrapper}>
                <Image source={{ uri: artworkAsset.uri }} style={styles.artworkPreview} />
                <TouchableOpacity style={styles.changeArtworkBtn} onPress={handlePickArtwork}>
                  <Text style={styles.changeArtworkBtnText}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.artworkPlaceholder} onPress={handlePickArtwork}>
                <Text style={styles.artworkPlaceholderEmoji}>🖼</Text>
                <Text style={styles.artworkPlaceholderText}>Tap to add cover art</Text>
                <Text style={styles.artworkPlaceholderSub}>(optional)</Text>
              </TouchableOpacity>
            )}
          </View>
        );

      // ── Step 4: Confirm ────────────────────────────────────────────────────
      case 4:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Confirm Upload</Text>
            <Text style={styles.intro}>Review before submitting — this cannot be undone.</Text>

            <View style={styles.summaryCard}>
              <SummaryRow label="Type" value={mediaType.toUpperCase()} />
              <SummaryRow label="Title" value={title} />
              <SummaryRow label="Description" value={description || 'None'} />
              <SummaryRow label="Genre" value={selectedGenreLabel} />
              <SummaryRow label="File" value={audioAsset?.name ?? '—'} />
              <SummaryRow label="Artwork" value={artworkAsset ? artworkAsset.name : 'None'} />
            </View>

            {artworkAsset && (
              <Image source={{ uri: artworkAsset.uri }} style={styles.confirmArtwork} />
            )}

            <Text style={styles.warningText}>
              ⚠  Ensure this content belongs to you. Unauthorized uploads may be removed.
            </Text>
          </View>
        );

      default:
        return null;
    }
  };

  // ── Genre picker bottom sheet ───────────────────────────────────────────────

  const renderGenrePicker = () => (
    <Modal visible={showGenrePicker} transparent animationType="slide" onRequestClose={() => setShowGenrePicker(false)}>
      <TouchableOpacity style={styles.genreOverlay} activeOpacity={1} onPress={() => setShowGenrePicker(false)}>
        <View style={styles.genreSheet}>
          <View style={styles.handleBar} />
          <Text style={styles.genreSheetTitle}>Select Genre</Text>
          <ScrollView>
            {GENRES.map((g) => (
              <TouchableOpacity
                key={g.value}
                style={[styles.genreOption, genreId === g.value && styles.genreOptionActive]}
                onPress={() => { setGenreId(g.value); setShowGenrePicker(false); }}
              >
                <Text style={[styles.genreOptionText, genreId === g.value && styles.genreOptionTextActive]}>
                  {g.label}
                </Text>
                {genreId === g.value && <Text style={styles.genreCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // ── Root render ─────────────────────────────────────────────────────────────

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={handleClose}
      >
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardAvoid}
          >
            <View style={styles.sheet}>
              {/* Handle */}
              <View style={styles.handleBar} />

              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Upload {mediaType === 'song' ? 'Song' : 'Video'}</Text>
                <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Step indicator */}
              <StepIndicator current={step} />

              {/* Content */}
              <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {renderStep()}

                {/* Error */}
                {!!error && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}
              </ScrollView>

              {/* Button row */}
              <View style={styles.buttonRow}>
                {step > 1 ? (
                  <TouchableOpacity style={styles.backBtn} onPress={handleBack} disabled={loading}>
                    <Text style={styles.backBtnText}>Back</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={loading}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                )}

                {step < 4 ? (
                  <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
                    <Text style={styles.nextBtnText}>Next →</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.uploadBtn, loading && styles.uploadBtnDisabled]}
                    onPress={handleUpload}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.uploadBtnText}>Upload Now ⬆</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Genre picker lives outside main modal to avoid nesting issues */}
      {renderGenrePicker()}
    </>
  );
};

// ─── Summary row helper ───────────────────────────────────────────────────────

const SummaryRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.summaryRow}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={styles.summaryValue} numberOfLines={2}>{value}</Text>
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  keyboardAvoid: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0D0D0F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.9,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  handleBar: {
    width: 40, height: 4, backgroundColor: '#333',
    borderRadius: 2, alignSelf: 'center',
    marginTop: 12, marginBottom: 4,
  },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20, paddingVertical: 14, position: 'relative',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '700', letterSpacing: 0.4 },
  closeBtn: { position: 'absolute', right: 20 },
  closeBtnText: { color: '#A9A9A9', fontSize: 18 },

  // Scroll
  scrollArea: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },

  // Step content
  stepContent: { gap: 14 },
  stepTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 2 },
  intro: { color: '#A9A9A9', fontSize: 13, lineHeight: 19, marginBottom: 4 },

  // Media type cards
  typeRow: { flexDirection: 'row', gap: 12 },
  typeCard: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(192,192,192,0.15)',
    paddingVertical: 24, alignItems: 'center', gap: 8,
  },
  typeCardActive: { borderColor: '#163387', backgroundColor: 'rgba(22,51,135,0.2)' },
  typeEmoji: { fontSize: 32 },
  typeLabel: { color: '#A9A9A9', fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 18 },
  typeLabelActive: { color: '#FFFFFF' },

  // Form fields
  fieldLabel: { color: '#C0C0C0', fontSize: 13, fontWeight: '600', marginBottom: 4, marginTop: 4 },
  textInput: {
    backgroundColor: '#1a1a1a', borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.2)', borderRadius: 10,
    color: '#FFFFFF', fontSize: 15, paddingHorizontal: 14, paddingVertical: 12,
  },
  textArea: { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 },

  // Genre picker trigger
  pickerTrigger: {
    backgroundColor: '#1a1a1a', borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.2)', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  pickerTriggerText: { color: '#FFFFFF', fontSize: 15 },
  pickerChevron: { color: '#A9A9A9', fontSize: 20, fontWeight: '300' },

  // File pick button
  pickBtn: {
    borderWidth: 1, borderColor: 'rgba(192,192,192,0.3)',
    borderStyle: 'dashed', borderRadius: 10,
    paddingVertical: 16, alignItems: 'center', backgroundColor: '#1a1a1a',
  },
  pickBtnText: { color: '#C0C0C0', fontSize: 14, fontWeight: '600' },
  fileHint: { color: '#4facfe', fontSize: 12, textAlign: 'center', marginTop: 2 },

  // Artwork
  artworkPreviewWrapper: { alignItems: 'center', gap: 10 },
  artworkPreview: {
    width: 160, height: 160, borderRadius: 12,
    borderWidth: 2, borderColor: 'rgba(22,51,135,0.5)',
  },
  changeArtworkBtn: {
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(192,192,192,0.3)',
  },
  changeArtworkBtnText: { color: '#C0C0C0', fontSize: 13, fontWeight: '600' },
  artworkPlaceholder: {
    height: 160, borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.2)', borderStyle: 'dashed',
    backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  artworkPlaceholderEmoji: { fontSize: 36 },
  artworkPlaceholderText: { color: '#C0C0C0', fontSize: 14, fontWeight: '600' },
  artworkPlaceholderSub: { color: '#555', fontSize: 12 },

  // Confirmation
  summaryCard: {
    backgroundColor: '#1a1a1a', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(192,192,192,0.15)',
    overflow: 'hidden',
  },
  summaryRow: {
    flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: 'rgba(192,192,192,0.08)',
    gap: 10,
  },
  summaryLabel: { color: '#A9A9A9', fontSize: 13, fontWeight: '600', width: 80 },
  summaryValue: { color: '#FFFFFF', fontSize: 13, flex: 1 },
  confirmArtwork: {
    width: 100, height: 100, borderRadius: 10,
    alignSelf: 'center', marginTop: 12,
    borderWidth: 1, borderColor: 'rgba(192,192,192,0.2)',
  },
  warningText: { color: '#dc3545', fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 8 },

  // Error
  errorBox: {
    backgroundColor: 'rgba(220,53,69,0.15)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(220,53,69,0.4)',
    padding: 12, marginTop: 12,
  },
  errorText: { color: '#dc3545', fontSize: 13, textAlign: 'center' },

  // Buttons
  buttonRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 14 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#1a1a1a', borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.2)', alignItems: 'center',
  },
  cancelBtnText: { color: '#A9A9A9', fontSize: 15, fontWeight: '600' },
  backBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#1a1a1a', borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.2)', alignItems: 'center',
  },
  backBtnText: { color: '#A9A9A9', fontSize: 15, fontWeight: '600' },
  nextBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#163387', alignItems: 'center',
  },
  nextBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  uploadBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#163387', alignItems: 'center',
  },
  uploadBtnDisabled: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: 'rgba(192,192,192,0.15)' },
  uploadBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  // Genre picker sheet
  genreOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  genreSheet: {
    backgroundColor: '#0D0D0F', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.6, paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  genreSheetTitle: {
    color: '#FFFFFF', fontSize: 17, fontWeight: '700',
    textAlign: 'center', paddingVertical: 16,
  },
  genreOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: 'rgba(192,192,192,0.08)',
  },
  genreOptionActive: { backgroundColor: 'rgba(22,51,135,0.2)' },
  genreOptionText: { color: '#C0C0C0', fontSize: 15 },
  genreOptionTextActive: { color: '#FFFFFF', fontWeight: '700' },
  genreCheck: { color: '#4facfe', fontSize: 16, fontWeight: '700' },
});

export default UploadWizard;