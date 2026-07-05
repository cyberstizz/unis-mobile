// src/components/VerificationGate.tsx
// Ported from web `verificationGate.jsx`.
//
// Wrap any feature that should require a verified phone (referral card, comment
// box, vote action). When the signed-in user's phone is verified, children
// render normally. Otherwise children are shown locked (dimmed, non-interactive)
// under an overlay with a "Verify your phone" CTA that opens the modal. On
// success it refreshes the auth user so the gate re-opens automatically.
//
//   <VerificationGate title="Verify to refer & earn">
//     <ReferralCodeCard ... />
//   </VerificationGate>
//
// Pass `compact` for tight spaces (e.g. above a comment box).

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Lock } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import PhoneVerificationModal from './PhoneVerificationModal';

interface VerificationGateProps {
  children: React.ReactNode;
  title?: string;
  message?: string;
  compact?: boolean;
}

const VerificationGate: React.FC<VerificationGateProps> = ({
  children,
  title = 'Verify your phone to unlock this',
  message = 'A quick phone check keeps Unis bot-free. It takes about a minute.',
  compact = false,
}) => {
  const { user, refreshUser } = useAuth();
  const [showModal, setShowModal] = useState(false);

  // Not logged in at all -> let the app's existing auth flow handle it; render as-is.
  if (!user) return <>{children}</>;

  if (user.phoneVerified) return <>{children}</>;

  const handleVerified = async () => {
    try {
      await refreshUser?.();
    } catch (_) {
      /* refresh failure is non-fatal; the next profile load will reflect it */
    }
  };

  return (
    <View style={styles.gate}>
      {/* Locked content: dimmed + non-interactive (web blurs via CSS) */}
      <View style={styles.content} pointerEvents="none">
        {children}
      </View>

      <View style={styles.overlay}>
        <View style={[styles.lock, compact && styles.lockCompact]}>
          <Lock size={compact ? 16 : 20} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>{title}</Text>
        {!compact && <Text style={styles.message}>{message}</Text>}
        <TouchableOpacity style={styles.btn} onPress={() => setShowModal(true)}>
          <Text style={styles.btnText}>Verify phone</Text>
        </TouchableOpacity>
      </View>

      <PhoneVerificationModal
        show={showModal}
        onClose={() => setShowModal(false)}
        onVerified={handleVerified}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  gate: {
    position: 'relative',
    borderRadius: 14,
    overflow: 'hidden',
  },
  content: {
    opacity: 0.25,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    paddingHorizontal: 24,
  },
  lock: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  lockCompact: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    color: '#CCCCCC',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
  },
  btn: {
    marginTop: 12,
    backgroundColor: '#004aad',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default VerificationGate;