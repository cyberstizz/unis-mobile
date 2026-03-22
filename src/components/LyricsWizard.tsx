import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import axiosInstance from '../services/axiosInstance';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// Use the same base URL as axiosInstance
const API_BASE_URL = 'https://unismvp-production.up.railway.app/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Song {
  songId?: string;
  id?: string;
  title: string;
  lyrics?: string;
}

interface LyricsWizardProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  song: Song | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

const LyricsWizard: React.FC<LyricsWizardProps> = ({
  visible,
  onClose,
  onSuccess,
  song,
}) => {
  const [lyrics, setLyrics] = useState(song?.lyrics || '');
  const [saving, setSaving] = useState(false);

  // Sync when a different song is passed in
  useEffect(() => {
    setLyrics(song?.lyrics || '');
  }, [song?.songId, song?.id]);

  const handleClose = () => {
    setLyrics(song?.lyrics || '');
    setSaving(false);
    onClose();
  };

  const handleSave = async () => {
    if (saving || !song) return;

    setSaving(true);
    try {
      const songId = song.songId || song.id;

      // FIX: Use fetch with FormData (same pattern as working photo upload).
      // axios + FormData in React Native has instanceof issues that cause
      // Content-Type to be set incorrectly, resulting in Network Errors.
      const token = await SecureStore.getItemAsync('token');

      const formData = new FormData();
      formData.append('lyrics', lyrics.trim());

      const response = await fetch(`${API_BASE_URL}/v1/media/song/${songId}`, {
        method: 'PATCH',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Failed to save lyrics: ${response.status}`);
      }

      onSuccess();
      handleClose();
    } catch (err) {
      console.error('Failed to save lyrics:', err);
      Alert.alert('Error', 'Failed to save lyrics. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!song) return null;

  const isEditing = !!song.lyrics;
  const lineCount = lyrics.split('\n').length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handleBar} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>
                {isEditing ? 'Edit' : 'Add'} Lyrics
              </Text>
              <Text style={styles.songName} numberOfLines={1}>
                {song.title}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Lyrics input */}
          <TextInput
            style={styles.lyricsInput}
            value={lyrics}
            onChangeText={setLyrics}
            multiline
            placeholder={
              'Enter lyrics here...\n(one line per verse, empty lines for breaks)'
            }
            placeholderTextColor="#444"
            textAlignVertical="top"
            scrollEnabled
            autoCorrect={false}
            autoCapitalize="sentences"
          />

          {/* Line count hint */}
          <Text style={styles.lineCount}>{lineCount} lines</Text>

          {/* Button row */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleClose}
              disabled={saving}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Save Lyrics</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.92,
    paddingBottom: Platform.OS === 'ios' ? 44 : 48,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  handleBar: {
    width: 40, height: 4, backgroundColor: '#333',
    borderRadius: 2, alignSelf: 'center',
    marginTop: 12, marginBottom: 4,
  },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#333',
  },
  headerText: { flex: 1, paddingRight: 12 },
  title: {
    color: '#FFFFFF', fontSize: 18, fontWeight: '700',
  },
  songName: {
    color: '#A9A9A9', fontSize: 13, marginTop: 2,
  },
  closeBtn: { padding: 4 },
  closeBtnText: { color: '#A9A9A9', fontSize: 18 },

  // Lyrics textarea — monospace to match web's font-family: monospace
  lyricsInput: {
    flex: 1,
    backgroundColor: '#222222',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 14,
    lineHeight: 22,
    padding: 16,
    margin: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#444',
    minHeight: SCREEN_HEIGHT * 0.45,
    maxHeight: SCREEN_HEIGHT * 0.55,
    textAlignVertical: 'top',
  },
  lineCount: {
    color: '#555', fontSize: 11,
    textAlign: 'right', paddingRight: 20,
    marginTop: -8, marginBottom: 4,
  },

  // Buttons
  buttonRow: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 20, paddingTop: 8,
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
  saveBtnDisabled: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: 'rgba(192,192,192,0.15)' },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});

export default LyricsWizard;