
import React from 'react';
import { Check, Loader2, Clock, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

export type TransferStatus = 'idle' | 'sending' | 'success' | 'timeout' | 'error';

interface TransferStateViewProps {
  status: TransferStatus;
  txHash?: string;
  error?: string;
  onClose: () => void;
  explorerUrl?: string;
}

export const TransferStateView: React.FC<TransferStateViewProps> = ({
  status,
  txHash,
  error,
  onClose,
  explorerUrl
}) => {
  if (status === 'idle') return null;

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[420px] w-full text-center p-8 bg-white/80 backdrop-blur-2xl rounded-[2rem] border border-white/40 animate-tech-in shadow-[0_20px_50px_rgba(0,0,0,0.05)] overflow-hidden">
      
      {/* Dynamic Background Ornament */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
         <div className="absolute top-[-10%] right-[-10%] w-32 h-32 bg-[#0062ff]/5 rounded-full blur-3xl"></div>
         <div className="absolute bottom-[-10%] left-[-10%] w-32 h-32 bg-[#00d4ff]/5 rounded-full blur-3xl"></div>
      </div>

      {/* SENDING STATE */}
      {status === 'sending' && (
        <div className="space-y-10 relative z-10">
          <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
            {/* Subtle Breathing Rings */}
            <div className="absolute inset-0 border border-[#0062ff]/20 rounded-full animate-[pulse_3s_ease-in-out_infinite]"></div>
            <div className="absolute inset-4 border border-[#0062ff]/10 rounded-full animate-[pulse_3s_ease-in-out_infinite_0.5s]"></div>
            <div className="absolute inset-8 border border-[#0062ff]/5 rounded-full animate-[pulse_3s_ease-in-out_infinite_1s]"></div>
            
            {/* Center Loader */}
            <div className="relative w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-[0_8px_25px_rgba(0,98,255,0.08)] border border-slate-50">
               <svg className="w-10 h-10 text-[#0062ff] animate-spin" viewBox="0 0 24 24" fill="none">
                 <circle className="opacity-10" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                 <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
               </svg>
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="text-2xl font-black text-slate-800 uppercase italic tracking-tight">Broadcasting...</h3>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.25em] max-w-[200px] mx-auto leading-relaxed opacity-60">
              Synchronizing payload with global rpc nodes
            </p>
          </div>
        </div>
      )}

      {/* SUCCESS STATE */}
      {status === 'success' && (
        <div className="space-y-10 relative z-10">
          <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 bg-[#0062ff]/5 rounded-full scale-110"></div>
            <div className="relative w-20 h-20 bg-white rounded-full flex items-center justify-center border border-[#0062ff] shadow-[0_15px_40px_rgba(0,98,255,0.15)]">
              <Check className="w-10 h-10 text-[#0062ff] animate-in zoom-in duration-500" strokeWidth={3} />
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Transmission Confirmed</h3>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">Validated on distributed ledger</p>
          </div>
          <div className="pt-4 w-full max-w-[240px] mx-auto space-y-4">
             <Button onClick={onClose} className="w-full py-4 text-white shadow-[0_10px_25px_rgba(0,98,255,0.2)]">
               RETURN_TO_BASE
             </Button>
             {txHash && explorerUrl && (
               <a href={explorerUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center text-[10px] text-[#0062ff] hover:text-slate-900 font-black uppercase tracking-[0.3em] transition-colors">
                 INSPECT_TX <ExternalLink className="w-3 h-3 ml-2" />
               </a>
             )}
          </div>
        </div>
      )}

      {/* TIMEOUT STATE */}
      {status === 'timeout' && (
        <div className="space-y-8 relative z-10">
          <div className="relative w-32 h-32 mx-auto">
            <div className="absolute inset-0 bg-amber-50/50 rounded-full"></div>
            <div className="relative w-full h-full bg-white rounded-full flex items-center justify-center border border-amber-200 shadow-xl z-10">
              <Clock className="w-10 h-10 text-amber-500" />
              <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-2 border border-slate-100 shadow-md">
                 <Loader2 className="w-5 h-5 text-[#0062ff] animate-spin" />
              </div>
            </div>
          </div>
          <div className="space-y-2 px-4">
            <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Pending Validation</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
              Broadcast successful. Node is verifying block inclusion. Process is now asynchronous.
            </p>
          </div>
          <div className="pt-4 w-full max-w-[220px] mx-auto space-y-3">
             <Button onClick={onClose} variant="secondary" className="w-full py-3 bg-slate-50/50">
               BACKGROUND_RUN
             </Button>
             {txHash && explorerUrl && (
               <a href={explorerUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center text-[9px] text-slate-300 hover:text-[#0062ff] font-bold uppercase tracking-[0.2em] transition-colors">
                 VIEW_EXPLORER <ExternalLink className="w-3 h-3 ml-2" />
               </a>
             )}
          </div>
        </div>
      )}

      {/* ERROR STATE */}
      {status === 'error' && (
        <div className="space-y-8 relative z-10">
           <div className="w-24 h-24 bg-red-50/50 rounded-full flex items-center justify-center mx-auto border border-red-100 shadow-inner">
             <AlertTriangle className="w-10 h-10 text-red-500" />
           </div>
           <div>
             <h3 className="text-xl font-black text-red-500 uppercase tracking-widest italic mb-3">Protocol_Fault</h3>
             <div className="text-[10px] text-slate-400 font-mono bg-slate-50/80 p-5 rounded-2xl border border-slate-100 max-w-xs mx-auto break-words leading-relaxed shadow-sm">
                {error || "Unknown Failure Code"}
             </div>
           </div>
           <Button onClick={onClose} variant="outline" className="min-w-[140px] py-3 border-slate-200">
              REBOOT_FORM
           </Button>
        </div>
      )}
    </div>
  );
};
