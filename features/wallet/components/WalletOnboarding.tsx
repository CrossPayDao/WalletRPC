
import React from 'react';
import { ShieldCheck, ArrowRight, Hexagon, Lock, Zap } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { useTranslation } from '../../../contexts/LanguageContext';

interface WalletOnboardingProps {
  input: string;
  setInput: (v: string) => void;
  onImport: () => void;
  error: string | null;
  isExiting?: boolean;
}

export const WalletOnboarding: React.FC<WalletOnboardingProps> = ({ input, setInput, onImport, error, isExiting = false }) => {
  const { t } = useTranslation();
  
  return (
    <div className={`
      min-h-screen flex flex-col items-center justify-center p-6 bg-[#020617] text-white relative overflow-hidden
      transition-all duration-1000 ease-in-out
      ${isExiting ? 'opacity-0 scale-105 filter blur-sm bg-black' : 'opacity-100 scale-100'}
    `}>
      
      {/* --- Desktop Only: Dynamic Background --- */}
      <div className="hidden md:block absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px] animate-float"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] animate-float" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="max-w-md w-full relative z-10 animate-tech-in">
        
        {/* Header Section */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl mb-6 md:shadow-2xl md:shadow-indigo-900/50 md:transform md:rotate-45 md:border md:border-white/10 transition-transform">
            {/* Mobile: No rotation, high contrast icon. Desktop: Rotated */}
            <ShieldCheck className="w-10 h-10 text-white md:transform md:-rotate-45" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2 text-white">{t('wallet.title')}</h1>
          <p className="text-slate-400 font-medium text-lg">{t('wallet.intro')}</p>
        </div>
        
        {/* Login Container */}
        {/* Mobile: High Contrast Border Wrapper, No Blur. Desktop: Blur, Glassmorphism */}
        <div className="relative group">
          {/* Mobile High-Contrast Border */}
          <div className="md:hidden absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-pink-500 rounded-3xl opacity-100"></div>
          
          <div className="relative bg-[#0b1121] md:bg-slate-900/60 md:backdrop-blur-xl border border-slate-800 md:border-white/10 rounded-3xl p-8 shadow-2xl">
             <div className="flex items-center justify-between mb-6">
               <div className="flex items-center space-x-2">
                 <Lock className="w-4 h-4 text-indigo-400" />
                 <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest">{t('wallet.connect_title')}</span>
               </div>
               <div className="md:hidden">
                 <Zap className="w-4 h-4 text-yellow-400" />
               </div>
             </div>

             <div className="space-y-6">
               <div>
                 <textarea
                   className="w-full p-4 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl font-mono text-base text-white placeholder:text-slate-600 focus:ring-0 outline-none transition-colors resize-none shadow-inner"
                   placeholder="Mnemonic Phrase or Private Key"
                   rows={3}
                   value={input}
                   onChange={(e) => setInput(e.target.value)}
                   autoFocus
                   spellCheck={false}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter' && !e.shiftKey) {
                       e.preventDefault();
                       if (input) onImport();
                     }
                   }}
                 />
               </div>
               
               <Button 
                  onClick={onImport} 
                  className="w-full py-4 text-lg font-bold bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-lg md:shadow-indigo-900/40 rounded-xl transition-all border-t border-white/10" 
                  disabled={!input || isExiting}
                  isLoading={isExiting}
                  icon={!isExiting ? <ArrowRight className="w-5 h-5" /> : undefined}
               >
                 {isExiting ? 'Unlocking...' : 'Unlock Vault'}
               </Button>
             </div>

             {error && (
              <div className="mt-6 p-4 bg-red-950/50 border border-red-500/30 rounded-xl flex items-start animate-shake">
                <Hexagon className="w-5 h-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-200 font-medium">{error}</p>
              </div>
             )}
          </div>
        </div>

        {/* Security Footnote */}
        <div className="mt-8 text-center space-y-4">
          <div className="flex flex-col md:flex-row items-center justify-center gap-3 text-xs text-slate-500">
             <div className="flex items-center px-3 py-1 bg-slate-900/80 rounded-full border border-slate-800">
                <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                <span>Client-Side Encryption</span>
             </div>
             <div className="flex items-center px-3 py-1 bg-slate-900/80 rounded-full border border-slate-800">
                <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                <span>Zero Telemetry</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
