import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Platform,
  Dimensions,
  Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// Use the same base URL as axiosInstance
const API_BASE_URL = 'http://192.168.1.154:8080/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Song {
  songId: string;
  title: string;
  artworkUrl?: string;
  plays?: number;
  duration?: number; // ms
}

interface ChangeDefaultSongWizardProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
  songs: Song[];
  currentDefaultSongId?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ChangeDefaultSongWizard: React.FC<ChangeDefaultSongWizardProps> = ({
  visible,
  onClose,
  onSuccess,
  userId,
  songs,
  currentDefaultSongId,
}) => {
  const [selectedSongId, setSelectedSongId] = useState<string | null>(
    currentDefaultSongId ?? null
  );
  const [loading, setLoading] = useState(false);

  const noChange = selectedSongId === currentDefaultSongId;

  // ── Reset on close ──────────────────────────────────────────────────────────
  const handleClose = () => {
    setSelectedSongId(currentDefaultSongId ?? null);
    setLoading(false);
    onClose();
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (noChange || !selectedSongId) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      // FIX: Use fetch instead of axios for PATCH requests.
      // axios PATCH in React Native (especially in Expo Go) has known issues
      // with request handling that can cause silent Network Errors.
      const token = await SecureStore.getItemAsync('token');

      const response = await fetch(`${API_BASE_URL}/v1/users/default-song`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ defaultSongId: selectedSongId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to set featured song: ${response.status}`);
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Change default song error:', err);
      Alert.alert('Error', 'Failed to set featured song. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Format duration (ms → m:ss) ─────────────────────────────────────────────
  const formatDuration = (ms?: number): string => {
    if (!ms) return '0:00';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Empty state ─────────────────────────────────────────────────────────────
  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>🎵</Text>
      <Text style={styles.emptyTitle}>No Songs Yet</Text>
      <Text style={styles.emptySubtitle}>
        Upload your first song to set it as your featured track!
      </Text>
      <TouchableOpacity style={styles.gotItBtn} onPress={handleClose}>
        <Text style={styles.gotItBtnText}>Got It</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Song list ───────────────────────────────────────────────────────────────
  const renderSongList = () => (
    <>
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionHeader}>🎵  Choose Your Main Track</Text>

        {songs.map((song) => {
          const isSelected = song.songId === selectedSongId;
          const isCurrentDefault = song.songId === currentDefaultSongId;
          const artworkUri = song.artworkUrl ? getMediaUrl(song.artworkUrl) : null;

          return (
            <TouchableOpacity
              key={song.songId}
              style={[styles.songRow, isSelected && styles.songRowSelected]}
              onPress={() => setSelectedSongId(song.songId)}
              activeOpacity={0.75}
            >
              {/* Artwork */}
              {artworkUri ? (
                <Image source={{ uri: artworkUri }} style={styles.artwork} />
              ) : (
                <View style={styles.artworkPlaceholder}>
                  <Text style={styles.artworkPlaceholderText}>🎵</Text>
                </View>
              )}

              {/* Info */}
              <View style={styles.songInfo}>
                <Text style={styles.songTitle} numberOfLines={1}>
                  {song.title}
                </Text>
                <Text style={styles.songMeta}>
                  {song.plays ?? 0} plays · {formatDuration(song.duration)}
                </Text>
                {isCurrentDefault && (
                  <Text style={styles.currentBadge}>Current featured</Text>
                )}
              </View>

              {/* Check */}
              {isSelected && (
                <View style={styles.checkCircle}>
                  <Text style={styles.checkMark}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Button row */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={loading}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, (noChange || loading) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={noChange || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Save as Featured</Text>
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

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
            <Text style={styles.title}>Set Featured Song</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.intro}>
            This song will play when someone visits your profile across UNIS.
          </Text>

          {songs.length === 0 ? renderEmpty() : renderSongList()}
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
    paddingBottom: Platform.OS === 'ios' ? 44 : 48,
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
  title: {
    color: '#FFFFFF', fontSize: 20, fontWeight: '700', letterSpacing: 0.4,
  },
  closeBtn: { position: 'absolute', right: 20 },
  closeBtnText: { color: '#A9A9A9', fontSize: 18 },

  intro: {
    color: '#A9A9A9', fontSize: 13, lineHeight: 19,
    textAlign: 'center', paddingHorizontal: 24, marginBottom: 8,
  },

  // Scroll
  scrollArea: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },

  // Section header
  sectionHeader: {
    color: '#4facfe', fontSize: 14, fontWeight: '700',
    borderLeftWidth: 3, borderLeftColor: '#163387',
    paddingLeft: 10, marginBottom: 12,
  },

  // Song row
  songRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 12,
    borderWidth: 1.5, borderColor: 'rgba(192,192,192,0.1)',
    padding: 12, marginBottom: 10, gap: 12,
  },
  songRowSelected: {
    borderColor: '#163387',
    backgroundColor: 'rgba(22,51,135,0.15)',
  },

  // Artwork
  artwork: {
    width: 58, height: 58, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(192,192,192,0.15)',
  },
  artworkPlaceholder: {
    width: 58, height: 58, borderRadius: 8,
    backgroundColor: '#242424', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(192,192,192,0.1)',
  },
  artworkPlaceholderText: { fontSize: 24 },

  // Song info
  songInfo: { flex: 1, gap: 3 },
  songTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  songMeta: { color: '#A9A9A9', fontSize: 12 },
  currentBadge: {
    color: '#4facfe', fontSize: 11, fontWeight: '600', marginTop: 2,
  },

  // Check
  checkCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#163387', alignItems: 'center', justifyContent: 'center',
  },
  checkMark: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Empty state
  emptyState: {
    alignItems: 'center', paddingHorizontal: 32,
    paddingTop: 24, paddingBottom: 32, gap: 10,
  },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  emptySubtitle: {
    color: '#A9A9A9', fontSize: 14, textAlign: 'center', lineHeight: 20,
  },
  gotItBtn: {
    marginTop: 8, backgroundColor: '#163387',
    borderRadius: 12, paddingVertical: 13, paddingHorizontal: 40,
  },
  gotItBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

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

export default ChangeDefaultSongWizard;