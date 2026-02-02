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
  Linking,
  ImageBackground,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Users, Heart, PlayCircle, Camera, Music2 } from 'lucide-react-native';
import { usePlayer } from '../context/PlayerContext';
// import { AuthContext } from '../context/AuthContext';
// import axiosInstance from '../services/axiosInstance';

// ============================================================================
// COLORS & SIZES (easy to edit, matches web SCSS variables)
// ============================================================================
const COLORS = {
  bgBlack: '#000000',
  subtleBlack: '#1a1a1a',
  textSilver: '#C0C0C0',
  textGray: '#A9A9A9',
  accentWhite: '#FFFFFF',
  unisBlue: '#163387',
  unisSilver: '#918f8f',
  borderSilver: 'rgba(192, 192, 192, 0.2)',
  borderSilverSolid: '#C0C0C0',
  cardBg: 'rgba(26, 26, 26, 0.9)',
  itemBg: 'rgba(255, 255, 255, 0.05)',
  itemBgHover: 'rgba(255, 255, 255, 0.08)',
};

const SIZES = {
  profileImageLarge: 180,
  profileImageMobile: 120,
  artworkSize: 50,
  artworkSizeMobile: 40,
  borderRadiusCard: 12,
  borderRadiusButton: 50,
  borderRadiusSmall: 8,
  paddingCard: 30,
  paddingCardMobile: 20,
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 768;

// ============================================================================
// DUMMY DATA (replace with API calls)
// ============================================================================
const DUMMY_ARTIST = {
  id: 'artist-001',
  username: 'The Quiet',
  photoUrl: null, // Will use fallback
  jurisdiction: { name: 'Harlem' },
  genre: { name: 'Hip-Hop' },
  bio: 'Rising from the streets of Harlem, The Quiet brings a unique blend of introspective lyrics and hard-hitting beats. With influences ranging from classic New York hip-hop to modern trap, every track tells a story of struggle, triumph, and the pursuit of greatness.',
  instagramUrl: 'https://instagram.com/thequiet',
  twitterUrl: 'https://twitter.com/thequiet',
  tiktokUrl: 'https://tiktok.com/@thequiet',
  totalPlays: 12847,
  score: 4523,
};

const DUMMY_SONGS = [
  {
    songId: 'song-001',
    title: 'Midnight in Harlem',
    artworkUrl: null,
    fileUrl: 'https://example.com/song1.mp3',
    score: 1200,
  },
  {
    songId: 'song-002',
    title: 'Block Party',
    artworkUrl: null,
    fileUrl: 'https://example.com/song2.mp3',
    score: 980,
  },
  {
    songId: 'song-003',
    title: 'Silent Streets',
    artworkUrl: null,
    fileUrl: 'https://example.com/song3.mp3',
    score: 756,
  },
  {
    songId: 'song-004',
    title: 'Crown Heights Dreams',
    artworkUrl: null,
    fileUrl: 'https://example.com/song4.mp3',
    score: 543,
  },
  {
    songId: 'song-005',
    title: 'Uptown Anthem',
    artworkUrl: null,
    fileUrl: 'https://example.com/song5.mp3',
    score: 421,
  },
];

const DUMMY_DEFAULT_SONG = DUMMY_SONGS[0];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
const API_BASE_URL = 'http://localhost:8080'; // Update with your actual API URL

const buildUrl = (url: string | null): string | null => {
  if (!url) return null;
  return url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
interface ArtistScreenProps {
  isOwnProfile?: boolean;
}

const ArtistScreen: React.FC<ArtistScreenProps> = ({ isOwnProfile = false }) => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const { playMedia } = usePlayer();

  // Get artistId from route params
  const artistId = (route.params as any)?.artistId || 'artist-001';

  // State
  const [artist, setArtist] = useState<any>(null);
  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Follower states
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(847);

  // Bio state (for own profile editing)
  const [bio, setBio] = useState('');
  const [isEditingBio, setIsEditingBio] = useState(false);

  // Voting wizard state
  const [showVotingWizard, setShowVotingWizard] = useState(false);

  const [defaultSong, setDefaultSong] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>('user-001'); // Dummy user ID

  // ============================================================================
  // DATA FETCHING (currently using dummy data)
  // ============================================================================
  useEffect(() => {
    fetchArtistData();
  }, [artistId]);

  const fetchArtistData = async () => {
    setLoading(true);
    setError('');

    try {
      // TODO: Replace with actual API calls
      // const artistRes = await axiosInstance.get(`/v1/users/profile/${artistId}`);
      // const songsRes = await axiosInstance.get(`/v1/media/songs/artist/${artistId}`);

      // Using dummy data for now
      await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate network delay

      setArtist(DUMMY_ARTIST);
      setSongs(DUMMY_SONGS);
      setBio(DUMMY_ARTIST.bio);
      setDefaultSong(DUMMY_DEFAULT_SONG);
    } catch (err) {
      console.error('Failed to load artist:', err);
      setError('Failed to load artist details');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // HANDLERS
  // ============================================================================
  const handleFollow = async () => {
    const previousState = isFollowing;
    const previousCount = followerCount;

    // Optimistic update
    setIsFollowing(!previousState);
    setFollowerCount((prev) => (!previousState ? prev + 1 : prev - 1));

    try {
      // TODO: Replace with actual API call
      // if (!previousState) {
      //   await axiosInstance.post(`/v1/users/${artistId}/follow`);
      // } else {
      //   await axiosInstance.delete(`/v1/users/${artistId}/follow`);
      // }
    } catch (err) {
      console.error('Failed to toggle follow:', err);
      // Revert on error
      setIsFollowing(previousState);
      setFollowerCount(previousCount);
    }
  };

  const handleSaveBio = async () => {
    try {
      // TODO: Replace with actual API call
      // await axiosInstance.put(`/v1/users/profile/${artistId}/bio`, { bio });
      setIsEditingBio(false);
    } catch (err) {
      console.error('Failed to save bio:', err);
    }
  };

  const handleVote = () => {
    // TODO: Open VotingWizard modal
    setShowVotingWizard(true);
    console.log('Opening voting wizard for:', artist?.username);
  };

  const handlePlayDefault = () => {
    if (defaultSong && defaultSong.fileUrl) {
      playMedia(
        {
          type: 'song',
          url: buildUrl(defaultSong.fileUrl) || '',
          title: defaultSong.title,
          artist: artist?.username || 'Unknown',
          artwork: buildUrl(defaultSong.artworkUrl) || buildUrl(artist?.photoUrl),
        },
        []
      );
    }
  };

  const handlePlaySong = (song: any) => {
    playMedia(
      {
        type: 'song',
        url: buildUrl(song.fileUrl) || '',
        title: song.title,
        artist: artist?.username || 'Unknown',
        artwork: buildUrl(song.artworkUrl) || buildUrl(artist?.photoUrl),
      },
      []
    );
  };

  const handleSongClick = (songId: string) => {
    navigation.navigate('Song', { songId });
  };

  const handleJurisdictionClick = () => {
    if (artist?.jurisdiction?.name) {
      navigation.navigate('Find', { jurisdiction: artist.jurisdiction.name });
    }
  };

  const handleSocialLink = (url: string | null) => {
    if (url && url !== '#') {
      Linking.openURL(url);
    }
  };

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================
  const isCurrentUser = userId === artistId;
  const showActionButtons = !isOwnProfile && !isCurrentUser;

  // Find top song (highest score)
  const topSong =
    songs.length > 0
      ? songs.reduce((prev, current) =>
          (current.score || 0) > (prev.score || 0) ? current : prev
        )
      : null;

  // Fallback image
  const fallbackImage = require('../../assets/randomrapper.jpeg');
  const artistPhoto = artist?.photoUrl
    ? { uri: `${API_BASE_URL}${artist.photoUrl}` }
    : fallbackImage;

  // ============================================================================
  // LOADING STATE
  // ============================================================================
  if (loading) {
    return (
      <ImageBackground source={fallbackImage} style={styles.backgroundImage} blurRadius={20}>
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.9)', COLORS.bgBlack]}
          style={styles.gradientOverlay}
        >
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.textSilver} />
            <Text style={styles.loadingText}>Loading artist...</Text>
          </View>
        </LinearGradient>
      </ImageBackground>
    );
  }

  // ============================================================================
  // ERROR STATE
  // ============================================================================
  if (error || !artist) {
    return (
      <ImageBackground source={fallbackImage} style={styles.backgroundImage} blurRadius={20}>
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.9)', COLORS.bgBlack]}
          style={styles.gradientOverlay}
        >
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Artist not found</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.retryButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </ImageBackground>
    );
  }

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  return (
    <ImageBackground source={artistPhoto} style={styles.backgroundImage} blurRadius={25}>
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.85)', COLORS.bgBlack]}
        style={styles.gradientOverlay}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ================================================================ */}
          {/* HEADER SECTION */}
          {/* ================================================================ */}
          <View style={styles.artistHeader}>
            <View style={styles.artistInfo}>
              {/* Profile Image */}
              <View style={styles.artistTop}>
                <Image source={artistPhoto} style={styles.profileImage} />
                <Text style={styles.artistName}>{artist.username}</Text>
                <TouchableOpacity onPress={handleJurisdictionClick}>
                  <Text style={styles.artistJurisdiction}>
                    {artist.jurisdiction?.name || 'Unknown'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Genre */}
              <Text style={styles.artistGenre}>{artist.genre?.name || 'Unknown Genre'}</Text>

              {/* Stats Row */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Users size={16} color={COLORS.textGray} />
                  <Text style={styles.statText}>{followerCount} Followers</Text>
                </View>
                <View style={styles.statItem}>
                  <PlayCircle size={16} color={COLORS.textGray} />
                  <Text style={styles.statText}>{artist.totalPlays || 0} Plays</Text>
                </View>
                <View style={styles.statItem}>
                  <Heart size={16} color={COLORS.textGray} />
                  <Text style={styles.statText}>{artist.score || 0} Score</Text>
                </View>
              </View>

              {/* Action Buttons (only show if not own profile) */}
              {showActionButtons && (
                <View style={styles.actionButtonsContainer}>
                  {/* Follow Button */}
                  <TouchableOpacity
                    style={[
                      styles.followButton,
                      isFollowing && styles.followButtonActive,
                    ]}
                    onPress={handleFollow}
                  >
                    <Text
                      style={[
                        styles.followButtonText,
                        isFollowing && styles.followButtonTextActive,
                      ]}
                    >
                      {isFollowing ? 'Following' : 'Follow'}
                    </Text>
                  </TouchableOpacity>

                  {/* Vote & Play Row */}
                  <View style={styles.actionButtonsRow}>
                    <TouchableOpacity style={styles.actionButton} onPress={handleVote}>
                      <Text style={styles.actionButtonText}>Vote</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, !defaultSong && styles.actionButtonDisabled]}
                      onPress={handlePlayDefault}
                      disabled={!defaultSong}
                    >
                      <Text style={styles.actionButtonText}>Play</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* ================================================================ */}
          {/* CONTENT SECTIONS */}
          {/* ================================================================ */}
          <View style={styles.contentWrapper}>
            {/* Fans Pick Section */}
            {topSong && (
              <View style={styles.card}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Fans Pick</Text>
                </View>
                <TouchableOpacity
                  style={styles.fansPickItem}
                  onPress={() => handleSongClick(topSong.songId)}
                >
                  <Image
                    source={
                      topSong.artworkUrl
                        ? { uri: buildUrl(topSong.artworkUrl) }
                        : artistPhoto
                    }
                    style={styles.songArtwork}
                  />
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemTitle}>{topSong.title}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.playButtonSmall}
                    onPress={() => handlePlaySong(topSong)}
                  >
                    <Text style={styles.playButtonSmallText}>Play</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              </View>
            )}

            {/* Music Section */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Music</Text>
              </View>
              <View style={styles.songsList}>
                {songs.slice(0, 5).map((song) => (
                  <View key={song.songId} style={styles.songItem}>
                    <Image
                      source={
                        song.artworkUrl
                          ? { uri: buildUrl(song.artworkUrl) }
                          : artistPhoto
                      }
                      style={styles.songArtwork}
                    />
                    <TouchableOpacity
                      style={styles.itemInfo}
                      onPress={() => handleSongClick(song.songId)}
                    >
                      <Text style={styles.itemTitle}>{song.title}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.playButtonSmall}
                      onPress={() => handlePlaySong(song)}
                    >
                      <Text style={styles.playButtonSmallText}>Play</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {songs.length === 0 && (
                  <Text style={styles.emptyMessage}>No songs yet</Text>
                )}
              </View>
            </View>

            {/* Bio Section */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Bio</Text>
              </View>
              {isOwnProfile ? (
                <View>
                  <TextInput
                    style={styles.bioEdit}
                    value={bio}
                    onChangeText={setBio}
                    multiline
                    numberOfLines={5}
                    placeholder="Write your bio..."
                    placeholderTextColor={COLORS.textGray}
                  />
                  <TouchableOpacity style={styles.saveButton} onPress={handleSaveBio}>
                    <Text style={styles.saveButtonText}>Save Bio</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.bioText}>{bio}</Text>
              )}
            </View>

            {/* Social Media Section */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Social Media</Text>
              </View>
              <View style={styles.socialLinks}>
                <TouchableOpacity
                  style={styles.socialLink}
                  onPress={() => handleSocialLink(artist.instagramUrl)}
                >
                  <View style={[styles.socialIcon, styles.instagramIcon]}>
                    <Camera size={18} color={COLORS.accentWhite} />
                  </View>
                  <Text style={styles.socialLinkText}>Instagram</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.socialLink}
                  onPress={() => handleSocialLink(artist.twitterUrl)}
                >
                  <View style={[styles.socialIcon, styles.twitterIcon]}>
                    <Text style={styles.twitterX}>𝕏</Text>
                  </View>
                  <Text style={styles.socialLinkText}>Twitter</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.socialLink}
                  onPress={() => handleSocialLink(artist.tiktokUrl)}
                >
                  <View style={[styles.socialIcon, styles.tiktokIcon]}>
                    <Music2 size={18} color={COLORS.accentWhite} />
                  </View>
                  <Text style={styles.socialLinkText}>TikTok</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Bottom spacing for player */}
          <View style={{ height: 120 }} />
        </ScrollView>
      </LinearGradient>

      {/* TODO: VotingWizard Modal */}
      {/* {showVotingWizard && (
        <VotingWizard
          visible={showVotingWizard}
          onClose={() => setShowVotingWizard(false)}
          nominee={{ id: artistId, name: artist.username, type: 'artist' }}
        />
      )} */}
    </ImageBackground>
  );
};

// ============================================================================
// STYLES (converted from artistpage.scss)
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
    paddingTop: IS_MOBILE ? 100 : 80,
    paddingBottom: 20,
  },

  // Loading & Error States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textSilver,
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 18,
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: SIZES.borderRadiusButton,
    borderWidth: 1,
    borderColor: COLORS.borderSilverSolid,
  },
  retryButtonText: {
    color: COLORS.textSilver,
    fontWeight: '600',
  },

  // Artist Header
  artistHeader: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: IS_MOBILE ? 24 : 32,
  },
  artistInfo: {
    alignItems: 'center',
    width: '100%',
  },
  artistTop: {
    alignItems: 'center',
    gap: IS_MOBILE ? 10 : 16,
    marginBottom: IS_MOBILE ? 10 : 16,
  },
  profileImage: {
    width: IS_MOBILE ? SIZES.profileImageMobile : SIZES.profileImageLarge,
    height: IS_MOBILE ? SIZES.profileImageMobile : SIZES.profileImageLarge,
    borderRadius: IS_MOBILE ? SIZES.profileImageMobile / 2 : SIZES.profileImageLarge / 2,
    borderWidth: IS_MOBILE ? 3 : 4,
    borderColor: COLORS.unisBlue,
  },
  artistName: {
    color: COLORS.textSilver,
    fontSize: IS_MOBILE ? 24 : 35,
    fontWeight: 'bold',
  },
  artistJurisdiction: {
    color: COLORS.unisSilver,
    fontSize: IS_MOBILE ? 16 : 22,
    fontFamily: 'BitcountGridDouble',
    fontWeight: '400',
    letterSpacing: IS_MOBILE ? 1 : 1.5,
    textTransform: 'uppercase',
    borderTopWidth: 1,
    borderTopColor: COLORS.textSilver,
    borderStyle: 'dotted',
    paddingTop: 8,
  },
  artistGenre: {
    fontSize: IS_MOBILE ? 14 : 16,
    color: COLORS.textGray,
    marginTop: 4,
    marginBottom: IS_MOBILE ? 12 : 16,
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: IS_MOBILE ? 16 : 24,
    marginBottom: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    color: COLORS.textGray,
    fontSize: IS_MOBILE ? 13 : 14,
  },

  // Action Buttons
  actionButtonsContainer: {
    width: '100%',
    maxWidth: 300,
    gap: 12,
  },
  followButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: SIZES.borderRadiusButton,
    borderWidth: 1,
    borderColor: COLORS.borderSilverSolid,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  followButtonActive: {
    backgroundColor: COLORS.unisBlue,
  },
  followButtonText: {
    color: COLORS.textSilver,
    fontWeight: 'bold',
    fontSize: IS_MOBILE ? 14 : 15,
  },
  followButtonTextActive: {
    color: COLORS.accentWhite,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: IS_MOBILE ? 10 : 12,
    paddingHorizontal: IS_MOBILE ? 20 : 30,
    borderRadius: SIZES.borderRadiusButton,
    borderWidth: 1,
    borderColor: COLORS.borderSilverSolid,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: COLORS.textSilver,
    fontWeight: 'bold',
    fontSize: IS_MOBILE ? 13 : 14,
  },

  // Content Wrapper
  contentWrapper: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    paddingHorizontal: IS_MOBILE ? 8 : 16,
    gap: IS_MOBILE ? 16 : 20,
  },

  // Card (shared section style)
  card: {
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: IS_MOBILE ? 10 : SIZES.borderRadiusCard,
    padding: IS_MOBILE ? SIZES.paddingCardMobile : SIZES.paddingCard,
  },
  sectionHeader: {
    marginBottom: IS_MOBILE ? 16 : 20,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.borderSilver,
    paddingBottom: IS_MOBILE ? 8 : 10,
  },
  sectionTitle: {
    color: COLORS.textSilver,
    fontSize: IS_MOBILE ? 20 : 24,
    fontFamily: 'BitcountGridDouble',
    fontWeight: '400',
  },

  // Fans Pick
  fansPickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.itemBg,
    borderRadius: SIZES.borderRadiusSmall,
    padding: IS_MOBILE ? 12 : 16,
    gap: IS_MOBILE ? 12 : 16,
  },

  // Song List
  songsList: {
    gap: 12,
  },
  songItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.itemBg,
    borderRadius: SIZES.borderRadiusSmall,
    padding: IS_MOBILE ? 12 : 16,
    gap: IS_MOBILE ? 12 : 16,
  },
  songArtwork: {
    width: IS_MOBILE ? SIZES.artworkSizeMobile : SIZES.artworkSize,
    height: IS_MOBILE ? SIZES.artworkSizeMobile : SIZES.artworkSize,
    borderRadius: 6,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    color: COLORS.accentWhite,
    fontSize: IS_MOBILE ? 14 : 16,
    fontWeight: '600',
  },
  playButtonSmall: {
    backgroundColor: COLORS.unisBlue,
    paddingVertical: IS_MOBILE ? 8 : 10,
    paddingHorizontal: IS_MOBILE ? 16 : 20,
    borderRadius: SIZES.borderRadiusSmall,
  },
  playButtonSmallText: {
    color: COLORS.accentWhite,
    fontWeight: '600',
    fontSize: IS_MOBILE ? 13 : 14,
  },
  emptyMessage: {
    textAlign: 'center',
    color: COLORS.textGray,
    padding: 16,
    fontSize: 14,
  },

  // Bio Section
  bioText: {
    color: COLORS.textSilver,
    lineHeight: IS_MOBILE ? 22 : 26,
    fontSize: IS_MOBILE ? 14 : 16,
    textAlign: 'center',
  },
  bioEdit: {
    backgroundColor: COLORS.bgBlack,
    borderWidth: 1,
    borderColor: 'rgba(192, 192, 192, 0.5)',
    color: COLORS.accentWhite,
    padding: IS_MOBILE ? 12 : 16,
    borderRadius: SIZES.borderRadiusSmall,
    marginBottom: 16,
    fontSize: IS_MOBILE ? 14 : 16,
    minHeight: IS_MOBILE ? 100 : 120,
    textAlignVertical: 'top',
  },
  saveButton: {
    paddingVertical: IS_MOBILE ? 10 : 12,
    paddingHorizontal: IS_MOBILE ? 20 : 30,
    borderRadius: SIZES.borderRadiusButton,
    borderWidth: 1,
    borderColor: COLORS.borderSilverSolid,
    backgroundColor: 'transparent',
    alignSelf: 'center',
  },
  saveButtonText: {
    color: COLORS.textSilver,
    fontWeight: 'bold',
    fontSize: IS_MOBILE ? 13 : 14,
  },

  // Social Media Section
  socialLinks: {
    gap: 12,
  },
  socialLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: IS_MOBILE ? 10 : 12,
    borderRadius: SIZES.borderRadiusSmall,
  },
  socialIcon: {
    width: IS_MOBILE ? 28 : 32,
    height: IS_MOBILE ? 28 : 32,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instagramIcon: {
    // Instagram gradient approximation
    backgroundColor: '#E1306C',
  },
  twitterIcon: {
    backgroundColor: '#000000',
  },
  tiktokIcon: {
    backgroundColor: '#00f2ea',
  },
  twitterX: {
    color: COLORS.accentWhite,
    fontSize: IS_MOBILE ? 16 : 18,
    fontWeight: 'bold',
  },
  socialLinkText: {
    color: COLORS.textSilver,
    fontSize: IS_MOBILE ? 14 : 16,
    fontWeight: '500',
  },
});

export default ArtistScreen;