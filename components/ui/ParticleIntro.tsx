
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { BrandLogo } from './BrandLogo';

if (typeof window !== 'undefined' && !(window as any).THREE) {
  (window as any).THREE = THREE;
}

interface ParticleIntroProps {
  onComplete?: () => void;
  fadeOut?: boolean;
}

export const ParticleIntro: React.FC<ParticleIntroProps> = ({ onComplete, fadeOut = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);
  const speedRef = useRef<number>(0.2);

  useEffect(() => {
    if (!containerRef.current) return;
    if (typeof THREE === 'undefined') return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xf8fafc, 0.001);

    const aspect = window.innerWidth / window.innerHeight;
    const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 3000);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ 
      alpha: false,
      antialias: true,
      powerPreference: "high-performance"
    });
    
    const setRendererSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
    };
    setRendererSize();
    renderer.setClearColor(0xf8fafc, 1);
    
    const canvas = renderer.domElement;
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

    const starGeo = new THREE.BufferGeometry();
    const starCount = 3000;
    const positions = new Float32Array(starCount * 3);

    for(let i=0; i<starCount; i++) {
      positions[i*3] = (Math.random() - 0.5) * 1500;
      positions[i*3+1] = (Math.random() - 0.5) * 1500;
      positions[i*3+2] = Math.random() * 2000;
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const starMaterial = new THREE.PointsMaterial({
      color: 0x0062ff,
      size: 2.0,
      transparent: true,
      opacity: 0.4,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
      depthWrite: false
    });

    const stars = new THREE.Points(starGeo, starMaterial);
    scene.add(stars);

    const animate = () => {
      const positions = starGeo.attributes.position.array as Float32Array;
      if (speedRef.current < 6) speedRef.current *= 1.012;

      for(let i=0; i<starCount; i++) {
        positions[i*3 + 2] -= speedRef.current;
        if (positions[i*3 + 2] < 0) {
           positions[i*3 + 2] = 2000;
           positions[i*3] = (Math.random() - 0.5) * 1500;
           positions[i*3 + 1] = (Math.random() - 0.5) * 1500;
        }
      }
      
      starGeo.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      starGeo.dispose();
      starMaterial.dispose();
      renderer.dispose();
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
            INITIALIZING_SECURE_CONTEXT
         </div>
         
         <div className="space-y-4">
            <h1 className="text-2xl md:text-5xl font-black text-slate-900 tracking-tighter uppercase italic leading-tight">
               The Times <span className="text-[#0062ff]">03/Jan/2009</span>
            </h1>
            <p className="text-lg md:text-2xl font-bold text-slate-500 tracking-tight leading-relaxed max-w-2xl mx-auto italic">
              "Chancellor on brink of second bailout for banks"
            </p>
         </div>

         <div className="flex flex-col items-center space-y-6 mt-16">
             <div className="flex justify-center space-x-3">
                <div className="w-1.5 h-1.5 bg-[#0062ff] rounded-full animate-bounce shadow-[0_0_8px_#0062ff]" style={{ animationDelay: '0s' }}></div>
                <div className="w-1.5 h-1.5 bg-[#0062ff] rounded-full animate-bounce shadow-[0_0_8px_#0062ff]" style={{ animationDelay: '0.15s' }}></div>
                <div className="w-1.5 h-1.5 bg-[#0062ff] rounded-full animate-bounce shadow-[0_0_8px_#0062ff]" style={{ animationDelay: '0.3s' }}></div>
             </div>
             <div className="text-[9px] text-slate-300 uppercase tracking-[0.6em] font-black">
                Awaiting_Consensus
             </div>
         </div>
      </div>
    </div>
  );
};
