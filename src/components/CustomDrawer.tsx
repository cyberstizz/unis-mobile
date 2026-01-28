
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';

// Icons as text for now - we can add lucide-react-native later
// Home, Vote, Search, Trophy, Settings, DollarSign, Music
const MENU_ITEMS = [
  { name: 'Home', icon: '🏠', route: 'Home', isHome: true },
  { name: 'Vote', icon: '🗳️', route: 'Vote' },
  { name: 'Find', icon: '🔍', route: 'Find' },
  { name: 'Leaderboards', icon: '🏆', route: 'Leaderboards' },
  { name: 'Settings', icon: '⚙️', route: 'Settings' },
  { name: 'Earnings', icon: '💰', route: 'Earnings' },
  { name: 'Playlists', icon: '🎵', route: 'Playlists', isPlaylist: true },
];

const CustomDrawer: React.FC<DrawerContentComponentProps> = (props) => {
  const { navigation } = props;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { openPlaylistManager } = usePlayer();

  const handleNavigation = (item: typeof MENU_ITEMS[0]) => {
    if (item.isPlaylist) {
      // Open playlist manager modal instead of navigating
      openPlaylistManager();
      navigation.closeDrawer();
    } else if (item.route === 'Settings') {
      // Navigate to profile or artist dashboard based on user role
      if (user?.isArtist) {
        // navigation.navigate('ArtistDashboard');
        navigation.navigate('Settings'); // Placeholder for now
      } else {
        navigation.navigate('Settings');
      }
      navigation.closeDrawer();
    } else {
      navigation.navigate(item.route);
      navigation.closeDrawer();
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {MENU_ITEMS.map((item, index) => (
          <TouchableOpacity
            key={item.name}
            style={styles.menuItem}
            onPress={() => handleNavigation(item)}
            activeOpacity={0.7}
          >
            <Text style={[styles.icon, item.isHome && styles.homeIcon]}>
              {item.icon}
            </Text>
            <Text style={[styles.menuText, item.isHome && styles.homeText]}>
              {item.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    borderRightWidth: 0.5,
    borderRightColor: '#C0C0C0',
  },
  scrollView: {
    flex: 1,
    marginTop: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 15,
    paddingRight: 1,
    borderBottomWidth: 0.2,
    borderBottomColor: '#C0C0C0',
  },
  icon: {
    fontSize: 24,
    width: 35,
    marginRight: 7,
  },
  homeIcon: {
    // Unis blue for home icon - using tint won't work with emoji
    // We'll replace with actual icons later
  },
  menuText: {
    fontSize: 23,
    color: '#C0C0C0',
    fontWeight: '400',
    letterSpacing: 0.5,
    // Font family would be 'Bitcount Grid Double' but we need to load custom fonts
    // For now using system font
  },
  homeText: {
    color: '#163387', 
  },
});

export default CustomDrawer;