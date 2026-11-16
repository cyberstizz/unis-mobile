// src/components/Commentsection.tsx
// ─────────────────────────────────────────────────────────────
// Comments for songs and videos — mobile port of web src/commentSection.jsx
// (modeled on YouTube's comments, in the Unis look):
//
//   • Thumbs-up like with a live count. No dislikes. Likes are optimistic and
//     "latest tap wins", so fast double taps never leave the count out of
//     sync with the server.
//   • Reply on every comment AND reply. Threads stay one level deep:
//     replying to a reply posts under the original comment, starting @user.
//   • Long comments fold to four lines with Read more.
//   • Top / Newest sort. Liking never reorders the list under your thumb.
//   • Glow icons that follow the theme. Delete asks first; failures toast.
//   • Per-track comment allowance ("2 comments left on this track").
//
// Phones on web get a collapsed preview card that opens a bottom sheet —
// that's the default here too. Pass `embedded` when the section is already
// inside a sheet (the Player's Comments sheet): list + composer render inline.
//
// Pass either `songId` (+ `songArtistId`) or `videoId` (+ `artistId`).
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Image,
  Modal,
  ScrollView,
  Animated,
  NativeSyntheticEvent,
  TextLayoutEventData,
} from 'react-native';
import axiosInstance from '../services/axiosInstance';
import { buildUrl } from '../utils/buildUrl';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';
import { useUnisTheme, UnisTheme } from '../theme/unisTheme';
import { COMMENT_MAX_LENGTH } from '../data/helpFigures';
import { openScreen } from '../navigation/navigationRef';
import VerificationGate from './VerificationGate';
import Sheet from './ui/Sheet';
import {
  LikeIcon,
  CommentIcon,
  TrashIcon,
  ChevronDownIcon,
  InfoIcon,
  MoreIcon,
  CloseIcon,
  SendIcon,
} from '../icons/UnisIcons';

// ── Formatting ──────────────────────────────────────────────

/** YouTube-style counts: 7, 999, 1.2K, 15K, 1.2M. Zero shows nothing. */
function formatCount(n: any) {
  const value = Number(n) || 0;
  if (value <= 0) return '';
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

const TIME_UNITS: [string, number][] = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

function timeAgo(dateString: string) {
  const then = new Date(dateString).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  for (const [unit, size] of TIME_UNITS) {
    const n = Math.floor(seconds / size);
    if (n >= 1) return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}

/** "Top": likes plus replies, newest first on ties. Returns ids only. */
function rankIds(list: any[], mode: 'top' | 'newest') {
  const cloned = [...list];
  const time = (c: any) => new Date(c.createdAt).getTime();
  if (mode === 'newest') {
    cloned.sort((a, b) => time(b) - time(a));
  } else {
    const score = (c: any) => (Number(c.likeCount) || 0) + (c.replies?.length || Number(c.replyCount) || 0);
    cloned.sort((a, b) => score(b) - score(a) || time(b) - time(a));
  }
  return cloned.map((c) => c.commentId);
}

/** Server message for a 4xx (e.g. the comment limit), otherwise the fallback. */
function errorText(error: any, fallback: string) {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const message = data && (data.message || data.error);
  return status && status < 500 && typeof message === 'string' && message ? message : fallback;
}

// ── Small building blocks ───────────────────────────────────

const AVATAR_SIZE = { xs: 24, sm: 30, md: 38 };

const Avatar: React.FC<{ name?: string; photoUrl?: string | null; size?: keyof typeof AVATAR_SIZE; t: UnisTheme }> = ({ name, photoUrl, size = 'md', t }) => {
  const src = buildUrl(photoUrl);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const d = AVATAR_SIZE[size];
  if (src && !broken) {
    return <Image source={{ uri: src }} style={{ width: d, height: d, borderRadius: d / 2 }} onError={() => setBroken(true)} />;
  }
  return (
    <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: t.textAccent, fontWeight: '800', fontSize: d * 0.42 }}>{(name || '?').charAt(0).toUpperCase()}</Text>
    </View>
  );
};

/** Comment body: folds past four lines, highlights a leading @mention. */
const CommentText: React.FC<{ text: string; t: UnisTheme }> = ({ text, t }) => {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState<boolean | null>(null);
  useEffect(() => { setOverflows(null); setExpanded(false); }, [text]);
  const content = text || '';
  const mention = content.match(/^@\S+/);
  const onLayout = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
    if (overflows === null) setOverflows(e.nativeEvent.lines.length > 4);
  };
  return (
    <>
      <Text
        style={styles.text}
        numberOfLines={overflows && !expanded ? 4 : undefined}
        onTextLayout={onLayout}
      >
        {mention ? (
          <>
            <Text style={{ color: t.textAccent, fontWeight: '700' }}>{mention[0]}</Text>
            {content.slice(mention[0].length)}
          </>
        ) : content}
      </Text>
      {overflows && (
        <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6} accessibilityState={{ expanded }}>
          <Text style={styles.more}>{expanded ? 'Show less' : 'Read more'}</Text>
        </Pressable>
      )}
    </>
  );
};

/** Like icon with a small pop when it turns on. */
const LikeButton: React.FC<{ liked: boolean; count: number; label: string; onPress: () => void }> = ({ liked, count, label, onPress }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    if (!liked) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.3, duration: 110, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
    onPress();
  };
  return (
    <Pressable style={styles.actionBtn} onPress={press} accessibilityRole="button" accessibilityState={{ selected: liked }} accessibilityLabel={label} hitSlop={6}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <LikeIcon size={18} active={liked} />
      </Animated.View>
      {count > 0 && <Text style={styles.actionCount}>{formatCount(count)}</Text>}
    </Pressable>
  );
};

// ── Comment section ─────────────────────────────────────────

interface CommentSectionProps {
  songId?: string;
  videoId?: string;
  userId?: string | null;
  songArtistId?: string | null;
  artistId?: string | null;
  /** Already inside a sheet: render list + composer inline. */
  embedded?: boolean;
}

type PendingDelete = { commentId: string; parentId: string | null; ownComment: boolean } | null;
type ReplyTarget = { parentId: string; anchorId: string; username?: string } | null;

const CommentSection: React.FC<CommentSectionProps> = ({ songId, videoId, userId, songArtistId, artistId, embedded }) => {
  const mediaType = videoId ? 'video' : 'song';
  const mediaId = videoId || songId;
  const mediaArtistId = songArtistId ?? artistId ?? null;
  const mediaNoun = mediaType === 'video' ? 'video' : 'track';

  const t = useUnisTheme();
  const { user: viewer } = useAuth();
  const feedback = useFeedback();

  const [comments, setComments] = useState<any[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [sortMode, setSortMode] = useState<'top' | 'newest'>('top');
  const [commentCount, setCommentCount] = useState({ totalCount: 0, topLevelCount: 0 });
  const [commentLimit, setCommentLimit] = useState({ count: 0, limit: 3, remaining: 3, limitReached: false });

  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget>(null);
  const [replyContent, setReplyContent] = useState('');
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [menuFor, setMenuFor] = useState<PendingDelete>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const composerRef = useRef<TextInput>(null);
  const replyInputRef = useRef<TextInput>(null);
  const listRef = useRef<ScrollView>(null);
  const sortModeRef = useRef(sortMode);
  sortModeRef.current = sortMode;
  const mountedRef = useRef(true);
  const likeSync = useRef(new Map<string, { want: boolean; server: boolean; serverCount: number; busy: boolean }>());

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const showToast = useCallback((message: string) => feedback.info(message), [feedback]);

  const fetchUserCommentCount = useCallback(async () => {
    if (!userId || !mediaId) return;
    try {
      const res = await axiosInstance.get(`/v1/comments/${mediaType}/${mediaId}/user-count`);
      if (mountedRef.current && res?.data) setCommentLimit(res.data);
    } catch (error) {
      console.warn('Failed to fetch comment limit:', error);
    }
  }, [mediaType, mediaId, userId]);

  // ── Load comments, the total, and this viewer's allowance ──
  useEffect(() => {
    if (!mediaId) return undefined;
    let cancelled = false;
    likeSync.current = new Map();
    setComments([]);
    setOrder([]);
    setCommentCount({ totalCount: 0, topLevelCount: 0 });
    setExpandedReplies({});
    setLoading(true);
    setLoadError(false);
    setReplyTarget(null);

    (async () => {
      try {
        const res = await axiosInstance.get(`/v1/comments/${mediaType}/${mediaId}`);
        if (cancelled) return;
        const list = Array.isArray(res?.data) ? res.data : [];
        setComments(list);
        setOrder(rankIds(list, sortModeRef.current));
      } catch (error) {
        console.error('Failed to fetch comments:', error);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    (async () => {
      try {
        const res = await axiosInstance.get(`/v1/comments/${mediaType}/${mediaId}/count`);
        if (!cancelled && res?.data) setCommentCount(res.data);
      } catch (error) {
        console.error('Failed to fetch comment count:', error);
      }
    })();

    fetchUserCommentCount();
    return () => { cancelled = true; };
  }, [mediaType, mediaId, userId, reloadKey, fetchUserCommentCount]);

  // Focus the reply box when it opens.
  useEffect(() => {
    if (replyTarget) setTimeout(() => replyInputRef.current?.focus(), 60);
  }, [replyTarget]);

  const displayed = useMemo(() => {
    const byId = new Map(comments.map((c) => [c.commentId, c]));
    return order.map((id) => byId.get(id)).filter(Boolean);
  }, [comments, order]);

  const previewComment = displayed[0];
  const totalCount = Number(commentCount.totalCount) || 0;

  const changeSort = (mode: 'top' | 'newest') => {
    if (mode === sortMode) return;
    setSortMode(mode);
    setOrder(rankIds(comments, mode));
  };

  // ── Likes ─────────────────────────────────────────────────
  const applyLike = useCallback((commentId: string, liked: boolean, count: number) => {
    const patch = (c: any) => (c.commentId === commentId ? { ...c, likedByMe: liked, likeCount: count } : c);
    setComments((prev) =>
      prev.map((c) => {
        if (c.commentId === commentId) return patch(c);
        if (c.replies?.some((r: any) => r.commentId === commentId)) return { ...c, replies: c.replies.map(patch) };
        return c;
      }),
    );
  }, []);

  // One request in flight per comment; taps made meanwhile just move `want`.
  const flushLike = useCallback(async (commentId: string) => {
    const s = likeSync.current.get(commentId);
    if (!s || s.busy) return;
    s.busy = true;
    try {
      while (s.want !== s.server) {
        const target = s.want;
        const res = target
          ? await axiosInstance.post(`/v1/comments/${commentId}/like`)
          : await axiosInstance.delete(`/v1/comments/${commentId}/like`);
        s.server = target;
        const n = Number(res?.data?.likeCount);
        s.serverCount = Number.isFinite(n) ? n : Math.max(0, s.serverCount + (target ? 1 : -1));
      }
      if (mountedRef.current && likeSync.current.get(commentId) === s) applyLike(commentId, s.server, s.serverCount);
    } catch (error) {
      console.error('Failed to update comment like:', error);
      s.want = s.server;
      if (mountedRef.current && likeSync.current.get(commentId) === s) {
        applyLike(commentId, s.server, s.serverCount);
        showToast(errorText(error, "Couldn't save your like. Try again."));
      }
    } finally {
      s.busy = false;
    }
  }, [applyLike, showToast]);

  const toggleLike = (comment: any) => {
    if (!userId) { showToast('Log in to like comments'); return; }
    const id = comment.commentId;
    let s = likeSync.current.get(id);
    if (!s) {
      const liked = !!comment.likedByMe;
      s = { want: liked, server: liked, serverCount: Math.max(0, Number(comment.likeCount) || 0), busy: false };
      likeSync.current.set(id, s);
    }
    s.want = !s.want;
    const delta = s.want === s.server ? 0 : s.want ? 1 : -1;
    applyLike(id, s.want, Math.max(0, s.serverCount + delta));
    flushLike(id);
  };

  // ── Posting ───────────────────────────────────────────────
  const handleSubmitComment = async () => {
    const content = newComment.trim();
    if (!content || !userId || submitting) return;
    setSubmitting(true);
    try {
      const res = await axiosInstance.post('/v1/comments', { ...(videoId ? { videoId } : { songId }), content });
      const created = res.data;
      // Your new comment goes to the top, whatever the sort.
      setComments((prev) => [created, ...prev]);
      setOrder((prev) => [created.commentId, ...prev.filter((id) => id !== created.commentId)]);
      setNewComment('');
      composerRef.current?.blur();
      listRef.current?.scrollTo({ y: 0, animated: true });
      setCommentCount((prev) => ({
        totalCount: (Number(prev.totalCount) || 0) + 1,
        topLevelCount: (Number(prev.topLevelCount) || 0) + 1,
      }));
      setCommentLimit((prev) => ({
        ...prev,
        count: prev.count + 1,
        remaining: Math.max(0, prev.remaining - 1),
        limitReached: prev.count + 1 >= prev.limit,
      }));
    } catch (error) {
      console.error('Failed to post comment:', error);
      showToast(errorText(error, "Couldn't post your comment. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const openReply = (target: any, anchor: any) => {
    if (!userId) { showToast('Log in to reply'); return; }
    const isSame = replyTarget && replyTarget.anchorId === anchor.commentId && replyTarget.parentId === target.commentId;
    if (isSame) { setReplyTarget(null); return; }
    setReplyContent(anchor.commentId !== target.commentId && anchor.username ? `@${anchor.username} ` : '');
    setReplyTarget({ parentId: target.commentId, anchorId: anchor.commentId, username: anchor.username });
  };

  const closeReply = () => {
    setReplyTarget(null);
    setReplyContent('');
  };

  const handleSubmitReply = async () => {
    const content = replyContent.trim();
    if (!replyTarget || !content || !userId || submitting) return;
    const { parentId } = replyTarget;
    setSubmitting(true);
    try {
      const res = await axiosInstance.post('/v1/comments', { ...(videoId ? { videoId } : { songId }), parentCommentId: parentId, content });
      setComments((prev) =>
        prev.map((c) =>
          c.commentId === parentId ? { ...c, replies: [...(c.replies || []), res.data], replyCount: (Number(c.replyCount) || 0) + 1 } : c,
        ),
      );
      setExpandedReplies((prev) => ({ ...prev, [parentId]: true }));
      closeReply();
      setCommentCount((prev) => ({ ...prev, totalCount: (Number(prev.totalCount) || 0) + 1 }));
      setCommentLimit((prev) => ({
        ...prev,
        count: prev.count + 1,
        remaining: Math.max(0, prev.remaining - 1),
        limitReached: prev.count + 1 >= prev.limit,
      }));
    } catch (error) {
      console.error('Failed to post reply:', error);
      showToast(errorText(error, "Couldn't post your reply. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Deleting ──────────────────────────────────────────────
  const confirmDelete = async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    const { commentId, parentId } = target;
    try {
      await axiosInstance.delete(`/v1/comments/${commentId}`);
      if (parentId) {
        setComments((prev) =>
          prev.map((c) =>
            c.commentId === parentId
              ? { ...c, replies: (c.replies || []).filter((r: any) => r.commentId !== commentId), replyCount: Math.max(0, (Number(c.replyCount) || 1) - 1) }
              : c,
          ),
        );
        setCommentCount((prev) => ({ ...prev, totalCount: Math.max(0, (Number(prev.totalCount) || 0) - 1) }));
      } else {
        setComments((prev) => prev.filter((c) => c.commentId !== commentId));
        setOrder((prev) => prev.filter((id) => id !== commentId));
        setCommentCount((prev) => ({
          totalCount: Math.max(0, (Number(prev.totalCount) || 0) - 1),
          topLevelCount: Math.max(0, (Number(prev.topLevelCount) || 0) - 1),
        }));
      }
      if (replyTarget && (replyTarget.anchorId === commentId || replyTarget.parentId === commentId)) closeReply();
      if (target.ownComment) fetchUserCommentCount();
      showToast('Comment deleted');
    } catch (error) {
      console.error('Failed to delete comment:', error);
      showToast(errorText(error, "Couldn't delete that comment. Try again."));
    }
  };

  const canDelete = (c: any) => !!userId && (c.userId === userId || mediaArtistId === userId);
  const toggleReplies = (id: string) => setExpandedReplies((prev) => ({ ...prev, [id]: !prev[id] }));

  // ── Rendering ─────────────────────────────────────────────
  const viewerAvatar = (size: keyof typeof AVATAR_SIZE) =>
    userId ? (
      <Avatar name={viewer?.username} photoUrl={(viewer as any)?.photoUrl} size={size} t={t} />
    ) : (
      <View style={[styles.ghostAvatar, { width: AVATAR_SIZE[size], height: AVATAR_SIZE[size], borderRadius: AVATAR_SIZE[size] / 2 }]}>
        <CommentIcon size={size === 'md' ? 18 : 14} />
      </View>
    );

  const remainingHint =
    userId && commentLimit.remaining > 0 && commentLimit.remaining <= 2
      ? `${commentLimit.remaining} ${commentLimit.remaining === 1 ? 'comment' : 'comments'} left on this ${mediaNoun}`
      : null;

  const renderComposer = () => {
    if (!userId) {
      return (
        <Pressable style={styles.guest} onPress={() => showToast('Log in to join the conversation')}>
          {viewerAvatar('sm')}
          <Text style={styles.guestText}>Log in to join the conversation</Text>
        </Pressable>
      );
    }
    if (commentLimit.limitReached) {
      return (
        <View style={styles.limit}>
          <Text style={styles.limitText}>
            You've used all {commentLimit.limit} comments on this {mediaNoun}. You can still reply when someone responds to your comments.
          </Text>
        </View>
      );
    }
    const canSubmit = !!newComment.trim() && !submitting;
    return (
      <VerificationGate compact title="Verify your phone to comment">
        <View style={styles.composer}>
          {viewerAvatar('sm')}
          <View style={[styles.pill, { borderColor: t.border }]}>
            <TextInput
              ref={composerRef}
              value={newComment}
              onChangeText={setNewComment}
              placeholder="Add a comment..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              accessibilityLabel="Add a comment"
              multiline
              maxLength={COMMENT_MAX_LENGTH}
              style={styles.input}
            />
            <Pressable
              onPress={handleSubmitComment}
              disabled={!canSubmit}
              style={[styles.send, { backgroundColor: canSubmit ? t.primary : 'rgba(255,255,255,0.08)' }]}
              accessibilityLabel="Post comment"
            >
              <SendIcon size={18} tone="on" />
            </Pressable>
          </View>
        </View>
        {remainingHint && <Text style={styles.hint}>{remainingHint}</Text>}
      </VerificationGate>
    );
  };

  const renderReplyBox = () => {
    const canSubmit = !!replyContent.trim() && !submitting;
    return (
      <View style={styles.replyBox}>
        <VerificationGate compact title="Verify your phone to reply">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {viewerAvatar('xs')}
            <View style={{ flex: 1 }}>
              <TextInput
                ref={replyInputRef}
                value={replyContent}
                onChangeText={setReplyContent}
                placeholder={`Reply to ${replyTarget?.username || 'this comment'}...`}
                placeholderTextColor="rgba(255,255,255,0.4)"
                accessibilityLabel={`Reply to ${replyTarget?.username || 'this comment'}`}
                multiline
                maxLength={COMMENT_MAX_LENGTH}
                style={[styles.replyInput, { borderBottomColor: t.primary }]}
              />
              <View style={styles.replyActions}>
                <Pressable style={styles.ghostBtn} onPress={closeReply}><Text style={styles.ghostBtnText}>Cancel</Text></Pressable>
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: t.primary }, !canSubmit && { opacity: 0.45 }]}
                  onPress={handleSubmitReply}
                  disabled={!canSubmit}
                >
                  <Text style={styles.primaryBtnText}>Reply</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </VerificationGate>
      </View>
    );
  };

  const renderComment = (comment: any, thread: any = null): React.ReactNode => {
    const isReply = !!thread;
    const owner = thread || comment;
    const canReply = !!userId && (!commentLimit.limitReached || owner.userId === userId);
    const showReplyButton = !userId || canReply;
    const liked = !!comment.likedByMe;
    const likeCount = Math.max(0, Number(comment.likeCount) || 0);
    const replies = !isReply ? comment.replies || [] : [];
    const repliesOpen = !!expandedReplies[comment.commentId];
    const replyActive = replyTarget?.anchorId === comment.commentId;

    return (
      <View key={comment.commentId} style={[styles.comment, isReply && styles.reply]} accessibilityLabel={`Comment by ${comment.username || 'a listener'}`}>
        <Avatar name={comment.username} photoUrl={comment.userPhotoUrl} size={isReply ? 'sm' : 'md'} t={t} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.meta}>
            <Text style={styles.author} numberOfLines={1}>{comment.username}</Text>
            {!!comment.userJurisdictionName && <Text style={[styles.place, { color: t.textAccent }]} numberOfLines={1}>{comment.userJurisdictionName}</Text>}
            <Text style={styles.time}>{timeAgo(comment.createdAt)}</Text>
          </View>

          <CommentText text={comment.content} t={t} />

          <View style={styles.actions}>
            <LikeButton
              liked={liked}
              count={likeCount}
              label={`Like comment by ${comment.username || 'a listener'}${likeCount ? `, ${likeCount} ${likeCount === 1 ? 'like' : 'likes'}` : ''}`}
              onPress={() => toggleLike(comment)}
            />
            {showReplyButton && (
              <Pressable style={styles.actionBtn} onPress={() => openReply(owner, comment)} accessibilityLabel={`Reply to ${comment.username || 'this comment'}`} hitSlop={6}>
                <CommentIcon size={18} active={replyActive} />
              </Pressable>
            )}
          </View>

          {replyActive && renderReplyBox()}

          {replies.length > 0 && (
            <View style={{ marginTop: 4 }}>
              <Pressable style={styles.threadToggle} onPress={() => toggleReplies(comment.commentId)} accessibilityState={{ expanded: repliesOpen }}>
                <View style={{ transform: [{ rotate: repliesOpen ? '180deg' : '0deg' }] }}><ChevronDownIcon size={18} /></View>
                <Text style={[styles.threadText, { color: t.textAccent }]}>{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</Text>
              </Pressable>
              {repliesOpen && <View>{replies.map((r: any) => renderComment(r, comment))}</View>}
            </View>
          )}
        </View>

        {canDelete(comment) && (
          <Pressable
            style={styles.kebab}
            onPress={() => setMenuFor({ commentId: comment.commentId, parentId: isReply ? thread.commentId : null, ownComment: comment.userId === userId })}
            accessibilityLabel="Comment options"
            hitSlop={8}
          >
            <MoreIcon size={18} />
          </Pressable>
        )}
      </View>
    );
  };

  const renderList = () => {
    if (loading) {
      return (
        <View accessibilityLabel="Loading comments...">
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skelRow}>
              <View style={styles.skelAvatar} />
              <View style={{ flex: 1, gap: 8 }}>
                <View style={[styles.skelLine, { width: '40%' }]} />
                <View style={[styles.skelLine, { width: '85%' }]} />
              </View>
            </View>
          ))}
        </View>
      );
    }
    if (loadError) {
      return (
        <View style={styles.state}>
          <Text style={styles.stateTitle}>Couldn't load comments</Text>
          <Pressable style={styles.ghostBtn} onPress={() => setReloadKey((k) => k + 1)}><Text style={styles.ghostBtnText}>Try again</Text></Pressable>
        </View>
      );
    }
    if (displayed.length === 0) {
      return (
        <View style={styles.state}>
          <CommentIcon size={26} />
          <Text style={styles.stateTitle}>No comments yet</Text>
          <Text style={styles.stateText}>Be the first to share your thoughts</Text>
        </View>
      );
    }
    return displayed.map((c) => renderComment(c));
  };

  const renderSortChips = () => (
    <View style={styles.chips} accessibilityLabel="Sort comments">
      {(['top', 'newest'] as const).map((mode) => {
        const on = sortMode === mode;
        return (
          <Pressable key={mode} style={[styles.chip, on && { backgroundColor: '#fff' }]} onPress={() => changeSort(mode)} accessibilityState={{ selected: on }}>
            <Text style={[styles.chipText, on && { color: '#0b0b0f' }]}>{mode === 'top' ? 'Top' : 'Newest'}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const openHelp = () => {
    setIsSheetOpen(false);
    openScreen('Help', { section: 'comments' });
  };

  // List + composer, used inside the sheet (or the Player's sheet when embedded).
  const body = (
    <View style={{ flex: 1 }}>
      <View style={styles.sortRow}>{renderSortChips()}</View>
      <ScrollView ref={listRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
        {renderList()}
      </ScrollView>
      <View style={styles.composerWrap}>{renderComposer()}</View>
    </View>
  );

  const overlays = (
    <>
      {/* ⋯ menu */}
      <Modal visible={!!menuFor} transparent animationType="fade" onRequestClose={() => setMenuFor(null)}>
        <Pressable style={styles.dim} onPress={() => setMenuFor(null)}>
          <View style={styles.menuCard}>
            <Pressable
              style={styles.menuItem}
              onPress={() => { const m = menuFor; setMenuFor(null); setTimeout(() => setPendingDelete(m), 180); }}
              accessibilityRole="menuitem"
            >
              <TrashIcon size={17} />
              <Text style={styles.menuDanger}>Delete</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
      {/* "Delete comment?" */}
      <Modal visible={!!pendingDelete} transparent animationType="fade" onRequestClose={() => setPendingDelete(null)}>
        <Pressable style={[styles.dim, { justifyContent: 'center' }]} onPress={() => setPendingDelete(null)}>
          <Pressable style={styles.confirm} onPress={() => {}} accessibilityRole="alert">
            <Text style={styles.confirmTitle}>Delete comment?</Text>
            <Text style={styles.confirmText}>
              {pendingDelete?.ownComment ? 'Delete your comment permanently?' : 'Remove this comment from your release for everyone?'}
            </Text>
            <View style={styles.confirmActions}>
              <Pressable style={styles.ghostBtn} onPress={() => setPendingDelete(null)}><Text style={styles.ghostBtnText}>Cancel</Text></Pressable>
              <Pressable style={[styles.primaryBtn, { backgroundColor: '#dc2626' }]} onPress={confirmDelete}><Text style={styles.primaryBtnText}>Delete</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );

  if (embedded) {
    return (
      <View style={{ flex: 1 }}>
        {body}
        {overlays}
      </View>
    );
  }

  return (
    <View accessibilityLabel="Comments">
      {/* Collapsed preview card */}
      <Pressable style={[styles.preview, { borderColor: t.border }]} onPress={() => setIsSheetOpen(true)} accessibilityRole="button" accessibilityState={{ expanded: isSheetOpen }}>
        <View style={styles.previewHead}>
          <Text style={styles.previewTitle}>Comments</Text>
          {totalCount > 0 && <Text style={styles.previewCount}>{formatCount(totalCount)}</Text>}
          <View style={{ marginLeft: 'auto' }}><ChevronDownIcon size={18} /></View>
        </View>
        <View style={styles.previewBody}>
          {previewComment ? (
            <>
              <Avatar name={previewComment.username} photoUrl={previewComment.userPhotoUrl} size="xs" t={t} />
              <Text style={styles.previewText} numberOfLines={2}>{previewComment.content}</Text>
            </>
          ) : (
            <>
              {viewerAvatar('xs')}
              <Text style={styles.previewPlaceholder}>{loading ? 'Loading comments...' : 'Add a comment...'}</Text>
            </>
          )}
        </View>
      </Pressable>

      <Sheet visible={isSheetOpen} onClose={() => setIsSheetOpen(false)} fullHeight bare>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>
            Comments{totalCount > 0 ? <Text style={styles.sheetCount}>  {formatCount(totalCount)}</Text> : null}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pressable style={styles.iconBtn} onPress={openHelp} accessibilityLabel="How comments work"><InfoIcon size={20} /></Pressable>
            <Pressable style={styles.iconBtn} onPress={() => setIsSheetOpen(false)} accessibilityLabel="Close comments"><CloseIcon size={20} /></Pressable>
          </View>
        </View>
        {body}
        {overlays}
      </Sheet>
    </View>
  );
};

const styles = StyleSheet.create({
  // Preview card
  preview: { borderRadius: 16, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.04)', padding: 14 },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  previewCount: { color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: '700' },
  previewBody: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  previewText: { color: 'rgba(255,255,255,0.8)', fontSize: 13.5, flex: 1 },
  previewPlaceholder: { color: 'rgba(255,255,255,0.45)', fontSize: 13.5, flex: 1 },
  // Sheet
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  sheetCount: { color: 'rgba(255,255,255,0.55)', fontSize: 15, fontWeight: '700' },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  sortRow: { paddingHorizontal: 16, paddingBottom: 8 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  chipText: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: 13 },
  composerWrap: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)' },
  // Comment
  comment: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  reply: { paddingHorizontal: 0, paddingRight: 0 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  author: { color: '#fff', fontWeight: '700', fontSize: 13.5, maxWidth: '60%' },
  place: { fontSize: 11.5, fontWeight: '600' },
  time: { color: 'rgba(255,255,255,0.45)', fontSize: 11.5 },
  text: { color: 'rgba(255,255,255,0.88)', fontSize: 14, lineHeight: 20, marginTop: 3 },
  more: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, fontWeight: '700', marginTop: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 6 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2 },
  actionCount: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5, fontWeight: '600' },
  threadToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, alignSelf: 'flex-start' },
  threadText: { fontWeight: '700', fontSize: 13 },
  kebab: { paddingTop: 2 },
  // Composer
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 22, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.05)', paddingLeft: 14, paddingRight: 4, paddingVertical: 4 },
  input: { flex: 1, color: '#fff', fontSize: 15, maxHeight: 120, paddingTop: 8, paddingBottom: 8 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hint: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 6, marginLeft: 40 },
  guest: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  guestText: { color: 'rgba(255,255,255,0.65)', fontSize: 14 },
  limit: { padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  limitText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 19 },
  ghostAvatar: { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  // Reply box
  replyBox: { marginTop: 8 },
  replyInput: { color: '#fff', fontSize: 14, borderBottomWidth: 1, paddingVertical: 6, maxHeight: 120 },
  replyActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  ghostBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  ghostBtnText: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 13.5 },
  primaryBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
  // States
  state: { alignItems: 'center', paddingVertical: 34, gap: 8 },
  stateTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  stateText: { color: 'rgba(255,255,255,0.55)', fontSize: 13 },
  skelRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  skelAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.07)' },
  skelLine: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.07)' },
  // Menu / confirm
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', padding: 16 },
  menuCard: { borderRadius: 16, backgroundColor: '#161922', overflow: 'hidden', marginBottom: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  menuDanger: { color: '#f87171', fontWeight: '700', fontSize: 15 },
  confirm: { borderRadius: 20, backgroundColor: '#161922', padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  confirmTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  confirmText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 20, marginTop: 8 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
});

export default CommentSection;
