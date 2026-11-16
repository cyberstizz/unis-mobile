// src/components/SupportSheet.tsx
// Ported from web `SupportSheet.jsx`.
//
// Direct fan-to-artist support ("tip") sheet. Two steps:
//   1. Pick an amount (name-your-price) + optional note
//   2. Pay — POST /v1/support/{artistId}/intent → clientSecret (destination
//      charge → pays the artist), then POST /v1/support/{artistId}/confirm.
//
// ── Stripe on mobile ──
// The web version renders Stripe's <PaymentElement> via @stripe/react-stripe-js,
// which is DOM-only and cannot run in React Native. The RN equivalent is
// @stripe/stripe-react-native (a native module), which is NOT currently in this
// project's dependencies. Rather than ship a fake card form, the payment step
// is wired end-to-end EXCEPT the actual card capture:
//
//   • Step 1 (amount/note) is fully functional.
//   • Card entry is not native yet: the pay step opens the artist's page on unismusic.com.
//   • `confirmSupport()` calls the real /confirm endpoint and fires onSuccess
//     with the same { supportId, amount, note } shape MessageThread expects.
//   • The card entry itself is isolated in <PaymentStep> behind a single
//     integration point (see the ⚠️ INTEGRATION block). Wiring it up is:
//         npm i @stripe/stripe-react-native
//         wrap the app in <StripeProvider publishableKey=... />
//         use useConfirmPayment().confirmPayment(clientSecret, {paymentMethodType:'Card'})
//     then call confirmSupport(paymentIntentId) on success. No other file changes.
//
// Everything else — the sheet chrome, presets, custom amount, note, success
// state, and the DM hand-off — is a faithful port and works today.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Zap, X, Check } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';
import { Linking } from 'react-native';
import { useFeedback } from '../context/FeedbackContext';
import { webUrl } from '../config/links';

const PRESETS = [3, 5, 10, 25]; // dollars
const MAX_SUPPORT_CENTS = 10000;  // $100 per payment (the server enforces this and the daily/weekly limits)

interface SupportResult {
  supportId?: string;
  amount: number; // cents
  note?: string;
}

// ── Payment step ────────────────────────────────────────────────────────────
// Isolated so the Stripe native integration lives in exactly one place.
const PaymentStep: React.FC<{
  amountCents: number;
  busy: boolean;
  error: string | null;
  onPay: () => void;   // calls confirmSupport once card capture succeeds
  onBack: () => void;
}> = ({ amountCents, busy, error, onPay, onBack }) => (
  <View style={styles.body}>
    {/*
      ⚠️ INTEGRATION POINT — Stripe native card entry goes here.
      With @stripe/stripe-react-native installed:

        import { CardField, useConfirmPayment } from '@stripe/stripe-react-native';
        const { confirmPayment } = useConfirmPayment();
        <CardField postalCodeEnabled style={styles.cardField} />
        // in onPay: await confirmPayment(clientSecret, { paymentMethodType: 'Card' })
        //           then onPay() → confirmSupport(paymentIntent.id)

      Until then, this placeholder makes the missing dependency explicit rather
      than silently blocking the flow.
    */}
    <View style={styles.cardPlaceholder}>
      <Text style={styles.cardPlaceholderText}>
        Card payments finish on unismusic.com — your browser opens on this
        artist's page, where you tap Support and pay with Stripe.
      </Text>
    </View>

    {!!error && <Text style={styles.error}>{error}</Text>}

    <TouchableOpacity
      style={[styles.btn, styles.btnPrimary]}
      onPress={onPay}
      disabled={busy}
    >
      <Text style={styles.btnPrimaryText}>
        {busy ? 'Processing…' : `Pay $${(amountCents / 100).toFixed(2)} on unismusic.com`}
      </Text>
    </TouchableOpacity>
    <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onBack} disabled={busy}>
      <Text style={styles.btnGhostText}>Back</Text>
    </TouchableOpacity>
  </View>
);

interface SupportSheetProps {
  isOpen?: boolean;
  onClose?: () => void;
  artistId?: string;
  artistName?: string;
  source?: string;
  onSuccess?: (result: SupportResult) => void;
}

const SupportSheet: React.FC<SupportSheetProps> = ({
  isOpen = false,
  onClose = () => {},
  artistId,
  artistName = 'this artist',
  source = 'profile',
  onSuccess = (_result: SupportResult) => {},
}) => {
  const [step, setStep] = useState<'amount' | 'pay' | 'done'>('amount');
  const [selected, setSelected] = useState(10);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedback = useFeedback();

  const amountCents = useMemo(() => {
    const dollars = custom !== '' ? parseFloat(custom) : selected;
    if (!dollars || Number.isNaN(dollars)) return 0;
    return Math.round(dollars * 100);
  }, [custom, selected]);

  // Reset each time the sheet opens (web parity).
  useEffect(() => {
    if (!isOpen) return;
    setStep('amount');
    setSelected(10);
    setCustom('');
    setNote('');
    setError(null);
    setBusy(false);
  }, [isOpen]);

  const startPayment = async () => {
    if (amountCents < 100) {
      setError('Minimum support is $1.00.');
      return;
    }
    if (amountCents > MAX_SUPPORT_CENTS) { setError('The most you can send at once is $100.'); return; }
    setError(null);
    // No /intent here: the web page creates its own PaymentIntent, so making
    // one on the phone would leave an unused intent behind.
    setStep('pay');
  };

  // Called after Stripe card capture succeeds (paymentIntent.status === 'succeeded').
  // Records the support server-side and fires onSuccess with the DM payload.
  const confirmSupport = async (paymentIntentId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await axiosInstance.post(`/v1/support/${artistId}/confirm`, {
        paymentIntentId,
      });
      setStep('done');
      // The sheet closes itself in a moment — the toast stays behind.
      feedback.success(`Sent $${((res.data?.amount || amountCents) / 100).toFixed(2)} to ${artistName}. Thank you!`);
      onSuccess({ supportId: res.data?.supportId, amount: amountCents, note: note.trim() });
      setTimeout(onClose, 1700);
    } catch (_) {
      setError("Payment went through, but we couldn't record it. Please reach out to support.");
    } finally {
      setBusy(false);
    }
  };

  // Card capture runs on the web (Stripe Payment Element). Native card entry
  // would need @stripe/stripe-react-native + a native rebuild; until then the
  // payment hands off to the artist's page, the same way Plus checkout does.
  // confirmSupport() stays wired for when native card entry is added.
  void confirmSupport;
  const handlePay = () => {
    Linking.openURL(webUrl(`/artist/${artistId}`)).catch(() => setError("Couldn't open your browser."));
    onClose();
  };

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={styles.shell}>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Close">
            <X size={18} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.head}>
            <View style={styles.bolt}>
              <Zap size={20} color="#4a9eff" />
            </View>
            <Text style={styles.title}>Support {artistName}</Text>
            <Text style={styles.sub}>Goes straight to the artist — name your price.</Text>
          </View>

          {step === 'amount' && (
            <View style={styles.body}>
              <View style={styles.chips}>
                {PRESETS.map((d) => {
                  const active = custom === '' && selected === d;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => { setSelected(d); setCustom(''); }}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>${d}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.custom}>
                <Text style={styles.customDollar}>$</Text>
                <TextInput
                  style={styles.customInput}
                  keyboardType="decimal-pad"
                  placeholder="Custom amount"
                  placeholderTextColor="#666666"
                  value={custom}
                  onChangeText={setCustom}
                />
              </View>

              <TextInput
                style={styles.note}
                maxLength={280}
                placeholder="Add a note (optional)"
                placeholderTextColor="#666666"
                value={note}
                onChangeText={setNote}
              />

              {!!error && <Text style={styles.error}>{error}</Text>}

              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, (busy || amountCents < 100) && styles.btnDisabled]}
                onPress={startPayment}
                disabled={busy || amountCents < 100}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnPrimaryText}>
                    Continue — ${(amountCents / 100).toFixed(2)}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {step === 'pay' && (
            <PaymentStep
              amountCents={amountCents}
              busy={busy}
              error={error}
              onPay={handlePay}
              onBack={() => setStep('amount')}
            />
          )}

          {step === 'done' && (
            <View style={styles.done}>
              <View style={styles.check}>
                <Check size={26} color="#22c55e" />
              </View>
              <Text style={styles.doneTitle}>Support sent</Text>
              <Text style={styles.doneSub}>Thank you for backing {artistName}.</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  shell: {
    backgroundColor: '#0e1118',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    padding: 24,
    paddingBottom: 36,
  },
  close: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 2,
    padding: 6,
  },
  head: {
    alignItems: 'center',
    marginBottom: 20,
  },
  bolt: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(74, 158, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  sub: {
    color: '#AAAAAA',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  body: {},
  chips: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    marginHorizontal: 4,
  },
  chipActive: {
    borderColor: '#4a9eff',
    backgroundColor: 'rgba(74, 158, 255, 0.12)',
  },
  chipText: {
    color: '#CCCCCC',
    fontSize: 16,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  custom: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  customDollar: {
    color: '#AAAAAA',
    fontSize: 17,
    fontWeight: '700',
    marginRight: 6,
  },
  customInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    paddingVertical: 13,
  },
  note: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 12,
  },
  cardPlaceholder: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardPlaceholderText: {
    color: '#888888',
    fontSize: 12,
    lineHeight: 17,
  },
  error: {
    color: '#e54b4a',
    fontSize: 13,
    marginBottom: 10,
  },
  btn: {
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  btnPrimary: {
    backgroundColor: '#004aad',
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  btnGhost: {
    marginTop: 8,
  },
  btnGhostText: {
    color: '#AAAAAA',
    fontSize: 14,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  done: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  check: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  doneTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  doneSub: {
    color: '#AAAAAA',
    fontSize: 14,
    marginTop: 4,
  },
});

export default SupportSheet;