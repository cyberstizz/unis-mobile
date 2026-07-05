// src/components/SocialLinksSection.tsx
// Ported from web `SocialLinksSection.jsx`.
//
// Edit + display for the user's three social URLs (Instagram / Twitter / TikTok).
// Persists via a SINGLE PUT /v1/users/profile/{userId} for all three fields
// (the old mobile screen saved one platform at a time — the web contract sends
// all three, with empty values normalized to null).
//
// Props:
//   - userId:    UUID
//   - profile:   { instagramUrl, twitterUrl, tiktokUrl }  (from ProfileSummary)
//   - onUpdated: () => void  (parent reload; busts cache)

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Linking,
  Alert,
} from 'react-native';
import { Instagram, Twitter, Music2, Edit3, Check, X } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';

interface SocialProfile {
  instagramUrl?: string | null;
  twitterUrl?: string | null;
  tiktokUrl?: string | null;
}

interface SocialLinksSectionProps {
  userId: string;
  profile: SocialProfile | null | undefined;
  onUpdated?: () => void;
}

// Belt + suspenders to the server-side validation. Returns the URL if it's a
// safe http(s) link; returns null otherwise so a malicious value never opens.
const safeUrl = (url?: string | null): string | null => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    if (lower.includes('javascript:') || lower.includes('data:')) return null;
    return trimmed;
  }
  return null;
};

const SocialLinksSection: React.FC<SocialLinksSectionProps> = ({ userId, profile, onUpdated }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({
    instagramUrl: profile?.instagramUrl || '',
    twitterUrl:   profile?.twitterUrl   || '',
    tiktokUrl:    profile?.tiktokUrl    || '',
  });

  // Re-sync if parent reloads with new data
  useEffect(() => {
    setValues({
      instagramUrl: profile?.instagramUrl || '',
      twitterUrl:   profile?.twitterUrl   || '',
      tiktokUrl:    profile?.tiktokUrl    || '',
    });
  }, [profile?.instagramUrl, profile?.twitterUrl, profile?.tiktokUrl]);

  const handleSave = async () => {
    setSaving(true);
    const startedAt = Date.now();
    try {
      await axiosInstance.put(`/v1/users/profile/${userId}`, {
        instagramUrl: values.instagramUrl.trim() || null,
        twitterUrl:   values.twitterUrl.trim()   || null,
        tiktokUrl:    values.tiktokUrl.trim()    || null,
      });
      console.log(`[SocialLinks] action=save status=ok durationMs=${Date.now() - startedAt}`);
      setEditing(false);
      onUpdated?.();
    } catch (err) {
      console.error('[SocialLinks] action=save status=fail err=', err);
      Alert.alert('Error', 'Failed to save social links. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setValues({
      instagramUrl: profile?.instagramUrl || '',
      twitterUrl:   profile?.twitterUrl   || '',
      tiktokUrl:    profile?.tiktokUrl    || '',
    });
    setEditing(false);
  };

  const openLink = (url: string) => {
    const safe = safeUrl(url);
    if (safe) Linking.openURL(safe).catch(() => {});
  };

  const update = (key: keyof typeof values, value: string) =>
    setValues(v => ({ ...v, [key]: value }));

  const hasAny = Boolean(values.instagramUrl || values.twitterUrl || values.tiktokUrl);

  return (
    <View>
      {editing ? (
        <>
          <SocialRow
            icon={<Instagram size={16} color="#AAAAAA" />}
            placeholder="https://instagram.com/yourhandle"
            value={values.instagramUrl}
            onChange={(v) => update('instagramUrl', v)}
          />
          <SocialRow
            icon={<Twitter size={16} color="#AAAAAA" />}
            placeholder="https://twitter.com/yourhandle"
            value={values.twitterUrl}
            onChange={(v) => update('twitterUrl', v)}
          />
          <SocialRow
            icon={<Music2 size={16} color="#AAAAAA" />}
            placeholder="https://tiktok.com/@yourhandle"
            value={values.tiktokUrl}
            onChange={(v) => update('tiktokUrl', v)}
          />
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={handleCancel}
              disabled={saving}
            >
              <X size={14} color="#FFFFFF" />
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={handleSave}
              disabled={saving}
            >
              <Check size={14} color="#FFFFFF" />
              <Text style={styles.btnText}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          {!!values.instagramUrl && (
            <SocialDisplay
              icon={<Instagram size={16} color="#4a9eff" />}
              label={values.instagramUrl}
              onPress={() => openLink(values.instagramUrl)}
            />
          )}
          {!!values.twitterUrl && (
            <SocialDisplay
              icon={<Twitter size={16} color="#4a9eff" />}
              label={values.twitterUrl}
              onPress={() => openLink(values.twitterUrl)}
            />
          )}
          {!!values.tiktokUrl && (
            <SocialDisplay
              icon={<Music2 size={16} color="#4a9eff" />}
              label={values.tiktokUrl}
              onPress={() => openLink(values.tiktokUrl)}
            />
          )}
          {!hasAny && (
            <Text style={styles.emptyText}>
              No social links yet. Add your handles so fans can find you.
            </Text>
          )}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={() => setEditing(true)}
            >
              <Edit3 size={14} color="#FFFFFF" />
              <Text style={styles.btnText}>{hasAny ? 'Edit' : 'Add'} links</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
};

const SocialRow: React.FC<{
  icon: React.ReactNode;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ icon, placeholder, value, onChange }) => (
  <View style={styles.row}>
    <View style={styles.rowIcon}>{icon}</View>
    <TextInput
      style={styles.input}
      placeholder={placeholder}
      placeholderTextColor="#666666"
      value={value}
      onChangeText={onChange}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="url"
    />
  </View>
);

const SocialDisplay: React.FC<{
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}> = ({ icon, label, onPress }) => (
  <TouchableOpacity style={[styles.row, styles.rowDisplay]} onPress={onPress}>
    <View style={styles.rowIcon}>{icon}</View>
    <Text style={styles.rowValue} numberOfLines={1}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  rowDisplay: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  rowIcon: {
    width: 28,
    alignItems: 'center',
  },
  rowValue: {
    color: '#CCCCCC',
    fontSize: 14,
    flex: 1,
    marginLeft: 6,
  },
  input: {
    flex: 1,
    marginLeft: 6,
    color: '#FFFFFF',
    fontSize: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  emptyText: {
    color: '#888888',
    fontSize: 13,
    marginBottom: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 16,
    marginLeft: 10,
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  btnPrimary: {
    backgroundColor: '#004aad',
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
});

export default SocialLinksSection;