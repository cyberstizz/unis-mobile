// src/components/Header.tsx
// App header with logo, search bar, and quick navigation options

import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import unisLogo from '../../assets/unisLogoThree.svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 768;

// Quick nav options that appear below the search bar
const QUICK_OPTIONS = [
  { label: 'Vote', route: 'Vote' },
  { label: 'Awards', route: 'Milestones' },
  { label: 'Popular', route: 'Artist' },
  { label: 'Earnings', route: 'Earnings' },
];

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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Row: Logo, Search, User */}
      <View style={styles.topRow}>
        {/* Logo */}
        <TouchableOpacity onPress={handleHome} style={styles.logoWrapper}>
          <Image source={unisLogo} style={styles.logo} resizeMode="contain" />
        </TouchableOpacity>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchBar}
            placeholder="Search artists, songs..."
            placeholderTextColor="#A9A9A9"
          />
        </View>

        {/* User Section */}
        <View style={styles.userSection}>
          {user && !IS_MOBILE && (
            <Text style={styles.userName}>{user.username}</Text>
          )}
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 0.5,
    borderBottomColor: '#C0C0C0',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  logo: {
  width: 60,
  height: 40,
  },
  logoWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: '4%',
  },
  logoText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#163387',
    letterSpacing: 1,
  },
  searchContainer: {
    flex: 1,
    maxWidth: IS_MOBILE ? '50%' : 300,
    marginHorizontal: 10,
  },
  searchBar: {
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#C0C0C0',
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#FFFFFF',
    fontSize: IS_MOBILE ? 12 : 14,
    textAlign: 'center',
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  logoutButton: {
    borderWidth: 2,
    borderColor: '#163387',
    borderRadius: 50,
    paddingHorizontal: IS_MOBILE ? 10 : 14,
    paddingVertical: IS_MOBILE ? 4 : 6,
  },
  logoutText: {
    color: '#163387',
    fontSize: IS_MOBILE ? 11 : 13,
    fontWeight: 'bold',
  },
  optionsBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 17,
    paddingBottom: 10,
    gap: IS_MOBILE ? 8 : 15,
    flexWrap: 'wrap',
  },
  optionBox: {
    paddingHorizontal: IS_MOBILE ? 10 : 14,
    paddingVertical: IS_MOBILE ? 4 : 3,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#163387',
    borderRadius: 50,
    minWidth: IS_MOBILE ? 60 : 'auto',
    alignItems: 'center',
  },
  optionText: {
    color: '#FFFFFF',
    fontSize: IS_MOBILE ? 8 : 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});

export default Header;