// src/components/CustomDrawer.tsx
// ─────────────────────────────────────────────────────────────
// Mobile port of web src/sidebar.jsx (Nov 2026 redesign):
//   • jurisdiction chip pinned to the top (opens your jurisdiction page)
//   • three sections — Browse · Community · Your space — with the sidebar's
//     own icon set (outline, duotone + theme glow when active)
//   • unread-messages badge (chats only — requests never add to it)
//   • account footer: avatar, @handle, lifetime earnings → Settings
// Playlists opens the playlist library (web: the playlist manager modal).
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { onAppEvent } from '../utils/appEvents';
import { useUnisTheme, mix } from '../theme/unisTheme';

type IconKey = 'home' | 'find' | 'discover' | 'vote' | 'leaderboards' | 'charts' | 'messages' | 'playlists' | 'earnings' | 'plus' | 'settings' | 'help';

/** The sidebar's icon set: `fs` shapes fill when active, `fs2` details take the accent. */
const SidebarIcon: React.FC<{ name: IconKey; active: boolean; color: string; accent: string }> = ({ name, active, color, accent }) => {
  const fs = { fill: active ? accent : 'none', stroke: active ? accent : color, fillOpacity: active ? 0.28 : 0 };
  const fs2 = { fill: active ? accent : color, stroke: 'none' as const };
  const line = { fill: 'none', stroke: active ? '#fff' : color };
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {name === 'home' && (<><Path d="M4 10.5 12 4l8 6.5V19a1.4 1.4 0 0 1-1.4 1.4H5.4A1.4 1.4 0 0 1 4 19z" {...fs} /><Path d="M9.5 20.4v-5h5v5" {...line} /></>)}
      {name === 'find' && (<><Circle cx="11" cy="11" r="6.4" {...fs} /><Path d="M16 16l4 4" {...line} /></>)}
      {name === 'discover' && (<><Circle cx="12" cy="12" r="8.4" {...fs} /><Path d="M15.4 8.6l-2.1 4.7-4.7 2.1 2.1-4.7z" {...fs2} /></>)}
      {name === 'vote' && (<><Rect x="4" y="4.5" width="16" height="15" rx="3.4" {...fs} /><Path d="M8.4 12l2.4 2.4L15.6 9.4" {...line} /></>)}
      {name === 'leaderboards' && (<><Path d="M7 4.5h10V8a5 5 0 0 1-10 0z" {...fs} /><Path d="M7 5.6H4.8A2 2 0 0 0 7 8.4M17 5.6h2.2A2 2 0 0 1 17 8.4M12 13v3.4M9 20h6M9.4 20a2.6 2.6 0 0 1 5.2 0" {...line} /></>)}
      {name === 'charts' && (<><Path d="M4.5 5h3v3h-3z" {...fs} /><Path d="M4.5 5h3v3h-3zM10.5 6.5h9M4.5 11h3M10.5 12.5h9M4.5 17h3M10.5 18.5h6" {...line} /></>)}
      {name === 'messages' && (<Path d="M5 5.6h14a1.5 1.5 0 0 1 1.5 1.5v7.8A1.5 1.5 0 0 1 19 16.4h-9l-4 3.2v-3.2H5A1.5 1.5 0 0 1 3.5 14.9V7.1A1.5 1.5 0 0 1 5 5.6z" {...fs} />)}
      {name === 'playlists' && (<><Path d="M4 7h10M4 12h7M4 17h7" {...line} /><Circle cx="17" cy="16" r="2.5" {...fs2} /><Path d="M19.5 16V8.6l-3 .9" {...line} /></>)}
      {name === 'earnings' && (<><Circle cx="12" cy="12" r="8.4" {...fs} /><Path d="M12 7v10M14.6 9.3c0-1.2-1.2-1.9-2.6-1.9s-2.6.8-2.6 2 .9 1.7 2.6 2 2.6.9 2.6 2.1-1.2 2-2.6 2-2.6-.8-2.6-2" {...line} /></>)}
      {name === 'plus' && (<Path d="M12 3.6l2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.4l-5 2.65.95-5.6L3.9 9.5l5.6-.8z" {...fs} />)}
      {name === 'settings' && (<><Path d="M12 2.9c.5 0 1 .06 1.45.18l.5 1.86c.57.22 1.1.53 1.58.92l1.86-.55c.6.58 1.1 1.28 1.5 2.04l-1.36 1.38c.1.5.16 1.03.16 1.57s-.06 1.07-.16 1.57l1.36 1.38c-.4.76-.9 1.46-1.5 2.04l-1.86-.55c-.48.39-1 .7-1.58.92l-.5 1.86c-.46.12-.95.18-1.45.18s-1-.06-1.45-.18l-.5-1.86a7.2 7.2 0 0 1-1.58-.92l-1.86.55a7.9 7.9 0 0 1-1.5-2.04l1.36-1.38A7.5 7.5 0 0 1 5.3 12c0-.54.06-1.07.16-1.57L4.1 9.05c.4-.76.9-1.46 1.5-2.04l1.86.55c.48-.39 1-.7 1.58-.92l.5-1.86C9.99 2.96 10.5 2.9 12 2.9z" {...fs} /><Circle cx="12" cy="12" r="3" {...line} /></>)}
      {name === 'help' && (<><Circle cx="12" cy="12" r="8.4" {...fs} /><Path d="M9.7 9.4a2.4 2.4 0 1 1 3.1 2.9c-.6.2-.8.7-.8 1.3v.5" {...line} /><Circle cx="12" cy="16.8" r="0.9" {...fs2} /></>)}
    </Svg>
  );
};

interface Item { key: string; label: string; icon: IconKey; route: string; params?: any; badge?: number; activeOn: string[] }

const formatMoney = (amount: any) => {
  const n = typeof amount === 'number' ? amount : parseFloat(amount);
  if (!Number.isFinite(n)) return '$0';
  if (n >= 1000) return `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  return `$${n.toFixed(2)}`;
};

const CustomDrawer: React.FC<DrawerContentComponentProps> = (props) => {
  const { navigation, state } = props;
  const insets = useSafeAreaInsets();
  const t = useUnisTheme();
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [lifetime, setLifetime] = useState<number | null>(null);

  // Unread chats badge.
  useEffect(() => {
    if (!user) { setUnread(0); return; }
    let alive = true;
    const load = async () => {
      try {
        const res = await axiosInstance.get('/v1/conversations/summary');
        if (alive) setUnread(Number(res.data?.unread) || 0);
      } catch (err: any) {
        console.error('[Drawer] message count failed (badge hidden):', err?.message || err);
      }
    };
    load();
    const off = onAppEvent('messages-updated', load);
    return () => { alive = false; off(); };
  }, [user]);

  // Lifetime earnings for the account footer.
  useEffect(() => {
    if (!user) { setLifetime(null); return; }
    let alive = true;
    (async () => {
      try {
        const res = await axiosInstance.get('/v1/earnings/my-summary');
        if (!alive) return;
        const s = res?.data || {};
        const ref = Number(s?.referralEarnings?.lifetime) || 0;
        const sup = Number(s?.supporterEarnings?.lifetime) || 0;
        const explicit = Number(s?.totalEarnings?.lifetime);
        setLifetime(Number.isFinite(explicit) && explicit > 0 ? explicit : ref + sup);
      } catch { /* hide the figure */ }
    })();
    return () => { alive = false; };
  }, [user]);

  const activeRoute = state.routes[state.index]?.name;

  const sections: { label: string; items: Item[] }[] = [
    {
      label: 'Browse',
      items: [
        { key: 'home', label: 'Home', icon: 'home', route: 'Home', activeOn: ['Home'] },
        { key: 'find', label: 'Find', icon: 'find', route: 'Find', activeOn: ['Find'] },
        { key: 'discover', label: 'Discover', icon: 'discover', route: 'Discover', activeOn: ['Discover'] },
      ],
    },
    {
      label: 'Community',
      items: [
        { key: 'vote', label: 'Vote', icon: 'vote', route: 'Vote', activeOn: ['Vote'] },
        { key: 'leaderboards', label: 'Leaderboards', icon: 'leaderboards', route: 'Leaderboards', activeOn: ['Leaderboards'] },
        { key: 'charts', label: 'Charts', icon: 'charts', route: 'Charts', activeOn: ['Charts'] },
        { key: 'messages', label: 'Messages', icon: 'messages', route: 'Messages', badge: unread, activeOn: ['Messages'] },
      ],
    },
    {
      label: 'Your space',
      items: [
        { key: 'playlists', label: 'Playlists', icon: 'playlists', route: 'Playlists', activeOn: ['Playlists'] },
        { key: 'earnings', label: 'Earnings', icon: 'earnings', route: 'Earnings', activeOn: ['Earnings'] },
        { key: 'plus', label: 'Unis Plus', icon: 'plus', route: 'Plus', activeOn: ['Plus'] },
        { key: 'settings', label: 'Settings', icon: 'settings', route: 'Settings', activeOn: ['Settings'] },
        { key: 'help', label: 'Help', icon: 'help', route: 'Help', activeOn: ['Help'] },
      ],
    },
  ];

  const go = (route: string, params?: any) => {
    (navigation as any).navigate(route, params);
    navigation.closeDrawer();
  };

  const jName = user?.jurisdiction?.name || null;
  const avatarUrl = buildUrl(user?.photoUrl);
  const initial = (user?.username || 'U').charAt(0).toUpperCase();
  const panel = mix(t.primary, '#07090f', 0.93);

  return (
    <View style={[styles.container, { backgroundColor: panel, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 8 }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        {jName && (
          <Pressable
            style={[styles.juris, { borderColor: t.border, backgroundColor: t.subtle }]}
            onPress={() => go('Home', { screen: 'Jurisdiction', params: { jurisdictionName: jName } })}
            accessibilityRole="button"
          >
            <View style={[styles.jurisDot, { backgroundColor: t.primary2, shadowColor: t.primary2 }]} />
            <Text style={styles.jurisName} numberOfLines={1}>{jName}</Text>
          </Pressable>
        )}

        {sections.map((sec) => (
          <View key={sec.label}>
            <Text style={styles.section}>{sec.label}</Text>
            {sec.items.map((it) => {
              const active = it.activeOn.includes(activeRoute);
              return (
                <Pressable
                  key={it.key}
                  onPress={() => go(it.route, it.params)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.link,
                    active && { backgroundColor: t.soft },
                    pressed && { backgroundColor: 'rgba(255,255,255,0.06)' },
                  ]}
                >
                  <View style={styles.icon}>
                    <SidebarIcon name={it.icon} active={active} color="rgba(255,255,255,0.62)" accent={t.primary2} />
                    {!!it.badge && it.badge > 0 && (
                      <View style={[styles.badge, { backgroundColor: t.primary }]}>
                        <Text style={styles.badgeText}>{it.badge > 9 ? '9+' : it.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.linkText, active && styles.linkTextActive]}>{it.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {user && (
        <Pressable style={styles.account} onPress={() => go('Settings')} accessibilityRole="button">
          <View style={[styles.av, { backgroundColor: t.soft }]}>
            {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avImg} /> : <Text style={styles.avText}>{initial}</Text>}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.accName} numberOfLines={1}>{user?.username || 'You'}</Text>
            <Text style={styles.accHandle} numberOfLines={1}>@{user?.username || 'you'}</Text>
          </View>
          {lifetime != null && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.e1}>Lifetime</Text>
              <Text style={[styles.e2, { color: t.textAccent }]}>{formatMoney(lifetime)}</Text>
            </View>
          )}
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  juris: { flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  jurisDot: { width: 8, height: 8, borderRadius: 4, shadowOpacity: 0.9, shadowRadius: 6 },
  jurisName: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
  section: { color: 'rgba(255,255,255,0.38)', fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', paddingHorizontal: 22, marginTop: 14, marginBottom: 4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  icon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -5, right: -8, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  linkText: { color: 'rgba(255,255,255,0.72)', fontSize: 14.5, fontWeight: '500' },
  linkTextActive: { color: '#fff', fontWeight: '700' },
  account: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, padding: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  av: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avImg: { width: 36, height: 36 },
  avText: { color: '#fff', fontWeight: '700' },
  accName: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  accHandle: { color: 'rgba(255,255,255,0.45)', fontSize: 11.5 },
  e1: { color: 'rgba(255,255,255,0.45)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  e2: { fontSize: 13.5, fontWeight: '800' },
});

export default CustomDrawer;
