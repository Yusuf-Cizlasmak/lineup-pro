// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · PaywallScreen (PREMIUM)
// ─────────────────────────────────────────────────────────────
// Vizyon: cinematic premium paywall — Pro kart vurgulu
// gradient çerçeveli, trial CTA yumuşak, aylık/yıllık toggle.
//
// Kullanım:
//   1) App.js root'una <PaywallProvider /> ekle (bir kez yeter)
//   2) Herhangi bir yerden: openPaywall('cloud_sync')  veya
//      const { openPaywall } = useSubscription(); openPaywall('unlimited_online');
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from "react";
import {
  TIER, FREE_LIMITS,
  isTrialUsed, startTrial, activateSubscription, clearSubscription,
  useSubscription,
} from "./subscription";
import { iap } from "./iap";
import { hapticMedium, hapticSuccess, hapticLight } from "./haptics";
import { hideBanner, showBanner } from "./admob";

// ═══════════════════════════════════════════════════════════
// PROVIDER — App.js'e bir kez koy
// ═══════════════════════════════════════════════════════════
export function PaywallProvider() {
  const [open, setOpen] = useState(false);
  const [feature, setFeature] = useState("general");

  useEffect(() => {
    const handler = (e) => {
      setFeature(e.detail?.feature || "general");
      setOpen(true);
      hapticMedium();
    };
    window.addEventListener("hk:open-paywall", handler);
    return () => window.removeEventListener("hk:open-paywall", handler);
  }, []);

  return <PaywallScreen open={open} feature={feature} onClose={() => setOpen(false)} />;
}

// ═══════════════════════════════════════════════════════════
// PALET
// ═══════════════════════════════════════════════════════════
const C = {
  bg:      "#04070b",
  bg2:     "#0a141f",
  card:    "#0d1620",
  text:    "#e8edf3",
  muted:   "rgba(232,237,243,0.55)",
  dim:     "rgba(232,237,243,0.25)",
  border:  "rgba(255,255,255,0.07)",
  accent:  "#34d399",
  gold:    "#fbbf24",
  blue:    "#60a5fa",
};

// ═══════════════════════════════════════════════════════════
// FEATURE TANIMLARI — açılış başlığı feature'a göre değişir
// ═══════════════════════════════════════════════════════════
const FEATURE_TITLES = {
  unlimited_online:  "Free oyun hakkını kullandın",
  cloud_sync:        "Verilerini bulutta sakla",
  no_ads:            "Reklamsız bir deneyim",
  unlimited_history: "Tüm maç geçmişini sakla",
  multi_team:        "Birden fazla takım yönet",
  brand_team:        "Takımına özel kimlik kazandır",
  league_mode:       "Lig kur, sezon yönet",
  general:           "Pro'ya geç, sınırsız oyna",
};

// ═══════════════════════════════════════════════════════════
// MAIN PAYWALL
// ═══════════════════════════════════════════════════════════
function PaywallScreen({ open, feature, onClose }) {
  const { tier, plan, until, isTrial, daysLeft } = useSubscription();
  const [period, setPeriod] = useState("yearly"); // monthly | yearly
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null); // ★ { title, message, retry: () => void }
  const trialAvailable = !isTrialUsed();

  // Modal açıkken banner gizle, kapanınca geri getir
  useEffect(() => {
    if (open) {
      hideBanner().catch(() => {});
      return () => { showBanner().catch(() => {}); };
    }
  }, [open]);

  if (!open) return null;

  const title = FEATURE_TITLES[feature] || FEATURE_TITLES.general;

  // ─── Satın al simülasyonu (Aşama 1: lokal) ───
  // ★ NOT: Confirmation dialog'lar production'da KALDIRILDI çünkü
  // native paywall (App Store / Play Store) zaten kendi onay ekranını gösteriyor.
  // Çift onay UX'i bozar ve store guideline'larına aykırı.

  const handlePurchase = async (planId) => {
    setLoading(planId);
    setError(null);
    hapticMedium();

    try {
      // ★ Native paywall burada açılır (iOS/Android) — web'de simülasyon
      // Tier aktivasyonu iap.js içindeki RC listener tarafından yapılır.
      await iap.purchase(planId);

      hapticSuccess();
      setLoading(null);

      // ★ Pro state'in yayılması için subscription change event'ini garanti tetikle.
      // iap.purchase başarılı olduysa subscription.js zaten dispatch etti, ama
      // bazı durumlarda race condition oluyor — explicit refresh sağlayalım.
      try {
        window.dispatchEvent(new CustomEvent("hk:subscription-changed"));
      } catch {}

      // Modal'ı bir an açık tut, kullanıcı "✓" feedback hissetsin
      await new Promise(r => setTimeout(r, 400));
      onClose();
    } catch (err) {
      setLoading(null);
      // Kullanıcı kendi iptal ettiyse: sessizce kapat, hata gösterme
      if (err.code === "USER_CANCELLED") {
        return;
      }
      // Web/dev test: gerçek satın alma cihazda yapılır
      if (err.code === "WEB_NOT_SUPPORTED") {
        hapticMedium();
        setError({
          title: "Satın alma sadece mobil cihazda",
          message: "Bu özellik App Store ve Google Play'de aktif. Uygulamayı mağazadan indirip tekrar deneyin.",
          retry: null,
        });
        return;
      }
      // Gerçek hata: kullanıcıya açıkça göster + tekrar dene
      hapticMedium();
      setError({
        title: "Ödeme tamamlanamadı",
        message: err.message || "Bilinmeyen bir hata oluştu.",
        retry: () => handlePurchase(planId),
      });
    }
  };

  const handleStartTrial = async () => {
    setLoading("trial_7d");
    setError(null);
    hapticMedium();

    try {
      // ★ Trial → introductory pricing olarak RevenueCat dashboard'unda
      // pro_yearly paketine bağlı. iap.purchase('trial_7d') zaten doğru
      // paketi açıyor (PACKAGE_MAP'ten bakar).
      await iap.purchase("trial_7d");

      hapticSuccess();
      setLoading(null);
      onClose();
    } catch (err) {
      setLoading(null);
      if (err.code === "USER_CANCELLED") {
        return;
      }
      if (err.code === "WEB_NOT_SUPPORTED") {
        hapticMedium();
        setError({
          title: "Deneme sadece mobil cihazda",
          message: "7 günlük ücretsiz denemeyi başlatmak için uygulamayı App Store veya Google Play'den indirin.",
          retry: null,
        });
        return;
      }
      hapticMedium();
      setError({
        title: "Deneme başlatılamadı",
        message: err.message || "Bir sorun oluştu.",
        retry: () => handleStartTrial(),
      });
    }
  };

  // ─── Restore Purchases (eski cihaz / reset sonrası) ───
  const handleRestore = async () => {
    setLoading("restore");
    setError(null);
    hapticMedium();

    try {
      const result = await iap.restore();
      setLoading(null);
      if (result.restored) {
        hapticSuccess();
        onClose();
      } else {
        // Aktif abonelik yok — kullanıcıya kibarca söyle
        setError({
          title: "Geri yüklenecek bir şey yok",
          message: result.message || "Bu Apple ID / Google hesabıyla aktif abonelik bulunamadı.",
          retry: handleRestore,
        });
      }
    } catch (err) {
      setLoading(null);
      hapticMedium();
      setError({
        title: "Geri yükleme başarısız",
        message: err.message || "Bir sorun oluştu.",
        retry: handleRestore,
      });
    }
  };

  // ─── Aboneliği yönet — store'a yönlendir ───
  // Apple/Google guideline'larına göre iptal işlemi store üzerinden yapılmalı.
  // App içinde "iptal et" butonu yok; "App Store'da yönet" butonu var.
  const handleCancel = async () => {
    hapticMedium();
    try {
      await iap.openSubscriptionManagement();
    } catch (err) {
      setError({
        title: "Yönetim ekranı açılamadı",
        message: "App Store / Google Play uygulamasından aboneliklerini görüntüleyebilirsin.",
        retry: handleCancel,
      });
    }
  };

  // ─── DEBUG: Lokal subscription'ı temizle (sadece dev/test) ───
  const handleDebugClearLocal = async () => {
    if (!window.confirm("[DEBUG] Lokal subscription kaydı silinecek (store aboneliği etkilenmez). Devam?")) return;
    setLoading("cancel");
    try {
      await new Promise(r => setTimeout(r, 400));
      clearSubscription();
      setLoading(null);
      onClose();
    } catch (err) {
      setLoading(null);
    }
  };

  return (
    <div style={S.backdrop} onClick={onClose}>
      <style>{cssAnims}</style>

      {/* Atmosfer halo'lar */}
      <div style={S.heroGlow} aria-hidden />

      <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
        {/* Close butonu */}
        <button onClick={onClose} style={S.closeBtn} aria-label="Kapat">×</button>

        {/* ★ ERROR BANNER — ödeme/trial fail durumu */}
        {error && (
          <div style={S.errorBanner}>
            <div style={S.errorIcon}>!</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.errorTitle}>{error.title}</div>
              <div style={S.errorMessage}>{error.message}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  onClick={() => { hapticMedium(); error.retry?.(); }}
                  style={S.errorRetryBtn}
                >
                  ↻ Tekrar Dene
                </button>
                <button
                  onClick={() => setError(null)}
                  style={S.errorDismissBtn}
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div style={S.loadingOverlay}>
            <div style={S.loadingSpinner} />
            <div style={S.loadingText}>
              {loading === "trial_7d" ? "DENEME BAŞLATILIYOR..."
                : loading === "cancel" ? "İŞLENİYOR..."
                : loading === "restore" ? "SATIN ALIMLAR GERİ YÜKLENİYOR..."
                : "ÖDEME İŞLENİYOR..."}
            </div>
            <div style={S.loadingSub}>Lütfen bekle</div>
          </div>
        )}

        {tier !== TIER.FREE ? (
          // ═══════════════════════════════════════════════
          // YÖNETİM MODU — Pro kullanıcı
          // ═══════════════════════════════════════════════
          <ManageSubscription
            tier={tier}
            plan={plan}
            until={until}
            isTrial={isTrial}
            daysLeft={daysLeft}
            onCancel={handleCancel}
            onClose={onClose}
          />
        ) : (
          // ═══════════════════════════════════════════════
          // PLAN SEÇİM — Free kullanıcı
          // ═══════════════════════════════════════════════
          <>
            {/* Hero */}
            <div style={S.hero}>
              <div style={S.heroIcon}>⚽</div>
              <div style={S.heroBadge}>★ HALI SAHA · PRO</div>
              <h2 style={S.heroTitle}>{title}</h2>
              <p style={S.heroSub}>
                Sınırsız oda kurma · Sınırsız katılma · Reklamsız · Cloud sync
              </p>
            </div>

            {/* Trial CTA */}
            {trialAvailable && (
              <button onClick={handleStartTrial} style={S.trialCard}>
                <span style={S.trialBadge}>YENİ</span>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={S.trialTitle}>7 gün ÜCRETSİZ Pro</div>
                  <div style={S.trialSub}>İptal et, ücret yok. Hemen başla.</div>
                </div>
                <span style={S.trialArrow}>→</span>
              </button>
            )}

            {/* Aylık / Yıllık toggle */}
            <div style={S.toggle}>
              <button
                onClick={() => { setPeriod("monthly"); hapticLight(); }}
                style={{ ...S.toggleBtn, ...(period === "monthly" ? S.toggleBtnActive : {}) }}
              >
                Aylık
              </button>
              <button
                onClick={() => { setPeriod("yearly"); hapticLight(); }}
                style={{ ...S.toggleBtn, ...(period === "yearly" ? S.toggleBtnActive : {}) }}
              >
                Yıllık <span style={S.savePill}>−44%</span>
              </button>
            </div>

            {/* Pro Kart */}
            <TierCard
              tone="pro"
              name="Pro"
              tagline="Bireysel premium"
              badge="EN POPÜLER"
              price={period === "yearly" ? 199 : 29}
              unit={period === "yearly" ? "/yıl" : "/ay"}
              subPrice={period === "yearly" ? "₺17/ay (yıllık ödeme)" : "her ay yenilenir"}
              features={[
                { icon: "⚡", text: "Sınırsız oda kurma + maça katılma" },
                { icon: "🚫", text: "Reklamsız deneyim" },
                { icon: "☁️", text: "Cloud sync (cihazlar arası)" },
                { icon: "📊", text: "Sınırsız maç geçmişi + gelişmiş istatistik" },
                { icon: "🛡", text: "Sınırsız takım" },
              ]}
              ctaLabel={loading === (period === "yearly" ? "pro_yearly" : "pro_monthly") ? "İşleniyor..." : "Pro'ya Geç"}
              onCta={() => handlePurchase(period === "yearly" ? "pro_yearly" : "pro_monthly")}
              loading={loading === (period === "yearly" ? "pro_yearly" : "pro_monthly")}
            />

            {/* Free hatırlatma */}
            <div style={S.freeNote}>
              <span style={S.freeNoteLabel}>FREE</span>
              <span>1 oda kurma · 1 maça katılma · Son {FREE_LIMITS.HISTORY_LIMIT} maç geçmişi</span>
            </div>

            {/* Alt linkler */}
            <div style={S.footer}>
              <button style={S.footerLink} onClick={handleRestore}>
                Satın alımları geri yükle
              </button>
              <span style={S.footerDivider}>·</span>
              <button style={S.footerLink} onClick={onClose}>
                Şimdi değil
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MANAGE SUBSCRIPTION — Pro kullanıcı yönetim ekranı
// ═══════════════════════════════════════════════════════════
function ManageSubscription({ tier, plan, until, isTrial, daysLeft, onCancel, onClose }) {
  const planLabel = isTrial ? "DENEME (7 GÜN)"
    : plan === "pro_monthly" ? "PRO AYLIK"
    : plan === "pro_yearly"  ? "PRO YILLIK"
    : "PRO";

  const planPrice = plan === "pro_monthly" ? "₺29/ay"
    : plan === "pro_yearly"  ? "₺199/yıl"
    : isTrial ? "Ücretsiz" : "—";

  const renewDate = until ? new Date(until).toLocaleDateString("tr-TR", {
    day: "numeric", month: "long", year: "numeric",
  }) : "—";

  return (
    <>
      {/* Hero */}
      <div style={S.hero}>
        <div style={{ ...S.heroIcon, fontSize: 52, filter: "drop-shadow(0 6px 14px rgba(251,191,36,0.5))" }}>👑</div>
        <div style={S.heroBadge}>
          ★ PRO ÜYE
        </div>
        <h2 style={S.heroTitle}>Aboneliğin Aktif</h2>
        <p style={S.heroSub}>
          Tüm premium özellikler kullanımına açık.
        </p>
      </div>

      {/* Plan kartı */}
      <div style={{
        marginBottom: 14,
        padding: "16px 18px",
        background: "linear-gradient(135deg, rgba(251,191,36,0.10) 0%, rgba(20,30,42,0.6) 100%)",
        border: "1px solid rgba(251,191,36,0.35)",
        borderRadius: 14,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{
            fontSize: 10, fontWeight: 900, letterSpacing: 2,
            color: "#fbbf24",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            AKTİF PLAN
          </div>
          {isTrial && (
            <span style={{
              fontSize: 8.5, fontWeight: 900, letterSpacing: 1.2,
              background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
              color: "#0a1628",
              padding: "2px 7px", borderRadius: 4,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {daysLeft}G KALDI
            </span>
          )}
        </div>

        <div style={{
          fontSize: 22, fontWeight: 900,
          color: "#fff",
          fontFamily: "'Bebas Neue', 'DM Sans', sans-serif",
          letterSpacing: 1.2,
          marginBottom: 4,
        }}>
          {planLabel}
        </div>

        <div style={{
          fontSize: 13, color: "rgba(255,255,255,0.65)",
          marginBottom: 14,
        }}>
          {planPrice}
        </div>

        <div style={{
          paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>Yenileme tarihi</span>
            <span style={{ color: "#fff", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
              {renewDate}
            </span>
          </div>
          {daysLeft != null && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
              <span style={{ color: "rgba(255,255,255,0.5)" }}>Kalan süre</span>
              <span style={{ color: "#fff", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                {daysLeft} gün
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Aktif özellikler */}
      <div style={{
        padding: "14px 16px",
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        marginBottom: 14,
      }}>
        <div style={{
          fontSize: 9.5, fontWeight: 900, letterSpacing: 2,
          color: "rgba(255,255,255,0.45)",
          fontFamily: "'JetBrains Mono', monospace",
          marginBottom: 10,
        }}>
          AKTİF ÖZELLİKLER
        </div>
        {[
          "Sınırsız oda kurma + maça katılma",
          "Reklamsız deneyim",
          "Cloud sync (cihazlar arası)",
          "Sınırsız maç geçmişi",
          "Sınırsız takım",
        ].map((feat, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: i === 0 ? 0 : 7 }}>
            <span style={{
              width: 16, height: 16, borderRadius: 4,
              background: "rgba(52,211,153,0.18)",
              border: "1px solid rgba(52,211,153,0.5)",
              color: "#34d399",
              fontSize: 10, fontWeight: 900,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>✓</span>
            <span style={{ fontSize: 12, color: "#e8edf3" }}>{feat}</span>
          </div>
        ))}
      </div>

      {/* Yönetim butonları */}
      <button onClick={onClose} style={S.manageBtnPrimary}>
        ← Ana Ekrana Dön
      </button>

      <button onClick={onCancel} style={S.manageBtnDanger}>
        Aboneliği Yönet · Store'da Aç
      </button>

      {/* Store guidance */}
      <div style={{
        marginTop: 12, padding: "10px 12px",
        background: "rgba(96,165,250,0.06)",
        border: "1px dashed rgba(96,165,250,0.25)",
        borderRadius: 10,
        fontSize: 10.5, color: "rgba(255,255,255,0.5)",
        lineHeight: 1.5,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <strong style={{ color: "#60a5fa", fontWeight: 800 }}>ⓘ Bilgi:</strong>{" "}
        Abonelik yenileme, plan değişikliği ve iptal işlemleri App Store /
        Google Play üzerinden yapılır. Yukarıdaki butona basınca store'un
        yönetim ekranı açılır.
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// TIER CARD
// ═══════════════════════════════════════════════════════════
function TierCard({ tone, name, tagline, badge, price, unit, subPrice, features, ctaLabel, onCta, loading }) {
  const accentCol = C.accent;
  const halo = "linear-gradient(135deg, rgba(52,211,153,0.55) 0%, rgba(96,165,250,0.4) 100%)";

  return (
    <div style={{
      ...S.tierCard,
      borderColor: `${accentCol}55`,
      boxShadow: `0 14px 40px rgba(0,0,0,0.5), 0 0 28px ${accentCol}22`,
    }}>
      {/* Premium gradient halo */}
      <span aria-hidden style={{
        position: "absolute", inset: 0, borderRadius: 18, padding: 1.5,
        background: halo,
        WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
        opacity: 0.65,
        pointerEvents: "none",
      }} />

      {/* Badge */}
      {badge && (
        <span style={{ ...S.tierBadge, color: accentCol, borderColor: `${accentCol}55`, background: `${accentCol}18` }}>
          {badge}
        </span>
      )}

      {/* Header */}
      <div style={S.tierHeader}>
        <div>
          <div style={{
            fontSize: 22, fontWeight: 900, color: accentCol,
            fontFamily: "'Bebas Neue', 'DM Sans', sans-serif",
            letterSpacing: 1.5,
          }}>
            {name}
          </div>
          <div style={S.tierTagline}>{tagline}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "inline-flex", alignItems: "baseline", gap: 3 }}>
            <span style={{ ...S.tierPrice, color: accentCol }}>
              ₺{price}
            </span>
            <span style={S.tierUnit}>{unit}</span>
          </div>
          {subPrice && <div style={S.tierSubPrice}>{subPrice}</div>}
        </div>
      </div>

      {/* Features */}
      <div style={S.featureList}>
        {features.map((f, i) => (
          <div key={i} style={S.feature}>
            <span style={{ ...S.featureCheck, color: accentCol, borderColor: `${accentCol}55`, background: `${accentCol}15` }}>✓</span>
            <span style={S.featureText}>{f.text}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={onCta}
        disabled={loading}
        style={{
          ...S.tierCta,
          background: "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
          color: "#0a1628",
          boxShadow: `0 10px 24px ${accentCol}55`,
          opacity: loading ? 0.7 : 1,
        }}
      >
        {/* Shimmer overlay */}
        <span aria-hidden style={S.ctaShimmer} />
        <span style={{ position: "relative", zIndex: 1 }}>
          {loading ? "İşleniyor..." : ctaLabel}
        </span>
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CSS ANIMATIONS
// ═══════════════════════════════════════════════════════════
const cssAnims = `
@keyframes pwSlideUp {
  from { opacity: 0; transform: translateY(40px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes pwFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes pwShimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes pwGlowPulse {
  0%, 100% { opacity: 0.55; transform: translate(-50%, 0) scale(1); }
  50%      { opacity: 0.85; transform: translate(-50%, 0) scale(1.08); }
}
@keyframes pwTrialPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0.55); }
  50%      { box-shadow: 0 0 0 8px rgba(251,191,36,0); }
}
@keyframes pwSpin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
`;

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════
const S = {
  backdrop: {
    position: "fixed", inset: 0,
    background: "rgba(2,5,9,0.85)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    zIndex: 9000,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    animation: "pwFadeIn 0.25s ease-out",
  },
  heroGlow: {
    position: "fixed",
    top: "8%", left: "50%",
    width: 320, height: 200,
    borderRadius: "50%",
    background: "radial-gradient(ellipse, rgba(251,191,36,0.32), transparent 70%)",
    filter: "blur(28px)",
    pointerEvents: "none",
    zIndex: 9001,
    animation: "pwGlowPulse 4.5s ease-in-out infinite",
    transform: "translate(-50%, 0)",
  },
  sheet: {
    position: "relative",
    zIndex: 9002,
    width: "100%",
    maxWidth: 460,
    maxHeight: "94vh",
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    background: "linear-gradient(180deg, #0e1620 0%, #0a1018 100%)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    border: `1px solid ${C.border}`,
    borderBottom: "none",
    padding: "20px 18px calc(24px + env(safe-area-inset-bottom, 0px))",
    boxShadow: "0 -30px 80px rgba(0,0,0,0.7)",
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    color: C.text,
    animation: "pwSlideUp 0.42s cubic-bezier(.34,1.56,.64,1)",
  },
  closeBtn: {
    position: "absolute",
    top: 14, right: 14,
    width: 32, height: 32,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.06)",
    border: `1px solid ${C.border}`,
    color: C.muted,
    fontSize: 20, fontWeight: 300,
    cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "inherit",
    lineHeight: 1,
    zIndex: 10,
  },

  // ─── Test mode banner ───
  testBanner: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 12px",
    background: "rgba(251,191,36,0.10)",
    border: "1px solid rgba(251,191,36,0.30)",
    borderRadius: 8,
    marginBottom: 14,
    fontSize: 10, fontWeight: 800,
    color: "#fbbf24",
    letterSpacing: 0.5,
    fontFamily: "'JetBrains Mono', monospace",
  },
  testBannerDot: {
    width: 6, height: 6, borderRadius: "50%",
    background: "#fbbf24",
    boxShadow: "0 0 6px rgba(251,191,36,0.8)",
    flexShrink: 0,
    animation: "pwTrialPulse 1.6s ease-out infinite",
  },

  // ─── Error banner ───
  errorBanner: {
    display: "flex", alignItems: "flex-start", gap: 12,
    padding: "14px",
    background: "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.04))",
    border: "1px solid rgba(239,68,68,0.40)",
    borderRadius: 12,
    marginBottom: 14,
    boxShadow: "0 8px 22px rgba(239,68,68,0.15)",
    animation: "pwSlideUp 0.3s ease-out",
  },
  errorIcon: {
    width: 28, height: 28, borderRadius: "50%",
    background: "#ef4444",
    color: "#fff",
    fontSize: 18, fontWeight: 900,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
    fontFamily: "'DM Sans', sans-serif",
    boxShadow: "0 0 12px rgba(239,68,68,0.5)",
  },
  errorTitle: {
    fontSize: 13, fontWeight: 800,
    color: "#fff",
    marginBottom: 3,
  },
  errorMessage: {
    fontSize: 12, lineHeight: 1.45,
    color: "rgba(255,255,255,0.7)",
  },
  errorRetryBtn: {
    padding: "8px 14px",
    background: "linear-gradient(135deg, #ef4444, #dc2626)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 11.5, fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: 0.3,
    boxShadow: "0 4px 12px rgba(239,68,68,0.4)",
  },
  errorDismissBtn: {
    padding: "8px 14px",
    background: "transparent",
    color: "rgba(255,255,255,0.55)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    fontSize: 11.5, fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  // ─── Loading overlay ───
  loadingOverlay: {
    position: "absolute", inset: 0,
    background: "rgba(2,5,9,0.92)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    borderRadius: 24,
  },
  loadingSpinner: {
    width: 40, height: 40,
    border: "3px solid rgba(251,191,36,0.18)",
    borderTopColor: "#fbbf24",
    borderRadius: "50%",
    animation: "pwSpin 0.9s linear infinite",
  },
  loadingText: {
    fontSize: 12, fontWeight: 900, letterSpacing: 2,
    color: "#fbbf24",
    fontFamily: "'JetBrains Mono', monospace",
  },
  loadingSub: {
    fontSize: 11, color: "rgba(255,255,255,0.5)",
    marginTop: -10,
  },

  // ─── Manage subscription buttons ───
  manageBtnPrimary: {
    width: "100%",
    padding: "13px",
    background: "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
    color: "#0a1628",
    border: "none",
    borderRadius: 12,
    fontSize: 13, fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: 0.3,
    boxShadow: "0 8px 20px rgba(52,211,153,0.35)",
    marginBottom: 8,
  },
  manageBtnDanger: {
    width: "100%",
    padding: "12px",
    background: "rgba(239,68,68,0.08)",
    color: "#ef4444",
    border: "1px solid rgba(239,68,68,0.30)",
    borderRadius: 12,
    fontSize: 12.5, fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: 0.3,
  },

  // Hero
  hero: {
    textAlign: "center",
    paddingTop: 8,
    marginBottom: 18,
  },
  heroIcon: {
    fontSize: 44,
    marginBottom: 8,
    filter: "drop-shadow(0 6px 14px rgba(251,191,36,0.4))",
  },
  heroBadge: {
    display: "inline-block",
    fontSize: 9.5, fontWeight: 900, letterSpacing: 2.5,
    background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
    color: "#0a1628",
    padding: "4px 11px", borderRadius: 5,
    marginBottom: 12,
    fontFamily: "'JetBrains Mono', monospace",
  },
  heroTitle: {
    margin: 0,
    fontSize: 22, fontWeight: 800,
    letterSpacing: -0.3,
    lineHeight: 1.25,
    backgroundImage: "linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  heroSub: {
    margin: "8px 8px 0",
    fontSize: 12, color: C.muted,
    lineHeight: 1.5,
  },

  // Trial
  trialCard: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    background: "linear-gradient(135deg, rgba(251,191,36,0.18), rgba(251,191,36,0.04))",
    border: "1.5px solid rgba(251,191,36,0.45)",
    borderRadius: 14,
    cursor: "pointer",
    color: C.text,
    fontFamily: "inherit",
    marginBottom: 16,
    animation: "pwTrialPulse 2s ease-out infinite",
  },
  trialBadge: {
    fontSize: 9, fontWeight: 900, letterSpacing: 1.5,
    background: "#fbbf24", color: "#0a1628",
    padding: "2px 7px", borderRadius: 4,
    fontFamily: "'JetBrains Mono', monospace",
    flexShrink: 0,
  },
  trialTitle: {
    fontSize: 14, fontWeight: 800,
    color: "#fbbf24",
  },
  trialSub: {
    fontSize: 11, color: C.muted,
    marginTop: 2,
  },
  trialArrow: {
    fontSize: 20, color: "#fbbf24",
    fontWeight: 700,
    flexShrink: 0,
  },

  // Toggle
  toggle: {
    display: "flex",
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  toggleBtn: {
    flex: 1,
    padding: "8px 10px",
    background: "transparent",
    border: "none",
    color: C.muted,
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    borderRadius: 8,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    transition: "all 0.15s",
  },
  toggleBtnActive: {
    background: "rgba(255,255,255,0.06)",
    color: C.text,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  savePill: {
    fontSize: 9, fontWeight: 900,
    background: "linear-gradient(135deg, #34d399, #10b981)",
    color: "#0a1628",
    padding: "1.5px 5px", borderRadius: 3,
    fontFamily: "'JetBrains Mono', monospace",
  },

  // Tier card
  tierCard: {
    position: "relative",
    background: "linear-gradient(160deg, #0e1620 0%, #0a1118 100%)",
    border: `1px solid ${C.border}`,
    borderRadius: 18,
    padding: "16px 16px 14px",
    marginBottom: 12,
    overflow: "hidden",
  },
  tierBadge: {
    position: "absolute",
    top: 12, right: 12,
    fontSize: 8.5, fontWeight: 900, letterSpacing: 1.4,
    padding: "2.5px 8px", borderRadius: 4,
    border: "1px solid",
    fontFamily: "'JetBrains Mono', monospace",
  },
  tierHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
    paddingRight: 70,
  },
  tierTagline: {
    fontSize: 11, color: C.muted,
    marginTop: 2,
    fontWeight: 600,
  },
  tierPrice: {
    fontSize: 28, fontWeight: 900,
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1,
  },
  tierUnit: {
    fontSize: 12, color: C.muted,
    fontWeight: 600,
  },
  tierSubPrice: {
    fontSize: 9.5, color: C.dim,
    marginTop: 4,
    fontWeight: 600,
  },

  // Features
  featureList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 14,
  },
  feature: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  featureCheck: {
    width: 18, height: 18, borderRadius: 5,
    border: "1px solid",
    fontSize: 11, fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  featureText: {
    fontSize: 12.5,
    color: C.text,
    lineHeight: 1.45,
    flex: 1,
  },

  // CTA
  tierCta: {
    position: "relative",
    width: "100%",
    padding: "13px",
    border: "none",
    borderRadius: 12,
    fontSize: 13.5, fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    overflow: "hidden",
  },
  ctaShimmer: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.35) 50%, transparent 65%)",
    backgroundSize: "200% 100%",
    animation: "pwShimmer 2.4s linear infinite",
    pointerEvents: "none",
  },

  // Free note
  freeNote: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    background: "rgba(255,255,255,0.025)",
    border: `1px dashed ${C.border}`,
    borderRadius: 10,
    fontSize: 11, color: C.muted,
    lineHeight: 1.4,
    marginBottom: 10,
  },
  freeNoteLabel: {
    fontSize: 9, fontWeight: 900, letterSpacing: 1.5,
    background: "rgba(255,255,255,0.06)",
    color: C.muted,
    padding: "2px 7px", borderRadius: 4,
    fontFamily: "'JetBrains Mono', monospace",
    flexShrink: 0,
  },

  // Footer
  footer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingTop: 6,
  },
  footerLink: {
    background: "transparent",
    border: "none",
    color: C.muted,
    fontSize: 11.5, fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    padding: "4px 6px",
  },
  footerDivider: {
    color: C.dim,
    fontSize: 14,
  },
};