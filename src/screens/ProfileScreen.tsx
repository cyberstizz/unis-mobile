import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
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
import * as SecureStore from 'expo-secure-store';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
// import axiosInstance from '../services/axiosInstance';

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
// DUMMY DATA
// ============================================================================
const DUMMY_PROFILE = {
  userId: 'user-001',
  username: 'HarlemFan92',
  bio: 'Music lover from Harlem. Supporting local artists since day one!',
  photoUrl: null,
  score: 1250,
  level: 'Gold',
  supportedArtistId: 'artist-002',
};

const DUMMY_SUPPORTED_ARTIST = {
  userId: 'artist-002',
  username: 'The Quiet',
  photoUrl: null,
  defaultSong: {
    songId: 'song-001',
    title: 'Midnight in Harlem',
    fileUrl: null,
    artworkUrl: null,
  },
};

const DUMMY_VOTE_HISTORY = [
  { id: 1, targetName: 'The Quiet', targetType: 'artist', createdAt: '2025-01-20' },
  { id: 2, targetName: 'Midnight in Harlem', targetType: 'song', createdAt: '2025-01-19' },
  { id: 3, targetName: 'Tony Fadd', targetType: 'artist', createdAt: '2025-01-18' },
  { id: 4, targetName: 'Block Party', targetType: 'song', createdAt: '2025-01-17' },
  { id: 5, targetName: 'SD Boomin', targetType: 'artist', createdAt: '2025-01-16' },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
const API_BASE_URL = 'http://localhost:8080';

const buildUrl = (url: string | null): string | null => {
  if (!url) return null;
  return url.startsWith('http://') || url.startsWith('https://') ? url : `${API_BASE_URL}${url}`;
};

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

  // Modals
  const [showVoteHistory, setShowVoteHistory] = useState(false);

  // Fallback image
  const fallbackImage = require('../../assets/randomrapper.jpeg');

  // ============================================================================
  // FETCH DATA
  // ============================================================================
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        // TODO: Replace with actual API calls
        // const profileRes = await axiosInstance.get(`/v1/users/profile/${user.userId}`);
        // setUserProfile(profileRes.data);
        //
        // if (profileRes.data.supportedArtistId) {
        //   const artistRes = await axiosInstance.get(`/v1/users/profile/${profileRes.data.supportedArtistId}`);
        //   setSupportedArtist(artistRes.data);
        // }
        //
        // const voteRes = await axiosInstance.get('/v1/vote/history?limit=50');
        // setVoteHistory(voteRes.data || []);

        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Use dummy data
        setUserProfile(DUMMY_PROFILE);
        setSupportedArtist(DUMMY_SUPPORTED_ARTIST);
        setVoteHistory(DUMMY_VOTE_HISTORY);
      } catch (err) {
        console.error('Failed to load profile data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // ============================================================================
  // HANDLERS
  // ============================================================================
  const handleEditProfile = () => {
    // TODO: Open EditProfileWizard modal
    Alert.alert('Edit Profile', 'EditProfileWizard would open here');
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // TODO: Implement actual delete
            Alert.alert('Account Deleted', 'Your account has been deleted.');
          },
        },
      ]
    );
  };

  const handlePlaySupportedArtist = async () => {
    if (!supportedArtist?.defaultSong) {
      Alert.alert('No Song', 'This artist has not set a featured song yet.');
      return;
    }

    const song = supportedArtist.defaultSong;
    const songUrl = buildUrl(song.fileUrl);

    if (!songUrl) {
      Alert.alert('Unavailable', 'Song file not available.');
      return;
    }

    const mediaObject = {
      type: 'song',
      id: song.songId,
      url: songUrl,
      title: song.title,
      artist: supportedArtist.username,
      artwork: buildUrl(song.artworkUrl) || buildUrl(supportedArtist.photoUrl),
    };

    // TODO: Track the play
    // try {
    //   await axiosInstance.post(`/v1/media/song/${song.songId}/play?userId=${user.userId}`);
    // } catch (err) {
    //   console.error('Failed to track play:', err);
    // }

    playMedia(mediaObject, [mediaObject]);
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

  const displayPhoto = userProfile.photoUrl ? { uri: buildUrl(userProfile.photoUrl) } : fallbackImage;

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
          {/* Profile Header */}
          <View style={styles.card}>
            <View style={styles.profileHeader}>
              <Image source={displayPhoto} style={styles.profileImage} />
              <Text style={styles.profileName}>{userProfile.username}</Text>
              <Text style={styles.profileBio}>
                {userProfile.bio || 'No bio yet — tell Harlem who you are!'}
              </Text>
              <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
                <Edit3 size={16} color={COLORS.textWhite} />
                <Text style={styles.editButtonText}>Edit Profile</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Supported Artist */}
          {supportedArtist && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Heart size={20} color={COLORS.unisBlue} />
                <Text style={styles.sectionTitle}>I Support</Text>
              </View>

              <View style={styles.supportedArtistCard}>
                <TouchableOpacity onPress={handleViewArtist}>
                  <Image
                    source={
                      supportedArtist.photoUrl
                        ? { uri: buildUrl(supportedArtist.photoUrl) }
                        : fallbackImage
                    }
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

          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Music size={28} color={COLORS.unisBlue} />
              <Text style={styles.statLabel}>Score</Text>
              <Text style={styles.statValue}>{userProfile.score || 0}</Text>
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

          {/* Vote History */}
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
          </View>

          {/* Danger Zone */}
          <View style={styles.dangerZone}>
            <View style={styles.dangerContent}>
              <Text style={styles.dangerTitle}>Danger Zone</Text>
              <Text style={styles.dangerText}>This cannot be undone.</Text>
              <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
                <Trash2 size={16} color={COLORS.textWhite} />
                <Text style={styles.deleteButtonText}>Delete Account</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom spacing */}
          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Vote History Modal */}
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
      </LinearGradient>
    </ImageBackground>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  // Background & Layout
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: IS_MOBILE ? 20 : 40,
    paddingHorizontal: IS_MOBILE ? 12 : 20,
    alignItems: 'center',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bgBlack,
  },
  loadingText: {
    color: COLORS.textGray,
    marginTop: 16,
    fontSize: 16,
  },

  // Card
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: IS_MOBILE ? 20 : 28,
    marginBottom: 20,
    width: '100%',
    maxWidth: 600,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },

  // Profile Header
  profileHeader: {
    alignItems: 'center',
  },
  profileImage: {
    width: IS_MOBILE ? 100 : 140,
    height: IS_MOBILE ? 100 : 140,
    borderRadius: IS_MOBILE ? 50 : 70,
    borderWidth: IS_MOBILE ? 3 : 4,
    borderColor: COLORS.unisBlue,
  },
  profileName: {
    fontSize: IS_MOBILE ? 24 : 32,
    fontWeight: '700',
    color: COLORS.textWhite,
    marginTop: 16,
    marginBottom: 8,
  },
  profileBio: {
    fontSize: IS_MOBILE ? 14 : 16,
    color: COLORS.textGray,
    textAlign: 'center',
    maxWidth: 400,
    marginBottom: 16,
    lineHeight: 22,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.unisBlue,
    paddingVertical: IS_MOBILE ? 10 : 12,
    paddingHorizontal: IS_MOBILE ? 20 : 28,
    borderRadius: 12,
  },
  editButtonText: {
    color: COLORS.textWhite,
    fontWeight: '600',
    fontSize: IS_MOBILE ? 14 : 16,
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: IS_MOBILE ? 18 : 22,
    fontWeight: '700',
    color: COLORS.textWhite,
  },

  // Supported Artist
  supportedArtistCard: {
    backgroundColor: COLORS.cardBgHover,
    borderRadius: 12,
    padding: IS_MOBILE ? 16 : 24,
    flexDirection: IS_MOBILE ? 'column' : 'row',
    alignItems: IS_MOBILE ? 'center' : 'flex-start',
    gap: IS_MOBILE ? 16 : 24,
  },
  artistPhoto: {
    width: IS_MOBILE ? 80 : 100,
    height: IS_MOBILE ? 80 : 100,
    borderRadius: IS_MOBILE ? 40 : 50,
    borderWidth: IS_MOBILE ? 2 : 3,
    borderColor: COLORS.unisBlue,
  },
  artistInfo: {
    flex: 1,
    width: '100%',
    alignItems: IS_MOBILE ? 'center' : 'flex-start',
  },
  artistName: {
    fontSize: IS_MOBILE ? 18 : 20,
    fontWeight: '700',
    color: COLORS.textWhite,
    marginBottom: 12,
  },
  defaultSongSection: {
    flexDirection: IS_MOBILE ? 'column' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 74, 173, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 74, 173, 0.3)',
    borderRadius: 10,
    padding: IS_MOBILE ? 12 : 16,
    gap: IS_MOBILE ? 12 : 16,
    width: '100%',
  },
  songDetails: {
    flexDirection: IS_MOBILE ? 'column' : 'row',
    alignItems: 'center',
    gap: IS_MOBILE ? 8 : 12,
    flex: 1,
  },
  songText: {
    alignItems: IS_MOBILE ? 'center' : 'flex-start',
  },
  songTitle: {
    fontSize: IS_MOBILE ? 14 : 16,
    fontWeight: '600',
    color: COLORS.textWhite,
  },
  songLabel: {
    fontSize: IS_MOBILE ? 12 : 13,
    color: COLORS.textGray,
    marginTop: 2,
  },
  playButton: {
    width: IS_MOBILE ? 45 : 50,
    height: IS_MOBILE ? 45 : 50,
    borderRadius: IS_MOBILE ? 22.5 : 25,
    backgroundColor: COLORS.unisBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noSongText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: IS_MOBILE ? 12 : 20,
    marginBottom: 20,
    width: '100%',
    maxWidth: 600,
  },
  statCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: IS_MOBILE ? 16 : 24,
    alignItems: 'center',
    width: IS_MOBILE ? '47%' : '30%',
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  statLabel: {
    fontSize: IS_MOBILE ? 12 : 14,
    color: COLORS.textGray,
    marginTop: 8,
    marginBottom: 4,
  },
  statValue: {
    fontSize: IS_MOBILE ? 24 : 32,
    fontWeight: '700',
    color: COLORS.textWhite,
  },

  // Vote History
  voteHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  viewAllButton: {
    backgroundColor: 'rgba(0, 74, 173, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 74, 173, 0.3)',
  },
  viewAllButtonText: {
    color: COLORS.unisBlueBright,
    fontWeight: '600',
    fontSize: IS_MOBILE ? 13 : 14,
  },
  voteSummary: {
    flexDirection: IS_MOBILE ? 'column' : 'row',
    alignItems: 'center',
    gap: IS_MOBILE ? 16 : 24,
    backgroundColor: COLORS.cardBgHover,
    padding: IS_MOBILE ? 16 : 24,
    borderRadius: 12,
  },
  voteStatBox: {
    alignItems: 'center',
    minWidth: 80,
  },
  voteCount: {
    fontSize: IS_MOBILE ? 36 : 48,
    fontWeight: '700',
    color: COLORS.unisBlue,
    lineHeight: IS_MOBILE ? 40 : 52,
  },
  voteLabel: {
    fontSize: IS_MOBILE ? 11 : 12,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  voteCta: {
    flex: 1,
    fontSize: IS_MOBILE ? 14 : 15,
    color: COLORS.textGray,
    textAlign: IS_MOBILE ? 'center' : 'left',
  },

  // Danger Zone
  dangerZone: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.dangerRed,
    padding: IS_MOBILE ? 20 : 28,
    marginBottom: 20,
    width: '100%',
    maxWidth: 600,
  },
  dangerContent: {
    alignItems: 'center',
  },
  dangerTitle: {
    fontSize: IS_MOBILE ? 18 : 20,
    fontWeight: '700',
    color: COLORS.dangerRed,
    marginBottom: 8,
  },
  dangerText: {
    fontSize: 14,
    color: '#faa',
    marginBottom: 16,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.dangerRed,
    paddingVertical: IS_MOBILE ? 10 : 12,
    paddingHorizontal: IS_MOBILE ? 16 : 24,
    borderRadius: 10,
  },
  deleteButtonText: {
    color: COLORS.textWhite,
    fontWeight: '600',
    fontSize: IS_MOBILE ? 14 : 15,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
  modalClose: {
    fontSize: 24,
    color: COLORS.textGray,
    padding: 4,
  },
  modalBody: {
    maxHeight: 300,
  },
  voteItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.cardBgHover,
    padding: 16,
    borderRadius: 10,
    marginBottom: 10,
  },
  voteInfo: {
    flex: 1,
  },
  voteTargetName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textWhite,
  },
  voteTargetType: {
    fontSize: 13,
    color: COLORS.textGray,
    textTransform: 'capitalize',
    marginTop: 2,
  },
  voteDate: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 24,
  },
  modalCloseButton: {
    backgroundColor: COLORS.unisBlue,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 16,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: COLORS.textWhite,
    fontWeight: '600',
    fontSize: 16,
  },
});

export default ProfileScreen;