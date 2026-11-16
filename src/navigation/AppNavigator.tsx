// src/navigation/AppNavigator.tsx
// ─────────────────────────────────────────────────────────────
// Routes, mirroring web App.jsx (Nov 2026).
//
//   Drawer (web sidebar)      Stack inside "Home" (web page routes)
//   ─────────────────────     ────────────────────────────────────
//   Home        /             Feed            /
//   Find        /findpage     Song            /song/:songId
//   Discover    /discover     Artist          /artist/:artistId
//   Vote        /voteawards   Playlist        /playlist/:playlistId
//   Leaderboards              Video           /video/:videoId
//   Charts      /charts       Jurisdiction    /jurisdiction/:j
//   Messages    /messages     Winners         /jurisdiction/:j/winners
//   Playlists   (manager)     BrowseTag       /browse/:kind/:slug
//   Earnings    /earnings     Listener        /user/:userId
//   Plus        /plus         Award           /award/:awardId
//   Settings    /profile or   Milestones, Leaderboards, Profile,
//               /artistDashboard              ArtistDashboard
//   Help        /help
//   Milestones
//
// Web-only, deliberately not in the app: admin pages, the pre-launch Coming
// soon gate, and the public pitch pages (/sponsor, /waitlist, /team, /join),
// which are link targets for posters and flyers.
// ─────────────────────────────────────────────────────────────
import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DrawerActions } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import { navigationRef } from './navigationRef';
import { useUnisTheme } from '../theme/unisTheme';

// Screens
import LoginScreen from '../screens/Loginscreen';
import FeedScreen from '../screens/FeedScreen';
import VoteAwardsScreen from '../screens/VoteAwardsScreen';
import FindScreen from '../screens/FindScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import SongScreen from '../screens/SongScreen';
import ArtistScreen from '../screens/ArtistScreen';
import LeaderboardsScreen from '../screens/Leaderboardsscreen';
import MilestonesScreen from '../screens/Milestonesscreen';
import JurisdictionScreen from '../screens/JurisdictionScreen';
import WinnersScreen from '../screens/WinnersScreen';
import ArtistDashboardScreen from '../screens/ArtistdashboardScreen';
import ProfileScreen from '../screens/ProfileScreen';
import EarningsScreen from '../screens/Earningsscreen';
import MessageScreen from '../screens/MessageScreen';
import ChartsScreen from '../screens/ChartsScreen';
import PlaylistsScreen from '../screens/PlaylistsScreen';
import PlaylistScreen from '../screens/PlaylistScreen';
import VideoScreen from '../screens/VideoScreen';
import BrowseTagScreen from '../screens/BrowseTagScreen';
import ListenerScreen from '../screens/ListenerScreen';
import AwardScreen from '../screens/AwardScreen';
import PlusScreen from '../screens/PlusScreen';
import HelpScreen from '../screens/HelpScreen';

// Components
import CustomDrawer from '../components/CustomDrawer';
import Layout from '../components/Layout';
import DrawerTrigger from '../components/DrawerTrigger';

export type RootStackParamList = {
  Feed: undefined;
  Song: { songId: string; type?: string };
  Artist: { artistId: string };
  Leaderboards: undefined;
  Milestones: undefined;
  Profile: undefined;
  ArtistDashboard: { tab?: string } | undefined;
  // Both accept `jurisdictionName` (JurisdictionScreen reads first) and
  // `jurisdiction` (WinnersScreen reads first), so either caller works.
  Jurisdiction: { jurisdictionName?: string; jurisdiction?: string; jurisdictionId?: string } | undefined;
  Winners:
    | {
        jurisdiction?: string;
        jurisdictionName?: string;
        jurisdictionId?: string | null;
        interval?: 'day' | 'week' | 'month' | 'quarter' | 'midterm' | 'year';
        category?: 'song' | 'artist';
      }
    | undefined;
  Playlist: { playlistId: string };
  Video: { videoId: string };
  BrowseTag: { kind: 'subgenre' | 'mood' | string; slug: string };
  Listener: { userId: string };
  Award: { awardId: string };
};

export type DrawerParamList = {
  Home: undefined;
  Vote: undefined;
  Find: undefined;
  Discover: { q?: string } | undefined;
  Leaderboards: undefined;
  Charts: undefined;
  Messages: { recipientId?: string; recipientName?: string; recipientPhoto?: string; composeTo?: any } | undefined;
  Playlists: undefined;
  Settings: undefined;
  Earnings: undefined;
  Plus: undefined;
  Help: { section?: string } | undefined;
  Milestones: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const MainStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: '#07090f' },
      animation: 'slide_from_right',
    }}
  >
    <Stack.Screen name="Feed" component={FeedScreen} />
    <Stack.Screen name="Song" component={SongScreen} />
    <Stack.Screen name="Artist" component={ArtistScreen} />
    <Stack.Screen name="Playlist" component={PlaylistScreen} />
    <Stack.Screen name="Video" component={VideoScreen} />
    <Stack.Screen name="Leaderboards" component={LeaderboardsScreen} />
    <Stack.Screen name="Milestones" component={MilestonesScreen} />
    <Stack.Screen name="Jurisdiction" component={JurisdictionScreen} />
    <Stack.Screen name="Winners" component={WinnersScreen} />
    <Stack.Screen name="BrowseTag" component={BrowseTagScreen} />
    <Stack.Screen name="Listener" component={ListenerScreen} />
    <Stack.Screen name="Award" component={AwardScreen} />
    <Stack.Screen name="ArtistDashboard" component={ArtistDashboardScreen} />
    <Stack.Screen name="Profile" component={ProfileScreen} />
  </Stack.Navigator>
);

// Each drawer entry gets the app shell (Header above the screen).
const withLayout = (Screen: React.ComponentType<any>, opts: { hideFooter?: boolean } = {}) => {
  const Wrapped: React.FC<any> = (props) => (
    <Layout hideFooter={opts.hideFooter}>
      <Screen {...props} />
    </Layout>
  );
  Wrapped.displayName = `WithLayout(${Screen.displayName || Screen.name || 'Screen'})`;
  return Wrapped;
};

const HomeWithLayout = withLayout(MainStack);
const VoteWithLayout = withLayout(VoteAwardsScreen);
const FindWithLayout = withLayout(FindScreen);
const DiscoverWithLayout = withLayout(DiscoverScreen);
const LeaderboardsWithLayout = withLayout(LeaderboardsScreen);
const ChartsWithLayout = withLayout(ChartsScreen);
const MessagesWithLayout = withLayout(MessageScreen, { hideFooter: true });
const PlaylistsWithLayout = withLayout(PlaylistsScreen);
const EarningsWithLayout = withLayout(EarningsScreen);
const PlusWithLayout = withLayout(PlusScreen);
const HelpWithLayout = withLayout(HelpScreen);
const MilestonesWithLayout = withLayout(MilestonesScreen);
const ArtistDashboardWithLayout = withLayout(ArtistDashboardScreen);
const ProfileWithLayout = withLayout(ProfileScreen);

const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#163387" />
    <Text style={styles.loadingText}>Loading...</Text>
  </View>
);

const findDrawerOpen = (navState: any): boolean => {
  if (!navState) return false;
  if (navState.history) return navState.history.some((entry: any) => entry.type === 'drawer');
  if (navState.routes) return navState.routes.some((route: any) => findDrawerOpen(route.state));
  return false;
};

const MainAppNavigator = () => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { user } = useAuth();
  const t = useUnisTheme();

  const openDrawer = useCallback(() => {
    if (navigationRef.isReady()) navigationRef.dispatch(DrawerActions.openDrawer());
  }, []);

  // Settings = Artist Dashboard for artists, Profile for listeners (web sidebar rule).
  const SettingsScreen = user?.role === 'artist' || user?.isArtist ? ArtistDashboardWithLayout : ProfileWithLayout;

  return (
    <View style={styles.navigatorContainer}>
      <NavigationContainer
        ref={navigationRef}
        theme={{
          dark: true,
          colors: { primary: t.primary, background: '#07090f', card: '#07090f', text: '#fff', border: 'rgba(255,255,255,0.08)', notification: t.primary },
          fonts: {
            regular: { fontFamily: 'System', fontWeight: '400' },
            medium: { fontFamily: 'System', fontWeight: '500' },
            bold: { fontFamily: 'System', fontWeight: '700' },
            heavy: { fontFamily: 'System', fontWeight: '800' },
          },
        }}
        onStateChange={(state) => setIsDrawerOpen(findDrawerOpen(state))}
      >
        <Drawer.Navigator
          drawerContent={(props) => <CustomDrawer {...props} />}
          screenOptions={{
            headerShown: false,
            drawerType: 'front',
            drawerStyle: { backgroundColor: 'transparent', width: 284 },
            overlayColor: 'rgba(0, 0, 0, 0.7)',
            swipeEnabled: true,
            swipeEdgeWidth: 50,
          }}
        >
          <Drawer.Screen name="Home" component={HomeWithLayout} />
          <Drawer.Screen name="Find" component={FindWithLayout} />
          <Drawer.Screen name="Discover" component={DiscoverWithLayout} />
          <Drawer.Screen name="Vote" component={VoteWithLayout} />
          <Drawer.Screen name="Leaderboards" component={LeaderboardsWithLayout} />
          <Drawer.Screen name="Charts" component={ChartsWithLayout} />
          <Drawer.Screen name="Messages" component={MessagesWithLayout} />
          <Drawer.Screen name="Playlists" component={PlaylistsWithLayout} />
          <Drawer.Screen name="Earnings" component={EarningsWithLayout} />
          <Drawer.Screen name="Plus" component={PlusWithLayout} />
          <Drawer.Screen name="Settings" component={SettingsScreen} />
          <Drawer.Screen name="Help" component={HelpWithLayout} />
          <Drawer.Screen name="Milestones" component={MilestonesWithLayout} />
        </Drawer.Navigator>
      </NavigationContainer>

      {!isDrawerOpen && <DrawerTrigger onPress={openDrawer} />}
    </View>
  );
};

const AppNavigator = () => {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return (
      <NavigationContainer>
        <LoginScreen />
      </NavigationContainer>
    );
  }

  return <MainAppNavigator />;
};

const styles = StyleSheet.create({
  navigatorContainer: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  loadingText: { color: '#fff', marginTop: 16, fontSize: 16 },
});

export default AppNavigator;
