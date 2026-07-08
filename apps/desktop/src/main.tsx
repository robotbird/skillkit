import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n';
import { ThemeSync } from './lib/useTheme';
import './styles/theme.css';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <ThemeSync />
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
