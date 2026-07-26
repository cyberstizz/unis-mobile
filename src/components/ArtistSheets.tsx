// src/components/ArtistSheets.tsx
// Ported from the web artist page: SupporterSheet + ShopSheet.
//
// SUPPORTER SHEET
//   The artist page's "Support" action is the SUPPORTED-ARTIST SWITCH — not a
//   Stripe tip. Same endpoint and semantics as SupportedArtistPicker:
//     PUT /v1/users/{userId}/supported-artist  { artistId }
//     → { status: 'immediate' | 'pending' | 'cancelled', effectiveDate? }
//   First-ever pick lands immediately; changing an existing pick queues to
//   month-end; re-picking your current artist cancels a queued change.
//   The picker is jurisdiction-first browsing; here the fan is already on the
//   artist's page, so this is a single confirm.
//
// SHOP SHEET
//   Lists the artist's downloadable songs (downloadPolicy 'free' | 'paid').
//   Picking one hands off to the existing download flow. Empty state when the
//   artist has nothing for sale.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { X, Zap, Clock, Check, ShoppingBag } from 'lucide-react-native';

// ─── Shared helpers ────────────────────────────────────────────
export const formatEffective = (iso?: string | null): string => {
  if (!iso) return 'the start of next month';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'the start of next month';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
};

export interface SupporterResult {
  status?: 'immediate' | 'pending' | 'cancelled';
  effectiveDate?: string | null;
}

// ============================================================================
// SUPPORTER SHEET
// ============================================================================
interface SupporterSheetProps {
  show: boolean;
  onClose: () => void;
  artistName: string;
  artistPhoto?: string | null;
  isFirstPick: boolean;
  alreadySupporting: boolean;
  busy: boolean;
  error?: string | null;
  result?: SupporterResult | null;
  onConfirm: () => void;
  themeColor: string;
}

export const SupporterSheet: React.FC<SupporterSheetProps> = ({
  show,
  onClose,
  artistName,
  artistPhoto,
  isFirstPick,
  alreadySupporting,
  busy,
  error,
  result,
  onConfirm,
  themeColor,
}) => {
  const renderBody = () => {
    const status = result?.status;

    if (status === 'immediate' || status === 'cancelled') {
      return (
        <View style={styles.state}>
          <View style={[styles.stateIcon, { backgroundColor: `${themeColor}44`, borderColor: themeColor }]}>
            <Check size={26} color="#fff" />
          </View>
          <Text style={styles.stateTitle}>
            {status === 'immediate'
              ? `You're now supporting ${artistName}`
              : 'Queued switch cancelled'}
          </Text>
          <Text style={styles.stateSub}>
            {status === 'immediate'
              ? 'Your listening backs them from this moment on.'
              : `You're staying with ${artistName}.`}
          </Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: themeColor }]} onPress={onClose}>
            <Text style={styles.btnText}>Done</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (status === 'pending') {
      return (
        <View style={styles.state}>
          <View style={[styles.stateIcon, styles.stateIconClock]}>
            <Clock size={26} color="#f5d990" />
          </View>
          <Text style={styles.stateTitle}>Locked in</Text>
          <Text style={styles.stateSub}>
            You&rsquo;ll switch to {artistName} on {formatEffective(result?.effectiveDate)}. Until
            then your current pick keeps your backing.
          </Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: themeColor }]} onPress={onClose}>
            <Text style={styles.btnText}>Done</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (alreadySupporting) {
      return (
        <View style={styles.state}>
          <View style={[styles.stateIcon, { backgroundColor: `${themeColor}44`, borderColor: themeColor }]}>
            <Zap size={24} color="#fff" />
          </View>
          <Text style={styles.stateTitle}>{artistName} is your supported artist</Text>
          <Text style={styles.stateSub}>
            Every stream you play on Unis puts weight behind them.
          </Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: themeColor }]} onPress={onClose}>
            <Text style={styles.btnText}>Done</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <>
        {artistPhoto ? (
          <Image source={{ uri: artistPhoto }} style={[styles.photo, { borderColor: themeColor }]} />
        ) : null}
        <Text style={styles.title}>Make {artistName} your supported artist?</Text>
        <Text style={styles.copy}>
          {isFirstPick
            ? 'Your first pick takes effect right away — your listening on Unis backs them directly.'
            : `You already support another artist. Switches take effect at the start of next month, so ${artistName} becomes your pick on the 1st.`}
        </Text>
        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: themeColor }, busy && styles.btnDisabled]}
          onPress={onConfirm}
          disabled={busy}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Zap size={15} color="#fff" />
              <Text style={styles.btnText}>
                {isFirstPick ? 'Support them' : 'Switch to them'}
              </Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnGhost]}
          onPress={onClose}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.btnGhostText}>Not now</Text>
        </TouchableOpacity>
      </>
    );
  };

  return (
    <Modal visible={show} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View
          style={[styles.card, { borderColor: `${themeColor}66` }]}
          accessibilityViewIsModal
          accessibilityLabel={`Support ${artistName}`}
        >
          <TouchableOpacity
            style={styles.close}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={16} color="#a8a8b3" />
          </TouchableOpacity>
          {renderBody()}
        </View>
      </View>
    </Modal>
  );
};

// ============================================================================
// SHOP SHEET
// ============================================================================
export interface ShopSong {
  songId: string;
  title?: string;
  artworkUrl?: string | null;
  playCount?: number | null;
  plays?: number | null;
  downloadPolicy?: string | null;
  downloadPrice?: number | null;
}

const priceLabel = (s: ShopSong): string => {
  if (s.downloadPolicy === 'paid' && s.downloadPrice) {
    return `$${(Number(s.downloadPrice) / 100).toFixed(2)}`;
  }
  return 'Free';
};

interface ShopSheetProps {
  show: boolean;
  onClose: () => void;
  artistName: string;
  songs: ShopSong[];
  resolveArtwork: (url?: string | null) => string | null;
  onPick: (song: ShopSong) => void;
  themeColor: string;
}

export const ShopSheet: React.FC<ShopSheetProps> = ({
  show,
  onClose,
  artistName,
  songs,
  resolveArtwork,
  onPick,
  themeColor,
}) => {
  const sellable = songs.filter((s) => s.downloadPolicy !== 'unavailable');

  return (
    <Modal visible={show} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View
          style={[styles.card, { borderColor: `${themeColor}66` }]}
          accessibilityViewIsModal
          accessibilityLabel={`${artistName} shop`}
        >
          <TouchableOpacity
            style={styles.close}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close shop"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={16} color="#a8a8b3" />
          </TouchableOpacity>

          <Text style={styles.title}>{artistName}&rsquo;s Shop</Text>

          {sellable.length === 0 ? (
            <View style={styles.state}>
              <View style={[styles.stateIcon, { backgroundColor: `${themeColor}44`, borderColor: themeColor }]}>
                <ShoppingBag size={24} color="#fff" />
              </View>
              <Text style={styles.stateSub}>
                Nothing for sale yet — {artistName} hasn&rsquo;t put any songs up for download.
                Check back soon.
              </Text>
              <TouchableOpacity style={[styles.btn, { backgroundColor: themeColor }]} onPress={onClose}>
                <Text style={styles.btnText}>Got it</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.shopList} showsVerticalScrollIndicator={false}>
              {sellable.map((s) => {
                const art = resolveArtwork(s.artworkUrl);
                const paid = s.downloadPolicy === 'paid';
                return (
                  <TouchableOpacity
                    key={s.songId}
                    style={styles.shopRow}
                    onPress={() => onPick(s)}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.title || 'Untitled'}, ${priceLabel(s)}`}
                  >
                    {art ? <Image source={{ uri: art }} style={styles.shopArt} /> : <View style={styles.shopArt} />}
                    <View style={styles.shopInfo}>
                      <Text style={styles.shopTitle} numberOfLines={1}>
                        {s.title || 'Untitled'}
                      </Text>
                      <Text style={styles.shopMeta}>
                        {Number(s.playCount ?? s.plays ?? 0).toLocaleString()} plays
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.pricePill,
                        paid && { backgroundColor: `${themeColor}33`, borderColor: themeColor },
                      ]}
                    >
                      <Text style={[styles.priceText, paid && { color: '#fff' }]}>{priceLabel(s)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4,4,6,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
    paddingTop: 28,
    backgroundColor: '#18181c',
    borderWidth: 1,
    alignItems: 'center',
  },
  close: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    zIndex: 2,
  },
  photo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 14,
    borderWidth: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    fontStyle: 'italic',
    color: '#f2f2f4',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 26,
  },
  copy: {
    fontSize: 13.5,
    lineHeight: 21,
    color: '#a8a8b3',
    textAlign: 'center',
    marginBottom: 18,
  },
  error: {
    fontSize: 12.5,
    color: '#f08c8c',
    textAlign: 'center',
    marginBottom: 12,
  },
  btn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 50,
    marginTop: 10,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  btnGhostText: { fontSize: 14, fontWeight: '700', color: '#a8a8b3' },
  state: { alignItems: 'center', width: '100%' },
  stateIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 12,
  },
  stateIconClock: {
    backgroundColor: 'rgba(245,217,144,0.12)',
    borderColor: 'rgba(245,217,144,0.45)',
  },
  stateTitle: {
    fontSize: 19,
    fontWeight: '700',
    fontStyle: 'italic',
    color: '#f2f2f4',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 25,
  },
  stateSub: {
    fontSize: 13,
    lineHeight: 21,
    color: '#a8a8b3',
    textAlign: 'center',
  },
  shopList: { width: '100%', maxHeight: 360 },
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 6,
  },
  shopArt: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  shopInfo: { flex: 1, minWidth: 0 },
  shopTitle: { fontSize: 14, fontWeight: '700', color: '#f2f2f4' },
  shopMeta: { fontSize: 11.5, color: '#6a6a78', marginTop: 2 },
  pricePill: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  priceText: { fontSize: 12, fontWeight: '800', color: '#a8a8b3' },
});