// src/components/RankMove.tsx
// Port of web src/components/RankMove.jsx — how far an entry moved since the
// period before the one shown.
//   movement > 0  up    (green chevron + places)
//   movement < 0  down  (red chevron + places)
//   movement 0    steady
//   isNew         scored now, didn't chart last period
// Renders nothing when there is nothing to compare against.
import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const UP = '#4ade80';
const DOWN = '#f87171';

const RankMove: React.FC<{ movement?: number | null; isNew?: boolean; style?: ViewStyle }> = ({ movement, isNew, style }) => {
  if (isNew) {
    return (
      <View style={[styles.pill, styles.newPill, style]}>
        <Text style={styles.newText}>New</Text>
      </View>
    );
  }
  if (typeof movement !== 'number') return null;
  if (movement === 0) {
    return (
      <View style={[styles.pill, style]} accessibilityLabel="Same place as last period">
        <Text style={styles.steady}>–</Text>
      </View>
    );
  }
  const up = movement > 0;
  const places = Math.abs(movement);
  const color = up ? UP : DOWN;
  return (
    <View style={[styles.pill, style]} accessibilityLabel={`${up ? 'Up' : 'Down'} ${places} ${places === 1 ? 'place' : 'places'}`}>
      <Svg width={9} height={9} viewBox="0 0 10 10">
        <Path d={up ? 'M1.5 7 5 3.2 8.5 7' : 'M1.5 3 5 6.8 8.5 3'} stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <Text style={[styles.places, { color }]}>{places}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 26, justifyContent: 'center' },
  newPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(250,204,21,0.16)' },
  newText: { color: '#facc15', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  steady: { color: 'rgba(255,255,255,0.35)', fontSize: 13, fontWeight: '700' },
  places: { fontSize: 11.5, fontWeight: '800' },
});

export default RankMove;
