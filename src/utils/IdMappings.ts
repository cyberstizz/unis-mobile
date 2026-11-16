// src/utils/IdMappings.ts — mobile copy of web src/utils/idMappings.js (keep identical).
// ═══════════════════════════════════════════════════════════════════════
//  UNIS — ID Mappings
//  CANON: exactly 3 votable genres. Subgenres (R&B → Pop, Metal → Rock,
//  Hip-Hop → Rap) are a future categorization layer and must NEVER be
//  added here or as rows in the genres table — the award cron and the
//  UI toggles both key off that set.
// ═══════════════════════════════════════════════════════════════════════

// The single source of truth for what users can vote on / filter by.
// Every genre dropdown in the app should iterate THIS, never
// Object.entries(GENRE_IDS) (which includes legacy aliases and produced
// the duplicate options in createAccountWizard).
export const CANONICAL_GENRES = ['rap', 'rock', 'pop'] as const;

export const GENRE_IDS: Record<string, string> = {
  // ── canonical ──
  'rap': '00000000-0000-0000-0000-000000000101',
  'rock': '00000000-0000-0000-0000-000000000102',
  'pop': '00000000-0000-0000-0000-000000000103',

  // ── legacy aliases (lookup-only; do NOT add new ones) ──
  // Kept so existing hardcoded fallbacks ('rap-hiphop' in votingWizard and
  // player) keep resolving. Nothing should iterate these.
  'rap-hiphop': '00000000-0000-0000-0000-000000000101',
  'hip-hop': '00000000-0000-0000-0000-000000000101',
  'Hip-Hip': '00000000-0000-0000-0000-000000000101',
};

export const JURISDICTION_IDS: Record<string, string> = {
  'uptown-harlem': '52740de0-e4e9-4c9e-b68e-1e170f6788c4',
  'downtown-harlem': '4b09eaa2-03bc-4778-b7c2-db8b42c9e732',
  'harlem': '1cf6ceb1-aae6-4113-98c0-d9fe8ad8b5e3',
};

export const INTERVAL_IDS: Record<string, string> = {
  'daily': '00000000-0000-0000-0000-000000000201',
  'weekly': '00000000-0000-0000-0000-000000000202',
  'monthly': '00000000-0000-0000-0000-000000000203',
  'quarterly': '00000000-0000-0000-0000-000000000204',
  'annual': '00000000-0000-0000-0000-000000000205',
  'midterm': '00000000-0000-0000-0000-000000000206',
};

// REVERSE MAPPINGS (UUID → canonical string)
// GENRE_NAMES is now EXPLICIT. The old version was built by inverting
// GENRE_IDS, where "last alias wins" — so …101 reverse-mapped to the
// 'Hip-Hip' typo instead of 'rap'. Explicit entries are alias-proof.
export const GENRE_NAMES: Record<string, string> = {
  '00000000-0000-0000-0000-000000000101': 'rap',
  '00000000-0000-0000-0000-000000000102': 'rock',
  '00000000-0000-0000-0000-000000000103': 'pop',
};

export const JURISDICTION_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(JURISDICTION_IDS).map(([k, v]) => [v, k])
);

export const INTERVAL_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(INTERVAL_IDS).map(([k, v]) => [v, k])
);

// HELPER FUNCTIONS
/**
 * Get jurisdiction ID from key, with fallback
 */
export const getJurisdictionId = (key: string): string | undefined => {
  const id = JURISDICTION_IDS[key];
  if (!id) {
    console.warn(`Unknown jurisdiction key: ${key}`);
  }
  return id;
};

/**
 * Get genre ID from key, with fallback.
 * Case-insensitive and slash-tolerant so DB-derived names
 * ("Rap", "Rock", "Pop") resolve without callers pre-normalizing.
 */
export const getGenreId = (key: string): string | undefined => {
  const id =
    GENRE_IDS[key] ||
    GENRE_IDS[String(key || '').toLowerCase().replace('/', '-')];
  if (!id) {
    console.warn(`Unknown genre key: ${key}`);
  }
  return id;
};

/**
 * Get interval ID from key, with fallback
 */
export const getIntervalId = (key: string): string | undefined => {
  const id = INTERVAL_IDS[key];
  if (!id) {
    console.warn(`Unknown interval key: ${key}`);
  }
  return id;
};