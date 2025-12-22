
import React, { useRef, useState, useEffect } from 'react';

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  intensity?: number;
  glowColor?: string;
}

export const TiltCard: React.FC<TiltCardProps> = ({ 
  children, 
  className = "", 
  intensity = 15,
  glowColor = "rgba(255, 255, 255, 0.4)"
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState("");
  const [bgPos, setBgPos] = useState("");
  const [isHovering, setIsHovering] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    setIsDesktop(media.matches);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current || !isDesktop) return;

    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const xPct = x / rect.width;
    const yPct = y / rect.height;
    const xRot = (0.5 - yPct) * intensity;
    const yRot = (xPct - 0.5) * intensity;
    
    setTransform(`perspective(1000px) rotateX(${xRot}deg) rotateY(${yRot}deg) scale3d(1.01, 1.01, 1.01)`);
    setBgPos(`${xPct * 100}% ${yPct * 100}%`);
  };

  const handleMouseLeave = () => {
    if (!isDesktop) return;
    setIsHovering(false);
    setTransform("perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)");
  };

  const handleMouseEnter = () => {
    if (!isDesktop) return;
    setIsHovering(true);
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative transition-all duration-300 ease-out transform-gpu ${className}`}
      style={{ transform, willChange: 'transform' }}
    >
      <div className="relative rounded-2xl overflow-hidden shadow-xl bg-white border border-slate-200">
        <div 
          className="absolute inset-0 pointer-events-none z-10 transition-opacity duration-300"
          style={{
            opacity: isHovering ? 1 : 0,
            background: `radial-gradient(circle at ${bgPos}, ${glowColor}, transparent 60%)`
          }}
        />
        <div className="relative z-0">
          {children}
        </div>
      </div>
    </div>
  );
};
