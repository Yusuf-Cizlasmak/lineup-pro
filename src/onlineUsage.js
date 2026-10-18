// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · onlineUsage — Aylık oda kurma kotası (sunucu destekli)
// ─────────────────────────────────────────────────────────────
// Free kullanıcı ayda FREE_LIMITS.ONLINE_CREATES_PER_MONTH oda kurabilir,
// maçlara katılım sınırsızdır.
//
// Kaynak: Supabase `match_sessions` tablosu — bu cihazın (admin_id) bu ay
// kurduğu odalar sayılır. Ekstra tablo / RPC gerekmez. localStorage sadece
// offline cache: ikisinden BÜYÜK olan kullanılır, böylece localStorage'ı
// elle düzenlemek ya da ağ hatası kotayı açmaz.
//
// KULLANIM (async):
//   import { canCreateOnline } from "./onlineUsage";
//   const gate = await canCreateOnline();
//   if (!gate.allowed) { openPaywall("unlimited_online"); return; }
//   ... createSession başarılı ...
//   incrementOnlineMatchCount();   // subscription.js — lokal cache
// ─────────────────────────────────────────────────────────────

import { supabase, getDeviceId } from "./LiveMatchService";
import {
  isPremium, FREE_LIMITS,
  getOnlineMatchCount, setOnlineMatchCount,
  getMonthStart, getNextMonthStart,
} from "./subscription";

// Bu cihazın bu ay kurduğu oda sayısı (sunucu)
async function fetchServerMonthlyCreates() {
  const { count, error } = await supabase
    .from("match_sessions")
    .select("id", { count: "exact", head: true })
    .eq("admin_id", getDeviceId())
    .gte("created_at", getMonthStart().toISOString());
  if (error) throw error;
  return count || 0;
}

// Sunucu sayısını lokal cache'e yansıt → UI (ayarlar kartı, Maç Kur butonu) tutarlı olsun
export async function syncOnlineUsage() {
  const local = getOnlineMatchCount().count;
  try {
    const server = await fetchServerMonthlyCreates();
    if (server > local) setOnlineMatchCount(server);
    return Math.max(server, local);
  } catch (e) {
    console.warn("[onlineUsage] sunucu sayımı başarısız, cache kullanılıyor:", e?.message);
    return local;
  }
}

export async function canCreateOnline() {
  if (isPremium()) return { allowed: true, remaining: Infinity, used: 0, limit: Infinity };
  const used = await syncOnlineUsage();
  const limit = FREE_LIMITS.ONLINE_CREATES_PER_MONTH;
  const remaining = Math.max(0, limit - used);
  return {
    allowed: remaining > 0,
    remaining,
    used,
    limit,
    resetsAt: getNextMonthStart().getTime(),
  };
}

// "1 Kasım" gibi — kota yenilenme tarihi metni
export const formatResetDate = (ts) => {
  try {
    return new Date(ts).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
  } catch {
    return "ay başında";
  }
};
