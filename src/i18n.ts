import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zh from './locales/zh.json';

const urlLanguage = new URLSearchParams(window.location.search).get('lang');
const initialLanguage: 'zh' | 'en' = urlLanguage === 'en' || urlLanguage === 'zh' ? urlLanguage : 'zh';

i18n
  .use(initReactI18next)
  .init({
    lng: initialLanguage,
    fallbackLng: 'zh',
    supportedLngs: ['zh', 'en'],
    resources: {
      zh: { translation: zh },
      en: { translation: en },
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
