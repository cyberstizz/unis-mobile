// src/components/PlayChoiceModal.tsx
// Mobile port of web src/PlayChoiceModal.jsx.
//
// Reads `playChoiceModal` state from PlayerContext. Renders a bottom-anchored
// sheet with three options: Play Now (insert after current + jump),
// Add to Queue (append to end), Cancel.
//
// Mount this once globally — recommended spot is App.tsx's AppContent,
// alongside <Player />.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Play, ListPlus, X } from 'lucide-react-native';

import { usePlayer } from '../context/PlayerContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  bgSurface: '#111114',
  bgElevated: '#18181c',
  bgHover: '#1f1f24',
  textPrimary: '#f0f0f2',
  textSecondary: 'rgba(255,255,255,0.55)',
  textTertiary: 'rgba(255,255,255,0.35)',
  borderSubtle: 'rgba(255,255,255,0.08)',
  unisBlue: '#163387',
  unisBlueBright: '#1c41ad',
  backdrop: 'rgba(0,0,0,0.6)',
};

const PlayChoiceModal: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {
    playChoiceModal,
    confirmPlayNow,
    confirmAddToQueue,
    cancelPlayChoice,
    queue,
  } = usePlayer();

  const { open, pendingSong } = playChoiceModal;

  if (!open || !pendingSong) return null;

  const songTitle = pendingSong.title || 'this track';
  const songArtist =
    (pendingSong as any).artistName || pendingSong.artist || '';

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={cancelPlayChoice}
    >
      <Pressable style={styles.backdrop} onPress={cancelPlayChoice}>
        {/* Pressable with stopPropagation behavior: tapping the sheet itself
            shouldn't close. We wrap the sheet in a non-touch-forwarding View. */}
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>What would you like to do?</Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              <Text style={styles.songTitle}>{songTitle}</Text>
              {songArtist ? <Text> · {songArtist}</Text> : null}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.option, styles.optionPrimary]}
            onPress={confirmPlayNow}
            activeOpacity={0.8}
          >
            <View style={styles.optionIcon}>
              <Play size={20} color="#fff" fill="#fff" />
            </View>
            <View style={styles.optionBody}>
              <Text style={styles.optionLabel}>Play Now</Text>
              <Text style={styles.optionDescription}>
                Plays next and jumps to it
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.option}
            onPress={confirmAddToQueue}
            activeOpacity={0.8}
          >
            <View style={[styles.optionIcon, styles.optionIconSecondary]}>
              <ListPlus size={20} color={COLORS.textPrimary} />
            </View>
            <View style={styles.optionBody}>
              <Text style={styles.optionLabel}>Add to Queue</Text>
              <Text style={styles.optionDescription}>
                {queue.length > 0
                  ? `Appends after ${queue.length} track${queue.length === 1 ? '' : 's'}`
                  : 'Appends to the end of the queue'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={cancelPlayChoice}
            activeOpacity={0.7}
          >
            <X size={16} color={COLORS.textSecondary} />
            <Text style={styles.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.backdrop,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.bgSurface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: 16,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  songTitle: {
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgElevated,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  optionPrimary: {
    backgroundColor: COLORS.unisBlue,
    borderColor: COLORS.unisBlueBright,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  optionIconSecondary: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  optionBody: {
    flex: 1,
  },
  optionLabel: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  optionDescription: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 6,
  },
  cancelLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
});

export default PlayChoiceModal;