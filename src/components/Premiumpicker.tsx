// src/components/VotingWizard/PremiumPicker.tsx
// A custom dropdown selector styled to match the Unis dark luxury theme.
// Replaces the HTML <select> from web — React Native's native Picker 
// looks like default Android UI which breaks the premium feel.

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Animated,
  Dimensions,
  Pressable,
} from 'react-native';
import { ChevronDown, Check } from 'lucide-react-native';

interface PickerOption {
  label: string;
  value: string;
}

interface PremiumPickerProps {
  options: PickerOption[];
  selectedValue: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const PremiumPicker: React.FC<PremiumPickerProps> = ({
  options,
  selectedValue,
  onValueChange,
  placeholder = 'Select...',
  disabled = false,
  loading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const selectedLabel = options.find(o => o.value === selectedValue)?.label || placeholder;

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 28,
          stiffness: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen]);

  const handleSelect = (value: string) => {
    onValueChange(value);
    setIsOpen(false);
  };

  const renderOption = ({ item }: { item: PickerOption }) => {
    const isSelected = item.value === selectedValue;
    return (
      <TouchableOpacity
        style={[styles.option, isSelected && styles.optionSelected]}
        onPress={() => handleSelect(item.value)}
        activeOpacity={0.7}
      >
        <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
          {item.label}
        </Text>
        {isSelected && (
          <Check size={18} color="#163387" strokeWidth={3} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <>
      {/* Trigger Button */}
      <TouchableOpacity
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        onPress={() => !disabled && setIsOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={[styles.triggerText, disabled && styles.triggerTextDisabled]}>
          {loading ? 'Loading...' : selectedLabel}
        </Text>
        <ChevronDown size={16} color={disabled ? '#555' : '#918f8f'} />
      </TouchableOpacity>

      {/* Bottom Sheet Modal */}
      <Modal
        visible={isOpen}
        transparent
        animationType="none"
        onRequestClose={() => setIsOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.modalContainer}>
          {/* Backdrop */}
          <Animated.View
            style={[
              styles.backdrop,
              { opacity: backdropAnim },
            ]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsOpen(false)} />
          </Animated.View>

          {/* Sheet */}
          <Animated.View
            style={[
              styles.sheet,
              { transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* Handle */}
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>

            {/* Title */}
            <Text style={styles.sheetTitle}>Select Option</Text>

            {/* Options List */}
            <FlatList
              data={options}
              renderItem={renderOption}
              keyExtractor={(item) => item.value}
              style={styles.optionsList}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />

            {/* Cancel */}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setIsOpen(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  // -- Trigger --
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(192, 192, 192, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  triggerDisabled: {
    opacity: 0.5,
  },
  triggerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  triggerTextDisabled: {
    color: '#555',
  },

  // -- Modal --
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  sheet: {
    backgroundColor: '#111111',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: SCREEN_HEIGHT * 0.55,
    borderTopWidth: 1,
    borderColor: 'rgba(22, 51, 135, 0.3)',
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(192, 192, 192, 0.3)',
  },
  sheetTitle: {
    color: '#A9A9A9',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2,
    textAlign: 'center',
    paddingVertical: 14,
  },

  // -- Options --
  optionsList: {
    paddingHorizontal: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  optionSelected: {
    backgroundColor: 'rgba(22, 51, 135, 0.15)',
  },
  optionText: {
    color: '#C0C0C0',
    fontSize: 16,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(192, 192, 192, 0.06)',
  },

  // -- Cancel --
  cancelButton: {
    marginTop: 8,
    marginHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  cancelText: {
    color: '#A9A9A9',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

export default PremiumPicker;