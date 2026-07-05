// src/components/SupportedArtistPicker.tsx
// Ported from web `SupportedArtistPicker.jsx`  (jurisdiction-first)
//
// Instead of loading every artist into one list, the user first picks an AREA
// from their own jurisdiction chain (home → … → Unis, via the breadcrumb
// endpoint), then sees only the top 4 artists in that area (the cached
// /trending?type=artist endpoint). This scales: a handful of areas, a handful
// of artists each — never the full roster.
//
// Submit semantics are unchanged: first-ever pick is immediate; changing an
// existing pick queues to month-end (backend returns status immediate|pending).
//
// Props:
//   show, onClose, userId, currentArtistId, onSuccess  (as web)
//   userJurisdictionId: UUID  — the user's home jurisdiction (drives the area
//                               list). If absent, falls back to top-level roots.
//   userJurisdictionName: str — ensures the home area shows first even if the
//                               breadcrumb returns ancestors only.

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { X, Check, Clock, Sparkles, MapPin, ChevronLeft } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';
import buildUrl from '../utils/buildUrl';

interface Jurisdiction {
  id: string;
  name: string;
}

interface PickerArtist {
  userId: string;
  username: string;
  score?: number;
  photoUrl?: string | null;
}

interface SubmitResult {
  status: 'immediate' | 'pending';
  effectiveDate?: string;
}

interface SupportedArtistPickerProps {
  show: boolean;
  onClose: () => void;
  userId: string;
  currentArtistId: string | null;
  userJurisdictionId?: string;
  userJurisdictionName?: string;
  onSuccess?: () => void;
}

const SupportedArtistPicker: React.FC<SupportedArtistPickerProps> = ({
  show,
  onClose,
  userId,
  currentArtistId,
  userJurisdictionId,
  userJurisdictionName,
  onSuccess,
}) => {
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([]);
  const [jLoading, setJLoading] = useState(true);
  const [selectedJur, setSelectedJur] = useState<Jurisdiction | null>(null);
  const [artists, setArtists] = useState<PickerArtist[]>([]);
  const [aLoading, setALoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isFirstPick = !currentArtistId;

  // Load the user's area chain when the modal opens.
  useEffect(() => {
    if (!show) return;
    let cancelled = false;

    setSelectedJur(null);
    setArtists([]);
    setSelectedId(null);
    setResult(null);
    setError(null);
    setJLoading(true);

    const url = userJurisdictionId
      ? `/v1/jurisdictions/${userJurisdictionId}/breadcrumb`
      : '/v1/jurisdictions/roots';

    axiosInstance.get(url)
      .then((res) => {
        if (cancelled) return;
        const chain: Jurisdiction[] = (res.data || [])
          .map((j: any) => ({ id: j.jurisdictionId || j.id, name: j.name }))
          .filter((j: Jurisdiction) => j.id && j.name);
        // breadcrumb returns root→leaf; show the most local area first.
        // (If your chain ever looks inverted, remove this reverse.)
        if (userJurisdictionId) {
          chain.reverse();
          if (userJurisdictionName && !chain.some((j) => j.id === userJurisdictionId)) {
            chain.unshift({ id: userJurisdictionId, name: userJurisdictionName });
          }
        }
        setJurisdictions(chain);
      })
      .catch(() => !cancelled && setError('Could not load your areas. Please try again.'))
      .finally(() => !cancelled && setJLoading(false));

    return () => { cancelled = true; };
  }, [show, userJurisdictionId]);

  const selectJurisdiction = async (jur: Jurisdiction) => {
    setSelectedJur(jur);
    setSelectedId(null);
    setArtists([]);
    setError(null);
    setALoading(true);
    try {
      const res = await axiosInstance.get(`/v1/jurisdictions/${jur.id}/trending?type=artist&limit=4`);
      // trending rows are [userId, username, score, photoUrl]
      const list: PickerArtist[] = (res.data || [])
        .map((row: any[]) => ({ userId: row[0], username: row[1], score: row[2], photoUrl: row[3] }))
        .filter((a: PickerArtist) => a.userId && a.userId !== userId);
      setArtists(list);
    } catch (_) {
      setError('Could not load top artists for this area.');
    } finally {
      setALoading(false);
    }
  };

  const selectedArtist = useMemo(
    () => artists.find((a) => a.userId === selectedId) || null,
    [artists, selectedId],
  );

  const handleSubmit = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await axiosInstance.put(`/v1/users/${userId}/supported-artist`, {
        artistId: selectedId,
      });
      setResult(res.data || { status: isFirstPick ? 'immediate' : 'pending' });
      onSuccess?.();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not update your supported artist. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatEffective = (iso?: string): string | null => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  };

  const renderSuccess = () => {
    const status = result?.status;
    const immediate = status === 'immediate';
    const effective = formatEffective(result?.effectiveDate);
    return (
      <View style={styles.success}>
        <View style={styles.successIcon}>
          {immediate
            ? <Sparkles size={28} color="#4a9eff" />
            : <Clock size={28} color="#4a9eff" />}
        </View>
        <Text style={styles.successTitle}>
          {immediate ? "You're now supporting them!" : 'Change queued'}
        </Text>
        <Text style={styles.successBody}>
          {immediate
            ? `${selectedArtist?.username || 'Your artist'} now receives a share of your ad revenue.`
            : `You'll start supporting ${selectedArtist?.username || 'them'}${effective ? ` on ${effective}` : ' next month'}. Your current artist keeps earning until then.`}
        </Text>
        <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onClose}>
          <Text style={styles.btnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={show} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.modal} activeOpacity={1} onPress={() => {}}>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Close">
            <X size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {isFirstPick ? 'Choose your artist' : 'Change who you support'}
            </Text>
            <Text style={styles.headerSub}>
              {selectedJur
                ? `Top artists in ${selectedJur.name}`
                : isFirstPick
                  ? 'Pick an area, then back one of its top artists.'
                  : 'Pick an area, then choose a new artist. Changes take effect next month.'}
            </Text>
          </View>

          {result ? (
            renderSuccess()
          ) : (
            <>
              {!selectedJur ? (
                <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                  {jLoading ? (
                    <View style={styles.state}>
                      <ActivityIndicator size="small" color="#4a9eff" />
                      <Text style={styles.stateText}>Loading your areas…</Text>
                    </View>
                  ) : error ? (
                    <View style={styles.state}>
                      <Text style={styles.stateError}>{error}</Text>
                    </View>
                  ) : jurisdictions.length === 0 ? (
                    <View style={styles.state}>
                      <Text style={styles.stateText}>No areas found.</Text>
                    </View>
                  ) : (
                    jurisdictions.map((j) => (
                      <TouchableOpacity
                        key={j.id}
                        style={styles.jurRow}
                        onPress={() => selectJurisdiction(j)}
                      >
                        <MapPin size={16} color="#4a9eff" />
                        <Text style={styles.jurName}>{j.name}</Text>
                        <Text style={styles.jurGo}>Top artists →</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.back}
                    onPress={() => {
                      setSelectedJur(null);
                      setArtists([]);
                      setSelectedId(null);
                      setError(null);
                    }}
                  >
                    <ChevronLeft size={16} color="#4a9eff" />
                    <Text style={styles.backText}>All areas</Text>
                  </TouchableOpacity>

                  <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                    {aLoading ? (
                      <View style={styles.state}>
                        <ActivityIndicator size="small" color="#4a9eff" />
                        <Text style={styles.stateText}>Loading top artists…</Text>
                      </View>
                    ) : error ? (
                      <View style={styles.state}>
                        <Text style={styles.stateError}>{error}</Text>
                      </View>
                    ) : artists.length === 0 ? (
                      <View style={styles.state}>
                        <Text style={styles.stateText}>No artists here yet. Try a broader area.</Text>
                      </View>
                    ) : (
                      artists.map((artist) => {
                        const isCurrent = artist.userId === currentArtistId;
                        const isSelected = artist.userId === selectedId;
                        const photo = buildUrl(artist.photoUrl);
                        const initial = (artist.username || '?').charAt(0).toUpperCase();
                        return (
                          <TouchableOpacity
                            key={artist.userId}
                            style={[styles.artistRow, isSelected && styles.artistRowSelected]}
                            onPress={() => setSelectedId(artist.userId)}
                            accessibilityState={{ selected: isSelected }}
                          >
                            {photo ? (
                              <Image source={{ uri: photo }} style={styles.avatar} />
                            ) : (
                              <View style={[styles.avatar, styles.avatarPh]}>
                                <Text style={styles.avatarInitial}>{initial}</Text>
                              </View>
                            )}
                            <View style={styles.artistInfo}>
                              <Text style={styles.artistName} numberOfLines={1}>
                                {artist.username}
                              </Text>
                              <View style={styles.metaRow}>
                                <Text style={styles.artistMeta}>{artist.score ?? 0} pts</Text>
                                {isCurrent && (
                                  <View style={styles.currentTag}>
                                    <Text style={styles.currentTagText}>Current</Text>
                                  </View>
                                )}
                              </View>
                            </View>
                            {isSelected && <Check size={16} color="#4a9eff" />}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </>
              )}

              <View style={styles.footer}>
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose}>
                  <Text style={styles.btnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.btn,
                    styles.btnPrimary,
                    (!selectedId || submitting || selectedId === currentArtistId) && styles.btnDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={!selectedId || submitting || selectedId === currentArtistId}
                >
                  <Text style={styles.btnText}>
                    {submitting
                      ? 'Saving…'
                      : selectedId === currentArtistId
                        ? 'Already supported'
                        : isFirstPick ? 'Support this artist' : 'Queue change'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#0d0d0d',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 20,
    maxHeight: '85%',
    padding: 20,
  },
  close: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    padding: 6,
  },
  header: {
    marginBottom: 14,
    paddingRight: 32,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  headerSub: {
    color: '#AAAAAA',
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  list: {
    flexGrow: 0,
    marginBottom: 8,
  },
  state: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  stateText: {
    color: '#AAAAAA',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  stateError: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
  },
  jurRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  jurName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginLeft: 10,
  },
  jurGo: {
    color: '#4a9eff',
    fontSize: 12,
    fontWeight: '600',
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  backText: {
    color: '#4a9eff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 2,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  artistRowSelected: {
    borderColor: '#4a9eff',
    backgroundColor: 'rgba(74, 158, 255, 0.08)',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  avatarPh: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  artistInfo: {
    flex: 1,
    marginLeft: 12,
    paddingRight: 8,
  },
  artistName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  artistMeta: {
    color: '#888888',
    fontSize: 12,
  },
  currentTag: {
    marginLeft: 8,
    backgroundColor: 'rgba(74, 158, 255, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  currentTagText: {
    color: '#4a9eff',
    fontSize: 10,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    borderTopWidth: 1,
    paddingTop: 14,
  },
  btn: {
    borderRadius: 22,
    paddingVertical: 11,
    paddingHorizontal: 20,
    marginLeft: 10,
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  btnPrimary: {
    backgroundColor: '#004aad',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  success: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  successIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(74, 158, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  successTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
  },
  successBody: {
    color: '#AAAAAA',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 18,
  },
});

export default SupportedArtistPicker;