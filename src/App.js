import React from 'react';
import { PremiumProvider } from './monetization';
import HalisahaKolik from './HaliSahaKolik';
export default function App() {
  return (
    <PremiumProvider>
      <HalisahaKolik />
    </PremiumProvider>
  );
}