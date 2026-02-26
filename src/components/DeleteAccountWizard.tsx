import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// Use the same base URL as axiosInstance
const API_BASE_URL = 'http://192.168.1.154:8080/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeleteAccountWizardProps {
  visible: boolean;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const DeleteAccountWizard: React.FC<DeleteAccountWizardProps> = ({ visible, onClose }) => {
  const { user, logout } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [typedName, setTypedName] = useState('');
  const [typedNameBackwards, setTypedNameBackwards] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const username = user?.username || '';
  const expectedBackwards = username.split('').reverse().join('');

  const nameMatch = typedName === username;
  const backwardsMatch = typedNameBackwards === expectedBackwards;
  const canDelete = confirmed && nameMatch && backwardsMatch;

  // ── Reset on close ──────────────────────────────────────────────────────────
  const handleClose = () => {
    setStep(1);
    setTypedName('');
    setTypedNameBackwards('');
    setConfirmed(false);
    setLoading(false);
    setError('');
    onClose();
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!canDelete) return;
    setLoading(true);
    setError('');
    try {
      // FIX: Use fetch instead of axiosInstance for DELETE request
      // to match the working pattern across all other wizards.
      const token = await SecureStore.getItemAsync('token');

      const response = await fetch(`${API_BASE_URL}/v1/users/me`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(`Delete failed with status ${response.status}`);
      }

      await logout();
      // logout() should navigate to login screen via AuthContext / AppNavigator
    } catch (err: any) {
      console.error('Delete account error:', err);
      setError('Failed to delete account. Please try again.');
      setLoading(false);
    }
  };

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

          {/* Close button */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.iconWrapper}>
              <Text style={styles.warningIcon}>⚠</Text>
            </View>
            <Text style={styles.title}>Delete Account Forever</Text>

            {/* ── Step 1: Consequences ── */}
            {step === 1 && (
              <>
                <Text style={styles.subtitle}>
                  This action is permanent and cannot be undone.
                </Text>

                <View style={styles.consequenceCard}>
                  {[
                    'All your songs and videos will be deleted',
                    'All votes and awards will be removed',
                    'Your profile will disappear from leaderboards',
                    'Supporters will no longer see your content',
                    'There is no recovery — ever',
                  ].map((line) => (
                    <View key={line} style={styles.consequenceRow}>
                      <Text style={styles.consequenceBullet}>✕</Text>
                      <Text style={styles.consequenceText}>{line}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.continueBtn}
                  onPress={() => setStep(2)}
                >
                  <Text style={styles.continueBtnText}>I Understand — Continue</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Step 2: Confirmation ── */}
            {step === 2 && (
              <>
                <Text style={styles.subtitle}>
                  Final confirmation required. Prove it's really you.
                </Text>

                {/* Type username */}
                <Text style={styles.fieldLabel}>Type your username</Text>
                <TextInput
                  style={[
                    styles.textInput,
                    typedName.length > 0 && (nameMatch ? styles.inputValid : styles.inputInvalid),
                  ]}
                  value={typedName}
                  onChangeText={setTypedName}
                  placeholder={username}
                  placeholderTextColor="#555"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                {/* Type username backwards */}
                <Text style={styles.fieldLabel}>Now type it backwards</Text>
                <TextInput
                  style={[
                    styles.textInput,
                    typedNameBackwards.length > 0 && (backwardsMatch ? styles.inputValid : styles.inputInvalid),
                  ]}
                  value={typedNameBackwards}
                  onChangeText={setTypedNameBackwards}
                  placeholder={expectedBackwards}
                  placeholderTextColor="#555"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                {/* Checkbox */}
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setConfirmed(!confirmed)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
                    {confirmed && <Text style={styles.checkboxTick}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>
                    I want to permanently delete my account and all my data
                  </Text>
                </TouchableOpacity>

                {/* Error */}
                {!!error && (
                  <Text style={styles.errorText}>{error}</Text>
                )}

                {/* Buttons */}
                <View style={styles.buttonRow}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={loading}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.deleteBtn, (!canDelete || loading) && styles.deleteBtnDisabled]}
                    onPress={handleDelete}
                    disabled={!canDelete || loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.deleteBtnText}>Delete Forever</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
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
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0D0D0F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.9,
    paddingBottom: Platform.OS === 'ios' ? 44 : 48,
    position: 'relative',
  },
  handleBar: {
    width: 40, height: 4, backgroundColor: '#333',
    borderRadius: 2, alignSelf: 'center',
    marginTop: 12, marginBottom: 4,
  },
  closeBtn: {
    position: 'absolute',
    top: 20, right: 20, zIndex: 10,
  },
  closeBtnText: {
    color: '#A9A9A9', fontSize: 18,
  },

  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },

  // Header
  iconWrapper: {
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  warningIcon: {
    fontSize: 52,
    color: '#dc3545',
  },
  title: {
    color: '#dc3545',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: '#dc3545',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },

  // Consequence card
  consequenceCard: {
    backgroundColor: 'rgba(220,53,69,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(220,53,69,0.35)',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    marginBottom: 28,
  },
  consequenceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  consequenceBullet: {
    color: '#dc3545',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  consequenceText: {
    color: '#C0C0C0',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },

  // Continue button (step 1)
  continueBtn: {
    backgroundColor: '#dc3545',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 8,
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // Step 2 fields
  fieldLabel: {
    color: '#dc3545',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#dc3545',
    paddingLeft: 8,
  },
  textInput: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.2)',
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  inputValid: {
    borderColor: '#28a745',
  },
  inputInvalid: {
    borderColor: '#dc3545',
  },

  // Checkbox
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 28,
    marginTop: 4,
  },
  checkbox: {
    width: 22, height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#dc3545',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: '#dc3545',
  },
  checkboxTick: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  checkboxLabel: {
    color: '#dc3545',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    lineHeight: 20,
  },

  // Error
  errorText: {
    color: '#dc3545',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },

  // Button row
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.2)',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#A9A9A9',
    fontSize: 15,
    fontWeight: '600',
  },
  deleteBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#dc3545',
    alignItems: 'center',
  },
  deleteBtnDisabled: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.15)',
  },
  deleteBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default DeleteAccountWizard;