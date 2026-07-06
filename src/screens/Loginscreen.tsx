// src/screens/Loginscreen.tsx
// Ported from web `pages/Login.jsx` (production version).
//
// Faithful port including the two server-driven branches the old mobile screen
// couldn't reach because it discarded the login response body:
//   • unverified email → inline "resend verification" affordance
//       POST /auth/resend-verification { email }
//   • waitlist         → referral-code modal with region signup progress
// (mobile AuthContext.login() was widened to return { success, error, data } so
//  this screen can branch on data.unverified / data.waitlist, same as web's
//  result.data.)
//
// Success needs no manual navigation: login() sets the auth user and the root
// navigator swaps LoginScreen → main app automatically (its own redirect
// equivalent). "Browse as a guest" is surfaced honestly — see the handler.

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import UnisLogo from '../../assets/unisLogoThree.svg';
import { useAuth } from '../context/AuthContext';
import axiosInstance from '../services/axiosInstance';
import CreateAccountWizard from '../components/Createaccountwizard';
import ForgotPasswordWizard from '../components/ForgotPasswordWizard';

const spaceVideo = require('../../assets/space-bg.mp4');

// ============================================================================
// COLORS  (matches web Login.scss)
// ============================================================================
const COLORS = {
  bgBlack: '#000000',
  cardOverlay: 'rgba(17, 17, 20, 0.72)',
  unisBlue: '#163387',
  unisBlueLight: '#2952cc',
  textWhite: '#FFFFFF',
  textGray: '#A9A9A9',
  inputBg: 'rgba(255, 255, 255, 0.06)',
  inputBorder: 'rgba(255, 255, 255, 0.14)',
  errorRed: '#e5484d',
};

interface WaitlistInfo {
  username?: string;
  metroRegion?: string;
  stateName?: string;
  referralCode?: string;
  regionSignupCount?: number;
  regionThreshold?: number;
}

const LoginScreen: React.FC = () => {
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [showWizard, setShowWizard] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Server-driven branches
  const [waitlistInfo, setWaitlistInfo] = useState<WaitlistInfo | null>(null);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [resendMsg, setResendMsg] = useState('');

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }
    setError('');
    setShowWaitlistModal(false);
    setWaitlistInfo(null);
    setUnverifiedEmail('');
    setResendMsg('');
    setLoading(true);

    const result = await login({ email, password });

    if (result.success) {
      // No navigate() — the root navigator swaps to the app when user is set.
    } else {
      const data = result.data;
      if (data?.unverified) {
        setUnverifiedEmail(data.email || email);
      } else if (data?.waitlist) {
        setWaitlistInfo(data);
        setShowWaitlistModal(true);
      } else {
        setError(result.error || 'Login failed');
      }
    }
    setLoading(false);
  };

  const handleCopyCode = async () => {
    if (waitlistInfo?.referralCode) {
      await Clipboard.setStringAsync(waitlistInfo.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleResendVerification = async () => {
    setResendMsg('Sending…');
    try {
      await axiosInstance.post('/auth/resend-verification', { email: unverifiedEmail });
      setResendMsg('Sent! Check your inbox.');
    } catch {
      setResendMsg('Could not resend right now. Try again shortly.');
    }
  };

  const handleGuestBrowse = () => {
    // Web navigates guests to '/' (a public feed). The mobile app currently
    // gates the entire navigator behind an authenticated user, so there's no
    // guest surface to route to yet. Rather than silently no-op, tell the user.
    // When a guest mode is added to the root navigator, replace this with the
    // guest entry (e.g. an AuthContext.continueAsGuest()).
    Alert.alert(
      'Guest browsing coming soon',
      'Browsing without an account isn’t available in the app yet. Create a free account or log in to continue.'
    );
  };

  const waitlistProgress = waitlistInfo
    ? Math.min(
        100,
        Math.round(
          ((waitlistInfo.regionSignupCount || 0) / (waitlistInfo.regionThreshold || 1)) * 100
        )
      )
    : 0;

  return (
    <View style={styles.wrapper}>
      <Video
        source={spaceVideo}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping
        isMuted
        // On some Android builds a paused/opaque poster flashes; keep it simple.
      />
      <View style={styles.overlay} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <UnisLogo width={110} height={110} />

            <Text style={styles.title}>Discover The Best Songs From Harlem</Text>
            <Text style={styles.subtitle}>Harlems Finest</Text>

            {!!error && !showWaitlistModal && <Text style={styles.error}>{error}</Text>}

            {/* ── unverified-email branch (inline, web parity) ── */}
            {!!unverifiedEmail && !showWaitlistModal && (
              <View style={styles.unverified}>
                <Text style={styles.unverifiedTitle}>Please verify your email</Text>
                <Text style={styles.unverifiedBody}>
                  We sent a verification link to{' '}
                  <Text style={styles.unverifiedEmail}>{unverifiedEmail}</Text>. Verify it to
                  finish signing in.
                </Text>
                <TouchableOpacity
                  style={styles.resendBtn}
                  onPress={handleResendVerification}
                  disabled={resendMsg === 'Sending…'}
                >
                  <Text style={styles.resendBtnText}>Resend verification email</Text>
                </TouchableOpacity>
                {!!resendMsg && <Text style={styles.resendMsg}>{resendMsg}</Text>}
              </View>
            )}

            {!showWaitlistModal && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={COLORS.textGray}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={!loading}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor={COLORS.textGray}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  editable={!loading}
                  onSubmitEditing={handleSubmit}
                />

                <TouchableOpacity
                  style={[styles.loginBtn, loading && styles.btnDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  <Text style={styles.loginBtnText}>
                    {loading ? 'Logging in…' : 'Login'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.forgotBtn}
                  onPress={() => setShowForgotPassword(true)}
                  disabled={loading}
                >
                  <Text style={styles.forgotText}>Forgot Password?</Text>
                </TouchableOpacity>

                {/* divider (web ★ NEW) */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  style={styles.createBtn}
                  onPress={() => setShowWizard(true)}
                  disabled={loading}
                >
                  <Text style={styles.createBtnText}>Create an account</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.guestBtn} onPress={handleGuestBrowse}>
                  <Text style={styles.guestText}>Browse as a guest</Text>
                </TouchableOpacity>

                <Text style={styles.socialProof}>Unis Music Corporation @2026</Text>
              </>
            )}

            {/* ── waitlist branch (modal card, web parity) ── */}
            {showWaitlistModal && waitlistInfo && (
              <View style={styles.waitlist}>
                <View style={styles.waitlistClock}>
                  <Text style={styles.waitlistClockGlyph}>◷</Text>
                </View>
                <Text style={styles.waitlistTitle}>
                  You're on the waitlist, {waitlistInfo.username}!
                </Text>
                <Text style={styles.waitlistBody}>
                  Unis isn't in <Text style={styles.waitlistStrong}>{waitlistInfo.metroRegion}</Text>,{' '}
                  <Text style={styles.waitlistStrong}>{waitlistInfo.stateName}</Text> yet. Share your
                  code to unlock it faster.
                </Text>

                <View style={styles.codeCard}>
                  <Text style={styles.codeLabel}>YOUR REFERRAL CODE</Text>
                  <Text style={styles.codeValue}>{waitlistInfo.referralCode}</Text>
                </View>

                <View style={styles.progressWrap}>
                  <View style={styles.progressTop}>
                    <Text style={styles.progressCount}>
                      {waitlistInfo.regionSignupCount} of {waitlistInfo.regionThreshold} signups
                    </Text>
                    <Text style={styles.progressPct}>{waitlistProgress}%</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${waitlistProgress}%` }]} />
                  </View>
                </View>

                <TouchableOpacity style={styles.copyBtn} onPress={handleCopyCode}>
                  <Text style={styles.copyBtnText}>
                    {copied ? 'Copied!' : 'Copy Referral Code'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => {
                    setShowWaitlistModal(false);
                    setWaitlistInfo(null);
                  }}
                >
                  <Text style={styles.backText}>Back to Login</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {showForgotPassword && (
        <ForgotPasswordWizard
          visible={showForgotPassword}
          onClose={() => setShowForgotPassword(false)}
        />
      )}

      {showWizard && (
        <CreateAccountWizard
          visible={showWizard}
          onClose={() => setShowWizard(false)}
          onSuccess={() => setShowWizard(false)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: COLORS.bgBlack },
  flex: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: COLORS.cardOverlay,
    borderRadius: 20,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    padding: 26,
    alignItems: 'center',
  },
  title: {
    color: COLORS.textWhite,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 14,
  },
  subtitle: {
    color: COLORS.textGray,
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 6,
    marginBottom: 18,
  },
  error: {
    color: COLORS.errorRed,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  unverified: {
    width: '100%',
    backgroundColor: 'rgba(22, 51, 135, 0.12)',
    borderColor: 'rgba(22, 51, 135, 0.4)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  unverifiedTitle: { color: COLORS.textWhite, fontSize: 15, fontWeight: '700' },
  unverifiedBody: { color: COLORS.textGray, fontSize: 13, lineHeight: 18, marginTop: 6 },
  unverifiedEmail: { color: COLORS.textWhite, fontWeight: '700' },
  resendBtn: {
    marginTop: 12,
    backgroundColor: COLORS.unisBlue,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  resendBtnText: { color: COLORS.textWhite, fontSize: 13, fontWeight: '700' },
  resendMsg: { color: COLORS.textGray, fontSize: 12, marginTop: 8, textAlign: 'center' },
  input: {
    width: '100%',
    backgroundColor: COLORS.inputBg,
    borderColor: COLORS.inputBorder,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: COLORS.textWhite,
    fontSize: 15,
    marginBottom: 12,
  },
  loginBtn: {
    width: '100%',
    backgroundColor: COLORS.unisBlue,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 2,
  },
  btnDisabled: { opacity: 0.6 },
  loginBtnText: { color: COLORS.textWhite, fontSize: 16, fontWeight: '700' },
  forgotBtn: { marginTop: 14, paddingVertical: 6 },
  forgotText: { color: COLORS.textGray, fontSize: 13 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 16,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.12)' },
  dividerText: { color: COLORS.textGray, fontSize: 12, marginHorizontal: 12 },
  createBtn: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  createBtnText: { color: COLORS.textWhite, fontSize: 15, fontWeight: '600' },
  guestBtn: { marginTop: 12, paddingVertical: 8 },
  guestText: { color: COLORS.textGray, fontSize: 14 },
  socialProof: { color: 'rgba(255, 255, 255, 0.4)', fontSize: 11, marginTop: 20 },

  // Waitlist card
  waitlist: {
    width: '100%',
    backgroundColor: 'rgba(17, 17, 20, 0.95)',
    borderRadius: 16,
    borderColor: 'rgba(22, 51, 135, 0.3)',
    borderWidth: 1,
    padding: 24,
    marginTop: 16,
    alignItems: 'center',
  },
  waitlistClock: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderColor: COLORS.unisBlue,
    borderWidth: 2,
    backgroundColor: 'rgba(22, 51, 135, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  waitlistClockGlyph: { color: COLORS.unisBlue, fontSize: 28, fontWeight: '700' },
  waitlistTitle: {
    color: COLORS.textWhite,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  waitlistBody: {
    color: COLORS.textGray,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  waitlistStrong: { color: COLORS.textWhite, fontWeight: '700' },
  codeCard: {
    width: '100%',
    backgroundColor: '#0a0a0c',
    borderRadius: 12,
    borderColor: 'rgba(22, 51, 135, 0.4)',
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  codeLabel: {
    color: COLORS.textGray,
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 6,
  },
  codeValue: {
    color: COLORS.textWhite,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 3,
  },
  progressWrap: { width: '100%', marginBottom: 20 },
  progressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressCount: { color: COLORS.textGray, fontSize: 13 },
  progressPct: { color: COLORS.unisBlue, fontSize: 13, fontWeight: '600' },
  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.unisBlue,
    borderRadius: 4,
  },
  copyBtn: {
    width: '100%',
    backgroundColor: COLORS.unisBlue,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  copyBtnText: { color: COLORS.textWhite, fontSize: 15, fontWeight: '600' },
  backBtn: {
    width: '100%',
    marginTop: 10,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  backText: { color: COLORS.textGray, fontSize: 13 },
});

export default LoginScreen;