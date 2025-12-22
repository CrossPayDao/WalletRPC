
import React, { useState } from 'react';
import { RefreshCw, Copy, Plus, ExternalLink, Clock, Check, Zap } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { TiltCard } from '../../../components/ui/TiltCard';
import { CountUp } from '../../../components/ui/CountUp';
import { ChainConfig, TokenConfig, TransactionRecord } from '../types';
import { getExplorerLink } from '../utils';
import { useTranslation } from '../../../contexts/LanguageContext';
import { APP_VERSION } from '../../../config/app';

interface WalletDashboardProps {
  balance: string;
  activeChain: ChainConfig;
  chains: ChainConfig[];
  address: string;
  isLoading: boolean;
  onRefresh: () => void;
  onSend: () => void;
  activeAccountType: 'EOA' | 'SAFE';
  pendingTxCount: number;
  onViewQueue: () => void;
  onViewSettings: () => void;
  tokens: TokenConfig[];
  tokenBalances: Record<string, string>;
  onAddToken: () => void;
  onEditToken: (token: TokenConfig) => void;
  transactions: TransactionRecord[];
}

export const WalletDashboard: React.FC<WalletDashboardProps> = ({
  balance,
  activeChain,
  chains,
  address,
  isLoading,
  onRefresh,
  onSend,
  activeAccountType,
  pendingTxCount,
  onViewQueue,
  onViewSettings,
  tokens,
  tokenBalances,
  onAddToken,
  onEditToken,
  transactions
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const getNetworkBadge = (chainId: number) => {
    const chain = chains.find(c => c.id === chainId);
    if (!chain) return <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded uppercase font-bold">Unknown</span>;
    return (
      <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-black border ${chain.isTestnet ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-blue-50 text-[#0062ff] border-[#0062ff]/20'}`}>
        {chain.name}
      </span>
    );
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-10">
      
      {/* Minimalist Beta Indicator */}
      <div className="flex justify-center opacity-40 hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100/30 rounded-full border border-slate-200/30 animate-tech-in">
           <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
           <span className="text-[7px] font-black text-slate-400 uppercase tracking-[0.4em]">{t('wallet.beta')} {APP_VERSION}</span>
        </div>
      </div>

      {/* Main Asset Card */}
      <TiltCard className="w-full" intensity={3} glowColor="rgba(0, 98, 255, 0.05)">
        <div className="p-6 md:p-8 bg-white relative overflow-hidden group h-full flex flex-col justify-between border border-slate-200 shadow-xl rounded-2xl">
          
          {/* Decorative Grid Background */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(0,98,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(0,98,255,0.01)_1px,transparent_1px)] bg-[size:20px_20px]"></div>

          <div className="flex justify-between items-start mb-6 relative z-10">
            <div>
              <h3 className="text-[10px] font-black text-[#0062ff] uppercase tracking-[0.3em] mb-2">Total Net Worth</h3>
              <div className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter flex items-baseline flex-wrap italic">
                <CountUp 
                  value={balance} 
                  decimals={4} 
                  duration={1200} 
                  className="tabular-nums"
                />
                <span className="text-lg md:text-2xl font-bold text-slate-300 ml-2 not-italic">{activeChain.currencySymbol}</span>
              </div>
            </div>
            <div className="flex space-x-2">
              <button 
                onClick={onRefresh} 
                className="p-3 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-[#0062ff] rounded-xl transition-all border border-slate-200"
              >
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin text-[#0062ff]' : ''}`} />
              </button>
              <button 
                onClick={handleCopy} 
                className={`p-3 rounded-xl transition-all border border-slate-200 ${copied ? 'bg-blue-50 text-[#0062ff] border-[#0062ff]/30' : 'bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-[#0062ff]'}`}
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
          </div>
          
          <div className="mb-8 relative z-10">
            <div 
              className="inline-flex max-w-full items-center px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer transition-all hover:border-[#0062ff]/30" 
              onClick={handleCopy}
            >
              <div className={`w-2.5 h-2.5 rounded-full mr-3 flex-shrink-0 ${copied ? 'bg-[#0062ff]' : 'bg-slate-300'}`}></div>
              <span className={`text-xs font-mono font-medium truncate tracking-wide ${copied ? 'text-[#0062ff]' : 'text-slate-500'}`}>
                {address}
              </span>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
            <Button 
              onClick={onSend} 
              className="w-full h-12 text-sm font-black bg-[#0062ff] text-white shadow-[0_4px_15px_rgba(0,98,255,0.15)] hover:shadow-[0_4px_25px_rgba(0,98,255,0.25)]" 
              icon={<Zap className="w-4 h-4" />}
            >
              SEND
            </Button>
            {activeAccountType === 'SAFE' && activeChain.chainType !== 'TRON' && (
              <>
                <Button onClick={onViewQueue} variant="secondary" className="w-full h-12 font-black bg-slate-50 text-[#0062ff] border-[#0062ff]/10 hover:bg-blue-50">
                  QUEUE {pendingTxCount > 0 && <span className="ml-2 bg-[#0062ff] text-white px-1.5 rounded-sm text-[9px]">{pendingTxCount}</span>}
                </Button>
                <Button onClick={onViewSettings} variant="outline" className="w-full h-12 font-black border-slate-200 text-slate-500 hover:text-slate-900">
                  SAFE_MOD
                </Button>
              </>
            )}
          </div>
        </div>
      </TiltCard>
      
      {/* Assets Section */}
      <div>
        <div className="flex justify-between items-center mb-4 px-1">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Asset Inventory</h4>
          {activeChain.chainType !== 'TRON' && (
            <button 
              onClick={(e) => { e.stopPropagation(); onAddToken(); }} 
              className="text-[10px] font-black text-[#0062ff] flex items-center px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-blue-50 hover:border-[#0062ff]/30 transition-colors"
            >
              <Plus className="w-3 h-3 mr-1.5" /> IMPORT_TOKEN
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {tokens.map((t, idx) => (
            <div 
              key={t.address} 
              onClick={() => t.isCustom && onEditToken(t)}
              className="group flex justify-between items-center p-4 rounded-2xl bg-white border border-slate-200 hover:border-[#0062ff]/30 hover:shadow-lg transition-all cursor-pointer animate-tech-in shadow-sm"
              style={{ animationDelay: `${idx * 0.05}s` }}
            >
              <div className="flex items-center min-w-0">
                <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-sm font-black text-[#0062ff] mr-4 group-hover:scale-110 transition-transform">
                  {t.symbol[0]}
                </div>
                <div className="min-w-0">
                  <div className="font-black text-slate-900 text-base truncate group-hover:text-[#0062ff] transition-colors uppercase italic">{t.name}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t.symbol}</div>
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-3">
                <div className="font-mono font-bold text-lg text-slate-900 group-hover:text-[#0062ff] transition-colors">
                  <CountUp value={tokenBalances[t.symbol] || '0'} decimals={4} className="tabular-nums" />
                </div>
                {t.isCustom && <span className="inline-block px-2 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-400 mt-1 uppercase">Custom</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction Log */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Operational Logs</h3>
        </div>
        
        {transactions.length === 0 ? (
          <div className="p-10 text-center">
             <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
               <Clock className="w-6 h-6 text-slate-300" />
             </div>
             <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">No operations logged</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {transactions.map((tx, idx) => {
              const txChain = chains.find(c => c.id === tx.chainId) || activeChain;
              return (
                <div key={tx.id} className="flex justify-between items-center text-sm p-4 hover:bg-slate-50 transition-colors animate-tech-in" style={{ animationDelay: `${idx * 0.05}s` }}>
                  <div className="flex items-center space-x-4 overflow-hidden">
                    <div className={`w-2 h-2 rounded-full ring-4 ring-opacity-10 flex-shrink-0 ${
                      tx.status === 'confirmed' ? 'bg-[#0062ff] ring-[#0062ff]' : 
                      tx.status === 'failed' ? 'bg-red-500 ring-red-500' : 
                      'bg-amber-500 ring-amber-500 animate-pulse'
                    }`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-slate-900 text-sm truncate uppercase tracking-tight">{tx.summary}</span>
                        {getNetworkBadge(tx.chainId)}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center font-bold tracking-widest">
                        <span>{new Date(tx.timestamp).toLocaleTimeString()}</span>
                        <span className="mx-2 text-slate-200">|</span>
                        <span className={`uppercase ${
                          tx.status === 'confirmed' ? 'text-[#0062ff]' : 
                          tx.status === 'failed' ? 'text-red-500' : 'text-amber-500'
                        }`}>
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  {tx.hash && (
                    <a 
                      href={getExplorerLink(txChain, tx.hash)} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="p-3 text-slate-300 hover:text-[#0062ff] transition-all"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
