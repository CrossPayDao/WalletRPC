
import React from 'react';
import { ChevronDown, LogOut, Settings, Trash2, Bell, XCircle, CheckCircle, Shield } from 'lucide-react';
import { useEvmWallet } from './hooks/useEvmWallet';
import { BrandLogo } from '../../components/ui/BrandLogo';
import { useTranslation } from '../../contexts/LanguageContext';

// --- UI Components ---
import { WalletOnboarding } from './components/WalletOnboarding';
import { WalletDashboard } from './components/WalletDashboard';
import { SendForm } from './components/SendForm';
import { SafeQueue, SafeSettings, CreateSafe, TrackSafe } from './components/SafeViews';
import { ChainModal, AddTokenModal, EditTokenModal } from './components/Modals';
import { ParticleIntro } from '../../components/ui/ParticleIntro';

const TechAlert: React.FC<{ type: 'error' | 'success'; message: string; onClose?: () => void }> = ({ type, message, onClose }) => (
  <div className={`
    fixed top-20 left-1/2 transform -translate-x-1/2 z-[100]
    flex items-center px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md animate-tech-in min-w-[320px]
    ${type === 'error' ? 'bg-white border-red-500 text-red-700' : 'bg-white border-[#0062ff] text-[#0062ff]'}
  `}>
    <div className="flex-shrink-0 mr-3">
      {type === 'error' ? <XCircle className="w-5 h-5 text-red-500" /> : <CheckCircle className="w-5 h-5 text-[#0062ff]" />}
    </div>
    <div className="flex-1 text-xs font-black uppercase tracking-tight">{message}</div>
    {onClose && (
      <button onClick={onClose} className="ml-3 p-1 rounded-md hover:bg-slate-100">
        <XCircle className="w-4 h-4 text-slate-400" />
      </button>
    )}
  </div>
);

const NotificationToast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => (
  <div className="fixed top-6 right-6 z-[100] animate-tech-in max-w-[90vw]">
    <div className="bg-white/90 text-slate-900 px-5 py-4 rounded-xl shadow-2xl flex items-center border border-slate-200 backdrop-blur-md">
      <Bell className="w-5 h-5 text-[#0062ff] mr-3 flex-shrink-0" />
      <span className="text-[10px] font-black uppercase tracking-widest mr-6 truncate">{message}</span>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-900 transition-colors">
        <XCircle className="w-4 h-4" />
      </button>
    </div>
  </div>
);

export const WalletApp: React.FC = () => {
  const { t } = useTranslation();
  const {
    wallet, setWallet, activeChain, activeAddress, activeChainTokens, activeAccountType, setActiveAccountType, activeSafeAddress, setActiveSafeAddress,
    activeChainId, setActiveChainId, chains, view, setView, isMenuOpen, setIsMenuOpen, isLoading, isInitialFetchDone, error, errorObject, notification,
    isChainModalOpen, setIsChainModalOpen, isAddTokenModalOpen, setIsAddTokenModalOpen, tokenToEdit, setTokenToEdit, balance, tokenBalances, transactions,
    safeDetails, pendingSafeTxs, currentNonce, isDeployingSafe, trackedSafes, setTrackedSafes, privateKeyOrPhrase, setPrivateKeyOrPhrase, handleImport,
    fetchData, handleSendSubmit, handleAddSignature, handleExecutePending, confirmAddToken, handleUpdateToken, handleRemoveToken, handleSaveChain,
    handleTrackSafe, deploySafe, addOwnerTx, removeOwnerTx, changeThresholdTx, setError
  } = useEvmWallet();

  const [localNotification, setLocalNotification] = React.useState<string | null>(null);
  React.useEffect(() => { if (notification) { setLocalNotification(notification); const timer = setTimeout(() => setLocalNotification(null), 5000); return () => clearTimeout(timer); } }, [notification]);
  React.useEffect(() => { if (errorObject) { const timer = setTimeout(() => setError(null), 5000); return () => clearTimeout(timer); } }, [errorObject, setError]);

  const [isOnboardingExiting, setIsOnboardingExiting] = React.useState(false);
  const [isIntroFadingOut, setIsIntroFadingOut] = React.useState(false);
  const [minTimePassed, setMinTimePassed] = React.useState(false);

  const onImportWrapper = async () => {
     const success = await handleImport();
     if (success) {
        setIsOnboardingExiting(true);
        setTimeout(() => { setView('intro_animation'); setIsOnboardingExiting(false); }, 1000);
     }
  };

  React.useEffect(() => { if (view === 'intro_animation') { const timer = setTimeout(() => setMinTimePassed(true), 5000); return () => clearTimeout(timer); } }, [view]);
  React.useEffect(() => {
    if (view === 'intro_animation' && minTimePassed && isInitialFetchDone) {
      setIsIntroFadingOut(true);
      setTimeout(() => { setView('dashboard'); setIsIntroFadingOut(false); setMinTimePassed(false); }, 1000);
    }
  }, [view, minTimePassed, isInitialFetchDone, setView]);

  if (view === 'onboarding' || !wallet) return <WalletOnboarding input={privateKeyOrPhrase} setInput={setPrivateKeyOrPhrase} onImport={onImportWrapper} error={error} isExiting={isOnboardingExiting} />;
  if (view === 'intro_animation') return <ParticleIntro fadeOut={isIntroFadingOut} />;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans flex flex-col animate-in fade-in duration-700">
      <header className="bg-white/80 border-b border-slate-200 sticky top-0 z-40 px-4 md:px-8 h-16 flex items-center justify-between shadow-sm backdrop-blur-md">
         <div className="flex items-center space-x-4">
             <div className="hidden lg:flex items-center mr-4 border-r border-slate-100 pr-6">
                <BrandLogo size={24} color="#0062ff" className="mr-3" />
                <span className="font-black tracking-tighter italic text-slate-900 flex items-center">
                  WALLET <span className="text-[#0062ff] mx-0.5">RPC</span>
                  <span className="ml-2 bg-slate-900 text-white text-[8px] px-1.5 py-0.5 rounded uppercase tracking-widest font-black">{t('wallet.beta')}</span>
                </span>
             </div>

             <div className="relative">
                <button onClick={() => activeChain.chainType !== 'TRON' && setIsMenuOpen(!isMenuOpen)} className={`flex items-center space-x-3 px-3 py-2 rounded-xl transition-all ${activeChain.chainType === 'TRON' ? 'cursor-default' : 'hover:bg-slate-100 cursor-pointer'}`}>
                  <div className="relative w-8 h-8 rounded-lg flex items-center justify-center shadow-sm bg-[#0062ff] text-white">
                    {activeAccountType === 'EOA' ? <BrandLogo size={18} color="white" /> : <Shield className="w-4 h-4" />}
                    <div className="absolute -bottom-1 -right-1 px-1 py-0.5 bg-slate-900 text-white text-[6px] font-black rounded border border-white/20 uppercase tracking-tighter">B</div>
                  </div>
                  <div className="text-left hidden md:block">
                     <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{activeAccountType === 'EOA' ? t('wallet.active_key') : t('wallet.node_master')}</div>
                     <div className="text-sm font-black text-slate-900 truncate max-w-[150px] uppercase italic tracking-tight">{activeAccountType === 'EOA' ? (activeChain.chainType === 'TRON' ? 'Tron_Node' : t('wallet.master_key')) : `Safe_${activeSafeAddress?.slice(0,4)}`}</div>
                  </div>
                  {activeChain.chainType !== 'TRON' && <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />}
                </button>

                {isMenuOpen && activeChain.chainType !== 'TRON' && (
                   <div className="absolute top-full left-0 mt-3 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-tech-in z-50">
                      <div className="p-2 border-b border-slate-100">
                         <button onClick={() => { setActiveAccountType('EOA'); setIsMenuOpen(false); setView('dashboard'); }} className="w-full text-left p-3 hover:bg-slate-50 rounded-xl flex items-center transition-colors group">
                            <div className="p-2 bg-[#0062ff]/10 rounded-lg mr-3 text-[#0062ff] group-hover:bg-[#0062ff]/20 transition-all"><BrandLogo size={16} color="currentColor" /></div>
                            <div>
                               <div className="text-sm font-black text-slate-900 uppercase italic">{t('wallet.master_key')}</div>
                               <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t('wallet.local_eoa')}</div>
                            </div>
                         </button>
                      </div>
                      <div className="p-2 max-h-[300px] overflow-y-auto">
                         <p className="text-[10px] font-black text-slate-400 px-3 py-2 uppercase tracking-[0.2em]">{t('wallet.verified_safes')}</p>
                         {trackedSafes.filter(s_safe => s_safe.chainId === activeChainId).map(s_safe => (
                            <div key={s_safe.address} className="flex justify-between items-center group mb-1">
                               <button onClick={() => { setActiveAccountType('SAFE'); setActiveSafeAddress(s_safe.address); setIsMenuOpen(false); setView('dashboard'); }} className="flex-1 text-left p-2.5 text-xs flex items-center rounded-xl hover:bg-blue-50 hover:text-[#0062ff] transition-colors"><div className="w-1.5 h-1.5 bg-[#0062ff] rounded-full mr-3 shadow-[0_0_8px_rgba(0,98,255,0.5)]"></div><span className="font-mono font-medium truncate uppercase">{s_safe.name}</span></button>
                               <button onClick={(e) => { e.stopPropagation(); setTrackedSafes(prev => prev.filter(x => x.address !== s_safe.address)); }} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5"/></button>
                            </div>
                         ))}
                         {trackedSafes.filter(s_safe => s_safe.chainId === activeChainId).length === 0 && <div className="px-3 py-4 text-[10px] text-slate-300 text-center italic border border-dashed border-slate-100 rounded-xl mb-2 font-bold uppercase tracking-widest">{t('wallet.empty_vault')}</div>}
                         <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100">
                            <button onClick={() => { setView('create_safe'); setIsMenuOpen(false); }} className="py-2 text-[10px] bg-[#0062ff] text-white rounded-lg font-black uppercase hover:bg-[#0052d9] transition-colors">{t('wallet.deplo_new')}</button>
                            <button onClick={() => { setView('add_safe'); setIsMenuOpen(false); }} className="py-2 text-[10px] bg-white border border-slate-200 text-slate-400 rounded-lg font-black uppercase hover:text-slate-900 transition-colors">{t('wallet.import')}</button>
                         </div>
                      </div>
                   </div>
                )}
             </div>
         </div>

         <div className="flex items-center gap-2">
            <button onClick={() => setIsChainModalOpen(true)} className="p-2.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-[#0062ff] transition-colors"><Settings className="w-5 h-5"/></button>
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
            <button onClick={() => { setWallet(null); setPrivateKeyOrPhrase(''); setView('onboarding'); }} className="flex items-center space-x-2 px-3 py-2 hover:bg-red-50 rounded-xl text-slate-400 hover:text-red-600 transition-colors">
               <LogOut className="w-4 h-4"/><span className="text-[10px] font-black hidden md:inline uppercase tracking-widest">{t('wallet.kill_sig')}</span>
            </button>
         </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
         <div className="max-w-5xl mx-auto relative z-10">
            {localNotification && <NotificationToast message={localNotification} onClose={() => setLocalNotification(null)} />}
            {error && <TechAlert type="error" message={error} onClose={() => setError(null)} />}

            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
               {view === 'dashboard' && <><WalletDashboard balance={balance} activeChain={activeChain} chains={chains} address={activeAddress || ''} isLoading={isLoading} onRefresh={fetchData} onSend={() => setView('send')} activeAccountType={activeAccountType} pendingTxCount={pendingSafeTxs.filter(t_tx => t_tx.nonce === safeDetails?.nonce).length} onViewQueue={() => setView('safe_queue')} onViewSettings={() => setView('settings')} tokens={activeChainTokens} tokenBalances={tokenBalances} onAddToken={() => setIsAddTokenModalOpen(true)} onEditToken={setTokenToEdit} transactions={transactions} /><div className="mt-12 mb-6 text-center opacity-20"><p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.4em] italic">{t('wallet.disclaimer')}</p></div></>}
               {view === 'send' && <SendForm activeChain={activeChain} tokens={activeChainTokens} balances={{ ...tokenBalances, NATIVE: balance }} activeAccountType={activeAccountType} recommendedNonce={currentNonce} onSend={handleSendSubmit} onBack={() => setView('dashboard')} onRefresh={fetchData} isLoading={isLoading} transactions={transactions} />}
               {view === 'safe_queue' && <SafeQueue pendingTxs={pendingSafeTxs} safeDetails={safeDetails} walletAddress={wallet?.address} onSign={handleAddSignature} onExecute={handleExecutePending} onBack={() => setView('dashboard')} />}
               {view === 'settings' && safeDetails && <SafeSettings safeDetails={safeDetails} walletAddress={wallet?.address} onRemoveOwner={removeOwnerTx} onAddOwner={addOwnerTx} onChangeThreshold={changeThresholdTx} onBack={() => setView('dashboard')} />}
               {view === 'create_safe' && <CreateSafe onDeploy={deploySafe} onCancel={() => setView('dashboard')} isDeploying={isDeployingSafe} walletAddress={wallet?.address} />}
               {view === 'add_safe' && <TrackSafe onTrack={handleTrackSafe} onCancel={() => setView('dashboard')} isLoading={isLoading} />}
            </div>
         </div>
      </main>

      <ChainModal isOpen={isChainModalOpen} onClose={() => setIsChainModalOpen(false)} initialConfig={activeChain} onSave={handleSaveChain} chains={chains} onSwitchNetwork={setActiveChainId} />
      <AddTokenModal isOpen={isAddTokenModalOpen} onClose={() => setIsAddTokenModalOpen(false)} onImport={confirmAddToken} isImporting={false} />
      <EditTokenModal token={tokenToEdit} onClose={() => setTokenToEdit(null)} onSave={handleUpdateToken} onDelete={handleRemoveToken} />
    </div>
  );
};
