// src/components/PlusMark.tsx
// The Unis Plus lockup (UNIS wordmark + "+"). Web draws it per theme from the
// header wordmarks plus an SVG "+"; the app uses the static brand lockup web
// ships for emails and social (public/brand/unis-plus.png), aspect 2220×480.
import React from 'react';
import { Image } from 'react-native';

const SOURCE = require('../../assets/brand/unis-plus.png');
const ASPECT = 2220 / 480;

const PlusMark: React.FC<{ height?: number; style?: any }> = ({ height = 28, style }) => (
  <Image
    source={SOURCE}
    style={[{ height, width: height * ASPECT }, style]}
    resizeMode="contain"
    accessibilityLabel="Unis Plus"
  />
);

export default PlusMark;
