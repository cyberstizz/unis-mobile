# Unis Mobile — Architecture Documentation
> React Native / Expo mobile port of the Unis web platform.
> Last updated: 2025. Generated from full source analysis.

---

## Table of Contents

1. [Tech Stack & Environment](#1-tech-stack--environment)
2. [Project Structure](#2-project-structure)
3. [Navigation Architecture](#3-navigation-architecture)
4. [Contexts & State Management](#4-contexts--state-management)
5. [API Layer](#5-api-layer)
6. [Screens](#6-screens)
7. [Wizards & Modals](#7-wizards--modals)
8. [Components](#8-components)
9. [Utilities & Types](#9-utilities--types)
10. [Platform-Specific Notes](#10-platform-specific-notes)
11. [Known Issues & Action Items](#11-known-issues--action-items)

---

## 1. Tech Stack & Environment

### Runtime

| Item | Value |
|---|---|
| Expo SDK | `~54.0.32` |
| React Native | `0.81.5` |
| React | `19.1.0` |
| TypeScript | `~5.9.2` |
| Entry point | `index.ts` → `App.tsx` |
| Workflow | Expo Managed (EAS Build for device builds) |
| Target platforms | iOS + Android |

### Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@react-navigation/native` | `^7.1.28` | Navigation container |
| `@react-navigation/drawer` | `^7.7.13` | Drawer navigator |
| `@react-navigation/native-stack` | `^7.11.0` | Stack navigator |
| `@maplibre/maplibre-react-native` | `^10.4.2` | Map rendering on FindScreen |
| `expo-av` | `~16.0.8` | Audio playback (PlayerContext) |
| `expo-secure-store` | `~15.0.8` | JWT token persistence (replaces localStorage) |
| `expo-image-picker` | `~17.0.10` | Photo + artwork selection |
| `expo-document-picker` | `~14.0.8` | Audio/video file selection |
| `expo-print` | `~15.0.8` | On-device PDF generation (contract) |
| `expo-sharing` | `~14.0.8` | Native share sheet |
| `expo-linear-gradient` | `~15.0.8` | Gradient overlays throughout UI |
| `expo-blur` | `~15.0.8` | Blurred artwork backgrounds |
| `expo-clipboard` | `~8.0.8` | Copy-to-clipboard (share links) |
| `expo-navigation-bar` | `~5.0.10` | Android nav bar color control |
| `axios` | `^1.13.4` | HTTP client for all non-multipart calls |
| `nativewind` | `^4.2.1` | Tailwind-style utility classes |
| `react-native-reanimated` | `~4.1.1` | Animation (gesture-based) |
| `react-native-gesture-handler` | `~2.28.0` | Gesture recognition |
| `react-native-svg` | `15.12.1` | SVG rendering (icons, logos, ambient glow) |
| `lucide-react-native` | `^0.563.0` | Icon library |
| `react-native-safe-area-context` | `~5.6.0` | Safe area insets |

### Build Configuration

| Item | Detail |
|---|---|
| iOS builds | EAS Build (no local Xcode — developer uses 2015 MacBook Pro) |
| Android builds | EAS Build or `expo run:android` |
| Testing | Physical devices via EAS builds |
| Dev server | `expo start` / `expo start --web` |
| Custom font | `BitcountGridDouble` loaded via `expo-font` in `App.tsx` |
| Styling | NativeWind (`tailwind.config.js`) + `StyleSheet.create` |

---

## 2. Project Structure
```
unis-mobile/
├── App.tsx                          # Root component — providers, font loading, nav
├── index.ts                         # Expo entry point
├── babel.config.js
├── metro.config.js                  # SVG transformer config
├── tailwind.config.js
├── declarations.d.ts                # Module declarations (SVG imports etc.)
├── nativewind-env.d.ts
├── assets/
│   └── fonts/
│       └── BitcountGridDouble-*.ttf
└── src/
    ├── components/                  # 26 reusable components
    ├── context/
    │   ├── AuthContext.tsx          # Auth state + JWT management
    │   └── PlayerContext.tsx        # Audio playback + playlist management
    ├── navigation/
    │   └── AppNavigator.tsx         # Root navigator (auth gate + drawer + stack)
    ├── screens/                     # 13 screens
    ├── services/
    │   ├── axiosInstance.ts         # Configured Axios + token interceptors
    │   └── playlistService.ts       # Playlist CRUD API calls
    ├── types/
    │   └── voting.ts                # Voting flow type contracts
    └── utils/
        └── IdMappings.ts            # Slug → UUID maps for genres, jurisdictions, intervals
```

---

## 3. Navigation Architecture

### Overview

The app uses a two-layer navigation structure: a **Drawer navigator** at the top level (8 routes) wrapping a **Stack navigator** for the main content flow (8 routes). Authentication is gated at the root — unauthenticated users see only `LoginScreen`; authenticated users enter the full app.

### Navigator Tree
```
AppNavigator (root)
│
├── [unauthenticated] NavigationContainer → LoginScreen
│
└── [authenticated] MainAppNavigator
    └── NavigationContainer (with ref for DrawerActions dispatch)
        └── Drawer.Navigator (CustomDrawer, drawerType: 'front', width: 250)
            ├── Home        → MainStackWithHeader
            │   └── LayoutWrapper (Header + content + MiniPlayer padding)
            │       └── Stack.Navigator
            │           ├── Feed        → FeedScreen         [default]
            │           ├── Song        → SongScreen          [params: songId, type?]
            │           ├── Artist      → ArtistScreen        [params: artistId]
            │           ├── Leaderboards→ LeaderboardsScreen
            │           ├── Milestones  → MilestonesScreen
            │           ├── Jurisdiction→ JurisdictionScreen  [params: jurisdictionName]
            │           ├── ArtistDashboard → ArtistDashboardScreen
            │           └── Profile     → ProfileScreen
            ├── Vote        → VoteAwardsWithHeader
            ├── Find        → FindScreenWithHeader
            ├── Leaderboards→ LeaderboardsWithHeader
            ├── Settings    → ArtistDashboardWithHeader (if user.isArtist)
            │             OR ProfileScreenWithHeader    (if listener)
            ├── Earnings    → EarningsScreenWithHeader
            ├── Playlists   → PlaceholderWithHeader (HomeScreen stub)
            └── Milestones  → MilestonesWithHeader
```

### Key Navigation Behaviours

| Behaviour | Implementation |
|---|---|
| Auth gate | `AppNavigator` reads `useAuth().user` — null → LoginScreen, non-null → MainAppNavigator |
| Loading state | `useAuth().loading` renders a centered `ActivityIndicator` before auth resolves |
| Drawer trigger | `DrawerTrigger` component (left-edge arrow tab) dispatches `DrawerActions.openDrawer()` via `navigationRef` |
| Drawer open detection | `findDrawerOpen()` recursively walks nav state tree to find `history.type === 'drawer'`; hides `DrawerTrigger` while open |
| Header integration | All drawer screens are wrapped in `LayoutWrapper` which renders `Header` above the content |
| Player padding | `LayoutWrapper` adds `paddingBottom: 90` when `PlayerContext.currentMedia` is non-null |
| Settings screen | Conditionally assigned — `user.isArtist` (presence of `genre` field) determines which screen renders |
| Duplicate screen names | `Artist` exists in both Drawer params and Stack params — navigating `Artist` from FindScreen/JurisdictionScreen requires `navigate('Home', { screen: 'Artist', params: {...} })` pattern |
| Stack animation | `slide_from_right` on all Stack screens |
| Swipe to open drawer | `swipeEnabled: true`, `swipeEdgeWidth: 50` |

### Route Type Definitions
```typescript
// Stack routes (deep navigation)
type RootStackParamList = {
  Feed: undefined;
  Song: { songId: string; type?: string };
  Artist: { artistId: string };
  VoteAwards: undefined;
  Find: undefined;
  Leaderboards: undefined;
  Earnings: undefined;
  Milestones: undefined;
  Profile: undefined;
  ArtistDashboard: undefined;
  Settings: undefined;
  Jurisdiction: undefined;
};

// Drawer routes (top-level nav)
type DrawerParamList = {
  Home: undefined;
  Vote: undefined;
  Find: undefined;
  Leaderboards: undefined;
  Settings: undefined;
  Earnings: undefined;
  Playlists: undefined;
  Milestones: undefined;
};
```

---

## 4. Contexts & State Management

### `AuthContext`

**File:** `src/context/AuthContext.tsx`
**Provider location:** `App.tsx` (wraps everything)

| Value | Type | Description |
|---|---|---|
| `user` | `User \| null` | Authenticated user object; null = logged out |
| `loading` | `boolean` | True during initial token + profile fetch on mount |
| `login(credentials)` | `Promise<{success, error?}>` | POSTs to `/auth/login`, stores token in SecureStore, fetches profile |
| `logout()` | `Promise<void>` | POSTs to `/auth/logout`, deletes token, sets user to null |
| `refreshUser()` | `Promise<void>` | Re-fetches profile from token — called after profile edits |

**`User` interface:**
```typescript
interface User {
  userId: string;
  username?: string;
  email?: string;
  jurisdiction?: { jurisdictionId: string; name?: string };
  supportedArtistId?: string | null;
  isArtist?: boolean;   // derived: !!profile.genre
}
```

**Init flow:** On mount, reads token from `SecureStore` → decodes JWT (custom base64 decoder, no `atob` in RN) → fetches `/v1/users/profile/:userId` → sets user. On 401/404, deletes token.

**`isArtist` derivation:** `!!profile.genre` — presence of a `genre` field on the profile response signals the account is an artist. This drives the Settings screen selection in the navigator.

**Token storage:** `expo-secure-store` (encrypted, device-local). Key: `'token'`. JWT expiry: 24h.

---

### `PlayerContext`

**File:** `src/context/PlayerContext.tsx`
**Provider location:** `App.tsx` (wraps `AppContent`, inside `AuthProvider`)

| Value | Type | Description |
|---|---|---|
| `currentMedia` | `NormalizedTrack \| null` | Currently loaded track |
| `isPlaying` | `boolean` | Playback active |
| `isBuffering` | `boolean` | Audio buffering |
| `isExpanded` | `boolean` | Player UI expanded (full-screen mode) |
| `position` | `number` | Playback position (ms) |
| `duration` | `number` | Track duration (ms) |
| `playlist` | `NormalizedTrack[]` | Current queue |
| `currentIndex` | `number` | Index into playlist |
| `playlists` | `TransformedPlaylist[]` | User's saved playlists |
| `loading` | `boolean` | Playlist fetch in progress |
| `showPlaylistManager` | `boolean` | Playlist manager UI visible |
| `playMedia(media, playlist?)` | `Promise<void>` | Load and play a track, optionally setting a new queue |
| `togglePlayPause()` | `Promise<void>` | Play/pause toggle |
| `next() / prev()` | `Promise<void>` | Queue navigation |
| `seekTo(ms)` | `Promise<void>` | Seek to position |
| `toggleExpand()` | `void` | Toggle player expanded state |
| `clearPlayer()` | `Promise<void>` | Full reset — called on logout |
| Playlist CRUD | various | `createPlaylist`, `addToPlaylist`, `removeFromPlaylist`, `reorderPlaylist`, `deletePlaylist`, `updatePlaylistName`, `loadPlaylist`, `refreshPlaylists` |

**Audio engine:** `expo-av` `Audio.Sound`. Single `soundRef` (useRef) — unloaded and replaced on each track change. Audio mode set on mount: `playsInSilentModeIOS: true`, `staysActiveInBackground: true`, `shouldDuckAndroid: true`.

**`NormalizedTrack` shape:**
```typescript
interface NormalizedTrack {
  id: string;
  songId: string;
  playlistItemId?: string;
  title: string;
  artist: string;
  artwork: string;    // resolved via getMediaUrl()
  url: string;        // resolved via getMediaUrl()
  duration?: number;
  jurisdiction?: string;
  genre?: string;
}
```

**Playlist load guard:** Playlists are only loaded if a token exists in SecureStore — prevents unauthenticated fetch on mount.

**Logout integration:** `App.tsx` calls `clearPlayer()` via a `useEffect` on `user === null`.

---

## 5. API Layer

### `axiosInstance` (`src/services/axiosInstance.ts`)

| Setting | Value |
|---|---|
| Base URL | `http://192.168.1.154:8080/api` (hardcoded — see ⚠️) |
| Timeout | 15,000ms |
| Auth | Bearer token injected in request interceptor via `SecureStore.getItemAsync('token')` |
| 401 handling | Response interceptor deletes token from SecureStore; navigation to login handled by navigator |

**FormData detection:** The request interceptor includes a multi-signal `isFormData()` helper — checks `instanceof FormData`, presence of `._parts` array (RN polyfill), and constructor name. When FormData is detected, `Content-Type` is deleted from headers so the runtime auto-sets `multipart/form-data; boundary=...`. Manually setting Content-Type for multipart in axios omits the boundary string and corrupts the request.

**`getMediaUrl(path)`:** Resolves relative backend paths to absolute URLs. If `path` starts with `http`, returns as-is. Otherwise prepends `http://192.168.1.154:8080`. ⚠️ Hardcoded IP — must be env-configured before production.

### Raw `fetch` Pattern

Several components bypass `axiosInstance` entirely and use native `fetch` for multipart file uploads:

| Component | Endpoint | Reason |
|---|---|---|
| `CreateAccountWizard` | `/v1/users/profile/photo`, `/v1/media/song` | axios FormData `instanceof` check fails in RN |
| `UploadWizard` | `/v1/media/:mediaType` | Same |
| `LyricsWizard` | `/v1/media/song/:id` | Same |
| `ChangeDefaultSongWizard` | `/v1/users/default-song` | Same |
| `DeleteAccountWizard` | `/v1/users/me` | Uses raw fetch + manual token attach |

All raw `fetch` calls manually retrieve the token from `SecureStore` and set `Authorization: Bearer <token>`. All use hardcoded IP `http://192.168.1.154:8080/api`. ⚠️

### `playlistService` (`src/services/playlistService.ts`)

Thin wrapper over `axiosInstance` for playlist CRUD. Note: playlist endpoints use `/playlists` (no `/v1/` prefix) — a known backend inconsistency.

| Method | Endpoint | Description |
|---|---|---|
| `getUserPlaylists()` | `GET /playlists` | All playlists for current user |
| `getPlaylistById(id)` | `GET /playlists/:id` | Single playlist with tracks |
| `createPlaylist(name)` | `POST /playlists` | Create new playlist |
| `updatePlaylist(id, name)` | `PUT /playlists/:id` | Rename playlist |
| `deletePlaylist(id)` | `DELETE /playlists/:id` | Delete playlist |
| `addTrackToPlaylist(plId, songId)` | `POST /playlists/:id/tracks` | Add track |
| `removeTrackFromPlaylist(plId, itemId)` | `DELETE /playlists/:id/tracks/:itemId` | Remove track |
| `reorderPlaylist(plId, orderedItemIds)` | `PUT /playlists/:id/reorder` | Reorder tracks |

### ID Mapping Utility (`src/utils/IdMappings.ts`)

Translates human-readable filter slugs to backend UUIDs. Used in VoteAwardsScreen, LeaderboardsScreen, MilestonesScreen, FindScreen, WinnersNotification.

| Map | Keys | UUID prefix |
|---|---|---|
| `GENRE_IDS` | `rap`, `rap-hiphop`, `hip-hop`, `Hip-Hip`, `rock`, `pop` | `...000001xx` |
| `JURISDICTION_IDS` | `uptown-harlem`, `downtown-harlem`, `harlem` | real UUIDs |
| `INTERVAL_IDS` | `daily`, `weekly`, `monthly`, `quarterly`, `annual`, `midterm` | `...000002xx` |

Reverse maps (`GENRE_NAMES`, `JURISDICTION_NAMES`, `INTERVAL_NAMES`) are auto-generated via `Object.fromEntries`. Helper functions (`getGenreId`, `getJurisdictionId`, `getIntervalId`) `console.warn` on unknown keys and return `undefined`.

⚠️ `GENRE_IDS` has a typo key `'Hip-Hip'` (should be `'Hip-Hop'`). ⚠️ Only 3 jurisdictions are mapped — expansion to other markets requires additions here.

---

## 6. Screens

### `FeedScreen.tsx`

**Purpose:** Primary content landing screen. Displays trending songs, new releases, and popular artists for the user's jurisdiction in horizontally scrollable animated carousels.

| State | Type | Purpose |
|---|---|---|
| `loading` / `refreshing` | `boolean` | Full-screen load + pull-to-refresh |
| `error` | `string` | Orange warning banner on API failure |
| `userId` / `jurisdictionId` | `string \| null` | Decoded from JWT; gates data fetch |
| `trendingToday` | `MediaItem[]` | Trending songs in jurisdiction |
| `newMedia` | `MediaItem[]` | Recent uploads |
| `popularArtists` | `ArtistItem[]` | Derived from trending + new (top 5 by score) |

| Method | Endpoint | Trigger |
|---|---|---|
| GET | `/v1/users/profile/:userId` | Mount |
| GET | `/v1/media/trending/today?jurisdictionId=&limit=10` | After profile loads |
| GET | `/v1/media/new?jurisdictionId=&limit=5` | Same, parallel |
| POST | `/v1/media/song/:id/play?userId=` | Play tap |
| POST | `/v1/media/video/:id/play?userId=` | Play tap (video) |

**Key logic:** Two-phase init (profile → media). `popularArtists` is derived, not fetched. `AnimatedSection` replays entrance animation on `useFocusEffect`. Dummy data renders as fallback for empty API responses — no empty-state UI.

**Navigation:** `Song` (songId, type), `Artist` (artistId)

⚠️ Dummy data fallback masks empty jurisdictions. Footer routes (`about`, `terms`, `privacy`, `support`) silently fail. `userId` sent as query param on play tracking. Custom `atob` duplicated at module level.

---

### `VoteAwardsScreen.tsx`

**Purpose:** Browse and vote for nominees filtered by genre, type, interval, and jurisdiction. Inline playback of nominees.

| Method | Endpoint | Trigger |
|---|---|---|
| GET | `/v1/vote/nominees?targetType=&genreId=&jurisdictionId=&intervalId=&limit=20` | Mount + filter change |
| GET | `/v1/users/:id/default-song` | Play tapped on artist nominee |
| POST | `/v1/media/song/:id/play?userId=` | Playback |

**Key logic:** Filter slugs → UUIDs via `IdMappings`. Client-side search on `nominees` (no debounce). VotingWizard opened on vote tap. Artist nominees fetch default song before playback.

⚠️ Jurisdiction options hardcoded to 3 Harlem entries. No search debounce. `atob` duplicated.

---

### `FindScreen.tsx`

**Purpose:** Map-based jurisdiction discovery ("The Hook Point"). Drill from US state → neighborhood to find top artists/songs. MapLibre GL with programmatic camera control.

| Method | Endpoint | Trigger |
|---|---|---|
| GET | `/v1/jurisdictions/byName/:name` | State press or back nav |
| GET | `/v1/jurisdictions/:id/children/detailed` | Jurisdiction selected |
| GET | `/v1/jurisdictions/:id/tops` | Jurisdiction selected |
| GET | `/v1/users/:id/default-song` | Play on artist result |
| POST | `/v1/media/song/:id/play?userId=` | Playback |

**Key logic:** US GeoJSON from external CDN (PublicaMundi GitHub). Camera fully programmatic — all gestures disabled. `jurisdictionsToGeoJSON` uses `1/0` for booleans (MapLibre expression compatibility). Only New York is interactive — all other states show "Coming Soon". Random button cycles through 10 states at 500ms intervals.

⚠️ `genre` filter UI-only — never passed to API. External GeoJSON CDN dependency. Navigation uses nested `Home` screen pattern (fragile to navigator restructuring).

---

### `SongScreen.tsx`

**Purpose:** Full song detail — artwork, ambient blur, play/like/vote/follow/share, lyrics, credits, `CommentSection`.

**Receives:** `{ songId: string }`

| Method | Endpoint | Trigger |
|---|---|---|
| GET | `/v1/media/song/:songId` | Mount |
| GET | `/v1/media/song/:id/is-liked?userId=` + `/likes/count` | After song + userId load |
| POST | `/v1/media/song/:id/play?userId=` | Play tap |
| POST or DELETE | `/v1/media/song/:id/like?userId=` | Like toggle |
| POST / DELETE | `/v1/users/:artistId/follow` | Follow toggle |

**Key logic:** Optimistic play count increment. `isOwner` = `userId === song.artistId`. `dominantColor` is declared but never dynamically extracted — always renders default Unis blue. Credits hardcoded to `N/A`.

⚠️ `dominantColor` not implemented. Credits not fetched. Copy link uses hardcoded `https://unis.app` domain. "Don't Play", "Report", "Add/Edit Lyrics" all show "Coming Soon".

---

### `ArtistScreen.tsx`

**Purpose:** Public artist profile — photo, stats, bio, song list, social links, Follow/Vote/Play actions. Doubles as own-profile view when `isOwnProfile={true}`.

**Receives:** `{ artistId: string }` | Props: `{ isOwnProfile?: boolean }`

| Method | Endpoint | Trigger |
|---|---|---|
| GET | `/v1/users/profile/:artistId` | Mount |
| GET | `/v1/users/:artistId/followers/count` | Mount (sequential) |
| GET | `/v1/media/songs/artist/:artistId` | Mount (sequential) |
| GET | `/v1/users/:artistId/default-song` | Mount (sequential) |
| GET | `/v1/users/:artistId/is-following` | After userId + artistId resolve |
| POST / DELETE | `/v1/users/:artistId/follow` | Follow toggle |
| PUT | `/v1/users/profile/:artistId/bio` | Save bio (own profile) |
| POST | `/v1/media/song/:id/play?userId=` | Play tap |

**Key logic:** `isCurrentUser = userId === artistId` hides action buttons. `topSong` derived by highest score in songs array. Social links via `Linking.openURL`.

⚠️ `isEditingBio` state is dead code — bio input always rendered in own-profile mode. Songs capped at 5 with no "Show More". No `useFocusEffect` — stale state on return.

---

### `ArtistDashboardScreen.tsx`

**Purpose:** Artist management hub — profile, stats, songs, social links, supported artist, vote history, awards, danger zone. Hosts 7 wizard/modal components.

| Method | Endpoint | Trigger |
|---|---|---|
| GET | `/v1/users/profile/:userId` | Mount (`Promise.allSettled`) |
| GET | `/v1/media/songs/artist/:userId` | Mount |
| GET | `/v1/users/:userId/supporters/count` | Mount |
| GET | `/v1/users/:userId/followers/count` | Mount |
| GET | `/v1/vote/history?limit=50` | Mount |
| GET | `/v1/users/:userId/default-song` | Mount |
| GET | `/v1/awards/artist/:userId?limit=10&offset=N` | Mount + "Load More" |
| GET | `/v1/users/profile/:supportedArtistId` | After profile resolves |
| PUT | `/v1/users/profile/:userId` | Social media input blur |
| DELETE | `/v1/media/song/:songId` | After DeleteSongModal confirm |

**Key logic:** `Promise.allSettled` — all 7 initial calls run in parallel; partial failures don't block UI. Awards pagination inferred by `response.length === 10`. Delete blocked if only song or if it's the featured song. Social media auto-saves on blur. Welcome popup shows on every mount (no persistence).

⚠️ Welcome popup always shows. Awards pagination heuristic fragile. `hasMoreAwards` breaks if API returns exactly 10 on last page. No `useFocusEffect`.

---

### `ProfileScreen.tsx`

**Purpose:** Fan/listener profile — bio, supported artist widget, stats, vote history, social links, account deletion.

| Method | Endpoint | Trigger |
|---|---|---|
| GET | `/v1/users/profile/:userId` | Mount (`Promise.all`) |
| GET | `/v1/vote/history?limit=50` | Mount |
| GET | `/v1/users/profile/:supportedArtistId` | After profile resolves |
| PUT | `/v1/users/profile/:userId` | Social media input blur |
| POST | `/v1/media/song/:id/play?userId=` | Supported artist play |

**Key logic:** `Total Votes` stat = `voteHistory.length` (capped at 50). `level` defaults to `'Silver'` if not returned by API.

⚠️ Vote count capped at 50. `level` default masks missing data. `voteDate` rendered as raw ISO string. Social auto-save on blur.

---

### `EarningsScreen.tsx`

**Purpose:** Static placeholder. "Coming Soon" screen for future earnings/revenue sharing feature. No state, no API calls.

⚠️ Entire screen is a placeholder — full implementation pending post-launch.

---

### `HomeScreen.tsx`

**Purpose:** Dev/debug scaffold. Shows auth + player status, hardcoded test tracks. Not a production screen.

⚠️ Must not be reachable in production. Currently routed as the `PlaceholderScreen` for the `Playlists` drawer route.

---

### `LoginScreen.tsx`

**Purpose:** Auth entry point. Email/password login form + `CreateAccountWizard` launch.

| Method | Endpoint | Trigger |
|---|---|---|
| Via `AuthContext.login()` | `POST /auth/login` (abstracted) | Login button tap |

**Key logic:** Delegates entirely to `AuthContext.login()`. Navigation on success handled by navigator responding to `user` state change. Background video (`space-bg.mp4`) is implemented but commented out.

⚠️ `onSuccess` callback for `CreateAccountWizard` is a TODO. No "Forgot Password". No email format validation.

---

### `LeaderboardsScreen.tsx`

**Purpose:** Leaderboards filtered by location/genre/category/interval. Results manually triggered — not auto-loaded.

| Method | Endpoint | Trigger |
|---|---|---|
| GET | `/v1/vote/leaderboards?jurisdictionId=&genreId=&targetType=&intervalId=&limit=50` | "View Current" tap |
| GET | `/v1/users/:id/default-song` | Play on artist result |
| POST | `/v1/media/song/:id/play?userId=` | Playback |

⚠️ `CustomDropdown` defined inside component body (recreated on every render). `midterm` interval option present but may not be in `INTERVAL_IDS`. Location options hardcoded.

---

### `MilestonesScreen.tsx`

**Purpose:** Historical awards browser — select filters + date to view past winners for any completed period.

| Method | Endpoint | Trigger |
|---|---|---|
| GET | `/v1/awards/past?type=&startDate=&endDate=&jurisdictionId=&genreId=&intervalId=` | "View" button tap |

**Key logic:** `getDateRangeForInterval` converts selected date to full interval `startDate`/`endDate`. `displayedContext` freezes filter values at fetch time. `getDeterminationBadge` renders LinearGradient badge per determination method. `minDate` hardcoded to `'2025-10-26'` (platform launch date).

⚠️ No play buttons. No navigation to artist/song detail. `CustomDropdown` inside component body.

---

### `JurisdictionScreen.tsx`

**Purpose:** Jurisdiction landing — hero, top artist + song highlights, ranked lists. Entry from FindScreen, SongScreen, ArtistScreen.

**Receives:** `{ jurisdictionName: string }` (also accepts `{ jurisdiction: string }`)

| Method | Endpoint | Trigger |
|---|---|---|
| GET | `/v1/jurisdictions/byName/:name` | Mount |
| GET | `/v1/jurisdictions/:id/tops` | After jurisdiction ID resolves |
| GET | `/v1/users/:artistId/default-song` | Play on artist |
| POST | `/v1/media/song/:id/play?userId=` | Playback |

⚠️ `symbolImage` fetched but not rendered — hero always shows `UnisLogo` SVG. `artistOfMonth`/`songOfWeek` labels are cosmetic — not interval-filtered. Content lists have `maxHeight` but no scroll wrapper — overflow clipped. Navigation uses nested `Home` pattern.

---

## 7. Wizards & Modals

### `CreateAccountWizard.tsx`

**Purpose:** 8–10 step registration wizard. Steps differ by role (artist vs listener).

**Artist path:** welcome → basicInfo → location → role → artistProfile → songUpload → supportArtist → review

**Listener path:** welcome → basicInfo → location → role → listenerProfile → listenerBio → supportArtist → review

| Method | Endpoint | Trigger |
|---|---|---|
| GET | `/v1/users/artists/active` | Entering supportArtist step |
| PATCH | `/v1/users/profile/photo` (raw fetch) | Submit — photo upload |
| POST | `/v1/users/register` | Submit — registration |
| POST | `/v1/media/song` (raw fetch) | Submit — artist song upload |
| GET | Nominatim OSM geocoding | `detectLocation()` |

**Key logic:** Referral validation mocked (only `UNIS-LAUNCH-2024` works). Username/email checks mocked. Location detection geocodes via Nominatim, checks against Harlem bounding box. Artist preview audio via `expo-av`. 3-stage submit: photo → register → song.

⚠️ Hardcoded IP in photo + song upload. Mocked referral + validation. Photo upload unauthenticated. `DUMMY_ARTISTS` dead code.

---

### `VotingWizard.tsx`

**Purpose:** 3-step vote submission wizard with animated result screen (success/duplicate/ineligible/error).

**Steps:** (1) confirm genre/type, select interval + jurisdiction → (2) summary confirmation → (3) name verification (forward + backward)

| Method | Endpoint | Trigger |
|---|---|---|
| GET | `/v1/users/:id` or `/v1/media/song/:id` | On open, resolve nominee jurisdiction |
| GET | `/v1/jurisdictions/:id/breadcrumb` | After jurisdiction resolved |
| POST | `/v1/vote/submit` | Step 3 confirm |

**Key logic — critical:** Split `useEffect` pattern prevents wizard reset during Player's ~250ms re-renders. Effect 1 resets on `visible → true`. Effect 2 updates filters on `nominee.id` change (not full object). `voteNominee` memoized via `useMemo` to stabilize reference. Name verification requires forward + backward typing of nominee name. Confetti on success via `ConfettiCannon`.

⚠️ `console.log('=== VOTE DATA BEING SENT ===')` left in production path. Genre/type selectors locked — cannot be changed by user.

---

### `EditProfileWizard.tsx`

**Purpose:** Photo + bio edit modal (two tabs). Photo from library or camera.

| Method | Endpoint | Trigger |
|---|---|---|
| PATCH | `/v1/users/profile` (multipart, axiosInstance) | Save photo |
| PUT | `/v1/users/profile/:userId/bio` | Save bio |

⚠️ Uses `axiosInstance` for photo upload (not raw `fetch`) — may fail on Android due to FormData/Content-Type issue that `UploadWizard` fixed by switching to raw `fetch`.

---

### `UploadWizard.tsx`

**Purpose:** 4-step song/video upload wizard — type selection, metadata + file, artwork, review + confirm.

| Method | Endpoint | Trigger |
|---|---|---|
| POST | `/v1/media/:mediaType` (raw fetch, FormData) | Step 4 confirm |

⚠️ Hardcoded IP. `defaultJurisdictionId` hardcoded UUID. `GENRES` array inline (should reference `GENRE_IDS`).

---

### `EditSongWizard.tsx`

**Purpose:** Single-screen modal to edit song artwork and/or description.

| Method | Endpoint | Trigger |
|---|---|---|
| PATCH | `/v1/media/song/:songId` (multipart, axiosInstance) | Submit |

⚠️ Uses `axiosInstance.patch` with explicit `Content-Type: multipart/form-data` — same problematic pattern. May fail on Android.

---

### `DeleteAccountWizard.tsx`

**Purpose:** 2-step account deletion — consequences list → username forward + backward verification + checkbox.

| Method | Endpoint | Trigger |
|---|---|---|
| DELETE | `/v1/users/me` (raw fetch) | `handleDelete()` |

On success: calls `AuthContext.logout()`. Navigator responds to `user → null`.

⚠️ Hardcoded IP.

---

### `LyricsWizard.tsx`

**Purpose:** Full-screen lyrics text editor (monospace). Add or edit song lyrics.

| Method | Endpoint | Trigger |
|---|---|---|
| PATCH | `/v1/media/song/:songId` (raw fetch, FormData) | Save |

⚠️ Hardcoded IP. `Song` interface accepts both `songId` and `id` — inconsistent.

---

### `ChangeDefaultSongWizard.tsx`

**Purpose:** Song picker to set artist's featured/default track.

| Method | Endpoint | Trigger |
|---|---|---|
| PATCH | `/v1/users/default-song` (raw fetch, JSON) | Save |

⚠️ Hardcoded IP. `userId` prop accepted but not sent in request body. No audio preview.

---

## 8. Components

### Player Cluster

#### `Player.tsx`

Persistent full-screen/mini player anchored at the bottom. Two modes: collapsed bar + full expanded view. Handles seekbar (PanResponder), like toggling, vote initiation, playlist management stubs.

**Critical:** `voteNominee` memoized to prevent VotingWizard reset from Player's ~250ms position-update re-renders. `durationRef` synced to `duration` to avoid stale closure in PanResponder.

⚠️ `handleAddToPlaylist` and `handleDownload` are stubs ("Coming Soon"). Artwork falls back to `picsum.photos`.

---

#### `MiniPlayer.tsx`

Simplified secondary player bar. Likely legacy — `Player.tsx` is the active player. Uses emoji controls and purple accent — inconsistent with design system. Does not use `getMediaUrl()` for artwork.

⚠️ Confirm whether this is mounted anywhere before removing.

---

#### `UnisPlayButton.tsx` / `UnisPauseButton.tsx`

SVG icon components (react-native-svg). Circle + triangle (play) or two rectangles (pause). Both `#163387` (Unis Blue). Accept `size` prop (default 40).

---

### Navigation Components

#### `Header.tsx`

App-wide top bar — Unis logo, search input, username (desktop), logout, quick-nav buttons (Vote, Awards, Find, Earnings). `LinearGradient` background. `useSafeAreaInsets` for status bar offset.

⚠️ Search `TextInput` is purely decorative — no handler. Navigation type safety bypassed with `as never` casts.

---

#### `Footer.tsx`

Legal footer — Privacy Policy, Terms, Cookie Policy, Report Infringement links. Dynamic copyright year. Rendered at bottom of scrollable content screens.

⚠️ `Inter` font not loaded — silent fallback. Route targets must exist in navigator.

---

#### `DrawerTrigger.tsx`

Left-edge arrow tab that opens the drawer. Conditionally rendered (hidden when drawer is open). Position computed once at module load — not responsive to orientation change.

---

#### `CustomDrawer.tsx`

Custom drawer content — static nav item list with Lucide icons, `BitcountGridDouble` font. `user` from `useAuth` is available but not rendered (no user info section implemented). `scrollEnabled={false}` — items beyond viewport will be clipped. No active route highlighting.

---

### Wizards (see Section 7 for full detail)

`CreateAccountWizard`, `VotingWizard`, `EditProfileWizard`, `UploadWizard`, `EditSongWizard`, `DeleteAccountWizard`, `LyricsWizard`, `ChangeDefaultSongWizard`

---

### Cards & UI

#### `ArtistCard.tsx`

Premium artist card — full-bleed photo, gradient overlays, ambient SVG radial glow, pulsing glow border (left edge), staggered slide-in entrance, score badge, VIEW button. `index` prop staggers entrance by `index * 150ms`.

⚠️ Glow animation loop never cleaned up on unmount — could accumulate in FlatLists. `e.stopPropagation()` on VIEW button is unreliable on native. Photo fallback uses `picsum.photos`.

---

#### `MediaCard.tsx`

Compact square media card — artwork, duration badge, explicit badge, play button, title, artist, relative time. Adapts to song/video/artist response shape variations.

⚠️ `console.log('[MediaCard] artworkUrl:')` left in render path. Play button uses Unicode `▶` instead of `UnisPlayButton`. Card dimensions not responsive to orientation.

---

#### `SongNotification.tsx`

Left-sliding toast when a new track starts. Auto-dismisses after 3s. Pulsing blue border glow. `pointerEvents="none"`. Detects track changes via `prevMediaId` ref.

⚠️ `borderColor` animation requires `as any` cast. `currentMedia.imageUrl` accessed via `as any` — type mismatch. Users cannot dismiss early.

---

#### `WinnersNotification.tsx`

Once-per-day login notification showing current leaderboard highlights (3 randomized types: leader/trending/community). Persists shown date to `SecureStore`. Slides in from right, auto-dismisses after 5s.

⚠️ Jurisdiction/genre fall back to hardcoded UUIDs. `intervalId` hardcoded. `show` and `notification` set in separate state calls — potential race condition.

---

#### `ConfettiCannon.tsx`

60-particle confetti effect using `Animated` (no native modules). Used in `VotingWizard` on success. `useNativeDriver: true` throughout. Particles generated once via `useMemo`.

⚠️ No cleanup on unmount — animations not stopped. No completion callback. Intensity/duration not configurable via props.

---

#### `CommentSection.tsx`

Full comment + reply system for `SongScreen`. Fetch, post, delete top-level comments and threaded replies (one level deep). Optimistic UI — no refetch on mutation. Ambient `dominantColor` theming.

⚠️ No pagination — all comments fetched at once. `replyContent` not reset when switching reply targets. `commentCount` can drift from server on partial mutation failure.

---

#### `PremiumPicker.tsx`

Custom bottom-sheet dropdown replacing native `Picker`. Animated open/close (spring + backdrop fade). Used in `VotingWizard` for interval + jurisdiction selection.

⚠️ Sheet title hardcoded as "Select Option" — not customisable via prop. No swipe-to-dismiss. Android may flash before JS animation fires.

---

#### `IntervalDatePicker.tsx`

Adaptive date picker modal for 6 interval types (daily/weekly/monthly/quarterly/midterm/annual). Period-end convention — always stores last day of selected period. Monday-start calendar grid.

⚠️ `selectedYear`/`selectedMonth` initialised to today, not derived from `value` prop — calendar opens on wrong period if `value` is in a different month/year. Daily picker lacks a cancel/close button.

---

#### `DownloadContractButton.tsx`

Generates artist contract PDF on-device via `expo-print` HTML rendering, then opens native share sheet via `expo-sharing`. Contract content is entirely hardcoded in the component.

⚠️ Hardcoded legal text — updates require a release. Temp PDF not cleaned up after sharing. Governing law hardcoded to New York. No signature capture.

---

#### `DeleteSongModal.tsx`

Minimal confirmation modal for song deletion. Fully controlled by props — no internal API calls. Parent handles deletion and passes `isDeleting` loading state.

⚠️ `songTitle` renders as literal `"undefined"` if prop is not passed. `Platform` imported but unused.

---

## 9. Utilities & Types

### `src/types/voting.ts`

Type contracts for the voting flow:

| Type | Purpose |
|---|---|
| `Jurisdiction` | `{ jurisdictionId, name, votingEnabled? }` |
| `Nominee` | `{ id, name, type, genreKey?, jurisdiction?, imageUrl? }` — `jurisdiction` is `Jurisdiction \| string` (backend inconsistency) |
| `VoteFilters` | `{ selectedGenre, selectedType, selectedInterval, selectedJurisdiction }` |
| `VoteResult` | `{ status: 'idle' \| 'success' \| 'duplicate' \| 'ineligible' \| 'network' \| 'error', message, details? }` |
| `VoteData` | Full payload sent to `/v1/vote/submit` |
| `VotingWizardProps` | Props interface for `VotingWizard` component |

### `src/utils/IdMappings.ts`

See Section 5 — API Layer. Maps filter slugs to backend UUIDs. Exposes forward + reverse maps and typed helper functions.

---

## 10. Platform-Specific Notes

### iOS vs Android

| Topic | iOS | Android |
|---|---|---|
| Dev server URL | `localhost:8080` | `10.0.2.2:8080` (emulator) |
| Navigation bar | Default | Set to `#000000` with light buttons via `expo-navigation-bar` in `App.tsx` |
| Multipart file URI | Strip `file://` prefix in FormData | Keep `file://` prefix |
| Audio silent mode | `playsInSilentModeIOS: true` | N/A |
| Audio background | `staysActiveInBackground: true` | `shouldDuckAndroid: true` |
| Monospace font | `Courier New` | `monospace` |
| `atob()` | Not available (custom decoder used everywhere) | Not available |
| Builds | EAS Build (no local Xcode) | EAS Build or local |
| Testing | Physical device via EAS | Physical device via EAS |

### Mobile vs Web

| Feature | Web | Mobile |
|---|---|---|
| Token storage | `localStorage` | `expo-secure-store` |
| File uploads | `axios` + FormData | Raw `fetch` (axios FormData `instanceof` issue) |
| Audio | HTML5 `<audio>` | `expo-av` `Audio.Sound` |
| Maps | Web map library | `@maplibre/maplibre-react-native` |
| Navigation | React Router | React Navigation (Drawer + Stack) |
| Deep links | URLs | Navigator params |
| `window` / `document` | Available | Not available |
| Base64 decode | `atob()` | Custom implementation |

---

## 11. Known Issues & Action Items

### 🔴 Critical (Pre-Launch Blockers)

| # | Issue | Location |
|---|---|---|
| 1 | **Hardcoded IP `192.168.1.154`** in all raw `fetch` calls and `axiosInstance` / `getMediaUrl` — will not work on any other device or in production | `axiosInstance.ts`, `CreateAccountWizard`, `UploadWizard`, `LyricsWizard`, `ChangeDefaultSongWizard`, `DeleteAccountWizard` |
| 2 | **Referral code validation fully mocked** — only `UNIS-LAUNCH-2024` accepted, real API not connected | `CreateAccountWizard` |
| 3 | **Username + email availability checks mocked** — always return valid after simulated delay | `CreateAccountWizard` |
| 4 | **Photo upload in `CreateAccountWizard` is unauthenticated** — no Bearer token on the `PATCH /v1/users/profile/photo` raw fetch | `CreateAccountWizard` |
| 5 | **`EditProfileWizard` uses `axiosInstance` for photo upload** — same FormData/Content-Type bug that `UploadWizard` fixed by switching to raw `fetch`; likely fails on Android | `EditProfileWizard` |
| 6 | **`EditSongWizard` explicitly sets `Content-Type: multipart/form-data`** — omits boundary string, corrupts request on Android | `EditSongWizard` |

### 🟠 High (Should Fix Before or Shortly After Launch)

| # | Issue | Location |
|---|---|---|
| 7 | **`userId` sent as query param on all play tracking calls** — should be derived server-side from JWT, not trusted from client | All screens + Player |
| 8 | **Custom `atob()` duplicated across 8+ files** — extract to `src/utils/decodeToken.ts` | FeedScreen, VoteAwardsScreen, FindScreen, SongScreen, ArtistScreen, LeaderboardsScreen, JurisdictionScreen, Player |
| 9 | **Jurisdiction options hardcoded** to 3 Harlem entries in VoteAwards, Leaderboards, WinnersNotification — must be API-driven for expansion | Multiple screens |
| 10 | **`genre` filter on FindScreen is UI-only** — stored in state but never passed to any API call | `FindScreen` |
| 11 | **`ArtistCard` glow animation never stopped on unmount** — could leak in FlatLists | `ArtistCard` |
| 12 | **`console.log('[MediaCard] artworkUrl:')` in render path** — fires on every render | `MediaCard` |
| 13 | **`console.log('=== VOTE DATA BEING SENT ===')` in vote submission** | `VotingWizard` |
| 14 | **`WinnersNotification` hardcoded fallback UUIDs** for jurisdiction + genre; hardcoded `intervalId` | `WinnersNotification` |
| 15 | **`GENRE_IDS` typo key `'Hip-Hip'`** (should be `'Hip-Hop'`) | `IdMappings.ts` |
| 16 | **`IntervalDatePicker` initialises to today**, not to `value` prop — calendar opens on wrong month if value is historical | `IntervalDatePicker` |

### 🟡 Medium (Post-Launch Refactors)

| # | Issue | Location |
|---|---|---|
| 17 | **`dominantColor` never dynamically extracted** from artwork — always renders default Unis blue | `SongScreen` |
| 18 | **Song credits hardcoded to `N/A`** — no credits endpoint called | `SongScreen` |
| 19 | **Welcome popup in ArtistDashboard shows on every mount** — no `AsyncStorage`/`SecureStore` persistence | `ArtistDashboardScreen` |
| 20 | **`hasMoreAwards` pagination heuristic** inferred from `response.length === 10` — breaks if API returns exactly 10 on last page | `ArtistDashboardScreen` |
| 21 | **`CustomDropdown` defined inside component body** in Leaderboards + Milestones — recreated on every render | `LeaderboardsScreen`, `MilestonesScreen` |
| 22 | **`HomeScreen` (dev scaffold) is routed as the Playlists placeholder** — must not be user-accessible in production | `AppNavigator` |
| 23 | **`MiniPlayer.tsx` likely unused** — confirm and remove or integrate | `MiniPlayer` |
| 24 | **No `useFocusEffect` on ArtistScreen, ProfileScreen, ArtistDashboardScreen** — stale data after navigation | Multiple screens |
| 25 | **`songTitle` renders as `"undefined"`** in `DeleteSongModal` if prop omitted | `DeleteSongModal` |
| 26 | **`DownloadContractButton` hardcoded legal text** — legal updates require a code release; temp PDF not cleaned up | `DownloadContractButton` |
| 27 | **Comment section no pagination** — all comments fetched at once; will degrade on popular songs | `CommentSection` |
| 28 | **`DrawerTrigger` position not responsive** — computed once at module load, not updated on rotation | `DrawerTrigger` |
| 29 | **`isEditingBio` state dead code** in `ArtistScreen` | `ArtistScreen` |
| 30 | **`symbolImage` fetched but not rendered** in `JurisdictionScreen` | `JurisdictionScreen` |
| 31 | **`artistOfMonth`/`songOfWeek` labels misleading** — not interval-filtered, just top-ranked | `JurisdictionScreen` |
| 32 | **Content lists in `JurisdictionScreen` have `maxHeight` with no scroll wrapper** — items clipped | `JurisdictionScreen` |
| 33 | **`PremiumPicker` sheet title hardcoded** as "Select Option" | `PremiumPicker` |
| 34 | **`ChangeDefaultSongWizard` `userId` prop unused** in API call | `ChangeDefaultSongWizard` |
| 35 | **Artwork fallbacks use `picsum.photos`** external CDN — should use local placeholder assets | `Player`, `ArtistCard` |