import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Dimensions, ActivityIndicator, Text } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  NavigationContainer,
  NavigationContainerRef,
  DrawerActions,
} from '@react-navigation/native';

// Auth
import { useAuth } from '../context/AuthContext';

// Screens
import LoginScreen from '../screens/Loginscreen';
import FeedScreen from '../screens/FeedScreen';
import HomeScreen from '../screens/HomeScreen';
import VoteAwardsScreen from '../screens/VoteAwardsScreen';
import FindScreen from '../screens/FindScreen';
import SongScreen from '../screens/SongScreen';
import ArtistScreen from '../screens/ArtistScreen';
import LeaderboardsScreen from '../screens/Leaderboardsscreen';
import MilestonesScreen from '../screens/Milestonesscreen';
import JurisdictionScreen from '../screens/JurisdictionScreen';
import ArtistDashboardScreen from '../screens/ArtistdashboardScreen';
import ProfileScreen from '../screens/ProfileScreen';
import EarningsScreen from '../screens/Earningsscreen';

// Components
import CustomDrawer from '../components/CustomDrawer';
import Header from '../components/Header';
import DrawerTrigger from '../components/DrawerTrigger';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// Types for navigation
export type RootStackParamList = {
  Feed: undefined;
  Song: { songId: string; type?: string };
  Artist: { artistId: string };
  VoteAwards: undefined;
  Find: undefined;
  Leaderboards: undefined;
  Earnings: undefined;
  Milestones: undefined;
  Profile: undefined;
  ArtistDashboard: undefined;
  Settings: undefined;
  Jurisdiction: undefined;
};

export type DrawerParamList = {
  Home: undefined;
  Vote: undefined;
  Find: undefined;
  Leaderboards: undefined;
  Settings: undefined;
  Earnings: undefined;
  Playlists: undefined;
  Milestones: undefined;
  Artist: undefined;
  Profile: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

// Placeholder screens
const PlaceholderScreen = () => {
  return <HomeScreen />;
};

// Main Stack Navigator
const MainStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#1a1a1a' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Feed" component={FeedScreen} />
      <Stack.Screen name="Song" component={SongScreen} />
      <Stack.Screen name="Artist" component={ArtistScreen} />
      <Stack.Screen name="Leaderboards" component={LeaderboardsScreen} />
      <Stack.Screen name="Milestones" component={MilestonesScreen} />
      <Stack.Screen name="Jurisdiction" component={JurisdictionScreen} />
      <Stack.Screen name="ArtistDashboard" component={ArtistDashboardScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
};

// Layout wrapper that includes Header
const LayoutWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <View style={styles.layout}>
      <Header />
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
};

// Wrapped screens with Header
const MainStackWithHeader = () => (
  <LayoutWrapper><MainStack /></LayoutWrapper>
);
const PlaceholderWithHeader = () => (
  <LayoutWrapper><PlaceholderScreen /></LayoutWrapper>
);
const VoteAwardsWithHeader = () => (
  <LayoutWrapper><VoteAwardsScreen /></LayoutWrapper>
);
const FindScreenWithHeader = () => (
  <LayoutWrapper><FindScreen /></LayoutWrapper>
);
const LeaderboardsWithHeader = () => (
  <LayoutWrapper><LeaderboardsScreen /></LayoutWrapper>
);
const MilestonesWithHeader = () => (
  <LayoutWrapper><MilestonesScreen /></LayoutWrapper>
);
const ArtistDashboardWithHeader = () => (
  <LayoutWrapper><ArtistDashboardScreen /></LayoutWrapper>
);
const ProfileScreenWithHeader = () => (
  <LayoutWrapper><ProfileScreen /></LayoutWrapper>
);
const EarningsScreenWithHeader = () => (
  <LayoutWrapper><EarningsScreen /></LayoutWrapper>
);

// Loading screen
const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#163387" />
    <Text style={styles.loadingText}>Loading...</Text>
  </View>
);

// Main App Navigator with Drawer
const MainAppNavigator = () => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const navigationRef = useRef<NavigationContainerRef<DrawerParamList>>(null);

  const openDrawer = useCallback(() => {
    navigationRef.current?.dispatch(DrawerActions.openDrawer());
  }, []);

  console.log('=== DRAWER OPEN:', isDrawerOpen, '===');

  return (
    <View style={styles.navigatorContainer}>
      <NavigationContainer
        ref={navigationRef}
        onStateChange={(state) => {
          const history = state?.routes?.[0]?.state?.history;
          if (history) {
            const isOpen = history.some(
              (entry: any) => entry.type === 'drawer'
            );
            setIsDrawerOpen(isOpen);
          } else {
            setIsDrawerOpen(false);
          }
        }}
      >
        <Drawer.Navigator
          drawerContent={(props) => <CustomDrawer {...props} />}
          screenOptions={{
            headerShown: false,
            drawerType: 'front',
            drawerStyle: {
              backgroundColor: 'transparent',
              width: 250,
            },
            overlayColor: 'rgba(0, 0, 0, 0.7)',
            swipeEnabled: true,
            swipeEdgeWidth: 50,
          }}
        >
          <Drawer.Screen name="Home" component={MainStackWithHeader} />
          <Drawer.Screen name="Vote" component={VoteAwardsWithHeader} />
          <Drawer.Screen name="Find" component={FindScreenWithHeader} />
          <Drawer.Screen name="Leaderboards" component={LeaderboardsWithHeader} />
          <Drawer.Screen name="Profile" component={ProfileScreenWithHeader} />
          <Drawer.Screen name="Settings" component={ArtistDashboardWithHeader} />
          <Drawer.Screen name="Earnings" component={EarningsScreenWithHeader} />
          <Drawer.Screen name="Playlists" component={PlaceholderWithHeader} />
          <Drawer.Screen name="Milestones" component={MilestonesWithHeader} />
          <Drawer.Screen name="Artist" component={ArtistDashboardWithHeader} />
        </Drawer.Navigator>
      </NavigationContainer>

      {!isDrawerOpen && (
        <DrawerTrigger onPress={openDrawer} />
      )}
    </View>
  );
};


// Root Navigator — checks auth
const AppNavigator = () => {
  const { user, loading } = useAuth();

  console.log('AppNavigator - loading:', loading, 'user:', user ? user.username : 'null');

  if (loading) {
    return <LoadingScreen />;
  }

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
  navigatorContainer: {
    flex: 1,
  },
  layout: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
});

export default AppNavigator;