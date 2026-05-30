// ─────────────────────────────────────────────────────────────
// Cloudflare Workers · Server-side Deep Link Redirect Handler
// ─────────────────────────────────────────────────────────────
// Bu dosya `public/_worker.js` olarak duruyor — CRA build sırasında
// otomatik olarak `build/_worker.js`'e kopyalanır ve Workers Static
// Assets binding'i tarafından entry handler olarak çalıştırılır.
//
// Davranış:
//   GET /m/HK-AB12  +  Android UA  →  302 → intent:// (app açar)
//   GET /m/HK-AB12  +  iOS UA      →  HTML + scheme replace + Store fallback
//   GET /m/HK-AB12  +  Desktop UA  →  index.html (React mount, normal akış)
//   Diğer her şey                  →  static asset (build/ içeriği)
//
// Server-side karar verdiğimiz için tarayıcıda HİÇ ARA EKRAN
// gözükmez — kullanıcı linke tıklar, doğrudan app açılır.
// ─────────────────────────────────────────────────────────────

const SCHEME = 'halisahakolik';
const ANDROID_PACKAGE = 'com.halisahakolik.app';
const IOS_APP_URL = '';     // App Store'a koyunca doldur
const ANDROID_APP_URL = ''; // Play Store'a koyunca doldur

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Sadece /m/CODE path'i için özel davranış
    const codeMatch = url.pathname.match(/^\/m\/([A-Z0-9-]+)\/?$/i);

    if (codeMatch) {
      const code = codeMatch[1].toUpperCase();
      const ua = (request.headers.get('user-agent') || '').toLowerCase();

      // Bot/crawler ise hiç redirect etme, normal sayfayı serve et
      // (link önizleme için)
      const isBot = /bot|crawler|spider|preview|whatsapp|telegram|facebookexternalhit|twitter/.test(ua);

      const isAndroid = /android/.test(ua) && !isBot;
      const isIOS = /iphone|ipad|ipod/.test(ua) && !isBot;

      // ─── ANDROID: Intent URL ile direkt redirect ───
      // Chrome bunu görür: app yüklüyse açar, yoksa
      // S.browser_fallback_url'e gider. Tek URL ile her şey.
      if (isAndroid) {
        const webFallback = `${url.origin}/?fallback=1&code=${code}`;
        const intentFallback = ANDROID_APP_URL || webFallback;
        const intentUrl =
          `intent://join?code=${code}#Intent;` +
          `scheme=${SCHEME};` +
          `package=${ANDROID_PACKAGE};` +
          `S.browser_fallback_url=${encodeURIComponent(intentFallback)};` +
          `end`;
        return Response.redirect(intentUrl, 302);
      }

      // ─── iOS: Minik HTML + scheme replace ───
      // 302 redirect iOS Safari'de custom scheme'lerde çalışmaz —
      // mutlaka HTML response + window.location.replace gerekli.
      if (isIOS) {
        const schemeUrl = `${SCHEME}://join?code=${code}`;
        const storeUrl = IOS_APP_URL;
        const webFallback = `${url.origin}/?fallback=1&code=${code}`;

        const fallbackJs = storeUrl
          ? `setTimeout(function(){if(!document.hidden)window.location.replace(${JSON.stringify(storeUrl)});},1500);`
          : `setTimeout(function(){if(!document.hidden)window.location.replace(${JSON.stringify(webFallback)});},1800);`;

        const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>HalıSaha açılıyor…</title>
<style>
html,body{margin:0;padding:0;height:100%;background:#0a0e15;color:#e2e8f0;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
-webkit-font-smoothing:antialiased;overflow:hidden}
.c{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
.b{font-size:54px;line-height:1;animation:bb 1.4s ease-in-out infinite;filter:drop-shadow(0 6px 24px rgba(52,211,153,0.35))}
.t{font-size:14px;color:#64748b;letter-spacing:0.3px}
.l{display:flex;gap:6px;margin-top:4px}
.d{width:7px;height:7px;border-radius:50%;background:#34d399;animation:dd 1.2s ease-in-out infinite}
.d:nth-child(2){animation-delay:0.2s}.d:nth-child(3){animation-delay:0.4s}
@keyframes bb{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-8px) scale(1.05)}}
@keyframes dd{0%,100%{opacity:0.3;transform:scale(0.85)}50%{opacity:1;transform:scale(1)}}
</style>
</head>
<body>
<div class="c">
<div class="b">⚽</div>
<div class="t">Uygulama açılıyor…</div>
<div class="l"><div class="d"></div><div class="d"></div><div class="d"></div></div>
</div>
<script>
(function(){
  var scheme=${JSON.stringify(schemeUrl)};
  // Sayfa visibility değişimini dinle — app açıldıysa fallback'i iptal et
  var redirected=false;
  document.addEventListener('visibilitychange',function(){if(document.hidden)redirected=true;});
  // Anında scheme'i tetikle
  window.location.replace(scheme);
  ${fallbackJs}
})();
</script>
</body>
</html>`;

        return new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }

      // ─── Desktop / Bot: index.html serve et (React landing göstersin) ───
      // Asset fetch et ama URL'i değiştirme — React URL'i parse edip
      // JoinLandingPage'i gösterecek.
      if (env.ASSETS) {
        const indexReq = new Request(`${url.origin}/index.html`, request);
        return env.ASSETS.fetch(indexReq);
      }
    }

    // Default: static asset serve et
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    // ASSETS binding yoksa hata
    return new Response('Static asset binding (ASSETS) tanımlı değil. wrangler.toml kontrol et.', {
      status: 500,
    });
  },
};