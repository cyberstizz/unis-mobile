// src/components/SelectPill.tsx
// Mobile replacement for the compact <select> controls used across the
// dashboard analytics sections (FanbaseFunnel, DemographicsSection,
// SongStatsModal). Renders as a pill; tapping opens a bottom-sheet-style
// option list in a Modal. Keeps the web behavior: single value, immediate
// onChange, disabled state.

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { ChevronDown, Check } from 'lucide-react-native';

export interface SelectOption {
  key: string;
  label: string;
}

interface SelectPillProps {
  value: string;
  options: SelectOption[];
  onChange: (key: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
}

const SelectPill: React.FC<SelectPillProps> = ({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === value);

  return (
    <>
      <TouchableOpacity
        style={[styles.pill, disabled && styles.pillDisabled]}
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityLabel={ariaLabel}
        accessibilityRole="button"
      >
        <Text style={styles.pillText} numberOfLines={1}>
          {current?.label || value}
        </Text>
        <ChevronDown size={13} color="#AAAAAA" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            {ariaLabel ? <Text style={styles.sheetTitle}>{ariaLabel}</Text> : null}
            <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
              {options.map((o) => {
                const active = o.key === value;
                return (
                  <TouchableOpacity
                    key={o.key}
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => {
                      setOpen(false);
                      if (o.key !== value) onChange(o.key);
                    }}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>
                      {o.label}
                    </Text>
                    {active && <Check size={15} color="#4a9eff" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  pillDisabled: {
    opacity: 0.45,
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginRight: 5,
    maxWidth: 130,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#101010',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    maxHeight: '60%',
  },
  sheetTitle: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sheetList: {
    flexGrow: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  optionActive: {
    backgroundColor: 'rgba(74, 158, 255, 0.08)',
  },
  optionText: {
    color: '#CCCCCC',
    fontSize: 15,
  },
  optionTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

export default SelectPill;