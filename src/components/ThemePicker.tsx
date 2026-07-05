// src/components/ThemePicker.tsx
// Ported from web `ThemePicker.jsx`. Same external prop signature (userId).
//
// PRESERVES THE WEB LOGIC:
//   - Uses useAuth() to read `theme` and call `setTheme(themeId, userId)`,
//     exactly like the web ThemePicker (theme support was added to the mobile
//     AuthContext as part of this port).
//   - Same theme IDs: blue, orange, red, green, purple, yellow, dianna
//   - Does NOT make any API calls directly — setTheme() handles persistence
//     (PUT /v1/users/profile/{userId} { themePreference }) in AuthContext.
//
// All this component does is render the swatch grid and forward the selection.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';

interface ThemeDef {
  id: string;
  label: string;
  hex: string | null;
}

const THEMES: ThemeDef[] = [
  { id: 'blue',   label: 'Blue',   hex: '#163387' },
  { id: 'orange', label: 'Orange', hex: '#C44B0A' },
  { id: 'red',    label: 'Red',    hex: '#B51C24' },
  { id: 'green',  label: 'Green',  hex: '#0F7A3E' },
  { id: 'purple', label: 'Purple', hex: '#4A1A8C' },
  { id: 'yellow', label: 'Gold',   hex: '#C49A0A' },
  { id: 'dianna', label: 'Dianna', hex: null }, // cheetah — uses pattern
];

// Tiny helper — darken a hex color by N%. Pure cosmetic gradient on swatches.
function darken(hex: string | null, percent: number): string {
  if (!hex) return '#000';
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, (num >> 16) - amt);
  const G = Math.max(0, ((num >> 8) & 0x00ff) - amt);
  const B = Math.max(0, (num & 0x0000ff) - amt);
  return `#${(0x1000000 + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
}

interface ThemePickerProps {
  userId: string;
}

const ThemePicker: React.FC<ThemePickerProps> = ({ userId }) => {
  const { theme, setTheme } = useAuth();

  const handleSelect = (themeId: string) => {
    if (themeId === theme) return;
    setTheme(themeId, userId);
  };

  return (
    <View>
      <Text style={styles.title}>Pick your palette</Text>
      <Text style={styles.desc}>
        Saved to your account and applied across every device you use UNIS on.
        The atmosphere shifts to match.
      </Text>

      <View style={styles.grid}>
        {THEMES.map((t) => {
          const isActive = theme === t.id;
          const isCheetah = t.id === 'dianna';
          const gradientColors: [string, string, ...string[]] = isCheetah
            ? ['#C49A0A', '#7a5a06', '#1a1408'] // cheetah pattern approximation
            : [t.hex as string, darken(t.hex, 30)];

          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.swatch, isActive && styles.swatchActive]}
              onPress={() => handleSelect(t.id)}
              accessibilityLabel={`Select ${t.label} theme`}
              accessibilityState={{ selected: isActive }}
            >
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.dot}
              >
                {isActive && (
                  <View style={styles.check}>
                    <Check size={12} strokeWidth={3} color="#FFFFFF" />
                  </View>
                )}
              </LinearGradient>
              <Text style={styles.name}>{t.label}</Text>
              <Text style={styles.sub}>{isActive ? 'Active' : 'Tap to apply'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  desc: {
    color: '#888888',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  swatch: {
    width: '25%',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  swatchActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  dot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  sub: {
    color: '#777777',
    fontSize: 10,
    marginTop: 2,
  },
});

export default ThemePicker;