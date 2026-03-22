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
import { X, Lock, CheckCircle } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import axiosInstance from '../services/axiosInstance';

// ============================================================================
// PROPS
// ============================================================================
interface ChangePasswordWizardProps {
  visible: boolean;
  onClose: () => void;
}

// ============================================================================
// COLORS (matches ArtistDashboardScreen + ProfileScreen palettes)
// ============================================================================
const COLORS = {
  bgBlack: '#000000',
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
const ChangePasswordWizard: React.FC<ChangePasswordWizardProps> = ({ visible, onClose }) => {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Reset all state and close ──────────────────────────────────────────────
  const handleClose = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setStep(1);
    setError('');
    onClose();
  };

  // ── Submit password change ─────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError('');

    if (!currentPassword.trim()) {
      setError('Please enter your current password.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      await axiosInstance.put(`/v1/users/profile/${user!.userId}/password`, {
        oldPassword: currentPassword,
        newPassword: newPassword,
      });
      setStep(2);
    } catch (err: any) {
      const msg = err.response?.data;
      if (typeof msg === 'string' && msg.includes('Old password incorrect')) {
        setError('Current password is incorrect.');
      } else {
        setError('Failed to change password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.container} onPress={() => {}}>

          {/* ── Close button ── */}
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <X size={22} color={COLORS.textGray400} />
          </TouchableOpacity>

          {/* ══════════════════════════════════════════════════════════════════
              STEP 1 — Form
              ══════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <>
              <View style={styles.headerRow}>
                <Lock size={24} color={COLORS.unisBlue} />
                <Text style={styles.title}>Change Password</Text>
              </View>

              {/* Error banner */}
              {error !== '' && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* Current password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Current Password</Text>
                <TextInput
                  style={styles.input}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  placeholderTextColor={COLORS.textGray400}
                  placeholder="Enter current password"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* New password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>New Password</Text>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  placeholderTextColor={COLORS.textGray400}
                  placeholder="Minimum 8 characters"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Confirm new password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Confirm New Password</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  placeholderTextColor={COLORS.textGray400}
                  placeholder="Re-enter new password"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Buttons */}
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
                    <Text style={styles.submitButtonText}>Change Password</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STEP 2 — Success
              ══════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <View style={styles.successContainer}>
              <CheckCircle size={48} color={COLORS.green500} />
              <Text style={styles.successTitle}>Password Changed</Text>
              <Text style={styles.successText}>
                Your password has been updated successfully.
              </Text>
              <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
                <Text style={styles.doneButtonText}>Done</Text>
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

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textWhite,
  },

  // Error
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

  // Form fields
  fieldGroup: {
    marginBottom: 16,
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

  // Buttons
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
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

  // Success state
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
    marginBottom: 24,
    textAlign: 'center',
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

export default ChangePasswordWizard;