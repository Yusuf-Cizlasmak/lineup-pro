-- ═════════════════════════════════════════════════════════════
-- HalıSaha-Kolik · push_tokens — cihaz başına FCM token'ı
-- ═════════════════════════════════════════════════════════════
-- Supabase Dashboard → SQL Editor → bu dosyanın tamamını yapıştır → Run.
-- (Tekrar çalıştırmak güvenlidir: "if not exists" / "or replace".)
--
-- ★ GÜVENLİK
--   • RLS AÇIK ve HİÇ POLICY YOK → uygulama (anon key) tabloyu OKUYAMAZ,
--     doğrudan yazamaz/silemez. Token'lar istemcilere asla görünmez.
--   • Uygulama yalnızca register_push_token() fonksiyonunu çağırabilir
--     (SECURITY DEFINER → tabloya fonksiyon sahibinin yetkisiyle yazar).
--   • Token'ları sadece sunucu (Edge Function send-push, service role) okur.
--   • Not: Hesap/giriş sistemi olmadığı için device_id kanıtlanamaz; biri
--     başkasının device_id'sini bilip kendi token'ını yazabilir. Bildirim
--     içerikleri hassas değil (katılım / MVP), bu risk kabul edildi.
-- ═════════════════════════════════════════════════════════════

create table if not exists public.push_tokens (
  device_id  uuid primary key,              -- src/LiveMatchService.js getDeviceId()
  token      text not null,                 -- FCM registration token (iOS + Android)
  platform   text,                          -- 'ios' | 'android'
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_token_idx on public.push_tokens (token);

-- RLS açık, policy YOK → anon/authenticated için tüm doğrudan erişim kapalı
alter table public.push_tokens enable row level security;
revoke all on table public.push_tokens from anon, authenticated;

comment on table public.push_tokens is
  'Cihaz başına FCM token. İstemciler okuyamaz (RLS, policy yok). Yazma sadece register_push_token() ile. Okuma: send-push Edge Function (service role).';

-- ═══ Token kaydet / güncelle (uygulama çağırır) ═══
--   supabase.rpc("register_push_token", { p_device_id, p_token, p_platform })
create or replace function public.register_push_token(
  p_device_id uuid,
  p_token     text,
  p_platform  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_device_id is null
     or p_token is null
     or length(p_token) < 20
     or length(p_token) > 4096 then
    raise exception 'invalid push token';
  end if;

  -- Aynı token başka bir device_id'de kayıtlıysa (ör. yedekten geri yükleme
  -- sonrası yeni kimlik) eskisini sil → aynı telefona çift bildirim gitmesin.
  delete from public.push_tokens
   where token = p_token
     and device_id <> p_device_id;

  insert into public.push_tokens (device_id, token, platform, updated_at)
  values (
    p_device_id,
    p_token,
    case when p_platform in ('ios', 'android', 'web') then p_platform else null end,
    now()
  )
  on conflict (device_id) do update
     set token      = excluded.token,
         platform   = excluded.platform,
         updated_at = now();
end;
$$;

revoke all on function public.register_push_token(uuid, text, text) from public;
grant execute on function public.register_push_token(uuid, text, text) to anon, authenticated;
