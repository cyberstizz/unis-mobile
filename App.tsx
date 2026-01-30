// App.tsx
// Main entry point - Layout structure: Header → Content → Footer → MiniPlayer

import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Font from 'expo-font';
import { AuthProvider } from './src/context/AuthContext';
import { PlayerProvider } from './src/context/PlayerContext';
import AppNavigator from './src/navigation/AppNavigator';
import MiniPlayer from './src/components/MiniPlayer';

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
      // Always set to true so app renders regardless of font load status
      setFontsLoaded(true);
    }
    loadFonts();
  }, []);

  // Show nothing briefly while fonts attempt to load (max ~1 second)
  // This prevents flash of unstyled text
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
            <View style={styles.container}>
              <StatusBar style="light" />
              
              {/* Main app content (Header is inside Navigator) */}
              <View style={styles.content}>
                <AppNavigator />
              </View>
              
              {/* MiniPlayer - always at very bottom, below everything */}
              <MiniPlayer />
              
            </View>
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
});