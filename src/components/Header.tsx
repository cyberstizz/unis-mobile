// src/components/Header.tsx
// App header with logo, search bar, and quick navigation options
// Uses LinearGradient to match web: linear-gradient(to bottom, #1A1A1A, #000000)

import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import UnisLogo from '../../assets/unisLogoThree.svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 768;

// =============================================================================
// DESIGN TOKENS - Edit these to adjust colors
// =============================================================================
const COLORS = {
  gradientStart: '#1A1A1A',    // Top of gradient
  gradientEnd: '#000000',       // Bottom of gradient
  borderColor: '#C0C0C0',       // Silver border at bottom
  textWhite: '#FFFFFF',
  textGray: '#A9A9A9',
  unisBlue: '#163387',
};

// =============================================================================
// SIZE SETTINGS - Edit these to adjust header size
// =============================================================================
const SIZES = {
  // Logo dimensions — increased ~20% for better visibility
  logoSize: IS_MOBILE ? 80 : 112,
  
  // Padding values
  topRowPaddingVertical: IS_MOBILE ? 2 : 4,
  optionsBarPaddingBottom: IS_MOBILE ? 5 : 6,
  
  // Search bar
  searchFontSize: IS_MOBILE ? 10 : 14,
  searchPaddingVertical: IS_MOBILE ? 3 : 5,
  
  // Option buttons
  optionFontSize: IS_MOBILE ? 8 : 10,
  optionPaddingVertical: IS_MOBILE ? 1 : 3,
  optionPaddingHorizontal: IS_MOBILE ? 10 : 14,
  
  // Logout text
  logoutFontSize: IS_MOBILE ? 11 : 13,
};

// =============================================================================
// QUICK NAV OPTIONS - Edit these to change navigation buttons
// =============================================================================
const QUICK_OPTIONS = [
  { label: 'Vote', route: 'Vote' },
  { label: 'Awards', route: 'Milestones' },
  { label: 'Popular', route: 'Artist' },
  { label: 'Earnings', route: 'Earnings' },
];

// =============================================================================
// COMPONENT
// =============================================================================
const Header: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user, logout } = useAuth();

  const handleHome = () => {
    navigation.navigate('Home' as never);
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleOptionPress = (route: string) => {
    navigation.navigate(route as never);
  };

  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Top Row: Logo, Search, User */}
      <View style={styles.topRow}>
        {/* Logo */}
        <TouchableOpacity onPress={handleHome} style={styles.logoWrapper}>
          <UnisLogo width={SIZES.logoSize} height={SIZES.logoSize} />
        </TouchableOpacity>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchBar}
            placeholder="Search artists, songs..."
            placeholderTextColor={COLORS.textGray}
          />
        </View>

        {/* User Section */}
        <View style={styles.userSection}>
          {user && !IS_MOBILE && (
            <Text style={styles.userName}>{user.username}</Text>
          )}
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Options Bar */}
      <View style={styles.optionsBar}>
        {QUICK_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.label}
            style={styles.optionBox}
            onPress={() => handleOptionPress(option.route)}
            activeOpacity={0.7}
          >
            <Text style={styles.optionText}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </LinearGradient>
  );
};

// =============================================================================
// STYLES
// =============================================================================
const styles = StyleSheet.create({
  // Main container - LinearGradient is the container now
  container: {
    width: '100%',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderColor,
    // borderBottomColor: 'silver',
  },
  
  // Top row with logo, search, logout
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: IS_MOBILE ? 8 : 10,
    paddingVertical: SIZES.topRowPaddingVertical,
  },
  
  // Logo wrapper
  logoWrapper: {
    flexShrink: 0,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: IS_MOBILE ? 4 : 16,
  },
  
  // Search bar container and input
  searchContainer: {
    flex: 1,
    maxWidth: IS_MOBILE ? '50%' : 300,
    marginHorizontal: 10,
  },
  searchBar: {
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: COLORS.borderColor,
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: SIZES.searchPaddingVertical,
    color: COLORS.textWhite,
    fontSize: SIZES.searchFontSize,
    textAlign: 'center',
  },
  
  // User section with username and logout
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 10,
    alignSelf: 'flex-start',
    marginTop: 22,
  },
  userName: {
    color: COLORS.textWhite,
    fontWeight: 'bold',
    fontSize: 14,
    fontFamily: 'BitcountGridDouble',
  },
  logoutText: {
    color: COLORS.unisBlue,
    fontSize: SIZES.logoutFontSize,
    fontWeight: 'bold',
    fontFamily: 'BitcountGridDouble',
  },
  
  // Options bar with navigation buttons
  optionsBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: IS_MOBILE ? 17 : 20,
    paddingBottom: SIZES.optionsBarPaddingBottom,
    gap: IS_MOBILE ? 8 : 15,
    flexWrap: 'wrap',
    marginTop: -10,
  },
  
  // Individual option button
  optionBox: {
    paddingHorizontal: SIZES.optionPaddingHorizontal,
    paddingVertical: SIZES.optionPaddingVertical,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.unisBlue,
    borderRadius: 50,
    minWidth: IS_MOBILE ? 60 : undefined,
    alignItems: 'center',
  },
  optionText: {
    color: COLORS.textWhite,
    fontSize: SIZES.optionFontSize,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});

export default Header;