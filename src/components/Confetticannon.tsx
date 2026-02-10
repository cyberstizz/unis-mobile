// src/components/VotingWizard/ConfettiCannon.tsx
//
// Pure React Native confetti effect — no native modules required.
// Replaces the web's canvas-confetti library.
// Uses the Unis brand colors for the particles.

import React, { useEffect, useRef, useMemo } from 'react';
import { View, Animated, Easing, StyleSheet, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const UNIS_COLORS = ['#163387', '#C0C0C0', '#918f8f', '#FFFFFF', '#4477CC', '#0D0D0F'];
const PARTICLE_COUNT = 60;
const DURATION = 3000;

interface Particle {
  x: Animated.Value;
  y: Animated.Value;
  rotate: Animated.Value;
  opacity: Animated.Value;
  color: string;
  size: number;
  shape: 'square' | 'rectangle' | 'circle';
  startX: number;
}

const ConfettiCannon: React.FC = () => {
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: PARTICLE_COUNT }, () => {
      const startX = Math.random() * SCREEN_WIDTH;
      const shapes: Array<'square' | 'rectangle' | 'circle'> = ['square', 'rectangle', 'circle'];
      return {
        x: new Animated.Value(startX),
        y: new Animated.Value(-20),
        rotate: new Animated.Value(0),
        opacity: new Animated.Value(1),
        color: UNIS_COLORS[Math.floor(Math.random() * UNIS_COLORS.length)],
        size: 4 + Math.random() * 8,
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        startX,
      };
    });
  }, []);

  useEffect(() => {
    const animations = particles.map((p) => {
      const delay = Math.random() * 800;
      const drift = (Math.random() - 0.5) * 120; // horizontal drift
      const fallDuration = DURATION + Math.random() * 1500;

      return Animated.parallel([
        // Fall down
        Animated.timing(p.y, {
          toValue: SCREEN_HEIGHT + 50,
          duration: fallDuration,
          delay,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: true,
        }),
        // Horizontal drift
        Animated.timing(p.x, {
          toValue: p.startX + drift,
          duration: fallDuration,
          delay,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        // Spin
        Animated.timing(p.rotate, {
          toValue: 2 + Math.random() * 4,
          duration: fallDuration,
          delay,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        // Fade out near bottom
        Animated.timing(p.opacity, {
          toValue: 0,
          duration: fallDuration,
          delay: delay + fallDuration * 0.6,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);
    });

    Animated.stagger(15, animations).start();
  }, []);

  return (
    <View style={styles.container} pointerEvents="none">
      {particles.map((p, index) => {
        const spin = p.rotate.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '360deg'],
        });

        const isCircle = p.shape === 'circle';
        const width = p.shape === 'rectangle' ? p.size * 0.5 : p.size;

        return (
          <Animated.View
            key={index}
            style={[
              {
                position: 'absolute',
                width: width,
                height: p.size,
                backgroundColor: p.color,
                borderRadius: isCircle ? p.size / 2 : 2,
                opacity: p.opacity,
                transform: [
                  { translateX: p.x },
                  { translateY: p.y },
                  { rotate: spin },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
});

export default ConfettiCannon;