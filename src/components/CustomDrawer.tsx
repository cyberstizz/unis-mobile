// src/components/CustomDrawer.tsx
// Slide-out navigation drawer matching web sidebar mobile behavior
// Black background, dark overlay (handled by navigator), Bitcount font, lucide icons
// Font sized down to prevent text wrapping on narrow drawer

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

  const navItems: NavItem[] = [
    { label: 'Home', icon: House, route: 'Home', isHome: true },
    { label: 'Vote', icon: Vote, route: 'Vote' },
    { label: 'Find', icon: Search, route: 'Find' },
    { label: 'Leaderboards', icon: Trophy, route: 'Leaderboards' },
    { label: 'Settings', icon: Settings, route: 'Settings' },
    { label: 'Earnings', icon: DollarSign, route: 'Earnings' },
    { label: 'Playlists', icon: Music, route: 'Playlists' },
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
                  <IconComponent size={22} color={iconColor} />
                </View>
                <Text
                  style={[styles.navText, { color: textColor }]}
                  numberOfLines={1}
                >
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
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingTop: SCREEN_HEIGHT * 0.11, 
  },
  navList: {
    flex: 1,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 15,
    paddingBottom: 10,
    paddingLeft: 15,
    paddingRight: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(192, 192, 192, 0.15)', // Subtle separator like web
  },
  iconContainer: {
    width: 25,
    height: 30,
    marginRight: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navText: {
    fontFamily: 'BitcountGridDouble',
    fontSize: 13,         
    paddingTop: 2,
    marginLeft: 3,
    flexShrink: 1,        
  },
});

export default CustomDrawer;