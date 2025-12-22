
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { en } from '../locales/en';
import { zhSG } from '../locales/zh-SG';

export type Language = 'en' | 'zh-SG';

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
    const savedLang = localStorage.getItem('nexus_lang') as Language;
    if (savedLang) {
      setLanguage(savedLang);
    } else {
      const browserLang = navigator.language.toLowerCase();
      if (browserLang.startsWith('zh')) {
        setLanguage('zh-SG');
      } else {
        setLanguage('en');
      }
    }
  }, []);

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('nexus_lang', lang);
  };

  const t = (path: string) => {
    const [module, key] = path.split('.');
    const dict = language === 'zh-SG' ? zhSG : en;
    // @ts-ignore
    return dict[module]?.[key] || path;
  };

  return (
    <LanguageContext.Provider value={{ 
      language, 
      setLanguage: handleSetLanguage, 
      t, 
      isSG: language === 'zh-SG' 
    }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("Missing LanguageProvider");
  return context;
};
