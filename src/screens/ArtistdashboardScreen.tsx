// src/screens/ArtistdashboardScreen.tsx
// Ported from web `artistDashboard.jsx` (production version).
//
// Architecture (web parity):
//   fetchCore   — Promise.all(profile-summary, songs/artist, default-song)
//   fetchStats  — Promise.all(supporters, followers, total-plays, total-votes,
//                 earnings summary, stripe status, payouts) — each individually
//                 caught so one failure doesn't sink the batch
//   fetchAwards / fetchSongAwards — trophy case with Artist | Songs toggle and
//                 offset pagination (10 per page)
//
// ★ play-flow: play handlers no longer fire their own /play POST. The Player
//   counts the play once the listener crosses the 15s/25% threshold; media is
//   tagged with a `source` so analytics can attribute discovery.
// ★ item 3: quick-nav — collapsibles register an opener + report their scroll
//   position; the "Jump to" bar opens the section then scrolls to it.
//
// Intentionally NOT ported (dead code in the web file, verified unreachable):
//   - the inline `editingLyricsSong` lyrics modal (LyricsWizard is the live path)
//   - the orphan bottom VoteHistoryModal + its /v1/vote/history?limit=50 fetch
//     (nothing sets showVoteHistory; VoteHistorySection owns its own modal)

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ImageBackground,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Upload, Play, FileText, Vote, Heart, Users, X, Music, Trash2, Edit3,
  Trophy, MapPin, DollarSign, ArrowRight, ShieldCheck, Sparkles, Compass,
  Gauge, BarChart3, Lock, Clock, Link2, Share2, Palette, LayoutGrid, ImagePlus,
} from 'lucide-react-native';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import axiosInstance from '../services/axiosInstance';
import buildUrl from '../utils/buildUrl';

// ── Wizards (existing mobile components) ─────────────────────────────────────
import EditProfileWizard from '../components/Editprofilewizard';
import UploadWizard from '../components/Uploadwizard';
import ChangeDefaultSongWizard from '../components/Changedefaultsongwizard';
import EditSongWizard from '../components/Editsongwizard';
import LyricsWizard from '../components/LyricsWizard';
import DeleteAccountWizard from '../components/DeleteAccountWizard';
import DeleteSongModal from '../components/Deletesongmodal';
import ChangePasswordWizard from '../components/Changepasswordwizard';
import DownloadContractButton from '../components/Downloadcontractbutton';

// ── Ported with the Profile sweep ────────────────────────────────────────────
import ReferralCodeCard from '../components/ReferralCodeCard';
import ThemePicker from '../components/ThemePicker';
import VoteHistorySection from '../components/VoteHistorySection';
import SupportedArtistPicker from '../components/SupportedArtistPicker';
import VerificationGate from '../components/VerificationGate';

// ── Ported with this Dashboard sweep ─────────────────────────────────────────
import ArtistCollapsibleSection from '../components/ArtistCollapsibleSection';
import FanbaseFunnel from '../components/FanbaseFunnel';
import SupporterSection from '../components/SupporterSection';
import DemographicsSection from '../components/DemographicsSection';
import TerritoryRankSection from '../components/TerritoryRankSection';
import ArtistPhotosManager from '../components/ArtistPhotosManager';
import SongStatsModal from '../components/SongStatsModal';
import SongSalesModal from '../components/SongSalesModal';
import RevenueSection from '../components/RevenueSection';

const backimage = require('../../assets/randomrapper.jpeg');

// ============================================================================
// COLORS
// ============================================================================
const COLORS = {
  bgBlack: '#000000',
  cardBg: 'rgba(255, 255, 255, 0.03)',
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  textWhite: '#FFFFFF',
  textSilver: '#CCCCCC',
  textGray: '#AAAAAA',
  textMuted: '#888888',
  unisBlue: '#004aad',
  unisBlueBright: '#4a9eff',
  dangerRed: '#dc3545',
  errorRed: '#f87171',
};

// ============================================================================
// Types (loose — mirror the web's duck-typed payloads)
// ============================================================================
interface Song {
  songId: string;
  id?: string;
  title: string;
  fileUrl?: string | null;
  artworkUrl?: string | null;
  playCount?: number;
  plays?: number;
  votes?: number;
  voteCount?: number;
  isrc?: string;
  lyrics?: string;
}

interface Award {
  interval?: { name?: string };
  jurisdiction?: { name?: string };
  genre?: { name?: string };
  awardDate?: string;
  song?: { title?: string; artworkUrl?: string | null };
}

// ============================================================================
// Inline section helpers (web parity)
// ============================================================================
const SectionLoader: React.FC<{ label?: string }> = ({ label = 'Loading...' }) => (
  <View style={styles.sectionState}>
    <ActivityIndicator size="large" color={COLORS.unisBlueBright} />
    <Text style={styles.sectionStateText}>{label}</Text>
  </View>
);

const SectionError: React.FC<{ message?: string; onRetry?: () => void }> = ({
  message = 'Failed to load.',
  onRetry,
}) => (
  <View style={styles.sectionState}>
    <Text style={styles.sectionErrorText}>{message}</Text>
    {onRetry && (
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryBtnText}>Retry</Text>
      </TouchableOpacity>
    )}
  </View>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const ArtistDashboardScreen: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { requestPlay } = usePlayer();

  // ★ item 3: quick-nav — collapsibles register an opener; nav opens then scrolls
  const scrollRef = useRef<ScrollView>(null);
  const sectionOpeners = useRef<Record<string, () => void>>({});
  const sectionPositions = useRef<Record<string, number>>({});
  const registerSection = useCallback((sectionId: string, opener: () => void) => {
    sectionOpeners.current[sectionId] = opener;
  }, []);
  const registerPosition = useCallback((sectionId: string, y: number) => {
    sectionPositions.current[sectionId] = y;
  }, []);
  const goToSection = useCallback((sectionId: string) => {
    sectionOpeners.current[sectionId]?.();
    // Give the section a frame to expand before scrolling (RN equivalent of
    // web's requestAnimationFrame + scrollIntoView).
    requestAnimationFrame(() => {
      const y = sectionPositions.current[sectionId];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    });
  }, []);

  // ---- Core data ---------------------------------------------------------
  const [userProfile, setUserProfile] = useState<any>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [defaultSong, setDefaultSong] = useState<Song | null>(null);
  const [coreLoading, setCoreLoading] = useState(true);
  const [coreError, setCoreError] = useState<string | null>(null);

  // ---- Secondary data ----------------------------------------------------
  const [supporters, setSupporters] = useState(0);
  const [followers, setFollowers] = useState(0);
  const [totalPlays, setTotalPlays] = useState(0);
  const [totalVotes, setTotalVotes] = useState(0);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [supportedArtist, setSupportedArtist] = useState<any>(null);
  const [pendingSupportedArtist, setPendingSupportedArtist] = useState<any>(null); // ★ H
  const [earningsSummary, setEarningsSummary] = useState<any>(null);
  const [stripeStatus, setStripeStatus] = useState<any>(null);
  const [payoutHistory, setPayoutHistory] = useState<any[]>([]);
  const [statsSong, setStatsSong] = useState<Song | null>(null);   // ★ D
  const [salesSong, setSalesSong] = useState<Song | null>(null);   // ★ sales

  const [awards, setAwards] = useState<Award[]>([]);
  const [awardsPage, setAwardsPage] = useState(0);
  const [hasMoreAwards, setHasMoreAwards] = useState(true);
  const [awardsLoading, setAwardsLoading] = useState(true);
  const [awardsError, setAwardsError] = useState<string | null>(null);
  const [loadingMoreAwards, setLoadingMoreAwards] = useState(false);

  // ---- Song awards (trophy toggle) ----------------------------------------
  const [awardTab, setAwardTab] = useState<'artist' | 'song'>('artist');
  const [songAwards, setSongAwards] = useState<Award[]>([]);
  const [songAwardsPage, setSongAwardsPage] = useState(0);
  const [hasMoreSongAwards, setHasMoreSongAwards] = useState(true);
  const [songAwardsLoading, setSongAwardsLoading] = useState(true);
  const [songAwardsError, setSongAwardsError] = useState<string | null>(null);
  const [loadingMoreSongAwards, setLoadingMoreSongAwards] = useState(false);

  // ---- UI state ----------------------------------------------------------
  const [showWelcomePopup, setShowWelcomePopup] = useState(true);
  const [showUploadWizard, setShowUploadWizard] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showDefaultSongWizard, setShowDefaultSongWizard] = useState(false);
  const [showDeleteWizard, setShowDeleteWizard] = useState(false);
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [songToDelete, setSongToDelete] = useState<Song | null>(null);
  const [showLyricsWizard, setShowLyricsWizard] = useState(false);
  const [lyricsSong, setLyricsSong] = useState<Song | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showArtistPicker, setShowArtistPicker] = useState(false); // ★ H
  const [cancellingPending, setCancellingPending] = useState(false); // ★ H

  // -----------------------------------------------------------------------
  // Fetch helpers
  // -----------------------------------------------------------------------
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

      if (!profile) {
        throw new Error('Profile summary did not include a profile payload.');
      }

      setUserProfile(profile);
      setReferralCode(summary?.referralCode || null);
      setSupportedArtist(summary?.supportedArtist || null);
      setPendingSupportedArtist(summary?.pendingSupportedArtist || null); // ★ H
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
      const [
        supportersRes,
        followersRes,
        totalPlaysRes,
        totalVotesRes,
        earningsRes,
        stripeRes,
        payoutsRes,
      ] = await Promise.all([
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

  const loadMoreAwards = async () => {
    if (!user?.userId) return;
    setLoadingMoreAwards(true);
    try {
      const nextPage = awardsPage + 1;
      const res = await axiosInstance.get(
        `/v1/awards/artist/${user.userId}?limit=10&offset=${nextPage * 10}`
      );
      const newAwards = res.data || [];
      setAwards((prev) => [...prev, ...newAwards]);
      setAwardsPage(nextPage);
      setHasMoreAwards(newAwards.length === 10);
    } catch (err) {
      console.error('Failed to load more awards:', err);
    } finally {
      setLoadingMoreAwards(false);
    }
  };

  const loadMoreSongAwards = async () => {
    if (!user?.userId) return;
    setLoadingMoreSongAwards(true);
    try {
      const nextPage = songAwardsPage + 1;
      const res = await axiosInstance.get(
        `/v1/awards/artist/${user.userId}/songs?limit=10&offset=${nextPage * 10}`
      );
      const newAwards = res.data || [];
      setSongAwards((prev) => [...prev, ...newAwards]);
      setSongAwardsPage(nextPage);
      setHasMoreSongAwards(newAwards.length === 10);
    } catch (err) {
      console.error('Failed to load more song awards:', err);
    } finally {
      setLoadingMoreSongAwards(false);
    }
  };

  useEffect(() => {
    if (authLoading || !user?.userId) return;
    const userId = user.userId;
    fetchCore(userId);
    fetchStats(userId);
    fetchAwards(userId);
    fetchSongAwards(userId);
  }, [user?.userId, authLoading, fetchCore, fetchStats, fetchAwards, fetchSongAwards]);

  // -----------------------------------------------------------------------
  // Handlers (declared before early returns; none are hooks)
  // -----------------------------------------------------------------------
  const refetchDefaultSong = () => {
    axiosInstance.get(`/v1/users/${user!.userId}/default-song`)
      .then((res) => setDefaultSong(res.data))
      .catch(() => setDefaultSong(null));
  };

  const refetchSongs = () => {
    axiosInstance.get(`/v1/media/songs/artist/${user!.userId}`)
      .then((res) => setSongs(res.data || []));
  };

  const handleUploadSuccess = () => {
    setShowUploadWizard(false);
    refetchSongs();
  };

  const handleProfileUpdate = () => {
    axiosInstance.get(`/v1/users/profile-summary/${user!.userId}`)
      .then((res) => {
        const summary = res.data;
        setUserProfile(summary.profile);
        setReferralCode(summary.referralCode || null);
        setSupportedArtist(summary.supportedArtist || null);
        setPendingSupportedArtist(summary.pendingSupportedArtist || null); // ★ H
      })
      .catch((err) => console.error('Failed to refresh profile summary:', err));
  };

  // ★ H: cancel a queued supported-artist change (mirrors Profile).
  const cancelPendingArtist = async () => {
    if (!user?.userId) return;
    setCancellingPending(true);
    try {
      await axiosInstance.delete(`/v1/users/${user.userId}/supported-artist/pending`);
      handleProfileUpdate();
    } catch (err) {
      console.error('Failed to cancel pending supported-artist change:', err);
      Alert.alert('Error', 'Failed to cancel the pending change. Please try again.');
    } finally {
      setCancellingPending(false);
    }
  };

  const SOCIAL_FIELDS: Record<string, string> = {
    instagram: 'instagramUrl',
    twitter: 'twitterUrl',
    tiktok: 'tiktokUrl',
    youtube: 'youtubeUrl',
    contactEmail: 'contactEmail',
  };

  const handleSocialMediaUpdate = async (platform: string, value: string) => {
    try {
      const field = SOCIAL_FIELDS[platform] || `${platform}Url`;
      await axiosInstance.put(`/v1/users/profile/${user!.userId}`, { [field]: value });
      handleProfileUpdate();
      Alert.alert('Saved', `${platform} link updated successfully!`);
    } catch (err) {
      console.error('Failed to update social media:', err);
      Alert.alert('Error', 'Failed to update link');
    }
  };

  const handleDeleteSongClick = (song: Song) => {
    if (songs.length <= 1) {
      Alert.alert(
        'Keep at least one song',
        'You must have at least one song. Upload another song before deleting this one.'
      );
      return;
    }
    if (defaultSong?.songId === song.songId) {
      Alert.alert(
        'Featured song',
        'This is your featured song. Please change your featured song before deleting it.'
      );
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
      const res = await axiosInstance.get(`/v1/media/songs/artist/${user!.userId}`);
      setSongs(res.data || []);
      setSongToDelete(null);
    } catch (err) {
      console.error('Failed to delete song:', err);
      Alert.alert('Error', 'Failed to delete song. Please try again.');
    } finally {
      setDeletingSongId(null);
    }
  };

  // ★ play-flow: no /play POST — the Player counts the play at the 15s/25%
  // threshold. We only tag the media with a source for discovery attribution.
  const playSupportedArtistSong = async () => {
    if (!supportedArtist?.defaultSong) {
      Alert.alert('No Song', 'This artist has not set a featured song yet.');
      return;
    }
    const song = supportedArtist.defaultSong;
    const songId = song.songId || song.id;
    const songUrl = buildUrl(song.fileUrl);
    const artworkUrl = buildUrl(song.artworkUrl) || buildUrl(supportedArtist.photoUrl);
    if (!songUrl) return;

    requestPlay({
      type: 'song',
      id: songId,
      songId,
      url: songUrl,
      fileUrl: songUrl,
      title: song.title,
      artist: supportedArtist.username,
      artistName: supportedArtist.username,
      artistId: supportedArtist.userId,
      artwork: artworkUrl,
      artworkUrl,
      source: 'dashboard-support', // ★ play-flow: discovery source tag
    } as any);
  };

  const playDefaultSong = async () => {
    if (!defaultSong) {
      setShowDefaultSongWizard(true);
      return;
    }
    const songId = defaultSong.songId || defaultSong.id;
    const songUrl = buildUrl(defaultSong.fileUrl);
    const artworkUrl = buildUrl(defaultSong.artworkUrl) || displayPhoto;
    if (!songUrl) {
      Alert.alert('Unavailable', 'This featured song is missing its audio file.');
      return;
    }

    requestPlay({
      type: 'song',
      id: songId,
      songId,
      url: songUrl,
      fileUrl: songUrl,
      title: defaultSong.title,
      artist: displayName,
      artistName: displayName,
      artistId: user!.userId,
      artwork: artworkUrl,
      artworkUrl,
      source: 'dashboard', // ★ play-flow: discovery source tag
    } as any);
  };

  // ---- Award formatting helpers (web parity) ------------------------------
  const formatAwardDate = (dateString?: string): string => {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-');
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getAwardTitle = (interval?: { name?: string }, type: 'artist' | 'song' = 'artist'): string => {
    const name = (interval?.name || '').toLowerCase();
    const subject = type === 'song' ? 'Song' : 'Artist';
    if (name === 'daily' || name.includes('day')) return `${subject} of the Day`;
    if (name === 'weekly' || name.includes('week')) return `${subject} of the Week`;
    if (name === 'monthly' || name.includes('month')) return `${subject} of the Month`;
    if (name.includes('year') || name.includes('annual')) return `${subject} of the Year`;
    return interval?.name ? `${interval.name} ${subject} Award` : `${subject} Award`;
  };

  const intervalBadge = (interval?: { name?: string }): string => {
    const name = (interval?.name || '').toLowerCase();
    if (name.includes('day')) return 'Day';
    if (name.includes('week')) return 'Week';
    if (name.includes('month')) return 'Month';
    if (name.includes('quarter')) return 'Quarter';
    if (name.includes('midterm') || name.includes('semi')) return 'Midterm';
    if (name.includes('year') || name.includes('annual')) return 'Year';
    return interval?.name || 'Award';
  };

  const formatIsrc = (isrc?: string): string => {
    if (!isrc || isrc.length !== 12) return isrc || '';
    return `${isrc.slice(0, 2)}-${isrc.slice(2, 5)}-${isrc.slice(5, 7)}-${isrc.slice(7)}`;
  };

  // -----------------------------------------------------------------------
  // Early returns
  // -----------------------------------------------------------------------
  if (authLoading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.unisBlueBright} />
      </View>
    );
  }
  if (!user) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.fullscreenMsg}>Please log in to view dashboard.</Text>
      </View>
    );
  }
  if (coreLoading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <SectionLoader label="Loading your dashboard..." />
      </View>
    );
  }
  if (coreError || !userProfile) {
    return (
      <View style={[styles.screen, styles.center]}>
        <SectionError message={coreError || 'No data.'} onRetry={() => fetchCore(user.userId)} />
      </View>
    );
  }

  // -----------------------------------------------------------------------
  // Derived display values
  // -----------------------------------------------------------------------
  const displayName: string = userProfile.username || 'Artist';
  const displayPhoto: string | null = buildUrl(userProfile.photoUrl);
  const displayBio: string = userProfile.bio || 'No bio yet. Click Edit to add one.';
  const artistInitial = displayName.charAt(0).toUpperCase();
  const levelLabel = userProfile.level || 'Silver';

  const featuredArtwork =
    buildUrl(defaultSong?.artworkUrl) || displayPhoto || null;

  const recentAward = awards?.[0] || null;
  const recentSongAward = songAwards?.[0] || null;

  const isStripeReady = Boolean(
    stripeStatus?.onboardingComplete && stripeStatus?.payoutsEnabled
  );

  // ★ H: pending-change effective date (mirrors Profile)
  const pendingEffective = pendingSupportedArtist?.effectiveDate
    ? new Date(pendingSupportedArtist.effectiveDate).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
      })
    : null;

  const nextMoves = [
    user && !user.phoneVerified && {
      title: 'Verify your phone number',
      text: 'Unlocks voting, commenting, and referral earnings — and keeps Unis spam-free.',
      action: 'Verify phone',
      onPress: () => goToSection('nav-referral'),
    },
    !userProfile.bio && {
      title: 'Add your artist story',
      text: 'A short bio helps listeners understand why they should support you.',
      action: 'Edit profile',
      onPress: () => setShowEditProfile(true),
    },
    !defaultSong && {
      title: 'Set your featured song',
      text: 'Your featured song is the first track people see when they visit your artist presence.',
      action: 'Set featured',
      onPress: () => setShowDefaultSongWizard(true),
    },
    songs.length < 2 && {
      title: 'Build your catalog',
      text: 'A second track gives listeners more to explore and gives you more chances to win.',
      action: 'Upload song',
      onPress: () => setShowUploadWizard(true),
    },
    !userProfile.instagramUrl && !userProfile.tiktokUrl && !userProfile.twitterUrl && {
      title: 'Connect your socials',
      text: 'Let supporters continue following you beyond Unis.',
      action: 'Add links',
      onPress: () => goToSection('nav-social'),
    },
    userProfile?.role === 'artist' && !isStripeReady && {
      title: 'Prepare your payouts',
      text: 'Connect payout access before your revenue is ready to cash out.',
      action: 'Review revenue',
      onPress: () => goToSection('nav-revenue'),
    },
  ].filter(Boolean) as { title: string; text: string; action: string; onPress: () => void }[];

  // ★ item 3: quick-nav targets (revenue only shows for artists)
  const navItems = [
    { id: 'nav-momentum', label: 'Fanbase', Icon: Gauge },
    { id: 'nav-fanbase', label: 'Audience', Icon: BarChart3 },
    { id: 'nav-supporters', label: 'Supporters', Icon: Users },
    { id: 'nav-demographics', label: 'Demographics', Icon: Compass },
    { id: 'nav-territory', label: 'Territory', Icon: MapPin },
    { id: 'nav-catalog', label: 'Catalog', Icon: Music },
    { id: 'nav-trophy', label: 'Trophies', Icon: Trophy },
    { id: 'nav-photos', label: 'Photos', Icon: ImagePlus },
    ...(userProfile?.role === 'artist'
      ? [{ id: 'nav-revenue', label: 'Revenue', Icon: DollarSign }]
      : []),
    { id: 'nav-growth', label: 'Growth', Icon: Sparkles },
    { id: 'nav-social', label: 'Socials', Icon: Link2 },
    { id: 'nav-support', label: 'You Support', Icon: Heart },
    { id: 'nav-referral', label: 'Refer', Icon: Share2 },
    { id: 'nav-theme', label: 'Theme', Icon: Palette },
  ];

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <View style={styles.screen}>
      {/* Welcome popup */}
      <Modal
        visible={showWelcomePopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWelcomePopup(false)}
      >
        <View style={styles.welcomeOverlay}>
          <View style={styles.welcomePopup}>
            <TouchableOpacity
              style={styles.welcomeClose}
              onPress={() => setShowWelcomePopup(false)}
            >
              <X size={24} color={COLORS.textWhite} />
            </TouchableOpacity>
            <View style={styles.welcomeIcon}>
              <Heart size={40} color={COLORS.textWhite} fill={COLORS.textWhite} />
            </View>
            <Text style={styles.welcomeTitle}>Thank You!</Text>
            <Text style={styles.welcomeBody}>
              Your contribution to the UNIS community makes us stronger. Keep creating!
            </Text>
            <TouchableOpacity
              style={styles.welcomeBtn}
              onPress={() => setShowWelcomePopup(false)}
            >
              <Text style={styles.welcomeBtnText}>You're Welcome</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ============== HERO ============== */}
        <View
          style={styles.hero}
          onLayout={(e) => registerPosition('nav-momentum', e.nativeEvent.layout.y)}
        >
          <Text style={styles.heroEyebrow}>Artist · {levelLabel} Tier</Text>

          <View style={styles.heroIdentity}>
            {displayPhoto ? (
              <Image source={{ uri: displayPhoto }} style={styles.heroAvatar} />
            ) : (
              <View style={[styles.heroAvatar, styles.heroAvatarPh]}>
                <Text style={styles.heroAvatarInitial}>{artistInitial}</Text>
              </View>
            )}
            <View style={styles.heroCopy}>
              <Text style={styles.heroName}>{displayName}</Text>
              <Text style={styles.heroBio}>{displayBio}</Text>
            </View>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Score</Text>
              <Text style={styles.heroStatValue}>{(userProfile.score || 0).toLocaleString()}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Supporters</Text>
              <Text style={styles.heroStatValue}>{supporters.toLocaleString()}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Plays</Text>
              <Text style={styles.heroStatValue}>{totalPlays.toLocaleString()}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Votes</Text>
              <Text style={styles.heroStatValue}>{totalVotes.toLocaleString()}</Text>
            </View>
          </View>

          <View style={styles.heroActions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => setShowUploadWizard(true)}
            >
              <Upload size={15} color={COLORS.textWhite} />
              <Text style={styles.btnText}>Upload Song</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={() => setShowEditProfile(true)}
            >
              <Edit3 size={15} color={COLORS.textWhite} />
              <Text style={styles.btnText}>Edit Profile</Text>
            </TouchableOpacity>
            {/* ★ item 2a: launch-ready ownership & revenue-share agreement
                (expo-print HTML→PDF; same text as the web jsPDF build) */}
            <DownloadContractButton artistName={displayName} />
          </View>
        </View>

        {/* ============== FEATURED SONG ============== */}
        {featuredArtwork ? (
          <ImageBackground
            source={{ uri: featuredArtwork }}
            style={styles.featured}
            imageStyle={styles.featuredImage}
          >
            <LinearGradient
              colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.85)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.featuredContent}>
              <Text style={styles.featuredTag}>Featured song</Text>
              <Text style={styles.featuredTitle}>
                {defaultSong?.title || 'No featured song set'}
              </Text>
              <Text style={styles.featuredSub}>
                {defaultSong
                  ? `${defaultSong.playCount || 0} plays · Lead with your strongest record.`
                  : 'Choose the track that should represent you first.'}
              </Text>
              <View style={styles.featuredActions}>
                <TouchableOpacity style={styles.featuredPlay} onPress={playDefaultSong}>
                  <Play size={13} color={COLORS.bgBlack} fill={COLORS.bgBlack} />
                  <Text style={styles.featuredPlayText}>{defaultSong ? 'Play' : 'Choose'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.featuredChange}
                  onPress={() => setShowDefaultSongWizard(true)}
                >
                  <Text style={styles.featuredChangeText}>Change</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ImageBackground>
        ) : (
          <View style={[styles.featured, styles.featuredEmpty]}>
            <View style={styles.featuredContent}>
              <Text style={styles.featuredTag}>Featured song</Text>
              <Text style={styles.featuredTitle}>No featured song set</Text>
              <Text style={styles.featuredSub}>
                Choose the track that should represent you first.
              </Text>
              <TouchableOpacity
                style={styles.featuredPlay}
                onPress={() => setShowDefaultSongWizard(true)}
              >
                <Text style={styles.featuredPlayText}>Choose</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ★ item 3: quick-nav shortcut bar */}
        <View style={styles.quicknav}>
          <View style={styles.quicknavLabel}>
            <LayoutGrid size={13} color={COLORS.textMuted} />
            <Text style={styles.quicknavLabelText}>Jump to</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {navItems.map(({ id, label, Icon }) => (
              <TouchableOpacity
                key={id}
                style={styles.quicknavBtn}
                onPress={() => goToSection(id)}
              >
                <Icon size={16} color={COLORS.unisBlueBright} />
                <Text style={styles.quicknavText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ★ analytics: real fanbase funnel (self-fetching) */}
        <View onLayout={(e) => registerPosition('nav-fanbase', e.nativeEvent.layout.y)}>
          <FanbaseFunnel
            artistId={user?.userId}
            artistPhoto={displayPhoto}
            artistName={displayName}
            ambientImage={featuredArtwork}
          />
        </View>

        {/* ★ Supporters section */}
        <View onLayout={(e) => registerPosition('nav-supporters', e.nativeEvent.layout.y)}>
          <SupporterSection artistId={user?.userId} />
        </View>

        {/* ★ item 6: demographics */}
        <View onLayout={(e) => registerPosition('nav-demographics', e.nativeEvent.layout.y)}>
          <DemographicsSection artistId={user?.userId} />
        </View>

        {/* ★ collapsible: Territory signal (collapsed by default) */}
        <ArtistCollapsibleSection
          id="nav-territory"
          onRegister={registerSection}
          onLayoutY={registerPosition}
          eyebrow="Local advantage"
          title="Territory signal"
          defaultOpen={false}
          ambientImage={displayPhoto}
        >
          <TerritoryRankSection artistId={user?.userId} />
        </ArtistCollapsibleSection>

        {/* ★ collapsible: Catalog (collapsed by default) */}
        <ArtistCollapsibleSection
          id="nav-catalog"
          onRegister={registerSection}
          onLayoutY={registerPosition}
          eyebrow="Catalog command"
          title="Songs"
          defaultOpen={false}
          ambientImage={displayPhoto}
        >
          <View style={styles.catalogActions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, styles.btnSmall]}
              onPress={() => setShowUploadWizard(true)}
            >
              <Upload size={14} color={COLORS.textWhite} />
              <Text style={styles.btnText}>Upload</Text>
            </TouchableOpacity>
          </View>

          {songs.length > 0 ? (
            songs.map((song, index) => {
              const songArtwork = buildUrl(song.artworkUrl) || displayPhoto;
              const isFeatured = defaultSong?.songId === song.songId;

              return (
                <View
                  key={song.songId || song.id || index}
                  style={[styles.songCard, isFeatured && styles.songCardFeatured]}
                >
                  {songArtwork ? (
                    <Image source={{ uri: songArtwork }} style={styles.songArt} />
                  ) : (
                    <View style={[styles.songArt, styles.songArtPh]}>
                      <Music size={18} color={COLORS.textGray} />
                    </View>
                  )}

                  <View style={styles.songBody}>
                    <View style={styles.songTitleRow}>
                      <View style={styles.songTitleText}>
                        <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
                        <Text style={styles.songType}>
                          {isFeatured ? 'Featured track' : 'Catalog track'}
                        </Text>
                      </View>
                      {isFeatured && (
                        <View style={styles.songBadge}>
                          <Text style={styles.songBadgeText}>Featured</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.songStats}>
                      <View style={styles.songStat}>
                        <Play size={12} color={COLORS.textMuted} />
                        <Text style={styles.songStatText}>
                          {song.playCount || song.plays || 0} plays
                        </Text>
                      </View>
                      <View style={styles.songStat}>
                        <Vote size={12} color={COLORS.textMuted} />
                        <Text style={styles.songStatText}>
                          {song.votes || song.voteCount || 0} votes
                        </Text>
                      </View>
                      {song.isrc ? (
                        <View style={styles.songStat}>
                          <ShieldCheck size={12} color={COLORS.textMuted} />
                          <Text style={styles.songStatText}>ISRC {formatIsrc(song.isrc)}</Text>
                        </View>
                      ) : (
                        <Text style={styles.songWarn}>No ISRC</Text>
                      )}
                    </View>

                    <View style={styles.songActions}>
                      {/* ★ D: per-song stats */}
                      <TouchableOpacity
                        style={styles.songActionBtn}
                        onPress={() => setStatsSong(song)}
                        accessibilityLabel={`View stats for ${song.title}`}
                      >
                        <BarChart3 size={16} color={COLORS.textSilver} />
                      </TouchableOpacity>
                      {/* ★ sales: per-song revenue */}
                      <TouchableOpacity
                        style={styles.songActionBtn}
                        onPress={() => setSalesSong(song)}
                        accessibilityLabel={`View sales for ${song.title}`}
                      >
                        <DollarSign size={16} color={COLORS.textSilver} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.songActionBtn}
                        onPress={() => setEditingSong(song)}
                        accessibilityLabel={`Edit ${song.title}`}
                      >
                        <Edit3 size={16} color={COLORS.textSilver} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.songActionBtn}
                        onPress={() => { setLyricsSong(song); setShowLyricsWizard(true); }}
                        accessibilityLabel={`Edit lyrics for ${song.title}`}
                      >
                        <FileText size={16} color={COLORS.textSilver} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.songActionBtn}
                        onPress={() => handleDeleteSongClick(song)}
                        disabled={deletingSongId === song.songId}
                        accessibilityLabel={`Delete ${song.title}`}
                      >
                        {deletingSongId === song.songId ? (
                          <ActivityIndicator size="small" color={COLORS.textSilver} />
                        ) : (
                          <Trash2 size={16} color={COLORS.textSilver} />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Music size={34} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No songs yet</Text>
              <Text style={styles.emptyBody}>
                Upload your first track and start building your local signal.
              </Text>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={() => setShowUploadWizard(true)}
              >
                <Upload size={14} color={COLORS.textWhite} />
                <Text style={styles.btnText}>Upload first song</Text>
              </TouchableOpacity>
            </View>
          )}
        </ArtistCollapsibleSection>

        {/* ★ Gallery */}
        <ArtistCollapsibleSection
          id="nav-photos"
          onRegister={registerSection}
          onLayoutY={registerPosition}
          eyebrow="Gallery"
          title="Artist photos"
          defaultOpen={false}
          ambientImage={displayPhoto}
        >
          <ArtistPhotosManager artistId={user?.userId} />
        </ArtistCollapsibleSection>

        {/* ★ F: trophy case — collapsible + height-capped with Artist | Songs toggle */}
        <ArtistCollapsibleSection
          id="nav-trophy"
          onRegister={registerSection}
          onLayoutY={registerPosition}
          eyebrow="Recognition"
          title="Trophy case"
          defaultOpen={false}
        >
          {/* ★ Artist | Songs toggle */}
          <View style={styles.awardsToggle}>
            <TouchableOpacity
              style={[styles.awardsToggleBtn, awardTab === 'artist' && styles.awardsToggleBtnActive]}
              onPress={() => setAwardTab('artist')}
            >
              <Text style={[styles.awardsToggleText, awardTab === 'artist' && styles.awardsToggleTextActive]}>
                Artist
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.awardsToggleBtn, awardTab === 'song' && styles.awardsToggleBtnActive]}
              onPress={() => setAwardTab('song')}
            >
              <Text style={[styles.awardsToggleText, awardTab === 'song' && styles.awardsToggleTextActive]}>
                Songs
              </Text>
            </TouchableOpacity>
          </View>

          {/* ====================== ARTIST AWARDS ====================== */}
          {awardTab === 'artist' && (
            awardsLoading ? (
              <SectionLoader label="Loading awards..." />
            ) : awardsError ? (
              <SectionError message={awardsError} onRetry={() => fetchAwards(user.userId)} />
            ) : awards.length > 0 ? (
              <>
                <View style={styles.awardFeatured}>
                  {displayPhoto ? (
                    <ImageBackground
                      source={{ uri: displayPhoto }}
                      style={styles.awardAmbient}
                      imageStyle={styles.awardAmbientImg}
                      blurRadius={25}
                    >
                      <View style={styles.awardFeaturedInner}>
                        <View style={styles.awardArtworkWrap}>
                          <Image source={{ uri: displayPhoto }} style={styles.awardArtwork} />
                          <View style={styles.awardBadge}>
                            <Text style={styles.awardBadgeText}>
                              {intervalBadge(recentAward?.interval)}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.awardInfo}>
                          <Text style={styles.awardInfoTag}>Latest win</Text>
                          <Text style={styles.awardInfoTitle}>
                            {getAwardTitle(recentAward?.interval, 'artist')}
                          </Text>
                          <Text style={styles.awardInfoMeta}>
                            {recentAward?.jurisdiction?.name || 'Location'}
                            {recentAward?.genre?.name ? ` · ${recentAward.genre.name}` : ''}
                            {recentAward?.awardDate ? ` · ${formatAwardDate(recentAward.awardDate)}` : ''}
                          </Text>
                        </View>
                      </View>
                    </ImageBackground>
                  ) : (
                    <View style={styles.awardFeaturedInner}>
                      <View style={styles.awardInfo}>
                        <Text style={styles.awardInfoTag}>Latest win</Text>
                        <Text style={styles.awardInfoTitle}>
                          {getAwardTitle(recentAward?.interval, 'artist')}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                <View style={styles.awardsSummary}>
                  <Trophy size={14} color="#C49A0A" />
                  <Text style={styles.awardsSummaryText}>
                    {awards.length}{hasMoreAwards ? '+' : ''} {awards.length === 1 ? 'win' : 'wins'} earned
                  </Text>
                </View>

                {/* height-capped scroll (web's .artist-awards-scroll) */}
                <View style={styles.awardsScroll}>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {awards.map((award, index) => (
                      <View key={index} style={styles.awardRow}>
                        {displayPhoto ? (
                          <Image source={{ uri: displayPhoto }} style={styles.awardRowImg} />
                        ) : (
                          <View style={[styles.awardRowImg, styles.songArtPh]}>
                            <Trophy size={16} color={COLORS.textGray} />
                          </View>
                        )}
                        <View style={styles.awardRowInfo}>
                          <Text style={styles.awardRowTitle}>
                            {getAwardTitle(award.interval, 'artist')}
                          </Text>
                          <Text style={styles.awardRowMeta}>
                            {award.jurisdiction?.name || 'Location'}
                            {award.genre?.name ? ` · ${award.genre.name}` : ''}
                          </Text>
                        </View>
                        <Text style={styles.awardRowDate}>{formatAwardDate(award.awardDate)}</Text>
                      </View>
                    ))}
                    {hasMoreAwards && (
                      <TouchableOpacity
                        style={[styles.btn, styles.btnGhost, styles.btnSmall, styles.awardsMore]}
                        onPress={loadMoreAwards}
                        disabled={loadingMoreAwards}
                      >
                        <Text style={styles.btnText}>
                          {loadingMoreAwards ? 'Loading...' : 'Load more awards'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                </View>
              </>
            ) : (
              <View style={styles.emptyState}>
                <Trophy size={34} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>No artist awards yet</Text>
                <Text style={styles.emptyBody}>
                  Keep collecting votes, plays, likes, and score to earn your first local win.
                </Text>
              </View>
            )
          )}

          {/* ====================== SONG AWARDS ====================== */}
          {awardTab === 'song' && (
            songAwardsLoading ? (
              <SectionLoader label="Loading song awards..." />
            ) : songAwardsError ? (
              <SectionError message={songAwardsError} onRetry={() => fetchSongAwards(user.userId)} />
            ) : songAwards.length > 0 ? (
              <>
                {(() => {
                  const recentSong = recentSongAward;
                  const artSrc =
                    buildUrl(recentSong?.song?.artworkUrl) || featuredArtwork || displayPhoto;
                  return (
                    <View style={styles.awardFeatured}>
                      {artSrc ? (
                        <ImageBackground
                          source={{ uri: artSrc }}
                          style={styles.awardAmbient}
                          imageStyle={styles.awardAmbientImg}
                          blurRadius={25}
                        >
                          <View style={styles.awardFeaturedInner}>
                            <View style={styles.awardArtworkWrap}>
                              <Image source={{ uri: artSrc }} style={styles.awardArtwork} />
                              <View style={styles.awardBadge}>
                                <Text style={styles.awardBadgeText}>
                                  {intervalBadge(recentSong?.interval)}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.awardInfo}>
                              <Text style={styles.awardInfoTag}>Latest song win</Text>
                              <Text style={styles.awardInfoTitle}>
                                {getAwardTitle(recentSong?.interval, 'song')}
                              </Text>
                              <Text style={styles.awardInfoMeta}>
                                {recentSong?.song?.title ? `"${recentSong.song.title}"` : ''}
                                {recentSong?.jurisdiction?.name ? ` · ${recentSong.jurisdiction.name}` : ''}
                                {recentSong?.awardDate ? ` · ${formatAwardDate(recentSong.awardDate)}` : ''}
                              </Text>
                            </View>
                          </View>
                        </ImageBackground>
                      ) : null}
                    </View>
                  );
                })()}

                <View style={styles.awardsSummary}>
                  <Trophy size={14} color="#C49A0A" />
                  <Text style={styles.awardsSummaryText}>
                    {songAwards.length}{hasMoreSongAwards ? '+' : ''} song{' '}
                    {songAwards.length === 1 ? 'win' : 'wins'} earned
                  </Text>
                </View>

                <View style={styles.awardsScroll}>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {songAwards.map((award, index) => {
                      const artSrc =
                        buildUrl(award.song?.artworkUrl) || featuredArtwork || displayPhoto;
                      return (
                        <View key={index} style={styles.awardRow}>
                          {artSrc ? (
                            <Image source={{ uri: artSrc }} style={styles.awardRowImg} />
                          ) : (
                            <View style={[styles.awardRowImg, styles.songArtPh]}>
                              <Music size={16} color={COLORS.textGray} />
                            </View>
                          )}
                          <View style={styles.awardRowInfo}>
                            <Text style={styles.awardRowTitle}>
                              {getAwardTitle(award.interval, 'song')}
                            </Text>
                            <Text style={styles.awardRowMeta}>
                              {award.song?.title ? `"${award.song.title}"` : ''}
                              {award.jurisdiction?.name ? ` · ${award.jurisdiction.name}` : ''}
                              {award.genre?.name ? ` · ${award.genre.name}` : ''}
                            </Text>
                          </View>
                          <Text style={styles.awardRowDate}>{formatAwardDate(award.awardDate)}</Text>
                        </View>
                      );
                    })}
                    {hasMoreSongAwards && (
                      <TouchableOpacity
                        style={[styles.btn, styles.btnGhost, styles.btnSmall, styles.awardsMore]}
                        onPress={loadMoreSongAwards}
                        disabled={loadingMoreSongAwards}
                      >
                        <Text style={styles.btnText}>
                          {loadingMoreSongAwards ? 'Loading...' : 'Load more'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                </View>
              </>
            ) : (
              <View style={styles.emptyState}>
                <Music size={34} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>No song awards yet</Text>
                <Text style={styles.emptyBody}>
                  When one of your tracks wins Song of the Day, Week, or Month it'll appear here.
                </Text>
              </View>
            )
          )}
        </ArtistCollapsibleSection>

        {/* Vote history */}
        <ArtistCollapsibleSection
          id="nav-votes"
          onRegister={registerSection}
          onLayoutY={registerPosition}
          eyebrow="Your activity"
          title="Vote history"
          ambientImage={displayPhoto}
          defaultOpen={false}
        >
          <VoteHistorySection userId={user?.userId} />
        </ArtistCollapsibleSection>

        {/* Revenue (artists only) */}
        {userProfile?.role === 'artist' && (
          <View onLayout={(e) => registerPosition('nav-revenue', e.nativeEvent.layout.y)}>
            <RevenueSection
              artistId={user?.userId}
              artistPhoto={displayPhoto}
              earningsSummary={earningsSummary}
              stripeStatus={stripeStatus}
              payoutHistory={payoutHistory}
              isStripeReady={isStripeReady}
              onPayoutSuccess={() => fetchStats(user.userId)}
            />
          </View>
        )}

        {/* ★ collapsible: Growth checklist (collapsed by default) */}
        <ArtistCollapsibleSection
          id="nav-growth"
          onRegister={registerSection}
          onLayoutY={registerPosition}
          eyebrow="Next move"
          title="Growth checklist"
          defaultOpen={false}
        >
          {nextMoves.length > 0 ? (
            nextMoves.map((move, index) => (
              <TouchableOpacity key={index} style={styles.nextCard} onPress={move.onPress}>
                <View style={styles.nextCardText}>
                  <Text style={styles.nextCardTitle}>{move.title}</Text>
                  <Text style={styles.nextCardBody}>{move.text}</Text>
                </View>
                <View style={styles.nextCardAction}>
                  <Text style={styles.nextCardActionText}>{move.action}</Text>
                  <ArrowRight size={13} color={COLORS.unisBlueBright} />
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={[styles.nextCard, styles.nextCardComplete]}>
              <View style={styles.nextCardText}>
                <Text style={styles.nextCardTitle}>Your launch basics are complete</Text>
                <Text style={styles.nextCardBody}>
                  Keep driving listeners to vote, support, and share your music.
                </Text>
              </View>
              <View style={styles.nextCardAction}>
                <Text style={styles.nextCardActionText}>Keep building</Text>
                <ArrowRight size={13} color={COLORS.unisBlueBright} />
              </View>
            </View>
          )}
        </ArtistCollapsibleSection>

        {/* ★ collapsible: Social links (collapsed by default) — onBlur save,
            per-field PUT, incl. YouTube + contact email (web parity) */}
        <ArtistCollapsibleSection
          id="nav-social"
          onRegister={registerSection}
          onLayoutY={registerPosition}
          eyebrow="Artist presence"
          title="Social links"
          defaultOpen={false}
        >
          <SocialInput
            label="Instagram"
            placeholder="https://instagram.com/yourprofile"
            defaultValue={userProfile.instagramUrl || ''}
            onSave={(v) => handleSocialMediaUpdate('instagram', v)}
          />
          <SocialInput
            label="Twitter / X"
            placeholder="https://twitter.com/yourprofile"
            defaultValue={userProfile.twitterUrl || ''}
            onSave={(v) => handleSocialMediaUpdate('twitter', v)}
          />
          <SocialInput
            label="TikTok"
            placeholder="https://tiktok.com/@yourprofile"
            defaultValue={userProfile.tiktokUrl || ''}
            onSave={(v) => handleSocialMediaUpdate('tiktok', v)}
          />
          <SocialInput
            label="YouTube"
            placeholder="https://youtube.com/@yourchannel"
            defaultValue={userProfile.youtubeUrl || ''}
            onSave={(v) => handleSocialMediaUpdate('youtube', v)}
          />
          <SocialInput
            label="Contact email"
            placeholder="you@example.com"
            defaultValue={userProfile.contactEmail || ''}
            keyboardType="email-address"
            onSave={(v) => handleSocialMediaUpdate('contactEmail', v)}
          />
        </ArtistCollapsibleSection>

        {/* ★ H: full supported-artist section (ported from Profile). Always
            rendered — legacy artists with a null supported artist get a
            graceful "choose an artist" state. */}
        <ArtistCollapsibleSection
          id="nav-support"
          onRegister={registerSection}
          onLayoutY={registerPosition}
          eyebrow="Community"
          title="You support"
          defaultOpen={false}
        >
          {supportedArtist ? (
            <View style={styles.supportFeature}>
              {(buildUrl(supportedArtist.photoUrl) ||
                buildUrl(supportedArtist.defaultSong?.artworkUrl)) ? (
                <ImageBackground
                  source={{
                    uri:
                      buildUrl(supportedArtist.photoUrl) ||
                      buildUrl(supportedArtist.defaultSong?.artworkUrl) ||
                      undefined,
                  }}
                  style={styles.supportMedia}
                  imageStyle={styles.supportMediaImg}
                >
                  <LinearGradient
                    colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.85)']}
                    style={StyleSheet.absoluteFill}
                  />
                  <SupportContent
                    supportedArtist={supportedArtist}
                    pendingSupportedArtist={pendingSupportedArtist}
                    pendingEffective={pendingEffective}
                    cancellingPending={cancellingPending}
                    onListen={playSupportedArtistSong}
                    onChange={() => setShowArtistPicker(true)}
                    onCancelPending={cancelPendingArtist}
                  />
                </ImageBackground>
              ) : (
                <SupportContent
                  supportedArtist={supportedArtist}
                  pendingSupportedArtist={pendingSupportedArtist}
                  pendingEffective={pendingEffective}
                  cancellingPending={cancellingPending}
                  onListen={playSupportedArtistSong}
                  onChange={() => setShowArtistPicker(true)}
                  onCancelPending={cancelPendingArtist}
                />
              )}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Heart size={34} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No supported artist yet</Text>
              <Text style={styles.emptyBody}>
                Every Unis member backs one artist. Choose the artist whose voice
                you want to amplify — you can change it later.
              </Text>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={() => setShowArtistPicker(true)}
              >
                <Heart size={14} color={COLORS.textWhite} />
                <Text style={styles.btnText}>Choose an artist</Text>
              </TouchableOpacity>
            </View>
          )}
        </ArtistCollapsibleSection>

        {/* ★ collapsible: Referral (collapsed by default) */}
        <ArtistCollapsibleSection
          id="nav-referral"
          onRegister={registerSection}
          onLayoutY={registerPosition}
          eyebrow="Network"
          title="Refer & earn"
          defaultOpen={false}
        >
          <VerificationGate title="Verify your phone to refer & earn">
            <ReferralCodeCard
              referralCode={referralCode || ''}
              username={displayName}
              isArtist={true}
            />
          </VerificationGate>
        </ArtistCollapsibleSection>

        {/* ★ collapsible: Theme (collapsed by default) */}
        <ArtistCollapsibleSection
          id="nav-theme"
          onRegister={registerSection}
          onLayoutY={registerPosition}
          eyebrow="Personalization"
          title="Color theme"
          defaultOpen={false}
        >
          <ThemePicker userId={user?.userId} />
        </ArtistCollapsibleSection>

        {/* ============== DANGER ZONE ============== */}
        <View style={styles.danger}>
          <Text style={styles.dangerHeading}>Danger zone</Text>
          <Text style={styles.dangerText}>
            Change your password or permanently delete your account. Deletion cannot be undone.
          </Text>
          <View style={styles.dangerActions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={() => setShowChangePassword(true)}
            >
              <Text style={styles.btnText}>Change Password</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnDanger]}
              onPress={() => setShowDeleteWizard(true)}
            >
              <Trash2 size={14} color={COLORS.textWhite} />
              <Text style={styles.btnText}>Delete Account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* ============== WIZARDS / MODALS ============== */}
      {showUploadWizard && (
        <UploadWizard
          visible={showUploadWizard}
          onClose={() => setShowUploadWizard(false)}
          onSuccess={handleUploadSuccess}
          userId={user.userId}
          defaultGenreId={userProfile.genre?.genreId || userProfile.genreId}
          defaultJurisdictionId={userProfile.jurisdiction?.jurisdictionId}
        />
      )}

      {showEditProfile && (
        <EditProfileWizard
          visible={showEditProfile}
          onClose={() => setShowEditProfile(false)}
          onSuccess={() => {
            setShowEditProfile(false);
            handleProfileUpdate();
          }}
          user={{
            userId: userProfile.userId || user.userId,
            username: userProfile.username,
            bio: userProfile.bio,
            photoUrl: userProfile.photoUrl || null,
          }}
          isArtist={userProfile.role === 'artist'}
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

      {showDeleteWizard && (
        <DeleteAccountWizard
          visible={showDeleteWizard}
          onClose={() => setShowDeleteWizard(false)}
        />
      )}

      {editingSong && (
        <EditSongWizard
          visible={!!editingSong}
          onClose={() => setEditingSong(null)}
          song={editingSong as any}
          onSuccess={refetchSongs}
        />
      )}

      {showLyricsWizard && (
        <LyricsWizard
          visible={showLyricsWizard}
          onClose={() => {
            setShowLyricsWizard(false);
            setLyricsSong(null);
          }}
          song={lyricsSong as any}
          onSuccess={refetchSongs}
        />
      )}

      <DeleteSongModal
        visible={!!songToDelete}
        songTitle={songToDelete?.title}
        onConfirm={handleConfirmDelete}
        onCancel={() => setSongToDelete(null)}
        isDeleting={!!deletingSongId}
      />

      {/* ★ H: supported-artist picker (same component Profile uses). */}
      <SupportedArtistPicker
        show={showArtistPicker}
        onClose={() => setShowArtistPicker(false)}
        userId={user.userId}
        currentArtistId={supportedArtist?.userId || null}
        userJurisdictionId={userProfile?.jurisdiction?.jurisdictionId}
        userJurisdictionName={userProfile?.jurisdiction?.name}
        onSuccess={() => {
          setShowArtistPicker(false);
          handleProfileUpdate();
        }}
      />

      <SongStatsModal
        show={!!statsSong}
        onClose={() => setStatsSong(null)}
        artistId={user.userId}
        song={statsSong}
      />

      {/* ★ sales: per-song revenue modal */}
      <SongSalesModal
        show={!!salesSong}
        onClose={() => setSalesSong(null)}
        artistId={user.userId}
        song={salesSong}
      />

      <ChangePasswordWizard
        visible={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />
    </View>
  );
};

// ── Supported-artist feature content (shared between ambient/plain shells) ──
const SupportContent: React.FC<{
  supportedArtist: any;
  pendingSupportedArtist: any;
  pendingEffective: string | null;
  cancellingPending: boolean;
  onListen: () => void;
  onChange: () => void;
  onCancelPending: () => void;
}> = ({
  supportedArtist,
  pendingSupportedArtist,
  pendingEffective,
  cancellingPending,
  onListen,
  onChange,
  onCancelPending,
}) => (
  <View style={styles.supportContent}>
    <Text style={styles.featuredTag}>You support</Text>
    <Text style={styles.featuredTitle}>{supportedArtist.username}</Text>
    <Text style={styles.featuredSub}>
      {supportedArtist.defaultSong
        ? `Featured track: ${supportedArtist.defaultSong.title}`
        : 'No featured track yet'}
    </Text>

    <View style={styles.featuredActions}>
      {supportedArtist.defaultSong && (
        <TouchableOpacity style={styles.featuredPlay} onPress={onListen}>
          <Play size={13} color={COLORS.bgBlack} fill={COLORS.bgBlack} />
          <Text style={styles.featuredPlayText}>Listen</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.featuredChange} onPress={onChange}>
        <Text style={styles.featuredChangeText}>Change</Text>
      </TouchableOpacity>
    </View>

    {pendingSupportedArtist && (
      <View style={styles.pending}>
        <Clock size={12} color={COLORS.textSilver} />
        <Text style={styles.pendingText}>
          Switching to{' '}
          <Text style={styles.pendingStrong}>{pendingSupportedArtist.username}</Text>
          {pendingEffective ? ` on ${pendingEffective}` : ''}
        </Text>
        <TouchableOpacity onPress={onCancelPending} disabled={cancellingPending}>
          <Text style={styles.pendingCancel}>
            {cancellingPending ? 'Cancelling…' : 'Cancel'}
          </Text>
        </TouchableOpacity>
      </View>
    )}
  </View>
);

// ── Social input row (web's onBlur-save inputs) ─────────────────────────────
const SocialInput: React.FC<{
  label: string;
  placeholder: string;
  defaultValue: string;
  keyboardType?: 'default' | 'email-address';
  onSave: (value: string) => void;
}> = ({ label, placeholder, defaultValue, keyboardType = 'default', onSave }) => {
  const [value, setValue] = useState(defaultValue);
  return (
    <View style={styles.socialItem}>
      <Text style={styles.socialLabel}>{label}</Text>
      <TextInput
        style={styles.socialInput}
        placeholder={placeholder}
        placeholderTextColor="#666666"
        value={value}
        onChangeText={setValue}
        onEndEditing={() => {
          if (value !== defaultValue) onSave(value);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType}
      />
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bgBlack },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  fullscreenMsg: { color: COLORS.textGray, fontSize: 15 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 120 },

  sectionState: { alignItems: 'center' },
  sectionStateText: { color: COLORS.textGray, fontSize: 14, marginTop: 12 },
  sectionErrorText: { color: COLORS.errorRed, fontSize: 14, textAlign: 'center' },
  retryBtn: {
    marginTop: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20, paddingVertical: 9, paddingHorizontal: 20,
  },
  retryBtnText: { color: COLORS.textWhite, fontSize: 13, fontWeight: '600' },

  // Welcome popup
  welcomeOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  welcomePopup: {
    backgroundColor: '#101010', borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderRadius: 20, padding: 26, alignItems: 'center', width: '100%',
  },
  welcomeClose: { position: 'absolute', top: 12, right: 12, padding: 6 },
  welcomeIcon: {
    width: 74, height: 74, borderRadius: 37, backgroundColor: COLORS.unisBlue,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  welcomeTitle: { color: COLORS.textWhite, fontSize: 24, fontWeight: '800' },
  welcomeBody: {
    color: COLORS.textGray, fontSize: 14, lineHeight: 20,
    textAlign: 'center', marginTop: 8, marginBottom: 20,
  },
  welcomeBtn: {
    backgroundColor: COLORS.unisBlue, borderRadius: 24,
    paddingVertical: 12, paddingHorizontal: 28,
  },
  welcomeBtnText: { color: COLORS.textWhite, fontSize: 14, fontWeight: '700' },

  // Hero
  hero: {
    backgroundColor: COLORS.cardBg, borderColor: COLORS.borderSubtle,
    borderWidth: 1, borderRadius: 18, padding: 20, marginBottom: 16,
  },
  heroEyebrow: {
    color: COLORS.unisBlueBright, fontSize: 11, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14,
  },
  heroIdentity: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  heroAvatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
  },
  heroAvatarPh: { alignItems: 'center', justifyContent: 'center' },
  heroAvatarInitial: { color: COLORS.textWhite, fontSize: 28, fontWeight: '800' },
  heroCopy: { flex: 1, marginLeft: 16 },
  heroName: { color: COLORS.textWhite, fontSize: 26, fontWeight: '800' },
  heroBio: { color: COLORS.textGray, fontSize: 13, lineHeight: 18, marginTop: 4 },
  heroStats: {
    flexDirection: 'row', borderTopColor: COLORS.borderSubtle,
    borderTopWidth: 1, paddingTop: 14, marginBottom: 16,
  },
  heroStat: { flex: 1 },
  heroStatLabel: {
    color: COLORS.textMuted, fontSize: 10, fontWeight: '600',
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4,
  },
  heroStatValue: { color: COLORS.textWhite, fontSize: 17, fontWeight: '800' },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  // Buttons
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 22, paddingVertical: 11, paddingHorizontal: 18,
  },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 14 },
  btnPrimary: { backgroundColor: COLORS.unisBlue },
  btnGhost: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  btnDanger: { backgroundColor: COLORS.dangerRed },
  btnText: { color: COLORS.textWhite, fontSize: 13, fontWeight: '700', marginLeft: 6 },

  // Featured song
  featured: {
    borderRadius: 18, overflow: 'hidden', minHeight: 200,
    marginBottom: 16, justifyContent: 'flex-end',
  },
  featuredImage: { borderRadius: 18 },
  featuredEmpty: {
    backgroundColor: COLORS.cardBg, borderColor: COLORS.borderSubtle, borderWidth: 1,
  },
  featuredContent: { padding: 20 },
  featuredTag: {
    color: COLORS.textSilver, fontSize: 11, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6,
  },
  featuredTitle: { color: COLORS.textWhite, fontSize: 23, fontWeight: '800' },
  featuredSub: { color: COLORS.textSilver, fontSize: 13, marginTop: 4, marginBottom: 14 },
  featuredActions: { flexDirection: 'row', alignItems: 'center' },
  featuredPlay: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.textWhite,
    borderRadius: 20, paddingVertical: 9, paddingHorizontal: 16, marginRight: 10,
  },
  featuredPlayText: { color: COLORS.bgBlack, fontSize: 13, fontWeight: '800', marginLeft: 6 },
  featuredChange: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 20, paddingVertical: 9, paddingHorizontal: 16,
  },
  featuredChangeText: { color: COLORS.textWhite, fontSize: 13, fontWeight: '700' },

  // Quick nav
  quicknav: {
    backgroundColor: COLORS.cardBg, borderColor: COLORS.borderSubtle,
    borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 16,
  },
  quicknavLabel: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  quicknavLabelText: {
    color: COLORS.textMuted, fontSize: 11, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', marginLeft: 5,
  },
  quicknavBtn: {
    alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12,
    marginRight: 8, minWidth: 74,
  },
  quicknavText: { color: COLORS.textSilver, fontSize: 10, fontWeight: '600', marginTop: 5 },

  // Catalog
  catalogActions: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  songCard: {
    flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.35)',
    borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
    borderRadius: 14, padding: 12, marginBottom: 10,
  },
  songCardFeatured: { borderColor: 'rgba(74,158,255,0.45)' },
  songArt: {
    width: 58, height: 58, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)',
  },
  songArtPh: { alignItems: 'center', justifyContent: 'center' },
  songBody: { flex: 1, marginLeft: 12 },
  songTitleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  songTitleText: { flex: 1, paddingRight: 8 },
  songTitle: { color: COLORS.textWhite, fontSize: 15, fontWeight: '700' },
  songType: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  songBadge: {
    backgroundColor: 'rgba(74,158,255,0.15)', borderRadius: 8,
    paddingVertical: 3, paddingHorizontal: 7,
  },
  songBadgeText: { color: COLORS.unisBlueBright, fontSize: 10, fontWeight: '800' },
  songStats: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  songStat: { flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 2 },
  songStatText: { color: COLORS.textMuted, fontSize: 11, marginLeft: 4 },
  songWarn: { color: '#ffb13c', fontSize: 11 },
  songActions: {
    flexDirection: 'row', marginTop: 8,
    borderTopColor: 'rgba(255,255,255,0.06)', borderTopWidth: 1, paddingTop: 8,
  },
  songActionBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 24 },
  emptyTitle: { color: COLORS.textWhite, fontSize: 16, fontWeight: '700', marginTop: 10 },
  emptyBody: {
    color: COLORS.textGray, fontSize: 13, lineHeight: 19,
    textAlign: 'center', marginTop: 6, marginBottom: 14, paddingHorizontal: 10,
  },

  // Awards
  awardsToggle: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20, padding: 3, marginBottom: 14, alignSelf: 'flex-start',
  },
  awardsToggleBtn: { borderRadius: 17, paddingVertical: 7, paddingHorizontal: 18 },
  awardsToggleBtnActive: { backgroundColor: COLORS.unisBlue },
  awardsToggleText: { color: COLORS.textGray, fontSize: 13, fontWeight: '600' },
  awardsToggleTextActive: { color: COLORS.textWhite },
  awardFeatured: { borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  awardAmbient: { width: '100%' },
  awardAmbientImg: { opacity: 0.4 },
  awardFeaturedInner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)', padding: 14,
  },
  awardArtworkWrap: { position: 'relative' },
  awardArtwork: {
    width: 64, height: 64, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  awardBadge: {
    position: 'absolute', bottom: -6, right: -6,
    backgroundColor: '#C49A0A', borderRadius: 8, paddingVertical: 2, paddingHorizontal: 6,
  },
  awardBadgeText: { color: '#1a1408', fontSize: 9, fontWeight: '900' },
  awardInfo: { flex: 1, marginLeft: 14 },
  awardInfoTag: {
    color: '#C49A0A', fontSize: 10, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  awardInfoTitle: { color: COLORS.textWhite, fontSize: 16, fontWeight: '800', marginTop: 2 },
  awardInfoMeta: { color: COLORS.textSilver, fontSize: 12, marginTop: 3 },
  awardsSummary: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  awardsSummaryText: { color: COLORS.textSilver, fontSize: 13, fontWeight: '600', marginLeft: 6 },
  awardsScroll: { maxHeight: 320 },
  awardRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12,
    padding: 10, marginBottom: 8,
  },
  awardRowImg: {
    width: 42, height: 42, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.06)',
  },
  awardRowInfo: { flex: 1, marginLeft: 10, paddingRight: 8 },
  awardRowTitle: { color: COLORS.textWhite, fontSize: 13, fontWeight: '700' },
  awardRowMeta: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  awardRowDate: { color: COLORS.textMuted, fontSize: 11 },
  awardsMore: { alignSelf: 'center', marginTop: 6, marginBottom: 4 },

  // Growth checklist
  nextCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14, padding: 14, marginBottom: 10,
  },
  nextCardComplete: { borderWidth: 1, borderColor: 'rgba(34,197,94,0.35)' },
  nextCardText: { flex: 1, paddingRight: 10 },
  nextCardTitle: { color: COLORS.textWhite, fontSize: 14, fontWeight: '700' },
  nextCardBody: { color: COLORS.textGray, fontSize: 12, lineHeight: 17, marginTop: 3 },
  nextCardAction: { flexDirection: 'row', alignItems: 'center' },
  nextCardActionText: {
    color: COLORS.unisBlueBright, fontSize: 12, fontWeight: '700', marginRight: 3,
  },

  // Social links
  socialItem: { marginBottom: 12 },
  socialLabel: { color: COLORS.textSilver, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  socialInput: {
    color: COLORS.textWhite, fontSize: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12,
  },

  // Supported artist
  supportFeature: { borderRadius: 14, overflow: 'hidden' },
  supportMedia: { width: '100%', minHeight: 190, justifyContent: 'flex-end' },
  supportMediaImg: { borderRadius: 14 },
  supportContent: { padding: 16 },
  pending: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1,
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, marginTop: 12,
  },
  pendingText: { color: COLORS.textSilver, fontSize: 12, flex: 1, marginLeft: 6 },
  pendingStrong: { color: COLORS.textWhite, fontWeight: '700' },
  pendingCancel: {
    color: COLORS.unisBlueBright, fontSize: 12, fontWeight: '700',
    textDecorationLine: 'underline', marginLeft: 8,
  },

  // Danger zone
  danger: {
    borderColor: 'rgba(220,53,69,0.35)', borderWidth: 1,
    borderRadius: 16, padding: 18, marginBottom: 24,
  },
  dangerHeading: { color: COLORS.textWhite, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  dangerText: { color: COLORS.textGray, fontSize: 13, lineHeight: 18, marginBottom: 14 },
  dangerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});

export default ArtistDashboardScreen;