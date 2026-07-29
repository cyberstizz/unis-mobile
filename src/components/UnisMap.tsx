import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  Easing,
  LayoutChangeEvent,
  AccessibilityInfo,
} from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { US_STATES } from './geometry/usStates';
import {
  geometryToPath,
  pathBounds,
  pathAnchor,
  unionBounds,
  padBounds,
  isEmptyBounds,
  cameraForBounds,
  cameraToTransform,
  interpolateCamera,
  easeInOutSine,
  Camera,
  Anchor,
  Bounds,
} from './geo';

/**
 * UnisMap (React Native) — the Unis territory map.
 *
 * Replaces @maplibre/maplibre-react-native and the CartoDB raster tiles
 * FindScreen was fetching. No tile provider, no API key, no attribution, and
 * nothing on the network at render time — which on a phone is a bandwidth cost
 * as much as a money one.
 *
 * Shares its coordinate system with the web build: state outlines are baked
 * into the bundle by the same script, and jurisdiction polygons from Postgres
 * are projected into that same space at runtime by albersUsa.ts. A camera move
 * is just a transform on one <G>.
 *
 * WHAT CHANGES ON MOBILE
 *
 * 1. No hover. Touch has no pointer, so selection carries all the feedback and
 *    tapping a region is what reveals its name.
 *
 * 2. Labels are drawn only at rest. On web they track the camera every frame;
 *    here they would mean updating a dozen native views per frame, and text
 *    sliding around during a 3,600x dive is noise rather than information.
 *    They fade in once the camera settles.
 *
 * 3. No gesture wiring at all. The old MapLibre screen needed hitboxes and a
 *    comment block about onStartShouldSetResponder fighting the ScrollView,
 *    because the map claimed pan and zoom gestures it never used. This camera
 *    is programmatic only, so a tap on a <Path> is just a tap and the
 *    ScrollView keeps every gesture it had.
 */

const STATE_INDEX = US_STATES.map((s) => ({
  name: s.name,
  d: s.d,
  bounds: pathBounds(s.d),
  anchor: pathAnchor(s.d),
}));

const STATE_BY_NAME: Record<string, (typeof STATE_INDEX)[number]> =
  Object.fromEntries(STATE_INDEX.map((s) => [s.name, s]));

const US_BOUNDS = padBounds(unionBounds(STATE_INDEX.map((s) => s.bounds)), 0.015);

/** Below this camera width the country layer is culled. See the web notes. */
const NATIONAL_CULL_WIDTH = 60;

/** Above this many territories, only live/selected ones keep a label. */
const LABEL_CAP = 14;

const COLORS = {
  land: '#151822',
  landEdge: 'rgba(255,255,255,0.07)',
  ink: '#8b8f9e',
  chipBg: 'rgba(6,7,11,0.88)',
};

export interface MapTerritory {
  jurisdictionId: string;
  name: string;
  polygon?: unknown;
  hasChildren?: boolean;
}

interface TerritoryShape {
  id: string;
  name: string;
  raw: MapTerritory;
  d: string;
  bounds: Bounds;
  anchor: Anchor | null;
  live: boolean;
}

export interface UnisMapProps {
  mode?: 'US' | 'STATE' | 'TERRITORY';
  focusState?: string | null;
  territories?: MapTerritory[];
  selectedId?: string | null;
  liveStates?: string[];
  liveTerritories?: string[];
  /** Theme colour, e.g. '#163387'. Passed in so the map stays theme-aware. */
  primary?: string;
  primaryBright?: string;
  onStateSelect?: (name: string) => void;
  onTerritorySelect?: (t: MapTerritory) => void;
}

const UnisMap: React.FC<UnisMapProps> = ({
  mode = 'US',
  focusState = null,
  territories = [],
  selectedId = null,
  liveStates = [],
  liveTerritories = [],
  primary = '#163387',
  primaryBright = '#2E5AAC',
  onStateSelect,
  onTerritorySelect,
}) => {
  const worldRef = useRef<React.ComponentRef<typeof G> | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const rafRef = useRef<number | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [restCamera, setRestCamera] = useState<Camera | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  const liveStateSet = useMemo(() => new Set(liveStates), [liveStates]);
  const liveTerritorySet = useMemo(() => new Set(liveTerritories), [liveTerritories]);

  /* ------------------------------------------------------------ a11y ---- */
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  /* ------------------------------------------------------- broadcast ---- */
  useEffect(() => {
    if (reduceMotion) return undefined;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 3200,
        easing: Easing.bezier(0.16, 0.8, 0.3, 1),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  /* -------------------------------------------------------- geometry ---- */
  const [territoryShapes, missingGeometry] = useMemo(() => {
    const out: TerritoryShape[] = [];
    const missing: string[] = [];
    for (const t of territories) {
      const d = geometryToPath(t.polygon);
      if (!d) {
        missing.push(t.name);
        continue;
      }
      out.push({
        id: t.jurisdictionId,
        name: t.name,
        raw: t,
        d,
        bounds: pathBounds(d),
        anchor: pathAnchor(d),
        live: liveTerritorySet.has(t.name),
      });
    }
    return [out, missing] as const;
  }, [territories, liveTerritorySet]);

  const labelledShapes = useMemo(() => {
    const withAnchor = territoryShapes.filter((t) => t.anchor);
    if (withAnchor.length <= LABEL_CAP) return withAnchor;
    return withAnchor.filter((t) => t.live || t.id === selectedId);
  }, [territoryShapes, selectedId]);

  /* ---------------------------------------------------------- camera ---- */
  const targetCamera = useMemo<Camera>(() => {
    const { w, h } = size;
    if (!w || !h) return [0, 0, 1];

    if (mode === 'TERRITORY' && territoryShapes.length) {
      const sel = selectedId ? territoryShapes.find((t) => t.id === selectedId) : null;
      const b = sel ? sel.bounds : unionBounds(territoryShapes.map((t) => t.bounds));
      if (!isEmptyBounds(b)) return cameraForBounds(padBounds(b, 0.22), w, h, 0.06);
    }
    if (mode === 'STATE' && focusState && STATE_BY_NAME[focusState]) {
      return cameraForBounds(padBounds(STATE_BY_NAME[focusState].bounds, 0.1), w, h, 0.07);
    }
    return cameraForBounds(US_BOUNDS, w, h, 0.03);
  }, [mode, focusState, territoryShapes, selectedId, size]);

  /**
   * Write the camera straight to the native view.
   *
   * setNativeProps skips React entirely, so a flight costs zero renders. If a
   * platform ever ignores it the map still lands correctly, because restCamera
   * re-renders the group with the final transform when the animation ends.
   */
  const paint = useCallback(
    (camera: Camera) => {
      const { w, h } = size;
      if (!w || !h) return;
      const { k, tx, ty } = cameraToTransform(camera, w, h);
      worldRef.current?.setNativeProps?.({ matrix: [k, 0, 0, k, tx, ty] });
    },
    [size]
  );

  useEffect(() => {
    if (!size.w || !size.h) return undefined;

    const from = cameraRef.current;
    const to = targetCamera;

    if (!from || reduceMotion) {
      cameraRef.current = to;
      setRestCamera(to);
      paint(to);
      return undefined;
    }

    const interp = interpolateCamera(from, to);
    if (!Number.isFinite(interp.duration) || interp.duration <= 0) {
      cameraRef.current = to;
      setRestCamera(to);
      paint(to);
      return undefined;
    }

    // Hide labels for the duration of the flight.
    setRestCamera(null);

    const start = Date.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const step = () => {
      const t = Math.min((Date.now() - start) / interp.duration, 1);
      const cam = interp(easeInOutSine(t));
      cameraRef.current = cam;
      paint(cam);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        cameraRef.current = to;
        paint(to);
        setRestCamera(to);
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [targetCamera, size, paint, reduceMotion]);

  useEffect(() => {
    if (cameraRef.current) paint(cameraRef.current);
  }, [size, paint]);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width && height) setSize({ w: width, h: height });
  };

  /* --------------------------------------------------------- derived ---- */
  const depth = restCamera ? restCamera[2] : targetCamera[2];
  const showNation = depth > NATIONAL_CULL_WIDTH;
  const showTerritories =
    (mode === 'STATE' || mode === 'TERRITORY') && territoryShapes.length > 0;

  const transform = restCamera ? cameraToTransform(restCamera, size.w, size.h) : null;

  const screenOf = (a: Anchor) =>
    transform
      ? { left: a.x * transform.k + transform.tx, top: a.y * transform.k + transform.ty }
      : null;

  const ringScale = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 9, 9] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.85, 0, 0] });

  /* ---------------------------------------------------------- render ---- */
  return (
    <View style={styles.frame} onLayout={onLayout}>
      {size.w > 0 && (
        <Svg width="100%" height="100%">
          {/* matrix is set imperatively; this initial value keeps the first
              frame from flashing at the identity transform. */}
          <G ref={worldRef as never}>
            {showNation &&
              STATE_INDEX.map((s) => {
                const live = liveStateSet.has(s.name);
                const focused = focusState === s.name;
                return (
                  <Path
                    key={s.name}
                    d={s.d}
                    fill={focused ? primaryBright : live ? primary : COLORS.land}
                    stroke={live || focused ? 'rgba(255,255,255,0.45)' : COLORS.landEdge}
                    strokeWidth={(live || focused ? 1.25 : 1) / (transform?.k || 1)}
                    onPress={() => onStateSelect?.(s.name)}
                  />
                );
              })}

            {!showNation && focusState && STATE_BY_NAME[focusState] && (
              <Path
                d={STATE_BY_NAME[focusState].d}
                fill={primary}
                fillOpacity={0.06}
                stroke={primaryBright}
                strokeOpacity={0.35}
                strokeWidth={1 / (transform?.k || 1)}
              />
            )}

            {showTerritories &&
              territoryShapes.map((t) => {
                const selected = selectedId === t.id;
                return (
                  <Path
                    key={t.id}
                    d={t.d}
                    fill={primary}
                    fillOpacity={selected ? 0.72 : t.live ? 0.44 : 0.24}
                    stroke={selected ? '#fff' : primaryBright}
                    strokeWidth={(selected ? 2 : 1.25) / (transform?.k || 1)}
                    onPress={() => onTerritorySelect?.(t.raw)}
                  />
                );
              })}
          </G>
        </Svg>
      )}

      {/* Overlay sits in screen space, so nothing here inherits the camera
          scale. Only rendered at rest — see the note at the top. */}
      {transform && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {showNation &&
            STATE_INDEX.filter((s) => liveStateSet.has(s.name) && s.anchor).map((s) => {
              const p = screenOf(s.anchor as Anchor);
              if (!p) return null;
              return (
                <View key={`sig-${s.name}`} style={[styles.signal, p]}>
                  <Animated.View
                    style={[
                      styles.ring,
                      {
                        borderColor: primaryBright,
                        opacity: ringOpacity,
                        transform: [{ scale: ringScale }],
                      },
                    ]}
                  />
                  <View style={styles.core} />
                </View>
              );
            })}

          {showTerritories &&
            labelledShapes.map((t) => {
              const p = screenOf(t.anchor as Anchor);
              if (!p) return null;
              const selected = selectedId === t.id;
              return (
                <View
                  key={`lab-${t.id}`}
                  style={[
                    styles.chip,
                    p,
                    {
                      borderColor: selected ? '#fff' : primaryBright,
                      backgroundColor: selected ? primary : COLORS.chipBg,
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: selected ? '#fff' : '#e9ebf2' }]}>
                    {t.name.toUpperCase()}
                  </Text>
                </View>
              );
            })}
        </View>
      )}

      {showTerritories && missingGeometry.length > 0 && (
        <View style={styles.gap} pointerEvents="none">
          <Text style={styles.gapText}>
            {missingGeometry.length === 1
              ? `${missingGeometry[0]} has no boundary yet`
              : `${missingGeometry.length} regions have no boundary yet`}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.landEdge,
    backgroundColor: '#07080c',
  },
  signal: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  core: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  chip: {
    position: 'absolute',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
    // Pull the chip onto its anchor. RN has no transform: translate(-50%),
    // so the offset is applied here against the measured size below.
    transform: [{ translateX: -40 }, { translateY: -9 }],
    minWidth: 80,
    alignItems: 'center',
  },
  chipText: {
    fontSize: 10,
    letterSpacing: 0.6,
    fontWeight: '500',
  },
  gap: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: COLORS.chipBg,
    borderWidth: 1,
    borderColor: COLORS.landEdge,
  },
  gapText: { color: COLORS.ink, fontSize: 10 },
});

export default UnisMap;