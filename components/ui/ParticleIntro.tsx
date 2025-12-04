
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface ParticleIntroProps {
  onComplete?: () => void;
  fadeOut?: boolean;
}

export const ParticleIntro: React.FC<ParticleIntroProps> = ({ onComplete, fadeOut = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // --- Setup Scene ---
    const width = window.innerWidth;
    const height = window.innerHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.002); // Fog to hide stars spawn/despawn

    const camera = new THREE.PerspectiveCamera(60, width / height, 1, 1000);
    camera.position.z = 1;
    camera.rotation.x = 0; // Look straight ahead

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Append canvas
    const container = containerRef.current;
    container.appendChild(renderer.domElement);

    // --- Create Stars ---
    const starCount = 6000;
    const starGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    
    // Fill initial positions
    for(let i = 0; i < starCount; i++) {
        // x, y random spread
        positions[i * 3] = (Math.random() - 0.5) * 800;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 800;
        // z random spread from "far away" (-600) to "behind camera" (200)
        positions[i * 3 + 2] = (Math.random() - 0.5) * 800; 
    }

    const posAttribute = new THREE.BufferAttribute(positions, 3);
    posAttribute.setUsage(THREE.DynamicDrawUsage); // Hint for frequent updates
    starGeo.setAttribute('position', posAttribute);

    const starMaterial = new THREE.PointsMaterial({
      color: 0xeeeeee,
      size: 0.7,
      transparent: true,
      opacity: 0.8
    });

    const stars = new THREE.Points(starGeo, starMaterial);
    scene.add(stars);

    // --- Animation Loop ---
    let speed = 0.2; // Initial speed
    let acceleration = 0.05;

    const animate = () => {
      // Warp acceleration logic
      if (speed < 12) {
          speed += acceleration;
      }

      const positions = starGeo.attributes.position.array as Float32Array;
      
      for(let i = 0; i < starCount; i++) {
        // Move star towards camera (+Z)
        positions[i * 3 + 2] += speed;

        // Reset if it passes the camera or goes too far
        if (positions[i * 3 + 2] > 200) {
           positions[i * 3 + 2] = -600; // Reset to far distance
           // Re-randomize X/Y to prevent "tunnels"
           positions[i * 3] = (Math.random() - 0.5) * 800;
           positions[i * 3 + 1] = (Math.random() - 0.5) * 800;
        }
      }

      starGeo.attributes.position.needsUpdate = true;
      
      // Slight rotation for visual interest
      stars.rotation.z += 0.0005;

      renderer.render(scene, camera);
      requestRef.current = requestAnimationFrame(animate);
    };

    animate();

    // --- Resize Handler ---
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // --- Cleanup ---
    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      
      // Clean up Three.js resources
      if (container && renderer.domElement) {
         try {
           container.removeChild(renderer.domElement);
         } catch (e) {
           // Ignore if already removed
         }
      }
      
      starGeo.dispose();
      starMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      scene.clear();
    };
  }, []);

  return (
    <div 
        className={`
            fixed inset-0 bg-black z-50 flex items-center justify-center overflow-hidden
            animate-in fade-in duration-1000
            transition-all duration-1000 ease-in-out
            ${fadeOut ? 'opacity-0 blur-lg scale-110' : 'opacity-100 scale-100'}
        `}
    >
      <div ref={containerRef} className="absolute inset-0" />
      
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
