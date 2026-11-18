// src/utils/taxonomy.ts — mobile copy of web src/utils/taxonomy.js.
// Subgenres, moods and languages (the discovery layer). These are for
// FINDING music only; voting, awards and charts still key off the three
// genres in IdMappings.ts. Lists come from GET /v1/taxonomy once per launch.
import { useEffect, useState } from 'react';
import axiosInstance from '../services/axiosInstance';
import { GENRE_IDS } from './IdMappings';

/** Value the primary-subgenre picker uses for "none of these fit". */
export const OTHER_SUBGENRE = '__other';

export const GENRE_LABELS: Record<string, string> = {
  [GENRE_IDS.rap]: 'Rap',
  [GENRE_IDS.rock]: 'Rock',
  [GENRE_IDS.pop]: 'Pop',
};

export const GENRE_ORDER = [GENRE_IDS.rap, GENRE_IDS.rock, GENRE_IDS.pop];

export interface Subgenre { subgenreId: string; name: string; genreId: string; slug?: string; description?: string }
export interface Mood { moodId: string; name: string; slug?: string }
export interface Language { code: string; name: string }
export interface Taxonomy { subgenres: Subgenre[]; moods: Mood[]; languages: Language[] }

export interface DiscoveryValue {
  primarySubgenreId: string;
  secondarySubgenreId: string;
  subgenreWriteIn: string;
  primaryMoodId: string;
  secondaryMoodId: string;
  language: string;
}

export const EMPTY_DISCOVERY: DiscoveryValue = {
  primarySubgenreId: '',
  secondarySubgenreId: '',
  subgenreWriteIn: '',
  primaryMoodId: '',
  secondaryMoodId: '',
  language: 'en',
};

let taxonomyPromise: Promise<Taxonomy> | null = null;

export function loadTaxonomy(): Promise<Taxonomy> {
  if (!taxonomyPromise) {
    taxonomyPromise = axiosInstance
      .get('/v1/taxonomy')
      .then((res) => {
        const data = res.data || {};
        return {
          subgenres: data.subgenres || [],
          moods: data.moods || [],
          languages: data.languages || [],
        };
      })
      .catch((err) => {
        taxonomyPromise = null;
        throw err;
      });
  }
  return taxonomyPromise;
}

export function useTaxonomy() {
  const [state, setState] = useState<{ taxonomy: Taxonomy | null; loading: boolean; error: any }>({
    taxonomy: null,
    loading: true,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    loadTaxonomy()
      .then((taxonomy) => { if (active) setState({ taxonomy, loading: false, error: null }); })
      .catch((err) => {
        console.error('[Taxonomy] could not load subgenres and moods:', err);
        if (active) setState({ taxonomy: null, loading: false, error: err });
      });
    return () => { active = false; };
  }, [attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

export function isDiscoveryComplete(value?: DiscoveryValue | null): boolean {
  if (!value) return false;
  const hasPrimary = value.primarySubgenreId === OTHER_SUBGENRE
    ? value.subgenreWriteIn.trim().length > 0
    : Boolean(value.primarySubgenreId);
  return hasPrimary && Boolean(value.primaryMoodId);
}

export function discoveryProblem(value?: DiscoveryValue | null): string {
  if (!value?.primarySubgenreId) return 'Pick the subgenre that fits this song best.';
  if (value.primarySubgenreId === OTHER_SUBGENRE && !value.subgenreWriteIn.trim()) {
    return 'Describe the sound in a few words, since none of the subgenres fit.';
  }
  if (!value.primaryMoodId) return 'Pick at least one mood.';
  return '';
}

export function toDiscoveryPayload(value: DiscoveryValue) {
  const other = value.primarySubgenreId === OTHER_SUBGENRE;
  return {
    primarySubgenreId: other ? null : value.primarySubgenreId || null,
    subgenreWriteIn: other ? value.subgenreWriteIn.trim() : null,
    secondarySubgenreId: value.secondarySubgenreId || null,
    primaryMoodId: value.primaryMoodId || null,
    secondaryMoodId: value.secondaryMoodId || null,
    language: value.language || 'en',
  };
}

export function discoveryFromSong(song: any): DiscoveryValue {
  if (!song) return { ...EMPTY_DISCOVERY };
  const primary = song.primarySubgenre?.subgenreId || song.primarySubgenreId || '';
  const writeIn = song.subgenreWriteIn || '';
  return {
    primarySubgenreId: primary || (writeIn ? OTHER_SUBGENRE : ''),
    secondarySubgenreId: song.secondarySubgenre?.subgenreId || song.secondarySubgenreId || '',
    subgenreWriteIn: writeIn,
    primaryMoodId: song.primaryMood?.moodId || song.primaryMoodId || '',
    secondaryMoodId: song.secondaryMood?.moodId || song.secondaryMoodId || '',
    language: song.language || 'en',
  };
}

export function describeDiscovery(value: DiscoveryValue, taxonomy: Taxonomy | null) {
  const sg = (id: string) => taxonomy?.subgenres.find((s) => s.subgenreId === id)?.name;
  const md = (id: string) => taxonomy?.moods.find((m) => m.moodId === id)?.name;
  const primary = value.primarySubgenreId === OTHER_SUBGENRE
    ? `Other: ${value.subgenreWriteIn.trim() || '—'}`
    : sg(value.primarySubgenreId);
  const subgenres = [primary, sg(value.secondarySubgenreId)].filter(Boolean).join(' + ') || '—';
  const moods = [md(value.primaryMoodId), md(value.secondaryMoodId)].filter(Boolean).join(' + ') || '—';
  const language = taxonomy?.languages.find((l) => l.code === value.language)?.name || 'English';
  return { subgenres, moods, language };
}
