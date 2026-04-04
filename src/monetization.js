import React, { createContext, useContext } from 'react';

const PremiumContext = createContext({ isPremium: false });

export const PremiumProvider = ({ children }) => {
  return (
    <PremiumContext.Provider value={{ isPremium: false }}>
      {children}
    </PremiumContext.Provider>
  );
};

export const usePremium = () => useContext(PremiumContext);