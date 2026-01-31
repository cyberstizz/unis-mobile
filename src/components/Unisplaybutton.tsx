// src/components/UnisPlayButton.tsx
// Custom play button icon - blue circle with black triangle

import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

interface UnisPlayButtonProps {
  size?: number;
}

const UnisPlayButton: React.FC<UnisPlayButtonProps> = ({ size = 40 }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
  >
    {/* Blue circle background */}
    <Circle
      cx="50"
      cy="50"
      r="48"
      fill="#163387"
    />
    
    {/* Play triangle */}
    <Path
      d="M38 30 L70 50 L38 70 Z"
      fill="black"
    />
  </Svg>
);

export default UnisPlayButton;