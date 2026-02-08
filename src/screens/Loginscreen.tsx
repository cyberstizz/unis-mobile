import React, { useState, useEffect } from 'react';
import UnisLogo from '../../assets/unisLogoThree.svg';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import { useAuth } from '../context/AuthContext';
// Temporarily disabled to debug
// import CreateAccountWizard from '../components/CreateAccountWizard';

// ============================================================================
// COLORS
// ============================================================================
const COLORS = {
  bgBlack: '#000000',
  cardBg: 'rgba(255, 255, 255, 0.95)',
  unisBlue: '#163387',
  unisBlueDark: '#0e246e',
  textDark: '#333333',
  textGray: '#666666',
  inputBorder: '#cccccc',
  errorRed: '#d32f2f',
  createAccountGray: 'rgb(62, 61, 61)',
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const LoginScreen: React.FC = () => {
  const { login } = useAuth();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Create account wizard state
  const [showCreateAccount, setShowCreateAccount] = useState(false);

  useEffect(() => {
  if (showCreateAccount) {
    Alert.alert(
      'Coming Soon',
      'Account creation wizard is being configured.',
      [{ text: 'OK', onPress: () => setShowCreateAccount(false) }]
    );
  }
}, [showCreateAccount]);


  // ============================================================================
  // HANDLERS
  // ============================================================================
  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const result = await login({ email, password });
      if (!result.success) {
        setError(result.error || 'Login failed');
      }
      // If successful, AuthContext will handle navigation
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <View style={styles.container}>
      {/* Background Video - Falls back to black on mobile/if video fails */}
      <Video
        source={require('../../assets/space-bg.mp4')}
        style={styles.backgroundVideo}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping
        isMuted
      />

      {/* Dark Overlay */}
      <View style={styles.overlay} />

      {/* Login Card */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.loginCard}>
            {/* Logo */}
              <UnisLogo width={120} height={120} />

            {/* Title */}
            <Text style={styles.title}>Welcome back</Text>

            {/* Error Message */}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Email Input */}
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={COLORS.textGray}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            {/* Password Input */}
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={COLORS.textGray}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              editable={!loading}
            />

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.loginButton, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.cardBg} size="small" />
              ) : (
                <Text style={styles.loginButtonText}>Login</Text>
              )}
            </TouchableOpacity>

            {/* Create Account Button */}
            <TouchableOpacity
              style={[styles.createAccountButton, loading && styles.buttonDisabled]}
              onPress={() => setShowCreateAccount(true)}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.createAccountButtonText}>
                Don't have an account? Create one
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Create Account - Temporarily showing alert instead of wizard */}
      {showCreateAccount && (
        // Show alert and close
        (() => {
          Alert.alert(
            'Coming Soon',
            'Account creation wizard is being configured. Please try again later.',
            [{ text: 'OK', onPress: () => setShowCreateAccount(false) }]
          );
          return null;
        })()
      )}
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgBlack,
  },

  // Background Video
  backgroundVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },

  // Dark Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },

  // Keyboard & Scroll
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  // Login Card
  loginCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 20,
  },

  // Logo
  logo: {
    width: 120,
    height: 120,
    marginBottom: 16,
  },

  // Title
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.unisBlue,
    marginBottom: 24,
  },

  // Error Text
  errorText: {
    color: COLORS.errorRed,
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },

  // Input
  input: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: COLORS.textDark,
    marginBottom: 12,
  },

  // Login Button
  loginButton: {
    width: '100%',
    backgroundColor: COLORS.unisBlue,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Create Account Button
  createAccountButton: {
    width: '100%',
    backgroundColor: COLORS.createAccountGray,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  createAccountButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  // Disabled Button
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default LoginScreen;
