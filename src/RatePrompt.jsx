// ─────────────────────────────────────────────────────────────
// Rate Prompt — 3. açılışta gösterilir.
// iOS'ta SKStoreReviewController (App Store içinde dialog).
// Web/desktop fallback: doğrudan App Store sayfasını aç.
// ─────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { t } from "./i18n";

const RATED_KEY = "halisaha_rated";
const APPSTORE_URL = "itms-apps://itunes.apple.com/app/id0000000000?action=write-review";
// ★ App Store'a yayınlandıktan sonra yukarıdaki id'yi gerçek App ID ile değiştir.
//   (App Store Connect > App Information > Apple ID alanından alınır.)

export default function RatePrompt({ onClose }) {
  const [closing, setClosing] = useState(false);

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 220);
  };

  const handleRate = async () => {
    localStorage.setItem(RATED_KEY, "1");
    if (Capacitor.isNativePlatform()) {
      // Native iOS: SKStoreReviewController plugin'i (varsa) veya doğrudan link
      try {
        const mod = await import("@capacitor-community/in-app-review");
        if (mod?.InAppReview?.requestReview) {
          await mod.InAppReview.requestReview();
          close();
          return;
        }
      } catch {}
      // Fallback: store sayfasını aç
      try {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: APPSTORE_URL });
      } catch {
        window.open(APPSTORE_URL, "_blank");
      }
    } else {
      window.open(APPSTORE_URL, "_blank");
    }
    close();
  };

  const handleLater = () => close();

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 6000,
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        opacity: closing ? 0 : 1,
        transition: "opacity 0.22s",
        fontFamily: "'DM Sans','Segoe UI',sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(160deg,#111318,#0c1117)",
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,0.08)",
          width: "100%",
          maxWidth: 360,
          padding: "28px 22px 22px",
          textAlign: "center",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          color: "#e2e8f0",
          transform: closing ? "scale(0.95)" : "scale(1)",
          transition: "transform 0.22s",
        }}
      >
        {/* Stars row */}
        <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 18 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                fontSize: 32,
                color: "#fbbf24",
                animation: `starPop 0.4s ${i * 0.06}s both`,
                filter: "drop-shadow(0 4px 12px rgba(251,191,36,0.5))",
              }}
            >
              ⭐
            </div>
          ))}
        </div>
        <style>{`
          @keyframes starPop {
            0% { opacity: 0; transform: scale(0.4) rotate(-30deg) }
            70% { transform: scale(1.15) rotate(8deg) }
            100% { opacity: 1; transform: scale(1) rotate(0deg) }
          }
        `}</style>

        <h3 style={{ fontSize: 19, fontWeight: 700, margin: 0, marginBottom: 10 }}>
          {t("rate_title")}
        </h3>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "rgba(255,255,255,0.55)", margin: 0, marginBottom: 22 }}>
          {t("rate_desc")}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={handleRate}
            style={{
              padding: "13px",
              borderRadius: 11,
              border: "none",
              background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
              color: "#78350f",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: 0.3,
              boxShadow: "0 8px 24px rgba(251,191,36,0.35)",
            }}
          >
            {t("rate_yes")}
          </button>
          <button
            onClick={handleLater}
            style={{
              padding: "11px",
              borderRadius: 11,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.65)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t("rate_later")}
          </button>
        </div>
      </div>
    </div>
  );
}