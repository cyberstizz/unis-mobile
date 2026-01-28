// src/screens/HomeScreen.tsx
// Temporary test screen to verify setup is working

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';

const HomeScreen: React.FC = () => {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 bg-unis-dark items-center justify-center">
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text className="text-white mt-4">Loading...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-unis-dark items-center justify-center p-6">
      {/* Unis Logo/Title */}
      <Text className="text-4xl font-bold text-white mb-2">Unis</Text>
      <Text className="text-unis-purple text-lg mb-8">Harlem's Music Platform</Text>

      {/* Auth Status */}
      <View className="bg-gray-800 rounded-xl p-6 w-full mb-6">
        <Text className="text-gray-400 text-sm mb-2">Auth Status</Text>
        {user ? (
          <>
            <Text className="text-white text-lg">✓ Logged in</Text>
            <Text className="text-gray-400 mt-2">User ID: {user.userId}</Text>
            {user.jurisdiction && (
              <Text className="text-gray-400">
                Jurisdiction: {user.jurisdiction.name || user.jurisdiction.jurisdictionId}
              </Text>
            )}
          </>
        ) : (
          <Text className="text-unis-gold text-lg">Not logged in</Text>
        )}
      </View>

      {/* Test Buttons */}
      <View className="w-full gap-3">
        {user ? (
          <TouchableOpacity 
            className="bg-red-600 py-4 rounded-xl items-center"
            onPress={logout}
          >
            <Text className="text-white font-semibold text-lg">Logout</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            className="bg-unis-purple py-4 rounded-xl items-center"
            onPress={() => console.log('Navigate to login')}
          >
            <Text className="text-white font-semibold text-lg">Go to Login</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Setup Confirmation */}
      <View className="mt-8 p-4 border border-green-500 rounded-xl">
        <Text className="text-green-500 text-center">
          ✓ NativeWind is working{'\n'}
          ✓ AuthContext is loaded{'\n'}
          ✓ SecureStore is ready
        </Text>
      </View>
    </View>
  );
};

export default HomeScreen;