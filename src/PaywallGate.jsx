// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · PaywallGate
// ─────────────────────────────────────────────────────────────
// Kullanım:
//   <PaywallGate feature="cloud_sync" />   // engelleme paneli
//   <PaywallGate inline title="..." />     // satır içi mini banner
// ─────────────────────────────────────────────────────────────
import React from "react";
import { useSubscription } from "./subscription";
import { hapticMedium } from "./haptics";

const FEATURE_INFO = {
  cloud_sync:        { icon: "☁️", title: "Bulut Senkronu",    desc: "Telefon değiştirsen bile tüm verilerin saklı kalır." },
  unlimited_online:  { icon: "⚡", title: "Sınırsız Online",     desc: "Sınırsız oda kur, sınırsız maça katıl — kısıtlama yok." },
  unlimited_history: { icon: "📊", title: "Sınırsız Geçmiş",     desc: "Tüm maç geçmişini ve istatistiklerini saklar." },
  no_ads:            { icon: "🚫", title: "Reklamsız Deneyim",   desc: "Banner ve geçiş reklamları kalksın." },
  multi_team:        { icon: "🛡",  title: "Sınırsız Takım",      desc: "İstediğin kadar takım kur ve yönet." },
  brand_team:        { icon: "🎨", title: "Takım Brand'i",       desc: "Logo, sponsor metni, özel renkler — paylaşımlarda görünsün." },
  general:           { icon: "⭐", title: "Premium Özellik",     desc: "Bu özellik Pro üyeler içindir." },
};

export default function PaywallGate({ feature = "general", inline = false, style = {} }) {
  const { openPaywall } = useSubscription();
  const info = FEATURE_INFO[feature] || FEATURE_INFO.general;

  if (inline) {
    return (
      <button
        onClick={() => { hapticMedium(); openPaywall(feature); }}
        style={{
          width: "100%",
          padding: "10px 14px",
          background: "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(251,191,36,0.04))",
          border: "1px solid rgba(251,191,36,0.4)",
          borderRadius: 10,
          color: "#fbbf24",
          fontSize: 12.5,
          fontWeight: 700,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: "'DM Sans', sans-serif",
          ...style,
        }}
      >
        <span style={{ fontSize: 16 }}>{info.icon}</span>
        <span style={{ flex: 1, textAlign: "left" }}>{info.title}</span>
        <span style={{
          fontSize: 9, fontWeight: 900, letterSpacing: 1,
          background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
          color: "#0a1628",
          padding: "2px 6px", borderRadius: 4,
          fontFamily: "'JetBrains Mono', monospace",
        }}>★ PRO</span>
      </button>
    );
  }

  return (
    <div
      onClick={() => { hapticMedium(); openPaywall(feature); }}
      style={{
        position: "relative",
        padding: "28px 22px",
        background: "linear-gradient(135deg, rgba(251,191,36,0.10) 0%, rgba(20,30,42,0.6) 60%, rgba(96,165,250,0.08) 100%)",
        border: "1px solid rgba(251,191,36,0.35)",
        borderRadius: 18,
        textAlign: "center",
        cursor: "pointer",
        overflow: "hidden",
        boxShadow: "0 14px 36px rgba(0,0,0,0.45), 0 0 22px rgba(251,191,36,0.12)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        fontFamily: "'DM Sans', sans-serif",
        ...style,
      }}
    >
      {/* Halo */}
      <span aria-hidden style={{
        position: "absolute", top: -50, left: "50%", transform: "translateX(-50%)",
        width: 200, height: 100, borderRadius: "50%",
        background: "radial-gradient(ellipse, rgba(251,191,36,0.32), transparent 70%)",
        filter: "blur(20px)",
        pointerEvents: "none",
      }} />
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 44, marginBottom: 8, filter: "drop-shadow(0 4px 10px rgba(251,191,36,0.4))" }}>
          {info.icon}
        </div>
        <div style={{
          display: "inline-block",
          fontSize: 9.5, fontWeight: 900, letterSpacing: 2,
          background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
          color: "#0a1628",
          padding: "3px 10px", borderRadius: 5,
          marginBottom: 10,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          ★ PRO ÖZELLİĞİ
        </div>
        <h3 style={{
          margin: 0, fontSize: 18, fontWeight: 800, color: "#fff",
          letterSpacing: -0.2,
        }}>
          {info.title}
        </h3>
        <p style={{
          margin: "6px 0 16px", fontSize: 13, lineHeight: 1.5,
          color: "rgba(255,255,255,0.65)",
        }}>
          {info.desc}
        </p>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "10px 18px",
          background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
          color: "#0a1628",
          borderRadius: 10,
          fontSize: 13, fontWeight: 800,
          letterSpacing: 0.4,
          boxShadow: "0 8px 20px rgba(251,191,36,0.35)",
        }}>
          ⭐ Pro'ya Geç →
        </div>
      </div>
    </div>
  );
}