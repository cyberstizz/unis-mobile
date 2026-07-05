// src/components/PhoneVerificationModal.tsx
// Ported from web `phoneVerificationModal.jsx`.
//
//  step 'phone' -> POST /v1/phone/start { phoneNumber }
//  step 'code'  -> POST /v1/phone/check { code }
// Calls onVerified() once Twilio approves the code.

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, Phone, ShieldCheck, ArrowRight } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';

interface PhoneVerificationModalProps {
  show: boolean;
  onClose: () => void;
  onVerified?: () => void;
}

type Step = 'phone' | 'code';

const PhoneVerificationModal: React.FC<PhoneVerificationModalProps> = ({
  show,
  onClose,
  onVerified,
}) => {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!show) {
      // reset when closed so re-opening starts clean
      setStep('phone');
      setPhone('');
      setMaskedPhone('');
      setCode('');
      setError(null);
      setBusy(false);
    }
  }, [show]);

  useEffect(() => {
    if (step === 'code') {
      // slight delay so the Modal finishes animating before focusing
      const t = setTimeout(() => codeRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [step]);

  const sendCode = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await axiosInstance.post('/v1/phone/start', { phoneNumber: phone });
      if (res.data?.alreadyVerified) {
        onVerified?.();
        onClose?.();
        return;
      }
      setMaskedPhone(res.data?.phone || '');
      setStep('code');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not send a code. Check the number and try again.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await axiosInstance.post('/v1/phone/check', { code });
      if (res.data?.verified) {
        onVerified?.();
        onClose?.();
      } else {
        setError("That code didn't match. Try again.");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'That code is invalid or has expired.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setCode('');
    setError(null);
    await sendCode();
  };

  return (
    <Modal visible={show} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.modal}>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Close">
            <X size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.icon}>
            <ShieldCheck size={26} color="#4a9eff" />
          </View>

          {step === 'phone' ? (
            <>
              <Text style={styles.title}>
                Verify your <Text style={styles.titleEm}>phone</Text>
              </Text>
              <Text style={styles.sub}>
                We'll text you a 6-digit code. Verifying unlocks voting, comments, and
                referral earnings — and keeps Unis free of bots.
              </Text>

              <View style={styles.fieldLabelRow}>
                <Phone size={13} color="#AAAAAA" />
                <Text style={styles.fieldLabel}>Mobile number</Text>
              </View>
              <TextInput
                style={styles.input}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                placeholder="(212) 555-0134"
                placeholderTextColor="#666666"
                value={phone}
                onChangeText={setPhone}
                onSubmitEditing={sendCode}
                autoFocus
              />

              {!!error && <Text style={styles.error}>{error}</Text>}

              <TouchableOpacity
                style={[styles.btn, (busy || !phone.trim()) && styles.btnDisabled]}
                onPress={sendCode}
                disabled={busy || !phone.trim()}
              >
                <Text style={styles.btnText}>{busy ? 'Sending…' : 'Send code'}</Text>
                {!busy && <ArrowRight size={15} color="#FFFFFF" />}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>
                Enter the <Text style={styles.titleEm}>code</Text>
              </Text>
              <Text style={styles.sub}>
                We texted a 6-digit code to {maskedPhone || 'your phone'}. Enter it below.
              </Text>

              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>Verification code</Text>
              </View>
              <TextInput
                ref={codeRef}
                style={[styles.input, styles.codeInput]}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                maxLength={8}
                placeholder="123456"
                placeholderTextColor="#666666"
                value={code}
                onChangeText={(v) => setCode(v.replace(/[^0-9]/g, ''))}
                onSubmitEditing={verifyCode}
              />

              {!!error && <Text style={styles.error}>{error}</Text>}

              <TouchableOpacity
                style={[styles.btn, (busy || code.length < 4) && styles.btnDisabled]}
                onPress={verifyCode}
                disabled={busy || code.length < 4}
              >
                <Text style={styles.btnText}>{busy ? 'Verifying…' : 'Verify'}</Text>
                {!busy && <ShieldCheck size={15} color="#FFFFFF" />}
              </TouchableOpacity>

              <View style={styles.foot}>
                <TouchableOpacity onPress={() => setStep('phone')}>
                  <Text style={styles.link}>Change number</Text>
                </TouchableOpacity>
                <Text style={styles.footDot}>·</Text>
                <TouchableOpacity onPress={resend} disabled={busy}>
                  <Text style={[styles.link, busy && styles.linkDisabled]}>Resend code</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  modal: {
    backgroundColor: '#0d0d0d',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
  },
  close: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    padding: 6,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(74, 158, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  titleEm: {
    fontStyle: 'italic',
    color: '#4a9eff',
  },
  sub: {
    color: '#AAAAAA',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  fieldLabel: {
    color: '#AAAAAA',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 5,
  },
  input: {
    color: '#FFFFFF',
    fontSize: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  codeInput: {
    letterSpacing: 6,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  error: {
    color: '#f87171',
    fontSize: 13,
    marginBottom: 10,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#004aad',
    borderRadius: 24,
    paddingVertical: 13,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginRight: 6,
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  link: {
    color: '#4a9eff',
    fontSize: 13,
    fontWeight: '600',
  },
  linkDisabled: {
    opacity: 0.5,
  },
  footDot: {
    color: '#666666',
    marginHorizontal: 10,
  },
});

export default PhoneVerificationModal;