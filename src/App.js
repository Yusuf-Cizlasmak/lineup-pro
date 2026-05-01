import React, { useEffect, useState } from "react";
import { PremiumProvider } from "./monetization";
import HalisahaKolik from "./HaliSahaKolik";
import Onboarding from "./Onboarding";
import RatePrompt from "./RatePrompt";
import Tour from "./Tour";

const ONBOARDING_KEY = "halisaha_onboarded";
const LAUNCH_COUNT_KEY = "halisaha_launch_count";
const RATED_KEY = "halisaha_rated";

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showRate, setShowRate] = useState(false);
  const [tourActive, setTourActive] = useState(false); // ★ Ana tur (takım kurulum)
  const [matchEndTourActive, setMatchEndTourActive] = useState(false); // ★ Maç bitir mini-tour

  useEffect(() => {
    // ── Onboarding kontrolü ──
    const onboarded = localStorage.getItem(ONBOARDING_KEY) === "1";
    if (!onboarded) setShowOnboarding(true);

    // ── Launch count + rate prompt ──
    let count = parseInt(localStorage.getItem(LAUNCH_COUNT_KEY) || "0", 10) || 0;
    count += 1;
    localStorage.setItem(LAUNCH_COUNT_KEY, String(count));
    const alreadyRated = localStorage.getItem(RATED_KEY) === "1";

    const shouldShow =
      !alreadyRated &&
      onboarded &&
      (count === 3 || (count > 3 && (count - 3) % 10 === 0));

    if (shouldShow) {
      setTimeout(() => setShowRate(true), 1500);
    }

    // ★ Ayarlardan "Tanıtımı tekrar göster"
    const onReplay = () => setShowOnboarding(true);
    window.addEventListener("halisaha:replay-onboarding", onReplay);

    // ★ HaliSahaKolik'ten gelen tur başlatma sinyali (ana tur)
    const onStartTour = () => setTourActive(true);
    window.addEventListener("halisaha:start-tour", onStartTour);

    // ★ Maç bitir mini-tur sinyali — kadrolar tamamlandığında tetiklenir
    const onStartMatchEndTour = () => setMatchEndTourActive(true);
    window.addEventListener("halisaha:start-match-end-tour", onStartMatchEndTour);

    return () => {
      window.removeEventListener("halisaha:replay-onboarding", onReplay);
      window.removeEventListener("halisaha:start-tour", onStartTour);
      window.removeEventListener("halisaha:start-match-end-tour", onStartMatchEndTour);
    };
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
      {/* ★ Ana Tour instance — takım kurulum akışı */}
      <Tour active={tourActive} onFinish={() => setTourActive(false)} mode="main" />
      {/* ★ Maç-Bitir mini Tour instance — sadece maç hazır olunca tetiklenir */}
      <Tour active={matchEndTourActive} onFinish={() => setMatchEndTourActive(false)} mode="matchEnd" />
    </PremiumProvider>
  );
}