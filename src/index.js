import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { tryNativeRedirect } from './deepLink';

// ★ ÖNEMLİ: React mount edilmeden ÖNCE çağrılır.
// Mobile cihazda davet kodu varsa, React tree mount edilmeden
// native uygulamayı tetikler (window.location.replace).
//
// Server-side Worker zaten ekranı göstermeden redirect yapar;
// bu satır, Worker'ın yetişemediği durumlar için (eski URL'ler,
// cache, in-app browsers vb.) client-side fallback olarak çalışır.
tryNativeRedirect();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();