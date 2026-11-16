// src/components/Header.tsx
// Ported from web header.jsx + header.scss
// Single-row layout: Logo | Search | Nav items with icons | User avatar + menu

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
  Modal,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';
import { getMediaUrl } from '../services/axiosInstance';
import UnisLogo from '../../assets/unisLogoThree.svg';
import { FindIcon, VoteIcon, AwardsIcon, EarningsIcon, MenuIcon, SearchIcon as GlowSearchIcon } from '../icons/UnisIcons';
import SearchOverlay from './SearchOverlay';
import { openDrawer } from '../navigation/navigationRef';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_SMALL = SCREEN_WIDTH < 400;
const IS_MOBILE = SCREEN_WIDTH < 768;

// ─── Design tokens (matching web header.scss) ────────────────
const C = {
  bgSurface: '#0a0a0f',
  bgElevated: '#111118',
  unisBlue: '#163387',
  unisBlueBright: '#1d42a8',
  textPrimary: '#e8e8ec',
  textMuted: '#7a7a88',
  textDim: '#4a4a56',
  borderSubtle: 'rgba(255,255,255,0.06)',
  borderSilver: 'rgba(192,192,192,0.15)',
};

// ─── Nav items ───────────────────────────────────────────────
const NAV_ITEMS = [
  { label: 'Vote', route: 'Vote', icon: 'vote' },
  { label: 'Awards', route: 'Milestones', icon: 'awards' },
  { label: 'Find', route: 'Find', icon: 'find' },
  { label: 'Earnings', route: 'Earnings', icon: 'earnings' },
];

// ─── Unis Glow icons — outline when idle, gradient-filled when active ───
const NavIcon: React.FC<{ type: string; active: boolean }> = ({ type, active }) => {
  const props = { size: 16, active };
  switch (type) {
    case 'vote': return <VoteIcon {...props} />;
    case 'awards': return <AwardsIcon {...props} />;
    case 'find': return <FindIcon {...props} />;
    case 'earnings': return <EarningsIcon {...props} />;
    default: return null;
  }
};

// Theme wordmarks — same files the web header switches between.
const LOGO_MAP: Record<string, any> = {
  orange: require('../../assets/brand/logo-orange.png'),
  red: require('../../assets/brand/logo-red.png'),
  green: require('../../assets/brand/logo-green.png'),
  purple: require('../../assets/brand/logo-purple.png'),
  yellow: require('../../assets/brand/logo-gold.png'),
  dianna: require('../../assets/brand/logo-dianna.png'),
};

// ═════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════
const Header: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, logout, theme } = useAuth() as any;
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const handleHome = () => navigation.navigate('Home', { screen: 'Feed' });
  const handleLogout = async () => { setMenuVisible(false); await logout(); };
  const handleProfile = () => { setMenuVisible(false); navigation.navigate('Settings'); };
  const handleHelp = () => { setMenuVisible(false); navigation.navigate('Help'); };
  const goSearchResult = (screen: string, params: any) => {
    if (screen === 'Discover') navigation.navigate('Discover', params);
    else navigation.navigate('Home', { screen, params });
  };
  const logoSize = IS_MOBILE ? 68 : 92;
  const themedLogo = LOGO_MAP[theme];

  const getInitial = () => user?.username?.charAt(0).toUpperCase() || 'U';
  const avatarUrl = getMediaUrl(user?.photoUrl);

  // Determine active route
  const currentRoute = navigation.getState?.()?.routes?.[navigation.getState?.()?.index]?.name || '';

  return (
    <LinearGradient
      colors={['#101016', C.bgSurface]}
      style={[styles.header, { paddingTop: insets.top }]}
    >
      {/* Top accent line */}
      <LinearGradient
        colors={['transparent', 'rgba(145,143,143,0.15)', 'rgba(29,66,168,0.2)', 'rgba(145,143,143,0.15)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.accentLine}
      />

      <View style={styles.inner}>
        {/* Hamburger — opens the sidebar */}
        <TouchableOpacity onPress={() => openDrawer()} style={styles.hamburger} accessibilityLabel="Toggle navigation menu" hitSlop={6}>
          <MenuIcon size={20} />
        </TouchableOpacity>

        {/* Logo (follows the theme) */}
        <TouchableOpacity onPress={handleHome} style={styles.logoWrap} activeOpacity={0.8} accessibilityLabel="Unis home">
          {themedLogo
            ? <Image source={themedLogo} style={{ width: logoSize, height: logoSize }} resizeMode="contain" />
            : <UnisLogo width={logoSize} height={logoSize} />}
        </TouchableOpacity>

        {/* Search — opens the full-screen search */}
        <TouchableOpacity style={styles.searchWrap} onPress={() => setSearchOpen(true)} activeOpacity={0.8} accessibilityRole="search" accessibilityLabel="Search">
          {!IS_SMALL ? (
            <View style={styles.searchBar}>
              <GlowSearchIcon size={16} />
              <Text style={[styles.searchInput, { color: C.textDim }]} numberOfLines={1}>Search artists, songs...</Text>
            </View>
          ) : (
            <View style={{ alignSelf: 'flex-end' }}><GlowSearchIcon size={19} /></View>
          )}
        </TouchableOpacity>

        {/* Nav items */}
        <View style={styles.navRow}>
          {NAV_ITEMS.map((item) => {
            const isActive = currentRoute === item.route;
            return (
              <TouchableOpacity
                key={item.label}
                style={[styles.navItem, isActive && styles.navItemActive]}
                onPress={() => navigation.navigate(item.route)}
                activeOpacity={0.7}
              >
                <NavIcon type={item.icon} active={isActive} />
                {!IS_MOBILE && (
                  <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                    {item.label}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}

          {/* Divider */}
          <View style={styles.divider} />

          {/* User avatar */}
          <TouchableOpacity
            style={styles.avatar}
            onPress={() => setMenuVisible(true)}
            activeOpacity={0.8}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitial}>{getInitial()}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Dropdown menu — uses Modal for proper layering */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuDropdown, { top: insets.top + 60, right: 16 }]}>
            {user && (
              <View style={styles.menuUserInfo}>
                <Text style={styles.menuUsername}>{user.username}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={handleProfile}>
              <Text style={styles.menuItemText}>Profile & settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleHelp}>
              <Text style={styles.menuItemText}>Help</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
              <Text style={styles.menuItemLogout}>Log out</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <SearchOverlay visible={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={goSearchResult} />
    </LinearGradient>
  );
};

// ═════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  header: {
    width: '100%',
    borderBottomWidth: 0.5,
    borderBottomColor: C.borderSilver,
  },
  accentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    zIndex: 1,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: IS_MOBILE ? 56 : 65,
    paddingHorizontal: IS_MOBILE ? 10 : 24,
    gap: IS_MOBILE ? 8 : 24,
  },

  hamburger: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  // Logo
  logoWrap: {
    flexShrink: 0,
  },

  // Search
  searchWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 38,
    width: '100%',
    maxWidth: 400,
    paddingHorizontal: 16,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  searchBarFocused: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(29,66,168,0.45)',
  },
  searchInput: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 13,
    height: '100%',
    padding: 0,
  },

  // Nav
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: IS_MOBILE ? 2 : 4,
    flexShrink: 0,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: IS_MOBILE ? 8 : 12,
    borderRadius: 100,
  },
  navItemActive: {
    backgroundColor: 'rgba(29,66,168,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(29,66,168,0.18)',
  },
  navLabel: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  navLabelActive: {
    color: '#5b8fd8',
  },

  // Divider
  divider: {
    width: 1,
    height: 22,
    backgroundColor: C.borderSubtle,
    marginHorizontal: IS_MOBILE ? 4 : 8,
  },

  // Avatar
  avatar: {
    width: IS_MOBILE ? 30 : 36,
    height: IS_MOBILE ? 30 : 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(145,143,143,0.25)',
    backgroundColor: C.unisBlue,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  avatarInitial: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: IS_MOBILE ? 11 : 14,
    fontWeight: '600',
  },

  // Dropdown menu
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  menuDropdown: {
    position: 'absolute',
    width: 180,
    backgroundColor: C.bgElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
  },
  menuUserInfo: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
  },
  menuUsername: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  menuDivider: {
    height: 1,
    backgroundColor: C.borderSubtle,
    marginVertical: 4,
  },
  menuItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  menuItemText: {
    color: C.textMuted,
    fontSize: 12.5,
    fontWeight: '500',
  },
  menuItemLogout: {
    color: '#c45555',
    fontSize: 12.5,
    fontWeight: '500',
  },
});

export default Header;