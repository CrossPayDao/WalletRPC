import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LanguageProvider, useTranslation } from '../../contexts/LanguageContext';

describe('LanguageContext', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('默认语言为 en', () => {
        const { result } = renderHook(() => useTranslation(), { wrapper: LanguageProvider });
        expect(result.current.language).toBe('en');
        expect(result.current.isSG).toBe(false);
    });

    it('读取持久化存储 walletrpc_lang', () => {
        localStorage.setItem('walletrpc_lang', 'zh-SG');
        const { result } = renderHook(() => useTranslation(), { wrapper: LanguageProvider });
        expect(result.current.language).toBe('zh-SG');
    });

    it('迁移旧版 nexus_lang 并清除旧 key', () => {
        localStorage.setItem('nexus_lang', 'zh-SG');
        const { result } = renderHook(() => useTranslation(), { wrapper: LanguageProvider });

        expect(result.current.language).toBe('zh-SG');
        expect(localStorage.getItem('walletrpc_lang')).toBe('zh-SG');
        // 验证旧 key 被移除
        expect(localStorage.getItem('nexus_lang')).toBeNull();
    });

    it('自动检测浏览器语言 zh-* -> zh-SG', () => {
        const languageGetter = vi.spyOn(window.navigator, 'language', 'get');
        languageGetter.mockReturnValue('zh-CN');

        const { result } = renderHook(() => useTranslation(), { wrapper: LanguageProvider });
        expect(result.current.language).toBe('zh-SG');
    });

    it('自动检测浏览器语言 en-* -> en', () => {
        const languageGetter = vi.spyOn(window.navigator, 'language', 'get');
        languageGetter.mockReturnValue('en-US');

        const { result } = renderHook(() => useTranslation(), { wrapper: LanguageProvider });
        expect(result.current.language).toBe('en');
    });

    it('setLanguage 更新状态并持久化', () => {
        const { result } = renderHook(() => useTranslation(), { wrapper: LanguageProvider });

        act(() => {
            result.current.setLanguage('zh-SG');
        });

        expect(result.current.language).toBe('zh-SG');
        expect(localStorage.getItem('walletrpc_lang')).toBe('zh-SG');
    });

    it('t 函数可以正确翻译嵌套路径或返回 key', () => {
        const { result } = renderHook(() => useTranslation(), { wrapper: LanguageProvider });
        // 测试缺失 key 返回路径
        const missingKey = 'non.existent.key';
        expect(result.current.t(missingKey)).toBe(missingKey);
    });

    it('localStorage.getItem 抛错时 safeLocalStorageGet 返回 null', () => {
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });

        const { result } = renderHook(() => useTranslation(), { wrapper: LanguageProvider });
        expect(result.current.language).toBe('en'); // fallback
        spy.mockRestore();
    });

    it('localStorage.setItem 抛错时 safeLocalStorageSet 忽略错误', () => {
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
        const { result } = renderHook(() => useTranslation(), { wrapper: LanguageProvider });

        act(() => {
            expect(() => result.current.setLanguage('zh-SG')).not.toThrow();
        });
        // 内存状态仍应更新
        expect(result.current.language).toBe('zh-SG');
        spy.mockRestore();
    });
});
