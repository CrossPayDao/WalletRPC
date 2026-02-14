
import React, { useEffect, useRef } from 'react';
import { BrandLogo } from './BrandLogo';
import { useTranslation } from '../../contexts/LanguageContext';

interface ParticleIntroProps {
  onComplete?: () => void;
  fadeOut?: boolean;
}

export const ParticleIntro: React.FC<ParticleIntroProps> = ({ onComplete, fadeOut = false }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number>(0);
  const speedRef = useRef<number>(0.2);

  useEffect(() => {
    if (!containerRef.current) return;

    const canvas = document.createElement('canvas');
    canvasRef.current = canvas;
    Object.assign(canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      zIndex: '1',
      pointerEvents: 'none',
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      objectFit: 'cover'
    });

    containerRef.current.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const depth = 1800;
    const focal = 620;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let starCount = Math.max(1200, Math.floor((width * height) / 900));

    type Star = { x: number; y: number; z: number; size: number; alpha: number };
    let stars: Star[] = [];

    const resetStar = (): Star => ({
      x: (Math.random() - 0.5) * width * 2.2,
      y: (Math.random() - 0.5) * height * 2.2,
      z: Math.random() * depth + 1,
      size: Math.random() * 1.8 + 0.4,
      alpha: Math.random() * 0.55 + 0.2
    });

    const initStars = () => {
      stars = Array.from({ length: starCount }, resetStar);
    };

    const setCanvasSize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      starCount = Math.max(1200, Math.floor((width * height) / 900));
      initStars();
    };
    setCanvasSize();

    const animate = () => {
      if (speedRef.current < 6) speedRef.current *= 1.012;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        star.z -= speedRef.current;
        if (star.z <= 1) {
          stars[i] = resetStar();
          continue;
        }

        const k = focal / star.z;
        const sx = star.x * k + width / 2;
        const sy = star.y * k + height / 2;

        if (sx < -30 || sx > width + 30 || sy < -30 || sy > height + 30) continue;

        const depthFactor = 1 - star.z / depth;
        const radius = star.size * (0.35 + depthFactor * 1.65);
        const alpha = Math.min(0.9, star.alpha * (0.4 + depthFactor * 1.3));
        ctx.beginPath();
        ctx.fillStyle = `rgba(0,98,255,${alpha})`;
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    const handleResize = () => {
      setCanvasSize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (containerRef.current && canvasRef.current) {
        containerRef.current.removeChild(canvasRef.current);
      }
    };
  }, []);

    return (
    <div 
        className={`
            fixed inset-0 z-50 flex items-center justify-center overflow-hidden
            animate-in fade-in duration-1000
            transition-all duration-1000 ease-in-out
            ${fadeOut ? 'opacity-0 blur-2xl scale-125' : 'opacity-100 scale-100'}
        `}
        style={{ backgroundColor: '#f8fafc' }}
    >
      <div ref={containerRef} className="absolute inset-0" style={{ zIndex: 1 }} />
      
      {/* Content Container */}
      <div className="relative z-10 text-center max-w-4xl px-8 animate-in fade-in zoom-in duration-1000 delay-500 fill-mode-forwards flex flex-col items-center">
         
         <div className="mb-12 opacity-90">
            <div className="w-20 h-20 border-2 border-[#0062ff]/20 rounded-full flex items-center justify-center relative shadow-[0_10px_30px_rgba(0,98,255,0.1)] bg-white">
                <div className="absolute inset-[-10%] border-t border-[#0062ff]/60 rounded-full animate-spin"></div>
                <BrandLogo size={32} color="#0062ff" className="animate-pulse" />
            </div>
         </div>

         <div className="font-mono text-slate-400 text-[10px] md:text-xs mb-6 tracking-[0.4em] uppercase font-black opacity-60">
            {t('intro.secure_context')}
         </div>
         
         <div className="space-y-4">
            <h1 className="text-2xl md:text-5xl font-black text-slate-900 tracking-tighter uppercase italic leading-tight">
               {t('intro.headline_date')}
            </h1>
            <p className="text-lg md:text-2xl font-bold text-slate-500 tracking-tight leading-relaxed max-w-2xl mx-auto italic">
              {t('intro.headline_text')}
            </p>
         </div>

         <div className="flex flex-col items-center space-y-6 mt-16">
             <div className="flex justify-center space-x-3">
                <div className="w-1.5 h-1.5 bg-[#0062ff] rounded-full animate-bounce shadow-[0_0_8px_#0062ff]" style={{ animationDelay: '0s' }}></div>
                <div className="w-1.5 h-1.5 bg-[#0062ff] rounded-full animate-bounce shadow-[0_0_8px_#0062ff]" style={{ animationDelay: '0.15s' }}></div>
                <div className="w-1.5 h-1.5 bg-[#0062ff] rounded-full animate-bounce shadow-[0_0_8px_#0062ff]" style={{ animationDelay: '0.3s' }}></div>
             </div>
             <div className="text-[9px] text-slate-300 uppercase tracking-[0.6em] font-black">
                {t('intro.awaiting')}
             </div>
         </div>
      </div>
    </div>
  );
};
