
import React from 'react';

interface BrandLogoProps {
  className?: string;
  size?: number;
  color?: string;
}

/**
 * BrandLogo component drawn with code to match provided identity.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({ 
  className = "", 
  size = 40,
  color = "currentColor"
}) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path 
        d="M 15 50 L 50 15 L 85 15 L 85 42 L 63 42 L 53 50 L 63 58 L 85 58 L 85 85 L 50 85 Z" 
        fill={color} 
      />
    </svg>
  );
};
