// CustomDrawer.tsx
// Slide-out navigation drawer matching web sidebar mobile behavior
// Transparent background, Unis blue overlay (handled by navigator), Bitcount font, lucide icons

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import {
  DrawerContentScrollView,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';
import {
  House,
  Vote,
  Search,
  Trophy,
  Settings,
  DollarSign,
  Music,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';

// Design tokens from sidebar.scss
const COLORS = {
  textSilver: '#C0C0C0',
  accentWhite: '#FFFFFF',
  unisBlue: '#163387',
  unisSilver: '#918f8f',
  bgDark: '#1A1A1A',
  borderSilver: '#C0C0C0',
};

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface NavItem {
  label: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  route: string;
  isHome?: boolean;
}

const CustomDrawer: React.FC<DrawerContentComponentProps> = (props) => {
  const { navigation } = props;
  const { user } = useAuth();

  // Routes match DrawerParamList in AppNavigator
  const navItems: NavItem[] = [
    {
      label: 'Home',
      icon: House,
      route: 'Home',
      isHome: true,
    },
    {
      label: 'Vote',
      icon: Vote,
      route: 'Vote',
    },
    {
      label: 'Find',
      icon: Search,
      route: 'Find',
    },
    {
      label: 'Leaderboards',
      icon: Trophy,
      route: 'Leaderboards',
    },
    {
      label: 'Settings',
      icon: Settings,
      // Settings goes to Settings screen; role-based routing can be handled in that screen
      route: 'Settings',
    },
    {
      label: 'Earnings',
      icon: DollarSign,
      route: 'Earnings',
    },
    {
      label: 'Playlists',
      icon: Music,
      route: 'Playlists',
    },
  ];

  const handleNavPress = (item: NavItem) => {
    navigation.navigate(item.route);
    navigation.closeDrawer();
  };

  return (
    <View style={styles.container}>
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={false}
      >
        <View style={styles.navList}>
          {navItems.map((item) => {
            const IconComponent = item.icon;
            const iconColor = item.isHome ? COLORS.unisBlue : COLORS.textSilver;
            const textColor = item.isHome ? COLORS.unisBlue : COLORS.textSilver;

            return (
              <TouchableOpacity
                key={item.label}
                style={styles.navItem}
                onPress={() => handleNavPress(item)}
                activeOpacity={0.7}
              >
                <View style={styles.iconContainer}>
                  <IconComponent size={24} color={iconColor} />
                </View>
                <Text style={[styles.navText, { color: textColor }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </DrawerContentScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent', // Transparent on mobile per SCSS
  },
  scrollContent: {
    paddingTop: SCREEN_HEIGHT * 0.11, // top: 11vh from SCSS
  },
  navList: {
    flex: 1,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 15,
    paddingBottom: 8,
    paddingLeft: 15,
    paddingRight: 1,
    // Border is transparent on mobile per SCSS @media (max-width: 768px)
    borderBottomWidth: 0,
  },
  iconContainer: {
    width: 25,
    height: 35,
    marginRight: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navText: {
    fontFamily: 'BitcountGridDouble',
    fontSize: 23,
    paddingTop: 2,
    marginLeft: 3,
  },
});

export default CustomDrawer;