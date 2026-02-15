
import React, { useState, useEffect } from 'react';
import { X, Trash2, Github, ExternalLink, AlertCircle, Search, Server, ChevronDown, ChevronUp, Globe, Radio, Compass } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { ChainConfig, TokenConfig } from '../types';
import { getActiveExplorer } from '../utils';
import { useTranslation } from '../../../contexts/LanguageContext';
import { validateEvmRpcEndpoint, isHttpUrl } from '../../../services/rpcValidation';
import { TronService } from '../../../services/tronService';

interface ChainModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialConfig: ChainConfig;
  chains: ChainConfig[];
  onSwitchNetwork: (chainId: number) => void;
  onSave: (config: ChainConfig) => void | Promise<void>;
}

export const ChainModal: React.FC<ChainModalProps> = ({ 
  isOpen, 
  onClose, 
  initialConfig, 
  chains,
  onSwitchNetwork,
  onSave 
}) => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<Partial<ChainConfig>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rpcMode, setRpcMode] = useState<'preset' | 'custom'>('preset');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const safeHostname = (url: string): string => {
    try {
      return new URL(url).hostname || t('common.unknown');
    } catch {
      return t('common.unknown');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setConfig(initialConfig);
      const isPublic = initialConfig.publicRpcUrls?.includes(initialConfig.defaultRpcUrl);
      setRpcMode(isPublic ? 'preset' : 'custom');
      setShowAdvanced(false);
      setSaveError(null);
      setIsSaving(false);
    }
  }, [isOpen, initialConfig]);

  if (!isOpen) return null;
  const resolvedConfig = { ...initialConfig, ...config } as ChainConfig;
  const activeExplorer = getActiveExplorer(resolvedConfig);

  const handleSave = async () => {
    setSaveError(null);

    const rpcUrlRaw = String(resolvedConfig.defaultRpcUrl || '').trim();
    if (!rpcUrlRaw) {
      setSaveError(t('settings.rpc_required'));
      return;
    }
    if (!isHttpUrl(rpcUrlRaw)) {
      setSaveError(t('settings.rpc_must_http'));
      return;
    }

    const tronNormalized = resolvedConfig.chainType === 'TRON' ? TronService.normalizeHost(rpcUrlRaw) : rpcUrlRaw;
    const initialNormalized =
      resolvedConfig.chainType === 'TRON'
        ? TronService.normalizeHost(String(initialConfig.defaultRpcUrl || '').trim())
        : String(initialConfig.defaultRpcUrl || '').trim();
    const rpcChanged = tronNormalized !== initialNormalized;

    setIsSaving(true);
    try {
      if (rpcChanged) {
        if (resolvedConfig.chainType === 'TRON') {
          const probe = await TronService.probeRpc(tronNormalized);
          if (!probe.ok) {
            setSaveError(`${t('settings.tron_rpc_validation_failed')}: ${probe.error || t('common.unknown')}`);
            return;
          }
        } else {
          const ok = await validateEvmRpcEndpoint(rpcUrlRaw, resolvedConfig.id);
          if (!ok.ok) {
            setSaveError(ok.error);
            return;
          }
        }
      }

      await onSave({
        ...resolvedConfig,
        defaultRpcUrl: resolvedConfig.chainType === 'TRON' ? tronNormalized : rpcUrlRaw
      });
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setSaveError(msg || t('settings.save_failed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
             <h3 className="font-bold text-slate-900 text-lg">{t('settings.title')}</h3>
             <p className="text-xs text-slate-500">{t('settings.subtitle')}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          <div className="space-y-4">
             <div className="flex items-center space-x-2 text-indigo-600">
                <Globe className="w-5 h-5" />
                <span className="font-bold text-sm uppercase tracking-wide">{t('settings.current_network')}</span>
             </div>
             <div className="relative">
                <select className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-base font-bold text-slate-800 outline-none appearance-none" value={initialConfig.id} onChange={(e) => onSwitchNetwork(Number(e.target.value))}>
                  {chains.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div className="absolute right-4 top-3.5 pointer-events-none text-slate-400"><ChevronDown className="w-5 h-5" /></div>
             </div>
          </div>

          <hr className="border-slate-100" />
          
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-indigo-600">
              <Server className="w-5 h-5" />
              <span className="font-bold text-sm uppercase tracking-wide">{t('settings.rpc_connection')}</span>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
               <div>
                 <label className="text-xs font-bold text-slate-500 block mb-2">{t('settings.select_node')}</label>
                 <select className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-base font-medium outline-none" value={rpcMode === 'custom' ? 'custom' : config.defaultRpcUrl} onChange={(e) => { const val = e.target.value; if (val === 'custom') setRpcMode('custom'); else { setRpcMode('preset'); setConfig({ ...config, defaultRpcUrl: val }); } }}>
                    {initialConfig.publicRpcUrls?.map((url, idx) => (
                      <option key={url} value={url}>
                        Public Node {idx + 1} ({safeHostname(url)})
                      </option>
                    ))}
                    <option value="custom">{t('settings.custom_rpc')}</option>
                 </select>
               </div>
               {rpcMode === 'custom' && (
                 <div className="animate-tech-in">
                    <label className="text-xs font-bold text-slate-500 block mb-2">{t('settings.rpc_connection')}</label>
                    <input className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-base font-mono outline-none" value={config.defaultRpcUrl || ''} placeholder="https://..." onChange={e => setConfig({ ...config, defaultRpcUrl: e.target.value })} />
                     <p className="text-[10px] text-slate-400 mt-1.5 flex items-center"><AlertCircle className="w-3 h-3 mr-1" />{t('settings.node_hint')} ({initialConfig.id}).</p>
                 </div>
               )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-indigo-600">
              <Compass className="w-5 h-5" />
              <span className="font-bold text-sm uppercase tracking-wide">{t('settings.block_explorer')}</span>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
               <label className="text-xs font-bold text-slate-500 block mb-2">{t('settings.pref_explorer')}</label>
               {initialConfig.explorers && initialConfig.explorers.length > 0 ? (
                 <div className="space-y-3">
                   <select className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-base font-medium outline-none" value={config.defaultExplorerKey || initialConfig.explorers[0].key} onChange={(e) => setConfig({ ...config, defaultExplorerKey: e.target.value })}>
                      {initialConfig.explorers.map(e => <option key={e.key} value={e.key}>{e.name}</option>)}
                   </select>
                   {activeExplorer && activeExplorer.url && <a href={activeExplorer.url} target="_blank" rel="noreferrer" className="flex items-center text-xs text-indigo-600 hover:text-indigo-800 font-medium"><span>{t('settings.open_website')}</span><ExternalLink className="w-3 h-3 ml-1" /></a>}
                 </div>
               ) : <div className="text-sm text-slate-400 italic">{t('settings.no_explorers')}</div>}
            </div>
          </div>

	          <div>
	             <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center justify-between w-full py-2 text-slate-500 hover:text-slate-800 transition-colors">
                <div className="flex items-center space-x-2"><Search className="w-4 h-4" /><span className="text-xs font-bold uppercase tracking-wide">{t('settings.tech_details')}</span></div>
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
             </button>
             {showAdvanced && (
               <div className="mt-3 space-y-4 animate-in slide-in-from-top-2 duration-200">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">{t('settings.chain_id')}</label><div className="font-mono text-sm text-slate-700 font-medium">{initialConfig.id}</div></div>
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">{t('settings.currency')}</label><div className="font-mono text-sm text-slate-700 font-medium">{initialConfig.currencySymbol}</div></div>
                      </div>
                      <div className="pt-2 border-t border-slate-200 mt-2"><a href="https://github.com/nexus-vault/wallet-data" target="_blank" rel="noreferrer" className="flex items-center text-[10px] text-slate-400 hover:text-indigo-600 transition-colors"><Github className="w-3 h-3 mr-1.5" /><span>{t('settings.contribute')}</span></a></div>
                  </div>
               </div>
             )}
	          </div>
	        </div>

	        <div className="p-6 pt-2 bg-white border-t border-slate-50 mt-auto space-y-2">
            {saveError && (
              <div role="alert" className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {saveError}
              </div>
            )}
            <Button onClick={handleSave} isLoading={isSaving} className="w-full py-3 shadow-lg">
              {t('common.save')}
            </Button>
          </div>
	      </div>
	    </div>
	  );
  };

// Define AddTokenModalProps interface to fix "Cannot find name 'AddTokenModalProps'" error
interface AddTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (address: string) => void;
  isImporting: boolean;
}

export const AddTokenModal: React.FC<AddTokenModalProps> = ({ isOpen, onClose, onImport, isImporting }) => {
  const { t } = useTranslation();
  const [address, setAddress] = useState('');
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center"><h3 className="font-bold text-slate-900">{t('settings.add_custom_token')}</h3><button onClick={onClose}><X className="w-4 h-4 text-slate-400 hover:text-slate-600" /></button></div>
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-500 leading-relaxed border border-slate-100">{t('settings.local_storage_hint')}</div>
          <div><label className="text-xs font-bold text-slate-500 block mb-1.5">{t('settings.contract_address')}</label><input className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-base font-mono outline-none" placeholder="0x..." value={address} onChange={e => setAddress(e.target.value)} autoFocus /></div>
          <Button onClick={() => onImport(address)} isLoading={isImporting} className="w-full py-2.5" disabled={!address}>{t('settings.import_token_btn')}</Button>
          <div className="pt-2 border-t border-slate-50 mt-2"><a href="https://github.com/nexus-vault/wallet-data" target="_blank" rel="noreferrer" className="flex items-center justify-center text-xs text-indigo-600 font-medium gap-1.5"><Github className="w-3.5 h-3.5" /><span>{t('settings.github_add')}</span></a></div>
        </div>
      </div>
    </div>
  );
};

// Define EditTokenModalProps interface to fix "Cannot find name 'EditTokenModalProps'" error
interface EditTokenModalProps {
  token: TokenConfig | null;
  onClose: () => void;
  onSave: (token: TokenConfig) => void;
  onDelete: (address: string) => void;
}

export const EditTokenModal: React.FC<EditTokenModalProps> = ({ token, onClose, onSave, onDelete }) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<TokenConfig | null>(null);
  useEffect(() => { if (token) setEditing(token); }, [token]);
  if (!token || !editing) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-bold mb-6 text-lg">{t('settings.edit_token')}</h3>
        <div className="space-y-4">
          <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1">{t('settings.symbol')}</label><input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" value={editing.symbol} onChange={e => setEditing({ ...editing, symbol: e.target.value })} /></div>
          <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1">{t('settings.decimals')}</label><input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" type="number" value={editing.decimals} onChange={e => setEditing({ ...editing, decimals: Number(e.target.value) })} /></div>
          <div className="flex gap-3 pt-4"><Button onClick={() => onSave(editing)} className="flex-1">{t('common.save')}</Button><Button onClick={() => onDelete(editing.address)} variant="danger" icon={<Trash2 className="w-4 h-4" />}>{t('common.delete')}</Button></div>
          <button onClick={onClose} className="w-full text-center text-xs text-slate-400 mt-4 hover:text-slate-600">{t('common.cancel')}</button>
        </div>
      </div>
    </div>
  );
};
