// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · Monetization (LEGACY ADAPTER)
// ─────────────────────────────────────────────────────────────
// Bu dosya geriye dönük uyumluluk için tutulmuştur.
// Premium kontrolü artık subscription.js üzerinden yapılır.
//
// Eski kod:   const { isPremium } = usePremium();
// Yeni kod:   const { isPremium } = useSubscription();
//
// Bu adapter eski importları çalışır halde tutar — yeni özellikler için
// doğrudan ./subscription kullan.
// ─────────────────────────────────────────────────────────────
import React, { createContext, useContext } from 'react';
import { useSubscription } from './subscription';

const PremiumContext = createContext({ isPremium: false });

export const PremiumProvider = ({ children }) => {
  // ★ FIX: gerçek subscription state'inden oku — eski "her zaman false" davranışı
  // premium satın alan kullanıcıların yine free görünmesine yol açıyordu.
  const { isPremium } = useSubscription();
  return (
    <PremiumContext.Provider value={{ isPremium }}>
      {children}
    </PremiumContext.Provider>
  );
};

export const usePremium = () => useContext(PremiumContext);