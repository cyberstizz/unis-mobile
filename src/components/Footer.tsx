// Footer.tsx
// Footer with legal links and copyright
// Position: bottom of scrollable content (not fixed)
// Height: 20vh on mobile (from SCSS)

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

// Design tokens
const COLORS = {
  textSilver: '#C0C0C0',
  textGray: '#A9A9A9',
  accentWhite: '#FFFFFF',
  bgBlack: '#000000',
};

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface FooterLink {
  label: string;
  route?: string;
  url?: string;
}

const Footer: React.FC = () => {
  const navigation = useNavigation();

  const links: FooterLink[] = [
    { label: 'Privacy Policy', route: 'Privacy' },
    { label: 'Terms of Use', route: 'Terms' },
    { label: 'Cookie Policy', route: 'Cookie' },
    { label: 'Report Infringement', route: 'ReportInfringement' },
  ];

  const handleLinkPress = (link: FooterLink) => {
    if (link.url) {
      Linking.openURL(link.url).catch((err) =>
        console.warn('[Footer] failed to open external url', link.url, err),
      );
      return;
    }
    if (!link.route) return;

    // The legal screens (Privacy/Terms/Cookie/ReportInfringement) are not yet
    // registered in the navigator. Guard the navigate call so a tap logs and
    // no-ops instead of throwing the redbox "route not handled" error. Once the
    // screens are added to AppNavigator this starts working with no change here.
    try {
      // @ts-ignore - navigation typing
      navigation.navigate(link.route);
    } catch (err) {
      console.warn('[Footer] route not registered yet:', link.route, err);
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <View style={styles.footer}>
      <View style={styles.linksContainer}>
        {links.map((link, index) => (
          <React.Fragment key={link.label}>
            <TouchableOpacity
              onPress={() => handleLinkPress(link)}
              activeOpacity={0.7}
            >
              <Text style={styles.linkText}>{link.label}</Text>
            </TouchableOpacity>
            {index < links.length - 1 && (
              <Text style={styles.separator}> | </Text>
            )}
          </React.Fragment>
        ))}
      </View>
      
      <Text style={styles.copyright}>
        © {currentYear} Unis. All rights reserved.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  footer: {
    minHeight: SCREEN_HEIGHT * 0.2, // 20vh mobile
    backgroundColor: COLORS.bgBlack,
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  linkText: {
    color: COLORS.textGray,
    fontSize: 14,
    fontFamily: 'Inter', // Will fallback to system if Inter not loaded
  },
  separator: {
    color: COLORS.textGray,
    fontSize: 14,
  },
  copyright: {
    color: COLORS.textSilver,
    fontSize: 12,
    textAlign: 'center',
  },
});

export default Footer;