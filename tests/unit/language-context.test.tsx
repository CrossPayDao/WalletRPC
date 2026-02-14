import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { LanguageProvider, useTranslation } from '../../contexts/LanguageContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

describe('LanguageContext', () => {
  const originalLanguage = navigator.language;

  afterEach(() => {
    localStorage.clear();
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: originalLanguage
    });
    vi.restoreAllMocks();
  });

  it('在缺少 Provider 时抛出明确错误', () => {
    expect(() => renderHook(() => useTranslation())).toThrow('Missing LanguageProvider');
  });

  it('优先从 localStorage 恢复语言配置', async () => {
    localStorage.setItem('nexus_lang', 'zh-SG');
    const { result } = renderHook(() => useTranslation(), { wrapper });

    await waitFor(() => {
      expect(result.current.language).toBe('zh-SG');
    });
    expect(result.current.t('common.confirm')).toBe('确认');
    expect(result.current.isSG).toBe(true);
  });

  it('无持久化配置时会按浏览器语言回退到中文', async () => {
    localStorage.removeItem('nexus_lang');
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'zh-CN'
    });

    const { result } = renderHook(() => useTranslation(), { wrapper });

    await waitFor(() => {
      expect(result.current.language).toBe('zh-SG');
    });
  });

  it('setLanguage 会更新状态与 localStorage，且未知 key 回退为原路径', async () => {
    const { result } = renderHook(() => useTranslation(), { wrapper });

    act(() => {
      result.current.setLanguage('zh-SG');
    });

    await waitFor(() => {
      expect(result.current.language).toBe('zh-SG');
    });

    expect(localStorage.getItem('nexus_lang')).toBe('zh-SG');
    expect(result.current.t('wallet.title')).toBe('Wallet RPC');
    expect(result.current.t('non.exist.key')).toBe('non.exist.key');
  });
});
