// src/components/CommentSection.tsx
// Premium comment section ported from web CommentSection.jsx
// Ambient-aware styling — accepts dominantColor prop from SongScreen
// Features: fetch/post/delete comments, threaded replies, expand/collapse, avatars

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  MessageCircle,
  Send,
  Reply,
  Trash2,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';

import axiosInstance, { getMediaUrl } from '../services/axiosInstance';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// =============================================================================
// TYPES
// =============================================================================

interface CommentUser {
  userId: string;
  username: string;
  userPhotoUrl?: string | null;
  userJurisdictionName?: string | null;
}

interface CommentData {
  commentId: string;
  songId: string;
  userId: string;
  username: string;
  userPhotoUrl?: string | null;
  userJurisdictionName?: string | null;
  content: string;
  createdAt: string;
  parentCommentId?: string | null;
  replies?: CommentData[];
  replyCount?: number;
}

interface CommentCount {
  totalCount: number;
  topLevelCount: number;
}

interface CommentSectionProps {
  songId: string;
  userId: string | null;
  songArtistId: string;
  dominantColor?: string; // ambient glow color from SongScreen
}

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const COLORS = {
  bgBlack: '#000000',
  subtleBlack: '#1a1a1a',
  textSilver: '#C0C0C0',
  textMuted: '#6B7280',
  accentWhite: '#FFFFFF',
  unisBlue: '#163387',
  glowOrange: '#FF6B35',
  dangerRed: '#EF4444',
  commentBg: 'rgba(26, 26, 26, 0.6)',
  commentBgHover: 'rgba(26, 26, 26, 0.8)',
};

// =============================================================================
// HELPERS
// =============================================================================

const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
};

// =============================================================================
// COMPONENT
// =============================================================================

const CommentSection: React.FC<CommentSectionProps> = ({
  songId,
  userId,
  songArtistId,
  dominantColor = 'rgba(22, 51, 135, 0.3)',
}) => {
  // State
  const [comments, setComments] = useState<CommentData[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [commentCount, setCommentCount] = useState<CommentCount>({
    totalCount: 0,
    topLevelCount: 0,
  });
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Refs
  const replyInputRef = useRef<TextInput>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Derive a solid accent from dominantColor for borders/glows
  // Falls back to orange if dominantColor is the default blue
  const accentColor =
    dominantColor === 'rgba(22, 51, 135, 0.3)' ? COLORS.glowOrange : dominantColor;

  // Parse out a usable rgba for subtle backgrounds
  const accentSubtle = `rgba(255, 107, 53, 0.15)`;

  // =========================================================================
  // DATA FETCHING
  // =========================================================================

  useEffect(() => {
    if (songId) {
      fetchComments();
      fetchCommentCount();
    }
  }, [songId]);

  useEffect(() => {
    if (replyingTo && replyInputRef.current) {
      replyInputRef.current.focus();
    }
  }, [replyingTo]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get(`/v1/comments/song/${songId}`);
      setComments(response.data || []);

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCommentCount = async () => {
    try {
      const response = await axiosInstance.get(`/v1/comments/song/${songId}/count`);
      setCommentCount(response.data);
    } catch (error) {
      console.error('Failed to fetch comment count:', error);
    }
  };

  // =========================================================================
  // ACTIONS
  // =========================================================================

  const handleSubmitComment = async () => {
    if (!newComment.trim() || !userId || submitting) return;

    setSubmitting(true);
    try {
      const response = await axiosInstance.post('/v1/comments', {
        songId,
        userId,
        content: newComment.trim(),
      });

      setComments((prev) => [response.data, ...prev]);
      setNewComment('');
      setCommentCount((prev) => ({
        totalCount: prev.totalCount + 1,
        topLevelCount: prev.topLevelCount + 1,
      }));
    } catch (error) {
      console.error('Failed to post comment:', error);
      Alert.alert('Error', 'Failed to post comment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReply = async (parentCommentId: string) => {
    if (!replyContent.trim() || !userId || submitting) return;

    setSubmitting(true);
    try {
      const response = await axiosInstance.post('/v1/comments', {
        songId,
        userId,
        parentCommentId,
        content: replyContent.trim(),
      });

      setComments((prev) =>
        prev.map((comment) => {
          if (comment.commentId === parentCommentId) {
            return {
              ...comment,
              replies: [...(comment.replies || []), response.data],
              replyCount: (comment.replyCount || 0) + 1,
            };
          }
          return comment;
        })
      );

      setExpandedReplies((prev) => ({ ...prev, [parentCommentId]: true }));
      setReplyContent('');
      setReplyingTo(null);
      setCommentCount((prev) => ({
        ...prev,
        totalCount: prev.totalCount + 1,
      }));
    } catch (error) {
      console.error('Failed to post reply:', error);
      Alert.alert('Error', 'Failed to post reply. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = (
    commentId: string,
    isReply: boolean = false,
    parentId: string | null = null
  ) => {
    Alert.alert('Delete Comment', 'Are you sure you want to delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await axiosInstance.delete(`/v1/comments/${commentId}?userId=${userId}`);

            if (isReply && parentId) {
              setComments((prev) =>
                prev.map((comment) => {
                  if (comment.commentId === parentId) {
                    return {
                      ...comment,
                      replies: (comment.replies || []).filter(
                        (r) => r.commentId !== commentId
                      ),
                      replyCount: Math.max(0, (comment.replyCount || 1) - 1),
                    };
                  }
                  return comment;
                })
              );
            } else {
              setComments((prev) => prev.filter((c) => c.commentId !== commentId));
              setCommentCount((prev) => ({
                totalCount: Math.max(0, prev.totalCount - 1),
                topLevelCount: Math.max(0, prev.topLevelCount - 1),
              }));
            }
          } catch (error) {
            console.error('Failed to delete comment:', error);
            Alert.alert('Error', 'Failed to delete comment.');
          }
        },
      },
    ]);
  };

  const toggleReplies = (commentId: string) => {
    setExpandedReplies((prev) => ({
      ...prev,
      [commentId]: !prev[commentId],
    }));
  };

  const canDelete = (comment: CommentData): boolean => {
    return !!(userId && (comment.userId === userId || songArtistId === userId));
  };

  // =========================================================================
  // RENDER: SINGLE COMMENT
  // =========================================================================

  const renderComment = (
    comment: CommentData,
    isReply: boolean = false,
    parentId: string | null = null
  ) => {
    const showReplies = expandedReplies[comment.commentId];
    const hasReplies = comment.replies && comment.replies.length > 0;
    const avatarUrl = comment.userPhotoUrl
      ? getMediaUrl(comment.userPhotoUrl)
      : null;

    return (
      <View
        key={comment.commentId}
        style={[
          styles.commentItem,
          isReply && [
            styles.commentReply,
            { borderLeftColor: accentColor },
          ],
        ]}
      >
        <View style={styles.commentContent}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={[
                  styles.userAvatar,
                  isReply && styles.userAvatarSmall,
                  { borderColor: accentColor },
                ]}
              />
            ) : (
              <View
                style={[
                  styles.userAvatar,
                  styles.userAvatarPlaceholder,
                  isReply && styles.userAvatarSmall,
                  { borderColor: accentColor },
                ]}
              >
                <Text style={[styles.avatarInitial, isReply && { fontSize: 12 }]}>
                  {comment.username?.charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
            )}
          </View>

          {/* Body */}
          <View style={styles.commentBody}>
            {/* Header row */}
            <View style={styles.commentHeader}>
              <View style={styles.userInfo}>
                <Text style={styles.username}>{comment.username}</Text>
                {comment.userJurisdictionName && (
                  <Text style={styles.userJurisdiction}>
                    {comment.userJurisdictionName}
                  </Text>
                )}
              </View>
              <Text style={styles.timestamp}>{formatTimeAgo(comment.createdAt)}</Text>

              {/* Delete menu */}
              {canDelete(comment) && (
                <View style={styles.commentMenu}>
                  <TouchableOpacity
                    style={styles.menuTrigger}
                    onPress={() =>
                      setActiveMenu(
                        activeMenu === comment.commentId ? null : comment.commentId
                      )
                    }
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MoreHorizontal size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>

                  {activeMenu === comment.commentId && (
                    <View style={styles.menuDropdown}>
                      <TouchableOpacity
                        style={styles.menuItemDelete}
                        onPress={() => {
                          setActiveMenu(null);
                          handleDeleteComment(comment.commentId, isReply, parentId);
                        }}
                      >
                        <Trash2 size={14} color={COLORS.dangerRed} />
                        <Text style={styles.menuItemDeleteText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Comment text */}
            <Text style={[styles.commentText, isReply && { fontSize: 13 }]}>
              {comment.content}
            </Text>

            {/* Reply button (top-level only) */}
            {!isReply && userId && (
              <TouchableOpacity
                style={[styles.replyTrigger, { borderColor: 'rgba(255,255,255,0.1)' }]}
                onPress={() =>
                  setReplyingTo(
                    replyingTo === comment.commentId ? null : comment.commentId
                  )
                }
                activeOpacity={0.7}
              >
                <Reply size={14} color={COLORS.textMuted} />
                <Text style={styles.replyTriggerText}>Reply</Text>
              </TouchableOpacity>
            )}

            {/* Reply input */}
            {replyingTo === comment.commentId && (
              <View style={styles.replyInputContainer}>
                <TextInput
                  ref={replyInputRef}
                  style={styles.replyInput}
                  value={replyContent}
                  onChangeText={setReplyContent}
                  placeholder={`Reply to ${comment.username}...`}
                  placeholderTextColor={COLORS.textMuted}
                  returnKeyType="send"
                  onSubmitEditing={() => handleSubmitReply(comment.commentId)}
                  editable={!submitting}
                />
                <TouchableOpacity
                  style={[
                    styles.replySubmitBtn,
                    (!replyContent.trim() || submitting) && styles.submitBtnDisabled,
                  ]}
                  onPress={() => handleSubmitReply(comment.commentId)}
                  disabled={!replyContent.trim() || submitting}
                >
                  <Send size={14} color={COLORS.accentWhite} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Replies section */}
        {hasReplies && !isReply && (
          <View style={styles.repliesSection}>
            <TouchableOpacity
              style={styles.toggleReplies}
              onPress={() => toggleReplies(comment.commentId)}
              activeOpacity={0.7}
            >
              {showReplies ? (
                <ChevronUp size={16} color={accentColor} />
              ) : (
                <ChevronDown size={16} color={accentColor} />
              )}
              <Text style={[styles.toggleRepliesText, { color: accentColor }]}>
                {showReplies ? 'Hide' : 'View'} {comment.replies!.length}{' '}
                {comment.replies!.length === 1 ? 'reply' : 'replies'}
              </Text>
            </TouchableOpacity>

            {showReplies && (
              <View style={styles.repliesList}>
                {comment.replies!.map((reply) =>
                  renderComment(reply, true, comment.commentId)
                )}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // =========================================================================
  // RENDER: MAIN
  // =========================================================================

  return (
    <View style={styles.sectionContainer}>
      {/* Ambient background */}
      <LinearGradient
        colors={[
          'rgba(22, 51, 135, 0.08)',
          'rgba(26, 26, 26, 0.95)',
          dominantColor,
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.ambientBg}
      />

      {/* Header */}
      <View style={styles.headerRow}>
        <MessageCircle size={22} color={accentColor} />
        <Text style={styles.headerTitle}>Comments</Text>
        {commentCount.totalCount > 0 && (
          <View style={[styles.countBadge, { backgroundColor: accentColor }]}>
            <Text style={styles.countBadgeText}>{commentCount.totalCount}</Text>
          </View>
        )}
      </View>

      {/* New comment input */}
      {userId ? (
        <View style={styles.newCommentForm}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.commentTextarea}
              value={newComment}
              onChangeText={setNewComment}
              placeholder="Share your thoughts on this track..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={1000}
              editable={!submitting}
            />
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!newComment.trim() || submitting) && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmitComment}
              disabled={!newComment.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={COLORS.accentWhite} />
              ) : (
                <Send size={16} color={COLORS.accentWhite} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.loginPrompt}>
          <Text style={styles.loginPromptText}>Log in to join the conversation</Text>
        </View>
      )}

      {/* Comments list */}
      <Animated.View style={[styles.commentsList, { opacity: fadeAnim }]}>
        {loading ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator size="large" color={accentColor} />
            <Text style={styles.stateText}>Loading comments...</Text>
          </View>
        ) : comments.length === 0 ? (
          <View style={styles.stateContainer}>
            <MessageCircle size={48} color={COLORS.textMuted} strokeWidth={1} />
            <Text style={styles.stateText}>No comments yet</Text>
            <Text style={styles.stateSubtext}>Be the first to share your thoughts</Text>
          </View>
        ) : (
          comments.map((comment) => renderComment(comment))
        )}
      </Animated.View>
    </View>
  );
};

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  // Container
  sectionContainer: {
    width: '100%',
    marginTop: 10,
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  ambientBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  headerTitle: {
    color: COLORS.accentWhite,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  countBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    color: COLORS.accentWhite,
    fontSize: 12,
    fontWeight: '700',
  },

  // New comment form
  newCommentForm: {
    marginBottom: 24,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 12,
    backgroundColor: COLORS.commentBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  commentTextarea: {
    flex: 1,
    color: COLORS.accentWhite,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 24,
    maxHeight: 120,
    paddingVertical: 0,
  },
  submitButton: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: COLORS.glowOrange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },

  // Login prompt
  loginPrompt: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: COLORS.commentBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderStyle: 'dashed',
    marginBottom: 24,
  },
  loginPromptText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },

  // Comments list
  commentsList: {
    gap: 0,
  },

  // Single comment
  commentItem: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 107, 53, 0.2)',
  },
  commentReply: {
    paddingVertical: 12,
    paddingLeft: 12,
    marginLeft: 44,
    borderLeftWidth: 2,
    borderBottomWidth: 0,
    backgroundColor: 'rgba(255, 107, 53, 0.04)',
    borderRadius: 0,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  commentContent: {
    flexDirection: 'row',
    gap: 12,
  },

  // Avatar
  avatarContainer: {
    flexShrink: 0,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
  },
  userAvatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  userAvatarPlaceholder: {
    backgroundColor: COLORS.unisBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: COLORS.accentWhite,
    fontSize: 16,
    fontWeight: '600',
  },

  // Comment body
  commentBody: {
    flex: 1,
    minWidth: 0,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  userInfo: {
    flexDirection: 'column',
    gap: 1,
  },
  username: {
    color: COLORS.accentWhite,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  userJurisdiction: {
    color: COLORS.unisBlue,
    fontSize: 11,
    fontWeight: '500',
  },
  timestamp: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginLeft: 4,
  },
  commentText: {
    color: COLORS.textSilver,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },

  // Menu
  commentMenu: {
    marginLeft: 'auto',
    position: 'relative',
  },
  menuTrigger: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuDropdown: {
    position: 'absolute',
    top: 32,
    right: 0,
    backgroundColor: COLORS.subtleBlack,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 4,
    minWidth: 120,
    zIndex: 100,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  menuItemDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  menuItemDeleteText: {
    color: COLORS.dangerRed,
    fontSize: 14,
  },

  // Reply trigger
  replyTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  replyTriggerText: {
    color: COLORS.textMuted,
    fontSize: 12,
  },

  // Reply input
  replyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  replyInput: {
    flex: 1,
    color: COLORS.accentWhite,
    fontSize: 14,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  replySubmitBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: COLORS.glowOrange,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Replies section
  repliesSection: {
    marginTop: 10,
    marginLeft: 44,
  },
  toggleReplies: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  toggleRepliesText: {
    fontSize: 13,
    fontWeight: '500',
  },
  repliesList: {
    marginTop: 4,
  },

  // States (loading / empty)
  stateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  stateText: {
    color: COLORS.textSilver,
    fontSize: 16,
    marginTop: 12,
  },
  stateSubtext: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
});

export default CommentSection;