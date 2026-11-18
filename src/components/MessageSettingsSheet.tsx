// src/components/MessageSettingsSheet.tsx
// Mobile port of web src/MessageSettingsSheet.jsx — "Message settings",
// mirroring the help center's "Can I control who messages me?" article:
//   • who can message you — Everyone / People you know / No one
//   • supporters skip Requests · activity status · read receipts · spam filter
//   • blocked accounts, with Unblock
// Each change saves on its own (PUT /v1/messages/settings) and rolls back if
// the save fails.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Sheet from './ui/Sheet';
import axiosInstance from '../services/axiosInstance';
import { useFeedback, errorMessage } from '../context/FeedbackContext';
import { buildUrl } from '../utils/buildUrl';
import { haptic } from '../utils/dmFeedback';
import { initials } from './messages/DmParts';
import { useUnisTheme } from '../theme/unisTheme';

const PRIVACY = [
  { key: 'EVERYONE', label: 'Everyone', sub: 'People you don’t know land in Requests.' },
  { key: 'PEOPLE_I_KNOW', label: 'People you know', sub: 'Only artists you follow and listeners who support you.' },
  { key: 'NO_ONE', label: 'No one', sub: 'Nobody new. You can still start conversations.' },
];

const TOGGLES = [
  { key: 'supportersSkipRequests', label: 'Supporters skip Requests', sub: 'People who support you land straight in your inbox.' },
  { key: 'showActivityStatus', label: 'Show activity status', sub: 'Off hides when you’re active — and hides everyone else’s from you.' },
  { key: 'sendReadReceipts', label: 'Read receipts', sub: 'Off sends no Seen marks — and shows you none.' },
  { key: 'filterSpamRequests', label: 'Filter spam requests', sub: 'Bulk and low-quality requests go to Filtered.' },
];

const MessageSettingsSheet: React.FC<{ open: boolean; onClose: () => void; onChanged?: () => void }> = ({ open, onClose, onChanged }) => {
  const t = useUnisTheme();
  const feedback = useFeedback();
  const [settings, setSettings] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError(null);
    axiosInstance
      .get('/v1/messages/settings')
      .then((res) => { if (alive) setSettings(res.data); })
      .catch((err) => {
        console.error('[Messages] settings load failed:', err?.message || err);
        if (alive) setError('Message settings aren’t available right now.');
      });
    return () => { alive = false; };
  }, [open]);

  const save = async (patch: Record<string, any>) => {
    haptic('tap');
    const before = settings;
    setSettings((s: any) => ({ ...s, ...patch }));
    setBusy(Object.keys(patch)[0]);
    setError(null);
    try {
      const res = await axiosInstance.put('/v1/messages/settings', patch);
      setSettings(res.data);
      feedback.success('Setting saved', { id: 'dm-setting' });
      onChanged?.();
    } catch (err: any) {
      console.error('[Messages] settings save failed:', err?.message || err);
      setSettings(before);
      const text = err?.response?.data?.error || 'That change didn’t save. Try again.';
      setError(text);
      feedback.error(text);
    } finally {
      setBusy(null);
    }
  };

  const unblock = async (person: any) => {
    setBusy(`unblock-${person.userId}`);
    setError(null);
    try {
      await axiosInstance.delete(`/v1/users/${person.userId}/block`);
      setSettings((s: any) => ({ ...s, blocked: s.blocked.filter((b: any) => b.userId !== person.userId) }));
      feedback.success(`${person.username || 'That account'} can message you again`);
      onChanged?.();
    } catch (err) {
      console.error('[Messages] unblock failed:', err);
      const text = `Couldn’t unblock ${person.username || 'that account'}.`;
      setError(text);
      feedback.error(errorMessage(err, text));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet
      visible={open}
      onClose={onClose}
      title="Message settings"
      fullHeight
      right={
        <Pressable onPress={onClose} hitSlop={8} style={{ paddingTop: 6 }}>
          <Text style={{ color: t.textAccent, fontWeight: '700', fontSize: 15 }}>Done</Text>
        </Pressable>
      }
    >
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40, gap: 18 }}>
        {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
        {!settings && !error && (
          <View style={{ gap: 10 }}>
            {[0, 1, 2].map((i) => <View key={i} style={styles.skel} />)}
          </View>
        )}
        {settings && (
          <>
            <View style={styles.group}>
              <Text style={styles.label}>Who can message you</Text>
              {PRIVACY.map((p) => {
                const on = settings.messagePrivacy === p.key;
                return (
                  <Pressable
                    key={p.key}
                    disabled={busy != null}
                    onPress={() => !on && save({ messagePrivacy: p.key })}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    style={[styles.choice, on && { borderColor: t.border, backgroundColor: t.subtle }]}
                  >
                    <View style={[styles.dot, on && { borderColor: t.primary2 }]}>{on && <View style={[styles.dotInner, { backgroundColor: t.primary2 }]} />}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.choiceLabel}>{p.label}</Text>
                      <Text style={styles.choiceSub}>{p.sub}</Text>
                    </View>
                  </Pressable>
                );
              })}
              <Text style={styles.note}>Anyone you already have a conversation with can always reach you.</Text>
            </View>

            <View style={styles.group}>
              {TOGGLES.map((tg) => {
                const on = !!settings[tg.key];
                return (
                  <View key={tg.key} style={styles.toggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.choiceLabel}>{tg.label}</Text>
                      <Text style={styles.choiceSub}>{tg.sub}</Text>
                    </View>
                    <Switch
                      value={on}
                      disabled={busy != null}
                      onValueChange={() => save({ [tg.key]: !on })}
                      trackColor={{ false: 'rgba(255,255,255,0.15)', true: t.primary }}
                      thumbColor="#fff"
                      accessibilityLabel={tg.label}
                    />
                  </View>
                );
              })}
            </View>

            <View style={styles.group}>
              <Text style={styles.label}>Blocked accounts</Text>
              {settings.blocked?.length ? (
                settings.blocked.map((b: any) => (
                  <View key={b.userId} style={styles.blocked}>
                    {b.photoUrl ? (
                      <Image source={{ uri: buildUrl(b.photoUrl) || undefined }} style={styles.bAvatar} />
                    ) : (
                      <View style={[styles.bAvatar, { backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{initials(b.username || '')}</Text>
                      </View>
                    )}
                    <Text style={styles.bName} numberOfLines={1}>{b.username || 'Deleted account'}</Text>
                    <Pressable disabled={busy != null} onPress={() => unblock(b)} style={styles.unblock}>
                      {busy === `unblock-${b.userId}` ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.unblockText}>Unblock</Text>}
                    </Pressable>
                  </View>
                ))
              ) : (
                <Text style={styles.note}>You haven&rsquo;t blocked anyone.</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  error: { color: '#ff8a8a', fontSize: 13.5, padding: 10, borderRadius: 10, backgroundColor: 'rgba(214,58,58,0.12)' },
  skel: { height: 64, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)' },
  group: { gap: 8 },
  label: { color: 'rgba(255,255,255,0.45)', fontSize: 11.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)' },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  dotInner: { width: 10, height: 10, borderRadius: 5 },
  choiceLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  choiceSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  note: { color: 'rgba(255,255,255,0.45)', fontSize: 12.5, lineHeight: 18 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  blocked: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  bAvatar: { width: 40, height: 40, borderRadius: 20 },
  bName: { color: '#fff', fontSize: 14.5, fontWeight: '600', flex: 1 },
  unblock: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', minWidth: 80, alignItems: 'center' },
  unblockText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});

export default MessageSettingsSheet;
