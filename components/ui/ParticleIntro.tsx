
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Ensure Three.js is available
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
  const speedRef = useRef<number>(0.2); // Initial speed

  useEffect(() => {
    if (!containerRef.current) return;

    // Check if THREE is available
    if (typeof THREE === 'undefined') {
      console.error('Three.js is not loaded');
      return;
    }

    // Setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.001);

    // Calculate aspect ratio
    const aspect = window.innerWidth / window.innerHeight;
    const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 3000);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, 1);  // Look forward along Z axis
    

    const renderer = new THREE.WebGLRenderer({ 
      alpha: false,
      antialias: true,
      powerPreference: "high-performance"
    });
    // Set renderer size to match window
    const setRendererSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
    };
    setRendererSize();
    renderer.setClearColor(0x000000, 1);  // Black background
    
    // Ensure canvas is positioned correctly and visible
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
      backgroundColor: '#000000',
      objectFit: 'cover'  // Ensure canvas covers the container
    });
    
    containerRef.current.appendChild(canvas);
    
    

    // Stars - Create particles moving towards camera (along Z axis)
    const starGeo = new THREE.BufferGeometry();
    const starCount = 6000;
    const positions = new Float32Array(starCount * 3);

    // Initialize particles in front of camera (positive Z)
    // Create warp speed tunnel effect
    for(let i=0; i<starCount; i++) {
      positions[i*3] = (Math.random() - 0.5) * 2000;     // X - wider spread
      positions[i*3+1] = (Math.random() - 0.5) * 2000;   // Y - wider spread
      positions[i*3+2] = Math.random() * 2000;            // Z - distributed along tunnel
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // Create a circular sprite for stars - warp speed effect
    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,  // White stars
      size: 2,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,  // Enable size attenuation for depth effect
      blending: THREE.AdditiveBlending,  // Additive blending for glow effect
      depthWrite: false
    });

    const stars = new THREE.Points(starGeo, starMaterial);
    scene.add(stars);
    

    // Animation Loop
    let frameCount = 0;
    const animate = () => {
      frameCount++;
      
      // Warp speed logic
      const positions = starGeo.attributes.position.array as Float32Array;
      
      // Increase speed over time
      if (speedRef.current < 4) speedRef.current *= 1.01;

      for(let i=0; i<starCount; i++) {
        // Move stars towards camera (along Z axis, negative direction)
        positions[i*3 + 2] -= speedRef.current;
        
        // Reset if passed camera (z < 0)
        if (positions[i*3 + 2] < 0) {
           positions[i*3 + 2] = 2000;
           // Randomize X and Y when resetting for tunnel effect
           positions[i*3] = (Math.random() - 0.5) * 2000;
           positions[i*3 + 1] = (Math.random() - 0.5) * 2000;
        }
      }
      
      starGeo.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
      
      // Remove debug logs for production
      
      requestRef.current = requestAnimationFrame(animate);
    };

    // Start animation
    requestRef.current = requestAnimationFrame(animate);

    // Resize Handler - properly update camera and renderer
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      // Update camera aspect ratio
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      
      // Update renderer size
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      
      // Update canvas style to match
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      // Cleanup Three resources
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
            ${fadeOut ? 'opacity-0 blur-lg scale-110' : 'opacity-100 scale-100'}
        `}
        style={{ 
          backgroundColor: 'transparent', 
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          margin: 0,
          padding: 0
        }}
    >
      <div 
        ref={containerRef} 
        className="absolute inset-0" 
        style={{ 
          zIndex: 1, 
          pointerEvents: 'none',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          margin: 0,
          padding: 0
        }} 
      />
      
      {/* Content Container */}
      <div className="relative z-10 text-center max-w-4xl px-8 animate-in fade-in zoom-in duration-1000 delay-500 fill-mode-forwards flex flex-col items-center">
         
         {/* Decentralization Node Symbol */}
         <div className="mb-8 opacity-80">
            <div className="w-16 h-16 border border-white/10 rounded-full flex items-center justify-center relative">
                <div className="absolute inset-0 border-t-2 border-indigo-400 rounded-full animate-spin"></div>
                <div className="w-2 h-2 bg-white rounded-full shadow-[0_0_10px_white]"></div>
            </div>
         </div>

         {/* The Date */}
         <div className="font-mono text-indigo-300/80 text-xs md:text-sm mb-4 tracking-[0.2em] uppercase border-b border-white/10 pb-2">
            The Times 03/Jan/2009
         </div>
         
         {/* The Quote */}
         <h1 className="text-2xl md:text-5xl font-serif font-bold text-white tracking-tight mb-8 leading-tight drop-shadow-2xl opacity-95 italic">
            "Chancellor on brink of<br className="hidden md:block"/> second bailout for banks"
         </h1>

         {/* Status */}
         <div className="flex flex-col items-center space-y-3 mt-4">
             <div className="flex justify-center space-x-2">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
             </div>
             <div className="text-[10px] text-white/30 uppercase tracking-[0.3em] font-medium">
                Syncing Distributed Ledger
             </div>
         </div>
      </div>
    </div>
  );
};
