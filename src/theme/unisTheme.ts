// src/theme/unisTheme.ts
// ─────────────────────────────────────────────────────────────
// The mobile twin of web theme.scss + unis-design-tokens.scss.
//
// Web drives every colour from CSS variables on #root[data-theme]. Mobile
// has no cascade, so screens read the active theme from useAuth().theme and
// derive the same family of colours here. One source for the whole app —
// new screens use useUnisTheme() instead of copying a THEME_HEX table.
//
//   const t = useUnisTheme();
//   <View style={{ backgroundColor: t.primary, borderColor: t.border }} />
//
// Mapping to the web variables:
//   primary      → --unis-primary
//   primaryHover → --unis-primary-hover
//   primary2     → --unis-primary-2      (mix with white 25%)
//   soft         → --unis-primary-soft   (14% alpha)
//   glow         → --unis-primary-glow   (35% alpha)
//   subtle       → --unis-primary-subtle (10% alpha)
//   border       → --unis-primary-border (40% alpha)
//   textAccent   → --unis-primary-text
//   glowLight / glowDeep → the Glow icon gradient stops
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

export type ThemeName = 'blue' | 'orange' | 'red' | 'green' | 'purple' | 'yellow' | 'dianna';

export const THEME_HEX: Record<ThemeName, string> = {
  blue: '#163387',
  orange: '#C44B0A',
  red: '#B51C24',
  green: '#0F7A3E',
  purple: '#4A1A8C',
  yellow: '#C49A0A',
  dianna: '#5d4703',
};

const THEME_HOVER: Record<ThemeName, string> = {
  blue: '#1a3fa3',
  orange: '#d9560b',
  red: '#cc2029',
  green: '#118a46',
  purple: '#551e9e',
  yellow: '#d9aa0b',
  dianna: '#c39f33',
};

// --unis-primary-text differs from primary only for dianna (gold on dark).
const THEME_TEXT: Partial<Record<ThemeName, string>> = {
  dianna: '#C8A84B',
};

export const getThemeHex = (theme?: string | null): string =>
  THEME_HEX[(theme as ThemeName) || 'blue'] || THEME_HEX.blue;

// ── Colour maths (no color-mix() on native) ──────────────────
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** color-mix(in srgb, a, b pct%) — `amount` is how much of `b` goes in (0–1). */
export function mix(a: string, b: string, amount: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const t = Math.max(0, Math.min(1, amount));
  const r = clamp(A.r + (B.r - A.r) * t);
  const g = clamp(A.g + (B.g - A.g) * t);
  const bl = clamp(A.b + (B.b - A.b) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

// ── Static design tokens (unis-design-tokens.scss) ───────────
export const TOKENS = {
  bg: '#07090f',
  bgDeep: '#05070d',
  text: '#ffffff',
  text2: 'rgba(255, 255, 255, 0.72)',
  text3: 'rgba(255, 255, 255, 0.5)',
  text4: 'rgba(255, 255, 255, 0.32)',
  panel: 'rgba(255, 255, 255, 0.025)',
  panel2: 'rgba(255, 255, 255, 0.045)',
  panelHi: 'rgba(255, 255, 255, 0.07)',
  border: 'rgba(255, 255, 255, 0.07)',
  borderHi: 'rgba(255, 255, 255, 0.14)',
  radius: 14,
  radiusLg: 20,
  radiusSm: 10,
  tierColor: '#c8d1de',
  danger: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
  // Serif accent (Instrument Serif on web) — no bundled font on mobile yet,
  // so the platform serif italic stands in.
  serif: undefined as string | undefined,
};

export interface UnisTheme {
  name: ThemeName;
  primary: string;
  primaryHover: string;
  primary2: string;
  primaryDeep: string;
  soft: string;
  subtle: string;
  glow: string;
  glow1: string;
  glow2: string;
  border: string;
  textAccent: string;
  glowLight: string;
  glowDeep: string;
  tokens: typeof TOKENS;
}

export function buildTheme(themeName?: string | null): UnisTheme {
  const name: ThemeName = (themeName && themeName in THEME_HEX ? themeName : 'blue') as ThemeName;
  const primary = THEME_HEX[name];
  return {
    name,
    primary,
    primaryHover: THEME_HOVER[name],
    primary2: mix(primary, '#ffffff', 0.25),
    primaryDeep: mix(primary, TOKENS.bgDeep, 0.26),
    soft: rgba(primary, 0.14),
    subtle: rgba(primary, 0.1),
    glow: rgba(primary, 0.35),
    glow1: rgba(primary, 0.12),
    glow2: rgba(primary, 0.07),
    border: rgba(primary, 0.4),
    textAccent: THEME_TEXT[name] || mix(primary, '#ffffff', 0.25),
    glowLight: mix(primary, '#ffffff', 0.62),
    glowDeep: mix(primary, '#ffffff', 0.18),
    tokens: TOKENS,
  };
}

/** The active theme's colours. Re-derives only when the theme changes. */
export function useUnisTheme(): UnisTheme {
  const { theme } = useAuth();
  return useMemo(() => buildTheme(theme), [theme]);
}
