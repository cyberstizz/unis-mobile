// src/components/AccountSettings.tsx
// Ported from web `AccountSettings.jsx`.
//
// Notification + privacy toggles. Optimistic update pattern preserved:
// flip the switch immediately, PATCH /v1/users/{userId}/preferences with the
// single changed key, revert on failure.
//
// Props:
//   - userId:    UUID
//   - settings:  { emailNotifications, publicProfile, showVoteHistory } (from summary)
//   - onUpdated: () => void

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Bell, Eye } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';

interface SettingsShape {
  emailNotifications: boolean;
  publicProfile: boolean;
  showVoteHistory: boolean;
}

const DEFAULTS: SettingsShape = {
  emailNotifications: true,
  publicProfile: true,
  showVoteHistory: false,
};

interface AccountSettingsProps {
  userId: string;
  settings?: Partial<SettingsShape> | null;
  onUpdated?: () => void;
}

const AccountSettings: React.FC<AccountSettingsProps> = ({
  userId,
  settings: incomingSettings,
  onUpdated,
}) => {
  const [settings, setSettings] = useState<SettingsShape>({
    ...DEFAULTS,
    ...(incomingSettings || {}),
  });
  const [saving, setSaving] = useState<Partial<Record<keyof SettingsShape, boolean>>>({});

  // Re-sync when parent provides new settings (e.g., after reload()).
  useEffect(() => {
    if (incomingSettings) {
      setSettings(s => ({ ...s, ...incomingSettings }));
    }
  }, [incomingSettings]);

  const update = async (key: keyof SettingsShape, value: boolean) => {
    const prev = settings[key];

    // Optimistic
    setSettings(s => ({ ...s, [key]: value }));
    setSaving(s => ({ ...s, [key]: true }));

    const startedAt = Date.now();
    try {
      await axiosInstance.patch(`/v1/users/${userId}/preferences`, { [key]: value });
      console.log(`[AccountSettings] action=update key=${key} status=ok durationMs=${Date.now() - startedAt}`);
      onUpdated?.();
    } catch (err) {
      console.error(`[AccountSettings] action=update key=${key} status=fail durationMs=${Date.now() - startedAt} err=`, err);
      setSettings(s => ({ ...s, [key]: prev })); // revert
    } finally {
      setSaving(s => ({ ...s, [key]: false }));
    }
  };

  return (
    <View>
      {/* ----- Notifications group ----- */}
      <View style={styles.group}>
        <View style={styles.groupLabel}>
          <Bell size={12} color="#888888" />
          <Text style={styles.groupLabelText}>Notifications</Text>
        </View>

        <SettingRow
          label="Email notifications"
          sub="Weekly digest of your jurisdiction and activity"
        >
          <Switch
            on={settings.emailNotifications}
            disabled={!!saving.emailNotifications}
            onToggle={() => update('emailNotifications', !settings.emailNotifications)}
          />
        </SettingRow>
      </View>

      {/* ----- Privacy group ----- */}
      <View style={styles.group}>
        <View style={styles.groupLabel}>
          <Eye size={12} color="#888888" />
          <Text style={styles.groupLabelText}>Privacy</Text>
        </View>

        <SettingRow label="Public profile" sub="Anyone on UNIS can find you">
          <Switch
            on={settings.publicProfile}
            disabled={!!saving.publicProfile}
            onToggle={() => update('publicProfile', !settings.publicProfile)}
          />
        </SettingRow>

        <SettingRow label="Show vote history" sub="Display your votes on your profile">
          <Switch
            on={settings.showVoteHistory}
            disabled={!!saving.showVoteHistory}
            onToggle={() => update('showVoteHistory', !settings.showVoteHistory)}
          />
        </SettingRow>
      </View>
    </View>
  );
};

const SettingRow: React.FC<{
  label: string;
  sub?: string;
  children: React.ReactNode;
}> = ({ label, sub, children }) => (
  <View style={styles.row}>
    <View style={styles.rowText}>
      <Text style={styles.rowLabel}>{label}</Text>
      {!!sub && <Text style={styles.rowSub}>{sub}</Text>}
    </View>
    <View>{children}</View>
  </View>
);

const Switch: React.FC<{
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}> = ({ on, onToggle, disabled }) => (
  <TouchableOpacity
    style={[styles.switch, on && styles.switchOn, disabled && styles.switchDisabled]}
    onPress={onToggle}
    disabled={disabled}
    accessibilityRole="switch"
    accessibilityState={{ checked: on, disabled: !!disabled }}
    accessibilityLabel={on ? 'Enabled — tap to disable' : 'Disabled — tap to enable'}
    activeOpacity={0.8}
  >
    <View style={[styles.thumb, on && styles.thumbOn]} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  group: {
    marginBottom: 18,
  },
  groupLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  groupLabelText: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginLeft: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomWidth: 1,
  },
  rowText: {
    flex: 1,
    paddingRight: 14,
  },
  rowLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  rowSub: {
    color: '#888888',
    fontSize: 12,
    marginTop: 2,
  },
  switch: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    padding: 3,
    justifyContent: 'center',
  },
  switchOn: {
    backgroundColor: '#004aad',
  },
  switchDisabled: {
    opacity: 0.5,
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },
  thumbOn: {
    alignSelf: 'flex-end',
  },
});

export default AccountSettings;