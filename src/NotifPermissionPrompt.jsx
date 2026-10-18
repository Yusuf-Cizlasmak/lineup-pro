// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · NotifPermissionPrompt — uygulama içi ön-izin ekranı
// ─────────────────────────────────────────────────────────────
// Sistem bildirim izni ARTIK açılışta istenmez. Bu ekran, değer anında
// (plan kuruldu / ilk maç kaydedildi / online maç planlandı) gösterilir:
//
//   window "halisaha:ask-notif-permission" { context: "schedule" | "first_match" | "online" }
//
// Kurallar:
//   • İzin zaten verildiyse ya da reddedildiyse ASLA gösterilmez
//     (LocalNotifications.checkPermissions + daha önce sistem penceresi sonucu).
//   • "Şimdi değil" → 7 gün boyunca tekrar gösterilmez.
//   • "Evet, hatırlat" → enablePush() (FCM/APNs kaydı) + LocalNotifications izni
//     → track(NOTIF_PERMISSION { granted, context }) → plan yeniden hesaplanır.
//   • İlk maç kaydedildiğinde ("halisaha:match-saved") plan yoksa
//     context "first_match" ile kendini tetikler ve "Maç saatini ayarla" önerir.
//     İzin zaten verilmişse sadece plan önerisi gösterilir (14 günde bir).
//
// Web'de (native değil) sessizdir; test için localStorage hk_debug = "1".
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { hapticLight, hapticSuccess } from "./haptics";
import { track, EVENTS } from "./analytics";
import { enablePush } from "./push";
import {
  getNotifPermission, requestNotifPermission, initNotifications, refreshNotifications,
} from "./notifications";
import { getSchedule } from "./matchSchedule";
import { SheetShell, SC, primaryBtn, ghostBtn, useBannerHidden, whenUiCalm } from "./ScheduleSheet";

const DISMISS_KEY = "halisaha_notif_prompt_dismissed_at"; // "Şimdi değil" zamanı
const OS_RESULT_KEY = "halisaha_notif_os_result";          // sistem penceresi sonucu: granted | denied
const SCHED_SUGGEST_KEY = "halisaha_sched_suggested_at";   // izin varken plan önerisi zamanı
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
const SCHED_SUGGEST_MS = 14 * 24 * 60 * 60 * 1000;

const readNum = (k) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
const writeVal = (k, v) => { try { localStorage.setItem(k, String(v)); } catch {} };
const readStr = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const isDebug = () => { try { return localStorage.getItem("hk_debug") === "1"; } catch { return false; } };

// ═══ BAĞLAMA GÖRE METİN ═══
const COPY = {
  schedule: {
    icon: "⏰",
    title: "Maç gününden önce hatırlatayım mı?",
    body: "Kadro ve takımlar hazır olsun.",
    bullets: [
      ["📋", "Bir gün önce: kim geliyor?"],
      ["⚖️", "Maç günü: takımları adil kur"],
      ["👑", "Maç sonrası: skor ve MVP"],
    ],
  },
  first_match: {
    icon: "⚽",
    title: "Gelecek maçı hatırlatayım mı?",
    body: "Maç günü kadroyu ve takımları hazırlamanı, maç sonunda skoru girmeni hatırlatırım.",
    bullets: [
      ["🔕", "Spam yok — haftada birkaç kısa hatırlatma"],
      ["🏆", "Gol krallığı ve MVP tablosu güncel kalsın"],
    ],
  },
  online: {
    icon: "📡",
    title: "Maç saatinden önce haber vereyim mi?",
    body: "Oda kodu ve maç saati unutulmasın.",
    bullets: [],
  },
};

// Sadece plan önerisi (izin zaten verilmiş/reddedilmiş, plan yok)
const SCHEDULE_ONLY = {
  icon: "📅",
  title: "Her hafta oynuyor musunuz?",
  body: "Maç gününü ve saatini gir; kadro, takımlar ve skor için zamanında hatırlatayım.",
  bullets: [],
};

export default function NotifPermissionPrompt() {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState("schedule");
  const [variant, setVariant] = useState("permission"); // permission | schedule_only
  const [busy, setBusy] = useState(false);
  const openRef = useRef(false);
  openRef.current = open;

  useBannerHidden(open);

  useEffect(() => {
    let cancelWait = null;
    const supported = Capacitor.isNativePlatform() || isDebug();

    // Gösterilecek mi? → "permission" | "schedule_only" | null
    const decide = async (ctx) => {
      const noSchedule = !getSchedule();
      const canSuggestSchedule = ctx === "first_match" && noSchedule &&
        Date.now() - readNum(SCHED_SUGGEST_KEY) > SCHED_SUGGEST_MS;
      const recentlyDismissed = Date.now() - readNum(DISMISS_KEY) < DISMISS_MS;
      if (recentlyDismissed) return null;

      const perm = supported ? await getNotifPermission() : "unsupported";
      const osDenied = readStr(OS_RESULT_KEY) === "denied";
      if (perm === "granted") {
        refreshNotifications("perm_check").catch(() => {});
        return canSuggestSchedule ? "schedule_only" : null;
      }
      if (perm === "denied" || osDenied || perm === "unsupported") {
        // Web debug modunda izin akışını da görebilmek için
        if (perm === "unsupported" && isDebug() && !osDenied) return "permission";
        return canSuggestSchedule ? "schedule_only" : null;
      }
      return "permission"; // prompt | prompt-with-rationale
    };

    const onAsk = (e) => {
      const ctx = COPY[e?.detail?.context] ? e.detail.context : "schedule";
      if (openRef.current) return;
      if (cancelWait) cancelWait();
      // Başka modal açıksa (ör. maç sonucu) kapanmasını bekle
      cancelWait = whenUiCalm(async () => {
        if (openRef.current) return;
        const v = await decide(ctx);
        if (!v) return;
        setContext(ctx);
        setVariant(v);
        setBusy(false);
        setOpen(true);
        if (v === "schedule_only") writeVal(SCHED_SUGGEST_KEY, Date.now());
      }, { initialDelay: ctx === "first_match" ? 1800 : 150 });
    };

    // İlk maç kaydı (plan yoksa) → hatırlatma + plan önerisi
    const onMatchSaved = () => {
      if (getSchedule()) return;
      window.dispatchEvent(new CustomEvent("halisaha:ask-notif-permission", { detail: { context: "first_match" } }));
    };

    window.addEventListener("halisaha:ask-notif-permission", onAsk);
    window.addEventListener("halisaha:match-saved", onMatchSaved);
    return () => {
      window.removeEventListener("halisaha:ask-notif-permission", onAsk);
      window.removeEventListener("halisaha:match-saved", onMatchSaved);
      if (cancelWait) cancelWait();
    };
  }, []);

  const close = () => setOpen(false);

  const handleLater = () => {
    hapticLight();
    writeVal(DISMISS_KEY, Date.now());
    if (variant === "permission") track(EVENTS.NOTIF_PERMISSION, { granted: false, context, dismissed: true });
    close();
  };

  const handleYes = async () => {
    if (busy) return;
    setBusy(true);
    hapticSuccess();
    let granted = false;
    // 1) Push kaydı (iOS/Android sistem penceresi burada çıkar)
    try { if (typeof enablePush === "function") granted = !!(await enablePush()); } catch {}
    // 2) Local bildirim izni — aynı izin; sadece hâlâ "prompt" ise tekrar sor
    //    (Android 13'te reddi takiben ikinci bir pencere açılmasın)
    try {
      const perm = await getNotifPermission();
      if (perm === "granted") granted = true;
      else if (perm === "prompt") granted = (await requestNotifPermission()) || granted;
    } catch {}
    writeVal(OS_RESULT_KEY, granted ? "granted" : "denied");
    track(EVENTS.NOTIF_PERMISSION, { granted, context });
    try { await initNotifications(); } catch {}
    refreshNotifications("permission").catch(() => {});
    setBusy(false);
    close();
  };

  const handleSetSchedule = () => {
    hapticLight();
    close();
    // Plan kaydedilince ScheduleSheet izni yeniden soracak (context "schedule")
    setTimeout(() => window.dispatchEvent(new CustomEvent("halisaha:open-schedule")), 260);
  };

  const copy = variant === "schedule_only" ? SCHEDULE_ONLY : COPY[context] || COPY.schedule;
  const offerSchedule = context === "first_match" && !getSchedule();

  return (
    <SheetShell
      open={open}
      onClose={handleLater}
      zIndex={9400}
      icon={copy.icon}
      eyebrow={variant === "schedule_only" ? "HAFTALIK MAÇ" : "HATIRLATMALAR"}
      title={copy.title}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {variant === "permission" ? (
            <>
              <button onClick={handleYes} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }}>
                {busy ? "Bekleniyor…" : "Evet, hatırlat"}
              </button>
              {offerSchedule && (
                <button onClick={handleSetSchedule} style={{ ...ghostBtn, color: SC.primary, borderColor: `${SC.primary}55` }}>
                  ⏰ Maç saatini ayarla
                </button>
              )}
            </>
          ) : (
            <button onClick={handleSetSchedule} style={primaryBtn}>⏰ Maç saatini ayarla</button>
          )}
          <button onClick={handleLater} style={ghostBtn}>Şimdi değil</button>
        </div>
      }
    >
      <p style={{ margin: "2px 2px 12px", fontSize: 14, lineHeight: 1.5, color: SC.inkDim }}>{copy.body}</p>
      {copy.bullets.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {copy.bullets.map(([ic, txt]) => (
            <div key={txt} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 11,
              background: SC.surface, border: `1px solid ${SC.line}`, fontSize: 13, color: SC.ink,
            }}>
              <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{ic}</span>
              <span>{txt}</span>
            </div>
          ))}
        </div>
      )}
      {variant === "permission" && (
        <div style={{ fontSize: 10.5, color: SC.inkFaint, margin: "12px 2px 0", lineHeight: 1.45 }}>
          Ayarlar'dan istediğin zaman kapatabilirsin.
        </div>
      )}
    </SheetShell>
  );
}
