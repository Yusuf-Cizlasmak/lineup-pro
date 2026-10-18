// ═════════════════════════════════════════════════════════════
// HalıSaha-Kolik · send-push — Supabase Edge Function (Deno)
// ═════════════════════════════════════════════════════════════
// Supabase Database Webhook'larından gelen olaylarla FCM HTTP v1 bildirimi yollar.
// npm bağımlılığı YOK: Google OAuth2 (servis hesabı JWT, RS256) Web Crypto ile.
//
// TETİKLEYİCİLER (Dashboard → Database → Webhooks, bkz. docs/BILDIRIM_KURULUM.md):
//   (a) INSERT session_players  → oda sahibine: "{nickname} maça katıldı · 9/14"
//                                  data { route: "online", kind: "join", code }
//   (b) UPDATE match_sessions   → mvp_device_id değiştiyse:
//                                  MVP'ye "⭐ Haftanın MVP'si sensin!"
//                                  diğerlerine "⭐ MVP: {nickname}"
//                                  data { route: "online", kind: "mvp" }
//   (c) TEST (elle):  { "test": { "device_id": "...", "title": "...", "body": "..." } }
//
// GİZLİ DEĞİŞKENLER (supabase secrets set ...):
//   FIREBASE_SERVICE_ACCOUNT  → Firebase servis hesabı JSON'u (tamamı; base64 de olur)
//   WEBHOOK_SECRET            → webhook isteğindeki "x-webhook-secret" başlığıyla aynı olmalı
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY → Supabase otomatik verir
//     (yeni tip "sb_secret_..." anahtarı kullanıyorsan SERVICE_ROLE_KEY olarak ekle)
//
// Deploy:  supabase functions deploy send-push --no-verify-jwt
//   (JWT doğrulaması kapalı; koruma x-webhook-secret ile yapılır.)
// ═════════════════════════════════════════════════════════════

// deno-lint-ignore-file no-explicit-any

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const SERVICE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";

// Android bildirim kanalı — src/push.js PUSH_CHANNEL_ID ile aynı
const ANDROID_CHANNEL_ID = "hk_push";

// ═══ Yardımcılar ═══
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

// Zamanlama saldırısına dayanıklı karşılaştırma
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

function b64url(bytes: Uint8Array | string): string {
  const arr = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const isUuid = (s: unknown): s is string =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// ═══ Firebase servis hesabı ═══
type ServiceAccount = { project_id: string; client_email: string; private_key: string };
let _sa: ServiceAccount | null = null;

function getServiceAccount(): ServiceAccount {
  if (_sa) return _sa;
  let raw = (Deno.env.get("FIREBASE_SERVICE_ACCOUNT") ?? "").trim();
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT tanımlı değil");
  if (!raw.startsWith("{")) {
    try { raw = atob(raw); } catch { /* düz metin değil */ }
  }
  const sa = JSON.parse(raw);
  if (!sa.project_id || !sa.client_email || !sa.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT eksik alan (project_id / client_email / private_key)");
  }
  _sa = {
    project_id: sa.project_id,
    client_email: sa.client_email,
    private_key: String(sa.private_key).replace(/\\n/g, "\n"),
  };
  return _sa;
}

// ═══ Google OAuth2 erişim token'ı (önbellekli) ═══
let _accessToken: { value: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_accessToken && _accessToken.exp - 60 > now) return _accessToken.value;

  const sa = getServiceAccount();
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)),
  );
  const assertion = `${unsigned}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(`Google token alınamadı: ${res.status} ${JSON.stringify(body)}`);
  }
  _accessToken = { value: body.access_token, exp: now + Number(body.expires_in || 3600) };
  return _accessToken.value;
}

// ═══ Supabase REST (service role → RLS'i aşar) ═══
function restHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { apikey: SERVICE_KEY, ...extra };
  // Eski tip JWT anahtarı (eyJ...) Authorization ister; yeni "sb_secret_" sadece apikey
  if (SERVICE_KEY.startsWith("eyJ")) h.Authorization = `Bearer ${SERVICE_KEY}`;
  return h;
}

function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...restHeaders(), ...(init.headers as Record<string, string> ?? {}) },
  });
}

async function restJson<T = any>(path: string): Promise<T | null> {
  const res = await rest(path);
  if (!res.ok) {
    console.warn("[send-push] REST hata", path, res.status, await res.text().catch(() => ""));
    return null;
  }
  return await res.json() as T;
}

async function getSession(sessionId: string): Promise<any | null> {
  const rows = await restJson<any[]>(
    `match_sessions?id=eq.${encodeURIComponent(sessionId)}&select=*&limit=1`,
  );
  return rows?.[0] ?? null;
}

async function getSessionPlayers(sessionId: string): Promise<{ device_id: string; nickname: string | null }[]> {
  const rows = await restJson<any[]>(
    `session_players?session_id=eq.${encodeURIComponent(sessionId)}&select=device_id,nickname`,
  );
  return (rows ?? []).filter((r) => isUuid(r?.device_id));
}

async function getTokens(deviceIds: string[]): Promise<{ device_id: string; token: string; platform: string | null }[]> {
  const ids = [...new Set(deviceIds.filter(isUuid))];
  if (ids.length === 0) return [];
  const rows = await restJson<any[]>(
    `push_tokens?device_id=in.(${ids.join(",")})&select=device_id,token,platform`,
  );
  return (rows ?? []).filter((r) => typeof r?.token === "string" && r.token.length > 0);
}

async function deleteToken(token: string): Promise<void> {
  try {
    await rest(`push_tokens?token=eq.${encodeURIComponent(token)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  } catch { /* önemli değil */ }
}

// Formasyon "3-2-1" → kaleci dahil 7 kişi
function teamSize(formation: unknown): number | null {
  if (typeof formation !== "string" || !/^\d+(-\d+)*$/.test(formation)) return null;
  const n = formation.split("-").reduce((s, x) => s + Number(x), 0) + 1;
  return n > 1 && n <= 12 ? n : null;
}

// ═══ FCM HTTP v1 gönderimi ═══
type Push = {
  title: string;
  body: string;
  data?: Record<string, string>;
  collapseKey?: string; // aynı anahtar → önceki bildirimin yerine geçer (birleştirme)
};

async function sendToToken(token: string, push: Push): Promise<"ok" | "invalid" | "error"> {
  const sa = getServiceAccount();
  const access = await getAccessToken();
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(push.data ?? {})) {
    if (v !== undefined && v !== null) data[k] = String(v);
  }
  const message: any = {
    token,
    notification: { title: push.title, body: push.body },
    data,
    android: {
      priority: "HIGH",
      notification: {
        channel_id: ANDROID_CHANNEL_ID,
        sound: "default",
        ...(push.collapseKey ? { tag: push.collapseKey } : {}),
      },
      ...(push.collapseKey ? { collapse_key: push.collapseKey } : {}),
    },
    apns: {
      headers: {
        "apns-priority": "10",
        ...(push.collapseKey ? { "apns-collapse-id": push.collapseKey.slice(0, 64) } : {}),
      },
      payload: {
        aps: {
          sound: "default",
          ...(push.collapseKey ? { "thread-id": push.collapseKey } : {}),
        },
      },
    },
  };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ message }),
    },
  );
  if (res.ok) return "ok";

  const err = await res.json().catch(() => ({}));
  const details: any[] = err?.error?.details ?? [];
  const code = details.find((d) => d?.errorCode)?.errorCode ?? err?.error?.status ?? "";
  // Uygulama silinmiş / token geçersiz → tablodan temizle
  if (
    res.status === 404 || code === "UNREGISTERED" ||
    (code === "INVALID_ARGUMENT" && /registration token/i.test(String(err?.error?.message ?? "")))
  ) {
    await deleteToken(token);
    return "invalid";
  }
  console.warn("[send-push] FCM hata", res.status, JSON.stringify(err));
  return "error";
}

async function sendToDevices(deviceIds: string[], push: Push) {
  const tokens = await getTokens(deviceIds);
  const result = { targets: deviceIds.length, tokens: tokens.length, sent: 0, invalid: 0, failed: 0 };
  await Promise.all(
    tokens.map(async (t) => {
      try {
        const r = await sendToToken(t.token, push);
        if (r === "ok") result.sent++;
        else if (r === "invalid") result.invalid++;
        else result.failed++;
      } catch (e) {
        result.failed++;
        console.warn("[send-push] gönderim hatası", String((e as Error)?.message ?? e));
      }
    }),
  );
  return result;
}

// ═══ (a) Odaya katılım → oda sahibine ═══
async function handlePlayerJoined(record: any) {
  const sessionId = record?.session_id;
  const joiner = record?.device_id;
  if (!isUuid(sessionId) || !isUuid(joiner)) return { skipped: "bad_record" };

  const session = await getSession(sessionId);
  if (!session) return { skipped: "no_session" };
  if (session.status === "finished") return { skipped: "finished" };
  const adminId = session.admin_id;
  if (!isUuid(adminId)) return { skipped: "no_admin" };
  if (joiner === adminId) return { skipped: "admin_joined" }; // oda sahibinin kendisi

  const players = await getSessionPlayers(sessionId);
  const count = players.length || 1;
  const a = teamSize(session.formation_a);
  const b = teamSize(session.formation_b);
  const capacity = a && b ? a + b : null;

  const nickname = String(record?.nickname || "Bir oyuncu").slice(0, 40);
  const where = String(session.field_name || "").trim();
  const body = capacity ? `${nickname} maça katıldı · ${count}/${capacity}` : `${nickname} maça katıldı · ${count} kişi`;

  return await sendToDevices([adminId], {
    title: where ? `⚽ ${where}` : "⚽ Odana yeni oyuncu",
    body,
    data: {
      route: "online",
      kind: "join",
      session_id: sessionId,
      ...(session.join_code ? { code: String(session.join_code) } : {}),
    },
    collapseKey: `join-${sessionId}`, // art arda katılımlar tek bildirimde güncellenir
  });
}

// ═══ (b) MVP seçildi ═══
async function handleSessionUpdated(record: any, oldRecord: any) {
  const sessionId = record?.id;
  const mvp = record?.mvp_device_id;
  if (!isUuid(sessionId)) return { skipped: "bad_record" };
  if (!isUuid(mvp)) return { skipped: "no_mvp" };
  if (oldRecord && oldRecord.mvp_device_id === mvp) return { skipped: "mvp_unchanged" };

  const players = await getSessionPlayers(sessionId);
  const mvpRow = players.find((p) => p.device_id === mvp);
  const mvpName = String(mvpRow?.nickname || "Bir oyuncu").slice(0, 40);
  const where = String(record?.field_name || "").trim();
  const data = { route: "online", kind: "mvp", session_id: sessionId };
  const collapseKey = `mvp-${sessionId}`; // MVP değişirse eski bildirimin yerine geçer

  const toMvp = await sendToDevices([mvp], {
    title: "⭐ Haftanın MVP'si sensin!",
    body: where ? `${where} maçının yıldızı seçildin. Tebrikler! 👑` : "Maçın yıldızı seçildin. Tebrikler! 👑",
    data,
    collapseKey,
  });

  // Diğer oyuncular (MVP ve MVP'yi seçen oda sahibi hariç)
  const others = players
    .map((p) => p.device_id)
    .filter((id) => id !== mvp && id !== record?.admin_id);
  const toOthers = others.length
    ? await sendToDevices(others, {
      title: `⭐ MVP: ${mvpName}`,
      body: where ? `${where} maçının MVP'si belli oldu.` : "Maçın MVP'si belli oldu.",
      data,
      collapseKey,
    })
    : { targets: 0, tokens: 0, sent: 0, invalid: 0, failed: 0 };

  return { mvp: toMvp, others: toOthers };
}

// ═══ HTTP giriş noktası ═══
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // Paylaşılan gizli anahtar kontrolü
  if (!WEBHOOK_SECRET) return json(500, { error: "WEBHOOK_SECRET tanımlı değil" });
  const given = req.headers.get("x-webhook-secret") ?? "";
  if (!safeEqual(given, WEBHOOK_SECRET)) return json(401, { error: "unauthorized" });

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY eksik" });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "bad_json" });
  }

  try {
    // (c) Elle test: { "test": { "device_id": "...", "title": "...", "body": "...", "route": "online" } }
    if (payload?.test) {
      const t = payload.test;
      if (!isUuid(t.device_id)) return json(400, { error: "test.device_id uuid olmalı" });
      const r = await sendToDevices([t.device_id], {
        title: String(t.title || "HalıSaha-Kolik"),
        body: String(t.body || "Test bildirimi ⚽"),
        data: { kind: "test", ...(t.route ? { route: String(t.route) } : {}) },
      });
      return json(200, { ok: true, kind: "test", ...r });
    }

    // Supabase Database Webhook: { type, table, schema, record, old_record }
    const { type, table, record, old_record } = payload ?? {};
    if (type === "INSERT" && table === "session_players") {
      return json(200, { ok: true, kind: "join", result: await handlePlayerJoined(record) });
    }
    if (type === "UPDATE" && table === "match_sessions") {
      return json(200, { ok: true, kind: "mvp", result: await handleSessionUpdated(record, old_record) });
    }
    return json(200, { ok: true, skipped: `ignored ${type ?? "?"} ${table ?? "?"}` });
  } catch (e) {
    console.error("[send-push] hata", String((e as Error)?.message ?? e));
    return json(500, { ok: false, error: String((e as Error)?.message ?? e) });
  }
});
