import React, { useMemo, useState } from 'react';
import { ArrowLeft, Filter, Trash2, Server, Activity, Globe } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { useTranslation } from '../../../contexts/LanguageContext';
import { useHttpConsole } from '../../../contexts/HttpConsoleContext';
import { ethers } from 'ethers';

const fmtMs = (n: number | undefined): string => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '-';
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
};

const getRpcResultHex = (responseBody: unknown): string | null => {
  if (!responseBody) return null;
  if (typeof responseBody === 'object' && responseBody && 'result' in (responseBody as any)) {
    const r = (responseBody as any).result;
    return typeof r === 'string' && r.startsWith('0x') ? r : null;
  }
  return null;
};

const getEthCallSelector = (requestBody: unknown): string | null => {
  if (!requestBody || typeof requestBody !== 'object') return null;
  const params = (requestBody as any).params;
  if (!Array.isArray(params) || !params[0] || typeof params[0] !== 'object') return null;
  const data = (params[0] as any).data;
  if (typeof data !== 'string') return null;
  const s = data.trim().toLowerCase();
  if (!s.startsWith('0x') || s.length < 10) return null;
  return s.slice(0, 10);
};

const tryDecodeSafeOwnersCount = (requestBody: unknown, responseBody: unknown): number | null => {
  // Safe getOwners(): selector 0xa0e67e2b, returns address[]
  const sel = getEthCallSelector(requestBody);
  if (sel !== '0xa0e67e2b') return null;
  const hex = getRpcResultHex(responseBody);
  if (!hex) return null;
  try {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const decoded = coder.decode(['address[]'], hex);
    const owners = decoded?.[0] as string[] | undefined;
    if (!Array.isArray(owners)) return null;
    return owners.length;
  } catch {
    return null;
  }
};

const tryDecodeSafeUint = (selector: string, requestBody: unknown, responseBody: unknown): bigint | null => {
  const sel = getEthCallSelector(requestBody);
  if (sel !== selector) return null;
  const hex = getRpcResultHex(responseBody);
  if (!hex) return null;
  try {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const decoded = coder.decode(['uint256'], hex);
    const v = decoded?.[0] as bigint | undefined;
    return typeof v === 'bigint' ? v : null;
  } catch {
    return null;
  }
};

const safeStringify = (v: unknown): string => {
  if (v == null) return '';
  try {
    if (typeof v === 'string') return v;
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
};

export const ConsoleView: React.FC<{ onBack?: () => void; onMinimize?: () => void; mode?: 'page' | 'dock' }> = ({ onBack, onMinimize, mode = 'page' }) => {
  const { t } = useTranslation();
  const { enabled, setEnabled, events, clear } = useHttpConsole();
  const isDock = mode === 'dock';

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const hosts = useMemo(() => {
    const s = new Set<string>();
    for (const e of events) {
      if (e.host) s.add(e.host);
    }
    return Array.from(s.values()).sort();
  }, [events]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return events.find((e) => e.id === selectedId) || null;
  }, [events, selectedId]);

  return (
    <div className={`animate-tech-in ${isDock ? 'space-y-3 p-3' : 'space-y-6'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center">
          {mode === 'page' && onBack && (
            <button
              onClick={onBack}
              className="p-2 -ml-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors mr-2"
              aria-label="console-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h2 className="text-lg font-bold text-slate-900">{t('console.title')}</h2>
            <p className="text-xs text-slate-500">{t('console.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Button
            variant={enabled ? 'primary' : 'outline'}
            className="text-xs h-10"
            icon={<Activity className="w-4 h-4" />}
            onClick={() => setEnabled(!enabled)}
          >
            {enabled ? 'ON' : 'OFF'}
          </Button>
          <Button
            variant="outline"
            className="text-xs h-10"
            icon={<Trash2 className="w-4 h-4" />}
            onClick={() => {
              clear();
              setSelectedId(null);
            }}
          >
            {t('console.clear')}
          </Button>
          {mode === 'dock' && onMinimize && (
            <Button
              variant="outline"
              className="text-xs h-10"
              onClick={onMinimize}
              aria-label="console-minimize"
            >
              {t('console.minimize')}
            </Button>
          )}
        </div>
      </div>

      <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${isDock ? '' : ''}`}>
        <div className={`border-b border-slate-100 bg-slate-50/50 space-y-3 ${isDock ? 'p-3' : 'p-4'}`}>
          <div className="flex items-center gap-2 text-slate-600">
            <Filter className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.25em]">{t('console.events')}</span>
          </div>

          <div className="flex items-center gap-2 text-slate-500">
            <Server className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.25em]">{t('console.hosts')}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {hosts.length === 0 ? (
              <span className="text-xs text-slate-400 font-mono">{t('common.unknown')}</span>
            ) : (
              hosts.map((h) => (
                <span key={h} className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-600">
                  <Globe className="inline-block w-3 h-3 mr-1 text-slate-400" />
                  {h}
                </span>
              ))
            )}
          </div>
        </div>

        <div className={isDock ? 'grid grid-cols-1' : 'grid grid-cols-1 lg:grid-cols-2'}>
          <div
            className={[
              'divide-y divide-slate-100',
              isDock ? 'overflow-visible' : 'overflow-y-auto max-h-[60vh]'
            ].join(' ')}
          >
            {events.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">{t('console.empty')}</div>
            ) : (
              events.map((e) => {
                const active = e.id === selectedId;
                return (
                  <button
                    key={e.id}
                    onClick={() => setSelectedId(e.id)}
                    className={`w-full text-left ${isDock ? 'p-3' : 'p-4'} hover:bg-slate-50 transition-colors ${active ? 'bg-blue-50/30' : 'bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-mono text-slate-500 truncate">
                          {e.host}
                        </div>
                        <div className="mt-1 text-sm font-black text-slate-900 truncate">
                          {e.action || t('console.action_unknown')}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[10px] font-black text-slate-700">{e.status ?? '-'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{fmtMs(e.durationMs)}</div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div
            className={
              isDock
                ? 'border-t border-slate-100 p-3 bg-white overflow-visible'
                : 'border-t lg:border-t-0 lg:border-l border-slate-100 p-4 bg-white max-h-[60vh] overflow-y-auto'
            }
          >
            {!selected ? (
              <div className="text-sm text-slate-400">{t('console.details')}</div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">{t('console.action')}</div>
                  <div className="text-sm font-black text-slate-900">{selected.action || t('console.action_unknown')}</div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">{t('console.status')}</div>
                    <div className="text-sm font-mono text-slate-900 mt-1">{selected.status ?? '-'}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">{t('console.duration')}</div>
                    <div className="text-sm font-mono text-slate-900 mt-1">{fmtMs(selected.durationMs)}</div>
                  </div>
                </div>

                {(() => {
                  const ownersCount = tryDecodeSafeOwnersCount(selected.requestBody, selected.responseBody);
                  const threshold = tryDecodeSafeUint('0xe75235b8', selected.requestBody, selected.responseBody);
                  const nonce = tryDecodeSafeUint('0xaffed0e0', selected.requestBody, selected.responseBody);
                  if (ownersCount == null && threshold == null && nonce == null) return null;
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      {ownersCount != null && (
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-700/80">SAFE</div>
                          <div className="text-xs font-black text-slate-900 mt-1">{t('console.intent_safe_owners')}</div>
                          <div className="text-sm font-mono text-slate-900 mt-1">{ownersCount}</div>
                        </div>
                      )}
                      {threshold != null && (
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-700/80">SAFE</div>
                          <div className="text-xs font-black text-slate-900 mt-1">{t('console.intent_safe_threshold')}</div>
                          <div className="text-sm font-mono text-slate-900 mt-1">{threshold.toString()}</div>
                        </div>
                      )}
                      {nonce != null && (
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-700/80">SAFE</div>
                          <div className="text-xs font-black text-slate-900 mt-1">{t('console.intent_safe_nonce')}</div>
                          <div className="text-sm font-mono text-slate-900 mt-1">{nonce.toString()}</div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">{t('console.url')}</div>
                  <div className="text-xs font-mono break-words bg-slate-50 border border-slate-200 rounded-xl p-3">{selected.url}</div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">{t('console.request')}</div>
                  <pre className="text-[11px] leading-relaxed font-mono bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-auto max-h-[22vh]">
{safeStringify(selected.requestBody)}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">{t('console.response')}</div>
                  <pre className="text-[11px] leading-relaxed font-mono bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-auto max-h-[22vh]">
{safeStringify(selected.responseBody)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
