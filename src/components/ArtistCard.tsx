// src/components/ArtistCard.tsx
// Card for displaying artists in the Popular Artists section

import React from 'react';
import { View, Text, TouchableOpacity, ImageBackground, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface ArtistItem {
  userId: string;
  username: string;
  photoUrl?: string;
  jurisdictionId?: string;
  jurisdictionName?: string;
  score?: number;
}

interface ArtistCardProps {
  artist: ArtistItem;
  onPress: () => void;
  onViewPress: () => void;
}

const ArtistCard: React.FC<ArtistCardProps> = ({ artist, onPress, onViewPress }) => {
  const locationName = artist.jurisdictionName || 'Your Area';
  
  return (
    <TouchableOpacity 
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.9}
    >
      {/* Artist Photo - Left Side (70%) */}
      <View style={styles.imageContainer}>
        <ImageBackground
          source={{ uri: artist.photoUrl || 'https://picsum.photos/200' }}
          style={styles.image}
          resizeMode="cover"
        >
          {/* Gradient Overlay */}
          <LinearGradient
            colors={['transparent', 'transparent', 'rgba(26, 26, 26, 0.4)', 'rgba(26, 26, 26, 0.9)']}
            locations={[0, 0.4, 0.7, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradient}
          />
        </ImageBackground>
      </View>
      
      {/* Info Section - Right Side (30%) */}
      <View style={styles.infoContainer}>
        <View style={styles.details}>
          <Text style={styles.name} numberOfLines={2}>
            {artist.username}
          </Text>
          <Text style={styles.location} numberOfLines={1}>
            {locationName}
          </Text>
        </View>
        
        <TouchableOpacity 
          style={styles.viewButton}
          onPress={(e) => {
            e.stopPropagation?.();
            onViewPress();
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.viewButtonText}>VIEW</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: SCREEN_WIDTH > 480 ? 260 : 200,
    backgroundColor: 'rgba(26, 26, 26, 0.8)',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(192, 192, 192, 0.15)',
  },
  imageContainer: {
    flex: 0.7,
    backgroundColor: '#1a1a1a',
  },
  image: {
    flex: 1,
    justifyContent: 'center',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  infoContainer: {
    flex: 0.3,
    padding: SCREEN_WIDTH > 480 ? 16 : 10,
    backgroundColor: 'rgba(26, 26, 26, 0.95)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(22, 51, 135, 0.3)',
    justifyContent: 'space-between',
  },
  details: {
    flex: 1,
    gap: 15,
  },
  name: {
    fontSize: SCREEN_WIDTH > 480 ? 14 : 13,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 18,
    letterSpacing: 0.3,
  },
  location: {
    fontSize: SCREEN_WIDTH > 480 ? 10 : 9,
    color: '#A9A9A9',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  viewButton: {
    paddingVertical: SCREEN_WIDTH > 480 ? 8 : 6,
    paddingHorizontal: SCREEN_WIDTH > 480 ? 12 : 8,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#163387',
    borderRadius: 6,
    alignItems: 'center',
  },
  viewButtonText: {
    color: '#163387',
    fontSize: SCREEN_WIDTH > 480 ? 12 : 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});

export default ArtistCard;