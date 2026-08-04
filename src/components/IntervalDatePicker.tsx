// ============================================================================
// IntervalDatePicker.tsx — mobile
//
// Rewrite. Three things changed from the previous 895-line version:
//
//   1. THEME. Every accent now derives from the `accent` prop (the caller's
//      THEME_HEX value) instead of a hardcoded '#163387'. All six modes share
//      one option renderer, so a disabled quarter and a disabled month cannot
//      drift apart the way they had.
//
//   2. CLOSED PERIODS. Selection is gated by isPeriodComplete(), not merely by
//      maxDate. The backend auto-populates a missing Award on read, so offering
//      an open period lets one tap persist a winner computed from partial data
//      and locks the cron out of ever recomputing it.
//
//   3. NO NATIVE PICKER. Daily renders the same in-app calendar as weekly. The
//      platform date panel cannot be themed — that is exactly the grey panel
//      the web version had to drop for the same reason.
//
// Keep in sync with src/intervalDatePicker.jsx on web.
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {
  fromLocalISO,
  toLocalISO,
  isPeriodComplete,
  MONTH_NAMES,
  type Interval,
} from '../utils/periodBounds';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const QUARTERS = [
  { label: 'Q1', sub: 'Jan – Mar', endMonth: 2 },
  { label: 'Q2', sub: 'Apr – Jun', endMonth: 5 },
  { label: 'Q3', sub: 'Jul – Sep', endMonth: 8 },
  { label: 'Q4', sub: 'Oct – Dec', endMonth: 11 },
];

const HALVES = [
  { label: 'H1', sub: 'Jan – Jun', endMonth: 5 },
  { label: 'H2', sub: 'Jul – Dec', endMonth: 11 },
];

const TITLES: Record<string, string> = {
  daily: 'Pick a date',
  weekly: 'Pick a week',
  monthly: 'Pick a month',
  quarterly: 'Pick a quarter',
  midterm: 'Pick a half year',
  annual: 'Pick a year',
};

const mondayOf = (d: Date) => {
  const dow = d.getDay();
  const back = dow === 0 ? 6 : dow - 1;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
};

const sundayOf = (d: Date) => {
  const mon = mondayOf(d);
  return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
};

/** Mix a hex toward black — the deep tint the panel sits on. */
const deepen = (hex: string, amount: number): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.round(((n >> 16) & 255) * amount);
  const g = Math.round(((n >> 8) & 255) * amount);
  const b = Math.round((n & 255) * amount);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

/** Hex → rgba string at the given alpha. */
const alpha = (hex: string, a: number): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export interface IntervalDatePickerProps {
  interval: Interval;
  value: string;                 // YYYY-MM-DD
  onChange: (value: string) => void;
  maxDate: string;               // YYYY-MM-DD — end of last closed period
  minDate: string;               // YYYY-MM-DD
  /** THEME_HEX value from the calling screen. Defaults to the blue theme. */
  accent?: string;
}

const IntervalDatePicker: React.FC<IntervalDatePickerProps> = ({
  interval,
  value,
  onChange,
  maxDate,
  minDate,
  accent = '#163387',
}) => {
  const initial = fromLocalISO(value) || fromLocalISO(maxDate) || new Date();

  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => initial.getFullYear());
  const [month, setMonth] = useState(() => initial.getMonth());

  const maxObj = useMemo(() => fromLocalISO(maxDate) || new Date(), [maxDate]);
  const minObj = useMemo(() => fromLocalISO(minDate) || new Date(1900, 0, 1), [minDate]);

  const maxYear = maxObj.getFullYear();
  const minYear = minObj.getFullYear();
  const maxMonth = maxObj.getMonth();
  const minMonth = minObj.getMonth();

  useEffect(() => {
    const parsed = fromLocalISO(value);
    if (parsed) {
      setYear(parsed.getFullYear());
      setMonth(parsed.getMonth());
    }
  }, [value]);

  // ── The single gate ───────────────────────────────────────────────────────
  // Inside the min/max window AND the period has actually closed. Two checks,
  // because the cost of getting it wrong is a persisted phantom award row.
  const isAllowed = useCallback(
    (date: Date | null): boolean => {
      if (!date) return false;
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const max = new Date(maxObj.getFullYear(), maxObj.getMonth(), maxObj.getDate());
      const min = new Date(minObj.getFullYear(), minObj.getMonth(), minObj.getDate());
      if (d > max || d < min) return false;
      return isPeriodComplete(toLocalISO(d), interval);
    },
    [maxObj, minObj, interval]
  );

  const commit = useCallback(
    (date: Date, close = true) => {
      if (!isAllowed(date)) return;
      onChange(toLocalISO(date));
      if (close) setOpen(false);
    },
    [isAllowed, onChange]
  );

  const displayText = useMemo(() => {
    const date = fromLocalISO(value);
    if (!date) return 'Select…';
    const y = date.getFullYear();
    const m = date.getMonth();

    switch (interval) {
      case 'daily':
        return value;
      case 'weekly': {
        const mon = mondayOf(date);
        const sun = sundayOf(date);
        return `Week of ${MONTH_NAMES[mon.getMonth()].slice(0, 3)} ${mon.getDate()} – ${sun.getDate()}`;
      }
      case 'monthly':
        return `${MONTH_NAMES[m]} ${y}`;
      case 'quarterly':
        return `Q${Math.floor(m / 3) + 1} ${y}`;
      case 'midterm':
        return `H${m <= 5 ? 1 : 2} ${y}`;
      case 'annual':
        return `${y}`;
      default:
        return value;
    }
  }, [value, interval]);

  // ── Derived palette ───────────────────────────────────────────────────────
  const palette = useMemo(
    () => ({
      accent,
      surface: deepen(accent, 0.34),
      raised: deepen(accent, 0.46),
      field: deepen(accent, 0.26),
      edge: alpha(accent, 0.46),
      edgeDim: alpha(accent, 0.24),
      wash: alpha(accent, 0.34),
    }),
    [accent]
  );

  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = maxYear; y >= minYear; y--) out.push(y);
    return out;
  }, [maxYear, minYear]);

  const calendarDays = useMemo(() => {
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDay = first.getDay();
    const days: (Date | null)[] = [];
    for (let i = 0; i < (startDay === 0 ? 6 : startDay - 1); i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));
    return days;
  }, [year, month]);

  const selected = fromLocalISO(value);
  const inSelectedWeek = (d: Date) =>
    !!selected && d >= mondayOf(selected) && d <= sundayOf(selected);

  const stepMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setMonth(next.getMonth());
    setYear(next.getFullYear());
  };

  const atMinMonth = year === minYear && month <= minMonth;
  const atMaxMonth = year === maxYear && month >= maxMonth;

  // ── Shared option tile ────────────────────────────────────────────────────
  const Option = ({
    label,
    sub,
    active,
    disabled,
    onPress,
    width,
  }: {
    label: string;
    sub?: string;
    active: boolean;
    disabled: boolean;
    onPress: () => void;
    width: '33%' | '50%';
  }) => (
    <TouchableOpacity
      style={[
        styles.option,
        { width: width === '33%' ? '31.5%' : '48.5%' },
        {
          backgroundColor: active ? palette.accent : disabled ? 'transparent' : palette.raised,
          borderColor: active ? palette.edge : palette.edgeDim,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
      activeOpacity={0.75}
    >
      <Text
        style={[
          styles.optionLabel,
          { color: active ? '#fff' : disabled ? 'rgba(246,247,249,0.30)' : 'rgba(246,247,249,0.66)' },
        ]}
      >
        {label}
      </Text>
      {!!sub && (
        <Text
          style={[
            styles.optionSub,
            { color: active ? 'rgba(255,255,255,0.75)' : 'rgba(246,247,249,0.30)' },
          ]}
        >
          {sub}
        </Text>
      )}
    </TouchableOpacity>
  );

  // Clamp the month so a year jump cannot land outside the min/max window.
  const stepYear = (delta: number) => {
    const nextYear = year + delta;
    if (nextYear < minYear || nextYear > maxYear) return;
    let m = month;
    if (nextYear === maxYear && m > maxMonth) m = maxMonth;
    if (nextYear === minYear && m < minMonth) m = minMonth;
    setYear(nextYear);
    setMonth(m);
  };

  // Four controls: year, month, month, year. Stepping back a year through
  // twelve taps on a month arrow was not navigation.
  const MonthNav = () => (
    <View style={[styles.navRow, { borderBottomColor: palette.edgeDim }]}>
      <TouchableOpacity
        style={[styles.navBtn, { borderColor: palette.edgeDim }, year <= minYear && styles.navBtnOff]}
        onPress={() => stepYear(-1)}
        disabled={year <= minYear}
        accessibilityRole="button"
        accessibilityLabel="Previous year"
      >
        <Text style={styles.navGlyph}>«</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.navBtn, { borderColor: palette.edgeDim }, atMinMonth && styles.navBtnOff]}
        onPress={() => stepMonth(-1)}
        disabled={atMinMonth}
        accessibilityRole="button"
        accessibilityLabel="Previous month"
      >
        <Text style={styles.navGlyph}>‹</Text>
      </TouchableOpacity>

      <Text style={styles.navTitle}>{MONTH_NAMES[month]} {year}</Text>

      <TouchableOpacity
        style={[styles.navBtn, { borderColor: palette.edgeDim }, atMaxMonth && styles.navBtnOff]}
        onPress={() => stepMonth(1)}
        disabled={atMaxMonth}
        accessibilityRole="button"
        accessibilityLabel="Next month"
      >
        <Text style={styles.navGlyph}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.navBtn, { borderColor: palette.edgeDim }, year >= maxYear && styles.navBtnOff]}
        onPress={() => stepYear(1)}
        disabled={year >= maxYear}
        accessibilityRole="button"
        accessibilityLabel="Next year"
      >
        <Text style={styles.navGlyph}>»</Text>
      </TouchableOpacity>
    </View>
  );

  const YearNav = () => (
    <View style={[styles.navRow, { borderBottomColor: palette.edgeDim }]}>
      <TouchableOpacity
        style={[styles.navBtn, { borderColor: palette.edgeDim }, year <= minYear && styles.navBtnOff]}
        onPress={() => setYear(year - 1)}
        disabled={year <= minYear}
        accessibilityRole="button"
        accessibilityLabel="Previous year"
      >
        <Text style={styles.navGlyph}>‹</Text>
      </TouchableOpacity>

      <Text style={styles.navTitle}>{year}</Text>

      <TouchableOpacity
        style={[styles.navBtn, { borderColor: palette.edgeDim }, year >= maxYear && styles.navBtnOff]}
        onPress={() => setYear(year + 1)}
        disabled={year >= maxYear}
        accessibilityRole="button"
        accessibilityLabel="Next year"
      >
        <Text style={styles.navGlyph}>›</Text>
      </TouchableOpacity>
    </View>
  );

  // `mode` decides what a tapped cell means: the single day, or its whole week.
  const Calendar = ({ mode }: { mode: 'day' | 'week' }) => (
    <View>
      <MonthNav />

      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={styles.weekday}>{d}</Text>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {calendarDays.map((date, idx) => {
          if (!date) return <View key={`e${idx}`} style={styles.dayCell} />;

          const disabled = !isAllowed(date);
          const active = mode === 'week'
            ? inSelectedWeek(date)
            : !!selected && toLocalISO(date) === toLocalISO(selected);

          return (
            <TouchableOpacity
              key={toLocalISO(date)}
              style={[
                styles.dayCell,
                active && { backgroundColor: palette.accent, borderRadius: 8 },
              ]}
              onPress={() => commit(date, true)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected: active }}
              accessibilityLabel={`${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.dayText,
                  disabled && styles.dayTextOff,
                  active && styles.dayTextOn,
                ]}
              >
                {date.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {mode === 'week' && (
        <Text style={styles.hint}>Tap any day to select its week</Text>
      )}
    </View>
  );

  const renderBody = () => {
    switch (interval) {
      case 'daily':
        return <Calendar mode="day" />;

      case 'weekly':
        return <Calendar mode="week" />;

      case 'monthly':
        return (
          <View>
            <YearNav />
            <View style={styles.optionGrid}>
              {MONTH_NAMES.map((name, idx) => {
                const last = new Date(year, idx + 1, 0);
                const disabled = !isAllowed(last) || (year === minYear && idx < minMonth);
                const active = !!selected && selected.getFullYear() === year && selected.getMonth() === idx;
                return (
                  <Option
                    key={name}
                    label={name.slice(0, 3)}
                    active={active}
                    disabled={disabled}
                    onPress={() => commit(last)}
                    width="33%"
                  />
                );
              })}
            </View>
          </View>
        );

      case 'quarterly':
        return (
          <View>
            <YearNav />
            <View style={styles.optionGrid}>
              {QUARTERS.map((q) => {
                const last = new Date(year, q.endMonth + 1, 0);
                const disabled = !isAllowed(last) || (year === minYear && q.endMonth < minMonth);
                const active =
                  !!selected &&
                  selected.getFullYear() === year &&
                  Math.floor(selected.getMonth() / 3) === Math.floor(q.endMonth / 3);
                return (
                  <Option
                    key={q.label}
                    label={q.label}
                    sub={q.sub}
                    active={active}
                    disabled={disabled}
                    onPress={() => commit(last)}
                    width="50%"
                  />
                );
              })}
            </View>
          </View>
        );

      case 'midterm':
        return (
          <View>
            <YearNav />
            <View style={styles.optionGrid}>
              {HALVES.map((h) => {
                const last = new Date(year, h.endMonth + 1, 0);
                const disabled = !isAllowed(last) || (year === minYear && h.endMonth < minMonth);
                const active =
                  !!selected &&
                  selected.getFullYear() === year &&
                  (selected.getMonth() <= 5 ? 5 : 11) === h.endMonth;
                return (
                  <Option
                    key={h.label}
                    label={h.label}
                    sub={h.sub}
                    active={active}
                    disabled={disabled}
                    onPress={() => commit(last)}
                    width="50%"
                  />
                );
              })}
            </View>
          </View>
        );

      case 'annual':
        return (
          <ScrollView style={styles.yearScroll} contentContainerStyle={styles.optionGrid}>
            {years.map((y) => {
              const last = new Date(y, 11, 31);
              const disabled = !isAllowed(last);
              const active = !!selected && selected.getFullYear() === y;
              return (
                <Option
                  key={y}
                  label={String(y)}
                  active={active}
                  disabled={disabled}
                  onPress={() => commit(last)}
                  width="50%"
                />
              );
            })}
          </ScrollView>
        );

      default:
        return <Calendar mode="day" />;
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.toggle, { backgroundColor: palette.field, borderColor: palette.edgeDim }]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${TITLES[interval] || 'Pick a period'}. Currently ${displayText}`}
        activeOpacity={0.8}
      >
        <Text style={styles.toggleText} numberOfLines={1}>{displayText}</Text>
        <Text style={styles.toggleChevron}>▾</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Stop taps inside the panel from closing it. */}
          <Pressable
            style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.edge }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>{TITLES[interval] || 'Pick a period'}</Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.panelClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {renderBody()}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
    minWidth: 150,
  },
  toggleText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#f6f7f9',
  },
  toggleChevron: {
    fontSize: 10,
    color: 'rgba(246,247,249,0.5)',
  },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  panel: {
    width: '100%',
    maxWidth: 400,
    padding: 16,
    borderWidth: 1,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f6f7f9',
  },
  panelClose: {
    fontSize: 15,
    color: 'rgba(246,247,249,0.55)',
  },

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
  },
  navBtn: {
    width: 32,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
  },
  navBtnOff: { opacity: 0.3 },
  navGlyph: {
    fontSize: 17,
    lineHeight: 20,
    color: 'rgba(246,247,249,0.66)',
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#f6f7f9',
  },

  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekday: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: 'rgba(246,247,249,0.30)',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    minHeight: 44,          // never smaller than a finger, whatever the width
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 15,
    color: 'rgba(246,247,249,0.66)',
  },
  dayTextOff: { color: 'rgba(246,247,249,0.20)' },
  dayTextOn: { color: '#fff', fontWeight: '700' },

  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 7,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  optionSub: {
    fontSize: 10,
    marginTop: 2,
  },

  yearScroll: { maxHeight: 300 },

  hint: {
    marginTop: 10,
    fontSize: 11,
    textAlign: 'center',
    color: 'rgba(246,247,249,0.30)',
  },
});

export default IntervalDatePicker;