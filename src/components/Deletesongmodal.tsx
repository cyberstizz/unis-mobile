import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeleteSongModalProps {
  visible: boolean;
  songTitle?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

const DeleteSongModal: React.FC<DeleteSongModalProps> = ({
  visible,
  songTitle,
  onConfirm,
  onCancel,
  isDeleting,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Icon */}
          <Text style={styles.icon}>🗑</Text>

          {/* Title */}
          <Text style={styles.title}>Delete Song</Text>

          {/* Body */}
          <Text style={styles.body}>
            Are you sure you want to delete{' '}
            <Text style={styles.songName}>"{songTitle}"</Text>?
            {'\n\n'}This action cannot be undone.
          </Text>

          {/* Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              disabled={isDeleting}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deleteBtn, isDeleting && styles.deleteBtnDisabled]}
              onPress={onConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.deleteBtnText}>Delete</Text>
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
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    backgroundColor: '#0D0D0F',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(220,53,69,0.3)',
  },
  icon: { fontSize: 44, marginBottom: 12 },
  title: {
    color: '#dc3545',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  body: {
    color: '#A9A9A9',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  songName: { color: '#FFFFFF', fontWeight: '600' },
  buttonRow: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    backgroundColor: '#1a1a1a', borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.2)', alignItems: 'center',
  },
  cancelBtnText: { color: '#A9A9A9', fontSize: 15, fontWeight: '600' },
  deleteBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    backgroundColor: '#dc3545', alignItems: 'center',
  },
  deleteBtnDisabled: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: 'rgba(192,192,192,0.15)' },
  deleteBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});

export default DeleteSongModal;