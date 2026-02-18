import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Song {
  songId: string;
  title: string;
  description?: string;
  artworkUrl?: string;
}

interface EditSongWizardProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  song: Song | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

const EditSongWizard: React.FC<EditSongWizardProps> = ({
  visible,
  onClose,
  onSuccess,
  song,
}) => {
  const [description, setDescription] = useState(song?.description || '');
  const [artworkUri, setArtworkUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Sync local state when song prop changes (different song opened)
  React.useEffect(() => {
    setDescription(song?.description || '');
    setArtworkUri(null);
  }, [song?.songId]);

  const previewUri = artworkUri ?? (song?.artworkUrl ? getMediaUrl(song.artworkUrl) : null);
  const hasChanges = !!artworkUri || description !== (song?.description || '');

  // ── Close ───────────────────────────────────────────────────────────────────
  const handleClose = () => {
    setDescription(song?.description || '');
    setArtworkUri(null);
    setLoading(false);
    onClose();
  };

  // ── Pick artwork ─────────────────────────────────────────────────────────────
  const handlePickArtwork = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to change artwork.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      setArtworkUri(result.assets[0].uri);
    }
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!hasChanges || !song) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();

      if (artworkUri) {
        formData.append('artwork', {
          uri: artworkUri,
          name: 'artwork.jpg',
          type: 'image/jpeg',
        } as any);
      }

      if (description !== (song?.description || '')) {
        formData.append('description', description.trim());
      }

      await axiosInstance.patch(`/v1/media/song/${song.songId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      onSuccess();
      handleClose();
    } catch (err) {
      console.error('Edit song error:', err);
      Alert.alert('Error', 'Failed to update song. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!song) return null;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handleBar} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Edit Song</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.intro}>
            Update artwork or description for{' '}
            <Text style={styles.songName}>"{song.title}"</Text>
          </Text>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Artwork ── */}
            <Text style={styles.sectionHeader}>🖼  Artwork</Text>

            <TouchableOpacity onPress={handlePickArtwork} style={styles.artworkWrapper}>
              {previewUri ? (
                <Image source={{ uri: previewUri }} style={styles.artwork} />
              ) : (
                <View style={styles.artworkPlaceholder}>
                  <Text style={styles.artworkPlaceholderEmoji}>🎵</Text>
                  <Text style={styles.artworkPlaceholderText}>No artwork</Text>
                </View>
              )}
              {/* Tap overlay */}
              <View style={styles.artworkOverlay}>
                <Text style={styles.artworkOverlayText}>Tap to change</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.pickBtn} onPress={handlePickArtwork}>
              <Text style={styles.pickBtnText}>⬆  Choose New Artwork</Text>
            </TouchableOpacity>

            {artworkUri && (
              <Text style={styles.selectedHint}>New artwork selected — tap Save to apply.</Text>
            )}

            {/* ── Description ── */}
            <Text style={[styles.sectionHeader, { marginTop: 24 }]}>✏️  Description</Text>

            <TextInput
              style={styles.textArea}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={500}
              placeholder="Describe your track, the inspiration behind it, or any credits..."
              placeholderTextColor="#555"
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{description.length} / 500</Text>
          </ScrollView>

          {/* Button row */}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={loading}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, (!hasChanges || loading) && styles.saveBtnDisabled]}
              onPress={handleSubmit}
              disabled={!hasChanges || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0D0D0F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.88,
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
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', letterSpacing: 0.4 },
  closeBtn: { position: 'absolute', right: 20 },
  closeBtnText: { color: '#A9A9A9', fontSize: 18 },

  intro: {
    color: '#A9A9A9', fontSize: 13, textAlign: 'center',
    paddingHorizontal: 24, marginBottom: 12, lineHeight: 19,
  },
  songName: { color: '#FFFFFF', fontWeight: '600' },

  // Scroll
  scrollArea: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },

  // Section headers
  sectionHeader: {
    color: '#4facfe', fontSize: 14, fontWeight: '700',
    borderLeftWidth: 3, borderLeftColor: '#163387',
    paddingLeft: 10, marginBottom: 12,
  },

  // Artwork
  artworkWrapper: {
    alignSelf: 'center', marginBottom: 12, position: 'relative',
  },
  artwork: {
    width: 150, height: 150, borderRadius: 12,
    borderWidth: 2, borderColor: 'rgba(22,51,135,0.4)',
  },
  artworkPlaceholder: {
    width: 150, height: 150, borderRadius: 12,
    backgroundColor: '#1a1a1a', borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.2)', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  artworkPlaceholderEmoji: { fontSize: 36 },
  artworkPlaceholderText: { color: '#555', fontSize: 13 },
  artworkOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    paddingVertical: 6, alignItems: 'center',
  },
  artworkOverlayText: { color: '#C0C0C0', fontSize: 11, fontWeight: '600' },

  // Pick button
  pickBtn: {
    borderWidth: 1, borderColor: 'rgba(192,192,192,0.3)',
    borderStyle: 'dashed', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
    backgroundColor: '#1a1a1a', marginBottom: 6,
  },
  pickBtnText: { color: '#C0C0C0', fontSize: 14, fontWeight: '600' },
  selectedHint: { color: '#4facfe', fontSize: 12, textAlign: 'center', marginBottom: 4 },

  // Description
  textArea: {
    backgroundColor: '#1a1a1a', borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.2)', borderRadius: 10,
    color: '#FFFFFF', fontSize: 15, padding: 14,
    minHeight: 130, lineHeight: 22,
  },
  charCount: { color: '#555', fontSize: 12, textAlign: 'right', marginTop: 4 },

  // Buttons
  buttonRow: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 20, paddingTop: 14,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#1a1a1a', borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.2)', alignItems: 'center',
  },
  cancelBtnText: { color: '#A9A9A9', fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#163387', alignItems: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: '#1a1a1a', borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.15)',
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});

export default EditSongWizard;