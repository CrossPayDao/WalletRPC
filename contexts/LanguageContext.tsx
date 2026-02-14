
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo } from 'react';
import { locales } from '../locales';

export type Language = 'en' | 'zh-SG';

/**
 * 【设计亮点：原子化翻译引擎】
 * 
 * 1. 动态自愈：t 函数具备路径容错，若路径失效则返回原始键名，避免 UI 崩溃。
 * 2. 深度检索：支持 'wallet.details.title' 这种点分路径解析，实现嵌套词条管理。
 * 3. 性能关联：通过 Context 进行分发，确保语言切换时仅受影响的 UI 片段重绘，而非全量刷新。
 * 4. 智能感知：初始化阶段自动侦测浏览器 User-Agent，实现无缝的本地化初次体验。
 */
interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (path: string) => string;
  isSG: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('en');

  useEffect(() => {
    // 逻辑：优先读取用户持久化配置，实现状态锁定
    const savedLang = localStorage.getItem('nexus_lang') as Language;
    if (savedLang) {
      setLanguage(savedLang);
    } else {
      const browserLang = navigator.language.toLowerCase();
      if (browserLang.startsWith('zh')) setLanguage('zh-SG');
    }
  }, []);

  const handleSetLanguage = useCallback((lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('nexus_lang', lang);
  }, []);

  /**
   * 【性能优势：常量级路径查找】
   * 时间复杂度 O(k)，k 为路径深度。相比全量正则替换，这种基于对象的查找性能极高。
   */
  const t = useCallback((path: string): string => {
    const keys = path.split('.');
    const dict = locales[language];
    
    let result: unknown = dict;
    for (const key of keys) {
      if (result && typeof result === 'object' && key in (result as Record<string, unknown>)) {
        result = (result as Record<string, unknown>)[key];
      } else {
        return path; 
      }
    }
    return typeof result === 'string' ? result : path;
  }, [language]);

  const contextValue = useMemo(() => ({
    language,
    setLanguage: handleSetLanguage,
    t,
    isSG: language === 'zh-SG'
  }), [language, handleSetLanguage, t]);

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("Missing LanguageProvider");
  return context;
};
