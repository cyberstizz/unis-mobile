// src/screens/VoteAwardsScreen.tsx
// Full port of web VoteAwards.jsx redesign
// Hero headline + countdown, squarish filters, nominee card grid with ambient footer

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ImageBackground,
  TextInput,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import Svg, { Path } from 'react-native-svg';

import { usePlayer } from '../context/PlayerContext';
import axiosInstance, { getMediaUrl } from '../services/axiosInstance';
import { GENRE_IDS, JURISDICTION_IDS, INTERVAL_IDS } from '../utils/IdMappings';
import VotingWizard from '../components/VotingWizard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 480;
const CARD_WIDTH = IS_MOBILE ? (SCREEN_WIDTH - 48) / 2 : (SCREEN_WIDTH - 64) / 3;

// ─── Design tokens (matching web voteawards.scss) ────────────
const C = {
  bgBase: '#0a0a0c',
  cardBg: '#111111',
  surfaceDim: 'rgba(255,255,255,0.04)',
  borderDim: 'rgba(255,255,255,0.08)',
  borderHover: 'rgba(255,255,255,0.12)',
  borderActive: 'rgba(22,51,135,0.5)',
  unisBlue: '#163387',
  unisBlueLight: '#1e44a8',
  unisBlueGlow: 'rgba(22,51,135,0.35)',
  textWhite: '#ffffff',
  textSilver: '#c0c0c0',
  textGray: '#aaaaaa',
  textMuted: '#555555',
  greenBadge: '#22c55e',
};

// ─── Filter options ──────────────────────────────────────────
const GENRES = [
  { value: 'rap', label: 'Rap' },
  { value: 'rock', label: 'Rock' },
  { value: 'pop', label: 'Pop' },
];
const TYPES = [
  { value: 'artist', label: 'Artist' },
  { value: 'song', label: 'Song' },
];
const INTERVALS = [
  { value: 'daily', label: 'Day' },
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'quarterly', label: 'Quarter' },
  { value: 'annual', label: 'Year' },
];
const JURISDICTIONS = [
  { value: 'uptown-harlem', label: 'Uptown Harlem' },
  { value: 'downtown-harlem', label: 'Downtown Harlem' },
  { value: 'harlem', label: 'Harlem' },
];

// ─── Search icon SVG ─────────────────────────────────────────
const SearchIcon = () => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={C.textGray} strokeWidth={2.5}>
    <Path d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" strokeLinecap="round" />
  </Svg>
);

// ─── Interfaces ──────────────────────────────────────────────
interface Nominee {
  id: string;
  name: string;
  type: 'artist' | 'song';
  genreKey: string;
  imageUrl?: string;
  jurisdiction: string;
  genre: string;
  votes: number;
  totalLifetimeVotes?: number;
  artist?: string;
  artistId?: string;
  mediaUrl?: string;
  plays?: number;
}

// ═════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════
const VoteAwardsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { playMedia } = usePlayer();
  const navigation = useNavigation<any>();

  const [selectedGenre, setSelectedGenre] = useState('rap');
  const [selectedType, setSelectedType] = useState<'artist' | 'song'>('artist');
  const [selectedInterval, setSelectedInterval] = useState('daily');
  const [selectedJurisdiction, setSelectedJurisdiction] = useState('harlem');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [nominees, setNominees] = useState<Nominee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  const [showVoteWizard, setShowVoteWizard] = useState(false);
  const [selectedNominee, setSelectedNominee] = useState<any>(null);

  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [lastWinner, setLastWinner] = useState<{
    id: string; name: string; artistName: string | null; imageUrl: string | null; awardDate: string | null;
  } | null>(null);
  const [winnerLoading, setWinnerLoading] = useState(false);

  // ── New York time helpers (shared by countdown + winner lookback) ──
  const getNewYorkNow = () => {
    const nyString = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    return new Date(nyString);
  };

  // ── Countdown timer — follows the selected poll interval (web parity).
  //    The old version was hardcoded to next-midnight with [] deps, so
  //    Week/Month/Quarter/Year showed a daily countdown and never recalced
  //    when the toggle changed.
  useEffect(() => {
    const getPollEndDate = (interval: string) => {
      const now = getNewYorkNow();
      const end = new Date(now);

      if (interval === 'daily') {
        end.setDate(end.getDate() + 1);
        end.setHours(0, 0, 0, 0);
        return end;
      }
      if (interval === 'weekly') {
        const day = end.getDay();
        const daysUntilMonday = day === 0 ? 1 : 8 - day;
        end.setDate(end.getDate() + daysUntilMonday);
        end.setHours(0, 0, 0, 0);
        return end;
      }
      if (interval === 'monthly') {
        end.setMonth(end.getMonth() + 1, 1);
        end.setHours(0, 0, 0, 0);
        return end;
      }
      if (interval === 'quarterly') {
        const currentQuarter = Math.floor(end.getMonth() / 3);
        const nextQuarterStartMonth = (currentQuarter + 1) * 3;
        if (nextQuarterStartMonth >= 12) end.setFullYear(end.getFullYear() + 1, 0, 1);
        else end.setMonth(nextQuarterStartMonth, 1);
        end.setHours(0, 0, 0, 0);
        return end;
      }
      if (interval === 'annual') {
        end.setFullYear(end.getFullYear() + 1, 0, 1);
        end.setHours(0, 0, 0, 0);
        return end;
      }
      end.setDate(end.getDate() + 1);
      end.setHours(0, 0, 0, 0);
      return end;
    };

    const calcTimeLeft = () => {
      const now = getNewYorkNow();
      const diff = Math.max(0, getPollEndDate(selectedInterval).getTime() - now.getTime());
      return {
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      };
    };
    setCountdown(calcTimeLeft());
    const timer = setInterval(() => setCountdown(calcTimeLeft()), 1000);
    return () => clearInterval(timer);
  }, [selectedInterval]);

  // ── Track ad view ──
  useEffect(() => {
    axiosInstance.post('/v1/earnings/track-view').catch(() => {});
  }, []);

  // ── Get userId ──
  useEffect(() => {
    const getUserId = async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]));
          setUserId(payload.userId);
        }
      } catch (e) { console.error('Failed to decode token:', e); }
    };
    getUserId();
  }, []);

  // ── Fetch nominees ──
  useEffect(() => {
    fetchNominees();
  }, [selectedGenre, selectedType, selectedInterval, selectedJurisdiction]);

  const fetchNominees = async () => {
    setLoading(true);
    setError('');
    try {
      const genreId = GENRE_IDS[selectedGenre];
      const jurisdictionId = JURISDICTION_IDS[selectedJurisdiction];
      const intervalId = INTERVAL_IDS[selectedInterval];
      if (!genreId || !jurisdictionId || !intervalId) { setError('Invalid filter.'); setNominees([]); return; }

      const res = await axiosInstance.get(
        `/v1/vote/nominees?targetType=${selectedType}&genreId=${genreId}&jurisdictionId=${jurisdictionId}&intervalId=${intervalId}&limit=20`
      );
      const data = res.data || [];
      const normalized: Nominee[] = data.map((n: any) => {
        if (selectedType === 'artist') {
          return { id: n.userId, name: n.username, type: 'artist' as const, genreKey: selectedGenre, imageUrl: getMediaUrl(n.photoUrl), votes: n.voteCount || 0, totalLifetimeVotes: n.totalVotes || 0, jurisdiction: n.jurisdiction?.name || 'Unknown', genre: n.genre?.name || 'Unknown' };
        } else {
          return { id: n.songId, name: n.title, type: 'song' as const, genreKey: selectedGenre, artist: n.artist?.username || 'Unknown', artistId: n.artist?.userId, imageUrl: getMediaUrl(n.artworkUrl), mediaUrl: getMediaUrl(n.fileUrl), votes: n.voteCount || 0, plays: n.playCount || n.totalPlays || 0, jurisdiction: n.jurisdiction?.name || 'Unknown', genre: n.genre?.name || 'Unknown' };
        }
      });
      setNominees(normalized);
    } catch { setError('Failed to load nominees.'); setNominees([]); }
    finally { setLoading(false); }
  };

  const filteredNominees = nominees.filter(n => searchQuery.length === 0 || n.name.toLowerCase().includes(searchQuery.toLowerCase()));

  // ── Last-winner lookup (web parity) ──────────────────────────────────
  // Wide lookback per cadence: the backend filters by intervalId and returns
  // newest-first, so we surface the MOST RECENT winner instead of demanding
  // an award dated one exact day (which blanked the card on any cron drift).
  const getWinnerLookbackWindow = (interval: string) => {
    const end = getNewYorkNow();
    end.setHours(0, 0, 0, 0);
    const lookbackDays: Record<string, number> =
      { daily: 30, weekly: 90, monthly: 400, quarterly: 500, annual: 800 };
    const start = new Date(end);
    start.setDate(start.getDate() - (lookbackDays[interval] ?? 30));
    start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: end };
  };

  const toApiDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const formatAwardDate = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(`${dateString}T00:00:00`);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  };

  // Winner field extraction — same fallback chains as web VoteAwards.
  const getWinnerImage = (award: any): string | null => {
    const imagePath = selectedType === 'artist'
      ? (award?.winner?.photoUrl || award?.artist?.photoUrl || award?.user?.photoUrl || award?.target?.photoUrl)
      : (award?.song?.artworkUrl || award?.winner?.artworkUrl || award?.target?.artworkUrl);
    return imagePath ? (getMediaUrl(imagePath) || null) : null;
  };
  const getWinnerName = (award: any): string => {
    if (selectedType === 'artist') {
      return award?.winner?.username || award?.artist?.username || award?.user?.username
        || award?.target?.username || 'Unknown Artist';
    }
    return award?.song?.title || award?.winner?.title || award?.target?.title || 'Unknown Song';
  };
  const getWinnerArtistName = (award: any): string | null => {
    if (selectedType === 'artist') return null;
    return award?.song?.artist?.username || award?.winner?.artist?.username
      || award?.target?.artist?.username || 'Unknown Artist';
  };
  const getWinnerTargetId = (award: any): string | undefined => {
    if (selectedType === 'artist') {
      return award?.winner?.userId || award?.artist?.userId || award?.user?.userId
        || award?.target?.userId || award?.targetId;
    }
    return award?.song?.songId || award?.winner?.songId || award?.target?.songId || award?.targetId;
  };

  // ── Fetch last winner whenever any filter changes ──
  useEffect(() => {
    const fetchLastWinner = async () => {
      const genreId = GENRE_IDS[selectedGenre];
      const jurisdictionId = JURISDICTION_IDS[selectedJurisdiction];
      const intervalId = INTERVAL_IDS[selectedInterval];
      if (!genreId || !jurisdictionId || !intervalId) { setLastWinner(null); return; }

      setWinnerLoading(true);
      const { startDate, endDate } = getWinnerLookbackWindow(selectedInterval);
      try {
        const res = await axiosInstance.get(
          `/v1/awards/past?type=${selectedType}`
          + `&startDate=${toApiDate(startDate)}`
          + `&endDate=${toApiDate(endDate)}`
          + `&jurisdictionId=${jurisdictionId}`
          + `&intervalId=${intervalId}`
          + `&genreId=${genreId}`
        );

        // Keep any award with a resolvable target — deliberately NOT filtered
        // on awardId (web parity: the old filter silently discarded winners).
        const awards = (res.data || [])
          .filter((a: any) => getWinnerTargetId(a))
          .sort((a: any, b: any) =>
            new Date(b.awardDate || 0).getTime() - new Date(a.awardDate || 0).getTime());

        if (awards.length === 0) { setLastWinner(null); return; }
        const award = awards[0];
        setLastWinner({
          id: getWinnerTargetId(award)!,
          name: getWinnerName(award),
          artistName: getWinnerArtistName(award),
          imageUrl: getWinnerImage(award),
          awardDate: award.awardDate || null,
        });
      } catch (err) {
        console.error('Failed to fetch last winner:', err);
        setLastWinner(null);
      } finally {
        setWinnerLoading(false);
      }
    };
    fetchLastWinner();
  }, [selectedGenre, selectedType, selectedInterval, selectedJurisdiction]);

  const handleWinnerClick = () => {
    if (!lastWinner?.id) return;
    if (selectedType === 'artist') navigation.navigate('Artist', { artistId: lastWinner.id });
    else navigation.navigate('Song', { songId: lastWinner.id, type: 'song' });
  };

  // ── Handlers (identical to web) ──
  const handleVoteClick = (nominee: Nominee) => {
    if (!userId) { Alert.alert('Login Required', 'Please log in to vote.'); return; }
    setSelectedNominee({ id: nominee.id, name: nominee.name, type: nominee.type, genreKey: nominee.genreKey, jurisdiction: nominee.jurisdiction });
    setShowVoteWizard(true);
  };

  const handleVoteSuccess = () => { setShowVoteWizard(false); setSelectedNominee(null); fetchNominees(); };

  const handlePlay = async (nominee: Nominee) => {
    if (nominee.type === 'song' && nominee.mediaUrl) {
      playMedia({ id: nominee.id, songId: nominee.id, title: nominee.name, artist: nominee.artist || 'Unknown', url: nominee.mediaUrl, artwork: nominee.imageUrl } as any, []);
      if (userId) axiosInstance.post(`/v1/media/song/${nominee.id}/play?userId=${userId}`).catch(() => {});
    } else if (nominee.type === 'artist') {
      try {
        const res = await axiosInstance.get(`/v1/users/${nominee.id}/default-song`);
        const ds = res.data;
        if (ds?.fileUrl) {
          playMedia({ id: ds.songId || nominee.id, songId: ds.songId, title: ds.title, artist: nominee.name, url: getMediaUrl(ds.fileUrl)!, artwork: getMediaUrl(ds.artworkUrl) || nominee.imageUrl } as any, []);
          if (userId && ds.songId) axiosInstance.post(`/v1/media/song/${ds.songId}/play?userId=${userId}`).catch(() => {});
        } else { Alert.alert('No Song', `${nominee.name} has no default song yet.`); }
      } catch { Alert.alert('Error', "Could not load artist's song."); }
    }
  };

  const handleNomineeClick = (nominee: Nominee) => {
    if (nominee.type === 'artist') navigation.navigate('Artist', { artistId: nominee.id });
    else navigation.navigate('Song', { songId: nominee.id, type: 'song' });
  };

  const pad = (n: number) => String(n).padStart(2, '0');
  const genreLabel = GENRES.find(g => g.value === selectedGenre)?.label || selectedGenre;
  const typeLabel = TYPES.find(t => t.value === selectedType)?.label || selectedType;
  const intervalLabel = INTERVALS.find(i => i.value === selectedInterval)?.label || selectedInterval;
  const jurisdictionLabel = JURISDICTIONS.find(j => j.value === selectedJurisdiction)?.label || selectedJurisdiction;

  // Distinguish "no eligible content here" from "no winner computed yet" —
  // when the grid is empty, telling users to "vote to crown the first winner"
  // is misleading because there is nothing to vote for (web parity).
  const hasNoEligibleContent = !loading && !error && filteredNominees.length === 0 && searchQuery.length === 0;

  const atob = (input: string): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = input.replace(/=+$/, ''); let output = '';
    for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
      buffer = chars.indexOf(buffer) as any; if ((buffer as number) === -1) continue;
      bs = bc % 4 ? bs * 64 + (buffer as number) : (buffer as number);
      if (bc++ % 4) output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
    }
    return output;
  };

  // ── Filter dropdown ──
  const renderFilter = (value: string, options: { value: string; label: string }[], onSelect: (v: string) => void, key: string) => {
    const isOpen = activeFilter === key;
    const label = options.find(o => o.value === value)?.label || value;
    return (
      <View style={{ zIndex: isOpen ? 100 : 1 }}>
        <TouchableOpacity style={[s.filterBtn, isOpen && s.filterBtnActive]} onPress={() => setActiveFilter(isOpen ? null : key)}>
          <Text style={[s.filterBtnText, isOpen && s.filterBtnTextActive]}>{label}</Text>
          <Text style={s.filterArrow}>▾</Text>
        </TouchableOpacity>
        {isOpen && (
          <View style={s.filterDrop}>
            {options.map(o => (
              <TouchableOpacity key={o.value} style={[s.filterOpt, value === o.value && s.filterOptActive]} onPress={() => { onSelect(o.value); setActiveFilter(null); }}>
                <Text style={[s.filterOptText, value === o.value && s.filterOptTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={s.container}>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Filters ── */}
        <View style={s.filters}>
          {renderFilter(selectedGenre, GENRES, setSelectedGenre, 'genre')}
          {renderFilter(selectedType, TYPES, v => setSelectedType(v as any), 'type')}
          {renderFilter(selectedInterval, INTERVALS, setSelectedInterval, 'interval')}
          {renderFilter(selectedJurisdiction, JURISDICTIONS, setSelectedJurisdiction, 'jur')}
          <TouchableOpacity style={[s.searchToggle, searchOpen && s.searchToggleActive]} onPress={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery(''); }}>
            <SearchIcon />
          </TouchableOpacity>
        </View>

        {/* ── Search (expandable) ── */}
        {searchOpen && (
          <TextInput style={s.searchInput} placeholder={`Search ${selectedType}s...`} placeholderTextColor={C.textMuted} value={searchQuery} onChangeText={setSearchQuery} autoFocus />
        )}

        {/* ── Hero: headline + meta cluster (countdown + last winner) ──
             Mobile: heroMeta is a ROW — countdown and winner on the SAME
             level. Wider screens: column on the right (countdown over
             winner). Mirrors the web hero-meta design. */}
        <View style={s.hero}>
          <View style={{ flex: IS_MOBILE ? 0 : 1 }}>
            <Text style={s.activePoll}>Active poll</Text>
            <Text style={s.headline}>
              {genreLabel} {typeLabel}{' '}
              <Text style={s.headlineAccent}>of the {intervalLabel}</Text>
            </Text>
            <Text style={s.headline}>in {jurisdictionLabel}</Text>
          </View>

          <View style={s.heroMeta}>
            <View style={s.countdownWrap}>
              <View style={s.countdownLabelRow}>
                <View style={s.liveDot} />
                <Text style={s.liveText}>LIVE</Text>
                <Text style={s.countdownLabel}>  Poll ends in</Text>
              </View>
              <Text style={s.countdownTime}>
                {countdown.days > 0 && <Text style={s.countdownDays}>{countdown.days}D </Text>}
                {pad(countdown.hours)}:{pad(countdown.minutes)}:{pad(countdown.seconds)}
              </Text>
            </View>

            {/* ── Last winner card ── */}
            <TouchableOpacity
              style={[s.lastWinner, lastWinner ? s.lastWinnerHas : s.lastWinnerEmptyBox]}
              onPress={lastWinner ? handleWinnerClick : undefined}
              activeOpacity={lastWinner ? 0.8 : 1}
              disabled={!lastWinner}
              accessibilityRole={lastWinner ? 'button' : 'text'}
              accessibilityLabel={lastWinner ? `Current winner ${lastWinner.name}` : 'No winner yet'}
            >
              <View style={s.lastWinnerCopy}>
                <View style={s.lastWinnerKickerRow}>
                  <View style={s.lastWinnerDot} />
                  <Text style={s.lastWinnerKicker}>{lastWinner ? 'Current' : 'First winner pending'}</Text>
                </View>
                {lastWinner ? (
                  <>
                    <Text style={s.lastWinnerName} numberOfLines={1}>{lastWinner.name}</Text>
                    {lastWinner.artistName && (
                      <Text style={s.lastWinnerArtist} numberOfLines={1}>by {lastWinner.artistName}</Text>
                    )}
                    {lastWinner.awardDate && (
                      <Text style={s.lastWinnerDate}>Won {formatAwardDate(lastWinner.awardDate)}</Text>
                    )}
                  </>
                ) : (
                  <Text style={s.lastWinnerEmpty}>
                    {winnerLoading
                      ? 'Checking recent winners...'
                      : hasNoEligibleContent
                        ? `No ${genreLabel} ${selectedType}s in ${jurisdictionLabel} yet.`
                        : `Vote to crown the first ${typeLabel} of the ${intervalLabel}.`}
                  </Text>
                )}
              </View>
              {lastWinner?.imageUrl && (
                <Image source={{ uri: lastWinner.imageUrl }} style={s.lastWinnerThumb} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Content ── */}
        {loading ? (
          <View style={s.loadingWrap}><ActivityIndicator size="large" color={C.unisBlue} /><Text style={s.loadingText}>Loading nominees...</Text></View>
        ) : error ? (
          <Text style={s.errorText}>{error}</Text>
        ) : (
          <View style={s.grid}>
            {filteredNominees.length > 0 ? filteredNominees.map((nominee) => (
              <View key={nominee.id} style={s.card}>
                {/* Image */}
                <TouchableOpacity onPress={() => handleNomineeClick(nominee)} activeOpacity={0.9}>
                  <ImageBackground source={{ uri: nominee.imageUrl || 'https://picsum.photos/300' }} style={s.cardImage} resizeMode="cover">
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.92)']} locations={[0, 0.5, 1]} style={s.cardOverlay}>
                      <Text style={s.cardName} numberOfLines={1}>{nominee.name}</Text>
                      {nominee.type === 'song' && <Text style={s.cardArtist} numberOfLines={1}>by {nominee.artist}</Text>}
                      <View style={s.cardJurRow}>
                        <View style={s.jurDot} />
                        <Text style={s.cardJur}>{nominee.jurisdiction}</Text>
                      </View>
                    </LinearGradient>
                  </ImageBackground>
                </TouchableOpacity>

                {/* Footer with stats + buttons */}
                <View style={s.cardFooter}>
                  <View style={s.statWrap}>
                    <Text style={s.statLabel}>{nominee.type === 'artist' ? 'Total Votes' : 'Plays'}</Text>
                    <View style={s.statRow}>
                      <Text style={s.statValue}>{(nominee.type === 'artist' ? nominee.totalLifetimeVotes || 0 : nominee.plays || 0).toLocaleString()}</Text>
                      {nominee.votes > 0 && <View style={s.badge}><Text style={s.badgeText}>+{nominee.votes}</Text></View>}
                    </View>
                  </View>
                  <View style={s.btnRow}>
                    <TouchableOpacity style={s.btnListen} onPress={() => handlePlay(nominee)}>
                      <Text style={s.btnListenText}>Listen</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.btnVote} onPress={() => handleVoteClick(nominee)}>
                      <Text style={s.btnVoteText}>Vote</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )) : (
              <Text style={s.emptyText}>{searchQuery ? 'No nominees match your search.' : `No ${genreLabel} ${selectedType}s in ${jurisdictionLabel} yet.`}</Text>
            )}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <VotingWizard
        visible={showVoteWizard}
        onClose={() => { setShowVoteWizard(false); setSelectedNominee(null); }}
        onVoteSuccess={handleVoteSuccess}
        nominee={selectedNominee}
        userId={userId || ''}
        filters={{ selectedGenre, selectedType, selectedInterval, selectedJurisdiction }}
      />
    </View>
  );
};

// ═════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bgBase },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 8 },

  // Filters
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20, zIndex: 100, alignItems: 'center', justifyContent: 'center' },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surfaceDim, borderWidth: 1, borderColor: C.borderDim, borderRadius: 6, paddingVertical: 9, paddingHorizontal: 12 },
  filterBtnActive: { borderColor: C.unisBlue, backgroundColor: 'rgba(22,51,135,0.08)' },
  filterBtnText: { color: C.textSilver, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.8 },
  filterBtnTextActive: { color: C.textWhite },
  filterArrow: { color: '#666', fontSize: 10 },
  filterDrop: { position: 'absolute', top: 42, left: 0, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: C.borderDim, borderRadius: 8, overflow: 'hidden', minWidth: 130, zIndex: 200 },
  filterOpt: { paddingVertical: 10, paddingHorizontal: 14 },
  filterOptActive: { backgroundColor: 'rgba(22,51,135,0.15)' },
  filterOptText: { color: C.textSilver, fontSize: 13 },
  filterOptTextActive: { color: C.unisBlue, fontWeight: '600' },
  searchToggle: { width: 36, height: 36, borderRadius: 6, backgroundColor: C.surfaceDim, borderWidth: 1, borderColor: C.borderDim, justifyContent: 'center', alignItems: 'center' },
  searchToggleActive: { borderColor: C.unisBlue },
  searchInput: { backgroundColor: C.surfaceDim, borderWidth: 1, borderColor: C.borderDim, borderRadius: 6, color: C.textWhite, fontSize: 14, paddingVertical: 9, paddingHorizontal: 16, marginBottom: 16 },

  // Hero
  hero: { flexDirection: IS_MOBILE ? 'column' : 'row', justifyContent: 'space-between', alignItems: IS_MOBILE ? 'stretch' : 'flex-start', marginBottom: 24, gap: 12 },
  // Meta cluster: countdown + last-winner. Mobile = ROW (same level);
  // wider = column on the right (countdown over winner). Web parity.
  heroMeta: {
    flexDirection: IS_MOBILE ? 'row' : 'column',
    alignItems: IS_MOBILE ? 'center' : 'flex-end',
    justifyContent: IS_MOBILE ? 'space-between' : 'flex-start',
    gap: 12,
    width: IS_MOBILE ? '100%' : undefined,
  },
  activePoll: { fontSize: 10, letterSpacing: 2.5, textTransform: 'uppercase', color: C.textMuted, fontWeight: '500', marginBottom: 6 },
  headline: { fontSize: IS_MOBILE ? 26 : 34, fontWeight: '700', color: C.textWhite, textTransform: 'uppercase', lineHeight: IS_MOBILE ? 30 : 38, letterSpacing: -0.3 },
  headlineAccent: { color: C.unisBlue, fontStyle: 'italic', fontWeight: '700' },
  countdownWrap: { alignItems: IS_MOBILE ? 'flex-start' : 'flex-end', flexShrink: 0 },
  countdownLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.greenBadge, marginRight: 4 },
  liveText: { color: C.greenBadge, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  countdownLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: C.textMuted },
  countdownTime: { fontSize: IS_MOBILE ? 20 : 30, fontWeight: '700', color: C.textWhite, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  countdownDays: { color: C.unisBlue, fontStyle: 'italic', fontWeight: '700' },

  // Last winner card (web .va-last-winner parity)
  lastWinner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    flex: IS_MOBILE ? 1 : undefined,
    minWidth: 0,
    maxWidth: IS_MOBILE ? undefined : 320,
  },
  lastWinnerHas: { borderColor: 'rgba(22,51,135,0.28)', backgroundColor: 'rgba(255,255,255,0.05)' },
  lastWinnerEmptyBox: { borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.035)' },
  lastWinnerCopy: { flex: 1, minWidth: 0, gap: 2 },
  lastWinnerKickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lastWinnerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.unisBlue },
  lastWinnerKicker: { fontSize: 8.5, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: C.unisBlue },
  lastWinnerName: { fontSize: 13, fontWeight: '800', color: C.textWhite, textTransform: 'uppercase', letterSpacing: -0.1 },
  lastWinnerArtist: { fontSize: 10, color: C.textGray },
  lastWinnerDate: { fontSize: 10, color: C.textMuted, letterSpacing: 0.3 },
  lastWinnerEmpty: { fontSize: 10, color: C.textMuted, letterSpacing: 0.3 },
  lastWinnerThumb: { width: 44, height: 44, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },

  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  // Card
  card: { width: CARD_WIDTH, backgroundColor: C.cardBg, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: C.unisBlue },
  cardImage: { width: '100%', aspectRatio: 1 / 1.15 },
  cardOverlay: { flex: 1, justifyContent: 'flex-end', padding: 10 },
  cardName: { color: C.textWhite, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  cardArtist: { color: '#888', fontSize: 10, marginTop: 1 },
  cardJurRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  jurDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: C.unisBlue },
  cardJur: { color: '#777', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 },

  // Card footer
  cardFooter: { padding: 10, gap: 8 },
  statWrap: { alignItems: 'center' },
  statLabel: { fontSize: 8, textTransform: 'uppercase', letterSpacing: 1.5, color: C.textMuted },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  statValue: { fontSize: 16, fontWeight: '700', color: C.unisBlue },
  badge: { backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { color: C.greenBadge, fontSize: 10, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 6 },
  btnListen: { flex: 1, paddingVertical: 7, borderWidth: 1, borderColor: C.borderHover, borderRadius: 5, alignItems: 'center' },
  btnListenText: { color: C.textGray, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 },
  btnVote: { flex: 1, paddingVertical: 7, backgroundColor: C.unisBlue, borderRadius: 5, alignItems: 'center' },
  btnVoteText: { color: C.textWhite, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 },

  // States
  loadingWrap: { alignItems: 'center', paddingVertical: 50 },
  loadingText: { color: C.textGray, marginTop: 12 },
  errorText: { color: '#e74c3c', textAlign: 'center', paddingVertical: 24 },
  emptyText: { color: C.textGray, textAlign: 'center', paddingVertical: 50, fontSize: 14, width: '100%' },
});

export default VoteAwardsScreen;