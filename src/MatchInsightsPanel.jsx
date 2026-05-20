// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · MatchInsightsPanel
// ─────────────────────────────────────────────────────────────
// Rule-based insight engine'in çıktısını kart kart render eder.
// Kategoriler: Yıldızlar · Taktik · Trend
//
// Kullanım:
//   import MatchInsightsPanel from "./MatchInsightsPanel";
//   <MatchInsightsPanel match={match} history={allMatches} />
//
// Props:
//   - match    : Match object (zorunlu)
//   - history  : Match[] — bu maç DAHİL olabilir, otomatik filtreleniyor
//   - compact  : boolean — kompakt mod (modal içi için)
//   - maxPerCategory : number — kategori başına max insight (default 4)
// ─────────────────────────────────────────────────────────────
import React, { useMemo, useState } from "react";
import { computeMatchInsights, CATEGORY, SEVERITY, TYPE } from "./matchInsights";

// ═══════════════════════════════════════════════════════════
// PALET — uygulamanın geri kalanıyla tutarlı
// ═══════════════════════════════════════════════════════════
const C = {
  bg:        "#0a1118",
  card:      "rgba(255,255,255,0.025)",
  border:    "rgba(255,255,255,0.07)",
  borderHi:  "rgba(255,255,255,0.14)",
  ink:       "#f4f4f5",
  inkDim:    "rgba(244,244,245,0.62)",
  inkFaint:  "rgba(244,244,245,0.32)",
  primary:   "#10b981",
  gold:      "#fbbf24",
  blue:      "#60a5fa",
  red:       "#f87171",
  purple:    "#a78bfa",
};

// Tip-bazlı renk paleti
const TYPE_COLORS = {
  [TYPE.POSITIVE]: { accent: C.primary, soft: "rgba(16,185,129,0.10)",  border: "rgba(16,185,129,0.32)" },
  [TYPE.TACTICAL]: { accent: C.blue,    soft: "rgba(96,165,250,0.10)",  border: "rgba(96,165,250,0.32)" },
  [TYPE.TREND]:    { accent: C.purple,  soft: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.32)" },
  [TYPE.WARNING]:  { accent: C.gold,    soft: "rgba(251,191,36,0.10)",  border: "rgba(251,191,36,0.32)" },
};

const SEV_DOT = {
  [SEVERITY.HIGH]:   { size: 8, glow: true  },
  [SEVERITY.MEDIUM]: { size: 6, glow: false },
  [SEVERITY.LOW]:    { size: 5, glow: false },
};

// ═══════════════════════════════════════════════════════════
// INSIGHT CARD — tek bir içgörü kartı
// ═══════════════════════════════════════════════════════════
function InsightCard({ insight, delay = 0 }) {
  const T = TYPE_COLORS[insight.type] || TYPE_COLORS[TYPE.POSITIVE];
  const sev = SEV_DOT[insight.severity] || SEV_DOT[SEVERITY.MEDIUM];

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        gap: 12,
        padding: "12px 14px",
        background: `linear-gradient(135deg, ${T.soft} 0%, ${C.card} 60%)`,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        animation: `mipFadeIn 0.4s cubic-bezier(.2,.85,.3,1) both`,
        animationDelay: `${delay}s`,
        overflow: "hidden",
      }}
    >
      {/* Sol kenar şerit — kategori rengi */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 0, top: "18%", bottom: "18%",
          width: 3,
          background: `linear-gradient(180deg, ${T.accent}, ${T.accent}66 50%, ${T.accent})`,
          borderRadius: "0 2px 2px 0",
          boxShadow: `0 0 10px ${T.accent}66`,
        }}
      />

      {/* Icon hücresi */}
      <div
        style={{
          width: 40, height: 40,
          borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: `${T.accent}14`,
          border: `1px solid ${T.border}`,
          flexShrink: 0,
          fontSize: 20,
          lineHeight: 1,
        }}
      >
        {insight.icon}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          {/* Severity dot */}
          <span
            aria-hidden
            style={{
              width: sev.size, height: sev.size,
              borderRadius: "50%",
              background: T.accent,
              boxShadow: sev.glow ? `0 0 8px ${T.accent}` : "none",
              flexShrink: 0,
            }}
          />
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: C.ink,
              letterSpacing: 0.1,
              lineHeight: 1.2,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {insight.title}
          </div>
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: C.inkDim,
            lineHeight: 1.4,
            marginBottom: insight.evidence ? 6 : 0,
          }}
        >
          {insight.body}
        </div>

        {/* Evidence chips — küçük metrik etiketleri */}
        {insight.evidence && insight.evidence.metrics?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {insight.evidence.metrics.map((m, i) => (
              <span
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 7px",
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${C.border}`,
                  borderRadius: 5,
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: C.inkDim,
                  fontFamily: "'JetBrains Mono','SF Mono',monospace",
                  letterSpacing: 0.3,
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ color: C.inkFaint, textTransform: "uppercase" }}>{m.k}</span>
                <span style={{ color: T.accent, fontWeight: 900 }}>{m.v}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CATEGORY HEADER
// ═══════════════════════════════════════════════════════════
function CategoryHeader({ label, count, accent }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
        marginTop: 4,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 18, height: 1,
          background: accent,
        }}
      />
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: accent,
          letterSpacing: 2.4,
          fontFamily: "'JetBrains Mono','SF Mono',monospace",
        }}
      >
        {label}
      </span>
      <span
        aria-hidden
        style={{
          flex: 1, height: 1,
          background: `${accent}22`,
        }}
      />
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 800,
          color: C.inkFaint,
          fontFamily: "'JetBrains Mono','SF Mono',monospace",
          letterSpacing: 1,
        }}
      >
        {String(count).padStart(2, "0")}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EMPTY STATE — bir tek insight bile çıkmazsa
// ═══════════════════════════════════════════════════════════
function NoInsights({ compact }) {
  return (
    <div
      style={{
        padding: compact ? "16px 14px" : "26px 18px",
        background: C.card,
        border: `1px dashed ${C.border}`,
        borderRadius: 12,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 6, opacity: 0.4 }}>📊</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.inkDim }}>
        Henüz yeterli veri yok
      </div>
      <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 4, lineHeight: 1.5 }}>
        Maç eventlerini girdikçe burada akıllı içgörüler çıkacak.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN PANEL
// ═══════════════════════════════════════════════════════════
export default function MatchInsightsPanel({
  match,
  history = [],
  compact = false,
  maxPerCategory = 4,
}) {
  // Memo: aynı match + history için tekrar hesaplama yapma
  const insights = useMemo(() => {
    if (!match) return { stars: [], tactical: [], trend: [], all: [] };
    // Bu maç history'de varsa otomatik çıkar
    const cleanHistory = (history || []).filter(h => h.id !== match.id);
    return computeMatchInsights(match, cleanHistory);
  }, [match, history]);

  // "Daha fazla göster" state per category
  const [expanded, setExpanded] = useState({ stars: false, tactical: false, trend: false });

  if (!match) return null;

  const totalCount = insights.all.length;
  if (totalCount === 0) {
    return (
      <>
        <PanelStyles />
        <NoInsights compact={compact} />
      </>
    );
  }

  const sliceList = (list, cat) =>
    expanded[cat] ? list : list.slice(0, maxPerCategory);

  const visibleStars    = sliceList(insights.stars, "stars");
  const visibleTactical = sliceList(insights.tactical, "tactical");
  const visibleTrend    = sliceList(insights.trend, "trend");

  const renderCategory = (cat, label, accent, list, fullCount) => {
    if (fullCount === 0) return null;
    const cardDelay = (i) => 0.04 + i * 0.04;
    return (
      <section
        style={{
          marginBottom: compact ? 12 : 16,
        }}
      >
        <CategoryHeader label={label} count={fullCount} accent={accent} />
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {list.map((ins, i) => (
            <InsightCard
              key={ins.id + "_" + i}
              insight={ins}
              delay={cardDelay(i)}
            />
          ))}
          {fullCount > maxPerCategory && (
            <button
              onClick={() => setExpanded(s => ({ ...s, [cat]: !s[cat] }))}
              style={{
                marginTop: 2,
                padding: "8px 12px",
                background: "rgba(255,255,255,0.02)",
                border: `1px solid ${C.border}`,
                borderRadius: 9,
                color: C.inkDim,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              {expanded[cat]
                ? "↑ Daha az göster"
                : `↓ ${fullCount - maxPerCategory} insight daha`}
            </button>
          )}
        </div>
      </section>
    );
  };

  return (
    <div style={{ width: "100%", fontFamily: "'DM Sans','Inter Tight',sans-serif" }}>
      <PanelStyles />

      {/* Üst başlık — gri eyebrow + sayaç */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 14,
          paddingBottom: 10,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6, height: 6,
            borderRadius: "50%",
            background: C.primary,
            boxShadow: `0 0 8px ${C.primary}`,
          }}
        />
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 800,
            color: C.ink,
            letterSpacing: 0.2,
          }}
        >
          Maç Raporu
        </h3>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 9.5,
            fontWeight: 800,
            color: C.inkFaint,
            letterSpacing: 2,
            fontFamily: "'JetBrains Mono','SF Mono',monospace",
          }}
        >
          {totalCount} İÇGÖRÜ
        </span>
      </div>

      {renderCategory("stars",    "YILDIZLAR", C.primary, visibleStars,    insights.stars.length)}
      {renderCategory("tactical", "TAKTİK",    C.blue,    visibleTactical, insights.tactical.length)}
      {renderCategory("trend",    "TREND",     C.purple,  visibleTrend,    insights.trend.length)}

      {/* Disclaimer — şeffaf ol, otomatik analizden söz et */}
      <div
        style={{
          marginTop: 6,
          padding: "8px 12px",
          background: "rgba(255,255,255,0.02)",
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          fontSize: 10,
          color: C.inkFaint,
          textAlign: "center",
          fontFamily: "'JetBrains Mono','SF Mono',monospace",
          letterSpacing: 0.3,
          lineHeight: 1.5,
        }}
      >
        Otomatik analiz · Maç verisinden çıkarıldı
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STYLES (animations)
// ═══════════════════════════════════════════════════════════
function PanelStyles() {
  return (
    <style>{`
      @keyframes mipFadeIn {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `}</style>
  );
}