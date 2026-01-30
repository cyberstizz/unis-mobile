
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Dimensions } from 'react-native';

// Design tokens from sidebar.scss
const COLORS = {
  textSilver: '#C0C0C0',
  accentWhite: '#FFFFFF',
  unisBlue: '#163387',
};

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface DrawerTriggerProps {
  visible?: boolean;
  onPress: () => void;
}

const DrawerTrigger: React.FC<DrawerTriggerProps> = ({ visible = true, onPress }) => {
  if (!visible) {
    return null;
  }

  return (
    <TouchableOpacity
      style={styles.trigger}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Unicode play/arrow character ▶ (&#9654;) */}
      <Text style={styles.arrow}>▶</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  trigger: {
    position: 'absolute',
    // Vertically centered: 50% of screen height minus half the button height
    top: (SCREEN_HEIGHT / 2) - 30,
    left: 0,
    width: 45,
    height: 60,
    backgroundColor: 'rgba(192, 192, 192, 0.1)', // rgba($text-silver, 0.1)
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  arrow: {
    color: COLORS.accentWhite,
    fontSize: 24,
  },
});

export default DrawerTrigger;