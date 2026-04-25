import React, { useEffect, useState } from "react";
import { PremiumProvider } from "./monetization";
import HalisahaKolik from "./HaliSahaKolik";
import Onboarding from "./Onboarding";
import RatePrompt from "./RatePrompt";

const ONBOARDING_KEY = "halisaha_onboarded";
const LAUNCH_COUNT_KEY = "halisaha_launch_count";
const RATED_KEY = "halisaha_rated";

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showRate, setShowRate] = useState(false);

  useEffect(() => {
    // ── Onboarding kontrolü ──
    const onboarded = localStorage.getItem(ONBOARDING_KEY) === "1";
    if (!onboarded) setShowOnboarding(true);

    // ── Launch count + rate prompt ──
    let count = parseInt(localStorage.getItem(LAUNCH_COUNT_KEY) || "0", 10) || 0;
    count += 1;
    localStorage.setItem(LAUNCH_COUNT_KEY, String(count));
    const alreadyRated = localStorage.getItem(RATED_KEY) === "1";

    // İlk olarak 3. açılışta, sonra değerlendirmediyse her 10'da bir tekrar sor
    // 3, 13, 23, 33, ...
    const shouldShow =
      !alreadyRated &&
      onboarded &&
      (count === 3 || (count > 3 && (count - 3) % 10 === 0));

    if (shouldShow) {
      // Kısa gecikme — kullanıcı uygulamaya yerleşsin
      setTimeout(() => setShowRate(true), 1500);
    }

    // ★ Ayarlardan "Tanıtımı tekrar göster"
    const onReplay = () => setShowOnboarding(true);
    window.addEventListener("halisaha:replay-onboarding", onReplay);
    return () => window.removeEventListener("halisaha:replay-onboarding", onReplay);
  }, []);

  const finishOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    setShowOnboarding(false);
  };

  return (
    <PremiumProvider>
      <HalisahaKolik />
      {showOnboarding && <Onboarding onFinish={finishOnboarding} />}
      {showRate && <RatePrompt onClose={() => setShowRate(false)} />}
    </PremiumProvider>
  );
}