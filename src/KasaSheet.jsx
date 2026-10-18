// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · KasaSheet — saha ücreti, kişi başı tutar, kim ödedi
// ─────────────────────────────────────────────────────────────
// App.js'te mount edilir.
//   • window "halisaha:open-kasa" { matchId? } → açılır (varsayılan: son maç)
//   • "halisaha:match-saved" + planda saha ücreti > 0 → maç başına BİR KEZ
//     otomatik açılır (maç sonucu modalı kapandıktan sonra)
// Veri: kasa.js (localStorage "halisaha_kasa"), tamamen cihazda.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { hapticLight, hapticSelection, hapticSuccess } from "./haptics";
import { track, EVENTS } from "./analytics";
import { SHARE_FOOTER } from "./deepLink";
import { isPremium } from "./subscription";
import { getSchedule } from "./matchSchedule";
import {
  getKasaMatches, summarizeMatchKasa, computeBalances, debtLabel, buildKasaShareText,
  getMatchFee, setMatchFee, trackMatch, togglePaid, setAllPaid,
  wasAutoOpened, markAutoOpened,
} from "./kasa";
import { SheetShell, SC, primaryBtn, ghostBtn, inputStyle, fieldLabel, useBannerHidden, whenUiCalm } from "./ScheduleSheet";

const matchLabel = (m) => {
  if (!m) return "";
  const d = new Date(m.playedAt || Date.now());
  const date = d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", weekday: "short" });
  const a = m.teamA || {};
  const b = m.teamB || {};
  return `${date} · ${a.name || "Takım A"} ${a.score ?? 0}–${b.score ?? 0} ${b.name || "Takım B"}`;
};

export default function KasaSheet() {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState([]);
  const [idx, setIdx] = useState(0);
  const [feeText, setFeeText] = useState("");
  const [rev, setRev] = useState(0); // kasa.js yazımlarından sonra yeniden hesapla
  const [note, setNote] = useState("");

  useBannerHidden(open);

  const match = matches[idx] || null;

  // Maç değişince ücret alanını o maçın ücretine çek.
  // track=true → maç Kasa takibine alınır (birikmiş borca girer). Eski maçlara
  // ‹ › ile göz atmak takibe ALMAZ; ancak ödeme işaretlenince / ücret girilince alınır.
  const selectMatch = (list, i, trackIt = false) => {
    const m = list[i];
    setIdx(i);
    setNote("");
    if (m) {
      if (trackIt) trackMatch(m.id);
      const f = getMatchFee(m.id);
      setFeeText(f ? String(f) : "");
    } else {
      setFeeText("");
    }
    setRev((r) => r + 1);
  };

  useEffect(() => {
    let cancelAuto = null;

    const openFor = (matchId, action = "open") => {
      const list = getKasaMatches().slice(0, 12);
      let i = matchId ? list.findIndex((m) => m.id === matchId) : 0;
      if (i < 0) i = 0;
      setMatches(list);
      selectMatch(list, i, true);
      setOpen(true);
      track(EVENTS.KASA_USED, { action });
    };

    const onOpen = (e) => openFor(e?.detail?.matchId || null, "open");
    // Uzak push vb. "halisaha:navigate" { route: "kasa" } gönderirse de aç (tolerans)
    const onNavigate = (e) => {
      if (e?.detail?.route === "kasa") openFor(e.detail.matchId || null, "open");
    };

    // Maç kaydı → planda ücret varsa Kasa'yı bir kez otomatik aç
    const onMatchSaved = (e) => {
      const id = e?.detail?.id;
      const fee = Number(getSchedule()?.fee) || 0;
      if (!id || fee <= 0 || wasAutoOpened(id)) return;
      markAutoOpened(id);
      if (cancelAuto) cancelAuto();
      cancelAuto = whenUiCalm(() => openFor(id, "auto_open"), { initialDelay: 1500 });
    };

    window.addEventListener("halisaha:open-kasa", onOpen);
    window.addEventListener("halisaha:navigate", onNavigate);
    window.addEventListener("halisaha:match-saved", onMatchSaved);
    return () => {
      window.removeEventListener("halisaha:open-kasa", onOpen);
      window.removeEventListener("halisaha:navigate", onNavigate);
      window.removeEventListener("halisaha:match-saved", onMatchSaved);
      if (cancelAuto) cancelAuto();
    };
    // selectMatch yalnızca state setter + saf fonksiyon kullanır → bayat closure sorun değil
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fee = Math.max(0, parseInt(String(feeText).replace(/\D/g, ""), 10) || 0);

  const summary = useMemo(
    () => (match ? summarizeMatchKasa(match, fee) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [match, fee, rev]
  );
  const balances = useMemo(
    () => (open ? computeBalances(match?.id || null) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, match, rev]
  );
  const oldDebtByKey = useMemo(() => {
    const map = {};
    balances.forEach((b) => { map[b.key] = b; });
    return map;
  }, [balances]);

  const schedule = open ? getSchedule() : null;
  const iban = schedule?.iban || "";

  const commitFee = () => {
    if (!match) return;
    if (getMatchFee(match.id) === fee) return;
    setMatchFee(match.id, fee);
    track(EVENTS.KASA_USED, { action: "set_fee" });
    setRev((r) => r + 1);
  };

  const handleToggle = (name) => {
    if (!match) return;
    hapticSelection();
    commitFee();
    togglePaid(match.id, name);
    track(EVENTS.KASA_USED, { action: "toggle_paid" });
    setRev((r) => r + 1);
  };

  const handleAllPaid = () => {
    if (!match || !summary) return;
    hapticLight();
    commitFee();
    const allPaid = summary.unpaid.length === 0;
    setAllPaid(match.id, !allPaid);
    track(EVENTS.KASA_USED, { action: allPaid ? "clear_paid" : "all_paid" });
    setRev((r) => r + 1);
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const handleShare = async () => {
    if (!match) return;
    hapticSuccess();
    commitFee();
    let branded = true;
    try { branded = !isPremium(); } catch {}
    const text = buildKasaShareText(match, { fee, iban, footer: branded ? SHARE_FOOTER : "" });
    track(EVENTS.KASA_USED, { action: "share" });
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ text, dialogTitle: "Kasa — WhatsApp'a gönder" });
        return;
      }
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch (e) {
      // Kullanıcı paylaşımı iptal ettiyse sessiz geç
      if (/cancel|abort/i.test(String(e?.message || e?.name || ""))) return;
    }
    setNote((await copyText(text)) ? "Mesaj panoya kopyalandı — WhatsApp'a yapıştır." : "Paylaşım açılamadı.");
  };

  const handleCopyIban = async () => {
    hapticLight();
    const ok = await copyText(iban.replace(/\s+/g, ""));
    setNote(ok ? "IBAN kopyalandı." : "Kopyalanamadı.");
    track(EVENTS.KASA_USED, { action: "copy_iban" });
  };

  const go = (dir) => {
    const ni = idx + dir;
    if (ni < 0 || ni >= matches.length) return;
    hapticSelection();
    commitFee();
    selectMatch(matches, ni);
  };

  const total = summary ? summary.perHead * summary.count : 0;
  const pct = total > 0 ? Math.min(100, Math.round((summary.collected / total) * 100)) : 0;

  return (
    <SheetShell
      open={open}
      onClose={() => { commitFee(); setOpen(false); }}
      icon="💰"
      eyebrow="KASA"
      title="SAHA ÜCRETİ"
      subtitle="Kişi başı tutar, kim ödedi, birikmiş borçlar"
      footer={match ? (
        <button onClick={handleShare} style={{ ...primaryBtn, background: "linear-gradient(135deg, #25d366, #128c7e)" }}>
          WhatsApp'a gönder
        </button>
      ) : null}
    >
      {!match && (
        <div style={{ textAlign: "center", padding: "26px 12px 18px", color: SC.inkDim }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>🧾</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: SC.ink }}>Henüz kayıtlı maç yok</div>
          <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>
            Maçı bitirip skoru kaydedince gelenlere göre kişi başı tutar burada hesaplanır.
          </div>
          {!schedule?.fee && (
            <button
              onClick={() => { setOpen(false); setTimeout(() => window.dispatchEvent(new CustomEvent("halisaha:open-schedule")), 240); }}
              style={{ ...ghostBtn, marginTop: 16, color: SC.primary, borderColor: `${SC.primary}55` }}
            >
              ⏰ Haftalık maç planına saha ücreti ekle
            </button>
          )}
        </div>
      )}

      {match && summary && (
        <>
          {/* Maç seçici */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6, padding: 6, borderRadius: 12,
            background: SC.surface, border: `1px solid ${SC.line}`,
          }}>
            <button onClick={() => go(1)} disabled={idx >= matches.length - 1} aria-label="Önceki maç" style={arrowBtn(idx >= matches.length - 1)}>‹</button>
            <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {matchLabel(match)}
              </div>
              <div style={{ fontSize: 10, color: SC.inkFaint, marginTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>
                {idx === 0 ? "SON MAÇ" : `${idx} MAÇ ÖNCE`} · {summary.count} KİŞİ GELDİ
              </div>
            </div>
            <button onClick={() => go(-1)} disabled={idx <= 0} aria-label="Sonraki maç" style={arrowBtn(idx <= 0)}>›</button>
          </div>

          {/* Ücret + kişi başı */}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={fieldLabel}>Saha ücreti</div>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={feeText}
                  onChange={(e) => setFeeText(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onBlur={commitFee}
                  placeholder="Örn. 1400"
                  style={{ ...inputStyle, paddingRight: 34, fontWeight: 700 }}
                />
                <span style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", color: SC.inkFaint, fontWeight: 700 }}>₺</span>
              </div>
            </div>
            <div style={{
              flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: 11,
              background: `${SC.gold}12`, border: `1px solid ${SC.gold}40`,
            }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.3, color: `${SC.gold}cc`, fontFamily: "'JetBrains Mono', monospace" }}>KİŞİ BAŞI</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: SC.gold, lineHeight: 1.1 }}>
                {summary.perHead}₺
              </div>
            </div>
          </div>
          {fee > 0 && summary.count > 0 && (
            <div style={{ fontSize: 10.5, color: SC.inkFaint, margin: "6px 2px 0" }}>
              {fee}₺ ÷ {summary.count} kişi, 5₺'ye yukarı yuvarlandı
            </div>
          )}

          {/* Tahsilat çubuğu */}
          {fee > 0 && summary.count > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: SC.inkDim, marginBottom: 5 }}>
                <span>Toplanan: <b style={{ color: SC.ink }}>{summary.collected}₺</b> / {total}₺</span>
                <span>{summary.unpaid.length ? `${summary.unpaid.length} kişi ödemedi` : "Herkes ödedi ✅"}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: SC.surface, overflow: "hidden", border: `1px solid ${SC.line}` }}>
                <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${SC.primaryDim}, ${SC.primary})`, transition: "width 0.25s" }} />
              </div>
            </div>
          )}

          {/* Oyuncular */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={fieldLabel}>Gelenler</div>
            {summary.count > 0 && (
              <button onClick={handleAllPaid} style={{
                background: "none", border: "none", color: SC.primary, fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit", padding: "10px 4px 4px",
              }}>
                {summary.unpaid.length === 0 ? "İşaretleri temizle" : "Hepsi ödedi"}
              </button>
            )}
          </div>
          {summary.count === 0 && (
            <div style={{ fontSize: 12.5, color: SC.inkDim, padding: "6px 2px" }}>
              Bu maçta kayıtlı oyuncu yok.
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {summary.attendees.map((a) => {
              const paid = !!summary.paidMap[a.key];
              const old = oldDebtByKey[a.key];
              return (
                <button
                  key={a.key}
                  onClick={() => handleToggle(a.name)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                    padding: "10px 12px", borderRadius: 11, cursor: "pointer", fontFamily: "inherit",
                    minHeight: 46,
                    background: paid ? `${SC.primary}10` : SC.surface,
                    border: `1px solid ${paid ? `${SC.primary}44` : SC.line}`,
                    color: SC.ink,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {a.name}
                      {a.isGuest && (
                        <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, color: SC.blue, border: `1px solid ${SC.blue}55`, borderRadius: 5, padding: "1px 5px" }}>MİSAFİR</span>
                      )}
                    </div>
                    {old && (
                      <div style={{ fontSize: 10.5, color: SC.red, marginTop: 1 }}>
                        + önceki {old.matches} maç borcu ({old.amount}₺)
                      </div>
                    )}
                  </div>
                  <span style={{
                    flexShrink: 0, fontSize: 11.5, fontWeight: 800, padding: "6px 10px", borderRadius: 8,
                    background: paid ? SC.primary : "transparent",
                    color: paid ? "#06140e" : SC.inkDim,
                    border: `1px solid ${paid ? SC.primary : SC.lineHi}`,
                  }}>
                    {paid ? "Ödedi ✓" : "Ödemedi"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Birikmiş borçlar (diğer maçlardan) */}
          {balances.length > 0 && (
            <>
              <div style={fieldLabel}>Birikmiş borçlar</div>
              <div style={{
                borderRadius: 11, border: `1px solid ${SC.red}33`, background: `${SC.red}0a`, padding: "4px 12px",
              }}>
                {balances.slice(0, 10).map((b) => (
                  <div key={b.key} style={{
                    display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0",
                    borderBottom: `1px solid ${SC.line}`, fontSize: 12.5,
                  }}>
                    <span style={{ color: SC.ink }}>{debtLabel(b)}</span>
                    <span style={{ color: SC.red, fontWeight: 800, flexShrink: 0 }}>{b.amount}₺</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10.5, color: SC.inkFaint, margin: "6px 2px 0" }}>
                Eski maçları ‹ › ile açıp "Ödedi" işaretleyerek kapatabilirsin.
              </div>
            </>
          )}

          {/* IBAN */}
          {iban ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginTop: 14, padding: "10px 12px", borderRadius: 11,
              background: SC.surface, border: `1px solid ${SC.line}`,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.3, color: SC.inkFaint, fontFamily: "'JetBrains Mono', monospace" }}>IBAN</div>
                <div style={{ fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{iban}</div>
              </div>
              <button onClick={handleCopyIban} style={{ ...ghostBtn, width: "auto", padding: "8px 12px", fontSize: 12 }}>Kopyala</button>
            </div>
          ) : (
            <button
              onClick={() => { setOpen(false); setTimeout(() => window.dispatchEvent(new CustomEvent("halisaha:open-schedule")), 240); }}
              style={{ ...ghostBtn, marginTop: 14, fontSize: 12 }}
            >
              + IBAN ekle (haftalık maç planı)
            </button>
          )}

          {note && (
            <div style={{ fontSize: 12, color: SC.primary, margin: "10px 2px 0", textAlign: "center" }}>{note}</div>
          )}
        </>
      )}
    </SheetShell>
  );
}

const arrowBtn = (disabled) => ({
  width: 38, height: 38, borderRadius: 9, flexShrink: 0, cursor: disabled ? "default" : "pointer",
  background: disabled ? "transparent" : SC.surfaceHi, border: `1px solid ${disabled ? "transparent" : SC.line}`,
  color: disabled ? SC.inkFaint : SC.ink, fontSize: 20, fontWeight: 700, fontFamily: "inherit",
  opacity: disabled ? 0.35 : 1,
});
