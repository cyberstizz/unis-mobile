import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';

// Screens
import FeedScreen from '../screens/FeedScreen';
import HomeScreen from '../screens/HomeScreen'; 

// Custom Drawer
import CustomDrawer from '../components/CustomDrawer';

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
};

export type DrawerParamList = {
  Home: undefined;
  Vote: undefined;
  Find: undefined;
  Leaderboards: undefined;
  Settings: undefined;
  Earnings: undefined;
  Playlists: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

// Placeholder screens - we'll build these out
const PlaceholderScreen = ({ route }: any) => {
  const HomeScreenComponent = require('../screens/HomeScreen').default;
  return <HomeScreenComponent />;
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
      {/* We'll add these as we build them */}
      {/* <Stack.Screen name="Song" component={SongScreen} /> */}
      {/* <Stack.Screen name="Artist" component={ArtistScreen} /> */}
    </Stack.Navigator>
  );
};

// Drawer Navigator
const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Drawer.Navigator
        drawerContent={(props) => <CustomDrawer {...props} />}
        screenOptions={{
          headerShown: false,
          drawerType: 'front',
          drawerStyle: {
            backgroundColor: '#000000',
            width: 250,
          },
          overlayColor: 'rgba(22, 51, 135, 0.5)', // Unis blue overlay
          swipeEnabled: true,
          swipeEdgeWidth: 50,
        }}
      >
        <Drawer.Screen name="Home" component={MainStack} />
        <Drawer.Screen name="Vote" component={PlaceholderScreen} />
        <Drawer.Screen name="Find" component={PlaceholderScreen} />
        <Drawer.Screen name="Leaderboards" component={PlaceholderScreen} />
        <Drawer.Screen name="Settings" component={PlaceholderScreen} />
        <Drawer.Screen name="Earnings" component={PlaceholderScreen} />
        <Drawer.Screen name="Playlists" component={PlaceholderScreen} />
      </Drawer.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;