// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · AIModeSheet — AI Modu seçim ekranı
// ─────────────────────────────────────────────────────────────
// İki dağıtım modu sunar:
//   "split" → A & B Takımına Böl   (tüm havuzu iki dengeli kadroya ayırır,
//                                    saha düzenine dokunmaz)
//   "field" → Sahaya Dağıt          (tüm havuzu dengeler + mevkilere yerleştirir)
//
// Props:
//   poolSize  : number          — toplam oyuncu (bilgi rozeti)
//   onSelect  : (mode) => void  — "split" | "field"
//   onClose   : () => void
// ─────────────────────────────────────────────────────────────
import React from "react";
import { hapticLight, hapticMedium } from "./haptics";

const C = {
  ink: "#f4f4f5", inkDim: "rgba(244,244,245,0.58)", inkFaint: "rgba(244,244,245,0.3)",
  line: "rgba(255,255,255,0.08)", lineHi: "rgba(255,255,255,0.15)",
  bg: "#06090e", surface: "#0a1118", surfaceHi: "#0d1620",
  primary: "#10b981", gold: "#fbbf24",
};

function ModeCard({ tag, title, desc, accent, adBadge, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 13,
      padding: "15px 15px", borderRadius: 14, cursor: "pointer",
      background: `linear-gradient(135deg, ${accent}16, ${accent}04)`,
      border: `1px solid ${accent}3a`,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 11, flexShrink: 0, display: "grid", placeItems: "center",
        background: `${accent}1e`, border: `1px solid ${accent}40`,
        fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 0.5, color: accent,
      }}>{tag}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 0.6, color: C.ink }}>{title}</span>
          {adBadge && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5,
              color: C.gold, background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)",
              borderRadius: 5, padding: "2px 5px", whiteSpace: "nowrap",
            }}>▶ 1 REKLAM</span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: C.inkDim, marginTop: 2, lineHeight: 1.35 }}>{desc}</div>
      </div>
      <div style={{ color: `${accent}88`, transform: "rotate(-90deg)", flexShrink: 0, fontSize: 13 }}>▾</div>
    </button>
  );
}

export default function AIModeSheet({ poolSize = 0, showAdBadge = true, onSelect, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 9200, background: "rgba(2,4,8,0.78)",
      backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 520, background: C.bg,
        borderTopLeftRadius: 22, borderTopRightRadius: 22,
        border: `1px solid ${C.lineHi}`, borderBottom: "none", overflow: "hidden",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}>
        <div style={{ padding: "16px 18px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center",
              background: `${C.primary}1e`, border: `1px solid ${C.primary}40`,
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: 1, color: C.primary,
            }}>AI</div>
            <div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 1, color: C.ink, lineHeight: 1 }}>AI MODU</div>
              <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>{poolSize} oyuncu havuzda</div>
            </div>
          </div>
          <button onClick={() => { hapticLight(); onClose(); }} style={{
            width: 32, height: 32, borderRadius: 9, background: C.surface,
            border: `1px solid ${C.line}`, color: C.inkDim, fontSize: 17, cursor: "pointer",
          }}>×</button>
        </div>

        <div style={{ padding: "8px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <ModeCard
            tag="A·B"
            accent={C.primary}
            adBadge={showAdBadge}
            title="A & B TAKIMINA BÖL"
            desc="Tüm oyuncuları güce göre iki dengeli kadroya ayırır. Saha dizilişine dokunmaz."
            onClick={() => { hapticMedium(); onSelect("split"); }}
          />
          <ModeCard
            tag="SAHA"
            accent={C.gold}
            adBadge={showAdBadge}
            title="SAHAYA DAĞIT"
            desc="Tüm oyuncuları dengeler ve mevkilere göre sahaya yerleştirir. Kaleci ve mevki mantığıyla."
            onClick={() => { hapticMedium(); onSelect("field"); }}
          />
        </div>
      </div>
    </div>
  );
}