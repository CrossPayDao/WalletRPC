
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
    if (!chain) return null;
    return (
      <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-black border ${chain.isTestnet ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-blue-50 text-[#0062ff] border-[#0062ff]/20'}`}>
        {chain.name}
      </span>
    );
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-10">
      
      <div className="flex justify-center opacity-40 hover:opacity-100 transition-opacity mt-4">
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100/30 rounded-full border border-slate-200/30">
           <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
           <span className="text-[7px] font-black text-slate-400 uppercase tracking-[0.4em]">{t('wallet.beta')} {APP_VERSION}</span>
        </div>
      </div>

      <TiltCard className="w-full">
        <div className="p-6 md:p-8 relative overflow-hidden flex flex-col gap-y-6 min-h-[240px]">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(0,98,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(0,98,255,0.01)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none opacity-50"></div>

          <div className="flex justify-between items-start relative z-10">
            <div>
              <h3 className="text-[10px] font-black text-[#0062ff] uppercase tracking-[0.3em] mb-1.5">{t('wallet.total_net_worth')}</h3>
              <div className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter flex items-baseline flex-wrap italic">
                <CountUp value={balance} decimals={4} className="tabular-nums" />
                <span className="text-lg md:text-2xl font-bold text-slate-300 ml-2 not-italic">{activeChain.currencySymbol}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={onRefresh} className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-xl transition-all border border-slate-100">
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin text-[#0062ff]' : ''}`} />
              </button>
            </div>
          </div>
          
          <div className="relative z-10">
            <div className="inline-flex max-w-full items-center px-4 py-2.5 bg-slate-50/50 border border-slate-100 rounded-xl cursor-pointer hover:border-[#0062ff]/20 transition-all" onClick={handleCopy}>
              <div className={`w-2 h-2 rounded-full mr-3 ${copied ? 'bg-[#0062ff]' : 'bg-slate-300'}`}></div>
              <span className={`text-xs font-mono font-medium truncate tracking-wide ${copied ? 'text-[#0062ff]' : 'text-slate-500'}`}>{address}</span>
              <Copy className={`w-3.5 h-3.5 ml-3 ${copied ? 'text-[#0062ff]' : 'text-slate-300'}`} />
            </div>
          </div>
          
          <div className="relative z-10 mt-auto">
            <div className={`grid gap-4 ${activeAccountType === 'SAFE' ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-1 max-w-[200px]'}`}>
              <Button onClick={onSend} className="w-full h-12 text-sm font-black bg-[#0062ff] text-white shadow-lg" icon={<Zap className="w-4 h-4" />}>
                {t('tx.send_btn')}
              </Button>
              {activeAccountType === 'SAFE' && activeChain.chainType !== 'TRON' && (
                <>
                  <Button onClick={onViewQueue} variant="secondary" className="w-full h-12 font-black">
                    {t('safe.queue_title').toUpperCase()} {pendingTxCount > 0 && <span className="ml-2 bg-[#0062ff] text-white px-1.5 rounded-sm text-[9px]">{pendingTxCount}</span>}
                  </Button>
                  <Button onClick={onViewSettings} variant="outline" className="w-full h-12 font-black uppercase">{t('safe.mod_btn')}</Button>
                </>
              )}
            </div>
          </div>
        </div>
      </TiltCard>
      
      <div>
        <div className="flex justify-between items-center mb-4 px-1">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">{t('wallet.asset_inventory')}</h4>
          {activeChain.chainType !== 'TRON' && (
            <button onClick={(e) => { e.stopPropagation(); onAddToken(); }} className="text-[10px] font-black text-[#0062ff] flex items-center px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-blue-50 transition-colors uppercase tracking-tight">
              <Plus className="w-3 h-3 mr-1.5" /> {t('wallet.import_token_btn')}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {tokens.map((t_item, idx) => (
            <div key={t_item.address} onClick={() => t_item.isCustom && onEditToken(t_item)} className="group flex justify-between items-center p-4 rounded-2xl bg-white border border-slate-200 hover:border-[#0062ff]/30 hover:shadow-lg transition-all cursor-pointer shadow-sm">
              <div className="flex items-center min-w-0">
                <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-sm font-black text-[#0062ff] mr-4 group-hover:scale-105 transition-transform">{t_item.symbol[0]}</div>
                <div className="min-w-0">
                  <div className="font-black text-slate-900 text-base truncate uppercase italic">{t_item.name}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t_item.symbol}</div>
                </div>
              </div>
              <div className="text-right ml-3">
                <div className="font-mono font-bold text-lg text-slate-900 group-hover:text-[#0062ff] transition-colors">
                  <CountUp value={tokenBalances[t_item.symbol] || '0'} decimals={4} className="tabular-nums" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">{t('wallet.operational_logs')}</h3>
        </div>
        {transactions.length === 0 ? (
          <div className="p-10 text-center">
             <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-slate-100"><Clock className="w-5 h-5 text-slate-300" /></div>
             <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{t('wallet.no_logs')}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
            {transactions.map((tx) => (
                <div key={tx.id} className="flex justify-between items-center text-sm p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center space-x-4">
                    <div className={`w-1.5 h-1.5 rounded-full ${tx.status === 'confirmed' ? 'bg-[#0062ff]' : tx.status === 'failed' ? 'bg-red-500' : 'bg-amber-500 animate-pulse'}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm truncate uppercase tracking-tight">{tx.summary}</span>
                        {getNetworkBadge(tx.chainId)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">{tx.status} • {new Date(tx.timestamp).toLocaleTimeString()}</div>
                    </div>
                  </div>
                  {tx.hash && (
                    <a href={getExplorerLink(activeChain, tx.hash)} target="_blank" rel="noreferrer" className="p-2 text-slate-300 hover:text-[#0062ff]"><ExternalLink className="w-4 h-4" /></a>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
};
