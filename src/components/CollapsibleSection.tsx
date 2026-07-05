// src/components/CollapsibleSection.tsx
// Ported from web `CollapsibleSection.jsx`.
//
// Wraps a profile section with a tappable header that toggles the content
// open/closed. Open state persists per section id so the user's choice
// survives app restarts (web uses localStorage; here a single SecureStore
// JSON map keyed by section id).
//
// Props:
//   - id:          string — stable, used as part of the storage key
//   - eyebrow:     ReactNode — small label above the title
//   - title:       ReactNode — the section heading
//   - defaultOpen: boolean — initial open state (default: true)
//   - children:    ReactNode — the section content

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { ChevronDown } from 'lucide-react-native';

const STORAGE_KEY = 'unis.profile.sections'; // JSON map: { [id]: 'open' | 'closed' }

interface CollapsibleSectionProps {
  id: string;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const readSectionMap = async (): Promise<Record<string, string>> => {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* storage unavailable / corrupt — fall through */ }
  return {};
};

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  id,
  eyebrow,
  title,
  defaultOpen = true,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const chevronAnim = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  // Hydrate persisted state on mount.
  useEffect(() => {
    let cancelled = false;
    readSectionMap().then((map) => {
      if (cancelled) return;
      if (map[id] === 'open') setOpen(true);
      else if (map[id] === 'closed') setOpen(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  // Persist on change + rotate chevron.
  useEffect(() => {
    Animated.timing(chevronAnim, {
      toValue: open ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();

    (async () => {
      try {
        const map = await readSectionMap();
        map[id] = open ? 'open' : 'closed';
        await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(map));
      } catch (_) { /* ignore */ }
    })();
  }, [open, id, chevronAnim]);

  const rotate = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-90deg', '0deg'],
  });

  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.head}
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.headText}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <ChevronDown size={20} color="#AAAAAA" />
        </Animated.View>
      </TouchableOpacity>

      {open && <View style={styles.panel}>{children}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  headText: {
    flex: 1,
    paddingRight: 12,
  },
  eyebrow: {
    color: '#4a9eff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  panel: {
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
});

export default CollapsibleSection;