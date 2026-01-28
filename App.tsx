// App.tsx
// Main entry point - wraps app with providers

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { PlayerProvider } from './src/context/PlayerContext';
import HomeScreen from './src/screens/HomeScreen';
import MiniPlayer from './src/components/MiniPlayer';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PlayerProvider>
          <View style={styles.container}>
            <StatusBar style="light" />
            <SafeAreaView style={styles.content} edges={['top']}>
              <HomeScreen />
            </SafeAreaView>
            {/* MiniPlayer persists at bottom of screen */}
            <SafeAreaView edges={['bottom']} style={styles.playerContainer}>
              <MiniPlayer />
            </SafeAreaView>
          </View>
        </PlayerProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  content: {
    flex: 1,
  },
  playerContainer: {
    backgroundColor: '#1a1a1a',
  },
});