// src/components/messages/DmParts.tsx
// Small pieces shared by the inbox, the thread and the message sheets
// (web: the Avatar / VerifiedCheck / initials helpers repeated in
// MessagePage.jsx, MessageThread.jsx and the two sheets).
import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { buildUrl } from '../../utils/buildUrl';
import { useUnisTheme } from '../../theme/unisTheme';
import { parseServerTime } from '../../utils/dmThreads';

export function initials(name = ''): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export function relativeTime(iso: string | null | undefined, now: number): string {
  if (!iso) return '';
  const then = parseServerTime(iso);
  const diff = Math.max(0, (now - then.getTime()) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return then.toLocaleDateString([], { weekday: 'short' });
  return then.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Artist check badge (web VerifiedCheck). */
export const VerifiedCheck: React.FC<{ size?: number }> = ({ size = 16 }) => {
  const t = useUnisTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Artist">
      <Path d="M12 1.8l2.6 1.9 3.2-.2 1 3.1 2.8 1.6-.6 3.1 1.6 2.8-2.2 2.3-.1 3.2-3.1.7-1.9 2.6-3-1.1-3 1.1-1.9-2.6-3.1-.7-.1-3.2L1.3 14l1.6-2.8-.6-3.1 2.8-1.6 1-3.1 3.2.2z" fill={t.primary2} />
      <Path d="M8 12.4l2.7 2.7L16.2 9.6" fill="none" stroke="#000" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

/** Avatar with the optional supporter ring and online dot. */
export const DmAvatar: React.FC<{ name?: string | null; photoUrl?: string | null; size?: number; ring?: boolean; online?: boolean }> = ({
  name,
  photoUrl,
  size = 56,
  ring = false,
  online = false,
}) => {
  const t = useUnisTheme();
  const [failed, setFailed] = useState(false);
  const uri = photoUrl && !failed ? buildUrl(photoUrl) : null;
  const inner = ring ? size - 6 : size;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {ring && <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, borderWidth: 2, borderColor: t.primary2 }]} />}
      {uri ? (
        <Image source={{ uri }} style={{ width: inner, height: inner, borderRadius: inner / 2 }} onError={() => setFailed(true)} />
      ) : (
        <View style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: Math.round(size * 0.32) }}>{initials(name || '')}</Text>
        </View>
      )}
      {online && (
        <View
          style={{
            position: 'absolute',
            right: size * 0.02,
            bottom: size * 0.02,
            width: Math.max(10, size * 0.22),
            height: Math.max(10, size * 0.22),
            borderRadius: 99,
            backgroundColor: '#22c55e',
            borderWidth: 2,
            borderColor: '#07090f',
          }}
        />
      )}
    </View>
  );
};
