
import React from 'react';
import { ShieldCheck, ArrowRight, Hexagon, Lock, Zap, Globe } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { useTranslation, Language } from '../../../contexts/LanguageContext';
import { BrandLogo } from '../../../components/ui/BrandLogo';

/**
 * 【UI 逻辑：无缝语言切换】
 * 目的：允许用户在入驻页面直接手动切换语言，而无需进入深层设置。
 * 解决了什么：新用户如果看不懂默认语言，直接在首页就能调整。
 */
export const WalletOnboarding: React.FC<any> = ({ input, setInput, onImport, error, isExiting = false }) => {
  const { t, language, setLanguage } = useTranslation();
  
  return (
    <div className={`
      min-h-screen flex flex-col items-center justify-center p-6 bg-[#f8fafc] text-slate-900 relative overflow-hidden
      transition-all duration-1000 ease-in-out
      ${isExiting ? 'opacity-0 scale-105 filter blur-md bg-white' : 'opacity-100 scale-100'}
    `}>
      
      {/* 语言切换悬浮按钮 */}
      <div className="absolute top-8 right-8 z-50 flex items-center bg-white border border-slate-200 rounded-full p-1 shadow-sm">
         <button 
           onClick={() => setLanguage('en')}
           className={`px-3 py-1 text-[10px] font-black rounded-full transition-all ${language === 'en' ? 'bg-[#0062ff] text-white' : 'text-slate-400'}`}
         >
           EN
         </button>
         <button 
           onClick={() => setLanguage('zh-SG')}
           className={`px-3 py-1 text-[10px] font-black rounded-full transition-all ${language === 'zh-SG' ? 'bg-red-500 text-white' : 'text-slate-400'}`}
         >
           中文
         </button>
      </div>

      <div className="max-w-md w-full relative z-10 animate-tech-in">
        
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#0062ff] to-[#00d4ff] rounded-2xl mb-6 shadow-xl relative">
            <BrandLogo size={40} color="white" />
            <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 bg-white text-slate-900 text-[7px] font-black rounded border border-slate-100 shadow-sm uppercase">
              {t('wallet.title')}
            </div>
          </div>
          <h1 className="text-4xl font-black tracking-tighter mb-2 text-slate-900 uppercase italic">
            WALLET <span className="text-[#0062ff]">RPC</span>
          </h1>
          <p className="text-slate-500 font-medium text-lg tracking-tight">{t('wallet.intro')}</p>
        </div>
        
        <div className="relative group">
          <div className="relative bg-white border border-slate-200 rounded-3xl p-8 shadow-2xl">
             <div className="flex items-center justify-between mb-6">
               <div className="flex items-center space-x-2">
                 <Lock className="w-4 h-4 text-[#0062ff]" />
                 <span className="text-xs font-bold text-[#0062ff] uppercase tracking-widest">{t('wallet.connect_title')}</span>
               </div>
               <Zap className="w-4 h-4 text-[#0062ff] animate-pulse" />
             </div>

             <div className="space-y-6">
               <textarea
                 className="w-full p-4 bg-slate-50 border border-slate-200 focus:border-[#0062ff]/50 rounded-xl font-mono text-base text-slate-900 outline-none transition-all resize-none shadow-inner"
                 placeholder="Private Key / Mnemonic"
                 rows={3}
                 value={input}
                 onChange={(e) => setInput(e.target.value)}
                 autoFocus
               />
               <Button 
                  onClick={onImport} 
                  className="w-full py-4 text-lg font-black bg-[#0062ff] hover:bg-[#0052d9] text-white rounded-xl shadow-lg" 
                  disabled={!input || isExiting}
                  isLoading={isExiting}
                  icon={!isExiting ? <ArrowRight className="w-5 h-5" /> : undefined}
               >
                 {isExiting ? t('common.booting') : t('common.confirm')}
               </Button>
             </div>

             {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start animate-shake">
                <Hexagon className="w-5 h-5 text-red-500 mr-3 mt-0.5" />
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
             )}
          </div>
        </div>

        <div className="mt-10 text-center space-y-4">
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed italic opacity-40 px-6">
             {t('wallet.disclaimer')}
          </p>
          <div className="flex items-center justify-center space-x-6 text-[10px] text-slate-400 font-bold uppercase">
             <span className="flex items-center"><ShieldCheck className="w-3 h-3 mr-1 text-[#0062ff]" /> AES-256</span>
             <span className="flex items-center text-red-400"><Globe className="w-3 h-3 mr-1" /> SG_SERVER</span>
          </div>
        </div>
      </div>
    </div>
  );
};
