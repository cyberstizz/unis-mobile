// src/navigation/AppNavigator.tsx
// Main navigation structure - Drawer + Stack navigators with Header

import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  NavigationContainer,
  NavigationContainerRef,
  DrawerActions,
} from '@react-navigation/native';

// Screens
import FeedScreen from '../screens/FeedScreen';
import HomeScreen from '../screens/HomeScreen';
import VoteAwardsScreen from '../screens/VoteAwardsScreen';
import FindScreen from '../screens/FindScreen';
import SongScreen from '../screens/SongScreen';
import ArtistScreen from '../screens/ArtistScreen';
import LeaderboardsScreen from '../screens/Leaderboardsscreen';

// Components
import CustomDrawer from '../components/CustomDrawer';
import Header from '../components/Header';
import DrawerTrigger from '../components/DrawerTrigger';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// Types for navigation
export type RootStackParamList = {
  Feed: undefined;
  Song: { songId: string; type?: string };
  Artist: { artistId: string }; // ✅ Already defined
  VoteAwards: undefined;
  Find: undefined;
  Leaderboards: undefined;
  Earnings: undefined;
  Milestones: undefined;
  Profile: undefined;
  ArtistDashboard: undefined;
  Settings: undefined;
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
};

const Drawer = createDrawerNavigator<DrawerParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

// Placeholder screens - we'll build these out
const PlaceholderScreen = () => {
  return <HomeScreen />;
};

// Main Stack Navigator (for screens that need full-screen navigation)
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
  <LayoutWrapper>
    <MainStack />
  </LayoutWrapper>
);

const PlaceholderWithHeader = () => (
  <LayoutWrapper>
    <PlaceholderScreen />
  </LayoutWrapper>
);

const VoteAwardsWithHeader = () => (
  <LayoutWrapper>
    <VoteAwardsScreen />
  </LayoutWrapper>
);

const FindScreenWithHeader = () => (
  <LayoutWrapper>
    <FindScreen />
  </LayoutWrapper>
);

const LeaderboardsWithHeader = () => (
  <LayoutWrapper>
    <LeaderboardsScreen />
  </LayoutWrapper>
);

// Drawer Navigator
const AppNavigator = () => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const navigationRef = useRef<NavigationContainerRef<DrawerParamList>>(null);

  // Track drawer state to hide/show trigger
  const handleStateChange = useCallback((state: any) => {
    // Check if drawer is open by looking at navigation state
    const drawerState = state?.routes?.[0]?.state;
    if (drawerState) {
      const isOpen = drawerState.history?.some(
        (item: any) => item.type === 'drawer' && item.status === 'open'
      );
      setIsDrawerOpen(!!isOpen);
    } else {
      setIsDrawerOpen(false);
    }
  }, []);

  // Open drawer via ref
  const openDrawer = useCallback(() => {
    navigationRef.current?.dispatch(DrawerActions.openDrawer());
  }, []);

  return (
    <View style={styles.navigatorContainer}>
      <NavigationContainer
        ref={navigationRef}
        onStateChange={handleStateChange}
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
            overlayColor: 'rgba(22, 51, 135, 0.5)',
            swipeEnabled: true,
            swipeEdgeWidth: 50,
          }}
        >
          <Drawer.Screen name="Home" component={MainStackWithHeader} />
          <Drawer.Screen name="Vote" component={VoteAwardsWithHeader} />
          <Drawer.Screen name="Find" component={FindScreenWithHeader} />
          <Drawer.Screen name="Leaderboards" component={LeaderboardsWithHeader} />
          <Drawer.Screen name="Settings" component={PlaceholderWithHeader} />
          <Drawer.Screen name="Earnings" component={PlaceholderWithHeader} />
          <Drawer.Screen name="Playlists" component={PlaceholderWithHeader} />
          <Drawer.Screen name="Milestones" component={PlaceholderWithHeader} />
          <Drawer.Screen name="Artist" component={PlaceholderWithHeader} />
        </Drawer.Navigator>
      </NavigationContainer>

      {/* Drawer Trigger Arrow - positioned on left edge, hides when drawer is open */}
      {!isDrawerOpen && (
        <DrawerTrigger onPress={openDrawer} />
      )}
    </View>
  );
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
});

export default AppNavigator;