// src/components/ArtistCollapsibleSection.tsx
// Ported from the inline ArtistCollapsibleSection in web `artistDashboard.jsx`.
//
// Dashboard-specific collapsible: ambient blurred image backdrop, quick-nav
// registration (sections register an opener + their scroll position so the
// "Jump to" bar can open a section and scroll to it).
//
// Props (web parity):
//   - id, eyebrow, title, children, defaultOpen
//   - onRegister(id, opener)        — registers a function that opens the section
//   - ambientImage                  — blurred artist-image backdrop URL
// Mobile addition:
//   - onLayoutY(id, y)              — reports the section's y offset inside the
//                                     parent ScrollView (replaces scrollIntoView)

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  LayoutChangeEvent,
} from 'react-native';
import { ChevronDown } from 'lucide-react-native';

interface ArtistCollapsibleSectionProps {
  id?: string;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  onRegister?: (id: string, opener: () => void) => void;
  ambientImage?: string | null;
  onLayoutY?: (id: string, y: number) => void;
}

const ArtistCollapsibleSection: React.FC<ArtistCollapsibleSectionProps> = ({
  id,
  eyebrow,
  title,
  children,
  defaultOpen = true,
  onRegister,
  ambientImage,
  onLayoutY,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (id && onRegister) onRegister(id, () => setOpen(true));
  }, [id, onRegister]);

  const handleLayout = (e: LayoutChangeEvent) => {
    if (id && onLayoutY) onLayoutY(id, e.nativeEvent.layout.y);
  };

  const body = (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen((prev) => !prev)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.triggerText}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={[styles.chevron, open && styles.chevronOpen]}>
          <ChevronDown size={20} color="#AAAAAA" />
        </View>
      </TouchableOpacity>

      {open && <View style={styles.body}>{children}</View>}
    </>
  );

  // ★ ambient: blurred artist image behind the whole section (web parity)
  if (ambientImage) {
    return (
      <View style={styles.section} onLayout={handleLayout}>
        <ImageBackground
          source={{ uri: ambientImage }}
          style={styles.ambientFill}
          imageStyle={styles.ambientImage}
          blurRadius={30}
        >
          <View style={styles.ambientScrim}>{body}</View>
        </ImageBackground>
      </View>
    );
  }

  return (
    <View style={[styles.section, styles.sectionPlain]} onLayout={handleLayout}>
      {body}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    borderRadius: 18,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionPlain: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  ambientFill: {
    width: '100%',
  },
  ambientImage: {
    opacity: 0.35,
  },
  ambientScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  triggerText: {
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
  chevron: {
    transform: [{ rotate: '-90deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '0deg' }],
  },
  body: {
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
});

export default ArtistCollapsibleSection;