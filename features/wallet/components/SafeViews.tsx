
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Zap, Trash2, ArrowLeft, Users, Shield, Plus, Clock, AlertCircle, Loader2, CheckCircle2, ShieldOff, X, ChevronDown, Activity } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { SafeDetails } from '../types';
import { ethers } from 'ethers';
import { useTranslation } from '../../../contexts/LanguageContext';

type ProcessStep = 'idle' | 'queued' | 'building' | 'syncing' | 'verifying' | 'timeout' | 'success' | 'vanishing' | 'error';
type OpType = 'add' | 'remove';

interface OptimisticOp {
  address: string;
  type: OpType;
  step: ProcessStep;
  error?: string;
}

const VERIFY_TIMEOUT_MS = 180_000;

interface SafeSettingsProps {
  safeDetails: SafeDetails;
  walletAddress?: string;
  onRemoveOwner: (owner: string, threshold: number) => Promise<boolean>;
  onAddOwner: (owner: string, threshold: number) => Promise<boolean>;
  onChangeThreshold: (threshold: number) => Promise<boolean>;
  onRefreshSafeDetails?: (force?: boolean) => void | Promise<void>;
  onBack: () => void;
}

export const SafeSettings: React.FC<SafeSettingsProps> = ({
  safeDetails,
  walletAddress,
  onRemoveOwner,
  onAddOwner,
  onChangeThreshold,
  onRefreshSafeDetails,
  onBack
}) => {
  const { t } = useTranslation();
  const [newOwnerInput, setNewOwnerInput] = useState('');
  const [newThresholdSelect, setNewThresholdSelect] = useState(safeDetails.threshold);
  const [optimisticOps, setOptimisticOps] = useState<OptimisticOp[]>([]);
  const verifyTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const verifyRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshRef = useRef(onRefreshSafeDetails);
  const queuedRunnerRef = useRef(false);

  const isOwner = useMemo(() => {
    if (!walletAddress) return false;
    return safeDetails.owners.some(o => o.toLowerCase() === walletAddress.toLowerCase());
  }, [safeDetails.owners, walletAddress]);

  // 如果用户在上一笔操作中把自己移出了 owners，则后续 queued 操作不可能继续执行，必须显式失败（避免永远排队）。
  useEffect(() => {
    if (safeDetails.threshold !== 1) return;
    if (isOwner) return;
    setOptimisticOps((prev) => {
      let changed = false;
      const next = prev.map((op) => {
        if (op.step !== 'queued') return op;
        changed = true;
        return { ...op, step: 'error' as const, error: t('safe.op_access_denied') };
      });
      return changed ? next : prev;
    });
  }, [isOwner, safeDetails.threshold, t]);

  useEffect(() => {
    refreshRef.current = onRefreshSafeDetails;
  }, [onRefreshSafeDetails]);

  const hasInFlightOp = useMemo(() => {
    const inFlightSteps: ProcessStep[] = ['building', 'syncing', 'verifying', 'timeout'];
    return optimisticOps.some((op) => inFlightSteps.includes(op.step));
  }, [optimisticOps]);

  // 在 verifying/timeout（扫描/超时）阶段主动拉取 Safe 元数据，避免“没有任何请求但一直扫描”的假象
  useEffect(() => {
    const hasVerifying = optimisticOps.some((op) => op.step === 'verifying' || op.step === 'timeout');
    const refresh = refreshRef.current;

    if (!hasVerifying || !refresh) {
      if (verifyRefreshIntervalRef.current) {
        clearInterval(verifyRefreshIntervalRef.current);
        verifyRefreshIntervalRef.current = null;
      }
      return;
    }

    if (verifyRefreshIntervalRef.current) return;

    const tick = async (force: boolean) => {
      const fn = refreshRef.current;
      if (!fn) return;
      if (refreshInFlightRef.current) return;
      refreshInFlightRef.current = true;
      try {
        await fn(force);
      } finally {
        refreshInFlightRef.current = false;
      }
    };

    // 立即刷新一次，确保开始“扫描”后能看到真实链上变化
    void tick(true);
    verifyRefreshIntervalRef.current = setInterval(() => {
      void tick(false);
    }, 5000);

    return () => {
      if (verifyRefreshIntervalRef.current) {
        clearInterval(verifyRefreshIntervalRef.current);
        verifyRefreshIntervalRef.current = null;
      }
    };
  }, [optimisticOps]);

  // 对于阈值为 1 的“闪电执行”成员变更：将连续广播请求组织成队列，避免 Safe nonce 过期导致的扫描超时/失败。
  useEffect(() => {
    if (queuedRunnerRef.current) return;
    if (safeDetails.threshold !== 1) return;
    if (!isOwner) return;
    if (hasInFlightOp) return;
    const next = optimisticOps.find((op) => op.step === 'queued');
    if (!next) return;

    queuedRunnerRef.current = true;
    const target = next.address.toLowerCase();
    const type = next.type;

    const run = async () => {
      // 可能已经在链上完成了（或被其他操作完成），则直接清理。
      const ownersLower = safeDetails.owners.map((o) => o.toLowerCase());
      if (type === 'add' && ownersLower.includes(target)) {
        updateOpStatus(target, type, { step: 'vanishing' });
        await new Promise((r) => setTimeout(r, 500));
        setOptimisticOps((prev) => prev.filter((op) => !(op.type === type && op.address.toLowerCase() === target)));
        return;
      }
      if (type === 'remove' && !ownersLower.includes(target)) {
        updateOpStatus(target, type, { step: 'vanishing' });
        await new Promise((r) => setTimeout(r, 500));
        setOptimisticOps((prev) => prev.filter((op) => !(op.type === type && op.address.toLowerCase() === target)));
        return;
      }

      updateOpStatus(target, type, { step: 'building', error: undefined });
      await new Promise((r) => setTimeout(r, 600));
      updateOpStatus(target, type, { step: 'syncing' });

      try {
        const result =
          type === 'add'
            ? await onAddOwner(target, safeDetails.threshold)
            : await onRemoveOwner(target, Math.min(safeDetails.threshold, Math.max(1, safeDetails.owners.length - 1)));

        if (result) {
          updateOpStatus(target, type, { step: 'verifying' });
        } else {
          updateOpStatus(target, type, { step: 'error', error: t('safe.op_proposal_failed') });
        }
      } catch (e: any) {
        updateOpStatus(target, type, { step: 'error', error: e?.message || t('safe.op_fault') });
      }
    };

    void run().finally(() => {
      queuedRunnerRef.current = false;
    });
  }, [optimisticOps, safeDetails.threshold, safeDetails.owners, hasInFlightOp, isOwner, onAddOwner, onRemoveOwner, t]);

  useEffect(() => {
    const makeKey = (op: { address: string; type: OpType }) => `${op.type}:${op.address.toLowerCase()}`;
    const activeKeys = new Set(optimisticOps.map(makeKey));

    // 清理被移除的 op timer
    for (const [key, timer] of verifyTimeoutsRef.current.entries()) {
      if (!activeKeys.has(key)) {
        clearTimeout(timer);
        verifyTimeoutsRef.current.delete(key);
      }
    }

    // 为 verifying 状态建立超时阶段（避免永久扫描）
    for (const op of optimisticOps) {
      const key = makeKey(op);
      if (op.step === 'verifying') {
        if (verifyTimeoutsRef.current.has(key)) continue;
        const timer = setTimeout(() => {
          setOptimisticOps((prev) =>
            prev.map((p) => {
              const pKey = makeKey(p);
              if (pKey !== key) return p;
              if (p.step !== 'verifying') return p;
              return { ...p, step: 'timeout' };
            })
          );
        }, VERIFY_TIMEOUT_MS);
        verifyTimeoutsRef.current.set(key, timer);
      } else {
        const timer = verifyTimeoutsRef.current.get(key);
        if (timer) {
          clearTimeout(timer);
          verifyTimeoutsRef.current.delete(key);
        }
      }
    }
  }, [optimisticOps]);

  useEffect(() => {
    return () => {
      for (const timer of verifyTimeoutsRef.current.values()) clearTimeout(timer);
      verifyTimeoutsRef.current.clear();
      if (verifyRefreshIntervalRef.current) clearInterval(verifyRefreshIntervalRef.current);
      verifyRefreshIntervalRef.current = null;
    };
  }, []);

  useEffect(() => {
    const currentAddrs = safeDetails.owners.map(o => o.toLowerCase());
    setOptimisticOps(prev => {
      let changed = false;
      const next = prev.map(op => {
        const addrLower = op.address.toLowerCase();
        if (op.type === 'remove' && (op.step === 'queued' || op.step === 'verifying' || op.step === 'timeout') && !currentAddrs.includes(addrLower)) {
          changed = true; return { ...op, step: 'vanishing' as const };
        }
        if (op.type === 'add' && (op.step === 'queued' || op.step === 'verifying' || op.step === 'timeout') && currentAddrs.includes(addrLower)) {
          changed = true; return { ...op, step: 'vanishing' as const };
        }
        return op;
      });
      if (changed) {
        setTimeout(() => setOptimisticOps(current => current.filter(o => o.step !== 'vanishing')), 500);
        return next;
      }
      return prev;
    });
  }, [safeDetails.owners]);

  const displayOwners = useMemo(() => {
    const currentAddrs = safeDetails.owners.map(o => o.toLowerCase());
    const baseList = safeDetails.owners.map(addr => {
      const removalOp = optimisticOps.find(op => op.type === 'remove' && op.address.toLowerCase() === addr.toLowerCase());
      return { address: addr, isPending: false, step: removalOp ? removalOp.step : ('idle' as ProcessStep), error: removalOp?.error, opType: 'remove' as OpType };
    });
    const pendingAdditions = optimisticOps.filter(op => op.type === 'add' && op.step !== 'vanishing' && !currentAddrs.includes(op.address.toLowerCase()))
      .map(op => ({ address: op.address, isPending: true, step: op.step, error: op.error, opType: 'add' as OpType }));
    return [...baseList, ...pendingAdditions].filter(item => item.step !== 'vanishing');
  }, [safeDetails.owners, optimisticOps]);

  const updateOpStatus = (address: string, type: OpType, updates: Partial<OptimisticOp>) => {
    setOptimisticOps(prev => prev.map(op => (op.address.toLowerCase() === address.toLowerCase() && op.type === type) ? { ...op, ...updates } : op));
  };

  const clearOp = async (address: string, type: OpType) => {
    updateOpStatus(address, type, { step: 'vanishing' });
    await new Promise(r => setTimeout(r, 500));
    setOptimisticOps(prev => prev.filter(op => !(op.address.toLowerCase() === address.toLowerCase() && op.type === type)));
  };

  const handleStartAddition = async () => {
    const inputAddr = newOwnerInput.trim();
    if (!inputAddr || !ethers.isAddress(inputAddr)) return;
    const target = inputAddr.toLowerCase();
    if (displayOwners.some(o => o.address.toLowerCase() === target && o.step !== 'idle')) return;
    setNewOwnerInput(''); 
    const shouldQueue = safeDetails.threshold === 1 && hasInFlightOp && isOwner;
    setOptimisticOps(prev => [...prev, { address: target, type: 'add', step: shouldQueue ? 'queued' : 'building' }]);
    if (!isOwner) { updateOpStatus(target, 'add', { step: 'error', error: t('safe.op_access_denied') }); return; }
    if (shouldQueue) return;
    await new Promise(r => setTimeout(r, 600));
    updateOpStatus(target, 'add', { step: 'syncing' });
    try {
      const result = await onAddOwner(target, safeDetails.threshold);
      if (result) {
        if (safeDetails.threshold === 1) updateOpStatus(target, 'add', { step: 'verifying' });
        else { updateOpStatus(target, 'add', { step: 'success' }); setTimeout(() => clearOp(target, 'add'), 3000); }
      } else {
        updateOpStatus(target, 'add', { step: 'error', error: t('safe.op_proposal_failed') });
      }
    } catch (e: any) { updateOpStatus(target, 'add', { step: 'error', error: e.message }); }
  };

  const handleStartRemoval = async (owner: string) => {
    const target = owner.toLowerCase();
    if (optimisticOps.some(op => op.address.toLowerCase() === target && op.step !== 'idle')) return;
    const shouldQueue = safeDetails.threshold === 1 && hasInFlightOp && isOwner;
    setOptimisticOps(prev => [...prev, { address: target, type: 'remove', step: shouldQueue ? 'queued' : 'building' }]);
    if (!isOwner) { updateOpStatus(target, 'remove', { step: 'error', error: t('safe.op_access_denied') }); return; }
    if (shouldQueue) return;
    await new Promise(r => setTimeout(r, 600));
    updateOpStatus(target, 'remove', { step: 'syncing' });
    try {
      const nextOwnerCount = Math.max(1, safeDetails.owners.length - 1);
      const nextThreshold = Math.min(safeDetails.threshold, nextOwnerCount);
      const result = await onRemoveOwner(owner, nextThreshold);
      if (result) {
        if (safeDetails.threshold === 1) updateOpStatus(target, 'remove', { step: 'verifying' });
        else { updateOpStatus(target, 'remove', { step: 'success' }); setTimeout(() => clearOp(target, 'remove'), 2000); }
      } else {
        updateOpStatus(target, 'remove', { step: 'error', error: t('safe.op_proposal_failed') });
      }
    } catch (e: any) { updateOpStatus(target, 'remove', { step: 'error', error: e.message }); }
  };

  return (
    <div className="space-y-6 animate-tech-in">
      <div className="flex items-center">
         <button onClick={onBack} className="p-2 -ml-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors mr-2">
            <ArrowLeft className="w-5 h-5" />
         </button>
         <h2 className="text-lg font-bold text-slate-900">{t('safe.settings_title')}</h2>
      </div>
      
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center">
             <Users className="w-4 h-4 text-slate-400 mr-2" />
             <h3 className="font-bold text-sm text-slate-700 uppercase tracking-widest">{t('safe.ownership_matrix')}</h3>
          </div>
          <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100 font-black uppercase tracking-tighter">
            {t('safe.consensus')}: {safeDetails.threshold} / {safeDetails.owners.length}
          </span>
        </div>
        
        <div className="divide-y divide-slate-50 relative">
          {displayOwners.map((item, idx) => {
            const step = item.step as ProcessStep;
            return (
              <div key={`${item.address}-${item.opType}`} className={`p-4 flex justify-between items-center transition-all duration-500 group relative overflow-hidden ${item.isPending ? 'bg-green-50/10' : 'hover:bg-slate-50'}`}>
                {step !== 'idle' && (
	                  <div className={`absolute inset-0 z-10 flex items-center px-4 animate-in fade-in duration-300 ${step === 'error' ? 'bg-red-50/95' : 'bg-white/90 backdrop-blur-[1px]'}`}>
	                    <div className="flex items-center space-x-3 w-full">
	                       <div className="w-8 h-8 flex items-center justify-center">
	                          {step === 'building' && <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />}
	                          {step === 'queued' && <Clock className="w-5 h-5 text-slate-400 animate-pulse" />}
	                          {step === 'syncing' && <Zap className="w-5 h-5 text-amber-500 animate-pulse" />}
	                          {step === 'verifying' && <Activity className="w-5 h-5 text-[#0062ff] animate-[pulse_1.5s_infinite]" />}
	                          {step === 'timeout' && <AlertCircle className="w-5 h-5 text-amber-500 animate-pulse" />}
	                          {step === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
	                          {step === 'error' && <ShieldOff className="w-5 h-5 text-red-500 animate-shake" />}
	                       </div>
	                       <div className="flex-1 min-w-0">
	                          <div className={`text-[10px] font-black uppercase tracking-[0.2em] mb-0.5 truncate ${step === 'error' ? 'text-red-600' : (step === 'verifying' ? 'text-[#0062ff]' : (step === 'timeout' ? 'text-amber-600' : 'text-slate-400'))}`}>
	                             {step === 'queued' && t('safe.op_queued')}
	                             {step === 'building' && t('safe.op_constructing')}
	                             {step === 'syncing' && t('safe.op_broadcasting')}
	                             {step === 'verifying' && t('safe.op_scanning')}
	                             {step === 'timeout' && t('safe.op_timeout')}
	                             {step === 'success' && (safeDetails.threshold === 1 ? t('safe.op_verified') : t('safe.op_proposed'))}
	                             {step === 'error' && (item.error || t('safe.op_fault'))}
	                          </div>
	                       </div>
	                       {(step === 'error' || step === 'success' || step === 'timeout' || step === 'queued') && <button onClick={() => clearOp(item.address, item.opType)} className="p-1 hover:bg-slate-200 rounded-full text-slate-400"><X className="w-4 h-4" /></button>}
		                    </div>
		                  </div>
		                )}
                <div className="flex items-center min-w-0 flex-1">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black mr-3 flex-shrink-0 transition-colors ${item.isPending ? 'bg-green-100 text-green-600 border border-green-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>{item.isPending ? <Plus className="w-3.5 h-3.5" /> : (idx + 1)}</div>
                  <span className={`font-mono text-sm truncate tracking-tight ${item.isPending ? 'text-green-700 italic font-bold' : 'text-slate-600'}`}>{item.address}</span>
                </div>
                {!item.isPending && safeDetails.owners.length > 1 && step === 'idle' && (
                  <button onClick={() => handleStartRemoval(item.address)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg md:opacity-0 md:group-hover:opacity-100 transition-all flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            );
          })}
        </div>
        
        <div className="p-4 bg-slate-50/50 border-t border-slate-100">
          <div className="flex gap-2">
             <div className="relative flex-1">
                <input className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-base font-mono outline-none" placeholder="0x..." value={newOwnerInput} onChange={e => setNewOwnerInput(e.target.value)} />
                <Plus className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
             </div>
             <Button onClick={handleStartAddition} className="text-xs px-5 h-auto" disabled={!newOwnerInput.trim()}>{t('safe.propose_action')}</Button>
          </div>
        </div>
      </div>
      
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
           <span className="text-sm font-bold text-slate-800 block uppercase italic tracking-tighter">{t('safe.adjust_consensus')}</span>
           <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t('safe.threshold_desc')}</span>
        </div>
        <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100 w-full md:w-auto">
          <select className="bg-transparent border-none text-sm font-black text-slate-700 py-1 pl-2 pr-8 flex-1 md:flex-none" value={newThresholdSelect} onChange={e => setNewThresholdSelect(Number(e.target.value))}>
            {displayOwners.filter(o => !o.isPending).map((_, i) => <option key={i} value={i+1}>{i+1} {t('safe.sig_short')}</option>)}
          </select>
          <Button onClick={() => onChangeThreshold(newThresholdSelect)} className="text-xs py-2 h-auto">{t('common.update')}</Button>
        </div>
      </div>
    </div>
  );
};

// Define CreateSafeProps to fix "Cannot find name 'CreateSafeProps'" error
interface CreateSafeProps {
  onDeploy: (owners: string[], threshold: number) => void;
  onCancel: () => void;
  isDeploying: boolean;
  walletAddress?: string;
}

export const CreateSafe: React.FC<CreateSafeProps> = ({ onDeploy, onCancel, isDeploying, walletAddress }) => {
  const { t } = useTranslation();
  const [owners, setOwners] = useState<string[]>(() => [walletAddress || '']);
  const [threshold, setThreshold] = useState(1);
  return (
    <div className="animate-tech-in">
      <div className="flex items-center mb-6">
         <button onClick={onCancel} className="p-2 -ml-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors mr-2"><ArrowLeft className="w-5 h-5" /></button>
         <h2 className="font-bold text-xl text-slate-900 uppercase italic tracking-tight">{t('safe.deploy_title')}</h2>
      </div>
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-lg space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center"><Users className="w-3 h-3 mr-1" /> {t('safe.initial_registry')}</label>
            {owners.length === 0 ? (
               <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center bg-slate-50/30">
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-4">{t('safe.no_owners')}</p>
                  <Button onClick={() => setOwners([''])} variant="secondary" className="text-xs">{t('safe.add_first_owner')}</Button>
               </div>
            ) : (
               owners.map((owner, i) => (
                 <div key={i} className="flex gap-2 animate-tech-in" style={{ animationDelay: `${i * 0.05}s` }}>
                   <input className="flex-1 border border-slate-200 rounded-lg px-3 py-2 font-mono text-base outline-none" value={owner} onChange={e => { const n = [...owners]; n[i] = e.target.value; setOwners(n); }} placeholder="0x..." />
                   <button onClick={() => setOwners(owners.filter((_, idx) => idx !== i))} className="p-2 text-slate-300 hover:text-red-500 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                 </div>
               ))
            )}
            {owners.length > 0 && <button onClick={() => setOwners([...owners, ''])} className="text-[10px] text-indigo-600 font-black uppercase tracking-[0.2em] hover:text-indigo-700 flex items-center mt-2 px-1"><Plus className="w-3 h-3 mr-1.5" /> {t('safe.append_member')}</button>}
          </div>
          <div className="pt-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center mb-2"><Shield className="w-3 h-3 mr-1" /> {t('safe.governance_threshold')}</label>
            <div className="inline-block relative w-full">
               <select className="appearance-none w-full bg-slate-50 border border-slate-200 rounded-lg pl-4 pr-10 py-3 text-sm font-black text-slate-700 uppercase" value={threshold} onChange={e => setThreshold(Number(e.target.value))} disabled={owners.length === 0}>
                  {owners.length === 0 ? <option value={1}>1 {t('safe.sig_required')}</option> : owners.map((_, i) => <option key={i} value={i+1}>{i+1} {i === 0 ? t('safe.sig_required') : t('safe.sigs_required')}</option>)}
               </select>
               <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400"><ChevronDown className="h-4 w-4" /></div>
            </div>
          </div>
          <div className="pt-6 border-t border-slate-100 mt-2"><Button onClick={() => onDeploy(owners.filter(o => o.trim() !== ''), threshold)} isLoading={isDeploying} className="w-full py-4 shadow-xl shadow-indigo-100" disabled={owners.filter(o => o.trim() !== '').length === 0}>{t('safe.execute_deployment')}</Button></div>
        </div>
      </div>
    </div>
  );
};

// Define TrackSafeProps to fix "Cannot find name 'TrackSafeProps'" error
interface TrackSafeProps {
  onTrack: (address: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}

export const TrackSafe: React.FC<TrackSafeProps> = ({ onTrack, onCancel, isLoading }) => {
  const { t } = useTranslation();
  const [address, setAddress] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  useEffect(() => { if (localError) setLocalError(null); }, [address]);
  const handleValidation = () => {
    const trimmed = address.trim();
    if (!trimmed) { setLocalError(t("safe.error_empty")); return; }
    if (!trimmed.startsWith('0x')) { setLocalError(t("safe.error_prefix")); return; }
    if (trimmed.length !== 42) { setLocalError(t("safe.error_length")); return; }
    if (!ethers.isAddress(trimmed)) { setLocalError(t("safe.error_format")); return; }
    onTrack(trimmed);
  };
  return (
    <div className="max-w-md mx-auto animate-tech-in">
      <div className="flex items-center mb-6">
         <button onClick={onCancel} className="p-2 -ml-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors mr-2"><ArrowLeft className="w-5 h-5" /></button>
         <h2 className="font-bold text-xl text-slate-900 uppercase italic tracking-tight">{t('safe.sync_existing')}</h2>
      </div>
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg relative group overflow-hidden">
        <div className={`absolute top-0 left-0 right-0 h-1 transition-colors duration-300 ${localError ? 'bg-red-500' : 'bg-indigo-500 opacity-20'}`}></div>
        <label className={`text-[10px] font-black uppercase block mb-3 tracking-widest ${localError ? 'text-red-500' : 'text-slate-400'}`}>{t('safe.track_title')}</label>
        <div className="relative mb-2">
           <input className={`w-full px-4 py-4 border rounded-xl font-mono text-base outline-none transition-all shadow-inner ${localError ? 'border-red-300 bg-red-50/30 animate-shake' : 'border-slate-200 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-indigo-50'}`} placeholder="0x..." value={address} onChange={e => setAddress(e.target.value)} />
        </div>
        <div className={`flex items-center space-x-2 mb-6 h-6 ${localError ? 'opacity-100' : 'opacity-0'}`}>
           <AlertCircle className="w-3.5 h-3.5 text-red-500" />
           <span className="text-[9px] font-black uppercase text-red-600 tracking-tighter italic">{localError}</span>
        </div>
        <Button onClick={handleValidation} className="w-full py-4 shadow-lg" disabled={!address.trim()} isLoading={isLoading}>{t('safe.initiate_sync')}</Button>
      </div>
    </div>
  );
};
