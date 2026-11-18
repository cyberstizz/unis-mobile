// src/components/ui/Sheet.tsx
// ─────────────────────────────────────────────────────────────
// The one bottom sheet every new mobile surface uses (playlist wizard, queue,
// download, message settings, comments…). Web renders these as centred
// modals on desktop and slide-up sheets on phones; the app always uses the
// phone layout.
//
//   <Sheet visible={open} onClose={close} title="Add to…" fullHeight>
//     …
//   </Sheet>
//
// • Theme-aware surface (tinted with the user's theme like web's glass).
// • Renders <FeedbackToasts onlyAndroid /> so toasts show above it on
//   Android, where a Modal is its own window.
// ─────────────────────────────────────────────────────────────
import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CloseIcon } from '../../icons/UnisIcons';
import { FeedbackToasts } from '../../context/FeedbackContext';
import { mix, useUnisTheme } from '../../theme/unisTheme';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Eyebrow above the title (web "kicker"). */
  kicker?: string;
  /** Take ~92% of the screen height instead of sizing to content. */
  fullHeight?: boolean;
  /** Hide the header row entirely (custom header inside children). */
  bare?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
  contentStyle?: ViewStyle;
  dismissable?: boolean;
}

const Sheet: React.FC<SheetProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  kicker,
  fullHeight,
  bare,
  right,
  children,
  contentStyle,
  dismissable = true,
}) => {
  const insets = useSafeAreaInsets();
  const t = useUnisTheme();
  const surface = mix(t.primary, '#0e0f14', 0.93);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => dismissable && onClose()} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <Pressable style={styles.backdrop} onPress={() => dismissable && onClose()} accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            { backgroundColor: surface, paddingBottom: Math.max(insets.bottom, 14) },
            fullHeight && { height: '92%' },
            contentStyle,
          ]}
        >
          <View style={styles.handle} />
          {!bare && (
            <View style={styles.header}>
              <View style={{ flex: 1, minWidth: 0 }}>
                {!!kicker && <Text style={[styles.kicker, { color: t.textAccent }]}>{kicker}</Text>}
                {!!title && (
                  <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
                    {title}
                  </Text>
                )}
                {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
              </View>
              {right}
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={10}
                style={({ pressed }) => [styles.close, pressed && { backgroundColor: 'rgba(255,255,255,0.14)' }]}
              >
                <CloseIcon size={18} color="rgba(255,255,255,0.8)" />
              </Pressable>
            </View>
          )}
          <View style={[fullHeight && styles.flex]}>{children}</View>
        </View>
        <FeedbackToasts onlyAndroid topOffset={insets.top + 12} />
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3,4,8,0.62)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '92%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 3 },
  title: { color: '#fff', fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 3, lineHeight: 18 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
});

export default Sheet;
