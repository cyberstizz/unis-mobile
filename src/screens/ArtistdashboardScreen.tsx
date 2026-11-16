// src/screens/ArtistdashboardScreen.tsx
// ─────────────────────────────────────────────────────────────
// Mobile port of web src/artistDashboard.jsx — Oct 2026 redesign: one long
// scroll of sections → six tabs plus Settings.
//
//   Home      setup progress · this week · where you stand · featured song ·
//             share balance · supporters                (ArtistHomeTab.tsx)
//   Music     songs (stats, sales, edit, lyrics, delete) · videos
//   Fans      fan funnel · supporters · demographics
//   Races     score / votes / wins / level · territory rank · trophy case
//   Earnings  phone check · revenue · refer & earn
//   Profile   your page · links (one Save) · photos · agreement
//   Settings  (gear) color theme · who you support · vote history · account
//
// Open a tab directly: navigate('ArtistDashboard', { tab: 'earnings' }).
// Same fixes web shipped: no every-visit "Thank You" pop-up, "Verify" opens
// phone verification, followers shown, links save once with a toast.
// Plays go through requestPlay → PlayChoiceModal; the Player counts them.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import {
  BarChart3, Clock, DollarSign, Edit3, ExternalLink, FileText, Heart, Music, Play, ShieldCheck,
  SlidersHorizontal, Trash2, Trophy, Upload, Video, Vote,
} from 'lucide-react-native';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import buildSetupSteps from '../utils/artistSetupSteps';
import { useUnisTheme, mix } from '../theme/unisTheme';

import EditProfileWizard from '../components/Editprofilewizard';
import UploadWizard from '../components/Uploadwizard';
import ChangeDefaultSongWizard from '../components/Changedefaultsongwizard';
import EditSongWizard from '../components/Editsongwizard';
import LyricsWizard from '../components/LyricsWizard';
import DeleteAccountWizard from '../components/DeleteAccountWizard';
import DeleteSongModal from '../components/Deletesongmodal';
import ChangePasswordWizard from '../components/Changepasswordwizard';
import DownloadContractButton from '../components/Downloadcontractbutton';
import ReferralCodeCard from '../components/ReferralCodeCard';
import ThemePicker from '../components/ThemePicker';
import VoteHistorySection from '../components/VoteHistorySection';
import SupportedArtistPicker from '../components/SupportedArtistPicker';
import VerificationGate from '../components/VerificationGate';
import FanbaseFunnel from '../components/FanbaseFunnel';
import SupporterSection from '../components/SupporterSection';
import DemographicsSection from '../components/DemographicsSection';
import TerritoryRankSection from '../components/TerritoryRankSection';
import ArtistPhotosManager from '../components/ArtistPhotosManager';
import SongStatsModal from '../components/SongStatsModal';
import SongSalesModal from '../components/SongSalesModal';
import RevenueSection from '../components/RevenueSection';
import PhoneVerificationModal from '../components/PhoneVerificationModal';
import ArtistHomeTab from '../components/ArtistHomeTab';

const backimage = require('../../assets/randomrapper.jpeg');

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'music', label: 'Music' },
  { id: 'fans', label: 'Fans' },
  { id: 'races', label: 'Races' },
  { id: 'earnings', label: 'Earnings' },
  { id: 'profile', label: 'Profile' },
] as const;
type TabId = (typeof TABS)[number]['id'] | 'settings';
const PANEL_IDS = [...TABS.map((x) => x.id), 'settings'];

const LINK_FIELDS = [
  { key: 'instagramUrl', label: 'Instagram', placeholder: 'https://instagram.com/yourname', type: 'url' },
  { key: 'tiktokUrl', label: 'TikTok', placeholder: 'https://tiktok.com/@yourname', type: 'url' },
  { key: 'twitterUrl', label: 'X (Twitter)', placeholder: 'https://x.com/yourname', type: 'url' },
  { key: 'youtubeUrl', label: 'YouTube', placeholder: 'https://youtube.com/@yourchannel', type: 'url' },
  { key: 'contactEmail', label: 'Contact email', placeholder: 'you@example.com', type: 'email' },
];

const fmt = (n: any) => Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const SectionLoader: React.FC<{ label?: string }> = ({ label = 'Loading...' }) => (
  <View style={styles.state}>
    <ActivityIndicator color="#fff" />
    <Text style={styles.stateText}>{label}</Text>
  </View>
);

const SectionError: React.FC<{ message?: string; onRetry?: () => void }> = ({ message = 'Failed to load.', onRetry }) => (
  <View style={styles.state}>
    <Text style={styles.errorText}>{message}</Text>
    {onRetry && (
      <Pressable style={styles.ghostSm} onPress={onRetry}><Text style={styles.ghostText}>Retry</Text></Pressable>
    )}
  </View>
);

const Panel: React.FC<{ title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; style?: any }> = ({ title, right, children, style }) => (
  <View style={[styles.panel, style]}>
    {(title || right) && (
      <View style={styles.panelHead}>
        {typeof title === 'string' ? <Text style={styles.panelTitle}>{title}</Text> : title}
        {right}
      </View>
    )}
    {children}
  </View>
);

const Em: React.FC<{ children: React.ReactNode }> = ({ children }) => <Text style={styles.em}>{children}</Text>;

// ── Videos on the Music tab ──
const ArtistVideos: React.FC<{ artistId: string; onUpload: () => void; refreshKey: number; onOpen: (id: string) => void }> = ({ artistId, onUpload, refreshKey, onOpen }) => {
  const t = useUnisTheme();
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    axiosInstance
      .get(`/v1/media/videos/artist/${artistId}`)
      .then((res) => { if (!cancelled) setVideos(Array.isArray(res.data) ? res.data : []); })
      .catch((err) => {
        console.error('Artist videos fetch failed:', err);
        if (!cancelled) setError('Could not load your videos.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [artistId]);

  useEffect(() => load(), [load, refreshKey]);

  return (
    <Panel title={<Text style={styles.panelTitle}>Videos {!loading && !error && <Text style={styles.count}>{videos.length}</Text>}</Text>}>
      {loading ? (
        <SectionLoader label="Loading your videos..." />
      ) : error ? (
        <SectionError message={error} onRetry={load} />
      ) : videos.length === 0 ? (
        <View style={styles.empty}>
          <Video size={34} color="rgba(255,255,255,0.4)" />
          <Text style={styles.emptyTitle}>No videos yet</Text>
          <Text style={styles.emptyText}>Upload a performance, a cover or a music video. Fans can watch and comment on it from your page.</Text>
          <Pressable style={[styles.primary, { backgroundColor: t.primary }]} onPress={onUpload}>
            <Upload size={14} color="#fff" />
            <Text style={styles.primaryText}>Upload a video</Text>
          </Pressable>
        </View>
      ) : (
        videos.map((v) => {
          const id = v.videoId || v.id;
          const art = buildUrl(v.artworkUrl);
          return (
            <Pressable key={id} style={styles.videoRow} onPress={() => onOpen(id)} accessibilityLabel={`Watch ${v.title}`}>
              <View style={styles.videoThumb}>
                {art ? <Image source={{ uri: art }} style={StyleSheet.absoluteFill} /> : null}
                <View style={styles.videoPlay}><Play size={14} color="#fff" fill="#fff" /></View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{v.title}</Text>
                <Text style={styles.rowSub}>{fmt(v.playCount)} plays · {fmt(v.likes)} likes</Text>
              </View>
            </Pressable>
          );
        })
      )}
    </Panel>
  );
};

const ArtistDashboardScreen: React.FC = () => {
  const { user, loading: authLoading, refreshUser } = useAuth();
  const { requestPlay } = usePlayer();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const feedback = useFeedback();
  const t = useUnisTheme();
  const scrollRef = useRef<ScrollView>(null);

  const [activeTab, setActiveTab] = useState<TabId>('home');
  useEffect(() => {
    const wanted = route.params?.tab;
    if (wanted && PANEL_IDS.includes(wanted)) setActiveTab(wanted);
  }, [route.params?.tab]);

  const goToTab = useCallback((id: string) => {
    setActiveTab((PANEL_IDS.includes(id) ? id : 'home') as TabId);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const showToast = useCallback((message: string, tone: 'info' | 'error' | 'success' = 'info') => {
    if (tone === 'error') feedback.error(message);
    else if (tone === 'success') feedback.success(message);
    else feedback.info(message);
  }, [feedback]);

  // ── Data ──
  const [userProfile, setUserProfile] = useState<any>(null);
  const [songs, setSongs] = useState<any[]>([]);
  const [defaultSong, setDefaultSong] = useState<any>(null);
  const [coreLoading, setCoreLoading] = useState(true);
  const [coreError, setCoreError] = useState<string | null>(null);

  const [supporters, setSupporters] = useState(0);
  const [followers, setFollowers] = useState(0);
  const [totalPlays, setTotalPlays] = useState(0);
  const [totalVotes, setTotalVotes] = useState(0);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [supportedArtist, setSupportedArtist] = useState<any>(null);
  const [pendingSupportedArtist, setPendingSupportedArtist] = useState<any>(null);
  const [earningsSummary, setEarningsSummary] = useState<any>(null);
  const [stripeStatus, setStripeStatus] = useState<any>(null);
  const [payoutHistory, setPayoutHistory] = useState<any[]>([]);
  const [statsSong, setStatsSong] = useState<any>(null);
  const [salesSong, setSalesSong] = useState<any>(null);

  const [awards, setAwards] = useState<any[]>([]);
  const [awardsPage, setAwardsPage] = useState(0);
  const [hasMoreAwards, setHasMoreAwards] = useState(true);
  const [awardsLoading, setAwardsLoading] = useState(true);
  const [awardsError, setAwardsError] = useState<string | null>(null);
  const [loadingMoreAwards, setLoadingMoreAwards] = useState(false);
  const [awardTab, setAwardTab] = useState<'artist' | 'song'>('artist');
  const [songAwards, setSongAwards] = useState<any[]>([]);
  const [songAwardsPage, setSongAwardsPage] = useState(0);
  const [hasMoreSongAwards, setHasMoreSongAwards] = useState(true);
  const [songAwardsLoading, setSongAwardsLoading] = useState(true);
  const [songAwardsError, setSongAwardsError] = useState<string | null>(null);
  const [loadingMoreSongAwards, setLoadingMoreSongAwards] = useState(false);

  const [showUploadWizard, setShowUploadWizard] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showDefaultSongWizard, setShowDefaultSongWizard] = useState(false);
  const [showDeleteWizard, setShowDeleteWizard] = useState(false);
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
  const [editingSong, setEditingSong] = useState<any>(null);
  const [songToDelete, setSongToDelete] = useState<any>(null);
  const [lyricsSong, setLyricsSong] = useState<any>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showArtistPicker, setShowArtistPicker] = useState(false);
  const [cancellingPending, setCancellingPending] = useState(false);
  const [showPhoneVerify, setShowPhoneVerify] = useState(false);
  const [videosRefreshKey, setVideosRefreshKey] = useState(0);
  const [links, setLinks] = useState<Record<string, string>>(() => Object.fromEntries(LINK_FIELDS.map((f) => [f.key, ''])));
  const [savingLinks, setSavingLinks] = useState(false);

  const fetchCore = useCallback(async (userId: string) => {
    setCoreLoading(true);
    setCoreError(null);
    try {
      const [summaryRes, songsRes, defaultSongRes] = await Promise.all([
        axiosInstance.get(`/v1/users/profile-summary/${userId}`),
        axiosInstance.get(`/v1/media/songs/artist/${userId}`),
        axiosInstance.get(`/v1/users/${userId}/default-song`).catch(() => ({ data: null })),
      ]);
      const summary = summaryRes.data;
      const profile = summary?.profile;
      if (!profile) throw new Error('Profile summary did not include a profile payload.');
      setUserProfile(profile);
      setReferralCode(summary?.referralCode || null);
      setSupportedArtist(summary?.supportedArtist || null);
      setPendingSupportedArtist(summary?.pendingSupportedArtist || null);
      setSongs(songsRes.data || []);
      setDefaultSong(defaultSongRes.data);
      setTotalPlays(profile.totalPlays || 0);
      setTotalVotes(profile.totalVotes || summary?.voteHistory?.totalCount || 0);
    } catch (err) {
      console.error('Core data fetch failed:', err);
      setCoreError('Failed to load your dashboard. Please try again.');
    } finally {
      setCoreLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async (userId: string) => {
    try {
      const [supportersRes, followersRes, totalPlaysRes, totalVotesRes, earningsRes, stripeRes, payoutsRes] = await Promise.all([
        axiosInstance.get(`/v1/users/${userId}/supporters/count`).catch(() => ({ data: { count: 0 } })),
        axiosInstance.get(`/v1/users/${userId}/followers/count`).catch(() => ({ data: { count: 0 } })),
        axiosInstance.get(`/v1/users/${userId}/total-plays`).catch(() => ({ data: { totalPlays: 0 } })),
        axiosInstance.get(`/v1/users/${userId}/total-votes`).catch(() => ({ data: { totalVotes: 0 } })),
        axiosInstance.get('/v1/earnings/my-summary').catch(() => ({ data: null })),
        axiosInstance.get('/v1/stripe/status').catch(() => ({ data: null })),
        axiosInstance.get('/v1/stripe/payouts').catch(() => ({ data: [] })),
      ]);
      setSupporters(supportersRes.data?.count || 0);
      setFollowers(followersRes.data?.count || 0);
      setTotalPlays(totalPlaysRes.data?.totalPlays || 0);
      setTotalVotes(totalVotesRes.data?.totalVotes || 0);
      if (earningsRes.data) setEarningsSummary(earningsRes.data);
      if (stripeRes.data) setStripeStatus(stripeRes.data);
      if (payoutsRes.data) setPayoutHistory(payoutsRes.data);
    } catch (err) {
      console.error('Stats fetch failed:', err);
    }
  }, []);

  const fetchAwards = useCallback(async (userId: string) => {
    setAwardsLoading(true);
    setAwardsError(null);
    try {
      const res = await axiosInstance.get(`/v1/awards/artist/${userId}?limit=10&offset=0`);
      const data = res.data || [];
      setAwards(data);
      setAwardsPage(0);
      setHasMoreAwards(data.length === 10);
    } catch (err) {
      console.error('Awards fetch failed:', err);
      setAwardsError('Could not load awards.');
      setAwards([]);
    } finally {
      setAwardsLoading(false);
    }
  }, []);

  const fetchSongAwards = useCallback(async (userId: string) => {
    setSongAwardsLoading(true);
    setSongAwardsError(null);
    try {
      const res = await axiosInstance.get(`/v1/awards/artist/${userId}/songs?limit=10&offset=0`);
      const data = res.data || [];
      setSongAwards(data);
      setSongAwardsPage(0);
      setHasMoreSongAwards(data.length === 10);
    } catch (err) {
      console.error('Song awards fetch failed:', err);
      setSongAwardsError('Could not load song awards.');
      setSongAwards([]);
    } finally {
      setSongAwardsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user?.userId) return;
    fetchCore(user.userId);
    fetchStats(user.userId);
    fetchAwards(user.userId);
    fetchSongAwards(user.userId);
  }, [user?.userId, authLoading, fetchCore, fetchStats, fetchAwards, fetchSongAwards]);

  useEffect(() => {
    if (!userProfile) return;
    setLinks(Object.fromEntries(LINK_FIELDS.map((f) => [f.key, userProfile[f.key] || ''])));
  }, [userProfile]);

  if (authLoading || !user) return <SectionLoader label="Loading..." />;
  if (coreLoading) return <View style={styles.center}><SectionLoader label="Loading your dashboard..." /></View>;
  if (coreError || !userProfile) return <View style={styles.center}><SectionError message={coreError || 'No data.'} onRetry={() => fetchCore(user.userId)} /></View>;

  // ── Derived ──
  const displayName = userProfile.username || 'Artist';
  const photoUrl = buildUrl(userProfile.photoUrl);
  const displayPhoto = photoUrl ? { uri: photoUrl } : backimage;
  const hasOwnPhoto = Boolean(userProfile.photoUrl);
  const displayBio = userProfile.bio || 'No bio yet. Add one from Edit profile.';
  const artistInitial = displayName.charAt(0).toUpperCase();
  const levelLabel = userProfile.level || 'Silver';
  const isArtistRole = userProfile?.role === 'artist';
  const placeLine = [userProfile.jurisdiction?.name || userProfile.jurisdictionName, userProfile.genre?.name || userProfile.genreName].filter(Boolean).join(' · ');
  const featuredArtUrl = buildUrl(defaultSong?.artworkUrl) || photoUrl;
  const featuredArtwork = featuredArtUrl ? { uri: featuredArtUrl } : backimage;
  const recentAward = awards?.[0] || null;
  const recentSongAward = songAwards?.[0] || null;
  const isStripeReady = Boolean(stripeStatus?.onboardingComplete && stripeStatus?.payoutsEnabled);
  const referralCount = Number(earningsSummary?.referralCount || 0);
  const pendingEffective = pendingSupportedArtist?.effectiveDate
    ? new Date(pendingSupportedArtist.effectiveDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
    : null;

  const formatAwardDate = (dateString?: string) => {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const getAwardTitle = (interval: any, type = 'artist') => {
    const name = (interval?.name || '').toLowerCase();
    const subject = type === 'song' ? 'Song' : 'Artist';
    if (name === 'daily' || name.includes('day')) return `${subject} of the Day`;
    if (name === 'weekly' || name.includes('week')) return `${subject} of the Week`;
    if (name === 'monthly' || name.includes('month')) return `${subject} of the Month`;
    if (name.includes('quarter')) return `${subject} of the Quarter`;
    if (name.includes('midterm') || name.includes('semi')) return `${subject} of the Midterm`;
    if (name.includes('year') || name.includes('annual')) return `${subject} of the Year`;
    return interval?.name ? `${interval.name} ${subject} Award` : `${subject} Award`;
  };
  const intervalBadge = (interval: any) => {
    const name = (interval?.name || '').toLowerCase();
    if (name.includes('day')) return 'Day';
    if (name.includes('week')) return 'Week';
    if (name.includes('month')) return 'Month';
    if (name.includes('quarter')) return 'Quarter';
    if (name.includes('midterm') || name.includes('semi')) return 'Midterm';
    if (name.includes('year') || name.includes('annual')) return 'Year';
    return interval?.name || 'Award';
  };
  const formatIsrc = (isrc?: string) => {
    if (!isrc || isrc.length !== 12) return isrc || '';
    return `${isrc.slice(0, 2)}-${isrc.slice(2, 5)}-${isrc.slice(5, 7)}-${isrc.slice(7)}`;
  };
  const latestWin = recentAward
    ? [getAwardTitle(recentAward.interval, 'artist'), recentAward.jurisdiction?.name].filter(Boolean).join(', ') +
      (recentAward.awardDate ? ` · ${formatAwardDate(recentAward.awardDate)}` : '')
    : null;
  const setupSteps = buildSetupSteps({ userProfile, user, songs, defaultSong, isStripeReady, referralCount, isArtistRole });
  const winsCount = awards.length + songAwards.length;
  const winsMore = hasMoreAwards || hasMoreSongAwards;

  // ── Handlers ──
  const refetchDefaultSong = () =>
    axiosInstance.get(`/v1/users/${user.userId}/default-song`).then((res) => setDefaultSong(res.data)).catch(() => setDefaultSong(null));
  const refetchSongs = () => axiosInstance.get(`/v1/media/songs/artist/${user.userId}`).then((res) => setSongs(res.data || []));

  const playSupportedArtistSong = () => {
    if (!supportedArtist?.defaultSong) {
      showToast('This artist has not set a featured song yet.');
      return;
    }
    const song = supportedArtist.defaultSong;
    const songId = song.songId || song.id;
    const songUrl = buildUrl(song.fileUrl);
    const artworkUrl = buildUrl(song.artworkUrl) || buildUrl(supportedArtist.photoUrl);
    if (!songUrl) return;
    requestPlay({
      type: 'song', id: songId, songId, url: songUrl, fileUrl: songUrl, title: song.title,
      artist: supportedArtist.username, artistName: supportedArtist.username, artistId: supportedArtist.userId,
      artwork: artworkUrl, artworkUrl, source: 'dashboard-support',
    });
  };

  const playDefaultSong = () => {
    if (!defaultSong) {
      setShowDefaultSongWizard(true);
      return;
    }
    const songId = defaultSong.songId || defaultSong.id;
    const songUrl = buildUrl(defaultSong.fileUrl);
    const artworkUrl = buildUrl(defaultSong.artworkUrl) || photoUrl;
    if (!songUrl) {
      showToast('This featured song is missing its audio file.', 'error');
      return;
    }
    requestPlay({
      type: 'song', id: songId, songId, url: songUrl, fileUrl: songUrl, title: defaultSong.title,
      artist: displayName, artistName: displayName, artistId: user.userId, artwork: artworkUrl, artworkUrl, source: 'dashboard',
    });
  };

  const handleUploadSuccess = (result?: any) => {
    setShowUploadWizard(false);
    refetchSongs();
    setVideosRefreshKey((k) => k + 1);
    const title = result?.title;
    showToast(title ? `“${title}” is live on Unis` : 'Upload complete — it’s live on Unis', 'success');
  };

  const handleProfileUpdate = () => {
    axiosInstance
      .get(`/v1/users/profile-summary/${user.userId}`)
      .then((res) => {
        const summary = res.data;
        setUserProfile(summary.profile);
        setReferralCode(summary.referralCode || null);
        setSupportedArtist(summary.supportedArtist || null);
        setPendingSupportedArtist(summary.pendingSupportedArtist || null);
      })
      .catch((err) => console.error('Failed to refresh profile summary:', err));
  };

  const cancelPendingArtist = async () => {
    setCancellingPending(true);
    try {
      await axiosInstance.delete(`/v1/users/${user.userId}/supported-artist/pending`);
      handleProfileUpdate();
    } catch (err) {
      console.error('Failed to cancel pending supported-artist change:', err);
      showToast('Could not cancel the pending change. Please try again.', 'error');
    } finally {
      setCancellingPending(false);
    }
  };

  const normalizeLink = (field: (typeof LINK_FIELDS)[number], raw: string) => {
    const value = (raw || '').trim();
    if (!value || field.type !== 'url' || /^https?:\/\//i.test(value)) return value;
    return `https://${value}`;
  };
  const linksDirty = LINK_FIELDS.some((f) => (links[f.key] || '') !== (userProfile[f.key] || ''));

  const handleSaveLinks = async () => {
    if (savingLinks) return;
    setSavingLinks(true);
    try {
      await axiosInstance.put(`/v1/users/profile/${user.userId}`, Object.fromEntries(LINK_FIELDS.map((f) => [f.key, normalizeLink(f, links[f.key])])));
      handleProfileUpdate();
      showToast('Links saved.', 'success');
    } catch (err: any) {
      console.error('Failed to save links:', err);
      showToast(err?.response?.data?.error || 'Could not save your links. Please try again.', 'error');
    } finally {
      setSavingLinks(false);
    }
  };

  const copyReferralCode = async () => {
    if (!referralCode) {
      showToast('Your code is not ready yet.');
      return;
    }
    try {
      await Clipboard.setStringAsync(referralCode);
      showToast('Code copied. Share it with your people.', 'success');
    } catch {
      showToast(`Your code: ${referralCode}`);
    }
  };

  const handleSetupAction = (key: string) => {
    switch (key) {
      case 'profile': setShowEditProfile(true); break;
      case 'featured': setShowDefaultSongWizard(true); break;
      case 'second-song': setShowUploadWizard(true); break;
      case 'links': goToTab('profile'); break;
      case 'phone': setShowPhoneVerify(true); break;
      case 'payouts': goToTab('earnings'); break;
      case 'share': copyReferralCode(); break;
      default: break;
    }
  };

  const handlePhoneVerified = async () => {
    setShowPhoneVerify(false);
    try { await refreshUser?.(); } catch { /* next load reflects it */ }
    showToast('Phone verified.', 'success');
  };

  const handleDeleteSongClick = (song: any) => {
    if (songs.length <= 1) {
      showToast('You need at least one song. Upload another before deleting this one.');
      return;
    }
    if (defaultSong?.songId === song.songId) {
      showToast('This is your featured song. Choose a different featured song first.');
      setShowDefaultSongWizard(true);
      return;
    }
    setSongToDelete(song);
  };

  const handleConfirmDelete = async () => {
    if (!songToDelete) return;
    setDeletingSongId(songToDelete.songId);
    try {
      await axiosInstance.delete(`/v1/media/song/${songToDelete.songId}`);
      await refetchSongs();
      setSongToDelete(null);
      showToast('Song deleted.', 'success');
    } catch (err) {
      console.error('Failed to delete song:', err);
      showToast('Could not delete the song. Please try again.', 'error');
    } finally {
      setDeletingSongId(null);
    }
  };

  const loadMoreAwards = async () => {
    setLoadingMoreAwards(true);
    try {
      const nextPage = awardsPage + 1;
      const res = await axiosInstance.get(`/v1/awards/artist/${user.userId}?limit=10&offset=${nextPage * 10}`);
      const more = res.data || [];
      setAwards((prev) => [...prev, ...more]);
      setAwardsPage(nextPage);
      setHasMoreAwards(more.length === 10);
    } catch (err) {
      console.error('Failed to load more awards:', err);
    } finally {
      setLoadingMoreAwards(false);
    }
  };

  const loadMoreSongAwards = async () => {
    setLoadingMoreSongAwards(true);
    try {
      const nextPage = songAwardsPage + 1;
      const res = await axiosInstance.get(`/v1/awards/artist/${user.userId}/songs?limit=10&offset=${nextPage * 10}`);
      const more = res.data || [];
      setSongAwards((prev) => [...prev, ...more]);
      setSongAwardsPage(nextPage);
      setHasMoreSongAwards(more.length === 10);
    } catch (err) {
      console.error('Failed to load more song awards:', err);
    } finally {
      setLoadingMoreSongAwards(false);
    }
  };

  const openArtistPage = () => navigation.navigate('Home', { screen: 'Artist', params: { artistId: user.userId } });

  // ── Panels ──
  const renderMusic = () => (
    <>
      <Panel
        title={<Text style={styles.panelTitle}>Songs <Text style={styles.count}>{songs.length}</Text></Text>}
        right={
          <Pressable style={[styles.primarySm, { backgroundColor: t.primary }]} onPress={() => setShowUploadWizard(true)}>
            <Upload size={13} color="#fff" />
            <Text style={styles.primarySmText}>Upload</Text>
          </Pressable>
        }
      >
        {songs.length > 0 ? (
          songs.map((song, index) => {
            const art = buildUrl(song.artworkUrl) || photoUrl;
            const isFeatured = defaultSong?.songId === song.songId;
            return (
              <View key={song.songId || song.id || index} style={[styles.songCard, isFeatured && { borderColor: t.border, backgroundColor: t.subtle }]}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  {art ? <Image source={{ uri: art }} style={styles.songArt} /> : <Image source={backimage} style={styles.songArt} />}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{song.title}</Text>
                      {isFeatured && <Text style={[styles.badge, { backgroundColor: t.primary }]}>Featured</Text>}
                    </View>
                    <View style={styles.songStats}>
                      <View style={styles.statInline}><Play size={11} color="rgba(255,255,255,0.5)" /><Text style={styles.rowSub}>{fmt(song.playCount || song.plays)} plays</Text></View>
                      <View style={styles.statInline}><Vote size={11} color="rgba(255,255,255,0.5)" /><Text style={styles.rowSub}>{fmt(song.votes || song.voteCount)} votes</Text></View>
                      {!!song.isrc && <View style={styles.statInline}><ShieldCheck size={11} color="rgba(255,255,255,0.5)" /><Text style={styles.rowSub}>ISRC {formatIsrc(song.isrc)}</Text></View>}
                    </View>
                  </View>
                </View>
                <View style={styles.songActions}>
                  <Pressable onPress={() => setStatsSong(song)} style={styles.iconBtn} accessibilityLabel={`View stats for ${song.title}`}><BarChart3 size={16} color="#fff" /></Pressable>
                  <Pressable onPress={() => setSalesSong(song)} style={styles.iconBtn} accessibilityLabel={`View sales for ${song.title}`}><DollarSign size={16} color="#fff" /></Pressable>
                  <Pressable onPress={() => setEditingSong(song)} style={styles.iconBtn} accessibilityLabel={`Edit ${song.title}`}><Edit3 size={16} color="#fff" /></Pressable>
                  <Pressable onPress={() => setLyricsSong(song)} style={styles.iconBtn} accessibilityLabel={`Edit lyrics for ${song.title}`}><FileText size={16} color="#fff" /></Pressable>
                  <Pressable onPress={() => handleDeleteSongClick(song)} disabled={deletingSongId === song.songId} style={styles.iconBtn} accessibilityLabel={`Delete ${song.title}`}>
                    {deletingSongId === song.songId ? <ActivityIndicator size="small" color="#fff" /> : <Trash2 size={16} color="#ff8a8a" />}
                  </Pressable>
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.empty}>
            <Music size={34} color="rgba(255,255,255,0.4)" />
            <Text style={styles.emptyTitle}>No songs yet</Text>
            <Text style={styles.emptyText}>Upload your first song and start building your local signal.</Text>
            <Pressable style={[styles.primary, { backgroundColor: t.primary }]} onPress={() => setShowUploadWizard(true)}>
              <Upload size={14} color="#fff" />
              <Text style={styles.primaryText}>Upload first song</Text>
            </Pressable>
          </View>
        )}
      </Panel>
      <ArtistVideos
        artistId={user.userId}
        onUpload={() => setShowUploadWizard(true)}
        refreshKey={videosRefreshKey}
        onOpen={(id) => navigation.navigate('Home', { screen: 'Video', params: { videoId: id } })}
      />
    </>
  );

  const renderFans = () => (
    <>
      <FanbaseFunnel artistId={user.userId} artistPhoto={photoUrl || undefined} artistName={displayName} ambientImage={featuredArtUrl || undefined} />
      <SupporterSection artistId={user.userId} />
      <DemographicsSection artistId={user.userId} />
    </>
  );

  const renderAwardsList = (type: 'artist' | 'song') => {
    const isSong = type === 'song';
    const list = isSong ? songAwards : awards;
    const loading = isSong ? songAwardsLoading : awardsLoading;
    const error = isSong ? songAwardsError : awardsError;
    const hasMore = isSong ? hasMoreSongAwards : hasMoreAwards;
    const loadingMore = isSong ? loadingMoreSongAwards : loadingMoreAwards;
    const recent = isSong ? recentSongAward : recentAward;
    const onRetry = () => (isSong ? fetchSongAwards(user.userId) : fetchAwards(user.userId));
    const onMore = isSong ? loadMoreSongAwards : loadMoreAwards;

    if (loading) return <SectionLoader label={isSong ? 'Loading song awards...' : 'Loading awards...'} />;
    if (error) return <SectionError message={error} onRetry={onRetry} />;
    if (list.length === 0) {
      return (
        <View style={styles.empty}>
          {isSong ? <Music size={34} color="rgba(255,255,255,0.4)" /> : <Trophy size={34} color="rgba(255,255,255,0.4)" />}
          <Text style={styles.emptyTitle}>{isSong ? 'No song awards yet' : 'No artist awards yet'}</Text>
          <Text style={styles.emptyText}>
            {isSong
              ? 'When one of your songs wins Song of the Day, Week or Month, it shows up here.'
              : 'Keep collecting plays, likes and votes to earn your first local win.'}
          </Text>
        </View>
      );
    }
    const artFor = (award: any) => {
      const u = isSong ? buildUrl(award?.song?.artworkUrl) || featuredArtUrl || photoUrl : photoUrl;
      return u ? { uri: u } : backimage;
    };
    return (
      <>
        <ImageBackground source={artFor(recent)} style={styles.trophyHero} imageStyle={{ borderRadius: 18 }} blurRadius={14}>
          <LinearGradient colors={['rgba(7,9,15,0.4)', 'rgba(7,9,15,0.9)']} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', padding: 14 }}>
            <View>
              <Image source={artFor(recent)} style={styles.trophyArt} />
              <Text style={[styles.intervalBadge, { backgroundColor: t.primary }]}>{intervalBadge(recent?.interval)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.kicker, { color: t.textAccent }]}>{isSong ? 'Latest song win' : 'Latest win'}</Text>
              <Text style={styles.trophyTitle}>{getAwardTitle(recent?.interval, type)}</Text>
              <Text style={styles.rowSub}>
                {isSong && recent?.song?.title ? `"${recent.song.title}" · ` : ''}
                {recent?.jurisdiction?.name || 'Location'}
                {!isSong && recent?.genre?.name ? ` · ${recent.genre.name}` : ''}
                {recent?.awardDate ? ` · ${formatAwardDate(recent.awardDate)}` : ''}
              </Text>
            </View>
          </View>
        </ImageBackground>
        <View style={styles.winsSummary}>
          <Trophy size={14} color="#C49A0A" />
          <Text style={styles.rowSub}>
            {list.length}{hasMore ? '+' : ''} {isSong ? 'song ' : ''}{list.length === 1 ? 'win' : 'wins'} earned
          </Text>
        </View>
        {list.map((award: any, index: number) => (
          <View key={award.awardId || index} style={styles.awardRow}>
            <Image source={artFor(award)} style={styles.awardImg} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{getAwardTitle(award.interval, type)}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {isSong && award.song?.title ? `"${award.song.title}" · ` : ''}
                {award.jurisdiction?.name || 'Location'}
                {award.genre?.name ? ` · ${award.genre.name}` : ''}
              </Text>
            </View>
            <Text style={styles.small}>{formatAwardDate(award.awardDate)}</Text>
          </View>
        ))}
        {hasMore && (
          <Pressable style={[styles.ghostSm, { alignSelf: 'center', marginTop: 8 }]} onPress={onMore} disabled={loadingMore}>
            <Text style={styles.ghostText}>{loadingMore ? 'Loading...' : 'Load more'}</Text>
          </Pressable>
        )}
      </>
    );
  };

  const renderRaces = () => (
    <>
      <View style={styles.tiles}>
        {[
          ['Score', fmt(userProfile.score)],
          ['Votes received', fmt(totalVotes)],
          ['Wins', awardsLoading || songAwardsLoading ? '—' : `${winsCount}${winsMore ? '+' : ''}`],
          ['Level', levelLabel],
        ].map(([label, value]) => (
          <View key={label} style={styles.tile}>
            <Text style={styles.tileLabel}>{label}</Text>
            <Text style={styles.tileValue}>{value}</Text>
          </View>
        ))}
      </View>
      <Panel title={<Text style={styles.panelTitle}>Your rank in every <Em>place</Em></Text>}>
        <TerritoryRankSection artistId={user.userId} />
      </Panel>
      <Panel
        title={<Text style={styles.panelTitle}>Trophy <Em>case</Em></Text>}
        right={
          <View style={styles.toggle}>
            {(['artist', 'song'] as const).map((k) => (
              <Pressable key={k} onPress={() => setAwardTab(k)} style={[styles.toggleBtn, awardTab === k && { backgroundColor: t.primary }]} accessibilityState={{ selected: awardTab === k }}>
                <Text style={styles.toggleText}>{k === 'artist' ? 'Artist' : 'Songs'}</Text>
              </Pressable>
            ))}
          </View>
        }
      >
        {renderAwardsList(awardTab)}
      </Panel>
    </>
  );

  const renderEarnings = () => (
    <>
      {!user.phoneVerified && (
        <View style={styles.warn}>
          <Text style={styles.warnText}>Your phone isn&apos;t verified, so your monthly share can&apos;t reach you yet.</Text>
          <Pressable onPress={() => setShowPhoneVerify(true)} style={styles.warnBtn}><Text style={styles.warnBtnText}>Verify now</Text></Pressable>
        </View>
      )}
      {isArtistRole && (
        <RevenueSection
          artistId={user.userId}
          artistPhoto={photoUrl || undefined}
          earningsSummary={earningsSummary}
          stripeStatus={stripeStatus}
          payoutHistory={payoutHistory}
          isStripeReady={isStripeReady}
          onPayoutSuccess={() => fetchStats(user.userId)}
        />
      )}
      <Panel title={<Text style={styles.panelTitle}>Bring your <Em>people</Em></Text>}>
        <VerificationGate title="Verify your phone to refer & earn">
          <ReferralCodeCard referralCode={referralCode || ''} username={displayName} isArtist />
        </VerificationGate>
      </Panel>
    </>
  );

  const renderProfile = () => (
    <>
      <Panel title={<Text style={styles.panelTitle}>Your <Em>page</Em></Text>}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {hasOwnPhoto ? (
            <Image source={displayPhoto} style={styles.pageAvatar} />
          ) : (
            <View style={[styles.pageAvatar, { backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }]}><Text style={styles.avatarInitial}>{artistInitial}</Text></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{displayName}</Text>
            <Text style={styles.rowSub} numberOfLines={4}>{displayBio}</Text>
          </View>
        </View>
        <View style={styles.row}>
          <Pressable style={[styles.primary, { backgroundColor: t.primary }]} onPress={() => setShowEditProfile(true)}>
            <Edit3 size={14} color="#fff" />
            <Text style={styles.primaryText}>Edit profile</Text>
          </Pressable>
          <Pressable style={styles.ghost} onPress={openArtistPage}>
            <ExternalLink size={14} color="#fff" />
            <Text style={styles.ghostText}>View my page</Text>
          </Pressable>
        </View>
        <View style={styles.featuredLine}>
          <View style={{ flex: 1 }}>
            <Text style={styles.small}>Featured song</Text>
            <Text style={styles.rowTitle}>{defaultSong?.title || 'Not set'}</Text>
          </View>
          <Pressable style={styles.ghostSm} onPress={() => setShowDefaultSongWizard(true)}>
            <Text style={styles.ghostText}>{defaultSong ? 'Change' : 'Choose'}</Text>
          </Pressable>
        </View>
      </Panel>

      <Panel title={<Text style={styles.panelTitle}>Your <Em>links</Em></Text>}>
        {LINK_FIELDS.map((field) => (
          <View key={field.key} style={{ marginBottom: 10 }}>
            <Text style={styles.label}>{field.label}</Text>
            <TextInput
              value={links[field.key] || ''}
              onChangeText={(v) => setLinks((prev) => ({ ...prev, [field.key]: v }))}
              placeholder={field.placeholder}
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType={field.type === 'email' ? 'email-address' : 'url'}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </View>
        ))}
        <Pressable
          style={[styles.primary, { backgroundColor: t.primary, alignSelf: 'flex-start' }, (savingLinks || !linksDirty) && { opacity: 0.5 }]}
          disabled={savingLinks || !linksDirty}
          onPress={handleSaveLinks}
        >
          <Text style={styles.primaryText}>{savingLinks ? 'Saving...' : 'Save links'}</Text>
        </Pressable>
      </Panel>

      <Panel title={<Text style={styles.panelTitle}>Artist <Em>photos</Em></Text>}>
        <ArtistPhotosManager artistId={user.userId} />
      </Panel>

      <Panel title={<Text style={styles.panelTitle}>Your <Em>agreement</Em></Text>}>
        <Text style={styles.rowSub}>You own your music. Download your ownership and revenue share agreement, in your name, any time.</Text>
        <DownloadContractButton artistName={displayName} label="Download agreement" style={{ alignSelf: 'flex-start', marginTop: 10 }} />
      </Panel>
    </>
  );

  const renderSettings = () => {
    const supportImg = buildUrl(supportedArtist?.photoUrl) || buildUrl(supportedArtist?.defaultSong?.artworkUrl);
    return (
      <>
        <Text style={styles.settingsTitle}>Settings</Text>
        <Panel title={<Text style={styles.panelTitle}>Color <Em>theme</Em></Text>}>
          <ThemePicker userId={user.userId} />
        </Panel>
        <Panel title={<Text style={styles.panelTitle}>You <Em>support</Em></Text>}>
          {supportedArtist ? (
            <ImageBackground source={supportImg ? { uri: supportImg } : backimage} style={styles.supportCard} imageStyle={{ borderRadius: 18 }}>
              <LinearGradient colors={['rgba(7,9,15,0.25)', 'rgba(7,9,15,0.92)']} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
              <View style={{ padding: 16 }}>
                <Text style={[styles.kicker, { color: t.textAccent }]}>You support</Text>
                <Text style={styles.trophyTitle}>{supportedArtist.username}</Text>
                <Text style={styles.rowSub}>{supportedArtist.defaultSong ? `Featured song: ${supportedArtist.defaultSong.title}` : 'No featured song yet'}</Text>
                <View style={[styles.row, { marginTop: 12 }]}>
                  {supportedArtist.defaultSong && (
                    <Pressable style={styles.whiteBtn} onPress={playSupportedArtistSong}>
                      <Play size={13} color="#000" fill="#000" />
                      <Text style={styles.whiteText}>Listen</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.ghost} onPress={() => setShowArtistPicker(true)}><Text style={styles.ghostText}>Change</Text></Pressable>
                </View>
                {pendingSupportedArtist && (
                  <View style={styles.pending}>
                    <Clock size={12} color="#fff" />
                    <Text style={[styles.rowSub, { flex: 1 }]}>
                      Switching to <Text style={{ fontWeight: '800', color: '#fff' }}>{pendingSupportedArtist.username}</Text>
                      {pendingEffective ? ` on ${pendingEffective}` : ''}
                    </Text>
                    <Pressable onPress={cancelPendingArtist} disabled={cancellingPending}>
                      <Text style={[styles.ghostText, { color: t.textAccent }]}>{cancellingPending ? 'Cancelling…' : 'Cancel'}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </ImageBackground>
          ) : (
            <View style={styles.empty}>
              <Heart size={34} color="rgba(255,255,255,0.4)" />
              <Text style={styles.emptyTitle}>No supported artist yet</Text>
              <Text style={styles.emptyText}>Every Unis member backs one artist. Choose the artist whose voice you want to amplify. You can change it later.</Text>
              <Pressable style={[styles.primary, { backgroundColor: t.primary }]} onPress={() => setShowArtistPicker(true)}>
                <Heart size={14} color="#fff" />
                <Text style={styles.primaryText}>Choose an artist</Text>
              </Pressable>
            </View>
          )}
        </Panel>
        <Panel title={<Text style={styles.panelTitle}>Your <Em>votes</Em></Text>}>
          <VoteHistorySection userId={user.userId} />
        </Panel>
        <View style={styles.danger}>
          <Text style={styles.rowTitle}>Account</Text>
          <Text style={styles.rowSub}>Change your password or permanently delete your account. Deletion cannot be undone.</Text>
          <View style={[styles.row, { marginTop: 10 }]}>
            <Pressable style={styles.ghost} onPress={() => setShowChangePassword(true)}><Text style={styles.ghostText}>Change Password</Text></Pressable>
            <Pressable style={styles.dangerBtn} onPress={() => setShowDeleteWizard(true)}>
              <Trash2 size={14} color="#fff" />
              <Text style={styles.primaryText}>Delete Account</Text>
            </Pressable>
          </View>
        </View>
      </>
    );
  };

  const renderPanel = () => {
    switch (activeTab) {
      case 'music': return renderMusic();
      case 'fans': return renderFans();
      case 'races': return renderRaces();
      case 'earnings': return renderEarnings();
      case 'profile': return renderProfile();
      case 'settings': return renderSettings();
      default:
        return (
          <ArtistHomeTab
            artistId={user.userId}
            setupSteps={setupSteps}
            onSetupAction={handleSetupAction}
            totals={{ plays: totalPlays, followers, supporters }}
            defaultSong={defaultSong}
            featuredArtwork={featuredArtwork}
            onPlayFeatured={playDefaultSong}
            onChooseFeatured={() => setShowDefaultSongWizard(true)}
            latestWin={latestWin}
            earningsSummary={earningsSummary}
            phoneVerified={Boolean(user.phoneVerified)}
            onVerifyPhone={() => setShowPhoneVerify(true)}
            supportersCount={supporters}
            onGoTab={goToTab}
            onViewPage={openArtistPage}
          />
        );
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.glow, { backgroundColor: t.glow1 }]} pointerEvents="none" />
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 140 }} stickyHeaderIndices={[1]} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.head}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {hasOwnPhoto ? (
              <Image source={displayPhoto} style={styles.headAvatar} />
            ) : (
              <View style={[styles.headAvatar, { backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }]}><Text style={styles.avatarInitial}>{artistInitial}</Text></View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Text style={[styles.chip, { borderColor: t.border }]}>{levelLabel} tier</Text>
                {!!placeLine && <Text style={styles.chip}>{placeLine}</Text>}
              </View>
              <Text style={styles.name} numberOfLines={1} accessibilityRole="header">{displayName}</Text>
            </View>
          </View>
          <View style={[styles.row, { marginTop: 14 }]}>
            <Pressable style={[styles.primary, { backgroundColor: t.primary }]} onPress={() => setShowUploadWizard(true)}>
              <Upload size={15} color="#fff" />
              <Text style={styles.primaryText}>Upload</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={openArtistPage}><Text style={styles.ghostText}>View my page</Text></Pressable>
            <Pressable
              style={[styles.gear, activeTab === 'settings' && { backgroundColor: t.soft, borderColor: t.border }]}
              onPress={() => goToTab(activeTab === 'settings' ? 'home' : 'settings')}
              accessibilityLabel="Settings"
              accessibilityState={{ selected: activeTab === 'settings' }}
            >
              <SlidersHorizontal size={18} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Tabs (sticky) */}
        <View style={[styles.tabsWrap, { backgroundColor: mix(t.primary, '#07090f', 0.94) }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
            {TABS.map((tab) => {
              const selected = tab.id === activeTab;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => goToTab(tab.id)}
                  style={[styles.tab, selected && { backgroundColor: t.soft, borderColor: t.border }]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.tabText, selected && styles.tabTextOn]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View key={activeTab} style={{ gap: 14, marginTop: 14 }}>{renderPanel()}</View>
      </ScrollView>

      {/* Wizards and modals */}
      {showUploadWizard && (
        <UploadWizard
          visible={showUploadWizard}
          onClose={() => setShowUploadWizard(false)}
          onSuccess={handleUploadSuccess}
          userId={user.userId}
          defaultGenreId={userProfile.genre?.genreId || userProfile.genreId}
          defaultJurisdictionId={userProfile.jurisdiction?.jurisdictionId}
          userProfile={userProfile}
        />
      )}
      {showEditProfile && (
        <EditProfileWizard
          visible={showEditProfile}
          onClose={() => setShowEditProfile(false)}
          onSuccess={() => { setShowEditProfile(false); handleProfileUpdate(); }}
          user={{ userId: userProfile.userId || user.userId, username: userProfile.username, bio: userProfile.bio, photoUrl: userProfile.photoUrl || null }}
          isArtist={isArtistRole}
        />
      )}
      {showDefaultSongWizard && (
        <ChangeDefaultSongWizard
          visible={showDefaultSongWizard}
          onClose={() => setShowDefaultSongWizard(false)}
          onSuccess={() => refetchDefaultSong()}
          userId={user.userId}
          songs={songs as any}
          currentDefaultSongId={defaultSong?.songId}
        />
      )}
      {showDeleteWizard && <DeleteAccountWizard visible={showDeleteWizard} onClose={() => setShowDeleteWizard(false)} />}
      {editingSong && (
        <EditSongWizard visible={!!editingSong} onClose={() => setEditingSong(null)} song={editingSong} onSuccess={refetchSongs} fallbackGenreId={userProfile.genre?.genreId || userProfile.genreId} />
      )}
      {lyricsSong && (
        <LyricsWizard visible={!!lyricsSong} onClose={() => setLyricsSong(null)} song={lyricsSong} onSuccess={refetchSongs} />
      )}
      <DeleteSongModal
        visible={!!songToDelete}
        songTitle={songToDelete?.title}
        onConfirm={handleConfirmDelete}
        onCancel={() => setSongToDelete(null)}
        isDeleting={!!deletingSongId}
      />
      <SupportedArtistPicker
        show={showArtistPicker}
        onClose={() => setShowArtistPicker(false)}
        userId={user.userId}
        currentArtistId={supportedArtist?.userId || null}
        userJurisdictionId={userProfile?.jurisdiction?.jurisdictionId}
        userJurisdictionName={userProfile?.jurisdiction?.name}
        onSuccess={() => { setShowArtistPicker(false); handleProfileUpdate(); }}
      />
      <SongStatsModal show={!!statsSong} onClose={() => setStatsSong(null)} artistId={user.userId} song={statsSong} />
      <SongSalesModal show={!!salesSong} onClose={() => setSalesSong(null)} artistId={user.userId} song={salesSong} />
      <ChangePasswordWizard visible={showChangePassword} onClose={() => setShowChangePassword(false)} />
      <PhoneVerificationModal show={showPhoneVerify} onClose={() => setShowPhoneVerify(false)} onVerified={handlePhoneVerified} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07090f' },
  glow: { position: 'absolute', top: -140, right: -100, width: 360, height: 360, borderRadius: 180 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#07090f' },
  state: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  stateText: { color: 'rgba(255,255,255,0.6)', fontSize: 13.5 },
  errorText: { color: '#f87171', fontSize: 14, textAlign: 'center' },
  head: { marginBottom: 6 },
  headAvatar: { width: 64, height: 64, borderRadius: 32 },
  avatarInitial: { color: '#fff', fontSize: 24, fontWeight: '800' },
  chip: { color: 'rgba(255,255,255,0.8)', fontSize: 11.5, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  name: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.6, marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  primarySm: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  primarySmText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  ghost: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  ghostSm: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  ghostText: { color: '#fff', fontWeight: '600', fontSize: 13.5 },
  gear: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', marginLeft: 'auto' },
  tabsWrap: { marginHorizontal: -16, paddingVertical: 8, paddingHorizontal: 16 },
  tabs: { gap: 6 },
  tab: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'transparent' },
  tabText: { color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: 14 },
  tabTextOn: { color: '#fff' },
  panel: { padding: 16, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
  panelTitle: { color: '#fff', fontSize: 19, fontWeight: '800', letterSpacing: -0.3, flexShrink: 1 },
  em: { fontStyle: 'italic', fontWeight: '400' },
  count: { color: 'rgba(255,255,255,0.45)', fontSize: 15, fontWeight: '600' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  emptyText: { color: 'rgba(255,255,255,0.55)', fontSize: 13.5, textAlign: 'center', lineHeight: 19, marginBottom: 6 },
  songCard: { padding: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', backgroundColor: 'rgba(255,255,255,0.02)', marginBottom: 10 },
  songArt: { width: 56, height: 56, borderRadius: 10 },
  badge: { color: '#fff', fontSize: 10.5, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  songStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  statInline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  songActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  iconBtn: { width: 44, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  rowTitle: { color: '#fff', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  rowSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, lineHeight: 18 },
  small: { color: 'rgba(255,255,255,0.45)', fontSize: 11.5 },
  videoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  videoThumb: { width: 96, height: 56, borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  videoPlay: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '47%', flexGrow: 1, padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  tileLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  tileValue: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 4 },
  toggle: { flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  toggleText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
  trophyHero: { borderRadius: 18, overflow: 'hidden', marginBottom: 10 },
  trophyArt: { width: 74, height: 74, borderRadius: 12 },
  intervalBadge: { position: 'absolute', bottom: -6, alignSelf: 'center', color: '#fff', fontSize: 10.5, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  trophyTitle: { color: '#fff', fontSize: 19, fontWeight: '800', marginTop: 2 },
  winsSummary: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  awardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)' },
  awardImg: { width: 42, height: 42, borderRadius: 8 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: 'rgba(245,158,11,0.12)' },
  warnText: { color: '#fbbf24', fontSize: 13.5, flex: 1, lineHeight: 19 },
  warnBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(245,158,11,0.25)' },
  warnBtnText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
  pageAvatar: { width: 64, height: 64, borderRadius: 32 },
  featuredLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)' },
  label: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, fontWeight: '600', marginBottom: 5 },
  input: { color: '#fff', fontSize: 14.5, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  settingsTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  supportCard: { minHeight: 180, borderRadius: 18, overflow: 'hidden', justifyContent: 'flex-end' },
  whiteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: '#fff' },
  whiteText: { color: '#000', fontWeight: '800', fontSize: 14 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  danger: { padding: 16, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)' },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: '#dc2626' },
});

export default ArtistDashboardScreen;
