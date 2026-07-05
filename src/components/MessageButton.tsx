// src/components/MessageButton.tsx
// Ported from web `MessageButton.jsx`.
//
// Drop onto an artist profile. Opens a direct thread with the profile owner.
// Hidden on your own profile. Navigates to the Messages screen with the same
// compose hand-off payload MessagesScreen reads.

import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MessageCircle } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';

interface MessageButtonProps {
  recipientId?: string;
  recipientName?: string;
  style?: object;
}

const MessageButton: React.FC<MessageButtonProps> = ({
  recipientId,
  recipientName,
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
      navigation.navigate('Login');
      return;
    }
    navigation.navigate('Messages', {
      compose: { userId: recipientId, username: recipientName },
    });
  };

  return (
    <TouchableOpacity style={[styles.btn, style]} onPress={onPress}>
      <MessageCircle size={18} color="#FFFFFF" />
      <Text style={styles.text}>Message</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
  },
});

export default MessageButton;