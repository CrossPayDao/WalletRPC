
import React, { useState, useEffect, useMemo } from 'react';
import { Settings, ArrowLeft, Zap, Coins, AlertTriangle, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { ChainConfig, TokenConfig, TransactionRecord } from '../types';
import { ProcessResult } from '../hooks/useTransactionManager';
import { TransferStateView, TransferStatus } from './TransferStateView';
import { getExplorerLink } from '../utils';
import { ethers } from 'ethers';
import { useTranslation } from '../../../contexts/LanguageContext';
import { TronService } from '../../../services/tronService';

export interface SendFormData {
  recipient: string;
  amount: string;
  asset: string;
  customData: string;
  gasPrice: string;
  gasLimit: string;
  nonce?: number;
  bypassBalanceCheck?: boolean;
}

interface SendFormProps {
  activeChain: ChainConfig;
  tokens: TokenConfig[];
  balances: Record<string, string>;
  activeAccountType: 'EOA' | 'SAFE';
  recommendedNonce: number;
  onSend: (data: SendFormData) => Promise<ProcessResult>;
  onBack: () => void;
  onRefresh?: () => void;
  isLoading?: boolean;
  transactions: TransactionRecord[];
}

export const SendForm: React.FC<SendFormProps> = ({
  activeChain,
  tokens,
  balances,
  activeAccountType,
  recommendedNonce,
  onSend,
  onBack,
  onRefresh,
  isLoading,
  transactions
}) => {
  const { t } = useTranslation();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedAsset, setSelectedAsset] = useState('NATIVE');
  const [customData, setCustomData] = useState('0x');
  const [gasPrice, setGasPrice] = useState('');
  const [gasLimit, setGasLimit] = useState('');
  const [customNonce, setCustomNonce] = useState<string>('');
  const [isAdvancedSend, setIsAdvancedSend] = useState(false);
  const [hasAcknowledgedBalance, setHasAcknowledgedBalance] = useState(false);
  
  const [transferStatus, setTransferStatus] = useState<TransferStatus>('idle');
  const [txHash, setTxHash] = useState<string | undefined>();
  const [errorMsg, setErrorMsg] = useState<string | undefined>();

  const currentBalance = useMemo(() => {
    return balances[selectedAsset] || '0';
  }, [balances, selectedAsset]);

  const isInsufficient = useMemo(() => {
    const numAmount = parseFloat(amount || '0');
    const numBalance = parseFloat(currentBalance);
    return numAmount > numBalance;
  }, [amount, currentBalance]);

  const recipientError = useMemo(() => {
    const addr = recipient.trim();
    if (!addr) return null;

    if (activeChain.chainType === 'TRON') {
      if (!addr.startsWith('T')) return t('tx.error_tron_prefix');
      if (addr.length !== 34) return t('tx.error_tron_length');
      if (!TronService.isValidBase58Address(addr)) return t('tx.error_invalid_format');
    } else {
      if (!addr.startsWith('0x')) return t('tx.error_evm_prefix');
      if (addr.length !== 42) return t('tx.error_evm_length');
      if (!ethers.isAddress(addr)) return t('tx.error_invalid_format');
    }
    return null;
  }, [recipient, activeChain.chainType, t]);

  useEffect(() => {
    if (onRefresh) onRefresh();
  }, []);

  useEffect(() => {
    if (!isInsufficient) setHasAcknowledgedBalance(false);
  }, [isInsufficient]);

  useEffect(() => {
    if (transferStatus === 'timeout' && txHash) {
        const tx = transactions.find(tx_item => tx_item.hash === txHash);
        if (tx && tx.status === 'confirmed') setTransferStatus('success');
    }
  }, [transactions, txHash, transferStatus]);

  const handleSend = async () => {
    if (recipientError || !recipient.trim()) return;
    if (isInsufficient && !hasAcknowledgedBalance) {
      setHasAcknowledgedBalance(true);
      return;
    }

    setTransferStatus('sending');
    setTxHash(undefined);
    setErrorMsg(undefined);

    const result = await onSend({
      recipient,
      amount,
      asset: selectedAsset,
      customData,
      gasPrice,
      gasLimit,
      nonce: customNonce ? parseInt(customNonce) : undefined,
      bypassBalanceCheck: hasAcknowledgedBalance
    });

    if (result.success) {
      setTransferStatus(result.isTimeout ? 'timeout' : 'success');
      setTxHash(result.hash);
    } else {
      setTransferStatus('error');
      setErrorMsg(result.error);
    }
  };
  
  if (transferStatus !== 'idle') {
    return (
        <div className="max-w-md mx-auto animate-tech-in bg-white/80 backdrop-blur-2xl rounded-[2rem] shadow-lg border border-white/40 min-h-[420px] flex items-center justify-center overflow-hidden">
            <TransferStateView 
                status={transferStatus}
                txHash={txHash}
                error={errorMsg}
                onClose={() => {
                   if (transferStatus === 'success' || transferStatus === 'timeout') {
                      onBack();
                   } else {
                      setTransferStatus('idle');
                   }
                }}
                explorerUrl={txHash ? getExplorerLink(activeChain, txHash) : undefined}
            />
        </div>
    );
  }

  return (
    <div className="max-w-md mx-auto animate-tech-in">
      <div className="flex items-center mb-6">
         <button onClick={onBack} className="p-2 -ml-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors mr-2">
            <ArrowLeft className="w-5 h-5" />
         </button>
         <h2 className="font-bold text-xl text-slate-900">{t('tx.send')}</h2>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-lg space-y-6 relative">
        <div className="absolute top-0 left-6 right-6 h-0.5 bg-gradient-to-r from-[#0062ff] to-[#00d4ff] opacity-20"></div>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-end mb-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('settings.currency')}</label>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase">
                  Available: <span className="text-[#0062ff]">{parseFloat(currentBalance).toFixed(4)}</span>
                </span>
                <button 
                  onClick={() => onRefresh && onRefresh()} 
                  className={`p-1 rounded-md hover:bg-slate-100 transition-all ${isLoading ? 'text-[#0062ff]' : 'text-slate-300'}`}
                  disabled={isLoading}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            <div className="relative">
              <select 
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-[#0062ff]/40 transition-all appearance-none font-bold text-slate-700"
                value={selectedAsset} 
                onChange={e => setSelectedAsset(e.target.value)}
              >
                <option value="NATIVE">{activeChain.currencySymbol} (Native)</option>
                {tokens.map(t_opt => <option key={t_opt.symbol} value={t_opt.symbol}>{t_opt.symbol} - {t_opt.name}</option>)}
              </select>
              <div className="absolute left-3 top-3.5 text-slate-400 pointer-events-none">
                 <Coins className="w-5 h-5" />
              </div>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('tx.recipient')}</label>
              {recipientError && <span className="text-[10px] font-black text-red-500 uppercase italic animate-pulse tracking-tighter">{recipientError}</span>}
            </div>
            <div className="relative">
              <input 
                className={`w-full px-4 py-3 border rounded-xl bg-slate-50 focus:bg-white focus:ring-2 transition-all font-mono text-sm shadow-inner outline-none ${recipientError ? 'border-red-300 ring-red-100 animate-shake' : 'border-slate-200 focus:ring-blue-100 focus:border-[#0062ff]/40'}`} 
                placeholder={activeChain.chainType === 'TRON' ? "T..." : "0x..."} 
                value={recipient} 
                onChange={e => setRecipient(e.target.value)} 
              />
              {recipientError && <div className="absolute right-3 top-3"><AlertCircle className="w-5 h-5 text-red-400" /></div>}
            </div>
          </div>
          
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5 tracking-wider">{t('tx.amount')}</label>
            <div className="relative">
              <input 
                className={`w-full pl-4 pr-16 py-3 border rounded-xl transition-all font-mono text-lg font-bold shadow-inner ${isInsufficient ? 'bg-amber-50 border-amber-200 text-amber-700 focus:ring-amber-100' : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-blue-100 focus:border-[#0062ff]/40'}`}
                placeholder="0.0" 
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
              />
              <div className="absolute right-4 top-3.5">
                <button 
                  onClick={() => setAmount(currentBalance)}
                  className="text-[10px] font-black text-[#0062ff] hover:text-[#0052d9] bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors uppercase tracking-widest border border-blue-100"
                >
                  {t('common.max')}
                </button>
              </div>
            </div>
          </div>

          {isInsufficient && (
            <div className={`p-4 rounded-xl border flex items-start gap-3 animate-tech-in ${hasAcknowledgedBalance ? 'bg-amber-100 border-amber-300 shadow-sm' : 'bg-amber-50 border-amber-200'}`}>
              <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${hasAcknowledgedBalance ? 'text-amber-700' : 'text-amber-500'}`} />
              <div className="space-y-1">
                <p className="text-xs font-black uppercase text-amber-800 tracking-tight">{t('tx.warning_liquidity')}</p>
                <p className="text-[10px] text-amber-700 font-medium leading-relaxed italic">
                  {t('tx.warning_desc')}
                </p>
              </div>
            </div>
          )}

          <div className="pt-4 flex flex-col gap-3">
            <Button 
              onClick={handleSend} 
              variant={hasAcknowledgedBalance ? 'danger' : (isInsufficient ? 'outline' : 'primary')}
              className={`w-full py-4 text-sm font-black transition-all ${(isInsufficient && !hasAcknowledgedBalance) ? 'border-amber-300 text-amber-600' : ''}`} 
              disabled={!!recipientError || !recipient.trim()}
              icon={isInsufficient ? <AlertTriangle className="w-4 h-4" /> : (activeAccountType === 'SAFE' ? undefined : <Zap className="w-4 h-4" />)}
            >
              {isInsufficient 
                ? (hasAcknowledgedBalance ? t('tx.proceed_anyway') : t('tx.insufficient')) 
                : (activeAccountType === 'SAFE' && activeChain.chainType !== 'TRON' ? t('tx.propose_tx') : t('tx.broadcast'))
              }
            </Button>
            
            {hasAcknowledgedBalance && (
              <button onClick={() => setHasAcknowledgedBalance(false)} className="text-[10px] text-slate-400 font-bold uppercase tracking-widest hover:text-slate-600 transition-colors">
                {t('common.cancel')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
