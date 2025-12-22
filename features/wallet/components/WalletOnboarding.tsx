
import React from 'react';
import { ShieldCheck, ArrowRight, Hexagon, Lock, Zap } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { useTranslation } from '../../../contexts/LanguageContext';
import { BrandLogo } from '../../../components/ui/BrandLogo';

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
      min-h-screen flex flex-col items-center justify-center p-6 bg-[#f8fafc] text-slate-900 relative overflow-hidden
      transition-all duration-1000 ease-in-out
      ${isExiting ? 'opacity-0 scale-105 filter blur-md bg-white' : 'opacity-100 scale-100'}
    `}>
      
      {/* Dynamic Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-40">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-[#0062ff]/10 rounded-full blur-[150px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-[#00d4ff]/10 rounded-full blur-[150px]"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
      </div>

      <div className="max-w-md w-full relative z-10 animate-tech-in">
        
        {/* Header Section */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#0062ff] to-[#00d4ff] rounded-2xl mb-6 shadow-[0_10px_30px_rgba(0,98,255,0.15)] relative">
            <BrandLogo size={40} color="white" />
            {/* BETA 标识移动到右下角 */}
            <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 bg-white text-slate-900 text-[7px] font-black rounded border border-slate-100 shadow-sm uppercase tracking-tighter">
              {t('wallet.beta')}
            </div>
          </div>
          <h1 className="text-4xl font-black tracking-tighter mb-2 text-slate-900 uppercase italic flex items-center justify-center gap-2">
            WALLET <span className="text-[#0062ff]">RPC</span>
          </h1>
          <p className="text-slate-500 font-medium text-lg tracking-tight">{t('wallet.intro')}</p>
        </div>
        
        {/* Login Container */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-[#0062ff] to-[#00d4ff] rounded-3xl opacity-10 blur group-hover:opacity-20 transition-opacity"></div>
          
          <div className="relative bg-white border border-slate-200 rounded-3xl p-8 shadow-2xl">
             <div className="flex items-center justify-between mb-6">
               <div className="flex items-center space-x-2">
                 <Lock className="w-4 h-4 text-[#0062ff]" />
                 <span className="text-xs font-bold text-[#0062ff] uppercase tracking-[0.2em]">{t('wallet.connect_title')}</span>
               </div>
               <Zap className="w-4 h-4 text-[#0062ff] animate-pulse" />
             </div>

             <div className="space-y-6">
               <div>
                 <textarea
                   className="w-full p-4 bg-slate-50 border border-slate-200 focus:border-[#0062ff]/50 rounded-xl font-mono text-base text-slate-900 placeholder:text-slate-400 focus:ring-0 outline-none transition-all resize-none shadow-inner"
                   placeholder="Private Key / Mnemonic"
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
                  className="w-full py-4 text-lg font-black bg-[#0062ff] hover:bg-[#0052d9] text-white rounded-xl transition-all shadow-[0_4px_20px_rgba(0,98,255,0.2)]" 
                  disabled={!input || isExiting}
                  isLoading={isExiting}
                  icon={!isExiting ? <ArrowRight className="w-5 h-5" /> : undefined}
               >
                 {isExiting ? 'SECURE_BOOT' : 'BOOT_WALLET'}
               </Button>
             </div>

             {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start animate-shake">
                <Hexagon className="w-5 h-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
             )}
          </div>
        </div>

        {/* Security Footnote */}
        <div className="mt-10 text-center space-y-4">
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed italic opacity-40 px-6">
             {t('wallet.disclaimer')}
          </p>
          <div className="flex items-center justify-center space-x-6 text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
             <span className="flex items-center"><ShieldCheck className="w-3 h-3 mr-1 text-[#0062ff]" /> AES-256</span>
             <span className="flex items-center"><Zap className="w-3 h-3 mr-1 text-[#0062ff]" /> LOW_LATENCY</span>
             <span className="flex items-center"><BrandLogo size={12} className="mr-1 text-[#0062ff]" /> LOCAL_ONLY</span>
          </div>
        </div>
      </div>
    </div>
  );
};
