// ─────────────────────────────────────────────────────────────
// Cloudflare Workers · Davet Linki (Deep Link) Sunucusu
// ─────────────────────────────────────────────────────────────
// Bu dosya `public/_worker.js` olarak duruyor — CRA build sırasında
// `build/_worker.js`'e kopyalanır; wrangler (wrangler.toml → main) bunu
// Worker olarak, build/ klasörünü de statik asset olarak yayınlar.
//
//   Deploy:  npm run deploy:web     (= npm run build && npx wrangler deploy)
//   Kurulum: docs/DAVET_LINKI_KURULUM.md
//
// Rotalar:
//   /.well-known/apple-app-site-association → iOS Universal Links doğrulaması
//   /.well-known/assetlinks.json           → Android App Links doğrulaması
//   /m/HK-AB12  (ve /join/HK-AB12)         → Davet sayfası
//       • App yüklüyse bu sayfa hiç açılmaz: iOS/Android linki doğrudan
//         uygulamaya verir, uygulama odaya katılır.
//       • iPhone  → (Universal Links kapalıysa önce halisahakolik:// dener) → App Store
//       • Android Chrome → sunucu 302 ile intent:// → app açılır; yüklü değilse
//         Google Play (sayfa hiç görünmez). Diğer Android tarayıcılar → sayfa + intent
//       • Masaüstü → maç bilgisi + "Tarayıcıda devam et" + mağaza butonları
//       • WhatsApp / Telegram önizleme botları → maç bilgisiyle OG etiketleri
//   Diğer her şey → build/ (web app)
//
// Ayarlar wrangler.toml [vars] içinden gelir; aşağıdaki DEFAULTS yedektir.
// ─────────────────────────────────────────────────────────────

const DEFAULTS = {
  SCHEME: 'halisahakolik',
  ANDROID_PACKAGE: 'com.halisahakolik.app',
  IOS_TEAM_ID: 'Q3BH6457BX',
  IOS_BUNDLE_ID: 'com.halisahakolik.app',
  // App Store Connect → Uygulama Bilgileri → "Apple Kimliği" (sadece rakam)
  IOS_APP_STORE_ID: '',
  // App.entitlements imzaya eklenmiş bir sürüm yayındaysa "true" yap
  // (codemagic.yaml → ENABLE_UNIVERSAL_LINKS). "false" iken iPhone'da
  // önce halisahakolik:// denenir, açılmazsa App Store'a gidilir.
  IOS_UNIVERSAL_LINKS: 'false',
  // Play Console → Test ve yayınla → Uygulama bütünlüğü → Uygulama imzalama
  // anahtarı sertifikası → SHA-256. Birden fazlaysa virgülle ayır.
  ANDROID_SHA256_FINGERPRINTS: '',
  // Davet sayfasında maç bilgisini göstermek için (anon key zaten herkese açık)
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  // Davet linklerinin asıl adresi (örn. "davet.halisahakolik.com.tr"). Başka bir
  // host'tan (kök domain route'u) gelen /m/ istekleri buraya yönlendirilir.
  // *.workers.dev adresi test için yönlendirilmeden çalışır.
  PUBLIC_HOST: '',
};

const config = (env) => {
  const c = {};
  for (const k of Object.keys(DEFAULTS)) {
    const v = env && typeof env[k] === 'string' ? env[k].trim() : '';
    c[k] = v || DEFAULTS[k];
  }
  return c;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const c = config(env);
    const path = url.pathname;

    // ─── iOS Universal Links ───
    if (path === '/.well-known/apple-app-site-association' || path === '/apple-app-site-association') {
      return json(appleAppSiteAssociation(c));
    }

    // ─── Android App Links ───
    if (path === '/.well-known/assetlinks.json') {
      return json(assetLinks(c));
    }

    // ─── Davet sayfası: /m/HK-AB12 ───
    const codeMatch = path.match(/^\/(?:m|join)\/(HK-?[A-Z0-9]{4,8})\/?$/i);
    if (codeMatch) {
      const code = normalizeCode(codeMatch[1]);

      // Kök domain gibi başka bir host'tan geldiyse asıl davet adresine taşı
      // (Universal / App Links yalnızca PUBLIC_HOST için tanımlı)
      if (c.PUBLIC_HOST && url.hostname !== c.PUBLIC_HOST && !url.hostname.endsWith('.workers.dev')) {
        return Response.redirect(`https://${c.PUBLIC_HOST}/m/${code}${url.search}`, 302);
      }

      const ua = (request.headers.get('user-agent') || '').toLowerCase();
      const platform = detectPlatform(ua);

      // Android Chrome: sunucu tarafı 302 → intent://. Chrome, linke dokunulmasıyla
      // başlayan yönlendirmede intent'i her zaman açar (JS ile açmayı bazen engeller):
      // app yüklüyse açılır, değilse browser_fallback_url → Google Play.
      // ?sayfa=1 ile davet sayfası zorla gösterilir.
      if (platform === 'android' && isChromeLike(ua) && !url.searchParams.has('sayfa')) {
        return new Response(null, {
          status: 302,
          headers: { Location: buildIntentUrl(c, code), 'Cache-Control': 'no-store' },
        });
      }

      const session = await fetchSession(c, code);
      return new Response(renderInvitePage({ c, url, code, session, platform }), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Robots-Tag': 'noindex',
        },
      });
    }

    // ─── Default: statik asset (web app) ───
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Static asset binding (ASSETS) tanımlı değil. wrangler.toml kontrol et.', {
      status: 500,
    });
  },
};

// ═══════════════════════════════════════════════════════════
// DOĞRULAMA DOSYALARI
// ═══════════════════════════════════════════════════════════

function appleAppSiteAssociation(c) {
  const appID = `${c.IOS_TEAM_ID}.${c.IOS_BUNDLE_ID}`;
  return {
    applinks: {
      apps: [],
      details: [{
        // iOS 13+ formatı
        appIDs: [appID],
        components: [{ '/': '/m/*' }, { '/': '/join/*' }],
        // iOS 12 ve öncesi
        appID,
        paths: ['/m/*', '/join/*'],
      }],
    },
  };
}

function assetLinks(c) {
  const fingerprints = c.ANDROID_SHA256_FINGERPRINTS
    .split(/[\s,]+/)
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
  if (!fingerprints.length) return [];
  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: c.ANDROID_PACKAGE,
      sha256_cert_fingerprints: fingerprints,
    },
  }];
}

// ═══════════════════════════════════════════════════════════
// YARDIMCILAR
// ═══════════════════════════════════════════════════════════

function json(body) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

function normalizeCode(raw) {
  const clean = String(raw).toUpperCase();
  return /^HK[A-Z0-9]{4,8}$/.test(clean) ? `HK-${clean.slice(2)}` : clean;
}

// Chrome / Chrome tabanlı tarayıcı (Samsung Internet, Custom Tabs). Uygulama içi
// WebView'lar ("; wv)" — Instagram, Facebook) intent'i güvenilir açmaz → sayfa gösterilir.
function isChromeLike(ua) {
  return /chrome\/\d+/.test(ua) && !/; wv\)/.test(ua) && !/firefox|opr\//.test(ua);
}

function buildIntentUrl(c, code) {
  const store = storeUrls(c, code);
  return `intent://join?code=${encodeURIComponent(code)}#Intent;` +
    `scheme=${c.SCHEME};package=${c.ANDROID_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(store.android)};end`;
}

function detectPlatform(ua) {
  // Önizleme botları (WhatsApp, Telegram, iMessage…) JS çalıştırmaz,
  // sadece OG etiketlerini okur — yönlendirme yapmayalım.
  if (/bot|crawler|spider|preview|whatsapp|telegram|facebookexternalhit|twitterbot|slackbot|discordbot/.test(ua)) return 'bot';
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  return 'desktop';
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

// <script> içine gömülen JSON'da "</script>" kaçışı
const jsonForScript = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

const safeColor = (col, fallback) => (/^#[0-9a-f]{3,8}$/i.test(col || '') ? col : fallback);

// Davet sayfasında maç bilgisini göster — yavaşsa/başarısızsa sayfa yine açılır
async function fetchSession(c, code) {
  if (!c.SUPABASE_URL || !c.SUPABASE_ANON_KEY) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const q = new URLSearchParams({
      select: 'field_name,location,team_a_name,team_b_name,team_a_color,team_b_color,scheduled_at,status',
      join_code: `eq.${code}`,
      limit: '1',
    });
    const res = await fetch(`${c.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/match_sessions?${q}`, {
      headers: {
        apikey: c.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${c.SUPABASE_ANON_KEY}`,
        Accept: 'application/json',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// "Sal, 20 Ekim · 21:00" (Türkiye saati)
function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const opt = { timeZone: 'Europe/Istanbul' };
    const day = d.toLocaleDateString('tr-TR', { ...opt, weekday: 'short' });
    const date = d.toLocaleDateString('tr-TR', { ...opt, day: 'numeric', month: 'long' });
    const time = d.toLocaleTimeString('tr-TR', { ...opt, hour: '2-digit', minute: '2-digit' });
    return `${day}, ${date} · ${time}`;
  } catch {
    return '';
  }
}

function storeUrls(c, code) {
  const referrer = encodeURIComponent(`hk_code=${code}`);
  return {
    ios: c.IOS_APP_STORE_ID
      ? `https://apps.apple.com/app/id${c.IOS_APP_STORE_ID}`
      // Apple ID girilene kadar: App Store'da isimle arama
      : 'itms-apps://search.itunes.apple.com/WebObjects/MZSearch.woa/wa/search?media=software&term=HaliSahaKolik',
    iosKnown: !!c.IOS_APP_STORE_ID,
    android: `https://play.google.com/store/apps/details?id=${c.ANDROID_PACKAGE}&referrer=${referrer}`,
  };
}

// ═══════════════════════════════════════════════════════════
// DAVET SAYFASI
// ═══════════════════════════════════════════════════════════

function renderInvitePage({ c, url, code, session, platform }) {
  const pageUrl = `${url.origin}/m/${code}`;
  const store = storeUrls(c, code);
  const schemeUrl = `${c.SCHEME}://join?code=${encodeURIComponent(code)}`;
  const intentUrl = buildIntentUrl(c, code);
  const webUrl = `${url.origin}/?code=${encodeURIComponent(code)}&web=1`;

  const finished = session?.status === 'finished';
  const teamA = session?.team_a_name || 'Takım A';
  const teamB = session?.team_b_name || 'Takım B';
  const colA = safeColor(session?.team_a_color, '#34d399');
  const colB = safeColor(session?.team_b_color, '#f87171');
  const when = formatDate(session?.scheduled_at);
  const field = session?.field_name || '';

  const title = finished
    ? 'Bu maç sona erdi · HalıSaha-Kolik'
    : session
      ? `⚽ ${teamA} vs ${teamB} — maça katıl!`
      : '⚽ Halı saha maçına davet edildin!';
  const description = [field && `📍 ${field}`, when && `🕒 ${when}`, `🔑 Kod: ${code}`]
    .filter(Boolean).join(' · ');

  const appleBanner = c.IOS_APP_STORE_ID
    ? `<meta name="apple-itunes-app" content="app-id=${escapeHtml(c.IOS_APP_STORE_ID)}, app-argument=${escapeHtml(pageUrl)}">`
    : '';

  const isPhone = platform === 'ios' || platform === 'android';
  const statusText = finished
    ? 'Bu davetin süresi doldu. Uygulamayı indirip kendi maçını kurabilirsin.'
    : {
      ios: 'Uygulama açılıyor… Yüklü değilse App Store\'a yönlendirileceksin.',
      android: 'Uygulama açılıyor… Yüklü değilse Google Play\'e yönlendirileceksin.',
      desktop: 'Bu linki telefonundan açarsan uygulama doğrudan maça girer.',
      bot: '',
    }[platform];

  const matchCard = session ? `
    <div class="match">
      ${field ? `<div class="field">📍 ${escapeHtml(field)}</div>` : ''}
      <div class="teams">
        <span><i style="background:${colA}"></i>${escapeHtml(teamA)}</span>
        <b>vs</b>
        <span><i style="background:${colB}"></i>${escapeHtml(teamB)}</span>
      </div>
      ${when ? `<div class="when">🕒 ${escapeHtml(when)}</div>` : ''}
    </div>` : '';

  const iosButtons = `
    <a class="btn primary" id="store" href="${escapeHtml(store.ios)}">App Store'dan İndir</a>
    <a class="btn" id="open" href="${escapeHtml(schemeUrl)}">Uygulama yüklü · Aç</a>`;
  const androidButtons = `
    <a class="btn primary" id="store" href="${escapeHtml(store.android)}">Google Play'den İndir</a>
    <a class="btn" id="open" href="${escapeHtml(intentUrl)}">Uygulama yüklü · Aç</a>`;
  const desktopButtons = `
    <a class="btn primary" href="${escapeHtml(webUrl)}">🌐 Tarayıcıda Devam Et</a>
    <div class="stores">
      ${store.iosKnown ? `<a class="btn small" href="${escapeHtml(store.ios)}">🍎 App Store</a>` : ''}
      <a class="btn small" href="${escapeHtml(store.android)}">▶ Google Play</a>
    </div>`;

  const buttons = platform === 'ios' ? iosButtons
    : platform === 'android' ? androidButtons
    : desktopButtons;

  const mobileExtras = isPhone && !finished ? `
    <ol class="steps">
      <li>Uygulamayı indir ve bir kez aç.</li>
      <li>Bu davet linkine tekrar dokun — doğrudan maça girersin.</li>
      <li>Ya da uygulamada <b>Online → Katıl</b> ekranına <b>${escapeHtml(code)}</b> kodunu gir.</li>
    </ol>
    <a class="weblink" href="${escapeHtml(webUrl)}">Uygulamasız, tarayıcıda devam et →</a>` : '';

  // Sayfa açılınca otomatik deneme (sadece telefonlarda, maç bitmemişse)
  const autoScript = isPhone && !finished ? `
<script>
(function () {
  var P = ${jsonForScript({
    platform,
    code,
    scheme: schemeUrl,
    intent: intentUrl,
    store: platform === 'ios' ? store.ios : store.android,
    universalLinks: c.IOS_UNIVERSAL_LINKS === 'true',
  })};
  var left = false;
  document.addEventListener('visibilitychange', function () { if (document.hidden) left = true; });
  window.addEventListener('pagehide', function () { left = true; });

  function copyCode() {
    try { if (navigator.clipboard) navigator.clipboard.writeText(P.code); } catch (e) {}
  }
  function goStoreIfStillHere(ms) {
    setTimeout(function () { if (!left && !document.hidden) window.location.href = P.store; }, ms);
  }

  // Butonlar: mağazaya giderken kodu panoya kopyala (sonradan yapıştırmak için)
  var storeBtn = document.getElementById('store');
  if (storeBtn) storeBtn.addEventListener('click', copyCode);

  if (P.platform === 'android') {
    // Chrome: app yüklüyse açar, değilse browser_fallback_url (Google Play)
    setTimeout(function () { window.location.href = P.intent; }, 60);
    goStoreIfStillHere(2500); // intent desteklemeyen tarayıcılar için
  } else if (P.universalLinks) {
    // Universal Links aktif: app yüklü olsaydı bu sayfa hiç açılmazdı
    goStoreIfStillHere(1200);
  } else {
    setTimeout(function () { window.location.href = P.scheme; }, 60);
    goStoreIfStillHere(2500);
  }
})();
</script>` : '';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="theme-color" content="#070a0f">
<link rel="icon" href="/favicon.ico">
<meta property="og:type" content="website">
<meta property="og:site_name" content="HalıSaha-Kolik">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:image" content="${escapeHtml(url.origin)}/logo512.png">
<meta property="og:image:width" content="512">
<meta property="og:image:height" content="512">
<meta name="twitter:card" content="summary">
${appleBanner}
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:#070a0f;color:#e2e8f0;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
body{background:radial-gradient(ellipse at top,#0d1d2e 0%,#070a0f 60%) fixed}
.wrap{max-width:420px;margin:0 auto;padding:calc(36px + env(safe-area-inset-top)) 20px calc(28px + env(safe-area-inset-bottom));
  display:flex;flex-direction:column;align-items:center;text-align:center}
.logo{width:88px;height:88px;border-radius:22px;box-shadow:0 18px 44px rgba(52,211,153,.28);margin-bottom:18px}
.eyebrow{font:700 10.5px/1 ui-monospace,Menlo,monospace;letter-spacing:2px;text-transform:uppercase;color:rgba(148,163,184,.75);margin-bottom:10px}
h1{font-size:25px;line-height:1.2;margin:0 0 16px;letter-spacing:-.4px}
.match{width:100%;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);margin-bottom:14px}
.field{font-size:13px;color:#94a3b8;margin-bottom:8px}
.teams{display:flex;align-items:center;justify-content:center;gap:10px;font-weight:800;font-size:16px;flex-wrap:wrap}
.teams span{display:inline-flex;align-items:center;gap:6px}
.teams i{width:10px;height:10px;border-radius:50%;display:inline-block}
.teams b{font-size:11px;color:#64748b;letter-spacing:1px}
.when{font-size:12.5px;color:#94a3b8;margin-top:8px}
.code{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px 12px 18px;border-radius:14px;
  background:rgba(52,211,153,.07);border:1px solid rgba(52,211,153,.28);margin-bottom:12px}
.code small{display:block;text-align:left;font:700 9.5px/1 ui-monospace,Menlo,monospace;letter-spacing:1.6px;color:rgba(255,255,255,.5);margin-bottom:6px}
.code strong{font:900 24px/1 ui-monospace,Menlo,monospace;letter-spacing:4px;color:#34d399}
.copy{flex-shrink:0;border:1px solid rgba(52,211,153,.4);background:transparent;color:#34d399;font-weight:700;font-size:12px;padding:8px 12px;border-radius:10px;cursor:pointer}
.status{font-size:13px;color:#94a3b8;margin:4px 0 18px;line-height:1.5}
.btn{display:flex;align-items:center;justify-content:center;width:100%;padding:15px;border-radius:14px;margin-bottom:10px;
  font-weight:800;font-size:15px;text-decoration:none;color:#e2e8f0;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}
.btn.primary{background:linear-gradient(135deg,#34d399,#10b981);color:#0a1628;border:none;box-shadow:0 12px 30px rgba(52,211,153,.35)}
.btn.small{padding:11px;font-size:13px;margin:0}
.stores{display:flex;gap:10px;width:100%;margin-top:4px}
.steps{text-align:left;font-size:12.5px;color:#94a3b8;line-height:1.6;padding-left:20px;margin:12px 0 14px;width:100%}
.steps b{color:#e2e8f0}
.weblink{font-size:12px;color:#64748b;text-decoration:underline}
.foot{margin-top:26px;font-size:11px;color:rgba(148,163,184,.45)}
</style>
</head>
<body>
<main class="wrap">
  <img class="logo" src="/logo192.png" alt="HalıSaha-Kolik" width="88" height="88">
  <div class="eyebrow">HalıSaha-Kolik · Davet</div>
  <h1>${finished ? 'Bu maç sona erdi' : 'Maça davet edildin'}</h1>
  ${matchCard}
  <div class="code">
    <div><small>DAVET KODU</small><strong>${escapeHtml(code)}</strong></div>
    <button class="copy" type="button" onclick="try{navigator.clipboard.writeText('${escapeHtml(code)}');this.textContent='Kopyalandı ✓'}catch(e){}">Kopyala</button>
  </div>
  ${statusText ? `<p class="status">${statusText}</p>` : ''}
  ${buttons}
  ${mobileExtras}
  <div class="foot">HalıSaha-Kolik · Halı saha maçların için</div>
</main>
${autoScript}
</body>
</html>`;
}
