import React, { useMemo, useState } from 'react';
import { ArrowLeft, Filter, Trash2, Server, Activity, Globe } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { useTranslation } from '../../../contexts/LanguageContext';
import { useHttpConsole } from '../../../contexts/HttpConsoleContext';

const fmtMs = (n: number | undefined): string => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '-';
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
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

  const [query, setQuery] = useState('');
  const [onlyRpc, setOnlyRpc] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const hosts = useMemo(() => {
    const s = new Set<string>();
    for (const e of events) {
      if (e.host) s.add(e.host);
    }
    return Array.from(s.values()).sort();
  }, [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (onlyRpc && e.category !== 'rpc') return false;
      if (!q) return true;
      const hay = `${e.method} ${e.url} ${e.rpcMethod || ''} ${e.action || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [events, onlyRpc, query]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return events.find((e) => e.id === selectedId) || null;
  }, [events, selectedId]);

  return (
    <div className={`animate-tech-in ${isDock ? 'space-y-3 p-3' : 'space-y-6'}`}>
      <div className="flex items-center justify-between">
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
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-slate-600">
              <Filter className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-[0.25em]">{t('console.events')}</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('console.search_placeholder')}
                className={`w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none font-mono ${isDock ? 'sm:w-full' : 'sm:w-[320px]'}`}
              />
              <button
                className={`px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-colors ${
                  onlyRpc ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-white text-slate-500 border-slate-200'
                }`}
                onClick={() => setOnlyRpc(!onlyRpc)}
              >
                {t('console.only_rpc')}
              </button>
            </div>
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
          <div className={`divide-y divide-slate-100 overflow-y-auto ${isDock ? 'max-h-[35vh]' : 'max-h-[60vh]'}`}>
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">{t('console.empty')}</div>
            ) : (
              filtered.map((e) => {
                const active = e.id === selectedId;
                const badge =
                  e.category === 'rpc'
                    ? t('console.category_rpc')
                    : t('console.category_http');
                return (
                  <button
                    key={e.id}
                    onClick={() => setSelectedId(e.id)}
                    className={`w-full text-left ${isDock ? 'p-3' : 'p-4'} hover:bg-slate-50 transition-colors ${active ? 'bg-blue-50/30' : 'bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black uppercase tracking-[0.25em] px-2 py-1 rounded bg-slate-900 text-white">
                            {badge}
                          </span>
                          {e.rpcMethod && (
                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">
                              {t('console.rpc_method')}: {e.rpcMethod}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 text-sm font-black text-slate-900 truncate">
                          {e.action || t('console.action_unknown')}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-400 font-mono truncate">
                          {e.host}
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

          <div className={`${isDock ? 'border-t border-slate-100 p-3 bg-white max-h-[30vh] overflow-y-auto' : 'border-t lg:border-t-0 lg:border-l border-slate-100 p-4 bg-white max-h-[60vh] overflow-y-auto'}`}>
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

                <div className="space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">{t('console.url')}</div>
                  <div className="text-xs font-mono break-words bg-slate-50 border border-slate-200 rounded-xl p-3">{selected.url}</div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">{t('console.request')}</div>
                  <pre className="text-[11px] leading-relaxed font-mono bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-auto">
{safeStringify(selected.requestBody)}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">{t('console.response')}</div>
                  <pre className="text-[11px] leading-relaxed font-mono bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-auto">
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
