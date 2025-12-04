

import React, { useState, useEffect } from 'react';
import { X, Trash2, Github, ExternalLink, AlertCircle, Search, Server, ChevronDown, ChevronUp, Globe, Radio, Compass } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { ChainConfig, TokenConfig } from '../types';
import { getActiveExplorer } from '../utils';

// --- Chain Modal (Global Settings) ---

interface ChainModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialConfig: ChainConfig;
  chains: ChainConfig[];
  onSwitchNetwork: (chainId: number) => void;
  onSave: (config: ChainConfig) => void;
}

export const ChainModal: React.FC<ChainModalProps> = ({ 
  isOpen, 
  onClose, 
  initialConfig, 
  chains,
  onSwitchNetwork,
  onSave 
}) => {
  const [config, setConfig] = useState<Partial<ChainConfig>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rpcMode, setRpcMode] = useState<'preset' | 'custom'>('preset');
  
  // Identify if this is a default supported chain
  const isDefaultChain = !initialConfig.isCustom;

  useEffect(() => {
    if (isOpen) {
      setConfig(initialConfig);
      // Check if current RPC is in the public list
      const isPublic = initialConfig.publicRpcUrls?.includes(initialConfig.defaultRpcUrl);
      setRpcMode(isPublic ? 'preset' : 'custom');
      setShowAdvanced(false);
    }
  }, [isOpen, initialConfig]);

  if (!isOpen) return null;

  const activeExplorer = getActiveExplorer(initialConfig);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
             <h3 className="font-bold text-slate-900 text-lg">Settings</h3>
             <p className="text-xs text-slate-500">Network & Connection Preferences</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">

          {/* Network Switcher */}
          <div className="space-y-4">
             <div className="flex items-center space-x-2 text-indigo-600">
                <Globe className="w-5 h-5" />
                <span className="font-bold text-sm uppercase tracking-wide">Current Network</span>
             </div>
             <div className="relative">
                <select 
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-base font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                  value={initialConfig.id}
                  onChange={(e) => onSwitchNetwork(Number(e.target.value))}
                >
                  {chains.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div className="absolute right-4 top-3.5 pointer-events-none text-slate-400">
                  <ChevronDown className="w-5 h-5" />
                </div>
             </div>
          </div>

          <hr className="border-slate-100" />
          
          {/* RPC Configuration (Primary Focus) */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-indigo-600">
              <Server className="w-5 h-5" />
              <span className="font-bold text-sm uppercase tracking-wide">RPC Connection</span>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
               <div>
                 <label className="text-xs font-bold text-slate-500 block mb-2">Select Node Provider</label>
                 <select 
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={rpcMode === 'custom' ? 'custom' : config.defaultRpcUrl}
                    onChange={(e) => {
                       const val = e.target.value;
                       if (val === 'custom') {
                          setRpcMode('custom');
                          // Keep existing value in custom input
                       } else {
                          setRpcMode('preset');
                          setConfig({ ...config, defaultRpcUrl: val });
                       }
                    }}
                 >
                    {initialConfig.publicRpcUrls?.map((url, idx) => (
                       <option key={url} value={url}>Public Node {idx + 1} ({new URL(url).hostname})</option>
                    ))}
                    <option value="custom">Custom RPC URL...</option>
                 </select>
               </div>

               {rpcMode === 'custom' && (
                 <div className="animate-tech-in">
                    <label className="text-xs font-bold text-slate-500 block mb-2">Custom RPC URL</label>
                    <input 
                       className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none" 
                       value={config.defaultRpcUrl || ''} 
                       placeholder="https://..."
                       onChange={e => setConfig({ ...config, defaultRpcUrl: e.target.value })} 
                    />
                     <p className="text-[10px] text-slate-400 mt-1.5 flex items-center">
                       <AlertCircle className="w-3 h-3 mr-1" />
                       Ensure the node supports the correct Chain ID ({initialConfig.id}).
                     </p>
                 </div>
               )}
            </div>
          </div>

          {/* Block Explorer Configuration */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-indigo-600">
              <Compass className="w-5 h-5" />
              <span className="font-bold text-sm uppercase tracking-wide">Block Explorer</span>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
               <label className="text-xs font-bold text-slate-500 block mb-2">Preferred Explorer</label>
               {initialConfig.explorers && initialConfig.explorers.length > 0 ? (
                 <div className="space-y-3">
                   <select
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={config.defaultExplorerKey || initialConfig.explorers[0].key}
                      onChange={(e) => setConfig({ ...config, defaultExplorerKey: e.target.value })}
                   >
                      {initialConfig.explorers.map(e => (
                        <option key={e.key} value={e.key}>{e.name}</option>
                      ))}
                   </select>
                   
                   {/* Explorer Link Preview */}
                   {activeExplorer && activeExplorer.url && (
                     <a href={activeExplorer.url} target="_blank" rel="noreferrer" className="flex items-center text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                       <span>Open {activeExplorer.name} Website</span>
                       <ExternalLink className="w-3 h-3 ml-1" />
                     </a>
                   )}
                 </div>
               ) : (
                  <div className="text-sm text-slate-400 italic">No explorers configured for this chain.</div>
               )}
            </div>
          </div>

          {/* Advanced Info Toggle */}
          <div>
             <button 
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center justify-between w-full py-2 text-slate-500 hover:text-slate-800 transition-colors"
             >
                <div className="flex items-center space-x-2">
                   <Search className="w-4 h-4" />
                   <span className="text-xs font-bold uppercase tracking-wide">Technical Details</span>
                </div>
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
             </button>

             {showAdvanced && (
               <div className="mt-3 space-y-4 animate-in slide-in-from-top-2 duration-200">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Chain ID</label>
                            <div className="font-mono text-sm text-slate-700 font-medium">{initialConfig.id}</div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Currency</label>
                            <div className="font-mono text-sm text-slate-700 font-medium">{initialConfig.currencySymbol}</div>
                        </div>
                      </div>

                      {/* Contribution Link */}
                      <div className="pt-2 border-t border-slate-200 mt-2">
                         <a 
                           href="https://github.com/nexus-vault/wallet-data" 
                           target="_blank" 
                           rel="noreferrer"
                           className="flex items-center text-[10px] text-slate-400 hover:text-indigo-600 transition-colors"
                         >
                           <Github className="w-3 h-3 mr-1.5" />
                           <span>Incorrect info? Contribute on GitHub</span>
                         </a>
                      </div>
                  </div>
               </div>
             )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-6 pt-2 bg-white border-t border-slate-50 mt-auto">
          <Button onClick={() => onSave(config as ChainConfig)} className="w-full py-3 shadow-lg shadow-indigo-100">
             Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
};

// --- Token Modals ---

interface AddTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (address: string) => void;
  isImporting: boolean;
}

export const AddTokenModal: React.FC<AddTokenModalProps> = ({ isOpen, onClose, onImport, isImporting }) => {
  const [address, setAddress] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-900">Add Custom Token</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400 hover:text-slate-600" /></button>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-500 leading-relaxed border border-slate-100">
            This adds the token to your <strong>local browser storage</strong> only. It will not be visible to other users.
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1.5">Contract Address</label>
            <input 
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
              placeholder="0x..." 
              value={address} 
              onChange={e => setAddress(e.target.value)} 
              autoFocus
            />
          </div>
          <Button onClick={() => onImport(address)} isLoading={isImporting} className="w-full py-2.5" disabled={!address}>
            Import Token
          </Button>

          <div className="pt-2 border-t border-slate-50 mt-2">
             <a 
               href="https://github.com/nexus-vault/wallet-data" 
               target="_blank"
               rel="noreferrer"
               className="flex items-center justify-center text-xs text-indigo-600 hover:text-indigo-700 font-medium gap-1.5"
             >
               <Github className="w-3.5 h-3.5" />
               <span>Add permanently via GitHub</span>
             </a>
          </div>
        </div>
      </div>
    </div>
  );
};

interface EditTokenModalProps {
  token: TokenConfig | null;
  onClose: () => void;
  onSave: (token: TokenConfig) => void;
  onDelete: (address: string) => void;
}

export const EditTokenModal: React.FC<EditTokenModalProps> = ({ token, onClose, onSave, onDelete }) => {
  const [editing, setEditing] = useState<TokenConfig | null>(null);

  useEffect(() => {
    if (token) setEditing(token);
  }, [token]);

  if (!token || !editing) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-bold mb-6 text-lg">Edit Token</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Symbol</label>
            <input 
              className="w-full border border-slate-300 rounded-lg px-3 py-2" 
              value={editing.symbol} 
              onChange={e => setEditing({ ...editing, symbol: e.target.value })} 
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Decimals</label>
            <input 
              className="w-full border border-slate-300 rounded-lg px-3 py-2" 
              type="number" 
              value={editing.decimals} 
              onChange={e => setEditing({ ...editing, decimals: Number(e.target.value) })} 
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button onClick={() => onSave(editing)} className="flex-1">Save</Button>
            <Button onClick={() => onDelete(editing.address)} variant="danger" icon={<Trash2 className="w-4 h-4" />}>
              Delete
            </Button>
          </div>
          <button onClick={onClose} className="w-full text-center text-xs text-slate-400 mt-4 hover:text-slate-600">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};