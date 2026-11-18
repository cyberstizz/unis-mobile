// src/icons/UnisIcons.tsx
// ─────────────────────────────────────────────────────────────
// Unis "Glow" icon set — mobile port of web src/icons/UnisIcons.jsx.
// Same paths, same rules:
//   • 24 × 24 grid, 1.8 stroke, round caps + joins.
//   • Outlines use `color` (web: currentColor).
//   • One "heart" detail per icon is painted with the theme gradient.
//   • active fills the main shape with the gradient and turns the heart white.
//   • tone="on" draws everything in `color` (icons sitting on a coloured button).
//
// The gradient comes from the active theme (useUnisTheme), so every icon
// follows the user's theme the way web's color-mix(var(--unis-primary)) does.
//
//   <FindIcon size={18} active={focused} color="rgba(255,255,255,0.6)" />
// ─────────────────────────────────────────────────────────────
import React, { useRef } from 'react';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useUnisTheme } from '../theme/unisTheme';

const STROKE = 1.8;
let glowSeq = 0;

export interface UnisIconProps {
  active?: boolean;
  tone?: 'default' | 'on';
  size?: number;
  /** Outline colour (web: currentColor). */
  color?: string;
  style?: any;
  accessibilityLabel?: string;
}

interface Paints {
  bodyFill: string;
  bodyStroke: string;
  heart: string;
  accent: string;
  line: string;
  knob: string;
}

function paints(active: boolean, tone: string, gradientId: string, color: string): Paints {
  const grad = `url(#${gradientId})`;
  if (tone === 'on') {
    return { bodyFill: 'none', bodyStroke: color, heart: color, accent: color, line: color, knob: color };
  }
  return {
    bodyFill: active ? grad : 'none',
    bodyStroke: active ? grad : color,
    heart: active ? '#ffffff' : grad,
    accent: grad,
    line: active ? grad : color,
    knob: active ? '#ffffff' : color,
  };
}

function useGlow(active = false, tone = 'default', color = 'rgba(255,255,255,0.72)') {
  const idRef = useRef<string>('');
  if (!idRef.current) {
    glowSeq += 1;
    idRef.current = `unis-glow-${glowSeq}`;
  }
  const t = useUnisTheme();
  return { id: idRef.current, p: paints(active, tone, idRef.current, color), light: t.glowLight, deep: t.glowDeep };
}

const Frame: React.FC<{
  id: string;
  light: string;
  deep: string;
  size: number;
  style?: any;
  accessibilityLabel?: string;
  children: React.ReactNode;
}> = ({ id, light, deep, size, style, accessibilityLabel, children }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth={STROKE}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
    accessible={!!accessibilityLabel}
    accessibilityLabel={accessibilityLabel}
  >
    <Defs>
      <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="21" y2="21">
        <Stop offset="0" stopColor={light} />
        <Stop offset="1" stopColor={deep} />
      </LinearGradient>
    </Defs>
    {children}
  </Svg>
);

type IconBody = (p: Paints, active: boolean, tone: string) => React.ReactNode;

function makeIcon(body: IconBody, displayName: string) {
  const Icon: React.FC<UnisIconProps> = ({ active = false, tone = 'default', size = 24, color, style, accessibilityLabel }) => {
    const g = useGlow(active, tone, color);
    return (
      <Frame id={g.id} light={g.light} deep={g.deep} size={size} style={style} accessibilityLabel={accessibilityLabel}>
        {body(g.p, active, tone)}
      </Frame>
    );
  };
  Icon.displayName = displayName;
  return Icon;
}

// ── Navigation ───────────────────────────────────────────────
export const FindIcon = makeIcon((p) => (
  <>
    <Path d="M12 21.3C9.6 19.5 4.6 15.1 4.6 9.9a7.4 7.4 0 0 1 14.8 0c0 5.2-5 9.6-7.4 11.4z" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Circle cx="12" cy="9.9" r="2.6" fill={p.heart} stroke="none" />
  </>
), 'FindIcon');

export const VoteIcon = makeIcon((p) => (
  <>
    <Path d="M9.39 13L7.53 5.55A1.6 1.6 0 0 1 8.69 3.61L12.77 2.59A1.6 1.6 0 0 1 14.71 3.76L17.01 13" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Path d="M9.98 7.93L11.67 8.95L13.42 5.63" fill="none" stroke={p.heart} />
    <Path d="M3.2 13h17.6v5.6a2.2 2.2 0 0 1-2.2 2.2H5.4a2.2 2.2 0 0 1-2.2-2.2z" fill="none" stroke={p.line} />
  </>
), 'VoteIcon');

export const AwardsIcon = makeIcon((p) => (
  <>
    <Path d="M10.4 9.7 7 3.4h3.8l1.2 2.4 1.2-2.4H17l-3.4 6.3" fill="none" stroke={p.line} />
    <Circle cx="12" cy="15.1" r="5.7" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Path d="M12 12.3l.95 1.95 2.15.3-1.55 1.5.37 2.13L12 17.17l-1.92 1.01.37-2.13-1.55-1.5 2.15-.3z" fill={p.heart} stroke="none" />
  </>
), 'AwardsIcon');

export const EarningsIcon = makeIcon((p) => (
  <>
    <Circle cx="12" cy="12" r="8.6" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Path d="M14.6 9.5c-.3-1.1-1.3-1.7-2.6-1.7-1.6 0-2.6.8-2.6 2 0 2.7 5.3 1.6 5.3 4.3 0 1.2-1.1 2-2.7 2-1.4 0-2.4-.7-2.7-1.8M12 6.2v1.6M12 16.1v1.7" fill="none" stroke={p.heart} />
  </>
), 'EarningsIcon');

// ── Header controls ──────────────────────────────────────────
export const MenuIcon = makeIcon((p) => (
  <>
    <Path d="M4 6.8h16M4 17.2h16" fill="none" stroke={p.line} />
    <Path d="M4 12h16" fill="none" stroke={p.accent} />
  </>
), 'MenuIcon');

export const SearchIcon = makeIcon((p) => (
  <>
    <Circle cx="10.6" cy="10.6" r="6.6" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Path d="M15.5 15.5 20.2 20.2" fill="none" stroke={p.line} />
    <Path d="M7.12 9.33A3.7 3.7 0 0 1 10.08 6.94" fill="none" stroke={p.heart} />
  </>
), 'SearchIcon');

export const SignInIcon = makeIcon((p) => (
  <>
    <Path d="M12.4 20.5V8.4a4.05 4.05 0 0 1 8.1 0v12.1z" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Circle cx="14.7" cy="13.4" r="1" fill={p.knob} stroke="none" />
    <Path d="M3.5 12.6h6.4M7.2 9.4l3.2 3.2-3.2 3.2" fill="none" stroke={p.accent} />
  </>
), 'SignInIcon');

export const SignOutIcon = makeIcon((p) => (
  <>
    <Path d="M3.5 20.5V8.4a4.05 4.05 0 0 1 8.1 0v12.1z" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Circle cx="9.3" cy="13.4" r="1" fill={p.knob} stroke="none" />
    <Path d="M13.6 12.6h6.6M17 9.4l3.2 3.2-3.2 3.2" fill="none" stroke={p.accent} />
  </>
), 'SignOutIcon');

// ── Messaging ────────────────────────────────────────────────
export const ArrowBackIcon = makeIcon((p) => (
  <>
    <Path d="M19.5 12H5.2" fill="none" stroke={p.line} />
    <Path d="M11 5.6 4.6 12l6.4 6.4" fill="none" stroke={p.accent} />
  </>
), 'ArrowBackIcon');

export const ArrowDownIcon = makeIcon((p) => (
  <>
    <Path d="M12 4.5v14" fill="none" stroke={p.line} />
    <Path d="M6.2 12.9 12 18.7l5.8-5.8" fill="none" stroke={p.accent} />
  </>
), 'ArrowDownIcon');

export const SlidersIcon = makeIcon((p) => (
  <>
    <Path d="M3.8 7.4h9.4M18.9 7.4h1.3M3.8 16.6h2.6M11.6 16.6h8.6" fill="none" stroke={p.line} />
    <Circle cx="16" cy="7.4" r="2.6" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Circle cx="9" cy="16.6" r="2.6" fill={p.heart} stroke="none" />
  </>
), 'SlidersIcon');

export const ComposeIcon = makeIcon((p) => (
  <>
    <Path d="M11.2 4.4H7.3a3 3 0 0 0-3 3v9.4a3 3 0 0 0 3 3h9.4a3 3 0 0 0 3-3v-3.9" fill="none" stroke={p.line} />
    <Path d="M17.7 3.7a1.95 1.95 0 0 1 2.75 2.75l-7.2 7.2-3.7.95.95-3.7z" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Path d="M15.9 5.5l2.7 2.7" fill="none" stroke={p.heart} />
  </>
), 'ComposeIcon');

export const SendIcon = makeIcon((p) => (
  <>
    <Path d="M12 15.6V5.2" fill="none" stroke={p.line} />
    <Path d="M6.9 10.3 12 5.2l5.1 5.1" fill="none" stroke={p.accent} />
    <Circle cx="12" cy="18.6" r="2.1" fill={p.heart} stroke="none" />
  </>
), 'SendIcon');

export const ShareSongIcon = makeIcon((p) => (
  <>
    <Ellipse cx="7.6" cy="17.4" rx="2.9" ry="2.4" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Path d="M10.5 17.2V4.4c2.6.3 4.4 1.7 5 4" fill="none" stroke={p.line} />
    <Path d="M18.2 12.6v7M14.7 16.1h7" fill="none" stroke={p.accent} />
  </>
), 'ShareSongIcon');

export const NoteIcon = makeIcon((p) => (
  <>
    <Path d="M13.6 17V4.2c3 .4 5 2 5.6 4.6" fill="none" stroke={p.line} />
    <Ellipse cx="10.3" cy="17.2" rx="3.3" ry="2.7" fill={p.heart} stroke="none" />
  </>
), 'NoteIcon');

export const SupportIcon = makeIcon((p) => (
  <>
    <Circle cx="12" cy="12" r="8.6" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Path d="M12 16.3s-4-2.5-4-5.2a2.15 2.15 0 0 1 4-1.15 2.15 2.15 0 0 1 4 1.15c0 2.7-4 5.2-4 5.2z" fill={p.heart} stroke="none" />
  </>
), 'SupportIcon');

export const ReactIcon = makeIcon((p) => (
  <>
    <Circle cx="12" cy="12" r="8.6" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Circle cx="9.1" cy="10" r="1.05" fill={p.knob} stroke="none" />
    <Circle cx="14.9" cy="10" r="1.05" fill={p.knob} stroke="none" />
    <Path d="M8.5 13.7c.9 1.45 2.05 2.2 3.5 2.2s2.6-.75 3.5-2.2" fill="none" stroke={p.heart} />
  </>
), 'ReactIcon');

export const MoreIcon = makeIcon((p) => (
  <>
    <Circle cx="5.2" cy="12" r="1.75" fill={p.line} stroke="none" />
    <Circle cx="12" cy="12" r="1.75" fill={p.accent} stroke="none" />
    <Circle cx="18.8" cy="12" r="1.75" fill={p.line} stroke="none" />
  </>
), 'MoreIcon');

export const FilterIcon = makeIcon((p) => (
  <>
    <Path d="M4.2 5.2h15.6l-6 7v5.9l-3.6 1.8v-7.7z" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Path d="M8.6 8.6h6.8" fill="none" stroke={p.heart} />
  </>
), 'FilterIcon');

export const CloseIcon = makeIcon((p) => (
  <>
    <Path d="M6.4 6.4l11.2 11.2" fill="none" stroke={p.line} />
    <Path d="M17.6 6.4 6.4 17.6" fill="none" stroke={p.accent} />
  </>
), 'CloseIcon');

export const CopyIcon = makeIcon((p) => (
  <>
    <Path d="M8.6 8.4V6.3a2.2 2.2 0 0 1 2.2-2.2h7a2.2 2.2 0 0 1 2.2 2.2v7a2.2 2.2 0 0 1-2.2 2.2h-2.1" fill="none" stroke={p.line} />
    <Rect x="4" y="8.4" width="11.6" height="11.6" rx="2.2" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Path d="M7.3 14.2h5" fill="none" stroke={p.heart} />
  </>
), 'CopyIcon');

export const RetryIcon = makeIcon((p) => (
  <>
    <Path d="M19.4 12.6a7.5 7.5 0 1 1-2.3-6" fill="none" stroke={p.line} />
    <Path d="M19.4 3.9v4.4H15" fill="none" stroke={p.accent} />
  </>
), 'RetryIcon');

export const MessagesIcon = makeIcon((p) => (
  <>
    <Path d="M12 3.9c4.7 0 8.5 3.25 8.5 7.3s-3.8 7.3-8.5 7.3c-.95 0-1.85-.13-2.7-.37L4.9 19.9l1.25-3.65C4.5 14.95 3.5 13.15 3.5 11.2c0-4.05 3.8-7.3 8.5-7.3z" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Path d="M8.4 10.2v2.2M10.8 8.6v5.4M13.2 9.7v3.2M15.6 10.5v1.6" fill="none" stroke={p.heart} />
  </>
), 'MessagesIcon');

// ── Comments ─────────────────────────────────────────────────
export const LikeIcon = makeIcon((p, active, tone) => (
  <>
    <Rect x="3.25" y="10.4" width="3.65" height="10.25" rx="1.35" fill={active && tone !== 'on' ? p.accent : 'none'} stroke={p.accent} />
    <Path d="M8.7 10.5 11.35 4.65C11.8 3.65 12.95 3.25 13.9 3.75c1 .55 1.35 1.7 1.05 2.75l-.7 2.85h4.5c1.35 0 2.3 1.25 2 2.55l-1.2 6.65c-.25 1.25-1.25 2.1-2.5 2.1H8.7z" fill={p.bodyFill} stroke={p.bodyStroke} />
  </>
), 'LikeIcon');

export const CommentIcon = makeIcon((p) => (
  <>
    <Path d="M6.3 4.3h11.4a2.9 2.9 0 0 1 2.9 2.9v6.9a2.9 2.9 0 0 1-2.9 2.9h-6.5l-3.9 3.1V17h-1a2.9 2.9 0 0 1-2.9-2.9V7.2a2.9 2.9 0 0 1 2.9-2.9z" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Path d="M7.7 9.2h8.6M7.7 12.3h5.5" fill="none" stroke={p.heart} />
  </>
), 'CommentIcon');

export const TrashIcon = makeIcon((p) => (
  <>
    <Path d="M4.3 6.7h15.4M9.5 6.7V5.2a1.4 1.4 0 0 1 1.4-1.4h2.2a1.4 1.4 0 0 1 1.4 1.4v1.5" fill="none" stroke={p.line} />
    <Path d="M6.2 6.7l.85 11.9a2 2 0 0 0 2 1.85h5.9a2 2 0 0 0 2-1.85l.85-11.9" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Path d="M10.3 10.6v5.8M13.7 10.6v5.8" fill="none" stroke={p.heart} />
  </>
), 'TrashIcon');

export const ChevronDownIcon = makeIcon((p) => (
  <Path d="M6.4 9.3 12 14.9l5.6-5.6" fill="none" stroke={p.accent} />
), 'ChevronDownIcon');

export const InfoIcon = makeIcon((p) => (
  <>
    <Circle cx="12" cy="12" r="8.6" fill={p.bodyFill} stroke={p.bodyStroke} />
    <Path d="M12 11.1v5.1" fill="none" stroke={p.heart} />
    <Circle cx="12" cy="7.9" r="1.1" fill={p.heart} stroke="none" />
  </>
), 'InfoIcon');

// ── Solid transport glyphs ───────────────────────────────────
export const PlayGlyph: React.FC<{ size?: number; color?: string; style?: any }> = ({ size = 24, color = '#fff', style }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
    <Path d="M8.5 6.1c0-.95 1.05-1.55 1.87-1.05L18.6 10.9c.83.5.83 1.7 0 2.2l-8.23 5.85c-.82.5-1.87-.1-1.87-1.05z" fill={color} />
  </Svg>
);

export const PauseGlyph: React.FC<{ size?: number; color?: string; style?: any }> = ({ size = 24, color = '#fff', style }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
    <Rect x="6.2" y="5" width="4.2" height="14" rx="1.4" fill={color} />
    <Rect x="13.6" y="5" width="4.2" height="14" rx="1.4" fill={color} />
  </Svg>
);
