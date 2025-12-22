
import React from 'react';
import { useTranslation } from '../../contexts/LanguageContext';

interface BrandLogoProps {
  className?: string;
  size?: number;
  color?: string;
}

/**
 * 【UI 设计：地域化动态 Logo (Localization Branding)】
 * 背景：在特定市场（如新加坡）提供带有地域标识的 Logo 可以显著提升用户信任感。
 * 目的：当检测到 zh-SG 环境时，自动在 Logo 旁渲染新加坡特有的标识元素。
 * 优势：在极简主义风格中融入人文关怀，提升产品的专业度与亲和力。
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({ 
  className = "", 
  size = 40,
  color = "currentColor"
}) => {
  const { isSG } = useTranslation();

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path 
          d="M 15 50 L 50 15 L 85 15 L 85 42 L 63 42 L 53 50 L 63 58 L 85 58 L 85 85 L 50 85 Z" 
          fill={color} 
        />
        
        {/* 新加坡专属标识：当环境为 zh-SG 时渲染微型星月元素或 SG 文本 */}
        {isSG && (
          <g opacity="0.8">
            <rect x="70" y="70" width="25" height="15" rx="2" fill="#EF4444" />
            <text x="73" y="81" fill="white" fontSize="10" fontWeight="900" style={{ fontFamily: 'Inter' }}>SG</text>
          </g>
        )}
      </svg>
    </div>
  );
};
