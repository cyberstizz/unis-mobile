// src/context/FeedbackContext.tsx
// ─────────────────────────────────────────────────────────────
// Unis feedback — the "it went through" layer. Mobile port of web
// src/context/FeedbackContext.jsx (same API, same copy rules).
//
//   const feedback = useFeedback();
//   feedback.success('Playlist created');
//   feedback.error(errorMessage(err, "Couldn't create the playlist."));
//   feedback.info('Removed from queue', { action: { label: 'Undo', onClick: undo } });
//   if (await feedback.confirm({ title: 'Delete playlist?', message: '…',
//                                confirmLabel: 'Delete', danger: true })) { … }
//
// RULES (same as web):
//   • Success copy is past tense and names the thing: "Added to Late Night".
//   • Error copy says what failed and what to do: "Couldn't …. Try again."
//     Prefer errorMessage(err, fallback).
//   • When the "+N pts" reward pill already fires for an action (play, like,
//     vote), that pill IS the confirmation — no toast on top of it.
//   • Toasts sit at the top of the screen; the reward pill keeps the bottom.
//
// Native notes:
//   • Replaces Alert.alert for confirmations and results.
//   • iOS: toasts render in a FullWindowOverlay so they show above open sheets.
//     Android: a sheet (RN Modal) is its own window, so sheets that want
//     toasts on top render <FeedbackToasts /> inside themselves.
//   • useFeedback() is safe outside the provider: calls no-op, confirm → true.
// ─────────────────────────────────────────────────────────────
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { buildTheme, mix } from '../theme/unisTheme';
import { useAuth } from './AuthContext';

type Kind = 'success' | 'error' | 'info';

export interface FeedbackAction {
  label: string;
  onClick?: () => void;
}

export interface FeedbackOptions {
  id?: string;
  duration?: number;
  action?: FeedbackAction | null;
}

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ToastItem {
  id: string;
  kind: Kind;
  message: string;
  action: FeedbackAction | null;
  duration: number;
  bump: number;
  leaving?: boolean;
}

export interface FeedbackApi {
  success: (message: string, opts?: FeedbackOptions) => string | null;
  error: (message: string, opts?: FeedbackOptions) => string | null;
  info: (message: string, opts?: FeedbackOptions) => string | null;
  dismiss: (id: string) => void;
  confirm: (request: ConfirmRequest) => Promise<boolean>;
}

const MAX_ON_SCREEN = 3;
const DURATION: Record<Kind, number> = { success: 3000, info: 3200, error: 5200 };
const ACTION_DURATION = 5600;
const EXIT_MS = 220;

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * The server's own message for a 4xx response, otherwise `fallback`.
 * 5xx / network errors never leak raw text.
 */
export function errorMessage(error: any, fallback = 'Something went wrong. Try again.'): string {
  const status = error?.response?.status;
  const data = error?.response?.data;
  if (status === 429) return 'Slow down a little — try again in a moment.';
  if (!error?.response && error?.request) return "You're offline or the connection dropped. Try again.";
  const message = typeof data === 'string' ? data : data && (data.message || data.error);
  return status && status < 500 && typeof message === 'string' && message.trim() && message.length < 200
    ? message
    : fallback;
}

const NOOP: FeedbackApi = {
  success: () => null,
  error: () => null,
  info: () => null,
  dismiss: () => {},
  confirm: () => Promise.resolve(true),
};

const FeedbackContext = createContext<FeedbackApi | null>(null);
// Toast list lives in its own context so <FeedbackToasts /> can be mounted
// in more than one place (root + inside Android sheets).
const ToastStateContext = createContext<{ toasts: ToastItem[]; dismiss: (id: string) => void } | null>(null);

export const useFeedback = (): FeedbackApi => useContext(FeedbackContext) || NOOP;

// ── Glyphs ───────────────────────────────────────────────────
const Glyph: React.FC<{ kind: Kind; color: string }> = ({ kind, color }) => (
  <Svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    {kind === 'success' && <Path d="M5.5 12.4l4.1 4.1 8.9-9" />}
    {kind === 'error' && <Path d="M12 7v6.2M12 17.2v.1" />}
    {kind === 'info' && <Path d="M12 11v6M12 7.2v.1" />}
  </Svg>
);

const CloseGlyph = () => (
  <Svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={2} strokeLinecap="round">
    <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </Svg>
);

// ── One toast ────────────────────────────────────────────────
const Toast: React.FC<{ toast: ToastItem; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  const { theme } = useAuth();
  const t = buildTheme(theme);
  const anim = useRef(new Animated.Value(0)).current;
  const bumpAnim = useRef(new Animated.Value(1)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 340, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start();
  }, [anim]);

  useEffect(() => {
    if (toast.leaving) {
      Animated.timing(anim, { toValue: 0, duration: EXIT_MS, useNativeDriver: true }).start();
    }
  }, [toast.leaving, anim]);

  // A repeat of the same message restarts the clock and bumps the badge.
  useEffect(() => {
    if (toast.bump) {
      bumpAnim.setValue(1.25);
      Animated.spring(bumpAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start();
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [toast.bump, toast.duration, toast.id, onDismiss, bumpAnim]);

  const isError = toast.kind === 'error';
  const surface = mix(t.primary, '#14151b', 0.91);

  const badge = (() => {
    if (toast.kind === 'error') return ['#ff8a8a', '#d63a3a'];
    if (toast.kind === 'info') return ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.12)'];
    return [mix(t.primary, '#ffffff', 0.34), t.primary];
  })();

  return (
    <Animated.View
      accessibilityRole={isError ? 'alert' : undefined}
      accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
      style={[
        styles.toast,
        { backgroundColor: surface },
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) },
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
          ],
        },
      ]}
    >
      <Animated.View style={{ transform: [{ scale: bumpAnim }] }}>
        <LinearGradient colors={badge as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
          <Glyph kind={toast.kind} color="#ffffff" />
        </LinearGradient>
      </Animated.View>
      <Text style={styles.toastText}>{toast.message}</Text>
      {toast.action && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onDismiss(toast.id);
            toast.action?.onClick?.();
          }}
          style={({ pressed }) => [styles.action, pressed && { transform: [{ scale: 0.95 }], backgroundColor: 'rgba(255,255,255,0.18)' }]}
        >
          <Text style={styles.actionText}>{toast.action.label}</Text>
        </Pressable>
      )}
      {(isError || toast.action) && (
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={() => onDismiss(toast.id)} style={styles.close} hitSlop={8}>
          <CloseGlyph />
        </Pressable>
      )}
    </Animated.View>
  );
};

/** The toast stack. Mounted once at the root; Android sheets mount another. */
export const FeedbackToasts: React.FC<{ topOffset?: number; onlyAndroid?: boolean }> = ({ topOffset, onlyAndroid }) => {
  const state = useContext(ToastStateContext);
  const insets = useSafeAreaInsets();
  if (!state || (onlyAndroid && Platform.OS !== 'android')) return null;
  return (
    <View pointerEvents="box-none" style={[styles.stack, { top: (topOffset ?? insets.top + 64) }]}>
      {state.toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={state.dismiss} />
      ))}
    </View>
  );
};

// ── Confirm dialog ───────────────────────────────────────────
const ConfirmDialog: React.FC<{ request: ConfirmRequest; onAnswer: (v: boolean) => void }> = ({ request, onAnswer }) => {
  const { theme } = useAuth();
  const t = buildTheme(theme);
  const [busy, setBusy] = useState(false);
  const scale = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 7, useNativeDriver: true }).start();
  }, [scale]);

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => !busy && onAnswer(false)} statusBarTranslucent>
      <Pressable style={styles.confirmBackdrop} onPress={() => !busy && onAnswer(false)}>
        <Animated.View style={[styles.confirmCard, { backgroundColor: mix(t.primary, '#14151b', 0.91), transform: [{ scale }] }]}>
          <Pressable>
            <Text style={styles.confirmTitle} accessibilityRole="header">{request.title}</Text>
            {!!request.message && <Text style={styles.confirmText}>{request.message}</Text>}
            <View style={styles.confirmActions}>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => onAnswer(false)}
                style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.btnPressed]}
              >
                <Text style={styles.btnGhostText}>{request.cancelLabel || 'Cancel'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  setBusy(true);
                  onAnswer(true);
                }}
                style={({ pressed }) => [
                  styles.btn,
                  { backgroundColor: request.danger ? '#d63a3a' : t.primary },
                  pressed && styles.btnPressed,
                ]}
              >
                <Text style={styles.btnText}>{request.confirmLabel || 'Confirm'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

// iOS full-window overlay (above RN Modals). Optional import so a missing
// export never breaks the bundle.
let FullWindowOverlay: React.ComponentType<{ children?: React.ReactNode }> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  FullWindowOverlay = require('react-native-screens').FullWindowOverlay || null;
} catch {
  FullWindowOverlay = null;
}

// ── Provider ─────────────────────────────────────────────────
export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmQueue, setConfirmQueue] = useState<(ConfirmRequest & { resolve: (v: boolean) => void; key: string })[]>([]);
  const exitTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    clearTimeout(exitTimers.current[id]);
    exitTimers.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      delete exitTimers.current[id];
    }, EXIT_MS);
  }, []);

  useEffect(() => () => Object.values(exitTimers.current).forEach(clearTimeout), []);

  const push = useCallback((kind: Kind, message: string, opts: FeedbackOptions = {}) => {
    if (!message) return null;
    const text = String(message);
    const duration = opts.duration ?? (opts.action ? ACTION_DURATION : DURATION[kind]);
    const id = opts.id || newId();

    setToasts((prev) => {
      const same = prev.find((t) => !t.leaving && (t.id === id || (t.kind === kind && t.message === text)));
      if (same) {
        return prev.map((t) =>
          t.id === same.id ? { ...t, message: text, action: opts.action || null, duration, bump: (t.bump || 0) + 1 } : t,
        );
      }
      const next = [...prev.filter((t) => !t.leaving), { id, kind, message: text, action: opts.action || null, duration, bump: 0 }];
      return next.slice(-MAX_ON_SCREEN);
    });
    return id;
  }, []);

  const confirm = useCallback(
    (request: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        setConfirmQueue((prev) => [...prev, { ...request, resolve, key: newId() }]);
      }),
    [],
  );

  const answer = useCallback((value: boolean) => {
    setConfirmQueue((prev) => {
      const [first, ...rest] = prev;
      first?.resolve(value);
      return rest;
    });
  }, []);

  const api = useMemo<FeedbackApi>(
    () => ({
      success: (message, opts) => push('success', message, opts),
      error: (message, opts) => push('error', message, opts),
      info: (message, opts) => push('info', message, opts),
      dismiss,
      confirm,
    }),
    [push, dismiss, confirm],
  );

  const toastState = useMemo(() => ({ toasts, dismiss }), [toasts, dismiss]);
  const activeConfirm = confirmQueue[0];

  const stack = <FeedbackToasts />;

  return (
    <FeedbackContext.Provider value={api}>
      <ToastStateContext.Provider value={toastState}>
        {children}
        {Platform.OS === 'ios' && FullWindowOverlay ? <FullWindowOverlay>{stack}</FullWindowOverlay> : stack}
        {activeConfirm && <ConfirmDialog key={activeConfirm.key} request={activeConfirm} onAnswer={answer} />}
      </ToastStateContext.Provider>
    </FeedbackContext.Provider>
  );
};

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    zIndex: 12500,
    elevation: 50,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 460,
    alignSelf: 'center',
    minHeight: 46,
    paddingVertical: 8,
    paddingLeft: 9,
    paddingRight: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastText: {
    flexShrink: 1,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
    paddingRight: 4,
  },
  action: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
  },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  close: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(3,4,8,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 24 },
    elevation: 24,
  },
  confirmTitle: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  confirmText: { color: 'rgba(255,255,255,0.72)', fontSize: 14.5, lineHeight: 21, marginTop: 8 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  btn: { minHeight: 42, paddingHorizontal: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: 'rgba(255,255,255,0.08)' },
  btnGhostText: { color: 'rgba(255,255,255,0.86)', fontSize: 14, fontWeight: '700' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnPressed: { transform: [{ scale: 0.96 }], opacity: 0.9 },
});

export default FeedbackContext;
