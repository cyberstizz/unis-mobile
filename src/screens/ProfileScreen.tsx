// src/screens/ProfileScreen.tsx
// Ported from web `profile.jsx` (production version).
//
// Profile — single fetch, single error boundary, single source of truth.
//
// Core data comes from GET /v1/users/profile-summary/{userId}. Vote history is
// owned by VoteHistorySection (its own /v1/vote/history fetch) because the
// summary can't cheaply resolve nominee names/images.
//
// URL building uses the shared buildUrl utility (R2/CDN aware).

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ImageBackground,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Play, Edit3, Trash2, Clock, Heart } from 'lucide-react-native';
import { usePlayer } from '../context/PlayerContext';
import { useAuth } from '../context/AuthContext';
import axiosInstance from '../services/axiosInstance';
import buildUrl from '../utils/buildUrl';

// ── Wizards (exact filenames from repo) ──────────────────────────────────────
import Editprofilewizard from '../components/Editprofilewizard';
import DeleteAccountWizard from '../components/DeleteAccountWizard';
import ChangePasswordWizard from '../components/Changepasswordwizard';

// ── New profile-summary sections (ported with this screen) ──────────────────
import ReferralCodeCard from '../components/ReferralCodeCard';
import SocialLinksSection from '../components/SocialLinkssection';
import ThemePicker from '../components/ThemePicker';
import AccountSettings from '../components/AccountSettings';
import CollapsibleSection from '../components/CollapsibleSection';
import VoteHistorySection from '../components/VoteHistorySection';
import SupportedArtistPicker from '../components/SupportedArtistPicker';
import VerificationGate from '../components/VerificationGate';

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
// INTERFACES — mirror ProfileSummaryDto
// ============================================================================
interface SummaryProfile {
  userId: string;
  username: string;
  bio?: string;
  photoUrl?: string | null;
  score?: number;
  level?: string;
  role?: string; // 'artist' | 'listener'
  instagramUrl?: string | null;
  twitterUrl?: string | null;
  tiktokUrl?: string | null;
}

interface SummaryDefaultSong {
  songId: string;
  title: string;
  fileUrl?: string | null;
  artworkUrl?: string | null;
}

interface SummarySupportedArtist {
  userId: string;
  username: string;
  photoUrl?: string | null;
  defaultSong?: SummaryDefaultSong | null;
}

interface SummaryPendingArtist {
  userId: string;
  username: string;
  effectiveDate?: string;
}

interface ProfileSummary {
  profile: SummaryProfile;
  supportedArtist?: SummarySupportedArtist | null;
  pendingSupportedArtist?: SummaryPendingArtist | null;
  voteHistory?: { totalCount?: number } | null;
  referralCode?: string;
  settings?: {
    emailNotifications?: boolean;
    publicProfile?: boolean;
    showVoteHistory?: boolean;
  } | null;
}

// ============================================================================
// Inline section UI helpers (SectionLoader / SectionError from web)
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
const ProfileScreen: React.FC = () => {
  const { user } = useAuth();
  const { requestPlay } = usePlayer();

  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- UI state ---------------------------------------------------------
  const [showEditWizard, setShowEditWizard] = useState(false);
  const [showDeleteWizard, setShowDeleteWizard] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showArtistPicker, setShowArtistPicker] = useState(false);

  // ---- Pending supported-artist cancel state ----------------------------
  const [cancellingPending, setCancellingPending] = useState(false);

  // -----------------------------------------------------------------------
  // Single consolidated fetch
  // -----------------------------------------------------------------------
  const fetchSummary = useCallback(async (userId: string) => {
    if (!userId) return;
    const startedAt = Date.now();
    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get(`/v1/users/profile-summary/${userId}`);
      setSummary(res.data);
      console.log(`[Profile] action=fetch_summary userId=${userId} status=ok durationMs=${Date.now() - startedAt}`);
    } catch (err) {
      console.error(`[Profile] action=fetch_summary userId=${userId} status=fail durationMs=${Date.now() - startedAt} err=`, err);
      setError('Failed to load your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.userId) fetchSummary(user.userId);
  }, [user?.userId, fetchSummary]);

  // After a profile mutation, children call this to refresh the summary.
  const reload = useCallback(() => {
    if (user?.userId) fetchSummary(user.userId);
  }, [user?.userId, fetchSummary]);

  // Cancel a queued supported-artist change.
  const cancelPendingArtist = async () => {
    if (!user?.userId) return;
    setCancellingPending(true);
    const startedAt = Date.now();
    try {
      await axiosInstance.delete(`/v1/users/${user.userId}/supported-artist/pending`);
      console.log(`[Profile] action=cancel_pending_artist status=ok durationMs=${Date.now() - startedAt}`);
      reload();
    } catch (err) {
      console.error(`[Profile] action=cancel_pending_artist status=fail durationMs=${Date.now() - startedAt} err=`, err);
      Alert.alert('Error', 'Failed to cancel the pending change. Please try again.');
    } finally {
      setCancellingPending(false);
    }
  };

  // -----------------------------------------------------------------------
  // Early returns
  // -----------------------------------------------------------------------
  if (!user) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.fullscreenMsg}>Please log in.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <SectionLoader label="Loading your profile..." />
      </View>
    );
  }

  if (error || !summary) {
    return (
      <View style={[styles.screen, styles.center]}>
        <SectionError
          message={error || 'No profile data.'}
          onRetry={() => fetchSummary(user.userId)}
        />
      </View>
    );
  }

  // -----------------------------------------------------------------------
  // Derived display values — all URL building goes through buildUrl
  // -----------------------------------------------------------------------
  const { profile, supportedArtist, pendingSupportedArtist, voteHistory, referralCode, settings } = summary;

  const photoUrl = buildUrl(profile.photoUrl);
  const userInitial = (profile.username || '?').charAt(0).toUpperCase();

  // Show the ARTIST for clarity: prefer the artist's own photo, fall back to
  // the default song's artwork only if the artist has no photo. The default
  // song still PLAYS unchanged — this only affects the hero image.
  const featuredArt = supportedArtist
    ? (buildUrl(supportedArtist.photoUrl) ||
       buildUrl(supportedArtist.defaultSong?.artworkUrl))
    : null;

  const featuredTitle = supportedArtist?.defaultSong?.title || supportedArtist?.username;
  const hasPlayableSong = Boolean(supportedArtist?.defaultSong);

  // Pending-change display
  const pendingEffective = pendingSupportedArtist?.effectiveDate
    ? new Date(pendingSupportedArtist.effectiveDate).toLocaleDateString(undefined, {
        month: 'long', day: 'numeric',
      })
    : null;

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------
  const playDefaultSong = async () => {
    if (!supportedArtist?.defaultSong) {
      console.warn('[Profile] action=play_default status=skip reason=no_song');
      return;
    }
    const song = supportedArtist.defaultSong;
    const songId = song.songId;
    const songUrl = buildUrl(song.fileUrl);
    const artworkResolved = buildUrl(song.artworkUrl) || buildUrl(supportedArtist.photoUrl) || photoUrl;

    const mediaObject = {
      type: 'song',
      id: songId,
      songId,
      url: songUrl,
      fileUrl: songUrl,
      title: song.title,
      artist: supportedArtist.username,
      artistName: supportedArtist.username,
      artistId: supportedArtist.userId,
      artwork: artworkResolved,
      artworkUrl: artworkResolved,
    };

    try {
      await axiosInstance.post(`/v1/media/song/${songId}/play?userId=${user.userId}`);
    } catch (err) {
      console.error('[Profile] action=track_play status=fail err=', err);
    }

    // requestPlay: empty queue -> plays immediately,
    //              non-empty   -> opens PlayChoiceModal (preserves queue)
    requestPlay(mediaObject as any);
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ============== HERO ============== */}
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>
            Member · {profile.level || 'Silver'} Tier
          </Text>

          <View style={styles.heroIdentity}>
            {photoUrl ? (
              <Image
                source={{ uri: photoUrl }}
                style={styles.heroAvatar}
                onError={() =>
                  console.warn('[Profile] action=load_photo status=fail src=', photoUrl)
                }
                accessibilityLabel={`${profile.username}'s profile photo`}
              />
            ) : (
              <View
                style={[styles.heroAvatar, styles.heroAvatarPlaceholder]}
                accessibilityLabel={`${profile.username}'s profile photo placeholder`}
              >
                <Text style={styles.heroAvatarInitial}>{userInitial}</Text>
              </View>
            )}
            <View style={styles.heroIdentityText}>
              <Text style={styles.heroDisplayName}>{profile.username}</Text>
              <Text style={styles.heroTagline}>
                {profile.bio || 'No bio yet — tell Harlem who you are!'}
              </Text>
            </View>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Score</Text>
              <Text style={styles.heroStatValue}>{profile.score || 0}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Tier</Text>
              <Text style={[styles.heroStatValue, styles.heroStatValueTier]}>
                {profile.level || 'Silver'}
              </Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Total Votes</Text>
              <Text style={styles.heroStatValue}>{voteHistory?.totalCount ?? 0}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, styles.heroCta]}
            onPress={() => setShowEditWizard(true)}
          >
            <Edit3 size={14} color={COLORS.textWhite} />
            <Text style={styles.btnText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* ============== FEATURED (supported artist) ============== */}
        {supportedArtist && featuredArt ? (
          <ImageBackground
            source={{ uri: featuredArt }}
            style={styles.featured}
            imageStyle={styles.featuredImage}
            accessibilityLabel={`Supporting ${supportedArtist.username}`}
          >
            <LinearGradient
              colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.85)']}
              style={styles.featuredOverlay}
            />
            <View style={styles.featuredContent}>
              <Text style={styles.featuredTag}>You support</Text>
              <Text style={styles.featuredTitle}>{supportedArtist.username}</Text>
              <Text style={styles.featuredSub}>
                {hasPlayableSong
                  ? `Featured track: ${featuredTitle}`
                  : 'No featured track yet'}
              </Text>

              <View style={styles.featuredActions}>
                {hasPlayableSong && (
                  <TouchableOpacity style={styles.featuredCta} onPress={playDefaultSong}>
                    <Play size={12} color={COLORS.bgBlack} fill={COLORS.bgBlack} />
                    <Text style={styles.featuredCtaText}>Listen</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.featuredChange}
                  onPress={() => setShowArtistPicker(true)}
                >
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
                  <TouchableOpacity
                    style={styles.pendingCancel}
                    onPress={cancelPendingArtist}
                    disabled={cancellingPending}
                  >
                    <Text style={styles.pendingCancelText}>
                      {cancellingPending ? 'Cancelling…' : 'Cancel'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ImageBackground>
        ) : (
          <View style={[styles.featured, styles.featuredEmpty]}>
            <View style={styles.featuredContent}>
              <Text style={styles.featuredTag}>You support</Text>
              <Text style={styles.featuredTitle}>No artist yet</Text>
              <Text style={styles.featuredSub}>
                Find an artist whose voice you want to amplify.
              </Text>
              <TouchableOpacity
                style={[styles.featuredCta, styles.featuredCtaEmpty]}
                onPress={() => setShowArtistPicker(true)}
              >
                <Heart size={12} color={COLORS.bgBlack} />
                <Text style={styles.featuredCtaText}>Choose an artist</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ============== VOTE HISTORY ============== */}
        <CollapsibleSection
          id="vote-history"
          eyebrow="Your Activity"
          title="Vote history"
        >
          <VoteHistorySection userId={user.userId} />
        </CollapsibleSection>

        {/* ============== REFERRAL ============== */}
        <CollapsibleSection
          id="referral"
          eyebrow="Grow the network"
          title="Refer & earn"
        >
          <VerificationGate title="Verify your phone to refer & earn">
            <ReferralCodeCard
              referralCode={referralCode}
              username={profile.username}
              isArtist={profile.role === 'artist'}
            />
          </VerificationGate>
        </CollapsibleSection>

        {/* ============== SOCIAL LINKS ============== */}
        <CollapsibleSection
          id="social-links"
          eyebrow="Find me online"
          title="Social links"
        >
          <SocialLinksSection
            userId={user.userId}
            profile={profile}
            onUpdated={reload}
          />
        </CollapsibleSection>

        {/* ============== PREFERENCES ============== */}
        <CollapsibleSection
          id="theme"
          eyebrow="Personalization"
          title="Color theme"
        >
          {/*
            ThemePicker keeps its useAuth()-based state (theme/setTheme were
            added to the mobile AuthContext as part of this port). Theme lives
            in AuthContext, not in the profile summary, so it was never part
            of the fetch waterfall.
          */}
          <ThemePicker userId={user.userId} />
        </CollapsibleSection>

        {/* ============== ACCOUNT (toggles) ============== */}
        <CollapsibleSection
          id="account"
          eyebrow="Account"
          title="Notifications & privacy"
        >
          <AccountSettings
            userId={user.userId}
            settings={settings}
            onUpdated={reload}
          />
        </CollapsibleSection>

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
              accessibilityLabel="Delete account permanently"
            >
              <Trash2 size={14} color={COLORS.textWhite} />
              <Text style={styles.btnText}>Delete Account</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>

      {/* ============== WIZARDS / MODALS ============== */}
      {showEditWizard && (
        <Editprofilewizard
          visible={showEditWizard}
          onClose={() => setShowEditWizard(false)}
          onSuccess={() => {
            setShowEditWizard(false);
            reload();
          }}
          user={{
            userId: profile.userId,
            username: profile.username,
            bio: profile.bio,
            photoUrl: profile.photoUrl || null,
          }}
          isArtist={profile.role === 'artist'}
        />
      )}

      {showDeleteWizard && (
        <DeleteAccountWizard
          visible={showDeleteWizard}
          onClose={() => setShowDeleteWizard(false)}
        />
      )}

      <ChangePasswordWizard
        visible={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />

      <SupportedArtistPicker
        show={showArtistPicker}
        onClose={() => setShowArtistPicker(false)}
        userId={user.userId}
        currentArtistId={supportedArtist?.userId || null}
        userJurisdictionId={user.jurisdiction?.jurisdictionId}
        userJurisdictionName={user.jurisdiction?.name}
        onSuccess={reload}
      />
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bgBlack,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fullscreenMsg: {
    color: COLORS.textGray,
    fontSize: 15,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120, // clear the mini player / tab bar
  },

  // ---- Section loader/error ----
  sectionState: {
    alignItems: 'center',
  },
  sectionStateText: {
    color: COLORS.textGray,
    fontSize: 14,
    marginTop: 12,
  },
  sectionErrorText: {
    color: COLORS.errorRed,
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 20,
  },
  retryBtnText: {
    color: COLORS.textWhite,
    fontSize: 13,
    fontWeight: '600',
  },

  // ---- Hero ----
  hero: {
    backgroundColor: COLORS.cardBg,
    borderColor: COLORS.borderSubtle,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
  },
  heroEyebrow: {
    color: COLORS.unisBlueBright,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  heroIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  heroAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  heroAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarInitial: {
    color: COLORS.textWhite,
    fontSize: 28,
    fontWeight: '800',
  },
  heroIdentityText: {
    flex: 1,
    marginLeft: 16,
  },
  heroDisplayName: {
    color: COLORS.textWhite,
    fontSize: 26,
    fontWeight: '800',
  },
  heroTagline: {
    color: COLORS.textGray,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  heroStats: {
    flexDirection: 'row',
    borderTopColor: COLORS.borderSubtle,
    borderTopWidth: 1,
    paddingTop: 14,
    marginBottom: 16,
  },
  heroStat: {
    flex: 1,
  },
  heroStatLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroStatValue: {
    color: COLORS.textWhite,
    fontSize: 20,
    fontWeight: '800',
  },
  heroStatValueTier: {
    color: COLORS.unisBlueBright,
  },
  heroCta: {
    alignSelf: 'flex-start',
  },

  // ---- Shared buttons ----
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
  btnPrimary: {
    backgroundColor: COLORS.unisBlue,
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  btnDanger: {
    backgroundColor: COLORS.dangerRed,
  },
  btnText: {
    color: COLORS.textWhite,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },

  // ---- Featured (supported artist) ----
  featured: {
    borderRadius: 18,
    overflow: 'hidden',
    minHeight: 220,
    marginBottom: 16,
    justifyContent: 'flex-end',
  },
  featuredImage: {
    borderRadius: 18,
  },
  featuredOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  featuredEmpty: {
    backgroundColor: COLORS.cardBg,
    borderColor: COLORS.borderSubtle,
    borderWidth: 1,
  },
  featuredContent: {
    padding: 20,
  },
  featuredTag: {
    color: COLORS.textSilver,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  featuredTitle: {
    color: COLORS.textWhite,
    fontSize: 24,
    fontWeight: '800',
  },
  featuredSub: {
    color: COLORS.textSilver,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 14,
  },
  featuredActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featuredCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.textWhite,
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 16,
    marginRight: 10,
  },
  featuredCtaEmpty: {
    alignSelf: 'flex-start',
  },
  featuredCtaText: {
    color: COLORS.bgBlack,
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 6,
  },
  featuredChange: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  featuredChangeText: {
    color: COLORS.textWhite,
    fontSize: 13,
    fontWeight: '700',
  },

  // ---- Pending banner ----
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 14,
  },
  pendingText: {
    color: COLORS.textSilver,
    fontSize: 12,
    flex: 1,
    marginLeft: 6,
  },
  pendingStrong: {
    color: COLORS.textWhite,
    fontWeight: '700',
  },
  pendingCancel: {
    marginLeft: 8,
  },
  pendingCancelText: {
    color: COLORS.unisBlueBright,
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  // ---- Danger zone ----
  danger: {
    borderColor: 'rgba(220, 53, 69, 0.35)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
  },
  dangerHeading: {
    color: COLORS.textWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  dangerText: {
    color: COLORS.textGray,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  dangerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});

export default ProfileScreen;