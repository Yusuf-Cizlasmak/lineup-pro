// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · FormBadge
// Son 5 maçtaki form gücünü göstergeli rozet olarak çizer.
//
// YENİ: form artık 0-100 değil, overall'a uygulanan delta (-3..+5).
// Rozette delta + effective rating (varsa baseRating) gösterilir.
// ─────────────────────────────────────────────────────────────
import React from "react";
import { t } from "./i18n";
import { getFormLabel, getEffectiveRating } from "./playerAttributes";

// form:        delta sayısı (-3..+5) ya da null
// baseRating:  oyuncunun overall'ı — verilirse "77 → 82" gibi etkin güç gösterilir
// size:        "sm" | "md" | "lg"
// showLabel:   true ise yazı da göster
// recentResults: ["W","D","L"] dizisi -- son maç sonuçları (en yeni ilk)
//                varsa yıldız çubuğu da çizer
export default function FormBadge({
  form,
  baseRating = null,
  size = "md",
  showLabel = true,
  recentResults = null,
}) {
  const meta = getFormLabel(form);
  const sz = size === "sm" ? { font: 11, pad: "3px 8px", icon: 13 }
           : size === "lg" ? { font: 15, pad: "8px 14px", icon: 22 }
           :                  { font: 12, pad: "5px 11px", icon: 16 };

  // Delta gösterim metni: "+5" / "−2" / "—"
  const deltaText = form == null
    ? "—"
    : (form > 0 ? `+${form}` : form < 0 ? `−${Math.abs(form)}` : "±0");

  // Etkin güç: baseRating verilirse hesapla
  const effective = baseRating != null && form != null
    ? getEffectiveRating(baseRating, form)
    : null;

  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      background: `${meta.color}14`,
      border: `1px solid ${meta.color}55`,
      borderRadius: 8,
      padding: sz.pad,
      fontFamily: "'DM Sans','Segoe UI',sans-serif",
    }}>
      <span style={{ fontSize: sz.icon, lineHeight: 1 }}>{meta.icon}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {showLabel && (
          <div style={{
            fontSize: sz.font - 2.5,
            color: "rgba(255,255,255,0.55)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            lineHeight: 1,
          }}>
            {t("form_title")}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{
            color: meta.color,
            fontSize: sz.font + 2,
            fontWeight: 800,
            fontFamily: "'JetBrains Mono', monospace",
            lineHeight: 1,
          }}>
            {deltaText}
          </span>
          {showLabel && (
            <span style={{
              fontSize: sz.font - 1,
              color: meta.color,
              fontWeight: 700,
              lineHeight: 1,
            }}>
              {t(meta.labelKey)}
            </span>
          )}
        </div>
        {/* Etkin güç satırı — opsiyonel */}
        {effective != null && baseRating !== effective && (
          <div style={{
            display: "flex",
            alignItems: "baseline",
            gap: 4,
            marginTop: 1,
          }}>
            <span style={{
              fontSize: sz.font - 3,
              color: "rgba(255,255,255,0.4)",
              fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace",
              textDecoration: "line-through",
              lineHeight: 1,
            }}>
              {baseRating}
            </span>
            <span style={{
              fontSize: sz.font - 3,
              color: "rgba(255,255,255,0.35)",
              lineHeight: 1,
            }}>
              →
            </span>
            <span style={{
              fontSize: sz.font - 1,
              color: meta.color,
              fontWeight: 800,
              fontFamily: "'JetBrains Mono', monospace",
              lineHeight: 1,
            }}>
              {effective}
            </span>
          </div>
        )}
      </div>

      {/* Son maç sonuç çubuğu — varsa */}
      {recentResults && recentResults.length > 0 && (
        <div style={{ display: "flex", gap: 3, marginLeft: 6 }}>
          {recentResults.slice(0, 5).map((r, i) => {
            const c = r === "W" ? "#22c55e" : r === "D" ? "#94a3b8" : "#ef4444";
            return (
              <div
                key={i}
                title={r}
                style={{
                  width: 12, height: 12,
                  borderRadius: 3,
                  background: `${c}55`,
                  border: `1px solid ${c}`,
                  color: c,
                  fontSize: 8,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {r}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}