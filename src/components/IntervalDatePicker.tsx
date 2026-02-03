import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';

// ============================================================================
// COLORS
// ============================================================================
const COLORS = {
  bgBlack: '#000000',
  subtleBlack: '#1a1a1a',
  modalBg: '#2a2a2a',
  textWhite: '#FFFFFF',
  textSilver: '#C0C0C0',
  textGray: '#A9A9A9',
  textDisabled: '#555555',
  unisBlue: '#163387',
  highlightBlue: '#2196f3',
  borderColor: '#444444',
  borderLight: '#555555',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================================================
// CONSTANTS
// ============================================================================
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const QUARTERS = [
  { label: 'Q1 (Jan-Mar)', value: 1, startMonth: 0, endMonth: 2 },
  { label: 'Q2 (Apr-Jun)', value: 2, startMonth: 3, endMonth: 5 },
  { label: 'Q3 (Jul-Sep)', value: 3, startMonth: 6, endMonth: 8 },
  { label: 'Q4 (Oct-Dec)', value: 4, startMonth: 9, endMonth: 11 },
];

const HALVES = [
  { label: 'H1 (Jan-Jun)', value: 1, startMonth: 0, endMonth: 5 },
  { label: 'H2 (Jul-Dec)', value: 2, startMonth: 6, endMonth: 11 },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
const getMonday = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

const getSunday = (date: Date): Date => {
  const monday = getMonday(date);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
};

const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateString = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// ============================================================================
// PROPS INTERFACE
// ============================================================================
interface IntervalDatePickerProps {
  interval: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'midterm' | 'annual';
  value: string; // YYYY-MM-DD format
  onChange: (value: string) => void;
  maxDate: string; // YYYY-MM-DD format
  minDate: string; // YYYY-MM-DD format
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const IntervalDatePicker: React.FC<IntervalDatePickerProps> = ({
  interval,
  value,
  onChange,
  maxDate,
  minDate,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

  // Parse min/max dates
  const maxDateObj = maxDate ? parseDateString(maxDate) : new Date();
  const minDateObj = minDate ? parseDateString(minDate) : new Date('1900-01-01');

  const maxYear = maxDateObj.getFullYear();
  const maxMonth = maxDateObj.getMonth();
  const minYear = minDateObj.getFullYear();
  const minMonth = minDateObj.getMonth();

  // Generate years array
  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y--) {
    years.push(y);
  }

  // ============================================================================
  // DISPLAY TEXT
  // ============================================================================
  const getDisplayText = (): string => {
    if (!value) return 'Select...';

    const date = parseDateString(value);
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    switch (interval) {
      case 'daily':
        return `${MONTHS[month]} ${day}, ${year}`;

      case 'weekly': {
        const monday = getMonday(date);
        const sunday = getSunday(date);
        return `Week of ${MONTHS[monday.getMonth()]} ${monday.getDate()} - ${sunday.getDate()}, ${monday.getFullYear()}`;
      }

      case 'monthly':
        return `${MONTHS[month]} ${year}`;

      case 'quarterly': {
        const q = Math.floor(month / 3) + 1;
        return `Q${q} ${year}`;
      }

      case 'midterm': {
        const h = month <= 5 ? 1 : 2;
        return `H${h} ${year} (${h === 1 ? 'Jan-Jun' : 'Jul-Dec'})`;
      }

      case 'annual':
        return `${year}`;

      default:
        return value;
    }
  };

  // ============================================================================
  // SELECTION HANDLERS
  // ============================================================================
  const isSelectable = (date: Date): boolean => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const max = new Date(maxDateObj);
    max.setHours(0, 0, 0, 0);
    const min = new Date(minDateObj);
    min.setHours(0, 0, 0, 0);
    return d <= max && d >= min;
  };

  const handleDateSelect = (date: Date) => {
    if (!isSelectable(date)) return;
    onChange(formatDateString(date));
    if (interval === 'daily') setShowPicker(false);
  };

  const handleMonthSelect = (monthIndex: number) => {
    if (selectedYear === maxYear && monthIndex > maxMonth) return;
    if (selectedYear === minYear && monthIndex < minMonth) return;

    const lastDay = new Date(selectedYear, monthIndex + 1, 0).getDate();
    const selectedDate = new Date(selectedYear, monthIndex, lastDay);
    onChange(formatDateString(selectedDate));
    setShowPicker(false);
  };

  const handleQuarterSelect = (quarter: typeof QUARTERS[0]) => {
    if (selectedYear === maxYear && quarter.endMonth > maxMonth) return;
    if (selectedYear === minYear && quarter.endMonth < minMonth) return;

    const lastDay = new Date(selectedYear, quarter.endMonth + 1, 0).getDate();
    onChange(formatDateString(new Date(selectedYear, quarter.endMonth, lastDay)));
    setShowPicker(false);
  };

  const handleHalfSelect = (half: typeof HALVES[0]) => {
    if (selectedYear === maxYear && half.endMonth > maxMonth) return;
    if (selectedYear === minYear && half.endMonth < minMonth) return;

    const lastDay = new Date(selectedYear, half.endMonth + 1, 0).getDate();
    onChange(formatDateString(new Date(selectedYear, half.endMonth, lastDay)));
    setShowPicker(false);
  };

  const handleYearSelect = (year: number) => {
    if (interval === 'annual') {
      onChange(formatDateString(new Date(year, 11, 31)));
      setShowPicker(false);
    } else {
      setSelectedYear(year);
    }
  };

  // ============================================================================
  // CALENDAR HELPERS (for weekly)
  // ============================================================================
  const generateCalendarDays = (): (Date | null)[] => {
    const firstDay = new Date(selectedYear, selectedMonth, 1);
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0);
    const startDay = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const days: (Date | null)[] = [];

    // Add empty cells for days before first of month (Mon = 1, Sun = 0)
    const emptyCells = startDay === 0 ? 6 : startDay - 1;
    for (let i = 0; i < emptyCells; i++) {
      days.push(null);
    }

    // Add days of month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(new Date(selectedYear, selectedMonth, d));
    }

    return days;
  };

  const isInSelectedWeek = (date: Date | null): boolean => {
    if (!value || !date) return false;
    const selectedDate = parseDateString(value);
    const selectedMonday = getMonday(selectedDate);
    const selectedSunday = getSunday(selectedDate);
    return date >= selectedMonday && date <= selectedSunday;
  };

  const canGoBackMonth = (): boolean => {
    if (selectedYear > minYear) return true;
    return selectedMonth > minMonth;
  };

  const canGoForwardMonth = (): boolean => {
    if (selectedYear < maxYear) return true;
    return selectedMonth < maxMonth;
  };

  const goBackMonth = () => {
    if (selectedMonth === 0) {
      if (selectedYear > minYear) {
        setSelectedMonth(11);
        setSelectedYear(selectedYear - 1);
      }
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const goForwardMonth = () => {
    if (selectedMonth === 11) {
      if (selectedYear < maxYear) {
        setSelectedMonth(0);
        setSelectedYear(selectedYear + 1);
      }
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  // ============================================================================
  // RENDER PICKER CONTENT
  // ============================================================================
  const renderPickerContent = () => {
    switch (interval) {
      // ========== DAILY ==========
      case 'daily':
        return (
          <View style={styles.calendarContainer}>
            {/* Header */}
            <View style={styles.pickerHeader}>
              <TouchableOpacity
                onPress={goBackMonth}
                disabled={!canGoBackMonth()}
                style={styles.navButton}
              >
                <ChevronLeft
                  size={20}
                  color={canGoBackMonth() ? COLORS.textWhite : COLORS.textDisabled}
                />
              </TouchableOpacity>
              <Text style={styles.headerText}>
                {MONTHS[selectedMonth]} {selectedYear}
              </Text>
              <TouchableOpacity
                onPress={goForwardMonth}
                disabled={!canGoForwardMonth()}
                style={styles.navButton}
              >
                <ChevronRight
                  size={20}
                  color={canGoForwardMonth() ? COLORS.textWhite : COLORS.textDisabled}
                />
              </TouchableOpacity>
            </View>

            {/* Weekday Headers */}
            <View style={styles.weekdayHeaders}>
              {WEEKDAYS.map((day) => (
                <Text key={day} style={styles.weekdayText}>
                  {day}
                </Text>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendarGrid}>
              {generateCalendarDays().map((date, idx) => {
                const selectable = date && isSelectable(date);
                const isSelected =
                  date && value && formatDateString(date) === value;

                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.calendarDay,
                      !date && styles.emptyDay,
                      isSelected && styles.selectedDay,
                      date && !selectable && styles.disabledDay,
                    ]}
                    onPress={() => date && selectable && handleDateSelect(date)}
                    disabled={!date || !selectable}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        isSelected && styles.selectedDayText,
                        date && !selectable && styles.disabledDayText,
                      ]}
                    >
                      {date ? date.getDate() : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      // ========== WEEKLY ==========
      case 'weekly':
        return (
          <View style={styles.calendarContainer}>
            {/* Header */}
            <View style={styles.pickerHeader}>
              <TouchableOpacity
                onPress={goBackMonth}
                disabled={!canGoBackMonth()}
                style={styles.navButton}
              >
                <ChevronLeft
                  size={20}
                  color={canGoBackMonth() ? COLORS.textWhite : COLORS.textDisabled}
                />
              </TouchableOpacity>
              <Text style={styles.headerText}>
                {MONTHS[selectedMonth]} {selectedYear}
              </Text>
              <TouchableOpacity
                onPress={goForwardMonth}
                disabled={!canGoForwardMonth()}
                style={styles.navButton}
              >
                <ChevronRight
                  size={20}
                  color={canGoForwardMonth() ? COLORS.textWhite : COLORS.textDisabled}
                />
              </TouchableOpacity>
            </View>

            {/* Weekday Headers */}
            <View style={styles.weekdayHeaders}>
              {WEEKDAYS.map((day) => (
                <Text key={day} style={styles.weekdayText}>
                  {day}
                </Text>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendarGrid}>
              {generateCalendarDays().map((date, idx) => {
                const selectable = date && isSelectable(date);
                const inWeek = isInSelectedWeek(date);

                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.calendarDay,
                      !date && styles.emptyDay,
                      inWeek && styles.inWeekDay,
                      date && !selectable && styles.disabledDay,
                    ]}
                    onPress={() => date && selectable && handleDateSelect(date)}
                    disabled={!date || !selectable}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        inWeek && styles.inWeekDayText,
                        date && !selectable && styles.disabledDayText,
                      ]}
                    >
                      {date ? date.getDate() : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Hint */}
            <Text style={styles.weekHint}>Click any day to select its week</Text>
          </View>
        );

      // ========== MONTHLY ==========
      case 'monthly':
        return (
          <View style={styles.pickerContainer}>
            {/* Header */}
            <View style={styles.pickerHeader}>
              <TouchableOpacity
                onPress={() => setSelectedYear(selectedYear - 1)}
                disabled={selectedYear <= minYear}
                style={styles.navButton}
              >
                <ChevronLeft
                  size={20}
                  color={selectedYear > minYear ? COLORS.textWhite : COLORS.textDisabled}
                />
              </TouchableOpacity>
              <Text style={styles.headerText}>{selectedYear}</Text>
              <TouchableOpacity
                onPress={() => setSelectedYear(selectedYear + 1)}
                disabled={selectedYear >= maxYear}
                style={styles.navButton}
              >
                <ChevronRight
                  size={20}
                  color={selectedYear < maxYear ? COLORS.textWhite : COLORS.textDisabled}
                />
              </TouchableOpacity>
            </View>

            {/* Month Grid */}
            <View style={styles.monthGrid}>
              {MONTHS_SHORT.map((month, idx) => {
                const isTooEarly = selectedYear === minYear && idx < minMonth;
                const isTooLate = selectedYear === maxYear && idx > maxMonth;
                const disabled = isTooEarly || isTooLate;

                return (
                  <TouchableOpacity
                    key={month}
                    style={[styles.monthBtn, disabled && styles.disabledBtn]}
                    onPress={() => !disabled && handleMonthSelect(idx)}
                    disabled={disabled}
                  >
                    <Text style={[styles.btnText, disabled && styles.disabledBtnText]}>
                      {month}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      // ========== QUARTERLY ==========
      case 'quarterly':
        return (
          <View style={styles.pickerContainer}>
            {/* Header */}
            <View style={styles.pickerHeader}>
              <TouchableOpacity
                onPress={() => setSelectedYear(selectedYear - 1)}
                disabled={selectedYear <= minYear}
                style={styles.navButton}
              >
                <ChevronLeft
                  size={20}
                  color={selectedYear > minYear ? COLORS.textWhite : COLORS.textDisabled}
                />
              </TouchableOpacity>
              <Text style={styles.headerText}>{selectedYear}</Text>
              <TouchableOpacity
                onPress={() => setSelectedYear(selectedYear + 1)}
                disabled={selectedYear >= maxYear}
                style={styles.navButton}
              >
                <ChevronRight
                  size={20}
                  color={selectedYear < maxYear ? COLORS.textWhite : COLORS.textDisabled}
                />
              </TouchableOpacity>
            </View>

            {/* Quarter Grid */}
            <View style={styles.quarterGrid}>
              {QUARTERS.map((q) => {
                const isTooEarly = selectedYear === minYear && q.endMonth < minMonth;
                const isTooLate = selectedYear === maxYear && q.endMonth > maxMonth;
                const disabled = isTooEarly || isTooLate;

                return (
                  <TouchableOpacity
                    key={q.value}
                    style={[styles.quarterBtn, disabled && styles.disabledBtn]}
                    onPress={() => !disabled && handleQuarterSelect(q)}
                    disabled={disabled}
                  >
                    <Text style={[styles.btnText, disabled && styles.disabledBtnText]}>
                      {q.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      // ========== MIDTERM ==========
      case 'midterm':
        return (
          <View style={styles.pickerContainer}>
            {/* Header */}
            <View style={styles.pickerHeader}>
              <TouchableOpacity
                onPress={() => setSelectedYear(selectedYear - 1)}
                disabled={selectedYear <= minYear}
                style={styles.navButton}
              >
                <ChevronLeft
                  size={20}
                  color={selectedYear > minYear ? COLORS.textWhite : COLORS.textDisabled}
                />
              </TouchableOpacity>
              <Text style={styles.headerText}>{selectedYear}</Text>
              <TouchableOpacity
                onPress={() => setSelectedYear(selectedYear + 1)}
                disabled={selectedYear >= maxYear}
                style={styles.navButton}
              >
                <ChevronRight
                  size={20}
                  color={selectedYear < maxYear ? COLORS.textWhite : COLORS.textDisabled}
                />
              </TouchableOpacity>
            </View>

            {/* Half Grid */}
            <View style={styles.halfGrid}>
              {HALVES.map((h) => {
                const isTooEarly = selectedYear === minYear && h.endMonth < minMonth;
                const isTooLate = selectedYear === maxYear && h.endMonth > maxMonth;
                const disabled = isTooEarly || isTooLate;

                return (
                  <TouchableOpacity
                    key={h.value}
                    style={[styles.halfBtn, disabled && styles.disabledBtn]}
                    onPress={() => !disabled && handleHalfSelect(h)}
                    disabled={disabled}
                  >
                    <Text style={[styles.btnText, disabled && styles.disabledBtnText]}>
                      {h.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      // ========== ANNUAL ==========
      case 'annual':
        return (
          <View style={styles.pickerContainer}>
            <Text style={styles.yearPickerTitle}>Select Year</Text>
            <ScrollView style={styles.yearScrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.yearGrid}>
                {years.map((year) => (
                  <TouchableOpacity
                    key={year}
                    style={styles.yearBtn}
                    onPress={() => handleYearSelect(year)}
                  >
                    <Text style={styles.yearBtnText}>{year}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        );

      default:
        return null;
    }
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  return (
    <View style={styles.container}>
      {/* Toggle Button */}
      <TouchableOpacity
        style={styles.toggleButton}
        onPress={() => setShowPicker(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.toggleButtonText}>{getDisplayText()}</Text>
        <ChevronDown size={16} color={COLORS.textGray} />
      </TouchableOpacity>

      {/* Picker Modal */}
      <Modal
        visible={showPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            {renderPickerContent()}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: {
    width: '100%',
  },

  // Toggle Button
  toggleButton: {
    backgroundColor: COLORS.bgBlack,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minWidth: 200,
  },
  toggleButtonText: {
    color: COLORS.textWhite,
    fontSize: 14,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.modalBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    padding: 15,
    width: '90%',
    maxWidth: 340,
    maxHeight: '80%',
  },

  // Picker Container (for non-calendar pickers)
  pickerContainer: {
    width: '100%',
  },

  // Calendar Container
  calendarContainer: {
    width: '100%',
  },

  // Header
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
  },
  headerText: {
    color: COLORS.textWhite,
    fontSize: 16,
    fontWeight: '600',
  },
  navButton: {
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 6,
  },

  // Weekday Headers
  weekdayHeaders: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textGray,
    paddingVertical: 5,
  },

  // Calendar Grid
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  calendarDayText: {
    fontSize: 13,
    color: COLORS.textWhite,
  },
  emptyDay: {
    backgroundColor: 'transparent',
  },
  selectedDay: {
    backgroundColor: COLORS.highlightBlue,
  },
  selectedDayText: {
    color: COLORS.textWhite,
    fontWeight: 'bold',
  },
  inWeekDay: {
    backgroundColor: COLORS.highlightBlue,
  },
  inWeekDayText: {
    color: COLORS.textWhite,
  },
  disabledDay: {
    opacity: 0.3,
  },
  disabledDayText: {
    color: COLORS.textDisabled,
  },

  // Week Hint
  weekHint: {
    marginTop: 10,
    fontSize: 11,
    color: COLORS.textGray,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Month Grid
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthBtn: {
    width: '30%',
    paddingVertical: 14,
    backgroundColor: COLORS.subtleBlack,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    borderRadius: 8,
    alignItems: 'center',
  },

  // Quarter Grid
  quarterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quarterBtn: {
    width: '47%',
    paddingVertical: 18,
    backgroundColor: COLORS.subtleBlack,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    borderRadius: 8,
    alignItems: 'center',
  },

  // Half Grid (Midterm)
  halfGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  halfBtn: {
    flex: 1,
    paddingVertical: 24,
    backgroundColor: COLORS.subtleBlack,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    borderRadius: 8,
    alignItems: 'center',
  },

  // Year Grid
  yearPickerTitle: {
    color: COLORS.textWhite,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
  },
  yearScrollView: {
    maxHeight: 300,
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  yearBtn: {
    width: '47%',
    paddingVertical: 18,
    backgroundColor: COLORS.subtleBlack,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    borderRadius: 8,
    alignItems: 'center',
  },
  yearBtnText: {
    color: COLORS.textWhite,
    fontSize: 15,
    fontWeight: '500',
  },

  // Shared Button Styles
  btnText: {
    color: COLORS.textWhite,
    fontSize: 13,
  },
  disabledBtn: {
    backgroundColor: '#252525',
    opacity: 0.5,
  },
  disabledBtnText: {
    color: COLORS.textDisabled,
  },
});

export default IntervalDatePicker;