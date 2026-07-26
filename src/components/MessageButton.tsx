// src/components/MessageButton.tsx
// Ported from web `MessageButton.jsx` (v2).
//
// Drop onto an artist profile. Opens a direct thread with the profile owner.
// Hidden on your own profile. Navigates to the Messages screen with the same
// compose hand-off payload MessageScreen reads.
//
// v2 FIX — the "Member" bug:
//   MessageScreen builds its draft with
//     otherUsername: compose.username || 'Member'
//     otherPhotoUrl: compose.photoUrl  || null
//   Callers that passed only `recipientId` therefore opened every thread
//   labelled "Member" with no avatar. This version forwards the recipient's
//   name AND photo, and ArtistScreen now supplies both.

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MessageCircle } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';

interface MessageButtonProps {
  recipientId?: string;
  recipientName?: string;
  recipientPhotoUrl?: string | null;
  style?: object;
}

const MessageButton: React.FC<MessageButtonProps> = ({
  recipientId,
  recipientName,
  recipientPhotoUrl = null,
  style,
}) => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  // isGuest isn't a field on the mobile auth context; a null user is the guest
  // signal here (web exposed an explicit isGuest flag).
  const isGuest = !user;

  if (!recipientId || (user && user.userId === recipientId)) return null;

  const onPress = () => {
    if (isGuest) {
      // There is no 'Login' route registered — AppNavigator renders
      // LoginScreen for the whole app when `user` is null, so navigating to
      // 'Login' would throw. Guard defensively instead.
      Alert.alert('Sign in required', 'Please sign in to send a message.');
      return;
    }
    navigation.navigate('Messages', {
      compose: {
        userId: recipientId,
        username: recipientName,
        photoUrl: recipientPhotoUrl,
      },
    });
  };

  return (
    <TouchableOpacity
      style={[styles.btn, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={recipientName ? `Message ${recipientName}` : 'Message'}
    >
      <MessageCircle size={18} color="#FFFFFF" />
      <Text style={styles.text}>Message</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default MessageButton;