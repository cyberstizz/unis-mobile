import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditProfileWizardProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void; // caller should invoke refreshUser() here
  user: {
    userId: string;
    username: string;
    bio?: string;
    photoUrl: string | null; // aligned with ProfileScreen's type
  };
  isArtist: boolean;
}

type ActiveTab = 'photo' | 'bio';

// ─── Component ────────────────────────────────────────────────────────────────

const EditProfileWizard: React.FC<EditProfileWizardProps> = ({
  visible,
  onClose,
  onSuccess,
  user,
  isArtist,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('photo');
  const [bio, setBio] = useState(user?.bio || '');
  const [photoUri, setPhotoUri] = useState<string | null>(null); // local file URI after picking
  const [loading, setLoading] = useState(false);

  // Resolved preview: local pick takes precedence, then existing server photo
  const previewUri = photoUri ?? (user?.photoUrl ? getMediaUrl(user.photoUrl) : null);

  // ── Photo pick ──────────────────────────────────────────────────────────────

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to change your profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],  // Updated from deprecated MediaTypeOptions.Images
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleOpenCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access to take a profile photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const showPhotoOptions = () => {
    Alert.alert('Change Photo', 'Choose a source', [
      { text: 'Camera', onPress: handleOpenCamera },
      { text: 'Photo Library', onPress: handlePickPhoto },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Save photo ──────────────────────────────────────────────────────────────

const handleSavePhoto = async () => {
    if (!photoUri) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('photo', {
        uri: photoUri,
        name: 'profile.jpg',
        type: 'image/jpeg',
      } as any);

      // Use fetch (like CreateAccountWizard) — axios + FormData 
      // in React Native has known issues with instanceof checks
      const SecureStore = require('expo-secure-store');
      const token = await SecureStore.getItemAsync('token');

      const response = await fetch('http://192.168.1.154:8080/api/v1/users/profile', {
        method: 'PATCH',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Save photo error:', err);
      Alert.alert('Error', 'Failed to update photo. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // ── Save bio ────────────────────────────────────────────────────────────────

  const handleSaveBio = async () => {
    if (bio === (user?.bio || '')) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      await axiosInstance.put(`/v1/users/profile/${user.userId}/bio`, {
        bio: bio.trim(),
      });

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Save bio error:', err);
      Alert.alert('Error', 'Failed to update bio. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Save dispatch ───────────────────────────────────────────────────────────

  const handleSave = () => {
    if (activeTab === 'photo') {
      handleSavePhoto();
    } else {
      handleSaveBio();
    }
  };

  const isSaveDisabled =
    loading ||
    (activeTab === 'photo' && !photoUri) ||
    (activeTab === 'bio' && bio === (user?.bio || ''));

  // ── Reset on close ──────────────────────────────────────────────────────────

  const handleClose = () => {
    setPhotoUri(null);
    setBio(user?.bio || '');
    setActiveTab('photo');
    onClose();
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <View style={styles.sheet}>
            {/* Handle bar */}
            <View style={styles.handleBar} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Edit Profile</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Tab bar */}
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'photo' && styles.tabActive]}
                onPress={() => setActiveTab('photo')}
              >
                <Text style={[styles.tabText, activeTab === 'photo' && styles.tabTextActive]}>
                  📷  Photo
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'bio' && styles.tabActive]}
                onPress={() => setActiveTab('bio')}
              >
                <Text style={[styles.tabText, activeTab === 'bio' && styles.tabTextActive]}>
                  ✏️  Bio
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* ── Photo Tab ── */}
              {activeTab === 'photo' && (
                <View style={styles.tabContent}>
                  <Text style={styles.sectionHeader}>Profile Photo</Text>
                  <Text style={styles.intro}>
                    Upload a photo that represents you{isArtist ? ' as an artist' : ''}.
                  </Text>

                  {/* Avatar preview */}
                  <TouchableOpacity onPress={showPhotoOptions} style={styles.avatarWrapper}>
                    {previewUri ? (
                      <Image source={{ uri: previewUri }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarPlaceholderText}>
                          {user?.username?.[0]?.toUpperCase() ?? '?'}
                        </Text>
                      </View>
                    )}
                    {/* Overlay tap hint */}
                    <View style={styles.avatarOverlay}>
                      <Text style={styles.avatarOverlayText}>Tap to change</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Explicit pick buttons */}
                  <TouchableOpacity style={styles.pickBtn} onPress={showPhotoOptions}>
                    <Text style={styles.pickBtnText}>⬆  Choose New Photo</Text>
                  </TouchableOpacity>

                  {photoUri && (
                    <Text style={styles.selectedHint}>New photo selected — tap Save to apply.</Text>
                  )}
                </View>
              )}

              {/* ── Bio Tab ── */}
              {activeTab === 'bio' && (
                <View style={styles.tabContent}>
                  <Text style={styles.sectionHeader}>Bio</Text>
                  <Text style={styles.intro}>
                    Tell the world about your sound, your story, your roots.
                  </Text>

                  <TextInput
                    style={styles.bioInput}
                    value={bio}
                    onChangeText={setBio}
                    multiline
                    maxLength={500}
                    placeholder="Share your musical journey, influences, and what makes you unique..."
                    placeholderTextColor="#555"
                    textAlignVertical="top"
                  />
                  <Text style={styles.charCount}>{bio.length} / 500</Text>
                </View>
              )}
            </ScrollView>

            {/* Button row */}
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={loading}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, isSaveDisabled && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={isSaveDisabled}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    Save {activeTab === 'photo' ? 'Photo' : 'Bio'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  keyboardAvoid: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0D0D0F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.88,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },

  // Handle
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    position: 'relative',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  closeBtn: {
    position: 'absolute',
    right: 20,
  },
  closeBtnText: {
    color: '#A9A9A9',
    fontSize: 18,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 4,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#163387',
  },
  tabText: {
    color: '#A9A9A9',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },

  // Scroll
  scrollArea: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },

  // Tab content shared
  tabContent: {
    gap: 12,
  },
  sectionHeader: {
    color: '#4facfe',
    fontSize: 16,
    fontWeight: '700',
    borderLeftWidth: 3,
    borderLeftColor: '#163387',
    paddingLeft: 10,
    marginBottom: 4,
  },
  intro: {
    color: '#A9A9A9',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },

  // Avatar
  avatarWrapper: {
    alignSelf: 'center',
    marginVertical: 16,
    position: 'relative',
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: 'rgba(22,51,135,0.6)',
  },
  avatarPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#1a1a1a',
    borderWidth: 3,
    borderColor: 'rgba(192,192,192,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    color: '#C0C0C0',
    fontSize: 52,
    fontWeight: '700',
  },
  avatarOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderBottomLeftRadius: 70,
    borderBottomRightRadius: 70,
    paddingVertical: 6,
    alignItems: 'center',
  },
  avatarOverlayText: {
    color: '#C0C0C0',
    fontSize: 11,
    fontWeight: '600',
  },

  // Pick button
  pickBtn: {
    borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.3)',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  pickBtnText: {
    color: '#C0C0C0',
    fontSize: 15,
    fontWeight: '600',
  },
  selectedHint: {
    color: '#4facfe',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },

  // Bio
  bioInput: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.2)',
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 15,
    padding: 14,
    minHeight: 160,
    lineHeight: 22,
  },
  charCount: {
    color: '#555',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
  },

  // Buttons
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
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
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#163387',
    alignItems: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.15)',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default EditProfileWizard;