import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  ImageBackground,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// ============================================================================
// COLORS
// ============================================================================
const COLORS = {
  bgBlack: '#000000',
  subtleBlack: '#1a1a1a',
  textSilver: '#C0C0C0',
  textGray: '#A9A9A9',
  accentWhite: '#FFFFFF',
  unisBlue: '#163387',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 768;

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const EarningsScreen: React.FC = () => {
  // Fallback image
  const fallbackImage = require('../../assets/randomrapper.jpeg');

  return (
    <ImageBackground source={fallbackImage} style={styles.backgroundImage} blurRadius={20}>
      <LinearGradient
        colors={['rgba(0,0,0,0.8)', COLORS.bgBlack]}
        style={styles.gradientOverlay}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Your Earnings</Text>
          </View>

          {/* Content Wrapper */}
          <View style={styles.contentWrapper}>
            {/* Graph Section - Coming Soon */}
            <View style={styles.graphSection}>
              <View style={styles.comingSoonPlaceholder}>
                <Text style={styles.comingSoonTitle}>Earnings Breakdown Coming Soon!</Text>
                <Text style={styles.comingSoonText}>
                  We're excited to launch detailed insights on your earnings from ad plays and
                  views of your referred artists. You'll get a full breakdown of your percentage
                  shares right here.
                </Text>
                <Text style={styles.comingSoonText}>
                  Stay tuned—launching soon after production!
                </Text>
              </View>
            </View>

            {/* Info Box */}
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                👉 <Text style={styles.infoTextBold}>Earnings tracking will appear here</Text> once
                live—track your growth and cash out your share!
              </Text>
            </View>
          </View>

          {/* Bottom spacing for player */}
          <View style={{ height: 120 }} />
        </ScrollView>
      </LinearGradient>
    </ImageBackground>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  // Background & Layout
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: IS_MOBILE ? 20 : 40,
    paddingHorizontal: IS_MOBILE ? 12 : 20,
    alignItems: 'center',
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: IS_MOBILE ? 20 : 30,
  },
  headerTitle: {
    fontSize: IS_MOBILE ? 28 : 36,
    fontWeight: '700',
    color: COLORS.unisBlue,
    textAlign: 'center',
  },

  // Content Wrapper
  contentWrapper: {
    width: '100%',
    maxWidth: 900,
    gap: IS_MOBILE ? 20 : 30,
  },

  // Graph Section
  graphSection: {
    backgroundColor: COLORS.subtleBlack,
    borderRadius: IS_MOBILE ? 8 : 12,
    padding: IS_MOBILE ? 16 : 24,
  },
  comingSoonPlaceholder: {
    alignItems: 'center',
  },
  comingSoonTitle: {
    fontSize: IS_MOBILE ? 18 : 24,
    fontWeight: '700',
    color: COLORS.accentWhite,
    textAlign: 'center',
    marginBottom: IS_MOBILE ? 12 : 16,
  },
  comingSoonText: {
    fontSize: IS_MOBILE ? 14 : 16,
    color: COLORS.textSilver,
    textAlign: 'center',
    lineHeight: IS_MOBILE ? 22 : 26,
    marginBottom: 10,
  },

  // Info Box
  infoBox: {
    backgroundColor: COLORS.unisBlue,
    borderRadius: IS_MOBILE ? 8 : 12,
    padding: IS_MOBILE ? 16 : 24,
  },
  infoText: {
    fontSize: IS_MOBILE ? 14 : 16,
    color: COLORS.accentWhite,
    textAlign: 'center',
    lineHeight: IS_MOBILE ? 22 : 26,
  },
  infoTextBold: {
    fontWeight: '700',
  },
});

export default EarningsScreen;