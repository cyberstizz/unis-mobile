
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/context/AuthContext';
import { PlayerProvider } from './src/context/PlayerContext';
import AppNavigator from './src/navigation/AppNavigator';
import MiniPlayer from './src/components/MiniPlayer';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <AuthProvider>
          <PlayerProvider>
            <View style={styles.container}>
              <StatusBar style="light" />
              {/* Main Navigation */}
              <View style={styles.content}>
                <AppNavigator />
              </View>
              {/* MiniPlayer persists at bottom of screen, outside navigation */}
              <SafeAreaView edges={['bottom']} style={styles.playerContainer}>
                <MiniPlayer />
              </SafeAreaView>
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
  playerContainer: {
    backgroundColor: '#1a1a1a',
  },
});