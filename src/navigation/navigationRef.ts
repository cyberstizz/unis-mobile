// src/navigation/navigationRef.ts
// One navigation ref for the whole app, so surfaces that live OUTSIDE the
// navigator (the Player, the queue panel, notifications, the reward/feedback
// layers) can still open screens — web's useNavigate() from anywhere.
//
//   import { openScreen } from '../navigation/navigationRef';
//   openScreen('Song', { songId });
//
// Stack screens live inside the drawer's "Home" entry, so they're reached as
// navigate('Home', { screen, params }). Drawer-level screens (Vote, Find…)
// are navigated to directly.
import { createNavigationContainerRef, DrawerActions } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

const DRAWER_SCREENS = new Set([
  'Home', 'Vote', 'Find', 'Discover', 'Leaderboards', 'Settings', 'Earnings', 'Playlists', 'Milestones', 'Charts', 'Messages', 'Help', 'Plus',
]);

export function openScreen(name: string, params?: Record<string, any>) {
  if (!navigationRef.isReady()) return;
  const nav = navigationRef as any;
  if (DRAWER_SCREENS.has(name)) nav.navigate(name, params);
  else nav.navigate('Home', { screen: name, params });
}

export function openDrawer() {
  if (navigationRef.isReady()) navigationRef.dispatch(DrawerActions.openDrawer());
}
