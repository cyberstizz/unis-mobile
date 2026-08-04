// ============================================================================
// Layout.tsx — the mobile app shell.
//
// Port of the web Layout component. Same contract:
//   • renders <Header /> above the screen content
//   • renders <Footer /> below it, unless `hideFooter` is set
//   • `hideFooter` lets full-height views (e.g. Messages) drop the footer
//
// WHY THIS EXISTS AS A FILE
//   The shell used to be an inline `LayoutWrapper` defined inside
//   AppNavigator.tsx. Extracting it here makes it a reusable, testable module
//   and keeps the navigator focused on routing — every `*WithHeader` wrapper
//   now composes this instead of repeating the View/Header/content structure.
//
// FOOTER + MOBILE SCROLL — READ BEFORE CHANGING
//   On web the footer sits inside <main> and scrolls with the page. On mobile
//   every screen owns its OWN ScrollView/FlatList that fills the content area,
//   so a footer rendered here would sit OUTSIDE that scroll — either clipped or
//   pinned over the content. That is why `showFooter` defaults to FALSE: the
//   scroll-integrated footer belongs at the end of each screen's scroll
//   content, which is a per-screen change, not a layout change. When a screen
//   opts in with `showFooter`, the footer renders beneath the content area as a
//   non-scrolling band — correct for short/non-scrolling screens (legal pages,
//   Messages-style views), not for long feeds.
//
//   `hideFooter` is kept as the inverse escape hatch to mirror the web prop
//   name exactly, so a web dev reading both files sees the same vocabulary.
// ============================================================================

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { usePlayer } from '../context/PlayerContext';
import Header from './Header';
import Footer from './Footer';

interface LayoutProps {
  children: React.ReactNode;
  /**
   * Render the footer band beneath the content. Defaults to false because most
   * screens own a scroll view and integrate their own footer at the end of
   * their content (see FOOTER + MOBILE SCROLL above).
   */
  showFooter?: boolean;
  /**
   * Mirror of the web `hideFooter` prop. When true, forces the footer off even
   * if `showFooter` is set. Lets a caller written against the web contract
   * behave identically here.
   */
  hideFooter?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, showFooter = false, hideFooter = false }) => {
  const { currentMedia } = usePlayer();
  const footerVisible = showFooter && !hideFooter;

  return (
    <View style={styles.layout}>
      <Header />

      <View style={[styles.content, currentMedia && styles.contentWithPlayer]}>
        {children}
      </View>

      {footerVisible && <Footer />}
    </View>
  );
};

const styles = StyleSheet.create({
  layout: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
  },
  // When a track is loaded the mini-player overlays the bottom ~90px; pad the
  // content so the last row clears it. (Carried over verbatim from the old
  // inline LayoutWrapper.)
  contentWithPlayer: {
    paddingBottom: 90,
  },
});

export default Layout;