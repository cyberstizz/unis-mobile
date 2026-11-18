// src/components/SoundDiscoveryFields.tsx
// ─────────────────────────────────────────────────────────────
// The "Sound & discovery" block shared by the upload wizard, the signup
// wizard's debut-song step and the edit-song wizard — port of web
// src/SoundDiscoveryFields.jsx.
//
//   Primary subgenre  – required, from the song's own genre (or "Other" + a
//                       short description when nothing fits)
//   Second subgenre   – optional, from ANY genre (a rap song can lean R&B)
//   Mood              – one required, a second optional
//   Language          – defaults to English
//
// It only collects values. The parent keeps the state, checks
// isDiscoveryComplete() before moving on, and sends toDiscoveryPayload().
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { useTaxonomy, OTHER_SUBGENRE, GENRE_LABELS, GENRE_ORDER, DiscoveryValue } from '../utils/taxonomy';
import { useUnisTheme } from '../theme/unisTheme';

type Option = { key: string; label: string } | { header: string };

/** A full-width <select>: shows the current choice, opens a list sheet. */
const SelectField: React.FC<{
  value: string;
  placeholder: string;
  options: Option[];
  onChange: (key: string) => void;
  invalid?: boolean;
  label: string;
}> = ({ value, placeholder, options, onChange, invalid, label }) => {
  const t = useUnisTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => 'key' in o && o.key === value) as { key: string; label: string } | undefined;
  return (
    <>
      <Pressable
        style={[styles.select, invalid && styles.invalid]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label || placeholder}`}
      >
        <Text style={[styles.selectText, !current && styles.placeholder]} numberOfLines={1}>{current?.label || placeholder}</Text>
        <ChevronDown size={16} color="rgba(255,255,255,0.6)" />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { borderColor: t.border }]}>
          <Text style={styles.sheetTitle}>{label}</Text>
          <ScrollView style={{ maxHeight: 460 }}>
            {options.map((o, i) =>
              'header' in o ? (
                <Text key={`h-${o.header}-${i}`} style={styles.groupHeader}>{o.header}</Text>
              ) : (
                <Pressable
                  key={o.key || `none-${i}`}
                  style={[styles.option, o.key === value && { backgroundColor: t.soft }]}
                  onPress={() => { onChange(o.key); setOpen(false); }}
                  accessibilityState={{ selected: o.key === value }}
                >
                  <Text style={[styles.optionText, o.key === value && { color: '#fff', fontWeight: '700' }]}>{o.label}</Text>
                  {o.key === value && <Check size={16} color={t.textAccent} />}
                </Pressable>
              ),
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
};

interface Props {
  genreId: string;
  value: DiscoveryValue;
  onChange: (v: DiscoveryValue) => void;
  showErrors?: boolean;
}

const SoundDiscoveryFields: React.FC<Props> = ({ genreId, value, onChange, showErrors = false }) => {
  const t = useUnisTheme();
  const { taxonomy, loading, error, retry } = useTaxonomy();
  const set = (patch: Partial<DiscoveryValue>) => onChange({ ...value, ...patch });

  const ownGenre = useMemo(() => (taxonomy?.subgenres || []).filter((s) => s.genreId === genreId), [taxonomy, genreId]);
  const byGenre = useMemo(() => {
    const groups: Record<string, any[]> = {};
    (taxonomy?.subgenres || []).forEach((s) => { (groups[s.genreId] = groups[s.genreId] || []).push(s); });
    return groups;
  }, [taxonomy]);

  // If the genre changes, a primary subgenre from the old genre no longer applies.
  useEffect(() => {
    if (!taxonomy || !value.primarySubgenreId || value.primarySubgenreId === OTHER_SUBGENRE) return;
    if (!ownGenre.some((s) => s.subgenreId === value.primarySubgenreId)) onChange({ ...value, primarySubgenreId: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxonomy, genreId]);

  if (loading) {
    return <View style={styles.box}><Text style={styles.status}>Loading subgenres and moods…</Text></View>;
  }
  if (error || !taxonomy) {
    return (
      <View style={styles.box}>
        <Text style={[styles.status, { color: '#fca5a5' }]}>
          We couldn't load the subgenre and mood lists. Check your connection, then try again.
        </Text>
        <Pressable style={styles.retry} onPress={retry}><Text style={styles.retryText}>Try again</Text></Pressable>
      </View>
    );
  }

  const primary: any = ownGenre.find((s) => s.subgenreId === value.primarySubgenreId);
  const isOther = value.primarySubgenreId === OTHER_SUBGENRE;
  const secondary: any = taxonomy.subgenres.find((s) => s.subgenreId === value.secondarySubgenreId);
  const genreName = GENRE_LABELS[genreId] || 'your genre';
  const missingPrimary = showErrors && (!value.primarySubgenreId || (isOther && !value.subgenreWriteIn.trim()));
  const missingMood = showErrors && !value.primaryMoodId;

  // The first mood picked is the main mood, the second is extra. Tapping a
  // picked chip removes it; picking a third replaces the second.
  const toggleMood = (moodId: string) => {
    if (value.primaryMoodId === moodId) set({ primaryMoodId: value.secondaryMoodId || '', secondaryMoodId: '' });
    else if (value.secondaryMoodId === moodId) set({ secondaryMoodId: '' });
    else if (!value.primaryMoodId) set({ primaryMoodId: moodId });
    else set({ secondaryMoodId: moodId });
  };

  const primaryOptions: Option[] = [
    ...ownGenre.map((s) => ({ key: s.subgenreId, label: s.name })),
    { key: OTHER_SUBGENRE, label: 'None of these fit (describe it)' },
  ];
  const secondaryOptions: Option[] = [{ key: '', label: 'None' }];
  GENRE_ORDER.filter((g) => byGenre[g]?.length).forEach((g) => {
    secondaryOptions.push({ header: GENRE_LABELS[g] });
    byGenre[g].filter((s) => s.subgenreId !== value.primarySubgenreId).forEach((s) => secondaryOptions.push({ key: s.subgenreId, label: s.name }));
  });

  return (
    <View style={styles.box} accessibilityLabel="Sound and discovery">
      <Text style={styles.legend}>Sound &amp; discovery</Text>
      <Text style={styles.intro}>
        This helps listeners find your song. It does not change which awards your song competes in; that is still {genreName}.
      </Text>

      {/* Primary subgenre */}
      <View style={styles.field}>
        <Text style={styles.label}>Subgenre <Text style={[styles.req, { color: t.textAccent }]}>required</Text></Text>
        <SelectField
          label="Subgenre"
          value={value.primarySubgenreId}
          placeholder={`Choose the ${genreName} subgenre that fits best`}
          options={primaryOptions}
          invalid={missingPrimary}
          onChange={(next) => set({
            primarySubgenreId: next,
            subgenreWriteIn: next === OTHER_SUBGENRE ? value.subgenreWriteIn : '',
            secondarySubgenreId: value.secondarySubgenreId === next ? '' : value.secondarySubgenreId,
          })}
        />
        {!!primary?.soundsLike && <Text style={styles.hint}>Sounds like {primary.soundsLike}</Text>}
        {isOther && (
          <>
            <TextInput
              style={[styles.input, missingPrimary && styles.invalid]}
              maxLength={60}
              value={value.subgenreWriteIn}
              onChangeText={(v) => set({ subgenreWriteIn: v })}
              placeholder="Describe the sound in a few words, e.g. Jersey club"
              placeholderTextColor="rgba(255,255,255,0.35)"
              accessibilityLabel="Describe the sound"
            />
            <Text style={styles.hint}>
              We review these to decide which subgenres to add next. {60 - value.subgenreWriteIn.length} characters left.
            </Text>
          </>
        )}
        {missingPrimary && (
          <Text style={styles.error}>{isOther ? 'Describe the sound in a few words.' : 'Pick the subgenre that fits this song best.'}</Text>
        )}
      </View>

      {/* Secondary subgenre — any genre */}
      <View style={styles.field}>
        <Text style={styles.label}>Second subgenre <Text style={styles.opt}>optional</Text></Text>
        <SelectField
          label="Second subgenre"
          value={value.secondarySubgenreId}
          placeholder="None"
          options={secondaryOptions}
          onChange={(v) => set({ secondarySubgenreId: v })}
        />
        <Text style={styles.hint}>
          {secondary?.soundsLike ? `Sounds like ${secondary.soundsLike}` : 'Use this if the song also leans another way. It can come from any genre.'}
        </Text>
      </View>

      {/* Moods */}
      <View style={styles.field}>
        <Text style={styles.label}>Mood <Text style={[styles.req, { color: t.textAccent }]}>pick 1 or 2</Text></Text>
        <View style={styles.moods} accessibilityLabel="Mood">
          {taxonomy.moods.map((m: any) => {
            const order = value.primaryMoodId === m.moodId ? 1 : value.secondaryMoodId === m.moodId ? 2 : 0;
            return (
              <Pressable
                key={m.moodId}
                style={[styles.mood, order > 0 && { backgroundColor: t.primary, borderColor: t.primary }]}
                onPress={() => toggleMood(m.moodId)}
                accessibilityState={{ selected: order > 0 }}
                accessibilityHint={m.description || undefined}
              >
                {order > 0 && <Text style={styles.moodNum}>{order}</Text>}
                <Text style={[styles.moodText, order > 0 && { color: '#fff' }]}>{m.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>Your first pick is the main mood. Tap a picked mood again to remove it.</Text>
        {missingMood && <Text style={styles.error}>Pick at least one mood.</Text>}
      </View>

      {/* Language */}
      <View style={styles.field}>
        <Text style={styles.label}>Language</Text>
        <SelectField
          label="Language"
          value={value.language}
          placeholder="English"
          options={taxonomy.languages.map((l) => ({ key: l.code, label: l.name }))}
          onChange={(v) => set({ language: v })}
        />
        <Text style={styles.hint}>The main language of the vocals.</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  box: { padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginVertical: 10 },
  legend: { color: '#fff', fontSize: 16, fontWeight: '800' },
  intro: { color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 18, marginTop: 4 },
  status: { color: 'rgba(255,255,255,0.7)', fontSize: 13.5 },
  retry: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  retryText: { color: '#fff', fontWeight: '700' },
  field: { marginTop: 14 },
  label: { color: 'rgba(255,255,255,0.85)', fontSize: 13.5, fontWeight: '700', marginBottom: 6 },
  req: { fontSize: 11.5, fontWeight: '700' },
  opt: { color: 'rgba(255,255,255,0.45)', fontSize: 11.5, fontWeight: '600' },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)' },
  selectText: { color: '#fff', fontSize: 14.5, flex: 1 },
  placeholder: { color: 'rgba(255,255,255,0.45)' },
  invalid: { borderColor: '#f87171' },
  input: { color: '#fff', fontSize: 14.5, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)', marginTop: 8 },
  hint: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 5, lineHeight: 16 },
  error: { color: '#fca5a5', fontSize: 12.5, marginTop: 5, fontWeight: '600' },
  moods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mood: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.04)' },
  moodNum: { color: '#fff', fontSize: 11, fontWeight: '900', width: 16, height: 16, borderRadius: 8, textAlign: 'center', lineHeight: 16, backgroundColor: 'rgba(0,0,0,0.25)', overflow: 'hidden' },
  moodText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: '#11141c', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, paddingTop: 14, paddingBottom: 30, paddingHorizontal: 8 },
  sheetTitle: { color: '#fff', fontSize: 16, fontWeight: '800', paddingHorizontal: 12, marginBottom: 8 },
  groupHeader: { color: 'rgba(255,255,255,0.45)', fontSize: 11.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 13, borderRadius: 10 },
  optionText: { color: 'rgba(255,255,255,0.82)', fontSize: 15 },
});

export default SoundDiscoveryFields;
