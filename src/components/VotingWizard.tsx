// src/components/VotingWizard.tsx
// ─────────────────────────────────────────────────────────────
// Mobile port of web src/votingWizard.jsx.
//
//   Step 1 Review  — nominee, genre/category locked, interval chips, "Counts in"
//   Step 2 Confirm — summary + "cannot be undone"
//   Step 3 Secure  — type the name forward and backward, Cast Vote
//   Success        — full-bleed takeover: artwork, +pts tag, before → after
//
// Same rules as web:
//   • ONE VOTE, COUNTED UP THE CHAIN. The voter doesn't pick a jurisdiction —
//     the vote counts once in every open race the voter and the nominee share
//     (nominee breadcrumb ∩ /v1/vote/eligible-jurisdictions, most local first).
//   • Problems (guest, phone not verified, race couldn't load, outside your
//     area) are shown on step 1, before anyone types a name.
//   • Every ID is resolved up front; a doomed request is never sent.
//   • Name check folds smart quotes/dashes and extra spaces, so iPhone "Smart
//     Punctuation" can't block a vote.
//   • Can't close mid-submit (the result would be hidden).
//   • Artwork: every candidate URL is tried in order, then the app's standard
//     placeholder, so an image always appears.
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  StyleSheet,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  Image,
  ImageBackground,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import axiosInstance from '../services/axiosInstance';
import { useAuth } from '../context/AuthContext';
import { useReward, formatScore } from '../context/RewardContext';
import { GENRE_IDS, GENRE_NAMES, JURISDICTION_IDS, INTERVAL_IDS } from '../utils/IdMappings';
import { VOTE_POINTS, INTERVAL_WEIGHTS } from '../data/helpFigures';
import { buildUrl } from '../utils/buildUrl';
import { useUnisTheme, rgba } from '../theme/unisTheme';
import PhoneVerificationModal from './PhoneVerificationModal';
import ConfettiCannon from './Confetticannon';
import UnisLogo from '../../assets/unisLogoThree.svg';
import type { Nominee, VoteResult, VotingWizardProps } from '../types/voting';

const TOTAL_STEPS = 3;

// The app's standard "no artwork" image (same file web uses).
const FALLBACK_ART = require('../../assets/theQuiet.jpg');

const LOGO_MAP: Record<string, any> = {
  orange: require('../../assets/brand/logo-orange.png'),
  red: require('../../assets/brand/logo-red.png'),
  green: require('../../assets/brand/logo-green.png'),
  purple: require('../../assets/brand/logo-purple.png'),
  yellow: require('../../assets/brand/logo-gold.png'),
  dianna: require('../../assets/brand/logo-dianna.png'),
};

const ThemeLogo: React.FC<{ theme: string; size: number }> = ({ theme, size }) => {
  const src = LOGO_MAP[theme];
  if (!src) return <UnisLogo width={size} height={size} />;
  return <Image source={src} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="UNIS" />;
};

// ── Artwork ─────────────────────────────────────────────────
const ARTWORK_KEYS = ['imageUrl', 'artworkUrl', 'photoUrl', 'artwork', 'image', 'coverUrl', 'cover', 'thumbnailUrl', 'pictureUrl'];

function toImageSrc(raw: any): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  if (/^(data:|file:|content:|asset:)/i.test(value)) return value;
  try {
    return buildUrl(value) || null;
  } catch {
    return value;
  }
}

function collectArtwork(obj: any, out: string[]) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of ARTWORK_KEYS) {
    const src = toImageSrc(obj[k]);
    if (src && !out.includes(src)) out.push(src);
  }
}

function artworkCandidatesFor(n: any): string[] {
  const out: string[] = [];
  if (!n) return out;
  collectArtwork(n, out);
  collectArtwork(n.song || n.track || n.artistProfile || n.user, out);
  return out;
}

const probeImage = (uri: string): Promise<boolean> =>
  new Promise((resolve) => {
    Image.getSize(uri, () => resolve(true), () => resolve(false));
  });

// ── Name check helpers ──────────────────────────────────────
function normalizeName(s: string) {
  return String(s || '')
    .normalize('NFC')
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function reverseGraphemes(s: string) {
  const str = String(s || '');
  const Seg = (Intl as any)?.Segmenter;
  if (typeof Seg === 'function') {
    try {
      const seg = new Seg(undefined, { granularity: 'grapheme' });
      return Array.from(seg.segment(str), (part: any) => part.segment).reverse().join('');
    } catch {
      /* fall through */
    }
  }
  return Array.from(str).reverse().join('');
}

// ── Intervals ───────────────────────────────────────────────
const INTERVAL_LABEL: Record<string, string> = {
  daily: 'Day', weekly: 'Week', monthly: 'Month', quarterly: 'Quarter', midterm: 'Midterm', annual: 'Year',
};

const INTERVAL_OPTIONS = INTERVAL_WEIGHTS
  .filter((w) => INTERVAL_IDS[w.key])
  .map((w) => ({ value: w.key, label: INTERVAL_LABEL[w.key] || w.label }));

const INTERVAL_ALIASES: Record<string, string> = {
  day: 'daily', week: 'weekly', month: 'monthly', quarter: 'quarterly', 'semi-annual': 'midterm', year: 'annual', yearly: 'annual',
};

function normalizeInterval(value: any) {
  const k = String(value || '').toLowerCase();
  const key = INTERVAL_ALIASES[k] || k;
  return INTERVAL_IDS[key] ? key : 'daily';
}

const INTERVAL_NOUN: Record<string, string> = {
  daily: 'day', weekly: 'week', monthly: 'month', quarterly: 'quarter', midterm: 'half-year', annual: 'year',
};

function nomineeHomeJurisdictionId(n: any): string | null {
  if (!n) return null;
  if (n.jurisdictionId) return n.jurisdictionId;
  if (n.jurisdiction && typeof n.jurisdiction === 'object' && n.jurisdiction.jurisdictionId) return n.jurisdiction.jurisdictionId;
  if (typeof n.jurisdiction === 'string') {
    const slug = n.jurisdiction.toLowerCase().trim().replace(/\s+/g, '-');
    return JURISDICTION_IDS[slug] || null;
  }
  return null;
}

const formatText = (str: any) => (str ? String(str).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '');

type Extras = { genreId: string | null; artwork: string | null; pending: boolean };
const EMPTY_EXTRAS: Extras = { genreId: null, artwork: null, pending: false };
type JStatus = 'loading' | 'ready' | 'unresolved' | 'none';

// ── Result icons ────────────────────────────────────────────
const ResultIcon: React.FC<{ status: string; color: string }> = ({ status, color }) => {
  const scale = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, damping: 14, stiffness: 200, useNativeDriver: true }).start();
  }, [scale]);
  let icon;
  if (status === 'duplicate') {
    icon = <Path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
  } else if (status === 'ineligible') {
    icon = (
      <>
        <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" />
        <Path d="M5.6 5.6l12.8 12.8" stroke={color} strokeWidth={2} strokeLinecap="round" />
      </>
    );
  } else {
    icon = <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />;
  }
  return (
    <Animated.View style={[styles.resultIcon, { borderColor: color, transform: [{ scale }] }]}>
      <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">{icon}</Svg>
    </Animated.View>
  );
};

const CloseGlyph: React.FC = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path d="M6 6l12 12M6 18L18 6" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const CheckGlyph: React.FC<{ color: string }> = ({ color }) => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Path d="M20 6L9 17l-5-5" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// ─────────────────────────────────────────────────────────────
const VotingWizard: React.FC<VotingWizardProps> = ({ visible, onClose, onVoteSuccess, nominee, userId, filters }) => {
  const show = visible;
  const t = useUnisTheme();
  // No useNavigation(): the Player mounts this wizard outside the navigator.
  const { theme, user, isGuest, refreshUser, logout } = useAuth() as any;
  const { setScoreTotal, displayedScore } = useReward();

  const [step, setStep] = useState(1);
  const [currentFilters, setCurrentFilters] = useState({ selectedGenre: 'rap', selectedType: 'artist', selectedInterval: 'daily' });
  const [artistNameForward, setArtistNameForward] = useState('');
  const [artistNameBackward, setArtistNameBackward] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const [jurisdictionOptions, setJurisdictionOptions] = useState<{ jurisdictionId: string; name: string }[]>([]);
  const [selectedJurisdictionId, setSelectedJurisdictionId] = useState('');
  const [jurisdictionStatus, setJurisdictionStatus] = useState<JStatus>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const preferredJurisdictionsRef = useRef<string[]>([]);

  const [nomineeExtras, setNomineeExtras] = useState<Extras>(EMPTY_EXTRAS);
  const [voteResult, setVoteResult] = useState<VoteResult>({ status: 'idle', message: '', details: '' });
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [artworkSrc, setArtworkSrc] = useState<string | null>(null);
  const [useFallbackArt, setUseFallbackArt] = useState(false);

  const backwardRef = useRef<TextInput>(null);
  const stepAnim = useRef(new Animated.Value(1)).current;

  const prevShowRef = useRef(false);
  const latestRef = useRef({ nominee, filters });
  latestRef.current = { nominee, filters };

  const selectedNominee: Nominee | null = nominee;
  const nomineeName = (selectedNominee?.name || '').trim();
  const reversedNomineeName = useMemo(() => reverseGraphemes(nomineeName.normalize('NFC')), [nomineeName]);

  // --- Reset only on the open transition ---------------------------------
  useEffect(() => {
    if (show && !prevShowRef.current) {
      const { nominee: n, filters: f } = latestRef.current;
      setStep(1);
      setVoteResult({ status: 'idle', message: '', details: '' });
      setArtistNameForward('');
      setArtistNameBackward('');
      setSubmitting(false);
      submittingRef.current = false;
      setShowPhoneModal(false);
      setArtworkSrc(null);
      setUseFallbackArt(false);
      setJurisdictionOptions([]);
      setSelectedJurisdictionId('');
      setJurisdictionStatus('loading');
      preferredJurisdictionsRef.current = [
        f?.selectedJurisdiction ? JURISDICTION_IDS[f.selectedJurisdiction] : null,
        nomineeHomeJurisdictionId(n),
      ].filter(Boolean) as string[];
      setCurrentFilters({
        selectedGenre: (n as any)?.genreKey || f?.selectedGenre || 'rap',
        selectedType: (n as any)?.type || f?.selectedType || 'artist',
        selectedInterval: normalizeInterval(f?.selectedInterval),
      });
    }
    prevShowRef.current = show;
  }, [show]); // only `show` — never nominee/filters

  // --- Resolve nominee context + eligible jurisdictions -------------------
  useEffect(() => {
    if (!show || !nominee) return undefined;
    let cancelled = false;

    const run = async () => {
      setJurisdictionStatus('loading');
      let homeId = nomineeHomeJurisdictionId(nominee);
      const hasArtwork = artworkCandidatesFor(nominee).length > 0;
      const canFetchDetails = Boolean(nominee.id) && (nominee.type === 'artist' || nominee.type === 'song');
      const needDetails = canFetchDetails && (!homeId || !nominee.genreId || !hasArtwork);

      setNomineeExtras({ ...EMPTY_EXTRAS, pending: needDetails });

      if (needDetails) {
        try {
          const url = nominee.type === 'artist' ? `/v1/users/profile/${nominee.id}` : `/v1/media/song/${nominee.id}`;
          const res = await axiosInstance.get(url);
          if (cancelled) return;
          const d = res?.data || {};
          homeId = homeId || d.jurisdiction?.jurisdictionId || null;
          setNomineeExtras({
            genreId: d.genre?.genreId || null,
            artwork: toImageSrc(nominee.type === 'artist' ? d.photoUrl : d.artworkUrl),
            pending: false,
          });
        } catch (err) {
          if (cancelled) return;
          console.error('[VotingWizard] Could not load nominee details:', { nomineeId: nominee.id, err });
          setNomineeExtras(EMPTY_EXTRAS);
        }
      }

      if (!homeId) {
        console.error('[VotingWizard] Nominee jurisdiction unresolved — refusing to guess.', { nomineeId: nominee.id, type: nominee.type });
        setJurisdictionOptions([]);
        setJurisdictionStatus('unresolved');
        return;
      }

      const [crumbRes, eligibleRes] = await Promise.allSettled([
        axiosInstance.get(`/v1/jurisdictions/${homeId}/breadcrumb`),
        axiosInstance.get('/v1/vote/eligible-jurisdictions'),
      ]);
      if (cancelled) return;

      if (crumbRes.status !== 'fulfilled') {
        console.error('[VotingWizard] Failed to load nominee jurisdiction chain:', (crumbRes as any).reason);
        setJurisdictionOptions([]);
        setJurisdictionStatus('unresolved');
        return;
      }

      const chain = (Array.isArray(crumbRes.value?.data) ? crumbRes.value.data : [])
        .filter((j: any) => j && j.jurisdictionId && j.votingEnabled !== false)
        .map((j: any) => ({ jurisdictionId: j.jurisdictionId, name: j.name }))
        .reverse();

      let options = chain;
      if (eligibleRes.status === 'fulfilled' && Array.isArray(eligibleRes.value?.data)) {
        const eligible = new Set(eligibleRes.value.data.map((j: any) => j?.jurisdictionId).filter(Boolean));
        options = chain.filter((o: any) => eligible.has(o.jurisdictionId));
      } else {
        console.warn('[VotingWizard] Could not load your eligible jurisdictions; server will validate.');
      }

      if (options.length === 0) {
        setJurisdictionOptions([]);
        setJurisdictionStatus(chain.length > 0 ? 'none' : 'unresolved');
        return;
      }

      setJurisdictionOptions(options);
      const preferred = [...preferredJurisdictionsRef.current, homeId];
      setSelectedJurisdictionId((prev) => {
        if (options.some((o: any) => o.jurisdictionId === prev)) return prev;
        const match = preferred.find((id) => options.some((o: any) => o.jurisdictionId === id));
        return match || options[0].jurisdictionId;
      });
      setJurisdictionStatus('ready');
    };

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, nominee?.id, nominee?.type, reloadKey]);

  // --- Artwork: try each candidate until one loads ------------------------
  const artCandidates = useMemo(() => {
    const list = artworkCandidatesFor(selectedNominee);
    if (nomineeExtras.artwork && !list.includes(nomineeExtras.artwork)) list.push(nomineeExtras.artwork);
    return list;
  }, [selectedNominee, nomineeExtras.artwork]);
  const artKey = JSON.stringify(artCandidates);

  useEffect(() => {
    if (!show) return undefined;
    let active = true;
    (async () => {
      const list: string[] = JSON.parse(artKey);
      for (const src of list) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await probeImage(src);
        if (!active) return;
        if (ok) {
          setArtworkSrc(src);
          setUseFallbackArt(false);
          return;
        }
        console.warn('[VotingWizard] Artwork failed to load, trying next source:', src);
      }
      if (!active) return;
      setArtworkSrc(null);
      // Hold the placeholder back while the details fetch might still find the real image.
      setUseFallbackArt(!nomineeExtras.pending);
    })();
    return () => { active = false; };
  }, [show, artKey, nomineeExtras.pending]);

  const artSource = artworkSrc ? { uri: artworkSrc } : useFallbackArt ? FALLBACK_ART : null;
  const showArtwork = Boolean(artSource);

  // --- Step transition ----------------------------------------------------
  const animateStep = (dir: 1 | -1) => {
    stepAnim.setValue(dir);
    Animated.timing(stepAnim, { toValue: 0, duration: 260, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
  };

  // --- Close (never mid-submit) -------------------------------------------
  const handleClose = () => {
    if (submittingRef.current) return;
    onClose?.();
  };

  // --- Derived ------------------------------------------------------------
  const resolvedGenreId =
    selectedNominee?.genreId ||
    nomineeExtras.genreId ||
    GENRE_IDS[currentFilters.selectedGenre] ||
    GENRE_IDS[String(currentFilters.selectedGenre || '').toLowerCase()] ||
    null;
  const genreLabel = formatText((resolvedGenreId && GENRE_NAMES[resolvedGenreId]) || currentFilters.selectedGenre);
  const typeWord = formatText(currentFilters.selectedType);
  const intervalKey = currentFilters.selectedInterval;
  const intervalNoun = INTERVAL_NOUN[intervalKey] || formatText(intervalKey);
  const category = `${typeWord} of the ${intervalNoun}`;
  const selectedJurisdictionName = jurisdictionOptions.length > 0 ? jurisdictionOptions.map((o) => o.name).join(' · ') : '…';

  let issue: null | { kind: string; title: string; body: string; actionLabel?: string; onAction?: () => void } = null;
  if (isGuest) {
    issue = {
      kind: 'guest',
      title: 'Sign in to vote',
      body: 'Voting is for Unis members. Sign in or create a free account to cast your vote.',
      actionLabel: 'Sign in',
      onAction: () => {
        onClose?.();
        // The mobile app shows the sign-in screen whenever there's no session.
        logout?.();
      },
    };
  } else if (user && !user.phoneVerified) {
    issue = {
      kind: 'phone',
      title: 'Verify your phone to vote',
      body: 'A quick phone check keeps voting fair — one person, one vote. It takes about a minute.',
      actionLabel: 'Verify phone',
      onAction: () => setShowPhoneModal(true),
    };
  } else if (jurisdictionStatus === 'unresolved') {
    issue = {
      kind: 'load',
      title: 'Couldn’t load this race',
      body: `We couldn’t confirm where ${nomineeName || 'this nominee'} can be voted on, so we won’t guess. Check your connection and try again.`,
      actionLabel: 'Try again',
      onAction: () => setReloadKey((k) => k + 1),
    };
  } else if (jurisdictionStatus === 'none') {
    issue = {
      kind: 'area',
      title: 'Outside your voting area',
      body: `You and ${nomineeName || 'this nominee'} aren’t in any open race together yet, so this vote can’t be counted. You can vote for artists and songs from your own area and the areas around it.`,
    };
  }

  const canProceed = !issue && jurisdictionStatus === 'ready' && Boolean(selectedJurisdictionId) && Boolean(resolvedGenreId) && Boolean(INTERVAL_IDS[intervalKey]);
  const forwardMatches = artistNameForward.trim().length > 0 && normalizeName(artistNameForward) === normalizeName(nomineeName);
  const backwardMatches = artistNameBackward.trim().length > 0 && normalizeName(artistNameBackward) === normalizeName(reversedNomineeName);
  const canSubmit = forwardMatches && backwardMatches && !submitting;

  // --- Nav ----------------------------------------------------------------
  const handleNext = () => {
    if (step === 1 && !canProceed) return;
    setVoteResult({ status: 'idle', message: '' });
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      animateStep(1);
    }
  };
  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      animateStep(-1);
    }
  };

  // --- Submit -------------------------------------------------------------
  const handleConfirmVote = async () => {
    if (submittingRef.current) return;
    setVoteResult({ status: 'idle', message: '' });

    if (!forwardMatches) {
      setVoteResult({ status: 'error', message: 'Name Forward Invalid', details: 'The name entered forward does not match.' });
      return;
    }
    if (!backwardMatches) {
      setVoteResult({ status: 'error', message: 'Name Backward Invalid', details: 'The name entered backward does not match.' });
      return;
    }
    if (!user?.phoneVerified) {
      setVoteResult({
        status: 'ineligible',
        message: isGuest ? 'Sign In Required' : 'Phone Not Verified',
        details: isGuest ? 'Sign in to vote.' : 'Verify your phone number to vote.',
      });
      return;
    }

    const genreId = resolvedGenreId;
    const jurisdictionId = jurisdictionOptions.some((o) => o.jurisdictionId === selectedJurisdictionId) ? selectedJurisdictionId : null;
    const intervalId = INTERVAL_IDS[intervalKey];
    const missing = (!genreId && 'genre') || (!jurisdictionId && 'jurisdiction') || (!intervalId && 'interval');
    if (missing) {
      console.error(`[VotingWizard] Vote blocked — unresolved ${missing}:`, { genreId, jurisdictionId, intervalId, nomineeId: selectedNominee?.id });
      setVoteResult({
        status: 'error',
        message: 'Vote Not Sent',
        details: `We couldn't identify this vote's ${missing}. Please close and reopen the wizard — if it keeps happening, contact support.`,
      });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const voteData = {
        userId,
        targetType: currentFilters.selectedType,
        targetId: selectedNominee!.id,
        genreId,
        jurisdictionId,
        intervalId,
        // No voteDate — the server stamps the date in the platform timezone.
      };
      await axiosInstance.post('/v1/vote/submit', voteData);

      const rawBefore = displayedScore ?? user?.score ?? user?.totalScore ?? user?.points ?? null;
      let scoreBefore: number | null = null;
      let scoreAfter: number | null = null;
      if (rawBefore != null && Number.isFinite(Number(rawBefore))) {
        scoreBefore = Number(rawBefore);
        scoreAfter = scoreBefore + VOTE_POINTS;
        setScoreTotal(scoreAfter);
      }
      setVoteResult({ status: 'success', message: 'Vote Recorded', points: VOTE_POINTS, scoreBefore, scoreAfter });
    } catch (err: any) {
      const resp = err?.response;
      const status = resp?.status;
      const data = resp?.data;
      const serverMsg =
        (data && typeof data === 'object' && (data.message || data.error)) ||
        (typeof data === 'string' && data.trim() ? data.trim() : '');
      console.error('Vote submission failed:', { status, serverMsg });

      if (!resp) {
        setVoteResult({ status: 'network', message: 'Connection Failed', details: 'We could not reach the server. Check your connection and try again — your vote was not counted.' });
      } else if (status === 409) {
        setVoteResult({ status: 'duplicate', message: 'Already Voted', details: serverMsg || 'You have already cast a vote in this category for this interval.' });
      } else if (status === 403) {
        setVoteResult({ status: 'ineligible', message: 'Vote Rejected', details: serverMsg || 'You are not eligible to cast this vote.' });
      } else if (status >= 400 && status < 500) {
        setVoteResult({ status: 'error', message: 'Vote Rejected', details: serverMsg || `The server rejected this vote (code ${status}). Please close the wizard and try again.` });
      } else {
        setVoteResult({
          status: 'error',
          message: 'Server Error',
          details: serverMsg
            ? `${serverMsg} — your vote was not counted.`
            : `Something went wrong on our end (code ${status}). Your vote was not counted — please try again.`,
        });
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // --- Renderers ------------------------------------------------------------
  const renderResult = () => {
    const { status, message, details } = voteResult;
    const iconColor = status === 'duplicate' ? '#E0A93C' : '#D85A3B';
    const changeSelection = status === 'duplicate' || status === 'ineligible';
    return (
      <View style={styles.result} accessibilityRole="alert">
        <ResultIcon status={status} color={iconColor} />
        <Text style={[styles.resultHeading, { color: iconColor }]}>{message}</Text>
        <Text style={styles.resultDetails}>{details}</Text>
        <Pressable
          style={styles.ghostBtn}
          onPress={() => {
            setVoteResult({ status: 'idle', message: '' });
            if (changeSelection) {
              setStep(1);
              animateStep(-1);
            }
          }}
        >
          <Text style={styles.ghostText}>{changeSelection ? 'Change Selection' : 'Try Again'}</Text>
        </Pressable>
      </View>
    );
  };

  const renderSuccessTakeover = () => {
    const { points = VOTE_POINTS, scoreBefore, scoreAfter } = voteResult;
    const hasScore = typeof scoreBefore === 'number' && typeof scoreAfter === 'number';
    const body = (
      <>
        <LinearGradient colors={['rgba(5,7,13,0.35)', 'rgba(5,7,13,0.55)', 'rgba(5,7,13,0.94)']} style={StyleSheet.absoluteFill} />
        <View style={[styles.winAccent, { backgroundColor: t.primary }]} />
        <ScrollView contentContainerStyle={styles.winFrame} bounces={false}>
          <View style={styles.winTop}>
            <ThemeLogo theme={theme} size={40} />
            <Pressable onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close" hitSlop={8}><CloseGlyph /></Pressable>
          </View>

          <View style={styles.winBadgeRow}>
            <View style={[styles.winBadge, { borderColor: t.border }]}>
              <Text style={styles.winBadgeText}>{category}</Text>
              <Text style={styles.winBadgeSmall} numberOfLines={2}>{selectedJurisdictionName}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <LinearGradient colors={[t.primary, t.primaryDeep]} style={styles.winTag}>
                <Text style={styles.winTagPts}>+{points}<Text style={styles.winTagSup}> pts</Text></Text>
                <Text style={styles.winTagEarned}>earned</Text>
              </LinearGradient>
              {hasScore && (
                <Text style={styles.winScore}>
                  <Text style={{ textDecorationLine: 'line-through' }}>{formatScore(scoreBefore)}</Text>
                  {'  →  '}
                  <Text style={{ color: '#fff', fontWeight: '800' }}>{formatScore(scoreAfter)}</Text>
                </Text>
              )}
            </View>
          </View>

          <View style={{ flex: 1, minHeight: 40 }} />

          {showArtwork && <Image source={artSource as any} style={styles.winCover} accessibilityLabel={nomineeName} />}

          <Text style={[styles.winEyebrow, { color: t.textAccent }]}>Vote locked in</Text>
          <Text style={styles.winHead}>
            You backed <Text style={{ color: t.textAccent, fontStyle: 'italic' }}>{nomineeName}</Text> for the {intervalNoun}
          </Text>
          <Text style={styles.winBody}>
            Your vote counted toward {category} in {selectedJurisdictionName}. One vote per category per interval — results post at 12:00{' '}AM ET when the {intervalNoun} closes.
          </Text>

          <Pressable style={[styles.winCta, { backgroundColor: t.primary }]} onPress={() => onVoteSuccess?.(selectedNominee?.id as string)}>
            <Text style={styles.winCtaText}>Done</Text>
          </Pressable>
          <Text style={styles.winSub}>+{points} points added to your score.</Text>
        </ScrollView>
        <ConfettiCannon colors={[t.primary, '#ffffff', '#C0C0C0', t.textAccent]} />
      </>
    );
    return showArtwork ? (
      <ImageBackground source={artSource as any} style={styles.win} resizeMode="cover">{body}</ImageBackground>
    ) : (
      <View style={[styles.win, { backgroundColor: '#05070d' }]}>{body}</View>
    );
  };

  const renderIssue = () => {
    if (!issue) return null;
    const tone = issue.kind === 'area' || issue.kind === 'load' ? '#E0A93C' : t.textAccent;
    return (
      <View style={[styles.notice, { borderColor: rgba(tone, 0.4), backgroundColor: rgba(tone, 0.08) }]} accessibilityRole="summary">
        <View style={[styles.noticeDot, { backgroundColor: tone }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.noticeTitle}>{issue.title}</Text>
          <Text style={styles.noticeBody}>{issue.body}</Text>
          {issue.actionLabel && (
            <Pressable onPress={issue.onAction} style={[styles.noticeBtn, { backgroundColor: t.primary }]}>
              <Text style={styles.noticeBtnText}>{issue.actionLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  const renderStepContent = () => {
    if (!selectedNominee) return null;
    if (step === 1) {
      return (
        <View>
          <View style={styles.stepHead}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: t.textAccent }]}>Step 1 — Review</Text>
              <Text style={styles.title}>Confirm your vote for</Text>
              <Text style={styles.nominee} numberOfLines={2}>{nomineeName}</Text>
            </View>
            <View style={[styles.thumb, { borderColor: t.border }]}>
              {showArtwork && <Image source={artSource as any} style={StyleSheet.absoluteFill} accessibilityLabel={nomineeName} />}
            </View>
          </View>

          {renderIssue()}

          <View style={styles.fields}>
            <View style={styles.fieldHalf}>
              <Text style={styles.label}>Genre</Text>
              <View style={styles.chipLocked}><Text style={styles.chipText}>{genreLabel}</Text></View>
            </View>
            <View style={styles.fieldHalf}>
              <Text style={styles.label}>Category</Text>
              <View style={styles.chipLocked}><Text style={styles.chipText}>{typeWord}</Text></View>
            </View>
          </View>

          <Text style={[styles.label, { marginTop: 14 }]}>Interval</Text>
          <View style={styles.intervalRow} accessibilityRole="radiogroup">
            {INTERVAL_OPTIONS.map((o) => {
              const on = currentFilters.selectedInterval === o.value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => setCurrentFilters({ ...currentFilters, selectedInterval: o.value })}
                  style={[styles.intervalChip, on && { backgroundColor: t.primary, borderColor: t.primary }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.intervalText, on && { color: '#fff' }]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { marginTop: 14 }]}>Counts in</Text>
          <View style={styles.countsIn}>
            <Text style={styles.chipText}>{jurisdictionStatus === 'loading' ? 'Loading…' : selectedJurisdictionName}</Text>
          </View>
        </View>
      );
    }
    if (step === 2) {
      const rows = [
        ['Nominee', nomineeName],
        ['As', category],
        ['Counts in', selectedJurisdictionName],
        ['Genre', genreLabel],
      ];
      return (
        <View>
          <Text style={[styles.eyebrow, { color: t.textAccent }]}>Step 2 — Confirm</Text>
          <Text style={styles.title}>Final confirmation</Text>
          <View style={styles.summary}>
            {rows.map(([k, v], i) => (
              <View key={k} style={[styles.summaryRow, i > 0 && styles.summaryDivider]}>
                <Text style={styles.summaryKey}>{k}</Text>
                <Text style={styles.summaryVal}>{v}</Text>
              </View>
            ))}
          </View>
          <View style={styles.warning}>
            <View style={styles.warningDot} />
            <Text style={styles.warningText}>This vote cannot be undone for the selected interval.</Text>
          </View>
        </View>
      );
    }
    return (
      <View>
        <Text style={[styles.eyebrow, { color: t.textAccent }]}>Step 3 — Secure</Text>
        <Text style={styles.title}>
          Type the name <Text style={{ fontStyle: 'italic', color: t.textAccent }}>forward</Text> and <Text style={{ fontStyle: 'italic', color: t.textAccent }}>backward</Text>
        </Text>
        <Text style={styles.sub}>A small check to prevent mistaken votes.</Text>

        {[
          { key: 'f', label: 'Forward', ref: nomineeName, value: artistNameForward, set: setArtistNameForward, match: forwardMatches, placeholder: 'Type the name…' },
          { key: 'b', label: 'Backward', ref: reversedNomineeName, value: artistNameBackward, set: setArtistNameBackward, match: backwardMatches, placeholder: 'Type the name reversed…' },
        ].map((g) => (
          <View key={g.key} style={{ marginTop: 14 }}>
            <View style={styles.inputMeta}>
              <Text style={styles.label}>{g.label}</Text>
              <Text style={styles.ref} numberOfLines={1}>{g.ref}</Text>
            </View>
            <View style={[styles.inputWrap, g.match && { borderColor: t.primary, backgroundColor: rgba(t.primary, 0.12) }]}>
              <TextInput
                ref={g.key === 'b' ? backwardRef : undefined}
                value={g.value}
                onChangeText={g.set}
                placeholder={g.placeholder}
                placeholderTextColor="rgba(255,255,255,0.35)"
                editable={!submitting}
                autoComplete="off"
                autoCorrect={false}
                autoCapitalize="none"
                spellCheck={false}
                returnKeyType={g.key === 'f' ? 'next' : 'done'}
                onSubmitEditing={() => (g.key === 'f' ? backwardRef.current?.focus() : canSubmit && handleConfirmVote())}
                style={styles.input}
                accessibilityLabel={`Name ${g.label.toLowerCase()}`}
              />
              {g.match && <View style={[styles.check, { backgroundColor: t.primary }]}><CheckGlyph color="#fff" /></View>}
            </View>
          </View>
        ))}

        <Pressable
          style={[styles.primaryBtn, styles.fullBtn, { backgroundColor: t.primary }, !canSubmit && styles.disabled]}
          onPress={handleConfirmVote}
          disabled={!canSubmit}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>{submitting ? 'Submitting…' : 'Cast Vote'}</Text>
        </Pressable>
      </View>
    );
  };

  const isResult = voteResult.status !== 'idle';
  const isSuccess = voteResult.status === 'success';

  return (
    <>
      <Modal visible={show} transparent animationType="fade" onRequestClose={handleClose} statusBarTranslucent>
        <Pressable style={styles.overlay} onPress={handleClose}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
            <Pressable
              onPress={() => {}}
              style={[styles.modal, isSuccess && styles.modalSuccess, { borderColor: t.border }]}
              accessibilityViewIsModal
              accessibilityLabel={nomineeName ? `Vote for ${nomineeName}` : 'Vote'}
            >
              {isSuccess ? (
                renderSuccessTakeover()
              ) : (
                <>
                  {showArtwork && (
                    <Image source={artSource as any} style={styles.ambient} blurRadius={40} />
                  )}
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,10,16,0.82)' }]} />
                  <View style={styles.inner}>
                    <View style={styles.header}>
                      <View style={styles.brand}>
                        <ThemeLogo theme={theme} size={34} />
                        <Text style={styles.brandStep}>{isResult ? 'Result' : `${step} of ${TOTAL_STEPS}`}</Text>
                      </View>
                      <Pressable onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close" disabled={submitting} hitSlop={8}>
                        <CloseGlyph />
                      </Pressable>
                    </View>

                    {!isResult && (
                      <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: TOTAL_STEPS, now: step }}>
                        {[1, 2, 3].map((n) => (
                          <View key={n} style={styles.progressSeg}>
                            {n <= step && <View style={[StyleSheet.absoluteFill, { backgroundColor: t.primary, borderRadius: 2 }]} />}
                          </View>
                        ))}
                      </View>
                    )}

                    <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled" bounces={false}>
                      <Animated.View
                        style={{
                          opacity: stepAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
                          transform: [{ translateX: stepAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: [-24, 0, 24] }) }],
                        }}
                      >
                        {isResult ? renderResult() : renderStepContent()}
                      </Animated.View>
                    </ScrollView>

                    {!isResult && step < 3 && (
                      <View style={styles.footer}>
                        {step > 1 ? (
                          <Pressable onPress={handleBack} style={styles.ghostBtn} disabled={submitting}><Text style={styles.ghostText}>Back</Text></Pressable>
                        ) : <View />}
                        <Pressable
                          onPress={handleNext}
                          style={[styles.primaryBtn, { backgroundColor: t.primary }, step === 1 && !canProceed && styles.disabled]}
                          disabled={step === 1 && !canProceed}
                        >
                          <Text style={styles.primaryText}>Next</Text>
                        </Pressable>
                      </View>
                    )}
                    {!isResult && step === 3 && (
                      <View style={styles.footer}>
                        <Pressable onPress={handleBack} style={styles.ghostBtn} disabled={submitting}><Text style={styles.ghostText}>Back</Text></Pressable>
                        <Text style={styles.footerHint}>{!forwardMatches || !backwardMatches ? 'Type both names exactly to enable' : 'Ready to cast'}</Text>
                      </View>
                    )}
                  </View>
                </>
              )}
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <PhoneVerificationModal
        show={showPhoneModal}
        onClose={() => setShowPhoneModal(false)}
        onVerified={async () => {
          setShowPhoneModal(false);
          try {
            await refreshUser?.();
          } catch (e) {
            console.error('[VotingWizard] refreshUser after phone verification failed:', e);
          }
        }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: 14 },
  kav: { width: '100%', alignItems: 'center' },
  modal: { width: '100%', maxWidth: 520, maxHeight: '92%', borderRadius: 24, overflow: 'hidden', backgroundColor: '#0b0e16', borderWidth: 1 },
  modalSuccess: { height: '92%' },
  ambient: { ...StyleSheet.absoluteFillObject, opacity: 0.55, transform: [{ scale: 1.3 }] },
  inner: { padding: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandStep: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  progress: { flexDirection: 'row', gap: 6, marginTop: 14 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  body: { marginTop: 16, flexGrow: 0 },
  stepHead: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  eyebrow: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: 'rgba(255,255,255,0.86)', fontSize: 18, fontWeight: '700', marginTop: 6 },
  nominee: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.5, marginTop: 2 },
  thumb: { width: 78, height: 78, borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1 },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, marginTop: 14 },
  noticeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  noticeTitle: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
  noticeBody: { color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 19, marginTop: 3 },
  noticeBtn: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  noticeBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  fields: { flexDirection: 'row', gap: 10, marginTop: 16 },
  fieldHalf: { flex: 1 },
  label: { color: 'rgba(255,255,255,0.55)', fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  chipLocked: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  chipText: { color: '#fff', fontSize: 14.5, fontWeight: '600' },
  intervalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  intervalChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.04)' },
  intervalText: { color: 'rgba(255,255,255,0.75)', fontWeight: '700', fontSize: 13.5 },
  countsIn: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  summary: { marginTop: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  summaryDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)' },
  summaryKey: { color: 'rgba(255,255,255,0.55)', fontSize: 13.5 },
  summaryVal: { color: '#fff', fontWeight: '700', fontSize: 14, flex: 1, textAlign: 'right' },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  warningDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#E0A93C' },
  warningText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  sub: { color: 'rgba(255,255,255,0.6)', fontSize: 13.5, marginTop: 4 },
  inputMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  ref: { color: 'rgba(255,255,255,0.45)', fontSize: 12.5, flexShrink: 1 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.05)', paddingRight: 10 },
  input: { flex: 1, color: '#fff', fontSize: 16, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 10 },
  check: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 10 },
  footerHint: { color: 'rgba(255,255,255,0.5)', fontSize: 12.5, flexShrink: 1, textAlign: 'right' },
  primaryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, alignItems: 'center' },
  fullBtn: { marginTop: 18, alignSelf: 'stretch' },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  ghostBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  ghostText: { color: 'rgba(255,255,255,0.88)', fontWeight: '700', fontSize: 14.5 },
  disabled: { opacity: 0.45 },
  result: { alignItems: 'center', paddingVertical: 12, gap: 10 },
  resultIcon: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  resultHeading: { fontSize: 22, fontWeight: '900', marginTop: 4 },
  resultDetails: { color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 6 },
  // Success takeover
  win: { flex: 1 },
  winAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  winFrame: { flexGrow: 1, padding: 20 },
  winTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  winBadgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginTop: 18 },
  winBadge: { flexShrink: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, backgroundColor: 'rgba(5,7,13,0.55)' },
  winBadgeText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  winBadgeSmall: { color: 'rgba(255,255,255,0.65)', fontSize: 11.5, marginTop: 2 },
  winTag: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, alignItems: 'center' },
  winTagPts: { color: '#fff', fontSize: 24, fontWeight: '900' },
  winTagSup: { fontSize: 12, fontWeight: '800' },
  winTagEarned: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  winScore: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5 },
  winCover: { width: 120, height: 120, borderRadius: 18, marginBottom: 16 },
  winEyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  winHead: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.6, lineHeight: 33, marginTop: 6 },
  winBody: { color: 'rgba(255,255,255,0.78)', fontSize: 14, lineHeight: 20, marginTop: 10 },
  winCta: { marginTop: 20, paddingVertical: 14, borderRadius: 999, alignItems: 'center' },
  winCtaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  winSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, textAlign: 'center', marginTop: 10 },
});

export default VotingWizard;
