// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · push — Firebase Cloud Messaging (admin → herkes)
// ─────────────────────────────────────────────────────────────
// Resmi @capacitor/push-notifications ile cihazı FCM'e kaydeder.
// Kayıt olan her cihaz, Firebase Console > Messaging panelinden
// "tüm kullanıcılara" gönderilen kampanyalarla ULAŞILABİLİR olur.
// Backend/sunucu GEREKMEZ — admin tarayıcıdan gönderir.
//
// KULLANIM (App.js boot):
//   import { initPush } from "./push";
//   initPush();   // izin + kayıt + dinleyiciler
//
// Admin gönderimi: Firebase Console → Engage → Messaging →
//   "Create your first campaign" → Notifications → hedef: uygulama (tüm kullanıcılar).
// ─────────────────────────────────────────────────────────────

import { Capacitor } from "@capacitor/core";

let _started = false;

export async function initPush() {
  if (_started) return;
  if (!Capacitor.isNativePlatform()) return; // web'de no-op
  _started = true;

  let PN;
  try {
    const mod = await import("@capacitor/push-notifications");
    PN = mod.PushNotifications;
  } catch (e) {
    console.warn("[push] plugin yüklenemedi:", e?.message);
    return;
  }

  try {
    // İzin durumu
    let perm = await PN.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PN.requestPermissions();
    }
    if (perm.receive !== "granted") {
      console.log("[push] izin verilmedi");
      return;
    }

    // FCM/APNs'e kaydol
    await PN.register();

    // Token alındı (Firebase Console "tüm kullanıcılar" için bu gerekmez,
    // ama tekil test/hedefleme istersen bu token'ı kullanırsın)
    PN.addListener("registration", (token) => {
      console.log("[push] token:", token.value);
    });

    PN.addListener("registrationError", (err) => {
      console.warn("[push] kayıt hatası:", JSON.stringify(err));
    });

    // Uygulama ÖNDEYKEN gelen bildirim (foreground)
    PN.addListener("pushNotificationReceived", (notification) => {
      console.log("[push] foreground:", notification?.title);
      // İstenirse burada uygulama içi toast gösterilebilir.
    });

    // Bildirime DOKUNULDUĞUNDA (arka plan → açılış)
    PN.addListener("pushNotificationActionPerformed", (action) => {
      const data = action?.notification?.data || {};
      // data.route varsa yönlendirme yapılabilir (opsiyonel)
      if (data.route) {
        window.dispatchEvent(new CustomEvent("halisaha:push-route", { detail: data }));
      }
    });
  } catch (e) {
    console.warn("[push] init hata:", e?.message);
  }
}