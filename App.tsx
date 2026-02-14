import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Font from 'expo-font';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { PlayerProvider, usePlayer } from './src/context/PlayerContext';import AppNavigator from './src/navigation/AppNavigator';
import Player from './src/components/Player';
import SongNotification from './src/components/SongNotification';
import WinnersNotification from './src/components/WinnersNotification';


// Inner component that can use safe area hooks and auth context
const AppContent: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { clearPlayer } = usePlayer();

  useEffect(() => {
  if (!user) {
    clearPlayer();
  }
}, [user]);


  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Main app content (Header is inside Navigator) */}
      <View style={styles.content}>
        <AppNavigator />
      </View>

      {/* Only show notifications and Player when logged in */}
      {user && (
        <>
          <SongNotification />
          <WinnersNotification />
          <Player />
        </>
      )}

      {/* Bottom safe area fill - always black */}
      <View style={[styles.bottomSafeArea, { height: insets.bottom }]} />
    </View>
  );
};

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync({
          'BitcountGridDouble': require('./assets/fonts/BitcountGridDouble-VariableFont_CRSV,ELSH,ELXP,slnt,wght.ttf'),
        });
        console.log('Fonts loaded successfully');
      } catch (error) {
        console.warn('Font loading failed, continuing without custom font:', error);
      }
      setFontsLoaded(true);
    }
    loadFonts();
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <AuthProvider>
          <PlayerProvider>
            <AppContent />
          </PlayerProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
  },
  bottomSafeArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000',
    zIndex: 999,
  },
});