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
import { useNavigation } from '@react-navigation/native';
import {
  Play,
  Heart,
  Edit3,
  Trash2,
  User,
  Music,
  History,
} from 'lucide-react-native';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';

// ── Wizards (exact filenames from repo) ──────────────────────────────────────
import Editprofilewizard from '../components/Editprofilewizard';
import DeleteAccountWizard from '../components/DeleteAccountWizard';

// ============================================================================
// COLORS & SIZES
// ============================================================================
const COLORS = {
  bgBlack: '#000000',
  cardBg: 'rgba(255, 255, 255, 0.03)',
  cardBgHover: 'rgba(255, 255, 255, 0.05)',
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  textWhite: '#FFFFFF',
  textSilver: '#CCCCCC',
  textGray: '#AAAAAA',
  textMuted: '#888888',
  unisBlue: '#004aad',
  unisBlueBright: '#4a9eff',
  dangerRed: '#dc3545',
  dangerRedHover: '#c82333',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 768;

// ============================================================================
// INTERFACES
// ============================================================================
interface UserProfile {
  userId: string;
  username: string;
  bio?: string;
  photoUrl: string | null;
  score?: number;
  level?: string;
  supportedArtistId?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  tiktokUrl?: string;
}

interface SupportedArtist {
  userId: string;
  username: string;
  photoUrl: string | null;
  defaultSong?: {
    songId: string;
    title: string;
    fileUrl: string | null;
    artworkUrl: string | null;
  };
}

interface VoteHistoryItem {
  id: number;
  targetName: string;
  targetType: string;
  createdAt: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { playMedia } = usePlayer();
  const { user } = useAuth();

  // State
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [supportedArtist, setSupportedArtist] = useState<SupportedArtist | null>(null);
  const [voteHistory, setVoteHistory] = useState<VoteHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Social media
  const [instagramUrl, setInstagramUrl] = useState('');
  const [twitterUrl, setTwitterUrl] = useState('');
  const [tiktokUrl, setTiktokUrl] = useState('');

  // Modals
  const [showVoteHistory, setShowVoteHistory] = useState(false);

  // Wizard visibility
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  const fallbackImage = require('../../assets/randomrapper.jpeg');

  // ============================================================================
  // DATA FETCHING
  // ============================================================================
  const refreshProfile = async () => {
    if (!user?.userId) return;
    try {
      const res = await axiosInstance.get(`/v1/users/profile/${user.userId}`);
      setUserProfile(res.data);
      setInstagramUrl(res.data.instagramUrl || '');
      setTwitterUrl(res.data.twitterUrl || '');
      setTiktokUrl(res.data.tiktokUrl || '');
    } catch (err) {
      console.error('Failed to refresh profile:', err);
    }
  };

  useEffect(() => {
    if (!user?.userId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Profile
        axiosInstance.get(`/v1/users/profile/${user.userId}`)
          .then(res => {
            setUserProfile(res.data);
            setInstagramUrl(res.data.instagramUrl || '');
            setTwitterUrl(res.data.twitterUrl || '');
            setTiktokUrl(res.data.tiktokUrl || '');
            // 2. Supported artist (chained)
            if (res.data.supportedArtistId) {
              axiosInstance.get(`/v1/users/profile/${res.data.supportedArtistId}`)
                .then(artistRes => setSupportedArtist(artistRes.data))
                .catch(err => console.error('Failed to fetch supported artist:', err));
            }
          })
          .catch(err => console.error('Failed to fetch profile:', err));

        // 3. Vote history
        axiosInstance.get('/v1/vote/history?limit=50')
          .then(res => setVoteHistory(res.data || []))
          .catch(err => console.error('Failed to fetch vote history:', err));

      } catch (err) {
        console.error('Failed to load profile data:', err);
      } finally {
        setTimeout(() => setLoading(false), 600);
      }
    };

    fetchData();
  }, [user?.userId]);

  // ============================================================================
  // HANDLERS
  // ============================================================================
  const handleSaveSocialMedia = async (platform: string, url: string) => {
    try {
      await axiosInstance.put(`/v1/users/profile/${user!.userId}`, {
        [`${platform}Url`]: url,
      });
      await refreshProfile();
    } catch (err) {
      console.error('Failed to update social media:', err);
      Alert.alert('Error', 'Failed to update link. Please try again.');
    }
  };

  const handlePlaySupportedArtist = async () => {
    if (!supportedArtist?.defaultSong) {
      Alert.alert('No Song', 'This artist has not set a featured song yet.');
      return;
    }
    const song = supportedArtist.defaultSong;
    const songId = (song as any).songId || (song as any).id;
    const songUrl = getMediaUrl(song.fileUrl);
    const artworkUrl = getMediaUrl(song.artworkUrl) || getMediaUrl(supportedArtist.photoUrl);
    if (!songUrl) { Alert.alert('Unavailable', 'Song file not available.'); return; }
    playMedia(
      { type: 'song', url: songUrl, title: song.title, artist: supportedArtist.username, artwork: artworkUrl } as any,
      []
    );
    if (songId && user?.userId) {
      try {
        await axiosInstance.post(`/v1/media/song/${songId}/play?userId=${user.userId}`);
      } catch (err) {
        console.error('Failed to track play:', err);
      }
    }
  };

  const handleViewArtist = () => {
    if (supportedArtist) {
      navigation.navigate('Artist', { artistId: supportedArtist.userId });
    }
  };

  // ============================================================================
  // LOADING STATE
  // ============================================================================
  if (loading) {
    return (
      <ImageBackground source={fallbackImage} style={styles.backgroundImage} blurRadius={20}>
        <LinearGradient colors={['rgba(0,0,0,0.8)', COLORS.bgBlack]} style={styles.gradientOverlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.unisBlue} />
            <Text style={styles.loadingText}>Loading your profile...</Text>
          </View>
        </LinearGradient>
      </ImageBackground>
    );
  }

  if (!userProfile) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Please log in to view your profile.</Text>
      </View>
    );
  }

  const displayPhoto = userProfile.photoUrl
    ? { uri: getMediaUrl(userProfile.photoUrl) }
    : fallbackImage;

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  return (
    <ImageBackground source={fallbackImage} style={styles.backgroundImage} blurRadius={20}>
      <LinearGradient colors={['rgba(0,0,0,0.8)', COLORS.bgBlack]} style={styles.gradientOverlay}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

          {/* ── Profile Header ── */}
          <View style={styles.card}>
            <View style={styles.profileHeader}>
              <Image source={displayPhoto} style={styles.profileImage} />
              <Text style={styles.profileName}>{userProfile.username}</Text>
              <Text style={styles.profileBio}>
                {userProfile.bio || 'No bio yet — tell Harlem who you are!'}
              </Text>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setShowEditProfile(true)}
              >
                <Edit3 size={16} color={COLORS.textWhite} />
                <Text style={styles.editButtonText}>Edit Profile</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Supported Artist ── */}
          {supportedArtist && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Heart size={20} color={COLORS.unisBlue} />
                <Text style={styles.sectionTitle}>I Support</Text>
              </View>
              <View style={styles.supportedArtistCard}>
                <TouchableOpacity onPress={handleViewArtist}>
                  <Image
                    source={supportedArtist.photoUrl ? { uri: getMediaUrl(supportedArtist.photoUrl) } : fallbackImage}
                    style={styles.artistPhoto}
                  />
                </TouchableOpacity>
                <View style={styles.artistInfo}>
                  <TouchableOpacity onPress={handleViewArtist}>
                    <Text style={styles.artistName}>{supportedArtist.username}</Text>
                  </TouchableOpacity>
                  {supportedArtist.defaultSong ? (
                    <View style={styles.defaultSongSection}>
                      <View style={styles.songDetails}>
                        <Music size={16} color={COLORS.unisBlue} />
                        <View style={styles.songText}>
                          <Text style={styles.songTitle}>{supportedArtist.defaultSong.title}</Text>
                          <Text style={styles.songLabel}>Featured Track</Text>
                        </View>
                      </View>
                      <TouchableOpacity style={styles.playButton} onPress={handlePlaySupportedArtist}>
                        <Play size={20} color={COLORS.textWhite} fill={COLORS.textWhite} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.noSongText}>No featured song set</Text>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* ── Stats Grid ── */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Music size={28} color={COLORS.unisBlue} />
              <Text style={styles.statLabel}>Score</Text>
              <Text style={styles.statValue}>{(userProfile.score || 0).toLocaleString()}</Text>
            </View>
            <View style={styles.statCard}>
              <User size={28} color={COLORS.unisBlue} />
              <Text style={styles.statLabel}>Level</Text>
              <Text style={styles.statValue}>{userProfile.level || 'Silver'}</Text>
            </View>
            <View style={styles.statCard}>
              <Heart size={28} color={COLORS.unisBlue} />
              <Text style={styles.statLabel}>Total Votes</Text>
              <Text style={styles.statValue}>{voteHistory.length}</Text>
            </View>
          </View>

          {/* ── Vote History ── */}
          <View style={styles.card}>
            <View style={styles.voteHistoryHeader}>
              <View style={styles.sectionHeader}>
                <History size={20} color={COLORS.unisBlue} />
                <Text style={styles.sectionTitle}>Vote History</Text>
              </View>
              <TouchableOpacity style={styles.viewAllButton} onPress={() => setShowVoteHistory(true)}>
                <Text style={styles.viewAllButtonText}>View All</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.voteSummary}>
              <View style={styles.voteStatBox}>
                <Text style={styles.voteCount}>{voteHistory.length}</Text>
                <Text style={styles.voteLabel}>Total Votes</Text>
              </View>
              <Text style={styles.voteCta}>
                {voteHistory.length > 0
                  ? 'See your complete voting history'
                  : 'No votes yet — go support your favorites!'}
              </Text>
            </View>
            {/* Recent 3 preview */}
            {voteHistory.length > 0 && (
              <View style={styles.recentVotes}>
                <Text style={styles.recentVotesLabel}>Recent</Text>
                {voteHistory.slice(0, 3).map((vote, index) => (
                  <View key={vote.id || index} style={styles.votePreviewItem}>
                    <Text style={styles.votePreviewName} numberOfLines={1}>{vote.targetName}</Text>
                    <Text style={styles.votePreviewType}>{vote.targetType}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ── Social Media Links ── */}
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
                    placeholderTextColor={COLORS.textMuted}
                    value={value}
                    onChangeText={setter}
                    onBlur={() => handleSaveSocialMedia(platform, value)}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                </View>
              ))}
            </View>
          </View>

          {/* ── Danger Zone ── */}
          <View style={styles.dangerZone}>
            <View style={styles.dangerContent}>
              <Text style={styles.dangerTitle}>Danger Zone</Text>
              <Text style={styles.dangerText}>This cannot be undone.</Text>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => setShowDeleteAccount(true)}
              >
                <Trash2 size={16} color={COLORS.textWhite} />
                <Text style={styles.deleteButtonText}>Delete Account</Text>
              </TouchableOpacity>
            </View>
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
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody}>
                {voteHistory.length > 0 ? (
                  voteHistory.map((vote, index) => (
                    <View key={vote.id || index} style={styles.voteItem}>
                      <View style={styles.voteInfo}>
                        <Text style={styles.voteTargetName}>{vote.targetName}</Text>
                        <Text style={styles.voteTargetType}>{vote.targetType}</Text>
                      </View>
                      <Text style={styles.voteDate}>{vote.createdAt}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No votes yet — go support your favorites!</Text>
                )}
              </ScrollView>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowVoteHistory(false)}>
                <Text style={styles.modalCloseButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>

        {/* ── EditProfileWizard ── */}
        <Editprofilewizard
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
          isArtist={false}
        />

        {/* ── DeleteAccountWizard ── */}
        <DeleteAccountWizard
          visible={showDeleteAccount}
          onClose={() => setShowDeleteAccount(false)}
        />

      </LinearGradient>
    </ImageBackground>
  );
};

// ============================================================================
// STYLES — original preserved exactly, new styles appended at bottom
// ============================================================================
const styles = StyleSheet.create({
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  gradientOverlay: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: IS_MOBILE ? 20 : 40, paddingHorizontal: IS_MOBILE ? 12 : 20, alignItems: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bgBlack },
  loadingText: { color: COLORS.textGray, marginTop: 16, fontSize: 16 },
  card: { backgroundColor: COLORS.cardBg, borderRadius: 16, padding: IS_MOBILE ? 20 : 28, marginBottom: 20, width: '100%', maxWidth: 600, borderWidth: 1, borderColor: COLORS.borderSubtle },
  profileHeader: { alignItems: 'center' },
  profileImage: { width: IS_MOBILE ? 100 : 140, height: IS_MOBILE ? 100 : 140, borderRadius: IS_MOBILE ? 50 : 70, borderWidth: IS_MOBILE ? 3 : 4, borderColor: COLORS.unisBlue },
  profileName: { fontSize: IS_MOBILE ? 24 : 32, fontWeight: '700', color: COLORS.textWhite, marginTop: 16, marginBottom: 8 },
  profileBio: { fontSize: IS_MOBILE ? 14 : 16, color: COLORS.textGray, textAlign: 'center', maxWidth: 400, marginBottom: 16, lineHeight: 22 },
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.unisBlue, paddingVertical: IS_MOBILE ? 10 : 12, paddingHorizontal: IS_MOBILE ? 20 : 28, borderRadius: 12 },
  editButtonText: { color: COLORS.textWhite, fontWeight: '600', fontSize: IS_MOBILE ? 14 : 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionTitle: { fontSize: IS_MOBILE ? 18 : 22, fontWeight: '700', color: COLORS.textWhite },
  supportedArtistCard: { backgroundColor: COLORS.cardBgHover, borderRadius: 12, padding: IS_MOBILE ? 16 : 24, flexDirection: IS_MOBILE ? 'column' : 'row', alignItems: IS_MOBILE ? 'center' : 'flex-start', gap: IS_MOBILE ? 16 : 24 },
  artistPhoto: { width: IS_MOBILE ? 80 : 100, height: IS_MOBILE ? 80 : 100, borderRadius: IS_MOBILE ? 40 : 50, borderWidth: IS_MOBILE ? 2 : 3, borderColor: COLORS.unisBlue },
  artistInfo: { flex: 1, width: '100%', alignItems: IS_MOBILE ? 'center' : 'flex-start' },
  artistName: { fontSize: IS_MOBILE ? 18 : 20, fontWeight: '700', color: COLORS.textWhite, marginBottom: 12 },
  defaultSongSection: { flexDirection: IS_MOBILE ? 'column' : 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0, 74, 173, 0.1)', borderWidth: 1, borderColor: 'rgba(0, 74, 173, 0.3)', borderRadius: 10, padding: IS_MOBILE ? 12 : 16, gap: IS_MOBILE ? 12 : 16, width: '100%' },
  songDetails: { flexDirection: IS_MOBILE ? 'column' : 'row', alignItems: 'center', gap: IS_MOBILE ? 8 : 12, flex: 1 },
  songText: { alignItems: IS_MOBILE ? 'center' : 'flex-start' },
  songTitle: { fontSize: IS_MOBILE ? 14 : 16, fontWeight: '600', color: COLORS.textWhite },
  songLabel: { fontSize: IS_MOBILE ? 12 : 13, color: COLORS.textGray, marginTop: 2 },
  playButton: { width: IS_MOBILE ? 45 : 50, height: IS_MOBILE ? 45 : 50, borderRadius: IS_MOBILE ? 22.5 : 25, backgroundColor: COLORS.unisBlue, justifyContent: 'center', alignItems: 'center' },
  noSongText: { fontSize: 14, color: COLORS.textMuted, fontStyle: 'italic' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: IS_MOBILE ? 12 : 20, marginBottom: 20, width: '100%', maxWidth: 600 },
  statCard: { backgroundColor: COLORS.cardBg, borderRadius: 16, padding: IS_MOBILE ? 16 : 24, alignItems: 'center', width: IS_MOBILE ? '47%' : '30%', borderWidth: 1, borderColor: COLORS.borderSubtle },
  statLabel: { fontSize: IS_MOBILE ? 12 : 14, color: COLORS.textGray, marginTop: 8, marginBottom: 4 },
  statValue: { fontSize: IS_MOBILE ? 24 : 32, fontWeight: '700', color: COLORS.textWhite },
  voteHistoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  viewAllButton: { backgroundColor: 'rgba(0, 74, 173, 0.2)', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0, 74, 173, 0.3)' },
  viewAllButtonText: { color: COLORS.unisBlueBright, fontWeight: '600', fontSize: IS_MOBILE ? 13 : 14 },
  voteSummary: { flexDirection: IS_MOBILE ? 'column' : 'row', alignItems: 'center', gap: IS_MOBILE ? 16 : 24, backgroundColor: COLORS.cardBgHover, padding: IS_MOBILE ? 16 : 24, borderRadius: 12, marginBottom: 12 },
  voteStatBox: { alignItems: 'center', minWidth: 80 },
  voteCount: { fontSize: IS_MOBILE ? 36 : 48, fontWeight: '700', color: COLORS.unisBlue, lineHeight: IS_MOBILE ? 40 : 52 },
  voteLabel: { fontSize: IS_MOBILE ? 11 : 12, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  voteCta: { flex: 1, fontSize: IS_MOBILE ? 14 : 15, color: COLORS.textGray, textAlign: IS_MOBILE ? 'center' : 'left' },
  // Vote preview (new)
  recentVotes: { gap: 8 },
  recentVotesLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  votePreviewItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.cardBgHover, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  votePreviewName: { color: COLORS.textWhite, fontSize: 14, fontWeight: '500', flex: 1 },
  votePreviewType: { color: COLORS.textMuted, fontSize: 12, textTransform: 'capitalize', marginLeft: 8 },
  // Social media (new)
  socialLinksEdit: { gap: 16 },
  socialLinkItem: { gap: 8 },
  socialLabel: { fontSize: 14, fontWeight: '600', color: COLORS.textGray },
  socialInput: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: COLORS.borderSubtle, borderRadius: 10, padding: 12, color: COLORS.textWhite, fontSize: 14 },
  // Danger zone
  dangerZone: { backgroundColor: COLORS.cardBg, borderRadius: 16, borderWidth: 2, borderColor: COLORS.dangerRed, padding: IS_MOBILE ? 20 : 28, marginBottom: 20, width: '100%', maxWidth: 600 },
  dangerContent: { alignItems: 'center' },
  dangerTitle: { fontSize: IS_MOBILE ? 18 : 20, fontWeight: '700', color: COLORS.dangerRed, marginBottom: 8 },
  dangerText: { fontSize: 14, color: '#faa', marginBottom: 16 },
  deleteButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.dangerRed, paddingVertical: IS_MOBILE ? 10 : 12, paddingHorizontal: IS_MOBILE ? 16 : 24, borderRadius: 10 },
  deleteButtonText: { color: COLORS.textWhite, fontWeight: '600', fontSize: IS_MOBILE ? 14 : 15 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.1)' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textWhite },
  modalClose: { fontSize: 24, color: COLORS.textGray, padding: 4 },
  modalBody: { maxHeight: 300 },
  voteItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.cardBgHover, padding: 16, borderRadius: 10, marginBottom: 10 },
  voteInfo: { flex: 1 },
  voteTargetName: { fontSize: 15, fontWeight: '600', color: COLORS.textWhite },
  voteTargetType: { fontSize: 13, color: COLORS.textGray, textTransform: 'capitalize', marginTop: 2 },
  voteDate: { fontSize: 13, color: COLORS.textMuted },
  emptyText: { fontSize: 14, color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', padding: 24 },
  modalCloseButton: { backgroundColor: COLORS.unisBlue, paddingVertical: 14, borderRadius: 10, marginTop: 16, alignItems: 'center' },
  modalCloseButtonText: { color: COLORS.textWhite, fontWeight: '600', fontSize: 16 },
});

export default ProfileScreen;