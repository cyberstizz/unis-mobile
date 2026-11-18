// src/data/helpFigures.ts
// ─────────────────────────────────────────────────────────────
// Shared figures — mobile copy of the exported constants at the top of web
// src/data/helpContent.jsx. They must match the backend:
//
//   VOTE_POINTS                 → ScoreUpdateService.onVote (voter increment)
//   INTERVAL_WEIGHTS            → AwardService.VOTE_WEIGHTS
//   ENGAGEMENT_WEIGHTS          → AwardService.PLAY_WEIGHT / LIKE_WEIGHT
//   MESSAGE_REQUEST_DAILY_LIMIT → MessagingService.MAX_NEW_REQUESTS_PER_DAY
//   COMMENTS_PER_TRACK          → CommentService.MAX_COMMENTS_PER_USER_PER_SONG
//   COMMENT_MAX_LENGTH          → CommentService.MAX_COMMENT_LENGTH
//   COMMUNITY_SPLIT             → CommunityShareService rates
//
// The voting wizard, comments and the help screen all read from here so they
// can never quote different numbers.
// ─────────────────────────────────────────────────────────────

export const VOTE_POINTS = 2;

export const ENGAGEMENT_WEIGHTS = { play: 1, like: 5 };

export const MESSAGE_REQUEST_DAILY_LIMIT = 15;

export const COMMENTS_PER_TRACK = 3;

export const COMMENT_MAX_LENGTH = 2000;

export const INTERVAL_WEIGHTS = [
  { key: 'daily', label: 'Daily', weight: 10, prize: 50, cadence: 'Every day', window: 'Midnight to midnight' },
  { key: 'weekly', label: 'Weekly', weight: 20, prize: 100, cadence: 'Every week', window: 'Monday through Sunday' },
  { key: 'monthly', label: 'Monthly', weight: 25, prize: 250, cadence: 'Every month', window: 'The 1st to the last day' },
  { key: 'quarterly', label: 'Quarterly', weight: 60, prize: 500, cadence: 'Every three months', window: 'Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec' },
  { key: 'midterm', label: 'Midterm', weight: 200, prize: 2500, cadence: 'Every six months', window: 'Jan–Jun, Jul–Dec' },
  { key: 'annual', label: 'Annual', weight: 250, prize: 5000, cadence: 'Every year', window: 'Jan 1 to Dec 31' },
];

export const POINT_ACTIONS = [
  { key: 'play', label: 'Play a track', you: '+1', they: 'Track +1, artist +1' },
  { key: 'like', label: 'Like a track (once per track)', you: '+1', they: 'Track +2, artist +1' },
  { key: 'vote', label: 'Cast a vote', you: `+${VOTE_POINTS}`, they: 'Nominee +3, artist +3' },
  { key: 'refer', label: 'Refer someone', you: '+5', they: '—' },
  { key: 'playlist', label: 'Start a community playlist', you: '+5', they: '—' },
  { key: 'suggest', label: 'Get a suggestion approved (once per song)', you: '+2', they: '—' },
  { key: 'plvote', label: 'Vote on someone else’s suggestion (once per song)', you: '+1', they: '—' },
  { key: 'milestone', label: 'Your playlist reaches 10 followers (once)', you: '+10', they: '—' },
  { key: 'supported', label: 'Someone picks you to support (once per fan)', you: '+5', they: '—' },
  { key: 'award', label: 'Win an award', you: '+50 to +5,000', they: '—' },
  { key: 'month', label: 'Every month on Unis', you: '+1', they: '—' },
];

export const LEVELS = [
  { key: 'silver', label: 'Silver', from: 0, note: 'Where everyone starts' },
  { key: 'gold', label: 'Gold', from: 100, note: 'A few weeks of listening' },
  { key: 'platinum', label: 'Platinum', from: 500, note: 'Regulars and working artists' },
  { key: 'diamond', label: 'Diamond', from: 1000, note: 'The top of the board' },
];

export const WAITLIST_TIERS = [
  { key: 'major', label: 'Major metros', threshold: 1000, note: 'LA, Chicago, Atlanta, Houston, and 11 more' },
  { key: 'mid', label: 'Mid-size markets', threshold: 500, note: 'Nashville, Austin, Charlotte, and 17 more' },
  { key: 'rest', label: 'Everywhere else', threshold: 250, note: 'Every other city and town' },
];

export const COMMUNITY_SPLIT = [
  { key: 'unis', label: 'Unis', pct: 68, note: 'Runs the platform, plus any empty share' },
  { key: 'artist', label: 'Your artist', pct: 15, note: 'The artist you support' },
  { key: 'level1', label: 'Who invited you', pct: 10, note: 'Your referrer' },
  { key: 'level2', label: 'Who invited them', pct: 5, note: 'One step further back' },
  { key: 'level3', label: 'One more back', pct: 2, note: 'Three steps from you' },
];
