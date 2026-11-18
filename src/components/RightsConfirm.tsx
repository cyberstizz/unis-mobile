// src/components/RightsConfirm.tsx
// ─────────────────────────────────────────────────────────────
// The rights checkbox on every upload (Terms of Service 3.6) — port of web
// src/RightsConfirm.jsx.
//
// Until Unis holds licenses from The MLC and the PROs, it can only carry music
// the uploader controls: no publisher or publishing administrator, no SESAC or
// GMR writer, no covers, no uncleared samples. Each upload shows this box and
// sends `rightsConfirmed: true`; the backend refuses anything else, so a
// client that skips the box can't skip the rule.
//
// The parent owns the state: `checked`, `onChange(bool)`, and `showAlert`,
// which it turns on when someone tries to continue without ticking the box.
// ─────────────────────────────────────────────────────────────
import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useUnisTheme } from '../theme/unisTheme';
import { webUrl } from '../config/links';

export const RIGHTS_HELP_PATH = '/help#upload-rights';

export const rightsAlert = (mediaType: 'song' | 'video' = 'song') =>
  mediaType === 'video'
    ? 'Check the box to upload this video. If any of these isn’t true for the music in it, the video can’t go on Unis yet.'
    : 'Check the box to upload this song. If any of these isn’t true, the song can’t go on Unis yet.';

const POINTS = [
  'You wrote it, and everyone who co-wrote it or made the beat is fine with it being on Unis.',
  'No publisher or publishing administrator, such as Songtrust or TuneCore Publishing, handles any part of it.',
  'No one who wrote it is with SESAC or GMR. ASCAP and BMI are fine.',
  'It isn’t a cover, and any sample in it is cleared.',
];

const RightsConfirm: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  mediaType?: 'song' | 'video';
  showAlert?: boolean;
  /** Opens the in-app help screen; falls back to the web help page. */
  onWhy?: () => void;
}> = ({ checked, onChange, mediaType = 'song', showAlert = false, onWhy }) => {
  const t = useUnisTheme();
  const subject = mediaType === 'video' ? 'the music in this video' : 'this song';
  const alerting = showAlert && !checked;

  return (
    <View style={[styles.box, alerting && styles.boxAlert]} accessibilityLabel={`Your rights to ${subject}`}>
      <Text style={styles.title}>Your rights to {subject}</Text>
      <Text style={styles.intro}>Unis can only take music you control yourself. For now, that means:</Text>
      {POINTS.map((p) => (
        <View key={p} style={styles.li}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.liText}>{p}</Text>
        </View>
      ))}

      <Pressable
        style={styles.check}
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        <View style={[styles.box2, checked && { backgroundColor: t.primary, borderColor: t.primary }, alerting && { borderColor: '#f87171' }]}>
          {checked && <Check size={14} color="#fff" strokeWidth={3} />}
        </View>
        <Text style={styles.checkText}>
          All of this is true for {subject}, and I license it to Unis under section 3 of the{' '}
          <Text style={[styles.link, { color: t.textAccent }]} onPress={() => Linking.openURL(webUrl('/terms'))}>Terms of Service</Text>.
        </Text>
      </Pressable>

      {alerting && <Text style={styles.alert} accessibilityRole="alert">{rightsAlert(mediaType)}</Text>}

      <Pressable onPress={() => (onWhy ? onWhy() : Linking.openURL(webUrl(RIGHTS_HELP_PATH)))} hitSlop={6}>
        <Text style={[styles.why, { color: t.textAccent }]}>Why Unis asks</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  box: { padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginVertical: 10 },
  boxAlert: { borderColor: 'rgba(248,113,113,0.6)', backgroundColor: 'rgba(248,113,113,0.06)' },
  title: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
  intro: { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 4, marginBottom: 6 },
  li: { flexDirection: 'row', gap: 6, marginTop: 4 },
  bullet: { color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 18 },
  liText: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 18, flex: 1 },
  check: { flexDirection: 'row', gap: 10, marginTop: 14, alignItems: 'flex-start' },
  box2: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkText: { color: '#fff', fontSize: 13.5, lineHeight: 19, flex: 1 },
  link: { fontWeight: '700', textDecorationLine: 'underline' },
  alert: { color: '#fca5a5', fontSize: 12.5, fontWeight: '600', marginTop: 10, lineHeight: 17 },
  why: { fontSize: 12.5, fontWeight: '700', marginTop: 12 },
});

export default RightsConfirm;
