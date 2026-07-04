import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const urlLanguage = new URLSearchParams(window.location.search).get('lang');
const initialLanguage = ['zh', 'en'].includes(urlLanguage) ? urlLanguage : 'zh';

i18n
  .use(initReactI18next)
  .init({
    lng: initialLanguage,
    fallbackLng: 'zh',
    supportedLngs: ['zh', 'en'],
    resources: {
      zh: { translation: {} },
      en: { translation: {} },
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
