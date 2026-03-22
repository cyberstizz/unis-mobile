import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
  Dimensions,
  ActivityIndicator,
  ImageBackground,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ChangePasswordWizard from '../components/Changepasswordwizard';
import { useNavigation } from '@react-navigation/native';
import {
  Upload,
  Play,
  FileText,
  Vote,
  Eye,
  Heart,
  Users,
  X,
  Download,
  Music,
  Trash2,
  Edit3,
  History,
} from 'lucide-react-native';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';

// ── Wizards ──────────────────────────────────────────────────────────────────
import EditProfileWizard from '../components/Editprofilewizard';
import UploadWizard from '../components/Uploadwizard';
import ChangeDefaultSongWizard from '../components/Changedefaultsongwizard';
import EditSongWizard from '../components/Editsongwizard';
import LyricsWizard from '../components/LyricsWizard';
import DeleteAccountWizard from '../components/DeleteAccountWizard';
import DeleteSongModal from '../components/Deletesongmodal';
import DownloadContractButton from '../components/Downloadcontractbutton';

// ============================================================================
// COLORS & SIZES
// ============================================================================
const COLORS = {
  bgBlack: '#000000',
  bgGray900: '#111827',
  bgGray800: '#1f2937',
  borderGray: '#374151',
  textWhite: '#FFFFFF',
  textGray400: '#9ca3af',
  textGray300: '#d1d5db',
  primaryBlue: '#3b82f6',
  primaryBlueHover: '#2563eb',
  red500: '#ef4444',
  green500: '#22c55e',
  purple500: '#a855f7',
  orange500: '#f97316',
  unisBlue: '#163387',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 768;

// ============================================================================
// HELPERS
// ============================================================================
const formatAwardDate = (dateString: string): string => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const getAwardEmoji = (determinationMethod: string): string => {
  switch (determinationMethod) {
    case 'VOTES': return '🏆';
    case 'SCORE': return '⭐';
    case 'SENIORITY': return '👑';
    case 'FALLBACK': return '🎖️';
    default: return '🏅';
  }
};

const getMethodColor = (method: string): string => {
  switch (method) {
    case 'VOTES': return '#28a745';
    case 'SCORE': return '#ffc107';
    case 'SENIORITY': return '#6f42c1';
    default: return '#6c757d';
  }
};

// ============================================================================
// INTERFACES
// ============================================================================
interface Song {
  songId: string;
  title: string;
  playCount?: number;
  plays?: number;
  lyrics?: string;
  artworkUrl?: string;
  description?: string;
  duration?: number;
  isrc?: string;
}

interface Award {
  awardDate: string;
  interval: { name: string };
  jurisdiction: { name: string };
  genre?: { name: string };
  votesCount: number;
  engagementScore: number;
  determinationMethod: string;
}

interface SupportedArtist {
  userId: string;
  username: string;
  photoUrl: string | null;
  defaultSong?: { songId: string; title: string; fileUrl: string | null; artworkUrl?: string | null };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const ArtistDashboardScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { playMedia } = usePlayer();
  const { user, logout } = useAuth();

  // Profile state
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [showChangePassword, setShowChangePassword] = useState(false);

  // Stats
  const [supporters, setSupporters] = useState(0);
  const [followers, setFollowers] = useState(0);
  const [totalPlays, setTotalPlays] = useState(0);
  const [totalVotes, setTotalVotes] = useState(0);

  // Songs
  const [songs, setSongs] = useState<Song[]>([]);
  const [defaultSong, setDefaultSong] = useState<Song | null>(null);
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
  const [songToDelete, setSongToDelete] = useState<Song | null>(null);

  // Supported artist
  const [supportedArtist, setSupportedArtist] = useState<SupportedArtist | null>(null);

  // Awards
  const [awards, setAwards] = useState<Award[]>([]);
  const [awardsPage, setAwardsPage] = useState(0);
  const [hasMoreAwards, setHasMoreAwards] = useState(true);
  const [loadingAwards, setLoadingAwards] = useState(false);

  // Vote history
  const [voteHistory, setVoteHistory] = useState<any[]>([]);

  // UI modals
  const [showWelcomePopup, setShowWelcomePopup] = useState(true);
  const [showVoteHistory, setShowVoteHistory] = useState(false);

  // ── Wizard visibility ──────────────────────────────────────────────────────
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showDefaultSong, setShowDefaultSong] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [lyricsSong, setLyricsSong] = useState<Song | null>(null);

  // Social media editing
  const [instagramUrl, setInstagramUrl] = useState('');
  const [twitterUrl, setTwitterUrl] = useState('');
  const [tiktokUrl, setTiktokUrl] = useState('');

  const fallbackImage = require('../../assets/randomrapper.jpeg');

  // ============================================================================
  // DATA FETCHING
  // ============================================================================
  const fetchSongs = async () => {
    if (!user?.userId) return;
    try {
      const res = await axiosInstance.get(`/v1/media/songs/artist/${user.userId}`);
      setSongs(res.data || []);
    } catch (err) {
      console.error('Failed to fetch songs:', err);
    }
  };

  const refetchDefaultSong = async () => {
    if (!user?.userId) return;
    try {
      const res = await axiosInstance.get(`/v1/users/${user.userId}/default-song`);
      setDefaultSong(res.data);
    } catch {
      setDefaultSong(null);
    }
  };

  const refreshProfile = async () => {
    if (!user?.userId) return;
    try {
      const res = await axiosInstance.get(`/v1/users/profile/${user.userId}`);
      setUserProfile(res.data);
    } catch (err) {
      console.error('Failed to refresh profile:', err);
    }
  };

  useEffect(() => {
    if (!user?.userId) return;

    const fetchAllData = async () => {
      setLoading(true);
      try {
        // FIX: Use Promise.all so setLoading(false) only fires after ALL requests resolve.
        // Previously, .then() chains were fired off without being awaited, causing the
        // finally block to run immediately — a race condition where the screen could
        // flash empty or render with stale data.
        const [profileRes, songsRes, supportersRes, followersRes, voteRes, defaultSongRes, awardsRes] = await Promise.allSettled([
          axiosInstance.get(`/v1/users/profile/${user.userId}`),
          axiosInstance.get(`/v1/media/songs/artist/${user.userId}`),
          axiosInstance.get(`/v1/users/${user.userId}/supporters/count`),
          axiosInstance.get(`/v1/users/${user.userId}/followers/count`),
          axiosInstance.get('/v1/vote/history?limit=50'),
          axiosInstance.get(`/v1/users/${user.userId}/default-song`),
          axiosInstance.get(`/v1/awards/artist/${user.userId}?limit=10&offset=0`),
        ]);

        // 1. Profile
        if (profileRes.status === 'fulfilled') {
          const profileData = profileRes.value.data;
          setUserProfile(profileData);
          setTotalPlays(profileData.totalPlays || 0);
          setTotalVotes(profileData.totalVotes || 0);
          setInstagramUrl(profileData.instagramUrl || '');
          setTwitterUrl(profileData.twitterUrl || '');
          setTiktokUrl(profileData.tiktokUrl || '');

          // Fetch supported artist (depends on profile data)
          if (profileData.supportedArtistId) {
            try {
              const artistRes = await axiosInstance.get(`/v1/users/profile/${profileData.supportedArtistId}`);
              setSupportedArtist(artistRes.data);
            } catch (err) {
              console.error('Failed to fetch supported artist:', err);
            }
          }
        }

        // 2. Songs
        if (songsRes.status === 'fulfilled') {
          setSongs(songsRes.value.data || []);
        }

        // 3. Supporters
        if (supportersRes.status === 'fulfilled') {
          setSupporters(supportersRes.value.data.count || 0);
        }

        // 4. Followers
        if (followersRes.status === 'fulfilled') {
          setFollowers(followersRes.value.data.count || 0);
        }

        // 5. Vote history
        if (voteRes.status === 'fulfilled') {
          setVoteHistory(voteRes.value.data || []);
        }

        // 6. Default song
        if (defaultSongRes.status === 'fulfilled') {
          setDefaultSong(defaultSongRes.value.data);
        }

        // 7. Awards
        if (awardsRes.status === 'fulfilled') {
          const awardsData = awardsRes.value.data || [];
          setAwards(awardsData);
          setHasMoreAwards(awardsData.length === 10);
        }

      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [user?.userId]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  // ── Delete song ──────────────────────────────────────────────────────────────
  const handleDeleteSong = (song: Song) => {
    if (songs.length <= 1) {
      Alert.alert('Cannot Delete', 'You must have at least one song. Upload another before deleting this one.');
      return;
    }
    if (defaultSong?.songId === song.songId) {
      Alert.alert('Cannot Delete', 'This is your featured song. Change your featured song before deleting it.');
      setShowDefaultSong(true);
      return;
    }
    setSongToDelete(song);
  };

  const confirmDeleteSong = async () => {
    if (!songToDelete) return;
    setDeletingSongId(songToDelete.songId);
    try {
      await axiosInstance.delete(`/v1/media/song/${songToDelete.songId}`);
      setSongToDelete(null);
      await fetchSongs();
    } catch (err) {
      console.error('Failed to delete song:', err);
      Alert.alert('Error', 'Failed to delete song. Please try again.');
    } finally {
      setDeletingSongId(null);
    }
  };

  // ── Social media ─────────────────────────────────────────────────────────────
  const handleSaveSocialMedia = async (platform: string, url: string) => {
    try {
      await axiosInstance.put(`/v1/users/profile/${user!.userId}`, {
        [`${platform}Url`]: url,
      });
      await refreshProfile();
    } catch (err) {
      console.error('Failed to update social media:', err);
      Alert.alert('Error', 'Failed to update link');
    }
  };

  // ── Play supported artist ────────────────────────────────────────────────────
  const handlePlaySupportedArtist = async () => {
    if (!supportedArtist?.defaultSong) {
      Alert.alert('No Song', 'This artist has not set a featured song yet.');
      return;
    }
    const song = supportedArtist.defaultSong;
    const songId = (song as any).songId || (song as any).id;
    const songUrl = getMediaUrl(song.fileUrl);
    const artworkUrl = getMediaUrl(song.artworkUrl) || getMediaUrl(supportedArtist.photoUrl);
    if (!songUrl) return;
    playMedia({ type: 'song', url: songUrl, title: song.title, artist: supportedArtist.username, artwork: artworkUrl } as any, []);
    if (songId && user?.userId) {
      try {
        await axiosInstance.post(`/v1/media/song/${songId}/play?userId=${user.userId}`);
      } catch (err) {
        console.error('Failed to track play:', err);
      }
    }
  };

  // ── Load more awards ─────────────────────────────────────────────────────────
  const loadMoreAwards = async () => {
    setLoadingAwards(true);
    try {
      const nextPage = awardsPage + 1;
      const res = await axiosInstance.get(`/v1/awards/artist/${user!.userId}?limit=10&offset=${nextPage * 10}`);
      const newAwards = res.data || [];
      setAwards(prev => [...prev, ...newAwards]);
      setAwardsPage(nextPage);
      setHasMoreAwards(newAwards.length === 10);
    } catch (err) {
      console.error('Failed to load more awards:', err);
    } finally {
      setLoadingAwards(false);
    }
  };

  // ============================================================================
  // LOADING / GUARD
  // ============================================================================
  if (loading) {
    return (
      <ImageBackground source={fallbackImage} style={styles.backgroundImage} blurRadius={20}>
        <LinearGradient colors={['rgba(0,0,0,0.8)', COLORS.bgBlack]} style={styles.gradientOverlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primaryBlue} />
            <Text style={styles.loadingText}>Loading dashboard...</Text>
          </View>
        </LinearGradient>
      </ImageBackground>
    );
  }

  if (!userProfile) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Please log in to view dashboard.</Text>
      </View>
    );
  }

  const displayPhoto = userProfile.photoUrl
    ? { uri: getMediaUrl(userProfile.photoUrl) }
    : fallbackImage;

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <ImageBackground source={fallbackImage} style={styles.backgroundImage} blurRadius={20}>
      <LinearGradient colors={['rgba(0,0,0,0.8)', COLORS.bgBlack]} style={styles.gradientOverlay}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

          {/* ── Welcome Popup ── */}
          <Modal visible={showWelcomePopup} transparent animationType="fade">
            <Pressable style={styles.popupOverlay} onPress={() => setShowWelcomePopup(false)}>
              <View style={styles.welcomePopup}>
                <TouchableOpacity style={styles.closeButton} onPress={() => setShowWelcomePopup(false)}>
                  <X size={24} color={COLORS.textGray400} />
                </TouchableOpacity>
                <View style={styles.popupContent}>
                  <View style={styles.iconCircle}>
                    <Heart size={40} color={COLORS.textWhite} fill={COLORS.textWhite} />
                  </View>
                  <Text style={styles.popupTitle}>Thank You!</Text>
                  <Text style={styles.popupText}>
                    Your contribution to the UNIS community makes us stronger. Keep creating!
                  </Text>
                </View>
                <TouchableOpacity style={styles.welcomeButton} onPress={() => setShowWelcomePopup(false)}>
                  <Text style={styles.welcomeButtonText}>You're Welcome</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Modal>

          {/* ── Profile Section ── */}
          <View style={styles.card}>
            <View style={styles.profileContent}>
              <Image source={displayPhoto} style={styles.profileImage} />
              <View style={styles.profileInfo}>
                <Text style={styles.artistName}>{userProfile.username || 'Artist'}</Text>
                <Text style={styles.artistBio}>
                  {userProfile.bio || 'No bio yet. Click Edit to add one.'}
                </Text>
                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={() => setShowEditProfile(true)}
                >
                  <Text style={styles.btnPrimaryText}>Edit Profile</Text>
                </TouchableOpacity>
                <DownloadContractButton
                  artistName={userProfile.username || 'Artist'}
                  style={styles.downloadContractBtn}
                />
              </View>
            </View>
          </View>

          {/* ── Stats Grid ── */}
          <View style={styles.statsGrid}>
            {[
              { label: 'Score', value: (userProfile.score || 0).toLocaleString(), icon: <Eye size={24} color={COLORS.primaryBlue} />, bg: styles.statIconBlue },
              { label: 'Supporters', value: supporters.toLocaleString(), icon: <Users size={24} color={COLORS.purple500} />, bg: styles.statIconPurple },
              { label: 'Followers', value: followers.toLocaleString(), icon: <Heart size={24} color={COLORS.green500} />, bg: styles.statIconGreen },
              { label: 'Plays', value: totalPlays.toLocaleString(), icon: <Play size={24} color={COLORS.red500} />, bg: styles.statIconRed },
              { label: 'Songs', value: songs.length.toString(), icon: <Music size={24} color={COLORS.orange500} />, bg: styles.statIconOrange },
              { label: 'Votes', value: totalVotes.toLocaleString(), icon: <Vote size={24} color={COLORS.bgBlack} />, bg: styles.statIconGray },
            ].map(({ label, value, icon, bg }) => (
              <View key={label} style={styles.statCard}>
                <View style={styles.statContent}>
                  <View style={styles.statInfo}>
                    <Text style={styles.statLabel}>{label}</Text>
                    <Text style={styles.statValue}>{value}</Text>
                  </View>
                  <View style={[styles.statIcon, bg]}>{icon}</View>
                </View>
              </View>
            ))}
          </View>

          {/* ── Featured Song ── */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Featured Song</Text>
              <TouchableOpacity onPress={() => setShowDefaultSong(true)}>
                <Text style={styles.linkButton}>Change Featured</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.mainSongCard}>
              <View style={styles.songIcon}>
                <Play size={28} color={COLORS.textWhite} fill={COLORS.textWhite} />
              </View>
              <View style={styles.songInfo}>
                <Text style={styles.songTitle}>{defaultSong?.title || 'No featured song set'}</Text>
                {defaultSong && (
                  <View style={styles.songStats}>
                    <Eye size={14} color={COLORS.textGray400} />
                    <Text style={styles.songStatsText}>{(defaultSong as any).playCount || 0} plays</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* ── Songs Section ── */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Play size={20} color={COLORS.primaryBlue} />
                <Text style={styles.sectionTitleBlue}>Songs</Text>
              </View>
              <TouchableOpacity style={styles.btnPrimarySmall} onPress={() => setShowUpload(true)}>
                <Upload size={16} color={COLORS.textWhite} />
                <Text style={styles.btnPrimarySmallText}>Upload</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.contentList}>
              {songs.length > 0 ? (
                songs.map((song, index) => (
                  <View key={song.songId || index} style={styles.contentItem}>
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemTitle}>{song.title}</Text>
                      <View style={styles.itemActions}>
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => setEditingSong(song)}
                        >
                          <Edit3 size={16} color={COLORS.textGray400} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => setLyricsSong(song)}
                        >
                          <FileText size={16} color={COLORS.textGray400} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => handleDeleteSong(song)}
                          disabled={deletingSongId === song.songId}
                        >
                          {deletingSongId === song.songId
                            ? <ActivityIndicator size="small" color={COLORS.textGray400} />
                            : <Trash2 size={16} color={COLORS.textGray400} />
                          }
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.itemStats}>
                      <Play size={12} color={COLORS.textGray400} />
                      <Text style={styles.itemStatsText}>{song.playCount || song.plays || 0} plays</Text>
                    </View>
                    {song.isrc ? (
                    <Text style={{ color: '#A9A9A9', fontSize: 12, marginTop: 4 }}>
                      ISRC: {song.isrc.length === 12
                        ? `${song.isrc.slice(0,2)}-${song.isrc.slice(2,5)}-${song.isrc.slice(5,7)}-${song.isrc.slice(7)}`
                        : song.isrc}
                    </Text>
                  ) : (
                    <Text style={{ color: '#f59e0b', fontSize: 11, marginTop: 4 }}>
                      No ISRC
                    </Text>
                  )}
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No songs yet — upload your first!</Text>
              )}
            </View>
          </View>

          {/* ── Social Media ── */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Social Media Links</Text>
            </View>
            <View style={styles.socialLinksEdit}>
              {[
                { label: '📷 Instagram', value: instagramUrl, setter: setInstagramUrl, platform: 'instagram', placeholder: 'https://instagram.com/yourprofile' },
                { label: '𝕏 Twitter / X', value: twitterUrl, setter: setTwitterUrl, platform: 'twitter', placeholder: 'https://twitter.com/yourprofile' },
                { label: '🎵 TikTok', value: tiktokUrl, setter: setTiktokUrl, platform: 'tiktok', placeholder: 'https://tiktok.com/@yourprofile' },
              ].map(({ label, value, setter, platform, placeholder }) => (
                <View key={platform} style={styles.socialLinkItem}>
                  <Text style={styles.socialLabel}>{label}</Text>
                  <TextInput
                    style={styles.socialInput}
                    placeholder={placeholder}
                    placeholderTextColor={COLORS.textGray400}
                    value={value}
                    onChangeText={setter}
                    onBlur={() => handleSaveSocialMedia(platform, value)}
                  />
                </View>
              ))}
            </View>
          </View>

          {/* ── Supported Artist ── */}
          {supportedArtist && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Heart size={20} color={COLORS.primaryBlue} />
                  <Text style={styles.sectionTitleBlue}>I Support</Text>
                </View>
              </View>
              <View style={styles.supportedArtistCard}>
                <Image
                  source={supportedArtist.photoUrl ? { uri: getMediaUrl(supportedArtist.photoUrl) } : fallbackImage}
                  style={styles.supportedArtistPhoto}
                />
                <View style={styles.supportedArtistInfo}>
                  <Text style={styles.supportedArtistName}>{supportedArtist.username}</Text>
                  {supportedArtist.defaultSong ? (
                    <View style={styles.supportedSongRow}>
                      <Music size={12} color={COLORS.textGray400} />
                      <Text style={styles.supportedSongTitle}>{supportedArtist.defaultSong.title}</Text>
                      <TouchableOpacity style={styles.playSmallButton} onPress={handlePlaySupportedArtist}>
                        <Play size={14} color={COLORS.textWhite} fill={COLORS.textWhite} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.noSongText}>No featured song set</Text>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* ── Vote History ── */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <History size={20} color={COLORS.primaryBlue} />
                <Text style={styles.sectionTitleBlue}>Vote History</Text>
              </View>
              <TouchableOpacity style={styles.btnSecondarySmall} onPress={() => setShowVoteHistory(true)}>
                <Text style={styles.btnSecondarySmallText}>View Full History</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.voteHistoryContent}>
              <Text style={styles.voteCountBig}>{voteHistory.length}</Text>
              <Text style={styles.voteCountLabel}>Total Votes Cast</Text>
              <Text style={styles.voteHistoryHint}>
                {voteHistory.length > 0
                  ? 'Keep voting to support the best talent!'
                  : 'No votes yet. Go explore and support your favorites!'}
              </Text>
            </View>
          </View>

          {/* ── Awards ── */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🏆 Awards Won</Text>
            </View>
            <View style={styles.contentList}>
              {awards.length > 0 ? (
                <>
                  {awards.map((award, index) => (
                    <View key={index} style={styles.awardItem}>
                      <View style={styles.awardHeader}>
                        <View style={styles.awardTitleRow}>
                          <Text style={styles.awardEmoji}>{getAwardEmoji(award.determinationMethod)}</Text>
                          <View>
                            <Text style={styles.awardTitle}>{award.interval?.name || 'Award'} Winner</Text>
                            <Text style={styles.awardSubtitle}>
                              {award.jurisdiction?.name || 'Location'}
                              {award.genre?.name && ` • ${award.genre.name}`}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.awardDate}>{formatAwardDate(award.awardDate)}</Text>
                      </View>
                      <View style={styles.awardStats}>
                        <Text style={styles.awardVotes}>{award.votesCount || 0} votes</Text>
                        <Text style={styles.awardDot}>•</Text>
                        <Text style={styles.awardScore}>{award.engagementScore || 0} score</Text>
                        {award.determinationMethod && (
                          <>
                            <Text style={styles.awardDot}>•</Text>
                            <Text style={[styles.awardMethod, { color: getMethodColor(award.determinationMethod) }]}>
                              Won by {award.determinationMethod.toLowerCase()}
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                  ))}
                  {hasMoreAwards && (
                    <TouchableOpacity style={styles.loadMoreButton} onPress={loadMoreAwards} disabled={loadingAwards}>
                      <Text style={styles.loadMoreButtonText}>
                        {loadingAwards ? 'Loading...' : 'Load More'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <View style={styles.noAwardsContainer}>
                  <Text style={styles.noAwardsEmoji}>🏆</Text>
                  <Text style={styles.noAwardsTitle}>No awards yet</Text>
                  <Text style={styles.noAwardsText}>
                    Keep creating and engaging with your audience to earn awards!
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Danger Zone ── */}
          <View style={styles.dangerZone}>
            <Text style={styles.dangerTitle}>Danger Zone</Text>
            <Text style={styles.dangerText}>Once you delete your account, there is no going back.</Text>
            <TouchableOpacity
              style={styles.changePasswordButton}
              onPress={() => setShowChangePassword(true)}
            >
              <Text style={styles.changePasswordButtonText}>Change Password</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteAccountButton}
              onPress={() => setShowDeleteAccount(true)}
            >
              <Text style={styles.deleteAccountButtonText}>Delete Account</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* ── Vote History Modal ── */}
        <Modal visible={showVoteHistory} transparent animationType="slide">
          <Pressable style={styles.modalOverlay} onPress={() => setShowVoteHistory(false)}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Vote History</Text>
                <TouchableOpacity onPress={() => setShowVoteHistory(false)}>
                  <X size={24} color={COLORS.textGray400} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody}>
                {voteHistory.length > 0 ? (
                  voteHistory.map((vote: any, index: number) => (
                    <View key={vote.id || index} style={styles.voteHistoryItem}>
                      <Text style={styles.voteHistoryName}>{vote.targetName}</Text>
                      <Text style={styles.voteHistoryType}>{vote.targetType}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No votes yet</Text>
                )}
              </ScrollView>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowVoteHistory(false)}>
                <Text style={styles.modalCloseButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>

        {/* ── EditProfileWizard ── */}
        <EditProfileWizard
          visible={showEditProfile}
          onClose={() => setShowEditProfile(false)}
          onSuccess={() => {
            refreshProfile();
            setShowEditProfile(false);
          }}
          user={{
            userId: user!.userId,
            username: userProfile.username,
            bio: userProfile.bio,
            photoUrl: userProfile.photoUrl,
          }}
          isArtist
        />

        {/* ── UploadWizard ── */}
        <UploadWizard
          visible={showUpload}
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            fetchSongs();
            setShowUpload(false);
          }}
          userId={user!.userId}
          defaultGenreId={userProfile.genreId}
          defaultJurisdictionId={userProfile.jurisdiction?.jurisdictionId}
        />

        {/* ── ChangeDefaultSongWizard ── */}
        <ChangeDefaultSongWizard
          visible={showDefaultSong}
          onClose={() => setShowDefaultSong(false)}
          onSuccess={() => {
            refetchDefaultSong();
            setShowDefaultSong(false);
          }}
          userId={user!.userId}
          songs={songs}
          currentDefaultSongId={defaultSong?.songId}
        />

        {/* ── EditSongWizard ── */}
        <EditSongWizard
          visible={!!editingSong}
          onClose={() => setEditingSong(null)}
          onSuccess={() => {
            fetchSongs();
            setEditingSong(null);
          }}
          song={editingSong}
        />

        {/* ── LyricsWizard ── */}
        <LyricsWizard
          visible={!!lyricsSong}
          onClose={() => setLyricsSong(null)}
          onSuccess={() => {
            fetchSongs();
            setLyricsSong(null);
          }}
          song={lyricsSong}
        />

        {/* ── DeleteAccountWizard ── */}
        <DeleteAccountWizard
          visible={showDeleteAccount}
          onClose={() => setShowDeleteAccount(false)}
        />

        {/* ── DeleteSongModal ── */}
        <DeleteSongModal
          visible={!!songToDelete}
          songTitle={songToDelete?.title}
          onConfirm={confirmDeleteSong}
          onCancel={() => setSongToDelete(null)}
          isDeleting={!!deletingSongId}
        />

        {/* ── ChangePasswordWizard ── */}
        <ChangePasswordWizard
          visible={showChangePassword}
          onClose={() => setShowChangePassword(false)}
        />

      </LinearGradient>
    </ImageBackground>
  );
};

// ============================================================================
// STYLES — identical to original, one addition for DownloadContractButton
// ============================================================================
const styles = StyleSheet.create({
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  gradientOverlay: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: IS_MOBILE ? 20 : 40, paddingHorizontal: IS_MOBILE ? 12 : 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bgBlack },
  loadingText: { color: COLORS.textGray400, marginTop: 16, fontSize: 16 },
  card: { backgroundColor: COLORS.bgGray900, borderWidth: 1, borderColor: COLORS.borderGray, borderRadius: 8, padding: IS_MOBILE ? 16 : 24, marginBottom: 20 },
  profileContent: { flexDirection: IS_MOBILE ? 'column' : 'row', alignItems: 'center', gap: IS_MOBILE ? 16 : 24 },
  profileImage: { width: IS_MOBILE ? 100 : 128, height: IS_MOBILE ? 100 : 128, borderRadius: 8, borderWidth: 1, borderColor: '#FFD700' },
  profileInfo: { flex: 1, alignItems: IS_MOBILE ? 'center' : 'flex-start' },
  artistName: { fontSize: IS_MOBILE ? 20 : 24, fontWeight: '700', color: COLORS.textWhite, marginBottom: 8 },
  artistBio: { color: COLORS.textGray400, fontSize: 14, marginBottom: 16, textAlign: IS_MOBILE ? 'center' : 'left' },
  downloadContractBtn: { marginTop: 8, alignSelf: IS_MOBILE ? 'center' : 'flex-start' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  statCard: { backgroundColor: COLORS.bgGray900, borderWidth: 1, borderColor: COLORS.borderGray, borderRadius: 8, padding: 16, width: IS_MOBILE ? '48%' : '31%' },
  statContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statInfo: {},
  statLabel: { color: COLORS.textGray400, fontSize: 12, marginBottom: 4 },
  statValue: { fontSize: 24, fontWeight: '700', color: COLORS.textWhite },
  statIcon: { padding: 10, borderRadius: 8 },
  statIconBlue: { backgroundColor: 'rgba(59, 130, 246, 0.2)' },
  statIconPurple: { backgroundColor: 'rgba(168, 85, 247, 0.2)' },
  statIconGreen: { backgroundColor: 'rgba(34, 197, 94, 0.2)' },
  statIconRed: { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
  statIconOrange: { backgroundColor: 'rgba(249, 115, 22, 0.2)' },
  statIconGray: { backgroundColor: 'rgba(156, 163, 175, 0.3)' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textWhite },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitleBlue: { fontSize: 18, fontWeight: '700', color: COLORS.primaryBlue },
  linkButton: { color: COLORS.primaryBlue, fontWeight: '600', fontSize: 14 },
  mainSongCard: { backgroundColor: COLORS.bgGray800, borderRadius: 8, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16 },
  songIcon: { width: 56, height: 56, backgroundColor: COLORS.primaryBlue, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  songInfo: { flex: 1 },
  songTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textWhite, marginBottom: 4 },
  songStats: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  songStatsText: { fontSize: 14, color: COLORS.textGray400 },
  contentList: { gap: 12 },
  contentItem: { backgroundColor: COLORS.bgGray800, borderRadius: 8, padding: 16 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: COLORS.textWhite, flex: 1 },
  itemActions: { flexDirection: 'row', gap: 12 },
  actionButton: { padding: 4 },
  itemStats: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemStatsText: { fontSize: 13, color: COLORS.textGray400 },
  emptyText: { color: COLORS.textGray400, fontSize: 14, textAlign: 'center', padding: 20 },
  socialLinksEdit: { gap: 16 },
  socialLinkItem: { gap: 8 },
  socialLabel: { fontSize: 14, fontWeight: '600', color: COLORS.textGray400 },
  socialInput: { backgroundColor: COLORS.bgGray800, borderWidth: 1, borderColor: COLORS.borderGray, borderRadius: 8, padding: 12, color: COLORS.textWhite, fontSize: 14 },
  supportedArtistCard: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 12 },
  supportedArtistPhoto: { width: 70, height: 70, borderRadius: 35 },
  supportedArtistInfo: { flex: 1 },
  supportedArtistName: { fontSize: 16, fontWeight: '600', color: COLORS.textGray300 },
  supportedSongRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  supportedSongTitle: { fontSize: 14, color: COLORS.textGray400, flex: 1 },
  playSmallButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.textGray400, borderRadius: 20, padding: 6 },
  noSongText: { fontSize: 13, color: '#777', fontStyle: 'italic', marginTop: 6 },
  voteHistoryContent: { padding: 16, alignItems: 'center' },
  voteCountBig: { fontSize: 36, fontWeight: '700', color: COLORS.unisBlue },
  voteCountLabel: { color: COLORS.textGray400, fontSize: 14, marginVertical: 8 },
  voteHistoryHint: { color: '#777', fontSize: 13, textAlign: 'center' },
  awardItem: { backgroundColor: 'rgba(22, 51, 135, 0.1)', borderLeftWidth: 4, borderLeftColor: COLORS.unisBlue, borderRadius: 8, padding: 16 },
  awardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  awardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  awardEmoji: { fontSize: 24 },
  awardTitle: { fontSize: 15, fontWeight: '600', color: COLORS.textGray300 },
  awardSubtitle: { fontSize: 13, color: COLORS.textGray400, marginTop: 2 },
  awardDate: { fontSize: 13, color: '#888' },
  awardStats: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  awardVotes: { color: COLORS.unisBlue, fontWeight: '600', fontSize: 13 },
  awardDot: { color: '#666' },
  awardScore: { color: '#888', fontSize: 13 },
  awardMethod: { fontSize: 12, fontWeight: '500' },
  loadMoreButton: { alignItems: 'center', padding: 16 },
  loadMoreButtonText: { color: COLORS.primaryBlue, fontWeight: '600' },
  noAwardsContainer: { padding: 30, alignItems: 'center' },
  noAwardsEmoji: { fontSize: 48, marginBottom: 12 },
  noAwardsTitle: { fontSize: 16, color: '#777', marginBottom: 8 },
  noAwardsText: { fontSize: 14, color: '#888', textAlign: 'center' },
  dangerZone: { backgroundColor: COLORS.bgGray900, borderWidth: 2, borderColor: COLORS.red500, borderRadius: 8, padding: 24, alignItems: 'center', marginTop: 20 },
  dangerTitle: { color: COLORS.red500, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  dangerText: { color: '#721c24', fontSize: 14, marginBottom: 16, textAlign: 'center' },
  deleteAccountButton: { backgroundColor: COLORS.red500, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  deleteAccountButtonText: { color: COLORS.textWhite, fontWeight: '600' },
  btnPrimary: { backgroundColor: COLORS.primaryBlue, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, marginBottom: 12 },
  btnPrimaryText: { color: COLORS.textWhite, fontWeight: '600', textAlign: 'center' },
  btnSecondary: { backgroundColor: COLORS.bgGray800, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnSecondaryText: { color: COLORS.textWhite, fontSize: 13 },
  btnPrimarySmall: { backgroundColor: COLORS.primaryBlue, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  btnPrimarySmallText: { color: COLORS.textWhite, fontSize: 13, fontWeight: '600' },
  btnSecondarySmall: { backgroundColor: COLORS.bgGray800, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  btnSecondarySmallText: { color: COLORS.textWhite, fontSize: 12 },
  popupOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)', justifyContent: 'center', alignItems: 'center' },
  welcomePopup: { backgroundColor: COLORS.bgGray900, borderWidth: 1, borderColor: COLORS.primaryBlue, borderRadius: 12, padding: 24, width: '85%', maxWidth: 400, alignItems: 'center' },
  closeButton: { position: 'absolute', top: 12, right: 12 },
  popupContent: { alignItems: 'center', marginBottom: 20 },
  iconCircle: { width: 80, height: 80, backgroundColor: COLORS.primaryBlue, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  popupTitle: { fontSize: 24, fontWeight: '700', color: COLORS.textWhite, marginBottom: 12 },
  popupText: { color: COLORS.textGray300, fontSize: 16, textAlign: 'center' },
  welcomeButton: { backgroundColor: COLORS.primaryBlue, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 8 },
  welcomeButtonText: { color: COLORS.textWhite, fontWeight: '600', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.bgGray900, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.borderGray },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textWhite },
  modalBody: { maxHeight: 300 },
  modalCloseButton: { backgroundColor: COLORS.primaryBlue, paddingVertical: 12, borderRadius: 8, marginTop: 16, alignItems: 'center' },
  modalCloseButtonText: { color: COLORS.textWhite, fontWeight: '600' },
  voteHistoryItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderGray },
  voteHistoryName: { color: COLORS.textWhite, fontSize: 15 },
  voteHistoryType: { color: COLORS.textGray400, fontSize: 13, textTransform: 'capitalize' },
  changePasswordButton: {
  backgroundColor: COLORS.bgGray800,
  borderWidth: 1,
  borderColor: COLORS.borderGray,
  paddingVertical: 12,
  paddingHorizontal: 24,
  borderRadius: 8,
  marginBottom: 12,
},
changePasswordButtonText: {
  color: COLORS.textWhite,
  fontWeight: '600',
  textAlign: 'center',
},
});

export default ArtistDashboardScreen;