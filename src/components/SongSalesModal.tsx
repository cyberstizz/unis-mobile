// src/components/SongSalesModal.tsx
// Ported from web `SongSalesModal.jsx` — ★ sales: per-song revenue modal.
//
// GET /v1/artist-analytics/artist/{artistId}/song/{songId}/sales
//   → { copies, grossCents, netCents, series: [{ day, net_cents, copies }] }
//
// Web's hand-rolled SVG cumulative area chart is ported with react-native-svg.
// The mouse-hover tooltip becomes a touch/drag scrubber (same nearest-point
// math driven by touch x-position).

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  GestureResponderEvent,
} from 'react-native';
import Svg, {
  Path,
  Circle,
  Line,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from 'react-native-svg';
import { X, DollarSign, ShoppingBag, TrendingUp } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';
import buildUrl from '../utils/buildUrl';

const money = (cents: number) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

const parseDay = (s?: string): Date | null => {
  if (!s) return null;
  const [y, m, d] = String(s).split('-');
  return new Date(Number(y), Number(m) - 1, Number(d));
};

const shortDate = (s?: string): string => {
  const d = parseDay(s);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

interface SeriesRow {
  day: string;
  net_cents: number;
  copies: number;
}

// ---------------------------------------------------------------------------
// Cumulative net-revenue area chart — same geometry as web (uniform scaling so
// the tooltip maps exactly to point positions), touch-scrub instead of hover.
// ---------------------------------------------------------------------------
const SalesChart: React.FC<{ series: SeriesRow[] }> = ({ series }) => {
  const [hover, setHover] = useState<number | null>(null);
  const [wrapWidth, setWrapWidth] = useState(0);

  const points = useMemo(() => {
    let cum = 0;
    return (series || []).map((d) => {
      const net = Number(d.net_cents || 0) / 100;
      cum += net;
      return {
        dayLabel: shortDate(d.day),
        net,
        cumulative: cum,
        copies: Number(d.copies || 0),
      };
    });
  }, [series]);

  if (points.length === 0) {
    return (
      <View style={styles.chartEmpty}>
        <TrendingUp size={22} color="#888888" />
        <Text style={styles.chartEmptyText}>
          No sales yet. When this track sells, your revenue trend appears here.
        </Text>
      </View>
    );
  }

  // Web geometry, verbatim.
  const W = 640;
  const H = 260;
  const padL = 14;
  const padR = 14;
  const padT = 18;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const n = points.length;
  const maxVal = Math.max(...points.map((p) => p.cumulative), 1);

  const xAt = (i: number) => (n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);
  const yAt = (v: number) => padT + plotH - (v / maxVal) * plotH;

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.cumulative).toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${xAt(n - 1).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

  const handleTouch = (e: GestureResponderEvent) => {
    if (!wrapWidth) return;
    const ratio = Math.min(1, Math.max(0, e.nativeEvent.locationX / wrapWidth));
    const idx = Math.round(ratio * (n - 1));
    setHover(idx);
  };

  const hoverPoint = hover !== null ? points[hover] : null;

  return (
    <View
      onLayout={(e) => setWrapWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={handleTouch}
      onResponderMove={handleTouch}
      onResponderRelease={() => setHover(null)}
    >
      <Svg
        width="100%"
        height={220}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        accessibilityLabel="Net revenue over time"
      >
        <Defs>
          <SvgLinearGradient id="songsales-fill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#4a9eff" stopOpacity={0.45} />
            <Stop offset="100%" stopColor="#4a9eff" stopOpacity={0} />
          </SvgLinearGradient>
        </Defs>

        {/* baseline */}
        <Line
          x1={padL}
          y1={padT + plotH}
          x2={W - padR}
          y2={padT + plotH}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
        />

        <Path d={areaPath} fill="url(#songsales-fill)" />
        <Path
          d={linePath}
          fill="none"
          stroke="#4a9eff"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {hover !== null && hoverPoint && (
          <>
            <Line
              x1={xAt(hover)}
              y1={padT}
              x2={xAt(hover)}
              y2={padT + plotH}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <Circle
              cx={xAt(hover)}
              cy={yAt(hoverPoint.cumulative)}
              r={5}
              fill="#4a9eff"
              stroke="#fff"
              strokeWidth={2}
            />
          </>
        )}
      </Svg>

      {/* axes labels */}
      <View style={styles.chartLabels}>
        <Text style={styles.chartAxis}>{points[0].dayLabel}</Text>
        <Text style={styles.chartAxis}>{points[n - 1].dayLabel}</Text>
      </View>
      <Text style={styles.chartYMax}>{money(maxVal * 100)}</Text>
      <Text style={styles.chartYMin}>$0</Text>

      {/* scrub readout (web's hover tooltip) */}
      {hoverPoint && (
        <View style={styles.chartTip}>
          <Text style={styles.chartTipAmount}>{money(hoverPoint.cumulative * 100)}</Text>
          <Text style={styles.chartTipDay}>{hoverPoint.dayLabel}</Text>
          <Text style={styles.chartTipCopies}>
            {hoverPoint.copies} {hoverPoint.copies === 1 ? 'sale' : 'sales'} that day
          </Text>
        </View>
      )}
    </View>
  );
};

interface SongLike {
  songId?: string;
  id?: string;
  title?: string;
  artworkUrl?: string | null;
}

interface SongSalesModalProps {
  show: boolean;
  onClose: () => void;
  artistId?: string;
  song: SongLike | null;
}

const SongSalesModal: React.FC<SongSalesModalProps> = ({ show, onClose, artistId, song }) => {
  const [data, setData] = useState<{
    copies?: number;
    grossCents?: number;
    netCents?: number;
    series?: SeriesRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const songId = song?.songId || song?.id;
  const artworkUrl = buildUrl(song?.artworkUrl) || null;

  const fetchSales = useCallback(async () => {
    if (!artistId || !songId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get(
        `/v1/artist-analytics/artist/${artistId}/song/${songId}/sales`
      );
      setData(res.data || null);
    } catch (err) {
      console.error('Song sales fetch failed:', err);
      setError("Could not load this song's sales.");
    } finally {
      setLoading(false);
    }
  }, [artistId, songId]);

  useEffect(() => {
    if (show) fetchSales();
  }, [show, fetchSales]);

  const copies = Number(data?.copies || 0);
  const grossCents = Number(data?.grossCents || 0);
  const netCents = Number(data?.netCents || 0);
  const series = data?.series || [];

  return (
    <Modal visible={show} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Close">
            <X size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.head}>
              {artworkUrl && <Image source={{ uri: artworkUrl }} style={styles.artwork} />}
              <View style={styles.headText}>
                <Text style={styles.eyebrow}>Sales</Text>
                <Text style={styles.title} numberOfLines={2}>
                  {song?.title || 'Song'} revenue
                </Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.state}>
                <ActivityIndicator size="small" color="#4a9eff" />
                <Text style={styles.stateText}>Loading sales…</Text>
              </View>
            ) : error ? (
              <View style={styles.state}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={fetchSales}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.summary}>
                  <View style={styles.stat}>
                    <View style={styles.statIcon}><ShoppingBag size={18} color="#4a9eff" /></View>
                    <Text style={styles.statLabel}>Copies sold</Text>
                    <Text style={styles.statValue}>{copies.toLocaleString()}</Text>
                  </View>
                  <View style={styles.stat}>
                    <View style={styles.statIcon}><DollarSign size={18} color="#4a9eff" /></View>
                    <Text style={styles.statLabel}>Gross sales</Text>
                    <Text style={styles.statValue}>{money(grossCents)}</Text>
                  </View>
                  <View style={[styles.stat, styles.statPrimary]}>
                    <View style={styles.statIcon}><TrendingUp size={18} color="#4a9eff" /></View>
                    <Text style={styles.statLabel}>Your cut</Text>
                    <Text style={styles.statValue}>{money(netCents)}</Text>
                  </View>
                </View>

                <View style={styles.chartCard}>
                  <Text style={styles.chartEyebrow}>Over time</Text>
                  <Text style={styles.chartTitle}>Cumulative net revenue</Text>
                  <SalesChart series={series} />
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    padding: 16,
  },
  modal: {
    backgroundColor: '#0d0d0d',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 20,
    maxHeight: '88%',
    padding: 18,
  },
  close: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 2,
    padding: 6,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingRight: 34,
  },
  artwork: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginRight: 12,
  },
  headText: {
    flex: 1,
  },
  eyebrow: {
    color: '#4a9eff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
  },
  state: {
    alignItems: 'center',
    paddingVertical: 26,
  },
  stateText: {
    color: '#AAAAAA',
    fontSize: 13,
    marginTop: 8,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  summary: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  stat: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    padding: 10,
    marginRight: 8,
  },
  statPrimary: {
    borderWidth: 1,
    borderColor: 'rgba(74, 158, 255, 0.4)',
    marginRight: 0,
  },
  statIcon: {
    marginBottom: 6,
  },
  statLabel: {
    color: '#888888',
    fontSize: 11,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  chartCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: 14,
  },
  chartEyebrow: {
    color: '#4a9eff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  chartTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 10,
  },
  chartEmpty: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  chartEmptyText: {
    color: '#888888',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 8,
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  chartAxis: {
    color: '#888888',
    fontSize: 10,
  },
  chartYMax: {
    position: 'absolute',
    top: 2,
    left: 6,
    color: '#888888',
    fontSize: 10,
  },
  chartYMin: {
    position: 'absolute',
    bottom: 22,
    left: 6,
    color: '#888888',
    fontSize: 10,
  },
  chartTip: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderColor: 'rgba(74, 158, 255, 0.4)',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 8,
    alignSelf: 'center',
  },
  chartTipAmount: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  chartTipDay: {
    color: '#CCCCCC',
    fontSize: 11,
    marginTop: 1,
  },
  chartTipCopies: {
    color: '#888888',
    fontSize: 10,
    marginTop: 1,
  },
});

export default SongSalesModal;