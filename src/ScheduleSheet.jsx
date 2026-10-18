// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · ScheduleSheet — Haftalık maç planı (gün / saat / saha)
// ─────────────────────────────────────────────────────────────
// App.js'te mount edilir; window "halisaha:open-schedule" ile açılır.
// Kaydedince:
//   • matchSchedule.setSchedule → "halisaha:schedule-changed"
//   • track(SCHEDULE_SET { weekday, hour })
//   • bildirim planı yeniden hesaplanır
//   • "halisaha:ask-notif-permission" { context: "schedule" } → ön-izin ekranı
//
// Ayrıca ortak alt-sayfa iskeleti (SheetShell) ve reklam bandı koruması
// (useBannerHidden) buradan export edilir → KasaSheet / NotifPermissionPrompt.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { hapticLight, hapticMedium, hapticSelection, hapticSuccess } from "./haptics";
import { hideBanner, showBanner } from "./admob";
import { track, EVENTS } from "./analytics";
import {
  getSchedule, setSchedule, suggestScheduleFromHistory, formatSchedule,
  nextMatchDate, countdownLabel, perHeadFee, parseTime,
  DEFAULT_SCHEDULE, WEEKDAY_ORDER, WEEKDAY_SHORT, WEEKDAY_NAMES,
} from "./matchSchedule";
import { refreshNotifications } from "./notifications";

// ═══ PALET (ModeSelectScreen / AIModeSheet ile aynı) ═══
export const SC = {
  bg: "#06090e",
  surface: "#0a1118",
  surfaceHi: "#0d1620",
  ink: "#f4f4f5",
  inkDim: "rgba(244,244,245,0.62)",
  inkFaint: "rgba(244,244,245,0.36)",
  line: "rgba(255,255,255,0.08)",
  lineHi: "rgba(255,255,255,0.15)",
  primary: "#10b981",
  primaryDim: "#059669",
  gold: "#fbbf24",
  blue: "#60a5fa",
  red: "#ef4444",
};

// ═══ REKLAM BANDI KORUMASI ═══
// Native banner WebView'in altına biner → alt sayfa açıkken gizle.
// Kapanınca sadece ana ekrandaysak (mod kartları görünüyorsa) geri göster.
export function useBannerHidden(open) {
  useEffect(() => {
    if (!open) return undefined;
    hideBanner().catch(() => {});
    return () => {
      setTimeout(() => {
        try {
          const onHome = !!document.querySelector('[data-tour="mode-match"]');
          if (onHome && window.__onboardingActive !== true) showBanner().catch(() => {});
        } catch {}
      }, 250);
    };
  }, [open]);
}

// ═══ "Ekranda başka modal var mı?" — basit sezgisel kontrol ═══
// Tam ekranı kaplayan, z-index ≥ 1000, tıklanabilir sabit katman → modal açık say.
// (Maç sonucu modalı, ayarlar, tour, onboarding … hepsi bu kalıpta.)
export function isOverlayOpen() {
  try {
    const vw = window.innerWidth || 360;
    const vh = window.innerHeight || 640;
    const nodes = document.querySelectorAll('div[style*="position: fixed"]');
    for (const el of nodes) {
      const cs = window.getComputedStyle(el);
      const z = parseInt(cs.zIndex, 10) || 0;
      if (z < 1000) continue;
      if (cs.display === "none" || cs.visibility === "hidden" || cs.pointerEvents === "none") continue;
      if (parseFloat(cs.opacity || "1") === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width >= vw * 0.9 && r.height >= vh * 0.6) return true;
    }
  } catch {}
  return window.__onboardingActive === true;
}

// UI sakinleşince (modal kapanınca) çalıştır. İptal fonksiyonu döner.
export function whenUiCalm(fn, { initialDelay = 1500, interval = 900, maxWait = 10 * 60 * 1000 } = {}) {
  const started = Date.now();
  let timer = null;
  let cancelled = false;
  const tick = () => {
    if (cancelled) return;
    if (!isOverlayOpen()) { fn(); return; }
    if (Date.now() - started > maxWait) return; // çok uzun sürdü → vazgeç
    timer = setTimeout(tick, interval);
  };
  timer = setTimeout(tick, initialDelay);
  return () => { cancelled = true; clearTimeout(timer); };
}

// ═══ ORTAK ALT-SAYFA İSKELETİ ═══
export function SheetShell({ open, onClose, eyebrow, title, subtitle, icon, zIndex = 9300, children, footer }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!open) { setShown(false); return undefined; }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [open]);
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex,
        background: "rgba(2,4,8,0.78)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        opacity: shown ? 1 : 0, transition: "opacity 0.18s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, maxHeight: "90vh",
          display: "flex", flexDirection: "column",
          background: SC.bg, color: SC.ink,
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          border: `1px solid ${SC.lineHi}`, borderBottom: "none",
          fontFamily: "'DM Sans','Inter','Segoe UI',sans-serif",
          transform: shown ? "translateY(0)" : "translateY(24px)",
          transition: "transform 0.24s cubic-bezier(.2,.85,.3,1)",
          boxShadow: "0 -20px 50px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 9 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.14)" }} />
        </div>
        <div style={{ padding: "10px 18px 8px", display: "flex", alignItems: "center", gap: 10 }}>
          {icon && (
            <div style={{
              width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0,
              background: `${SC.primary}1e`, border: `1px solid ${SC.primary}40`, fontSize: 17,
            }}>{icon}</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {eyebrow && (
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: 2, color: SC.primary }}>
                {eyebrow}
              </div>
            )}
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 23, letterSpacing: 0.8, lineHeight: 1.05 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11.5, color: SC.inkFaint, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button
            onClick={() => { hapticLight(); onClose(); }}
            aria-label="Kapat"
            style={{
              width: 34, height: 34, borderRadius: 10, background: SC.surface, flexShrink: 0,
              border: `1px solid ${SC.line}`, color: SC.inkDim, fontSize: 18, cursor: "pointer",
            }}
          >×</button>
        </div>
        <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 16px 14px" }}>
          {children}
        </div>
        {footer && (
          <div style={{
            padding: "10px 16px", paddingBottom: "max(14px, env(safe-area-inset-bottom))",
            borderTop: `1px solid ${SC.line}`, background: SC.bg,
          }}>
            {footer}
          </div>
        )}
        {!footer && <div style={{ height: "max(10px, env(safe-area-inset-bottom))" }} />}
      </div>
    </div>
  );
}

// ═══ KÜÇÜK PARÇALAR ═══
export const fieldLabel = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: 1.4, color: SC.inkFaint,
  fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", margin: "14px 2px 7px",
};
// iOS'ta odaklanınca zoom olmasın diye 16px
export const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "12px 13px", borderRadius: 11,
  background: SC.surface, border: `1px solid ${SC.line}`, color: SC.ink,
  fontSize: 16, fontFamily: "inherit", outline: "none",
};
export const primaryBtn = {
  width: "100%", padding: "14px 16px", borderRadius: 12, border: "none", cursor: "pointer",
  background: `linear-gradient(135deg, ${SC.primary}, ${SC.primaryDim})`, color: "#06140e",
  fontSize: 14, fontWeight: 800, letterSpacing: 0.3, fontFamily: "inherit",
  boxShadow: "0 8px 22px rgba(16,185,129,0.28), inset 0 1px 0 rgba(255,255,255,0.18)",
};
export const ghostBtn = {
  width: "100%", padding: "12px 14px", borderRadius: 12, cursor: "pointer",
  background: "rgba(255,255,255,0.03)", border: `1px solid ${SC.line}`, color: SC.inkDim,
  fontSize: 13, fontWeight: 700, fontFamily: "inherit",
};

function Chip({ active, onClick, children, wide }) {
  return (
    <button
      type="button"
      onClick={() => { hapticSelection(); onClick(); }}
      style={{
        flex: wide ? 1 : "0 0 auto", minWidth: 0, padding: "10px 0", borderRadius: 10, cursor: "pointer",
        minHeight: 40,
        background: active ? `${SC.primary}22` : SC.surface,
        border: `1px solid ${active ? `${SC.primary}88` : SC.line}`,
        color: active ? SC.primary : SC.inkDim,
        fontSize: 13, fontWeight: 800, fontFamily: "inherit",
      }}
    >{children}</button>
  );
}

// ═══════════════════════════════════════════════════════════
// SCHEDULE SHEET
// ═══════════════════════════════════════════════════════════
export default function ScheduleSheet() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(DEFAULT_SCHEDULE);
  const [hasExisting, setHasExisting] = useState(false);
  const [hint, setHint] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [feeText, setFeeText] = useState("");

  useBannerHidden(open);

  useEffect(() => {
    const onOpen = () => {
      const existing = getSchedule();
      const suggestion = existing ? null : suggestScheduleFromHistory();
      const base = existing || suggestion || DEFAULT_SCHEDULE;
      setDraft({ ...DEFAULT_SCHEDULE, ...base });
      setFeeText(base.fee ? String(base.fee) : "");
      setHasExisting(!!existing);
      setHint(suggestion
        ? `Geçmiş maçlarına göre önerildi: ${WEEKDAY_NAMES[suggestion.weekday]} ${suggestion.time}`
        : "");
      setConfirmRemove(false);
      setOpen(true);
    };
    // Uzak push vb. "halisaha:navigate" { route: "schedule" } gönderirse de aç (tolerans)
    const onNavigate = (e) => { if (e?.detail?.route === "schedule") onOpen(); };
    window.addEventListener("halisaha:open-schedule", onOpen);
    window.addEventListener("halisaha:navigate", onNavigate);
    return () => {
      window.removeEventListener("halisaha:open-schedule", onOpen);
      window.removeEventListener("halisaha:navigate", onNavigate);
    };
  }, []);

  const close = () => setOpen(false);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const fee = Math.max(0, parseInt(String(feeText).replace(/\D/g, ""), 10) || 0);
  const preview = { ...draft, fee };
  const next = nextMatchDate(new Date(), preview);
  const perHead = perHeadFee(fee, draft.playerCount);

  const handleSave = () => {
    hapticSuccess();
    const saved = setSchedule({ ...draft, fee });
    if (!saved) return;
    track(EVENTS.SCHEDULE_SET, { weekday: saved.weekday, hour: parseTime(saved.time).h });
    refreshNotifications("schedule").catch(() => {});
    setOpen(false);
    // Değer anı: plan kuruldu → hatırlatma izni (zaten verildiyse prompt kendini göstermez)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("halisaha:ask-notif-permission", { detail: { context: "schedule" } }));
    }, 420);
  };

  const handleRemove = () => {
    if (!confirmRemove) { hapticMedium(); setConfirmRemove(true); return; }
    hapticMedium();
    setSchedule(null);
    refreshNotifications("schedule_removed").catch(() => {});
    setOpen(false);
  };

  return (
    <SheetShell
      open={open}
      onClose={close}
      icon="📅"
      eyebrow="HAFTALIK MAÇ"
      title="MAÇ GÜNÜ & SAATİ"
      subtitle="Kadro, takımlar ve skor için zamanında hatırlatırım."
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={handleSave} style={primaryBtn}>
            {hasExisting ? "Planı güncelle" : "Kaydet ve hatırlat"}
          </button>
          {hasExisting && (
            <button
              onClick={handleRemove}
              style={{
                ...ghostBtn,
                color: confirmRemove ? SC.red : SC.inkDim,
                borderColor: confirmRemove ? `${SC.red}66` : SC.line,
              }}
            >
              {confirmRemove ? "Emin misin? Hatırlatmalar da kapanır" : "Planı kaldır"}
            </button>
          )}
        </div>
      }
    >
      {/* Özet şeridi */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: 12,
        background: `linear-gradient(135deg, ${SC.primary}14, ${SC.primary}04)`, border: `1px solid ${SC.primary}33`,
      }}>
        <span style={{ fontSize: 18 }}>⏰</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {formatSchedule(preview)}
          </div>
          <div style={{ fontSize: 11, color: SC.inkDim, marginTop: 1 }}>
            Sıradaki maç: {next ? `${next.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })} · ${countdownLabel(next)}` : "—"}
          </div>
        </div>
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: SC.blue, margin: "8px 2px 0" }}>✨ {hint}</div>
      )}

      {/* Gün */}
      <div style={fieldLabel}>Gün</div>
      <div style={{ display: "flex", gap: 5 }}>
        {WEEKDAY_ORDER.map((wd) => (
          <Chip key={wd} wide active={draft.weekday === wd} onClick={() => set({ weekday: wd })}>
            {WEEKDAY_SHORT[wd]}
          </Chip>
        ))}
      </div>

      {/* Saat + süre */}
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={fieldLabel}>Saat</div>
          <input
            type="time"
            value={draft.time}
            onChange={(e) => set({ time: e.target.value || "21:00" })}
            style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, minHeight: 46 }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={fieldLabel}>Süre</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[60, 90].map((m) => (
              <Chip key={m} wide active={draft.durationMin === m} onClick={() => set({ durationMin: m })}>
                {m} dk
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {/* Saha */}
      <div style={fieldLabel}>Saha adı</div>
      <input
        type="text"
        value={draft.pitch}
        maxLength={60}
        onChange={(e) => set({ pitch: e.target.value })}
        placeholder="Örn. Yıldız Halı Saha"
        style={inputStyle}
      />

      {/* Kişi sayısı */}
      <div style={fieldLabel}>Kişi sayısı</div>
      <div style={{ display: "flex", gap: 6 }}>
        {[10, 12, 14, 16].map((n) => (
          <Chip key={n} wide active={draft.playerCount === n} onClick={() => set({ playerCount: n })}>
            {n} kişi
          </Chip>
        ))}
      </div>

      {/* Ücret */}
      <div style={fieldLabel}>Saha ücreti (toplam) · opsiyonel</div>
      <div style={{ position: "relative" }}>
        <input
          type="text"
          inputMode="numeric"
          value={feeText}
          onChange={(e) => setFeeText(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="Örn. 1400"
          style={{ ...inputStyle, paddingRight: 40 }}
        />
        <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: SC.inkFaint, fontWeight: 700 }}>₺</span>
      </div>
      {fee > 0 && (
        <div style={{ fontSize: 11.5, color: SC.gold, margin: "7px 2px 0" }}>
          💰 {draft.playerCount} kişiyle kişi başı ≈ {perHead}₺ · maçtan sonra Kasa'da kim ödedi takip edilir
        </div>
      )}

      {/* IBAN */}
      <div style={fieldLabel}>IBAN · opsiyonel</div>
      <input
        type="text"
        value={draft.iban}
        maxLength={42}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => set({ iban: e.target.value.toUpperCase() })}
        placeholder="TR00 0000 0000 0000 0000 0000 00"
        style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 16 }}
      />
      <div style={{ fontSize: 10.5, color: SC.inkFaint, margin: "7px 2px 0", lineHeight: 1.45 }}>
        Bilgiler sadece bu telefonda saklanır. IBAN yalnızca Kasa mesajında paylaşılır.
      </div>
    </SheetShell>
  );
}
