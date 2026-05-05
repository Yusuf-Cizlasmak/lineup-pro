// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · LiveMatchService (v3 · PRO)
// Tüm Supabase realtime işlemleri tek dosyada.
//
// ★ v3 YENİLİKLER:
//   • Co-admin (yetki devri):   match_sessions.co_admin_id
//   • Takım kaptanı:            session_players.is_captain (her takımda 1)
//   • Hazır işareti:            session_players.is_ready
//   • MVP atama:                match_sessions.mvp_device_id
//   • Maç süresi & başlangıç:   match_sessions.duration_minutes / started_at
//   • Takım rengi (custom):     match_sessions.team_a_color / team_b_color
//   • Zenginleştirilmiş eventler: scorer (deviceId), assist, minute, goal_type
//   • Geriye uyumlu: kolonlar eksikse graceful fail
//
//   Migration SQL (Supabase SQL editor'de çalıştır):
//     alter table match_sessions
//       add column if not exists co_admin_id uuid,
//       add column if not exists duration_minutes int default 60,
//       add column if not exists started_at timestamptz,
//       add column if not exists mvp_device_id uuid,
//       add column if not exists team_a_color text default '#34d399',
//       add column if not exists team_b_color text default '#f87171';
//     alter table session_players
//       add column if not exists is_captain boolean default false,
//       add column if not exists is_ready boolean default false;
//     alter table session_events
//       add column if not exists goal_type text default 'normal';
// ─────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mzryetwernvtqrvbhcxp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16cnlldHdlcm52dHFydmJoY3hwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDM4ODcsImV4cCI6MjA5MzQ3OTg4N30.Y1rkPk-9DlmjdoBZcwqF843ZB1DGcotZbHJEgv0hnDk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══ CİHAZ KİMLİĞİ ═══
const DEVICE_ID_KEY = 'halisaha_device_id';
const NICKNAME_KEY  = 'halisaha_nickname';

export const getDeviceId = () => {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
};

export const getNickname = () => localStorage.getItem(NICKNAME_KEY) || '';
export const setNickname = (name) => localStorage.setItem(NICKNAME_KEY, name);

// Cihazı Supabase'e kaydet / güncelle
export const registerDevice = async (nickname) => {
  const id = getDeviceId();
  if (nickname) setNickname(nickname);
  const nick = nickname || getNickname() || 'Misafir';
  const { error } = await supabase
    .from('devices')
    .upsert({ id, nickname: nick }, { onConflict: 'id' });
  if (error) console.error('registerDevice:', error);
  return id;
};

// ═══ JOIN CODE ÜRETİCİ ═══
const generateJoinCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'HK-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

// ═══ OPSIYONEL UPDATE — kolon yoksa graceful fail ═══
// Yeni kolonlar henüz migrate edilmemiş Supabase projelerinde tek sütun
// hatası tüm update'i bozmasın. Hata olursa sessizce loglar, ana akışı
// kırmaz.
const safeUpdate = async (table, updates, filter) => {
  const q = supabase.from(table).update(updates);
  Object.entries(filter).forEach(([k, v]) => q.eq(k, v));
  const { error } = await q;
  if (error) {
    console.warn(`[safeUpdate] ${table}:`, error.message,
      '— migration çalıştırıldı mı?');
    return { error };
  }
  return { error: null };
};

// ═══ OTURUM İŞLEMLERİ ═══

// Yeni maç oturumu oluştur (admin)
export const createSession = async ({
  fieldName = '',
  location = '',
  scheduledAt = null,
  teamAName = 'Takım A',
  teamBName = 'Takım B',
  formationA = '3-2-1',
  formationB = '3-2-1',
  teamAColor = '#34d399',
  teamBColor = '#f87171',
  durationMinutes = 60,
} = {}) => {
  const adminId = getDeviceId();
  await registerDevice();

  let joinCode, attempts = 0;
  while (attempts < 10) {
    joinCode = generateJoinCode();
    const { data } = await supabase
      .from('match_sessions')
      .select('id')
      .eq('join_code', joinCode)
      .maybeSingle();
    if (!data) break;
    attempts++;
  }

  const baseRow = {
    join_code: joinCode,
    admin_id: adminId,
    status: 'lobby',
    field_name: fieldName,
    location,
    scheduled_at: scheduledAt,
    team_a_name: teamAName,
    team_b_name: teamBName,
  };

  // Önce tam paket → başarısızsa minimal paket
  const fullRow = {
    ...baseRow,
    formation_a: formationA,
    formation_b: formationB,
    team_a_color: teamAColor,
    team_b_color: teamBColor,
    duration_minutes: durationMinutes,
  };

  let { data, error } = await supabase
    .from('match_sessions')
    .insert(fullRow)
    .select()
    .single();

  if (error) {
    console.warn('[createSession] yeni kolonlar olmadan tekrar deneniyor:', error.message);
    // Sadece formation ile dene
    const tryFormation = await supabase
      .from('match_sessions')
      .insert({ ...baseRow, formation_a: formationA, formation_b: formationB })
      .select()
      .single();
    if (tryFormation.error) {
      // En sade ile dene
      const fallback = await supabase
        .from('match_sessions')
        .insert(baseRow)
        .select()
        .single();
      data = fallback.data;
      error = fallback.error;
    } else {
      data = tryFormation.data;
      error = tryFormation.error;
    }
  }

  if (error) throw error;

  await joinSession(data.id, true);
  return data;
};

// Kod ile oturuma katıl
export const joinSessionByCode = async (code) => {
  const clean = code.trim().toUpperCase();
  const { data: session, error } = await supabase
    .from('match_sessions')
    .select('*')
    .eq('join_code', clean)
    .maybeSingle();

  if (error) throw error;
  if (!session) throw new Error('Geçersiz kod. Tekrar dene.');
  if (session.status === 'finished') throw new Error('Bu maç sona ermiş.');

  await joinSession(session.id);
  return session;
};

// Oturuma katılımcı ekle (iç yardımcı)
const joinSession = async (sessionId, isAdmin = false) => {
  const deviceId = getDeviceId();
  const nickname = getNickname() || 'Misafir';
  await registerDevice();

  const { error } = await supabase
    .from('session_players')
    .upsert(
      { session_id: sessionId, device_id: deviceId, nickname },
      { onConflict: 'session_id,device_id' }
    );
  if (error) console.error('joinSession:', error);
};

// Oturumu getir
export const getSession = async (sessionId) => {
  const { data, error } = await supabase
    .from('match_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (error) throw error;
  return data;
};

// Katılımcıları getir
export const getSessionPlayers = async (sessionId) => {
  const { data, error } = await supabase
    .from('session_players')
    .select('*')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return data || [];
};

// Eventleri getir
export const getSessionEvents = async (sessionId) => {
  const { data, error } = await supabase
    .from('session_events')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
};

// ═══ ADMİN İŞLEMLERİ ═══

// Takım ata (admin / co-admin)
export const assignTeam = async (sessionId, deviceId, team) => {
  const updates = {
    team,
    slot_index: null,
    pos_x: null,
    pos_y: null,
  };
  const { error } = await supabase
    .from('session_players')
    .update(updates)
    .eq('session_id', sessionId)
    .eq('device_id', deviceId);
  if (error) throw error;
  // Yeni takım değişti, eski kaptanlığı düşür
  await safeUpdate('session_players', { is_captain: false }, {
    session_id: sessionId, device_id: deviceId,
  });
};

// Oyuncuyu çıkar (admin)
export const removePlayer = async (sessionId, deviceId) => {
  const { error } = await supabase
    .from('session_players')
    .delete()
    .eq('session_id', sessionId)
    .eq('device_id', deviceId);
  if (error) throw error;
};

// Maçı başlat (admin) — started_at otomatik
export const startMatch = async (sessionId) => {
  const updates = { status: 'active' };
  // started_at'i de yazmaya çalış (kolon yoksa graceful)
  const startedAt = new Date().toISOString();
  let { error } = await supabase
    .from('match_sessions')
    .update({ ...updates, started_at: startedAt })
    .eq('id', sessionId);
  if (error) {
    // started_at kolonu yoksa minimal update
    const r = await supabase
      .from('match_sessions')
      .update(updates)
      .eq('id', sessionId);
    if (r.error) throw r.error;
  }
};

// Maçı bitir (admin)
export const finishMatch = async (sessionId) => {
  const { error } = await supabase
    .from('match_sessions')
    .update({ status: 'finished' })
    .eq('id', sessionId);
  if (error) throw error;
};

// Skor güncelle (manuel ayarlama için — event akışı zaten otomatik tutuyor)
export const updateScore = async (sessionId, scoreA, scoreB) => {
  const { error } = await supabase
    .from('match_sessions')
    .update({ score_a: scoreA, score_b: scoreB })
    .eq('id', sessionId);
  if (error) throw error;
};

// Puanları herkese aç/kapat
export const setRatingsPublic = async (sessionId, isPublic) => {
  const { error } = await supabase
    .from('match_sessions')
    .update({ ratings_public: isPublic })
    .eq('id', sessionId);
  if (error) throw error;
};

// ═══ v3 YENİ: META & YETKİ ═══

// Maç meta'sı (takım ismi/rengi/süre) — admin
export const updateSessionMeta = async (sessionId, meta = {}) => {
  const allowed = {};
  if (meta.team_a_name !== undefined) allowed.team_a_name = meta.team_a_name;
  if (meta.team_b_name !== undefined) allowed.team_b_name = meta.team_b_name;
  if (meta.field_name !== undefined) allowed.field_name = meta.field_name;
  if (meta.location !== undefined) allowed.location = meta.location;
  if (meta.team_a_color !== undefined) allowed.team_a_color = meta.team_a_color;
  if (meta.team_b_color !== undefined) allowed.team_b_color = meta.team_b_color;
  if (meta.duration_minutes !== undefined) allowed.duration_minutes = meta.duration_minutes;
  if (Object.keys(allowed).length === 0) return;

  const { error } = await supabase
    .from('match_sessions')
    .update(allowed)
    .eq('id', sessionId);
  if (error) {
    // Renk/süre kolonu yoksa: sadece güvenli olanları yaz
    console.warn('[updateSessionMeta] tam paket yazılamadı, sade tekrar:', error.message);
    const safe = {};
    if (allowed.team_a_name !== undefined) safe.team_a_name = allowed.team_a_name;
    if (allowed.team_b_name !== undefined) safe.team_b_name = allowed.team_b_name;
    if (allowed.field_name !== undefined) safe.field_name = allowed.field_name;
    if (allowed.location !== undefined) safe.location = allowed.location;
    if (Object.keys(safe).length > 0) {
      const r = await supabase
        .from('match_sessions')
        .update(safe)
        .eq('id', sessionId);
      if (r.error) throw r.error;
    }
  }
};

// Co-admin (yetki yardımcısı) ata/kaldır — admin
export const setCoAdmin = async (sessionId, deviceId) => {
  return safeUpdate('match_sessions', { co_admin_id: deviceId }, { id: sessionId });
};

// MVP ata — admin/co-admin (maç sonu)
export const setMVP = async (sessionId, deviceId) => {
  return safeUpdate('match_sessions', { mvp_device_id: deviceId }, { id: sessionId });
};

// Kaptan ata — admin/co-admin (her takımda en fazla 1)
export const setCaptain = async (sessionId, deviceId) => {
  // Önce o oyuncunun takımını bul
  const { data: target } = await supabase
    .from('session_players')
    .select('team')
    .eq('session_id', sessionId)
    .eq('device_id', deviceId)
    .single();
  if (!target?.team) throw new Error('Oyuncu önce bir takıma atanmalı.');

  // Aynı takımdaki tüm kaptanlıkları sıfırla, sonra bu oyuncuyu kaptan yap
  await safeUpdate('session_players', { is_captain: false }, {
    session_id: sessionId, team: target.team,
  });
  return safeUpdate('session_players', { is_captain: true }, {
    session_id: sessionId, device_id: deviceId,
  });
};

// Kaptanlığı kaldır
export const removeCaptain = async (sessionId, deviceId) => {
  return safeUpdate('session_players', { is_captain: false }, {
    session_id: sessionId, device_id: deviceId,
  });
};

// Hazır toggle — oyuncu kendisi
export const togglePlayerReady = async (sessionId, isReady) => {
  const deviceId = getDeviceId();
  return safeUpdate('session_players', { is_ready: !!isReady }, {
    session_id: sessionId, device_id: deviceId,
  });
};

// ═══ FORMASYON & POZİSYON ═══

export const setTeamFormation = async (sessionId, team, formation) => {
  const col = team === 'A' ? 'formation_a' : 'formation_b';
  const { error } = await supabase
    .from('match_sessions')
    .update({ [col]: formation })
    .eq('id', sessionId);
  if (error) {
    console.warn('[setTeamFormation] kolon yok mu? Migration çalıştırıldı mı?', error.message);
    return;
  }
  // ★ NOT: Eskiden burada tüm oyuncuların slot_index'i null'lanıyordu — bu
  // formasyon değiştirmek istediğinizde kadronuzu kaybetmenize sebep oluyordu.
  // Artık slot_index korunuyor; sadece x/y görsel koordinatları yeni
  // formasyona göre yeniden hizalanır (bu zaten render tarafında oluyor).
};

// Oyuncu: Kendi profilini güncelle
export const updatePlayerProfile = async (sessionId, deviceId, { jerseyNumber, position, attributes, nickname } = {}) => {
  const updates = {};
  if (jerseyNumber !== undefined) updates.jersey_number = jerseyNumber;
  if (position !== undefined) updates.position = position;
  if (attributes !== undefined) updates.attributes = attributes;
  if (nickname !== undefined) updates.nickname = nickname;
  if (Object.keys(updates).length === 0) return;

  let { error } = await supabase
    .from('session_players')
    .update(updates)
    .eq('session_id', sessionId)
    .eq('device_id', deviceId);

  if (error) {
    console.warn('[updatePlayerProfile] tam profil yazılamadı, opsiyonel kolonlar düşürülüyor:', error.message);
    const safeUpdates = {};
    if (updates.position !== undefined) safeUpdates.position = updates.position;
    if (updates.nickname !== undefined) safeUpdates.nickname = updates.nickname;
    if (Object.keys(safeUpdates).length > 0) {
      const r = await supabase
        .from('session_players')
        .update(safeUpdates)
        .eq('session_id', sessionId)
        .eq('device_id', deviceId);
      if (r.error) throw r.error;
    }
  }
};

// Oyuncu: Bir slota yerleş (kendi takımında, slot boşsa)
export const setPlayerSlot = async (sessionId, deviceId, slotIndex, position = null) => {
  const { data: target } = await supabase
    .from('session_players')
    .select('team')
    .eq('session_id', sessionId)
    .eq('device_id', deviceId)
    .single();
  if (!target?.team) throw new Error('Önce bir takıma katılmalısın.');

  await supabase
    .from('session_players')
    .update({ slot_index: null })
    .eq('session_id', sessionId)
    .eq('team', target.team)
    .eq('slot_index', slotIndex);

  const updates = { slot_index: slotIndex, pos_x: null, pos_y: null };
  if (position) updates.position = position;

  const { error } = await supabase
    .from('session_players')
    .update(updates)
    .eq('session_id', sessionId)
    .eq('device_id', deviceId);
  if (error) {
    console.warn('[setPlayerSlot] kolon yok mu?', error.message);
    throw new Error('Pozisyon kaydedilemedi. Lütfen veritabanı şemanızı güncelleyin.');
  }
};

// Oyuncu: Slottan ayrıl
export const clearPlayerSlot = async (sessionId, deviceId) => {
  const { error } = await supabase
    .from('session_players')
    .update({ slot_index: null, pos_x: null, pos_y: null })
    .eq('session_id', sessionId)
    .eq('device_id', deviceId);
  if (error) console.warn('[clearPlayerSlot]', error.message);
};

// Admin: Oyuncuyu manuel xy konumuna sürükle
export const setPlayerManualPosition = async (sessionId, deviceId, x, y) => {
  const { error } = await supabase
    .from('session_players')
    .update({ pos_x: Math.round(x), pos_y: Math.round(y) })
    .eq('session_id', sessionId)
    .eq('device_id', deviceId);
  if (error) throw error;
};

// Admin: Hedef oyuncuyu istediği takımın slotuna yerleştir (her şeyi günceller)
export const adminSetPlayerSlot = async (sessionId, targetDeviceId, team, slotIndex, role = null) => {
  // 1) Hedef slotta zaten biri varsa boşalt
  await supabase
    .from('session_players')
    .update({ slot_index: null })
    .eq('session_id', sessionId)
    .eq('team', team)
    .eq('slot_index', slotIndex)
    .neq('device_id', targetDeviceId);

  const updates = { team, slot_index: slotIndex, pos_x: null, pos_y: null };
  if (role) updates.position = role;

  const { error } = await supabase
    .from('session_players')
    .update(updates)
    .eq('session_id', sessionId)
    .eq('device_id', targetDeviceId);
  if (error) throw error;
};

// ═══ MAÇ EVENTLERİ ═══
//
// Sarı/kırmızı kart yok (halı saha mantığı). Sadece gol + kendi kalesi.
// scorer/assist/minute/goal_type opsiyonel.
export const addEvent = async (sessionId, {
  type,
  team,
  deviceId = null,    // skor atan
  assistDeviceId = null,
  minute = null,
  goalType = 'normal',
}) => {
  const insert = {
    session_id: sessionId,
    device_id: deviceId,
    assist_device_id: assistDeviceId,
    type,
    team,
    minute,
  };
  // goal_type kolonu yoksa graceful
  let { data, error } = await supabase
    .from('session_events')
    .insert({ ...insert, goal_type: goalType })
    .select()
    .single();
  if (error) {
    console.warn('[addEvent] goal_type yazılamadı, sade tekrar:', error.message);
    const r = await supabase
      .from('session_events')
      .insert(insert)
      .select()
      .single();
    if (r.error) throw r.error;
    data = r.data;
  }

  if (type === 'goal' || type === 'own_goal') {
    const events = await getSessionEvents(sessionId);
    const scoreA = events.filter(e => (e.type === 'goal' && e.team === 'A') || (e.type === 'own_goal' && e.team === 'B')).length;
    const scoreB = events.filter(e => (e.type === 'goal' && e.team === 'B') || (e.type === 'own_goal' && e.team === 'A')).length;
    await updateScore(sessionId, scoreA, scoreB);
  }

  return data;
};

export const removeEvent = async (eventId, sessionId) => {
  const { error } = await supabase
    .from('session_events')
    .delete()
    .eq('id', eventId);
  if (error) throw error;

  const events = await getSessionEvents(sessionId);
  const scoreA = events.filter(e => (e.type === 'goal' && e.team === 'A') || (e.type === 'own_goal' && e.team === 'B')).length;
  const scoreB = events.filter(e => (e.type === 'goal' && e.team === 'B') || (e.type === 'own_goal' && e.team === 'A')).length;
  await updateScore(sessionId, scoreA, scoreB);
};

// ═══ PUANLAMA ═══
export const submitRating = async (sessionId, ratedDeviceId, score, comment = '') => {
  const raterDeviceId = getDeviceId();
  if (raterDeviceId === ratedDeviceId) throw new Error('Kendini puanlayamazsın.');

  const { error } = await supabase
    .from('player_ratings')
    .upsert(
      { session_id: sessionId, rater_device_id: raterDeviceId, rated_device_id: ratedDeviceId, score, comment },
      { onConflict: 'session_id,rater_device_id,rated_device_id' }
    );
  if (error) throw error;
};

export const getSessionRatings = async (sessionId) => {
  const { data, error } = await supabase
    .from('player_ratings')
    .select('*')
    .eq('session_id', sessionId);
  if (error) throw error;
  return data || [];
};

export const computeAverageRatings = (ratings) => {
  const map = {};
  for (const r of ratings) {
    if (!map[r.rated_device_id]) map[r.rated_device_id] = { total: 0, count: 0 };
    map[r.rated_device_id].total += r.score;
    map[r.rated_device_id].count++;
  }
  const result = {};
  for (const [id, v] of Object.entries(map)) {
    result[id] = { avg: (v.total / v.count).toFixed(1), count: v.count };
  }
  return result;
};

// ═══ REALTİME SUBSCRIPTIONS ═══
export const subscribeToSession = (sessionId, onUpdate) => {
  const channel = supabase
    .channel(`session:${sessionId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'match_sessions',
      filter: `id=eq.${sessionId}`,
    }, onUpdate)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'session_players',
      filter: `session_id=eq.${sessionId}`,
    }, onUpdate)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'session_events',
      filter: `session_id=eq.${sessionId}`,
    }, onUpdate)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'player_ratings',
      filter: `session_id=eq.${sessionId}`,
    }, onUpdate)
    .subscribe();

  return () => supabase.removeChannel(channel);
};

// ═══ GEÇMİŞ OTURUMLAR ═══
export const getMyActiveSessions = async () => {
  const deviceId = getDeviceId();
  const { data: playerRows } = await supabase
    .from('session_players')
    .select('session_id')
    .eq('device_id', deviceId);
  if (!playerRows || playerRows.length === 0) return [];
  const sessionIds = playerRows.map(r => r.session_id);
  const { data: sessions } = await supabase
    .from('match_sessions')
    .select('*')
    .in('id', sessionIds)
    .neq('status', 'finished')
    .order('created_at', { ascending: false });
  return sessions || [];
};

export const getMyFinishedSessions = async () => {
  const deviceId = getDeviceId();
  const { data: playerRows } = await supabase
    .from('session_players')
    .select('session_id')
    .eq('device_id', deviceId);
  if (!playerRows || playerRows.length === 0) return [];
  const sessionIds = playerRows.map(r => r.session_id);
  const { data: sessions } = await supabase
    .from('match_sessions')
    .select('*')
    .in('id', sessionIds)
    .eq('status', 'finished')
    .order('created_at', { ascending: false })
    .limit(20);
  return sessions || [];
};

// ═══ YETKİ YARDIMCILARI ═══
export const isAdmin = (session) => session?.admin_id === getDeviceId();

export const isCoAdmin = (session) =>
  !!session?.co_admin_id && session.co_admin_id === getDeviceId();

// Tam yetki: admin VEYA co-admin
export const hasFullPower = (session) =>
  isAdmin(session) || isCoAdmin(session);

// Kullanıcı kendi takımının kaptanı mı?
export const isCaptain = (players) => {
  const me = (players || []).find(p => p.device_id === getDeviceId());
  return !!me?.is_captain;
};

// Kullanıcı belirli bir takımın kaptanı mı?
export const isCaptainOfTeam = (players, team) => {
  const me = (players || []).find(p => p.device_id === getDeviceId());
  return !!me?.is_captain && me.team === team;
};

// Kullanıcının rolü — UI etiketleri için
export const getMyRole = (session, players) => {
  if (isAdmin(session)) return 'admin';
  if (isCoAdmin(session)) return 'co_admin';
  if (isCaptain(players)) {
    const me = players.find(p => p.device_id === getDeviceId());
    return `captain_${me.team}`;
  }
  return 'member';
};