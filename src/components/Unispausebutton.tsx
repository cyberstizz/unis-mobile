// src/components/UnisPauseButton.tsx
// Custom pause button icon - blue circle with black pause bars

import React from 'react';
import Svg, { Circle, Rect } from 'react-native-svg';

interface UnisPauseButtonProps {
  size?: number;
}

const UnisPauseButton: React.FC<UnisPauseButtonProps> = ({ size = 40 }) => (
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
    
    {/* Left pause bar */}
    <Rect
      x="35"
      y="30"
      width="10"
      height="40"
      fill="black"
    />
    
    {/* Right pause bar */}
    <Rect
      x="55"
      y="30"
      width="10"
      height="40"
      fill="black"
    />
  </Svg>
);

export default UnisPauseButton;