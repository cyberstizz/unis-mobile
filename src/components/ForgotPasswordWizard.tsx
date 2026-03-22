import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { X, Mail, CheckCircle } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';

// ============================================================================
// PROPS
// ============================================================================
interface ForgotPasswordWizardProps {
  visible: boolean;
  onClose: () => void;
}

// ============================================================================
// COLORS
// ============================================================================
const COLORS = {
  bgGray900: '#111827',
  bgGray800: '#1f2937',
  borderGray: '#374151',
  textWhite: '#FFFFFF',
  textGray400: '#9ca3af',
  textGray300: '#d1d5db',
  unisBlue: '#163387',
  red500: '#ef4444',
  green500: '#22c55e',
};

// ============================================================================
// COMPONENT
// ============================================================================
const ForgotPasswordWizard: React.FC<ForgotPasswordWizardProps> = ({ visible, onClose }) => {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => {
    setEmail('');
    setStep(1);
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await axiosInstance.post('/auth/forgot-password', { email });
    } catch (e) {
      // Intentionally ignore — backend always returns 200
    }

    // Always show success to prevent email enumeration
    setStep(2);
    setLoading(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.container} onPress={() => {}}>

          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <X size={22} color={COLORS.textGray400} />
          </TouchableOpacity>

          {/* ── Step 1: Email input ── */}
          {step === 1 && (
            <>
              <View style={styles.headerRow}>
                <Mail size={24} color={COLORS.unisBlue} />
                <Text style={styles.title}>Forgot Password</Text>
              </View>

              <Text style={styles.subtitle}>
                Enter your email address and we'll send you a link to reset your password.
              </Text>

              {error !== '' && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter your email"
                  placeholderTextColor={COLORS.textGray400}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={COLORS.textWhite} />
                  ) : (
                    <Text style={styles.submitButtonText}>Send Reset Link</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Step 2: Success ── */}
          {step === 2 && (
            <View style={styles.successContainer}>
              <CheckCircle size={48} color={COLORS.green500} />
              <Text style={styles.successTitle}>Check Your Email</Text>
              <Text style={styles.successText}>
                If an account exists with{' '}
                <Text style={styles.emailHighlight}>{email}</Text>
                , we've sent a password reset link.
              </Text>
              <Text style={styles.successHint}>
                Check your inbox and spam folder. The link expires in 1 hour.
              </Text>
              <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
                <Text style={styles.doneButtonText}>Back to Login</Text>
              </TouchableOpacity>
            </View>
          )}

        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: COLORS.bgGray900,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    borderRadius: 16,
    padding: 28,
    width: '88%',
    maxWidth: 420,
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 1,
    padding: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
  subtitle: {
    color: COLORS.textGray400,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 24,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.red500,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#ff6b7a',
    fontSize: 14,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    color: COLORS.textGray400,
    fontSize: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.bgGray800,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    borderRadius: 8,
    padding: 14,
    color: COLORS.textWhite,
    fontSize: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: COLORS.bgGray800,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.textWhite,
    fontWeight: '600',
    fontSize: 15,
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: COLORS.unisBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: COLORS.textWhite,
    fontWeight: '600',
    fontSize: 15,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textWhite,
    marginTop: 16,
    marginBottom: 8,
  },
  successText: {
    color: COLORS.textGray400,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 8,
  },
  emailHighlight: {
    color: COLORS.textWhite,
    fontWeight: '600',
  },
  successHint: {
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
  },
  doneButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: COLORS.unisBlue,
    alignItems: 'center',
  },
  doneButtonText: {
    color: COLORS.textWhite,
    fontWeight: '600',
    fontSize: 16,
  },
});

export default ForgotPasswordWizard;