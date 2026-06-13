import { useState, useEffect } from 'react';
import { Language, translations } from '../i18n/translations';

export const useLanguage = () => {
  const [language, setLanguage] = useState<Language>('en');

  useEffect(() => {
    // Load from local storage or default to English
    const storedLang = localStorage.getItem('app-language') as Language;
    if (storedLang) {
      setLanguage(storedLang);
    }
  }, []);

  useEffect(() => {
    // Handle direction changes based on language
    const dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
    
    // Save preference
    localStorage.setItem('app-language', language);
  }, [language]);

  const t = translations[language];

  return { language, setLanguage, t };
};