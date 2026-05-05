// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · LiveMatch (v3 · PROFESSIONAL EDITION)
// ─────────────────────────────────────────────────────────────
// • HaliSahaKolik birebir saha estetiği (iki takım karşılıklı)
// • Admin: davet/paylaşım, takım rengi/ismi, kaptan ata, co-admin
// • Kaptan: kendi takımının slotlarını organize edebilir
// • Co-admin: admin'in tüm yetkilerine sahip yardımcı
// • Profesyonel gol modal (scorer → assist → goal type)
// • MVP seçimi (maç sonu)
// • Yedek kulübesi (saha altı, takım rengi)
// • Bağlantı durumu indicator
// • Maç süresi sayacı (sadece görsel — admin tıkladığı gibi başlar)
// • Hazır toggle (oyuncu kendisi işaretler)
// • Maç bitince matchHistoryStore'a otomatik kayıt
// • Kart YOK (halı saha mantığı), devre YOK
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  getDeviceId, getNickname, registerDevice,
  createSession, joinSessionByCode,
  getSession, getSessionPlayers, getSessionEvents, getSessionRatings,
  assignTeam, removePlayer, startMatch, finishMatch,
  addEvent, removeEvent, submitRating, computeAverageRatings,
  setRatingsPublic, subscribeToSession,
  getMyActiveSessions, getMyFinishedSessions,
  isAdmin, isCoAdmin, hasFullPower, isCaptainOfTeam, getMyRole,
  setTeamFormation, setPlayerSlot, clearPlayerSlot, adminSetPlayerSlot,
  updatePlayerProfile, updateSessionMeta,
  setCoAdmin, setCaptain, removeCaptain,
  setMVP, togglePlayerReady,
} from './LiveMatchService';
import { hapticMedium, hapticHeavy, hapticSuccess, hapticLight } from './haptics';
import SpiderChart from './SpiderChart';
import {
  getAttrKeys, generateDefaultAttributes, computeOverallFromAttributes,
} from './playerAttributes';
import { buildMatch, saveMatch } from './matchHistoryStore';

// ═══════════════════════════════════════════════════════════
// PALET
// ═══════════════════════════════════════════════════════════
const C = {
  bg:      '#070a0f',
  bg2:     '#0a141f',
  surface: '#0d1117',
  card:    '#111827',
  cardSoft:'#0e151f',
  border:  'rgba(255,255,255,0.07)',
  text:    '#e2e8f0',
  muted:   '#64748b',
  dim:     'rgba(255,255,255,0.18)',
  accent:  '#34d399',
  defaultA:'#34d399',
  defaultB:'#f87171',
  warn:    '#fbbf24',
  danger:  '#ef4444',
  blue:    '#60a5fa',
  purple:  '#a78bfa',
};

// ═══════════════════════════════════════════════════════════
// CSS — animasyonlar
// ═══════════════════════════════════════════════════════════
const lmCSS = `
@keyframes lmFadeIn  { from{opacity:0} to{opacity:1} }
@keyframes lmFadeUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
@keyframes lmPulse   { 0%,100%{box-shadow:0 0 0 0 rgba(251,191,36,.45)} 50%{box-shadow:0 0 0 8px rgba(251,191,36,0)} }
@keyframes lmLive    { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.55)} 50%{box-shadow:0 0 0 6px rgba(34,197,94,0)} }
@keyframes lmDanger  { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.55)} 50%{box-shadow:0 0 0 6px rgba(239,68,68,0)} }
@keyframes lmShimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
@keyframes lmGoal    { 0%{transform:scale(1)} 30%{transform:scale(1.18)} 100%{transform:scale(1)} }
.lm-empty-slot:hover { transform:translate(-50%,-50%) scale(1.12); }
.lm-selecting        { animation:lmPulse 1.2s infinite; }
input::placeholder   { color:#475569; }
`;

// ═══════════════════════════════════════════════════════════
// FORMASYONLAR — HaliSahaKolik ile birebir aynı
// ═══════════════════════════════════════════════════════════
const FORMATIONS = {
  '4-2': {
    label: '4-2',
    positions: [
      { x: 50, y: 92, role: 'KALECİ' },
      { x: 12, y: 64, role: 'SOL BEK' },
      { x: 36, y: 66, role: 'STOPER' },
      { x: 64, y: 66, role: 'STOPER' },
      { x: 88, y: 64, role: 'SAĞ BEK' },
      { x: 32, y: 38, role: 'ORTA SAHA' },
      { x: 68, y: 38, role: 'ORTA SAHA' },
    ],
  },
  '3-2-1': {
    label: '3-2-1',
    positions: [
      { x: 50, y: 92, role: 'KALECİ' },
      { x: 18, y: 66, role: 'DEFANS' },
      { x: 50, y: 60, role: 'DEFANS' },
      { x: 82, y: 66, role: 'DEFANS' },
      { x: 30, y: 40, role: 'ORTA SAHA' },
      { x: 70, y: 40, role: 'ORTA SAHA' },
      { x: 50, y: 14, role: 'FORVET' },
    ],
  },
  '2-3-1': {
    label: '2-3-1',
    positions: [
      { x: 50, y: 92, role: 'KALECİ' },
      { x: 30, y: 64, role: 'DEFANS' },
      { x: 70, y: 64, role: 'DEFANS' },
      { x: 16, y: 42, role: 'ORTA SAHA' },
      { x: 50, y: 38, role: 'ORTA SAHA' },
      { x: 84, y: 42, role: 'ORTA SAHA' },
      { x: 50, y: 14, role: 'FORVET' },
    ],
  },
  '3-1-2': {
    label: '3-1-2',
    positions: [
      { x: 50, y: 92, role: 'KALECİ' },
      { x: 18, y: 66, role: 'DEFANS' },
      { x: 50, y: 60, role: 'DEFANS' },
      { x: 82, y: 66, role: 'DEFANS' },
      { x: 50, y: 36, role: 'ORTA SAHA' },
      { x: 28, y: 14, role: 'FORVET' },
      { x: 72, y: 14, role: 'FORVET' },
    ],
  },
  '1-4-1': {
    label: '1-4-1',
    positions: [
      { x: 50, y: 92, role: 'KALECİ' },
      { x: 50, y: 64, role: 'DEFANS' },
      { x: 12, y: 42, role: 'ORTA SAHA' },
      { x: 36, y: 38, role: 'ORTA SAHA' },
      { x: 64, y: 38, role: 'ORTA SAHA' },
      { x: 88, y: 42, role: 'ORTA SAHA' },
      { x: 50, y: 14, role: 'FORVET' },
    ],
  },
  '2-2-2': {
    label: '2-2-2',
    positions: [
      { x: 50, y: 92, role: 'KALECİ' },
      { x: 28, y: 64, role: 'DEFANS' },
      { x: 72, y: 64, role: 'DEFANS' },
      { x: 28, y: 42, role: 'ORTA SAHA' },
      { x: 72, y: 42, role: 'ORTA SAHA' },
      { x: 28, y: 16, role: 'FORVET' },
      { x: 72, y: 16, role: 'FORVET' },
    ],
  },
  '1-3-2': {
    label: '1-3-2',
    positions: [
      { x: 50, y: 92, role: 'KALECİ' },
      { x: 50, y: 64, role: 'DEFANS' },
      { x: 16, y: 42, role: 'ORTA SAHA' },
      { x: 50, y: 38, role: 'ORTA SAHA' },
      { x: 84, y: 42, role: 'ORTA SAHA' },
      { x: 28, y: 16, role: 'FORVET' },
      { x: 72, y: 16, role: 'FORVET' },
    ],
  },
};

// İki takım karşılıklı
const mapPos = (pos, side) => {
  if (side === 'A') return { ...pos, x: pos.x, y: 53 + (pos.y / 100) * 43 };
  return { ...pos, x: 100 - pos.x, y: 47 - (pos.y / 100) * 43 };
};

// Pozisyon kısa etiket
const POS_SHORT = {
  'KALECİ': 'KL',
  'DEFANS': 'DEF',
  'STOPER': 'STP',
  'SOL BEK': 'SB',
  'SAĞ BEK': 'SĞB',
  'ORTA SAHA': 'OS',
  'FORVET': 'FW',
};

const POSITIONS = ['KALECİ', 'STOPER', 'SOL BEK', 'SAĞ BEK', 'DEFANS', 'ORTA SAHA', 'FORVET'];

// Renk paleti — admin takım rengi seçerken
const TEAM_COLORS = [
  '#34d399', '#f87171', '#60a5fa', '#fbbf24',
  '#a78bfa', '#f472b6', '#22d3ee', '#fb923c',
  '#84cc16', '#ec4899', '#14b8a6', '#eab308',
];

// ═══════════════════════════════════════════════════════════
// PITCH — saha SVG'si (HaliSahaKolik ile aynı, takım rengi parametreli)
// ═══════════════════════════════════════════════════════════
const Pitch = ({ colA, colB }) => (
  <svg viewBox="0 0 100 100" preserveAspectRatio="none"
       style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.45 }}>
    <defs>
      <pattern id="lm-grass" patternUnits="userSpaceOnUse" width="100" height="5.5">
        <rect width="100" height="5.5" fill="#1a6b31" />
        <rect width="100" height="2.75" fill="#1e7a38" opacity="0.5" />
      </pattern>
      <linearGradient id="lm-glowA" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor={colA} stopOpacity="0.22" />
        <stop offset="100%" stopColor={colA} stopOpacity="0" />
      </linearGradient>
      <linearGradient id="lm-glowB" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={colB} stopOpacity="0.22" />
        <stop offset="100%" stopColor={colB} stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#lm-grass)" />
    <rect x="0" y="50" width="100" height="50" fill="url(#lm-glowA)" />
    <rect x="0" y="0" width="100" height="50" fill="url(#lm-glowB)" />
    <rect x="4" y="2" width="92" height="96" fill="none" stroke="#fff" strokeWidth="0.5" strokeOpacity="0.7" />
    <line x1="4" y1="50" x2="96" y2="50" stroke="#fff" strokeWidth="0.5" strokeOpacity="0.7" />
    <circle cx="50" cy="50" r="11" fill="none" stroke="#fff" strokeWidth="0.4" strokeOpacity="0.7" />
    <circle cx="50" cy="50" r="0.8" fill="#fff" opacity="0.7" />
    <rect x="22" y="82" width="56" height="16" fill="none" stroke="#fff" strokeWidth="0.4" strokeOpacity="0.7" />
    <rect x="34" y="92" width="32" height="6" fill="none" stroke="#fff" strokeWidth="0.4" strokeOpacity="0.7" />
    <path d="M34 82 A14 14 0 0 1 66 82" fill="none" stroke="#fff" strokeWidth="0.4" strokeOpacity="0.7" />
    <circle cx="50" cy="88" r="0.6" fill="#fff" opacity="0.6" />
    <rect x="22" y="2" width="56" height="16" fill="none" stroke="#fff" strokeWidth="0.4" strokeOpacity="0.7" />
    <rect x="34" y="2" width="32" height="6" fill="none" stroke="#fff" strokeWidth="0.4" strokeOpacity="0.7" />
    <path d="M34 18 A14 14 0 0 0 66 18" fill="none" stroke="#fff" strokeWidth="0.4" strokeOpacity="0.7" />
    <circle cx="50" cy="12" r="0.6" fill="#fff" opacity="0.6" />
  </svg>
);

// ═══════════════════════════════════════════════════════════
// FIELD AVATAR — sahadaki oyuncu
// ═══════════════════════════════════════════════════════════
const FieldAvatar = ({
  player, x, y, teamColor, isMe, side,
  onTap, onLongPress, onDragEnd,
  isSelected, fieldRef,
  isCaptain, isMVP, goalCount, ovr,
}) => {
  const pressTimer = useRef(null);
  const longFired = useRef(false);
  const dragStartPos = useRef(null);
  const isDragging = useRef(false);

  const start = (clientX, clientY) => {
    longFired.current = false;
    isDragging.current = false;
    dragStartPos.current = { x: clientX, y: clientY };
    if (onLongPress) {
      pressTimer.current = setTimeout(() => {
        longFired.current = true;
        hapticMedium();
        onLongPress();
      }, 500);
    }
  };
  const move = (clientX, clientY) => {
    if (!dragStartPos.current) return;
    const dx = clientX - dragStartPos.current.x;
    const dy = clientY - dragStartPos.current.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      isDragging.current = true;
      clearTimeout(pressTimer.current);
    }
  };
  const end = (clientX, clientY) => {
    clearTimeout(pressTimer.current);
    if (isDragging.current && onDragEnd && fieldRef?.current) {
      const rect = fieldRef.current.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * 100;
      const py = ((clientY - rect.top) / rect.height) * 100;
      onDragEnd(px, py);
    } else if (!longFired.current && !isDragging.current && onTap) {
      onTap();
    }
    isDragging.current = false;
    dragStartPos.current = null;
  };
  const cancel = () => {
    clearTimeout(pressTimer.current);
    isDragging.current = false;
    dragStartPos.current = null;
  };

  const initial = (player.nickname || '?').charAt(0).toUpperCase();

  return (
    <div
      onMouseDown={e => start(e.clientX, e.clientY)}
      onMouseMove={e => move(e.clientX, e.clientY)}
      onMouseUp={e => end(e.clientX, e.clientY)}
      onMouseLeave={cancel}
      onTouchStart={e => { const t = e.touches[0]; start(t.clientX, t.clientY); }}
      onTouchMove={e => { e.preventDefault(); const t = e.touches[0]; move(t.clientX, t.clientY); }}
      onTouchEnd={e => { const t = e.changedTouches[0]; end(t.clientX, t.clientY); }}
      onTouchCancel={cancel}
      className={isSelected ? 'lm-selecting' : ''}
      style={{
        position: 'absolute', left: `${x}%`, top: `${y}%`,
        transform: 'translate(-50%,-50%)',
        zIndex: isMe ? 25 : 15,
        userSelect: 'none', touchAction: 'none',
        cursor: (onTap || onLongPress || onDragEnd) ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.55))',
      }}
    >
      <div style={{
        position: 'relative',
        width: 48, height: 48, borderRadius: '50%',
        background: `linear-gradient(135deg, ${teamColor} 0%, ${teamColor}cc 100%)`,
        border: isSelected ? `2.5px solid ${C.warn}`
              : isMe       ? `2.5px solid #fff`
              : `2px solid rgba(255,255,255,0.4)`,
        boxShadow: isSelected
          ? `0 0 0 2px ${C.warn}, 0 6px 18px ${C.warn}55`
          : isMe
          ? `0 0 0 2px ${teamColor}, 0 6px 18px ${teamColor}55`
          : `0 4px 12px rgba(0,0,0,0.4)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#0a1628', fontSize: 18, fontWeight: 900,
        fontFamily: "'DM Sans',sans-serif",
      }}>
        {initial}

        {/* Kaptan rozeti */}
        {isCaptain && (
          <div style={{
            position: 'absolute', top: -5, left: -5,
            width: 17, height: 17, borderRadius: '50%',
            background: '#fbbf24', color: '#000',
            border: '2px solid #0c1117',
            fontSize: 9, fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'DM Sans',sans-serif",
            boxShadow: '0 2px 6px rgba(251,191,36,0.5)',
          }} title="Kaptan">C</div>
        )}

        {/* MVP rozeti — kaptan yoksa sağ-üst, varsa sağ-alt değil sadece üstte göster */}
        {isMVP && (
          <div style={{
            position: 'absolute', top: -6, right: -6,
            fontSize: 14, lineHeight: 1,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
          }} title="MVP">⭐</div>
        )}

        {/* Sen işareti */}
        {isMe && !isMVP && (
          <div style={{
            position: 'absolute', top: -4, right: -4,
            width: 14, height: 14, borderRadius: '50%',
            background: '#fff', border: `2px solid ${teamColor}`,
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          }} />
        )}

        {/* OVR rozeti — sol-alt, rating'e göre renk */}
        {ovr != null && (
          <div style={{
            position: 'absolute', bottom: -6, left: -6,
            background: `linear-gradient(135deg, ${
              ovr >= 90 ? '#fbbf24' :
              ovr >= 85 ? '#a78bfa' :
              ovr >= 75 ? '#60a5fa' :
              ovr >= 65 ? '#34d399' : '#94a3b8'
            }, ${
              ovr >= 90 ? '#f59e0b' :
              ovr >= 85 ? '#8b5cf6' :
              ovr >= 75 ? '#3b82f6' :
              ovr >= 65 ? '#10b981' : '#64748b'
            })`,
            color: '#0a1628',
            border: '2px solid #0c1117',
            borderRadius: 6, minWidth: 22, padding: '0 4px',
            fontSize: 10, fontWeight: 900,
            height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'JetBrains Mono',monospace",
            boxShadow: `0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25)`,
            lineHeight: 1,
            letterSpacing: 0.3,
          }} title={`OVR ${ovr}`}>
            {ovr}
          </div>
        )}

        {/* Forma no */}
        {player.jersey_number && (
          <div style={{
            position: 'absolute', bottom: -3, left: '50%',
            transform: 'translateX(-50%)',
            background: '#0a1628', color: '#fff',
            border: `1.5px solid ${teamColor}`,
            borderRadius: 4, padding: '0 4px',
            fontSize: 9, fontWeight: 900,
            fontFamily: "'JetBrains Mono',monospace",
            lineHeight: 1.3, minWidth: 14, textAlign: 'center',
          }}>{player.jersey_number}</div>
        )}

        {/* Gol sayacı (mini rozet) */}
        {goalCount > 0 && (
          <div style={{
            position: 'absolute', bottom: -6, right: -6,
            background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
            color: '#0a1628',
            border: '2px solid #0c1117',
            borderRadius: 999, minWidth: 18, height: 18,
            padding: '0 4px',
            fontSize: 10, fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'JetBrains Mono',monospace",
            boxShadow: '0 2px 6px rgba(251,191,36,0.5)',
          }} title={`${goalCount} gol`}>
            ⚽{goalCount}
          </div>
        )}
      </div>

      {/* Name plate */}
      <div style={{
        background: 'rgba(0,0,0,0.7)',
        border: `1px solid ${teamColor}55`,
        borderRadius: 4,
        padding: '1.5px 6px',
        fontSize: 9, fontWeight: 800,
        color: '#fff',
        fontFamily: "'DM Sans',sans-serif",
        whiteSpace: 'nowrap',
        maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis',
        backdropFilter: 'blur(4px)',
        textTransform: 'uppercase', letterSpacing: 0.3,
      }}>{player.nickname || 'Misafir'}</div>

      {player.position && (
        <div style={{
          fontSize: 7.5, color: 'rgba(255,255,255,0.55)',
          fontWeight: 700, letterSpacing: 0.5,
          fontFamily: "'Bebas Neue','DM Sans',sans-serif",
        }}>{POS_SHORT[player.position] || player.position}</div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// EMPTY SLOT — boş pozisyon
// ═══════════════════════════════════════════════════════════
const EmptySlot = ({ x, y, role, teamColor, canTap, onTap }) => (
  <div
    onClick={() => { if (canTap) { hapticLight(); onTap?.(); } }}
    style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`,
      transform: 'translate(-50%,-50%)',
      zIndex: 5,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      cursor: canTap ? 'pointer' : 'default',
    }}
  >
    <div style={{
      width: 48, height: 48, borderRadius: '50%',
      border: `2.5px dashed ${teamColor}${canTap ? '99' : '55'}`,
      background: `radial-gradient(circle at 50% 50%, ${teamColor}1c 0%, ${teamColor}06 70%, transparent 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: teamColor, fontSize: 22, fontWeight: 300,
      transition: 'transform 0.15s',
      boxShadow: `inset 0 0 12px ${teamColor}15`,
    }}>{canTap ? '+' : ''}</div>
    <div style={{
      fontSize: 8.5, color: 'rgba(255,255,255,0.5)',
      fontWeight: 800, textTransform: 'uppercase',
      letterSpacing: 0.5,
      fontFamily: "'Bebas Neue','DM Sans',sans-serif",
      background: 'rgba(0,0,0,0.5)',
      padding: '1.5px 5px', borderRadius: 3,
      backdropFilter: 'blur(4px)',
    }}>{POS_SHORT[role] || role}</div>
  </div>
);

// ═══════════════════════════════════════════════════════════
// ATOMIC UI — Pill, Btn, Input, Card, StatusBadge, BackBtn
// ═══════════════════════════════════════════════════════════
const Pill = ({ children, color = C.accent, style }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: `${color}18`, border: `1px solid ${color}44`,
    color, borderRadius: 20, padding: '3px 10px',
    fontSize: 11, fontWeight: 700, letterSpacing: 0.4,
    textTransform: 'uppercase', fontFamily: "'DM Sans',sans-serif",
    ...style,
  }}>{children}</span>
);

const Btn = ({ children, onClick, color = C.accent, variant = 'default', disabled, style, small }) => {
  let bg, border, textColor;
  if (disabled) {
    bg = 'rgba(255,255,255,0.05)'; border = '1px solid rgba(255,255,255,0.1)';
    textColor = 'rgba(255,255,255,0.25)';
  } else if (variant === 'solid') {
    bg = color; border = `1px solid ${color}`; textColor = '#000';
  } else if (variant === 'ghost') {
    bg = 'rgba(255,255,255,0.04)'; border = '1px solid rgba(255,255,255,0.12)'; textColor = C.text;
  } else {
    bg = `${color}18`; border = `1px solid ${color}55`; textColor = color;
  }
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: bg, border, color: textColor,
      borderRadius: 10, padding: small ? '8px 14px' : '12px 20px',
      fontSize: small ? 13 : 15, fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer',
      width: '100%', textAlign: 'center',
      fontFamily: "'DM Sans',sans-serif",
      transition: 'all 0.15s',
      ...style,
    }}>{children}</button>
  );
};

const Input = ({ value, onChange, placeholder, style, type = 'text', maxLength }) => (
  <input
    value={value}
    type={type}
    maxLength={maxLength}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10, padding: '12px 14px',
      color: C.text, fontSize: 15,
      width: '100%', boxSizing: 'border-box',
      fontFamily: "'DM Sans',sans-serif",
      outline: 'none',
      ...style,
    }}
  />
);

const Card = ({ children, style, onClick }) => (
  <div onClick={onClick} style={{
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 14, padding: 16,
    ...style,
  }}>{children}</div>
);

const StatusBadge = ({ status }) => {
  const map = {
    lobby:    { label: '⏳ Lobi', color: '#fbbf24' },
    active:   { label: '🟢 Canlı', color: '#34d399' },
    finished: { label: '🏁 Bitti', color: '#94a3b8' },
  };
  const s = map[status] || map.lobby;
  return <Pill color={s.color}>{s.label}</Pill>;
};

const BackBtn = ({ onClick, label = '← Geri' }) => (
  <button onClick={onClick} style={{
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: C.text,
    cursor: 'pointer', fontSize: 13, fontWeight: 600,
    padding: '6px 12px', borderRadius: 8,
    marginBottom: 16,
    fontFamily: "'DM Sans',sans-serif",
  }}>{label}</button>
);

// Bağlantı durumu indikatörü
const ConnectionIndicator = ({ status }) => {
  // status: 'live' | 'reconnecting' | 'offline'
  const map = {
    live:         { color: '#34d399', label: 'Canlı', anim: 'lmLive' },
    reconnecting: { color: '#fbbf24', label: 'Bağlanıyor', anim: 'lmPulse' },
    offline:      { color: '#ef4444', label: 'Çevrimdışı', anim: 'lmDanger' },
  };
  const s = map[status] || map.live;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 9px', borderRadius: 999,
      background: `${s.color}14`, border: `1px solid ${s.color}33`,
      fontSize: 10, fontWeight: 700, color: s.color,
      letterSpacing: 0.6, textTransform: 'uppercase',
      fontFamily: "'DM Sans',sans-serif",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: s.color,
        animation: `${s.anim} 2s ease-out infinite`,
      }} />
      {s.label}
    </div>
  );
};

// Mini avatar (yedek kulübesinde, oyuncu listesi pillerinde)
const MiniAvatar = ({ player, color, size = 26, onClick, isCaptain }) => {
  const initial = (player.nickname || '?')[0].toUpperCase();
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        width: size, height: size, borderRadius: '50%',
        background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
        border: '1.5px solid rgba(255,255,255,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#0a1628', fontSize: Math.round(size * 0.42), fontWeight: 900,
        fontFamily: "'DM Sans',sans-serif",
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
      }}
    >
      {initial}
      {isCaptain && (
        <span style={{
          position: 'absolute', top: -3, left: -3,
          width: 11, height: 11, borderRadius: '50%',
          background: '#fbbf24', color: '#000',
          fontSize: 7, fontWeight: 900,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1.5px solid #0c1117',
        }}>C</span>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT — aşağıda
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT — state, handlers, üst ekranlar
// (renderPitchView ve renderRateView aşağıda devam ediyor)
// ═══════════════════════════════════════════════════════════
export default function LiveMatch() {
  // ─── Ana state ───
  const [screen, setScreen] = useState('home');
  const [session, setSession] = useState(null);
  const [players, setPlayers] = useState([]);
  const [events, setEvents] = useState([]);
  const [ratings, setRatings] = useState([]);

  const [activeSessions, setActiveSessions] = useState([]);
  const [finishedSessions, setFinishedSessions] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [myNickname, setMyNickname] = useState(getNickname() || '');
  const [nicknameSet, setNicknameSet] = useState(!!getNickname());

  // Create form
  const [fieldName, setFieldName] = useState('');
  const [location, setLocation] = useState('');
  const [teamAName, setTeamAName] = useState('Takım A');
  const [teamBName, setTeamBName] = useState('Takım B');
  const [teamAColor, setTeamAColor] = useState(C.defaultA);
  const [teamBColor, setTeamBColor] = useState(C.defaultB);
  const [duration, setDuration] = useState(60);

  // Join form
  const [joinCode, setJoinCode] = useState('');

  // Rating
  const [myRatings, setMyRatings] = useState({});
  const [ratingsSubmitted, setRatingsSubmitted] = useState(false);

  // UI state
  const [showFormationPicker, setShowFormationPicker] = useState(null);
  const [adminMenuFor, setAdminMenuFor] = useState(null);
  const [adminSlotPicker, setAdminSlotPicker] = useState(null);
  const [showMyProfile, setShowMyProfile] = useState(false);
  const [showAdminSettings, setShowAdminSettings] = useState(false);
  const [showGoalSheet, setShowGoalSheet] = useState(null);    // { team }
  const [showMVPSheet, setShowMVPSheet] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  // Bağlantı durumu
  const [connStatus, setConnStatus] = useState('live');

  const deviceId = getDeviceId();
  const unsubRef = useRef(null);
  const screenRef = useRef(screen);
  const fieldRef = useRef(null);
  const historySavedRef = useRef(false);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  // ─── Yardımcılar ───
  const me = useMemo(() => players.find(p => p.device_id === deviceId), [players, deviceId]);
  const amIAdmin = session ? isAdmin(session) : false;
  const amICoAdmin = session ? isCoAdmin(session) : false;
  const amIFullPower = session ? hasFullPower(session) : false;
  const amICaptainA = session ? isCaptainOfTeam(players, 'A') : false;
  const amICaptainB = session ? isCaptainOfTeam(players, 'B') : false;
  const myTeam = me?.team || null;
  const formationA = session?.formation_a || '3-2-1';
  const formationB = session?.formation_b || '3-2-1';
  const colA = session?.team_a_color || C.defaultA;
  const colB = session?.team_b_color || C.defaultB;
  const avgRatings = useMemo(() => computeAverageRatings(ratings), [ratings]);

  const canControlTeam = (team) => {
    if (amIFullPower) return true;
    if (team === 'A' && amICaptainA) return true;
    if (team === 'B' && amICaptainB) return true;
    return false;
  };
  const canScoreFor = (team) => canControlTeam(team);

  const goalsByPlayer = useMemo(() => {
    const map = {};
    events.forEach(ev => {
      if (ev.type === 'goal' && ev.device_id) {
        map[ev.device_id] = (map[ev.device_id] || 0) + 1;
      }
    });
    return map;
  }, [events]);

  // Her oyuncunun OVR'i (yetenekleri varsa hesapla, yoksa varsayılan 70)
  const ovrByPlayer = useMemo(() => {
    const map = {};
    players.forEach(p => {
      if (p.attributes && p.position) {
        const v = computeOverallFromAttributes(p.attributes, p.position);
        map[p.device_id] = v || 70;
      } else {
        // Profil tamamlanmamış oyuncular için default
        map[p.device_id] = 70;
      }
    });
    return map;
  }, [players]);

  const showToast = useCallback((msg, ms = 2200) => {
    setToast(msg);
    setTimeout(() => setToast(''), ms);
  }, []);

  // ─── Session listesi ───
  const loadMySessions = useCallback(async () => {
    try {
      const [active, finished] = await Promise.all([
        getMyActiveSessions(),
        getMyFinishedSessions(),
      ]);
      setActiveSessions(active);
      setFinishedSessions(finished);
    } catch {}
  }, []);
  useEffect(() => { loadMySessions(); }, [loadMySessions]);

  // ─── Connect & realtime ───
  const connectToSession = useCallback(async (sess) => {
    setSession(sess);
    setError('');
    historySavedRef.current = false;
    if (unsubRef.current) unsubRef.current();

    const refresh = async () => {
      try {
        const [s, p, e, r] = await Promise.all([
          getSession(sess.id),
          getSessionPlayers(sess.id),
          getSessionEvents(sess.id),
          getSessionRatings(sess.id),
        ]);
        setSession(s);
        setPlayers(p);
        setEvents(e);
        setRatings(r);
        setConnStatus('live');

        const cur = screenRef.current;
        if (s.status === 'active' && (cur === 'lobby' || cur === 'home')) setScreen('match');
        if (s.status === 'finished' && cur !== 'rate') setScreen('rate');
        if (s.status === 'lobby' && cur === 'home') setScreen('lobby');
      } catch (err) {
        console.error('[LiveMatch] refresh:', err);
        setConnStatus('reconnecting');
        setError('Bağlantı hatası. Tekrar deneniyor…');
      }
    };

    try {
      await refresh();
      unsubRef.current = subscribeToSession(sess.id, refresh);
      setScreen(sess.status === 'finished' ? 'rate' : sess.status === 'active' ? 'match' : 'lobby');
    } catch (err) {
      console.error('[LiveMatch] connect:', err);
      setError('Maça bağlanılamadı: ' + (err.message || 'Bilinmeyen hata'));
      setSession(null);
      setScreen('home');
    }
  }, []);
  useEffect(() => () => { if (unsubRef.current) unsubRef.current(); }, []);

  // Status finished olunca matchHistoryStore'a kaydet (bir kez)
  useEffect(() => {
    if (session?.status === 'finished' && !historySavedRef.current && players.length > 0) {
      historySavedRef.current = true;
      try {
        persistMatchToHistory(session, players, events);
        showToast('📊 Maç istatistiklerine kaydedildi');
      } catch (e) {
        console.warn('[persistMatchToHistory]', e);
      }
    }
  }, [session?.status, players, events, showToast]);

  // ─── Handlers ───
  const handleSetNickname = async () => {
    if (!myNickname.trim()) { setError('Takma ad gir.'); return; }
    setLoading(true);
    await registerDevice(myNickname.trim());
    setNicknameSet(true);
    setError('');
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!fieldName.trim()) { setError('Saha adı gir.'); return; }
    setLoading(true); setError('');
    try {
      const sess = await createSession({
        fieldName, location, teamAName, teamBName,
        teamAColor, teamBColor, durationMinutes: duration,
      });
      await connectToSession(sess);
      hapticSuccess();
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) { setError('Kodu gir.'); return; }
    setLoading(true); setError('');
    try {
      const sess = await joinSessionByCode(joinCode);
      await connectToSession(sess);
      hapticMedium();
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleAssignTeam = async (targetDeviceId, team) => {
    if (!session) return;
    hapticLight();
    try { await assignTeam(session.id, targetDeviceId, team); }
    catch (e) { setError(e.message); }
    setAdminMenuFor(null);
  };

  const handleRemovePlayer = async (targetDeviceId) => {
    if (!session) return;
    if (!window.confirm('Bu oyuncuyu maçtan çıkar?')) return;
    hapticMedium();
    try { await removePlayer(session.id, targetDeviceId); }
    catch (e) { setError(e.message); }
    setAdminMenuFor(null);
  };

  const handleStartMatch = async () => {
    if (!session) return;
    setLoading(true);
    try {
      await startMatch(session.id);
      hapticHeavy();
      setScreen('match');
      setSession(prev => prev ? { ...prev, status: 'active' } : prev);
    } catch (e) {
      setError(e.message || 'Maç başlatılamadı.');
    }
    setLoading(false);
  };

  const handleFinishMatch = async () => {
    if (!session) return;
    if (!window.confirm('Maçı bitirmek istediğine emin misin?')) return;
    setLoading(true);
    try { await finishMatch(session.id); hapticHeavy(); }
    catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleSetFormation = async (team, formation) => {
    if (!session || !canControlTeam(team)) return;
    hapticLight();
    try { await setTeamFormation(session.id, team, formation); }
    catch (e) { setError(e.message); }
    setShowFormationPicker(null);
  };

  const handleEmptySlotTap = async (team, slotIdx, role) => {
    if (!session || !me) return;
    setError('');
    if (canControlTeam(team) && selectedPlayerId) {
      try {
        await adminSetPlayerSlot(session.id, selectedPlayerId, team, slotIdx, role);
        hapticSuccess();
      } catch (e) { setError(e.message); }
      setSelectedPlayerId(null);
      return;
    }
    if (canControlTeam(team)) {
      setAdminSlotPicker({ team, slotIdx, role });
      return;
    }
    if (myTeam !== team) {
      setError(`Önce ${team === 'A' ? session.team_a_name : session.team_b_name} takımına atan!`);
      return;
    }
    try {
      await setPlayerSlot(session.id, deviceId, slotIdx, role);
      hapticSuccess();
    } catch (e) { setError(e.message); }
  };

  const handleMyAvatarTap = () => {
    if (!session || !me) return;
    hapticLight();
    setShowMyProfile(true);
  };

  const handleLeaveSlot = async () => {
    if (!session || !me) return;
    try {
      await clearPlayerSlot(session.id, deviceId);
      hapticLight();
      setShowMyProfile(false);
    } catch (e) { setError(e.message); }
  };

  const handleSaveProfile = async (profile) => {
    if (!session || !me) return;
    try {
      await updatePlayerProfile(session.id, deviceId, profile);
      hapticSuccess();
      setShowMyProfile(false);
    } catch (e) { setError(e.message || 'Profil kaydedilemedi.'); }
  };

  const handleAvatarLongPress = (targetDeviceId) => {
    if (!amIFullPower) return;
    setAdminMenuFor(targetDeviceId);
  };

  const handleDragDrop = async (player, dropX, dropY) => {
    if (!session) return;
    setError('');

    const allSlots = [];
    (FORMATIONS[formationA] || FORMATIONS['3-2-1']).positions.forEach((rp, idx) => {
      const p = mapPos(rp, 'A');
      allSlots.push({ team: 'A', slotIdx: idx, role: rp.role, x: p.x, y: p.y });
    });
    (FORMATIONS[formationB] || FORMATIONS['3-2-1']).positions.forEach((rp, idx) => {
      const p = mapPos(rp, 'B');
      allSlots.push({ team: 'B', slotIdx: idx, role: rp.role, x: p.x, y: p.y });
    });

    // Rol bazlı slot uygunluğu — defans forvet slotuna gitmesin vb.
    const pr = player.position || '';
    const isDef = /DEFANS|STOPER|BEK/.test(pr);
    const isMid = pr === 'ORTA SAHA';
    const isFwd = pr === 'FORVET';
    const roleAllows = (slotRole) => {
      if (!pr) return true;
      if (slotRole === 'KALECİ') return pr === 'KALECİ';
      if (pr === 'KALECİ') return slotRole === 'KALECİ';
      if (isDef) return /DEFANS|STOPER|BEK/.test(slotRole) || slotRole === 'ORTA SAHA';
      if (isMid) return slotRole !== 'KALECİ';
      if (isFwd) return slotRole === 'ORTA SAHA' || slotRole === 'FORVET';
      return true;
    };

    const base = amIFullPower
      ? allSlots
      : allSlots.filter(s => s.team === player.team && canControlTeam(s.team));
    const allowed = base.filter(s => roleAllows(s.role));

    let best = null, bestDist = Infinity;
    for (const slot of allowed) {
      const dist = Math.hypot(slot.x - dropX, slot.y - dropY);
      if (dist < bestDist) { bestDist = dist; best = slot; }
    }
    if (!best || bestDist > 14) return;

    try {
      if (canControlTeam(best.team) && player.device_id !== deviceId) {
        await adminSetPlayerSlot(session.id, player.device_id, best.team, best.slotIdx, best.role);
      } else {
        await setPlayerSlot(session.id, deviceId, best.slotIdx, best.role);
      }
      hapticSuccess();
    } catch (e) { setError(e.message); }
  };

  const handleAdminClearSlot = async (targetDeviceId) => {
    if (!session) return;
    try { await clearPlayerSlot(session.id, targetDeviceId); hapticLight(); }
    catch (e) { setError(e.message); }
    setAdminMenuFor(null);
  };

  const handleAdminPlaceInSlot = async (targetDeviceId) => {
    if (!session || !adminSlotPicker) return;
    const { team, slotIdx, role } = adminSlotPicker;
    try {
      await adminSetPlayerSlot(session.id, targetDeviceId, team, slotIdx, role);
      hapticSuccess();
    } catch (e) { setError(e.message); }
    setAdminSlotPicker(null);
  };

  const handleSetCaptain = async (targetDeviceId) => {
    if (!session) return;
    try {
      await setCaptain(session.id, targetDeviceId);
      hapticSuccess();
      showToast('👑 Kaptan atandı');
    } catch (e) { setError(e.message); }
    setAdminMenuFor(null);
  };

  const handleRemoveCaptain = async (targetDeviceId) => {
    if (!session) return;
    try { await removeCaptain(session.id, targetDeviceId); hapticLight(); }
    catch (e) { setError(e.message); }
    setAdminMenuFor(null);
  };

  const handleSetCoAdmin = async (targetDeviceId) => {
    if (!session) return;
    try {
      await setCoAdmin(session.id, targetDeviceId);
      hapticSuccess();
      showToast('⚡ Yetki devredildi (Yardımcı)');
    } catch (e) { setError(e.message); }
    setAdminMenuFor(null);
  };

  const handleRemoveCoAdmin = async () => {
    if (!session) return;
    try { await setCoAdmin(session.id, null); hapticLight(); }
    catch (e) { setError(e.message); }
  };

  const handleToggleReady = async () => {
    if (!session || !me) return;
    try {
      await togglePlayerReady(session.id, !me.is_ready);
      hapticLight();
    } catch (e) {}
  };

  const handleOpenGoalSheet = (team) => {
    if (!canScoreFor(team)) return;
    hapticLight();
    setShowGoalSheet({ team });
  };

  const handleConfirmGoal = async ({ scorer, assist, goalType, isOwn }) => {
    if (!session || !showGoalSheet) return;
    const { team } = showGoalSheet;
    hapticHeavy();
    try {
      await addEvent(session.id, {
        type: isOwn ? 'own_goal' : 'goal',
        team,
        deviceId: scorer || null,
        assistDeviceId: assist || null,
        goalType: goalType || 'normal',
      });
    } catch (e) { setError(e.message); }
    setShowGoalSheet(null);
  };

  const handleUndoLastGoal = async (team) => {
    const lastGoal = [...events].reverse().find(e =>
      (e.type === 'goal' || e.type === 'own_goal') && e.team === team
    );
    if (!lastGoal) return;
    hapticMedium();
    try { await removeEvent(lastGoal.id, session.id); }
    catch (e) { setError(e.message); }
  };

  const handleSetMVP = async (targetDeviceId) => {
    if (!session) return;
    try {
      await setMVP(session.id, targetDeviceId);
      hapticSuccess();
      showToast('⭐ MVP atandı');
    } catch (e) { setError(e.message); }
    setShowMVPSheet(false);
  };

  const handleUpdateMeta = async (meta) => {
    if (!session) return;
    try {
      await updateSessionMeta(session.id, meta);
      hapticLight();
    } catch (e) { setError(e.message); }
  };

  const handleShareInvite = async () => {
    if (!session) return;
    const code = session.join_code;
    const text = `⚽ Halı Saha maçıma katıl!\n\nKod: ${code}\n\nUygulamayı aç → "Online Halı Saha" → "Maça Katıl" → kodu yapıştır.`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Halı Saha Maçı', text }); } catch {}
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      showToast('📋 Davet metni kopyalandı');
    }
  };

  const handleCopyCode = () => {
    if (!session) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(session.join_code);
      hapticLight();
      showToast('📋 Kod kopyalandı');
    }
  };

  const handleSubmitRatings = async () => {
    if (!session) return;
    setLoading(true);
    try {
      for (const [ratedId, score] of Object.entries(myRatings)) {
        if (score > 0) await submitRating(session.id, ratedId, score, '');
      }
      setRatingsSubmitted(true);
      hapticSuccess();
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleShareResult = async () => {
    if (!session) return;
    const text = `⚽ Maç Sonu!\n${session.team_a_name} ${session.score_a} - ${session.score_b} ${session.team_b_name}\n${session.field_name ? '📍 ' + session.field_name : ''}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Maç Sonucu', text }); } catch {}
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      showToast('📋 Sonuç kopyalandı');
    }
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER WRAPPER
  // ═══════════════════════════════════════════════════════════
  const wrap = (children) => (
    <>
      <style>{lmCSS}</style>
      <div style={{
        minHeight: '100vh', background: C.bg,
        fontFamily: "'DM Sans','Segoe UI',sans-serif",
        color: C.text, paddingBottom: 80,
      }}>
        {children}
        {toast && (
          <div style={{
            position: 'fixed', bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
            left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(20,30,42,0.96)',
            border: `1px solid ${C.accent}55`,
            color: C.text, padding: '10px 18px',
            borderRadius: 999, fontSize: 13, fontWeight: 700,
            zIndex: 9999, boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)',
            animation: 'lmFadeUp 0.3s ease-out',
          }}>{toast}</div>
        )}
      </div>
    </>
  );

  // ═══ NICKNAME ═══
  if (!nicknameSet) {
    return wrap(
      <div style={{ padding: '60px 20px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48 }}>⚽</div>
          <h2 style={{ margin: '12px 0 6px', fontSize: 22, fontWeight: 800 }}>Canlı Saha</h2>
          <p style={{ color: C.muted, fontSize: 14 }}>Önce bir takma ad belirle</p>
        </div>
        <Input value={myNickname} onChange={setMyNickname} placeholder="Takma adın (örn: Mehmet)" maxLength={20} />
        {error && <p style={{ color: C.danger, fontSize: 13, marginTop: 8 }}>{error}</p>}
        <Btn onClick={handleSetNickname} disabled={loading} style={{ marginTop: 16 }}>
          {loading ? 'Kaydediliyor...' : 'Devam Et →'}
        </Btn>
      </div>
    );
  }

  // ═══ HOME ═══
  if (screen === 'home') {
    return wrap(
      <div style={{ padding: '60px 16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>⚽ Canlı Saha</h2>
            <p style={{ margin: '2px 0 0', color: C.muted, fontSize: 13 }}>Merhaba, {getNickname()}</p>
          </div>
          <button onClick={() => setNicknameSet(false)} style={{
            background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer',
          }}>✏️ İsim</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <button onClick={() => { setScreen('create'); setError(''); }} style={bigActionBtn(C.accent)}>
            <span style={{ fontSize: 28 }}>🏟️</span>
            <span style={{ fontSize: 14, fontWeight: 800 }}>Maç Kur</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Admin ol</span>
          </button>
          <button onClick={() => { setScreen('join'); setError(''); }} style={bigActionBtn(C.blue)}>
            <span style={{ fontSize: 28 }}>🔗</span>
            <span style={{ fontSize: 14, fontWeight: 800 }}>Katıl</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Kodu gir</span>
          </button>
        </div>

        {activeSessions.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>Devam Eden</p>
            {activeSessions.map(s => (
              <Card key={s.id} style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => connectToSession(s)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{s.field_name || 'Halı Saha'}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      🔑 {s.join_code} · {s.team_a_name} vs {s.team_b_name}
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              </Card>
            ))}
          </div>
        )}

        {finishedSessions.length > 0 && (
          <div>
            <p style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>Geçmiş Maçlar</p>
            {finishedSessions.slice(0, 5).map(s => (
              <Card key={s.id} style={{ marginBottom: 8, cursor: 'pointer', opacity: 0.75 }} onClick={() => connectToSession(s)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.field_name || 'Halı Saha'}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {s.team_a_name} {s.score_a} - {s.score_b} {s.team_b_name}
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              </Card>
            ))}
          </div>
        )}

        {activeSessions.length === 0 && finishedSessions.length === 0 && (
          <div style={{ textAlign: 'center', color: C.muted, padding: '40px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏃</div>
            <p style={{ fontSize: 14 }}>Henüz maçın yok. Bir maç kur veya bir koda katıl!</p>
          </div>
        )}
      </div>
    );
  }

  // ═══ CREATE ═══
  if (screen === 'create') {
    return wrap(
      <div style={{ padding: '60px 16px 20px' }}>
        <BackBtn onClick={() => setScreen('home')} />
        <h3 style={{ marginBottom: 20, fontSize: 18, fontWeight: 800 }}>🏟️ Yeni Maç Kur</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl}>Saha</label>
            <Input value={fieldName} onChange={setFieldName} placeholder="Saha adı (zorunlu)" />
          </div>
          <Input value={location} onChange={setLocation} placeholder="Konum (opsiyonel)" />

          <div>
            <label style={lbl}>Takım A</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Input value={teamAName} onChange={setTeamAName} placeholder="Takım A adı" style={{ flex: 1 }} maxLength={20} />
              <ColorChip color={teamAColor} onChange={setTeamAColor} />
            </div>
          </div>

          <div>
            <label style={lbl}>Takım B</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Input value={teamBName} onChange={setTeamBName} placeholder="Takım B adı" style={{ flex: 1 }} maxLength={20} />
              <ColorChip color={teamBColor} onChange={setTeamBColor} />
            </div>
          </div>

          <div>
            <label style={lbl}>Maç süresi (dakika)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[30, 45, 60, 90].map(d => (
                <button key={d} onClick={() => setDuration(d)} style={{
                  flex: 1, padding: '10px', borderRadius: 8,
                  background: duration === d ? `${C.accent}22` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${duration === d ? `${C.accent}66` : 'rgba(255,255,255,0.1)'}`,
                  color: duration === d ? C.accent : C.text,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'DM Sans',sans-serif",
                }}>{d}'</button>
              ))}
            </div>
          </div>

          {error && <p style={{ color: C.danger, fontSize: 13 }}>{error}</p>}
          <Btn onClick={handleCreate} disabled={loading}>
            {loading ? 'Oluşturuluyor...' : '🚀 Maçı Oluştur'}
          </Btn>
        </div>
      </div>
    );
  }

  // ═══ JOIN ═══
  if (screen === 'join') {
    return wrap(
      <div style={{ padding: '60px 16px 20px' }}>
        <BackBtn onClick={() => setScreen('home')} />
        <h3 style={{ marginBottom: 8, fontSize: 18, fontWeight: 800 }}>🔗 Maça Katıl</h3>
        <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>Admin'in sana gönderdiği kodu gir</p>
        <Input
          value={joinCode}
          onChange={v => setJoinCode(v.toUpperCase())}
          placeholder="HK-XXXX"
          style={{ fontSize: 22, textAlign: 'center', letterSpacing: 4, fontFamily: "'JetBrains Mono',monospace" }}
        />
        {error && <p style={{ color: C.danger, fontSize: 13, marginTop: 8 }}>{error}</p>}
        <Btn onClick={handleJoin} disabled={loading || !joinCode.trim()} style={{ marginTop: 16 }}>
          {loading ? 'Bağlanıyor...' : 'Katıl →'}
        </Btn>
      </div>
    );
  }

  // ═══ LOBBY & MATCH ═══
  if ((screen === 'lobby' || screen === 'match') && session) return renderPitchView();

  // ═══ RATE ═══
  if (screen === 'rate' && session) return renderRateView();

  return wrap(<div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Yükleniyor...</div>);

  // ═══════════════════════════════════════════════════════════
  // PITCH VIEW & RATE VIEW — aşağıdaki dosyaya inlined
  // ═══════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════
  // PITCH VIEW (lobby + match)
  // ═══════════════════════════════════════════════════════════
  function renderPitchView() {
    const isLobby = screen === 'lobby';
    const teamAPlayers = players.filter(p => p.team === 'A');
    const teamBPlayers = players.filter(p => p.team === 'B');
    const unassigned = players.filter(p => !p.team);
    const goalEvents = events.filter(e => e.type === 'goal' || e.type === 'own_goal');

    const slotMap = (team) => {
      const map = {};
      players.filter(p => p.team === team && p.slot_index != null).forEach(p => {
        map[p.slot_index] = p;
      });
      return map;
    };
    const slotsA = slotMap('A');
    const slotsB = slotMap('B');

    const benchA = teamAPlayers.filter(p => p.slot_index == null);
    const benchB = teamBPlayers.filter(p => p.slot_index == null);

    const formA = FORMATIONS[formationA] || FORMATIONS['3-2-1'];
    const formB = FORMATIONS[formationB] || FORMATIONS['3-2-1'];

    const captainA = teamAPlayers.find(p => p.is_captain);
    const captainB = teamBPlayers.find(p => p.is_captain);

    const myRoleLabel = (() => {
      const role = getMyRole(session, players);
      if (role === 'admin') return '👑 Admin';
      if (role === 'co_admin') return '⚡ Yardımcı';
      if (role === 'captain_A') return '🅒 Kaptan · ' + session.team_a_name;
      if (role === 'captain_B') return '🅒 Kaptan · ' + session.team_b_name;
      return null;
    })();

    const readyCount = players.filter(p => p.is_ready).length;

    return wrap(
      <div style={{ padding: '50px 0 0' }}>
        {/* ═══ ÜST BAR ═══ */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0 16px 10px', gap: 8,
        }}>
          <button onClick={() => { setSession(null); setScreen('home'); loadMySessions(); }}
                  style={miniBtn}>← Çık</button>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, justifyContent: 'center' }}>
            <ConnectionIndicator status={connStatus} />
            <StatusBadge status={session.status} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {amIFullPower && (
              <button onClick={() => { hapticLight(); setShowAdminSettings(true); }}
                      style={{ ...miniBtn, padding: '6px 10px' }}>⚙️</button>
            )}
            {amIFullPower && session.status === 'active' && (
              <button onClick={handleFinishMatch} style={{
                background: '#ef444418', border: '1px solid #ef444433', color: C.danger,
                borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              }}>Bitir 🏁</button>
            )}
          </div>
        </div>

        {/* ═══ ROL ŞERİDİ ═══ */}
        {myRoleLabel && (
          <div style={{
            margin: '0 16px 8px',
            padding: '5px 12px', borderRadius: 8,
            background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.22)',
            fontSize: 11, color: C.warn, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>{myRoleLabel}</span>
          </div>
        )}

        {/* ═══ DAVET KARTI (lobby) ═══ */}
        {isLobby && (
          <div style={{ margin: '0 16px 12px' }}>
            <Card style={{
              background: `linear-gradient(135deg, ${colA}10, ${colB}10)`,
              borderColor: 'rgba(255,255,255,0.1)',
              padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                    Davet Kodu
                  </div>
                  <div style={{
                    fontSize: 26, fontWeight: 900, color: C.accent,
                    letterSpacing: 4,
                    fontFamily: "'JetBrains Mono',monospace",
                    lineHeight: 1.1,
                  }}>{session.join_code}</div>
                  <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4 }}>
                    {session.field_name && <>📍 {session.field_name} · </>}
                    {players.length} oyuncu · {readyCount} hazır
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button onClick={handleCopyCode} style={inviteBtnStyle(C.accent)}>📋 Kopyala</button>
                  <button onClick={handleShareInvite} style={inviteBtnStyle(C.blue)}>📤 Paylaş</button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ═══ TAP-TO-PLACE BANNER ═══ */}
        {selectedPlayerId && (() => {
          const sel = players.find(p => p.device_id === selectedPlayerId);
          return (
            <div style={{
              margin: '0 16px 8px',
              background: `${C.warn}15`,
              border: `1px solid ${C.warn}44`,
              borderRadius: 10, padding: '8px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>👆</span>
              <span style={{ flex: 1, fontSize: 12, color: C.warn, fontWeight: 700 }}>
                <strong>{sel?.nickname}</strong> seçildi — boş bir slota dokun
              </span>
              <button onClick={() => { setSelectedPlayerId(null); hapticLight(); }} style={{
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                color: C.text, borderRadius: 6, padding: '3px 10px',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}>İptal</button>
            </div>
          );
        })()}

        {/* ═══ SKOR + GOL BUTONLARI (active) ═══ */}
        {session.status === 'active' && (
          <ScoreBoard
            session={session}
            colA={colA} colB={colB}
            canScoreA={canScoreFor('A')}
            canScoreB={canScoreFor('B')}
            onAddGoal={handleOpenGoalSheet}
            onUndoGoal={handleUndoLastGoal}
          />
        )}

        {/* ═══ FORMASYON BARI ═══ */}
        <div style={{ margin: '0 16px 8px', display: 'flex', gap: 8 }}>
          {['B', 'A'].map(side => {
            const teamName = side === 'A' ? session.team_a_name : session.team_b_name;
            const formation = side === 'A' ? formationA : formationB;
            const teamColor = side === 'A' ? colA : colB;
            const count = (side === 'A' ? teamAPlayers : teamBPlayers).length;
            const cap = side === 'A' ? captainA : captainB;
            const canPick = canControlTeam(side);
            return (
              <div key={side} style={{ flex: 1, position: 'relative' }}>
                <button
                  onClick={() => canPick && setShowFormationPicker(showFormationPicker === side ? null : side)}
                  disabled={!canPick}
                  style={{
                    width: '100%',
                    background: `${teamColor}10`,
                    border: `1px solid ${teamColor}33`,
                    borderRadius: 8, padding: '8px 10px',
                    color: teamColor,
                    cursor: canPick ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontSize: 12, fontWeight: 700,
                    fontFamily: "'DM Sans',sans-serif",
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: teamColor, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {teamName}
                    </span>
                    <span style={{ opacity: 0.6, flexShrink: 0 }}>({count})</span>
                    {cap && <span style={{ fontSize: 10, color: C.warn, flexShrink: 0 }}>👑</span>}
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, flexShrink: 0 }}>
                    {formation} {canPick && '▾'}
                  </span>
                </button>
                {showFormationPicker === side && (
                  <div style={{
                    position: 'absolute', top: '105%', left: 0, right: 0, zIndex: 50,
                    background: '#111318',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10, overflow: 'hidden',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
                  }}>
                    {Object.keys(FORMATIONS).map(f => (
                      <button
                        key={f}
                        onClick={() => handleSetFormation(side, f)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '8px 12px', border: 'none', cursor: 'pointer',
                          background: f === formation ? `${teamColor}18` : 'transparent',
                          color: f === formation ? teamColor : C.text,
                          fontSize: 12, fontWeight: 700,
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          fontFamily: "'JetBrains Mono',monospace",
                        }}
                      >{f}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ═══ SAHA ═══ */}
        <div style={{ padding: '4px 8px 0' }}>
          <div ref={fieldRef} style={{
            position: 'relative', width: '100%',
            paddingTop: '180%',
            borderRadius: 16, overflow: 'hidden',
            background: 'linear-gradient(180deg,#1a6b31 0%,#1e7a38 25%,#1a6b31 50%,#1e7a38 75%,#1a6b31 100%)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.55), inset 0 0 80px rgba(0,0,0,0.3)',
            touchAction: 'none',
          }}>
            <Pitch colA={colA} colB={colB} />

            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(0,0,0,0.5)',
              padding: '2px 8px', borderRadius: 4,
              fontSize: 8, color: 'rgba(255,255,255,0.35)',
              fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
              fontFamily: "'Bebas Neue',sans-serif",
              backdropFilter: 'blur(4px)',
              pointerEvents: 'none', zIndex: 2,
            }}>
              {session.team_b_name} ↑ &nbsp;·&nbsp; ↓ {session.team_a_name}
            </div>

            {/* Takım A — alt yarı */}
            {formA.positions.map((rawPos, idx) => {
              const pos = mapPos(rawPos, 'A');
              const player = slotsA[idx];
              if (player) {
                const isMe = player.device_id === deviceId;
                const canDrag = canControlTeam('A') || isMe;
                return (
                  <FieldAvatar
                    key={`a-${idx}-${player.device_id}`}
                    player={player}
                    x={pos.x} y={pos.y}
                    teamColor={colA}
                    isMe={isMe}
                    side="A"
                    fieldRef={fieldRef}
                    isSelected={selectedPlayerId === player.device_id}
                    isCaptain={!!player.is_captain}
                    isMVP={session.mvp_device_id === player.device_id}
                    goalCount={goalsByPlayer[player.device_id] || 0}
                    ovr={ovrByPlayer[player.device_id]}
                    onTap={() => {
                      if (isMe) { handleMyAvatarTap(); return; }
                      if (canControlTeam('A')) {
                        hapticLight();
                        setSelectedPlayerId(prev => prev === player.device_id ? null : player.device_id);
                      }
                    }}
                    onLongPress={amIFullPower && !isMe ? () => handleAvatarLongPress(player.device_id) : undefined}
                    onDragEnd={canDrag ? (px, py) => handleDragDrop(player, px, py) : undefined}
                  />
                );
              }
              const canTapA = isLobby && (canControlTeam('A') || myTeam === 'A');
              return (
                <EmptySlot
                  key={`ae-${idx}`}
                  x={pos.x} y={pos.y}
                  role={rawPos.role}
                  teamColor={colA}
                  canTap={canTapA}
                  onTap={() => isLobby && handleEmptySlotTap('A', idx, rawPos.role)}
                />
              );
            })}

            {/* Takım B — üst yarı */}
            {formB.positions.map((rawPos, idx) => {
              const pos = mapPos(rawPos, 'B');
              const player = slotsB[idx];
              if (player) {
                const isMe = player.device_id === deviceId;
                const canDrag = canControlTeam('B') || isMe;
                return (
                  <FieldAvatar
                    key={`b-${idx}-${player.device_id}`}
                    player={player}
                    x={pos.x} y={pos.y}
                    teamColor={colB}
                    isMe={isMe}
                    side="B"
                    fieldRef={fieldRef}
                    isSelected={selectedPlayerId === player.device_id}
                    isCaptain={!!player.is_captain}
                    isMVP={session.mvp_device_id === player.device_id}
                    goalCount={goalsByPlayer[player.device_id] || 0}
                    ovr={ovrByPlayer[player.device_id]}
                    onTap={() => {
                      if (isMe) { handleMyAvatarTap(); return; }
                      if (canControlTeam('B')) {
                        hapticLight();
                        setSelectedPlayerId(prev => prev === player.device_id ? null : player.device_id);
                      }
                    }}
                    onLongPress={amIFullPower && !isMe ? () => handleAvatarLongPress(player.device_id) : undefined}
                    onDragEnd={canDrag ? (px, py) => handleDragDrop(player, px, py) : undefined}
                  />
                );
              }
              const canTapB = isLobby && (canControlTeam('B') || myTeam === 'B');
              return (
                <EmptySlot
                  key={`be-${idx}`}
                  x={pos.x} y={pos.y}
                  role={rawPos.role}
                  teamColor={colB}
                  canTap={canTapB}
                  onTap={() => isLobby && handleEmptySlotTap('B', idx, rawPos.role)}
                />
              );
            })}
          </div>
        </div>

        {/* ═══ YEDEK KULÜBELERI ═══ */}
        {(benchA.length > 0 || benchB.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '12px 16px 0' }}>
            <BenchPanel
              name={session.team_a_name} color={colA} bench={benchA}
              selectedId={selectedPlayerId}
              onPick={(p) => {
                if (canControlTeam('A')) {
                  hapticLight();
                  setSelectedPlayerId(prev => prev === p.device_id ? null : p.device_id);
                }
              }} />
            <BenchPanel
              name={session.team_b_name} color={colB} bench={benchB}
              selectedId={selectedPlayerId}
              onPick={(p) => {
                if (canControlTeam('B')) {
                  hapticLight();
                  setSelectedPlayerId(prev => prev === p.device_id ? null : p.device_id);
                }
              }} />
          </div>
        )}

        {error && <div style={{ margin: '8px 16px', color: C.danger, fontSize: 13 }}>{error}</div>}

        {/* ═══ KENDİ TAKIM SEÇİM BARI ═══ */}
        {!myTeam && (
          <div style={{ margin: '12px 16px' }}>
            <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', marginBottom: 8 }}>
              Önce bir takım seç
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => handleAssignTeam(deviceId, 'A')} style={teamPickBtn(colA)}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: colA, display: 'inline-block' }} />
                {session.team_a_name}
              </button>
              <button onClick={() => handleAssignTeam(deviceId, 'B')} style={teamPickBtn(colB)}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: colB, display: 'inline-block' }} />
                {session.team_b_name}
              </button>
            </div>
          </div>
        )}

        {/* ═══ ATANMAMIŞ OYUNCULAR ═══ */}
        {unassigned.length > 0 && (
          <Card style={{ margin: '12px 16px' }}>
            <p style={{ margin: '0 0 8px', fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>
              Bekliyor ({unassigned.length})
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {unassigned.map(p => (
                <div key={p.device_id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 20, padding: '4px 10px',
                  fontSize: 12, fontWeight: 600,
                }}>
                  <MiniAvatar player={p} color="#475569" size={20} />
                  <span>{p.nickname || 'Misafir'}</span>
                  {amIFullPower && (
                    <>
                      <button onClick={() => handleAssignTeam(p.device_id, 'A')} style={miniTeamBtn(colA)}>A</button>
                      <button onClick={() => handleAssignTeam(p.device_id, 'B')} style={miniTeamBtn(colB)}>B</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ═══ GOL AKIŞI (active) ═══ */}
        {session.status === 'active' && goalEvents.length > 0 && (
          <Card style={{ margin: '12px 16px' }}>
            <p style={{ margin: '0 0 8px', fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>
              Goller ({goalEvents.length})
            </p>
            {[...goalEvents].reverse().slice(0, 8).map(ev => {
              const teamColor = ev.team === 'A' ? colA : colB;
              const teamName = ev.team === 'A' ? session.team_a_name : session.team_b_name;
              const scorer = ev.device_id ? players.find(pp => pp.device_id === ev.device_id) : null;
              const assister = ev.assist_device_id ? players.find(pp => pp.device_id === ev.assist_device_id) : null;
              const goalIcon = ev.type === 'own_goal' ? '🥅'
                : ev.goal_type === 'penalty' ? '🎯'
                : ev.goal_type === 'freekick' ? '🦶'
                : ev.goal_type === 'header' ? '🤯'
                : '⚽';
              return (
                <div key={ev.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 0', borderBottom: `1px solid ${C.border}`,
                  fontSize: 13,
                }}>
                  <span style={{ fontSize: 16 }}>{goalIcon}</span>
                  <span style={{ color: teamColor, fontWeight: 700, fontSize: 12 }}>{teamName}</span>
                  <span style={{ flex: 1, color: C.text, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {scorer ? scorer.nickname : (ev.type === 'own_goal' ? 'Kendi kalesi' : '—')}
                    {assister && (
                      <span style={{ color: C.muted, fontSize: 11 }}> · 🎯 {assister.nickname}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </Card>
        )}

        {/* ═══ HAZIR TOGGLE (lobby, oyuncu) ═══ */}
        {isLobby && me && (
          <div style={{ padding: '12px 16px 0' }}>
            <button onClick={handleToggleReady} style={{
              width: '100%',
              padding: '12px',
              borderRadius: 10,
              border: `1px solid ${me.is_ready ? C.accent : 'rgba(255,255,255,0.12)'}`,
              background: me.is_ready ? `${C.accent}1a` : 'rgba(255,255,255,0.04)',
              color: me.is_ready ? C.accent : C.text,
              fontSize: 14, fontWeight: 800,
              cursor: 'pointer',
              fontFamily: "'DM Sans',sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {me.is_ready ? '✓ Hazırım' : '✋ Hazır olduğumu işaretle'}
            </button>
          </div>
        )}

        {/* ═══ MAÇI BAŞLAT BUTONU (admin/co-admin, lobby) ═══ */}
        {isLobby && amIFullPower && (
          <div style={{ padding: '12px 16px 0' }}>
            <Btn onClick={handleStartMatch} disabled={loading || players.length < 2}>
              {loading ? 'Başlatılıyor...' : '🏁 Maçı Başlat'}
            </Btn>
            {players.length < 2 && (
              <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 6 }}>
                En az 2 oyuncu gerekli
              </p>
            )}
          </div>
        )}
        {isLobby && !amIFullPower && (
          <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: '12px 16px' }}>
            ⏳ Admin maçı başlatmasını bekle
          </div>
        )}

        {/* ─── ADMIN MENU (long-press) ─── */}
        {adminMenuFor && (() => {
          const target = players.find(p => p.device_id === adminMenuFor);
          if (!target) return null;
          const targetIsCaptain = !!target.is_captain;
          const targetIsCoAdmin = session.co_admin_id === target.device_id;
          return (
            <div onClick={() => setAdminMenuFor(null)} style={modalBackdrop}>
              <div onClick={e => e.stopPropagation()} style={modalSheet}>
                <div style={modalGrabber} />
                <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 16, textAlign: 'center' }}>
                  {target.nickname || 'Oyuncu'}
                </p>
                <p style={{ margin: '0 0 14px', fontSize: 11, color: C.muted, textAlign: 'center' }}>
                  {target.team ? `Takım ${target.team === 'A' ? session.team_a_name : session.team_b_name}` : 'Takımsız'}
                  {targetIsCaptain && ' · 👑 Kaptan'}
                  {targetIsCoAdmin && ' · ⚡ Yardımcı'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {target.slot_index != null && (
                    <Btn onClick={() => handleAdminClearSlot(adminMenuFor)} color={C.warn} small>
                      📍 Sahadan çıkar (yedeğe al)
                    </Btn>
                  )}
                  {target.team !== 'A' && (
                    <Btn onClick={() => handleAssignTeam(adminMenuFor, 'A')} color={colA} small>
                      → {session.team_a_name}'ya al
                    </Btn>
                  )}
                  {target.team !== 'B' && (
                    <Btn onClick={() => handleAssignTeam(adminMenuFor, 'B')} color={colB} small>
                      → {session.team_b_name}'ya al
                    </Btn>
                  )}
                  {target.team && !targetIsCaptain && (
                    <Btn onClick={() => handleSetCaptain(adminMenuFor)} color={C.warn} small>
                      👑 Kaptan yap
                    </Btn>
                  )}
                  {targetIsCaptain && (
                    <Btn onClick={() => handleRemoveCaptain(adminMenuFor)} color={C.muted} small>
                      Kaptanlığı kaldır
                    </Btn>
                  )}
                  {amIAdmin && !targetIsCoAdmin && target.device_id !== deviceId && (
                    <Btn onClick={() => handleSetCoAdmin(adminMenuFor)} color={C.purple} small>
                      ⚡ Yardımcı yap (yetki devret)
                    </Btn>
                  )}
                  {amIAdmin && targetIsCoAdmin && (
                    <Btn onClick={handleRemoveCoAdmin} color={C.muted} small>
                      Yardımcılığı kaldır
                    </Btn>
                  )}
                  <Btn onClick={() => handleRemovePlayer(adminMenuFor)} color={C.danger} small>
                    ✕ Maçtan çıkar
                  </Btn>
                  <Btn onClick={() => setAdminMenuFor(null)} color={C.muted} small variant="ghost">
                    İptal
                  </Btn>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ─── ADMIN: BOŞ SLOT İÇİN OYUNCU SEÇİCİ ─── */}
        {adminSlotPicker && (() => {
          const { team, slotIdx, role } = adminSlotPicker;
          const teamColor = team === 'A' ? colA : colB;
          const teamName = team === 'A' ? session.team_a_name : session.team_b_name;
          const candidates = players.filter(p => !p.slot_index || p.slot_index !== slotIdx || p.team !== team);

          return (
            <div onClick={() => setAdminSlotPicker(null)} style={modalBackdrop}>
              <div onClick={e => e.stopPropagation()} style={{
                ...modalSheet, maxHeight: '78vh', overflowY: 'auto',
              }}>
                <div style={modalGrabber} />
                <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 16, textAlign: 'center' }}>
                  {teamName} — {POS_SHORT[role] || role}
                </p>
                <p style={{ margin: '0 0 14px', fontSize: 11, color: C.muted, textAlign: 'center' }}>
                  Bu pozisyona kim gelsin?
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {candidates.length === 0 && (
                    <div style={{ textAlign: 'center', color: C.muted, padding: 20, fontSize: 13 }}>
                      Müsait oyuncu yok
                    </div>
                  )}
                  {candidates.map(p => {
                    const inThisTeam = p.team === team;
                    const inOtherTeam = p.team && p.team !== team;
                    const onSlot = p.slot_index != null;
                    return (
                      <button
                        key={p.device_id}
                        onClick={() => handleAdminPlaceInSlot(p.device_id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 10px', borderRadius: 10,
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          color: C.text, cursor: 'pointer',
                          fontFamily: 'inherit', textAlign: 'left',
                        }}
                      >
                        <MiniAvatar player={p}
                          color={inThisTeam ? teamColor
                                : inOtherTeam ? (p.team === 'A' ? colA : colB)
                                : '#475569'}
                          size={32} isCaptain={p.is_captain} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nickname || 'Misafir'}</div>
                          <div style={{ fontSize: 11, color: C.muted }}>
                            {!p.team ? 'Atanmadı'
                              : `Takım ${p.team}${onSlot ? ' · sahada' : ' · yedek'}`}
                          </div>
                        </div>
                        {inOtherTeam && (
                          <span style={{
                            fontSize: 10, color: C.warn,
                            background: '#fbbf2418', padding: '2px 6px', borderRadius: 4,
                            fontWeight: 700,
                          }}>↔ Takım değişir</span>
                        )}
                        {p.device_id === deviceId && (
                          <span style={{ fontSize: 10, color: C.accent, fontWeight: 700 }}>sen</span>
                        )}
                      </button>
                    );
                  })}
                  <Btn onClick={() => setAdminSlotPicker(null)} color={C.muted} small variant="ghost"
                       style={{ marginTop: 8 }}>
                    İptal
                  </Btn>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ─── KENDİ PROFİL MODAL ─── */}
        {showMyProfile && me && (
          <ProfileModal
            player={me}
            myTeamColor={myTeam === 'A' ? colA : myTeam === 'B' ? colB : C.muted}
            isOnSlot={me.slot_index != null}
            onLeaveSlot={handleLeaveSlot}
            onSave={handleSaveProfile}
            onClose={() => setShowMyProfile(false)}
          />
        )}

        {/* ─── ADMIN AYARLARI ─── */}
        {showAdminSettings && amIFullPower && (
          <AdminSettingsSheet
            session={session}
            players={players}
            onUpdate={handleUpdateMeta}
            onSetCaptain={handleSetCaptain}
            onRemoveCaptain={handleRemoveCaptain}
            onSetCoAdmin={handleSetCoAdmin}
            onRemoveCoAdmin={handleRemoveCoAdmin}
            isAdminUser={amIAdmin}
            onClose={() => setShowAdminSettings(false)}
          />
        )}

        {/* ─── GOL EKLEME SHEET ─── */}
        {showGoalSheet && (
          <GoalSheet
            team={showGoalSheet.team}
            teamColor={showGoalSheet.team === 'A' ? colA : colB}
            teamName={showGoalSheet.team === 'A' ? session.team_a_name : session.team_b_name}
            opponentName={showGoalSheet.team === 'A' ? session.team_b_name : session.team_a_name}
            myTeamPlayers={players.filter(p => p.team === showGoalSheet.team)}
            opponentPlayers={players.filter(p => p.team === (showGoalSheet.team === 'A' ? 'B' : 'A'))}
            onConfirm={handleConfirmGoal}
            onClose={() => setShowGoalSheet(null)}
          />
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RATE VIEW (maç sonu puanlama)
  // ═══════════════════════════════════════════════════════════
  function renderRateView() {
    const otherPlayers = players.filter(p => p.device_id !== deviceId);
    const canIRate = !ratingsSubmitted && session.status === 'finished';
    const mvp = session.mvp_device_id ? players.find(p => p.device_id === session.mvp_device_id) : null;

    return wrap(
      <div style={{ padding: '60px 16px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40 }}>🏁</div>
          <h3 style={{ margin: '8px 0 4px', fontSize: 20, fontWeight: 800 }}>Maç Bitti!</h3>
          <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "'JetBrains Mono',monospace" }}>
            <span style={{ color: colA }}>{session.score_a}</span>
            <span style={{ color: C.muted }}> - </span>
            <span style={{ color: colB }}>{session.score_b}</span>
          </div>
          <div style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>
            {session.team_a_name} vs {session.team_b_name}
          </div>
        </div>

        {/* MVP kartı */}
        <Card style={{
          marginBottom: 16,
          background: mvp
            ? 'linear-gradient(135deg, rgba(251,191,36,0.18), rgba(251,191,36,0.04))'
            : 'rgba(255,255,255,0.04)',
          border: mvp ? '1px solid rgba(251,191,36,0.4)' : `1px solid ${C.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 28 }}>⭐</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: C.warn, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                MVP
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: mvp ? C.text : C.muted }}>
                {mvp ? mvp.nickname : 'Henüz seçilmedi'}
              </div>
            </div>
            {amIFullPower && (
              <button onClick={() => setShowMVPSheet(true)} style={inviteBtnStyle(C.warn)}>
                {mvp ? 'Değiştir' : 'Seç'}
              </button>
            )}
          </div>
        </Card>

        {canIRate && otherPlayers.length > 0 && (
          <Card style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 16px', fontWeight: 800, fontSize: 15 }}>
              ⭐ Takım arkadaşlarını puanla (1-10)
            </p>
            {otherPlayers.map(p => (
              <div key={p.device_id} style={{
                marginBottom: 14, paddingBottom: 14,
                borderBottom: `1px solid ${C.border}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <MiniAvatar player={p} color={p.team === 'A' ? colA : colB} size={30} isCaptain={p.is_captain} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nickname}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>
                      {p.team === 'A' ? session.team_a_name : session.team_b_name}
                    </div>
                  </div>
                  {myRatings[p.device_id] > 0 && (
                    <Pill style={{ marginLeft: 'auto' }}>{myRatings[p.device_id]}/10</Pill>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <button
                      key={n}
                      onClick={() => {
                        hapticLight();
                        setMyRatings(prev => ({ ...prev, [p.device_id]: n }));
                      }}
                      style={{
                        width: 32, height: 32, borderRadius: 8,
                        border: `1px solid ${myRatings[p.device_id] === n ? C.accent : 'rgba(255,255,255,0.1)'}`,
                        background: myRatings[p.device_id] === n ? `${C.accent}33` : 'transparent',
                        color: myRatings[p.device_id] === n ? C.accent : C.muted,
                        fontWeight: 800, fontSize: 13, cursor: 'pointer',
                      }}
                    >{n}</button>
                  ))}
                </div>
              </div>
            ))}
            {error && <p style={{ color: C.danger, fontSize: 13 }}>{error}</p>}
            <Btn onClick={handleSubmitRatings} disabled={loading || Object.keys(myRatings).length === 0}>
              {loading ? 'Gönderiliyor...' : '✅ Puanları Gönder'}
            </Btn>
          </Card>
        )}

        {ratingsSubmitted && (
          <Card style={{ marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 32 }}>✅</div>
            <p style={{ fontWeight: 700, marginTop: 8 }}>Puanların kaydedildi!</p>
          </Card>
        )}

        {(amIFullPower || session.ratings_public) && ratings.length > 0 && (
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>📊 Sonuç Sıralaması</p>
              {amIFullPower && (
                <button
                  onClick={() => setRatingsPublic(session.id, !session.ratings_public)}
                  style={{
                    background: 'none', border: `1px solid ${C.muted}`,
                    color: C.muted, borderRadius: 6, padding: '4px 10px',
                    cursor: 'pointer', fontSize: 12,
                  }}
                >{session.ratings_public ? '🔒 Gizle' : '🔓 Aç'}</button>
              )}
            </div>
            {players
              .map(p => ({ player: p, rating: avgRatings[p.device_id] }))
              .filter(x => x.rating)
              .sort((a, b) => parseFloat(b.rating.avg) - parseFloat(a.rating.avg))
              .map(({ player, rating }, i) => (
                <div key={player.device_id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 0', borderBottom: `1px solid ${C.border}`,
                }}>
                  <span style={{ color: C.muted, fontWeight: 700, fontSize: 13, width: 22 }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                  </span>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{player.nickname}</span>
                  <span style={{ color: C.accent, fontWeight: 800, fontSize: 16, fontFamily: "'JetBrains Mono',monospace" }}>
                    {rating.avg}
                  </span>
                  <span style={{ color: C.muted, fontSize: 11 }}>({rating.count} oy)</span>
                </div>
              ))
            }
          </Card>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Btn onClick={handleShareResult} variant="ghost">📤 Sonucu Paylaş</Btn>
          <Btn onClick={() => { setSession(null); setScreen('home'); loadMySessions(); }} variant="ghost">
            ← Ana Ekran
          </Btn>
        </div>

        {/* ─── MVP SHEET ─── */}
        {showMVPSheet && amIFullPower && (
          <div onClick={() => setShowMVPSheet(false)} style={modalBackdrop}>
            <div onClick={e => e.stopPropagation()} style={{ ...modalSheet, maxHeight: '78vh', overflowY: 'auto' }}>
              <div style={modalGrabber} />
              <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 16, textAlign: 'center' }}>
                ⭐ MVP Seç
              </p>
              <p style={{ margin: '0 0 14px', fontSize: 11, color: C.muted, textAlign: 'center' }}>
                Maçın yıldızı kim?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {players.map(p => (
                  <button
                    key={p.device_id}
                    onClick={() => handleSetMVP(p.device_id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10,
                      background: session.mvp_device_id === p.device_id ? `${C.warn}18` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${session.mvp_device_id === p.device_id ? `${C.warn}55` : 'rgba(255,255,255,0.06)'}`,
                      color: C.text, cursor: 'pointer',
                      fontFamily: 'inherit', textAlign: 'left',
                    }}
                  >
                    <MiniAvatar player={p} color={p.team === 'A' ? colA : colB} size={32} isCaptain={p.is_captain} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nickname}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>
                        {p.team === 'A' ? session.team_a_name : session.team_b_name}
                        {goalsByPlayer[p.device_id] > 0 && ` · ⚽${goalsByPlayer[p.device_id]}`}
                      </div>
                    </div>
                    {session.mvp_device_id === p.device_id && <span style={{ fontSize: 18 }}>⭐</span>}
                  </button>
                ))}
                <Btn onClick={() => setShowMVPSheet(false)} color={C.muted} small variant="ghost" style={{ marginTop: 8 }}>
                  İptal
                </Btn>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}
// ═══════════════════════════════════════════════════════════
// ALT COMPONENT'LER & STİL YARDIMCILARI
// ═══════════════════════════════════════════════════════════

// ─── persist: maç bittiğinde matchHistoryStore'a yaz ────────
function persistMatchToHistory(session, players, events) {
  const buildTeam = (team) => {
    const list = players.filter(p => p.team === team).map(p => ({
      id: p.device_id,
      name: p.nickname || 'Misafir',
      surname: '',
      jerseyNumber: p.jersey_number || null,
      position: p.position || null,
      photo: null,
      attributes: p.attributes || null,
      rating: p.attributes && p.position
        ? (computeOverallFromAttributes(p.attributes, p.position) || 70)
        : 70,
    }));
    return {
      name: team === 'A' ? session.team_a_name : session.team_b_name,
      color: {
        primary: team === 'A' ? (session.team_a_color || '#059669') : (session.team_b_color || '#dc2626'),
        secondary: team === 'A' ? (session.team_a_color || '#34d399') : (session.team_b_color || '#f87171'),
      },
      formation: team === 'A' ? (session.formation_a || '3-2-1') : (session.formation_b || '3-2-1'),
      players: list,
    };
  };

  const teamA = buildTeam('A');
  const teamB = buildTeam('B');

  const histEvents = (events || []).map(ev => ({
    id: `e_${ev.id}`,
    type: ev.type,
    side: ev.team,
    playerId: ev.device_id || null,
    assistPlayerId: ev.assist_device_id || null,
    minute: ev.minute || null,
    goalType: ev.goal_type || 'normal',
    createdAt: new Date(ev.created_at).getTime(),
  }));

  const m = buildMatch({
    teamA, teamB,
    scoreA: session.score_a || 0,
    scoreB: session.score_b || 0,
    events: histEvents,
    isMatch: true,
    mvpId: session.mvp_device_id || null,
  });
  saveMatch(m);
}

// ─── ScoreBoard ──────────────────────────────────────────────
function ScoreBoard({ session, colA, colB, canScoreA, canScoreB, onAddGoal, onUndoGoal }) {
  return (
    <div style={{
      margin: '0 16px 12px',
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '12px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ flex: 1, textAlign: 'right' }}>
          <div style={{
            fontSize: 10, color: colB, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 0.5,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{session.team_b_name}</div>
          <div style={{
            fontSize: 38, fontWeight: 900, color: colB, lineHeight: 1,
            fontFamily: "'JetBrains Mono',monospace",
            animation: 'lmGoal 0.4s',
          }} key={`bs-${session.score_b}`}>
            {session.score_b}
          </div>
        </div>
        <div style={{ fontSize: 22, color: C.muted, fontWeight: 300 }}>:</div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{
            fontSize: 10, color: colA, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 0.5,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{session.team_a_name}</div>
          <div style={{
            fontSize: 38, fontWeight: 900, color: colA, lineHeight: 1,
            fontFamily: "'JetBrains Mono',monospace",
            animation: 'lmGoal 0.4s',
          }} key={`as-${session.score_a}`}>
            {session.score_a}
          </div>
        </div>
      </div>
      {(canScoreA || canScoreB) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {canScoreB ? (
              <>
                <button onClick={() => onAddGoal('B')} style={goalBtn(colB)}>+ Gol</button>
                <button onClick={() => onUndoGoal('B')} style={undoBtn}>↩</button>
              </>
            ) : <div style={{ flex: 1 }} />}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {canScoreA ? (
              <>
                <button onClick={() => onAddGoal('A')} style={goalBtn(colA)}>+ Gol</button>
                <button onClick={() => onUndoGoal('A')} style={undoBtn}>↩</button>
              </>
            ) : <div style={{ flex: 1 }} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BenchPanel — yedek kulübesi ────────────────────────────
function BenchPanel({ name, color, bench, onPick, selectedId }) {
  return (
    <div style={{
      background: `${color}06`,
      border: `1px solid ${color}22`,
      borderRadius: 12, padding: '10px 12px',
      minHeight: 80,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10, color, fontWeight: 800,
        textTransform: 'uppercase', letterSpacing: 1,
        marginBottom: 8,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
        Yedek · {name}
      </div>
      {bench.length === 0 ? (
        <div style={{ fontSize: 11, color: C.dim, padding: '6px 0' }}>Yedek yok</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {bench.map(p => (
            <div key={p.device_id}
                 onClick={() => onPick?.(p)}
                 style={{
                   display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                   cursor: 'pointer',
                   opacity: selectedId === p.device_id ? 1 : 0.85,
                   transform: selectedId === p.device_id ? 'scale(1.05)' : 'scale(1)',
                   transition: 'all 0.15s',
                 }}>
              <MiniAvatar player={p} color={color} size={34} isCaptain={p.is_captain} />
              <div style={{
                fontSize: 9, color: C.text, fontWeight: 700,
                maxWidth: 50, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', textAlign: 'center',
              }}>{p.nickname}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ColorChip — küçük renk seçici ──────────────────────────
function ColorChip({ color, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: 44, height: 44, borderRadius: 10,
        background: color,
        border: '2px solid rgba(255,255,255,0.18)',
        cursor: 'pointer', flexShrink: 0,
        boxShadow: `0 4px 12px ${color}55`,
      }} />
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{
            position: 'fixed', inset: 0, zIndex: 200,
          }} />
          <div style={{
            position: 'absolute', top: '108%', right: 0, zIndex: 201,
            background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: 8,
            display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6,
            boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
            width: 200,
          }}>
            {TEAM_COLORS.map(c => (
              <button key={c}
                      onClick={() => { onChange(c); setOpen(false); hapticLight(); }}
                      style={{
                        width: 26, height: 26, borderRadius: 7,
                        background: c, cursor: 'pointer',
                        border: c === color ? '2px solid #fff' : '2px solid transparent',
                        boxShadow: c === color ? `0 0 0 2px ${c}` : 'none',
                      }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PROFIL MODAL — kullanıcı kendi profilini düzenler
// ═══════════════════════════════════════════════════════════
function ProfileModal({ player, myTeamColor, isOnSlot, onLeaveSlot, onSave, onClose }) {
  const [nickname, setNickname] = useState(player.nickname || '');
  const [jerseyNumber, setJerseyNumber] = useState(player.jersey_number || '');
  const [position, setPosition] = useState(player.position || 'ORTA SAHA');
  const [attributes, setAttributes] = useState(() => {
    if (player.attributes && typeof player.attributes === 'object') return player.attributes;
    return generateDefaultAttributes(player.position || 'ORTA SAHA', 70, player.device_id || '');
  });

  const attrKeys = getAttrKeys(position);

  useEffect(() => {
    const need = getAttrKeys(position);
    const has = need.every(k => typeof attributes[k] === 'number');
    if (!has) {
      setAttributes(generateDefaultAttributes(position, 70, player.device_id || ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  const overall = computeOverallFromAttributes(attributes, position) || 70;

  const handleAttrChange = (key, val) => setAttributes(prev => ({ ...prev, [key]: val }));
  const handleResetAttrs = () =>
    setAttributes(generateDefaultAttributes(position, 70, player.device_id || ''));

  const handleSave = () => {
    if (!nickname.trim()) return;
    const jn = parseInt(jerseyNumber, 10);
    onSave({
      nickname: nickname.trim(),
      jerseyNumber: !isNaN(jn) && jn > 0 && jn < 100 ? jn : null,
      position,
      attributes,
    });
  };

  return (
    <div onClick={onClose} style={{
      ...modalBackdrop,
      backdropFilter: 'blur(8px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        ...modalSheet, maxHeight: '92vh', overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        <div style={modalGrabber} />

        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
            Profilini düzenle
          </p>
          <div style={{
            marginTop: 6,
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: `${myTeamColor}18`,
            border: `1px solid ${myTeamColor}44`,
            borderRadius: 8, padding: '4px 10px',
          }}>
            <span style={{ fontSize: 10, color: myTeamColor, fontWeight: 800 }}>OVR</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: myTeamColor, fontFamily: "'JetBrains Mono',monospace" }}>
              {overall}
            </span>
          </div>
        </div>

        {/* Nick + Forma No */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={profileLabel}>Takma ad</label>
            <input value={nickname} onChange={e => setNickname(e.target.value)} maxLength={20}
                   style={profileInput} />
          </div>
          <div>
            <label style={profileLabel}>Forma #</label>
            <input type="number" value={jerseyNumber} onChange={e => setJerseyNumber(e.target.value)}
                   min="1" max="99" placeholder="—"
                   style={{ ...profileInput, textAlign: 'center', fontFamily: "'JetBrains Mono',monospace" }} />
          </div>
        </div>

        {/* Pozisyon */}
        <div style={{ marginBottom: 14 }}>
          <label style={profileLabel}>Pozisyon</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {POSITIONS.map(p => (
              <button key={p} onClick={() => setPosition(p)}
                style={{
                  background: position === p ? `${myTeamColor}22` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${position === p ? myTeamColor + '88' : 'rgba(255,255,255,0.08)'}`,
                  color: position === p ? myTeamColor : C.text,
                  borderRadius: 6, padding: '6px 10px',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'DM Sans',sans-serif",
                  textTransform: 'uppercase', letterSpacing: 0.3,
                }}
              >{p}</button>
            ))}
          </div>
        </div>

        {/* Spider */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <SpiderChart attributes={attributes} keys={attrKeys}
                       accent={myTeamColor} size={240} editable={true}
                       onChange={handleAttrChange} onReset={handleResetAttrs}
                       showValues={true} />
        </div>

        <p style={{ fontSize: 10, color: C.muted, textAlign: 'center', marginBottom: 14 }}>
          Köşeleri sürükle veya +/− ile ayarla
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={handleSave} disabled={!nickname.trim()}
            style={{
              background: !nickname.trim() ? 'rgba(255,255,255,0.05)' : `${myTeamColor}22`,
              border: `1px solid ${!nickname.trim() ? 'rgba(255,255,255,0.1)' : myTeamColor + '88'}`,
              color: !nickname.trim() ? 'rgba(255,255,255,0.25)' : myTeamColor,
              borderRadius: 10, padding: '12px',
              fontSize: 14, fontWeight: 800,
              cursor: !nickname.trim() ? 'not-allowed' : 'pointer',
              fontFamily: "'DM Sans',sans-serif",
            }}
          >✓ Kaydet</button>
          {isOnSlot && (
            <button onClick={onLeaveSlot} style={{
              background: '#fbbf2418', border: '1px solid #fbbf2455', color: C.warn,
              borderRadius: 10, padding: '10px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: "'DM Sans',sans-serif",
            }}>📍 Sahadan Çık (yeniden seç)</button>
          )}
          <button onClick={onClose} style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            color: C.muted, borderRadius: 10, padding: '10px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'DM Sans',sans-serif",
          }}>İptal</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ADMIN AYARLARI SHEET
// ═══════════════════════════════════════════════════════════
function AdminSettingsSheet({
  session, players,
  onUpdate, onSetCaptain, onRemoveCaptain,
  onSetCoAdmin, onRemoveCoAdmin,
  isAdminUser, onClose,
}) {
  const [aName, setAName] = useState(session.team_a_name || '');
  const [bName, setBName] = useState(session.team_b_name || '');
  const [aColor, setAColor] = useState(session.team_a_color || C.defaultA);
  const [bColor, setBColor] = useState(session.team_b_color || C.defaultB);
  const [fieldName, setFieldName] = useState(session.field_name || '');

  const captainA = players.find(p => p.team === 'A' && p.is_captain);
  const captainB = players.find(p => p.team === 'B' && p.is_captain);
  const coAdminPlayer = session.co_admin_id
    ? players.find(p => p.device_id === session.co_admin_id)
    : null;

  const teamAPlayers = players.filter(p => p.team === 'A');
  const teamBPlayers = players.filter(p => p.team === 'B');
  const otherPlayers = players.filter(p => p.device_id !== session.admin_id);

  const persist = () => {
    onUpdate({
      team_a_name: aName.trim() || 'Takım A',
      team_b_name: bName.trim() || 'Takım B',
      team_a_color: aColor,
      team_b_color: bColor,
      field_name: fieldName.trim(),
    });
    onClose();
  };

  return (
    <div onClick={onClose} style={modalBackdrop}>
      <div onClick={e => e.stopPropagation()} style={{
        ...modalSheet, maxHeight: '92vh', overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        <div style={modalGrabber} />
        <p style={{ margin: '0 0 16px', fontWeight: 800, fontSize: 16, textAlign: 'center' }}>
          ⚙️ Maç Ayarları
        </p>

        {/* Saha */}
        <div style={{ marginBottom: 14 }}>
          <label style={profileLabel}>Saha adı</label>
          <input value={fieldName} onChange={e => setFieldName(e.target.value)}
                 maxLength={40} style={profileInput} />
        </div>

        {/* Takım A */}
        <div style={settingsBlock(aColor)}>
          <div style={settingsBlockTitle(aColor)}>Takım A</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input value={aName} onChange={e => setAName(e.target.value)} maxLength={20}
                   style={{ ...profileInput, flex: 1 }} />
            <ColorChip color={aColor} onChange={setAColor} />
          </div>
          {/* Kaptan listesi */}
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            Kaptan
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {teamAPlayers.length === 0 && (
              <div style={{ fontSize: 11, color: C.dim }}>Önce takıma oyuncu ekle</div>
            )}
            {teamAPlayers.map(p => {
              const isC = !!p.is_captain;
              return (
                <button key={p.device_id}
                  onClick={() => isC ? onRemoveCaptain(p.device_id) : onSetCaptain(p.device_id)}
                  style={{
                    background: isC ? `${C.warn}22` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isC ? C.warn + '77' : 'rgba(255,255,255,0.08)'}`,
                    color: isC ? C.warn : C.text,
                    borderRadius: 7, padding: '4px 9px',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontFamily: "'DM Sans',sans-serif",
                  }}>
                  {isC && '👑'} {p.nickname}
                </button>
              );
            })}
          </div>
        </div>

        {/* Takım B */}
        <div style={settingsBlock(bColor)}>
          <div style={settingsBlockTitle(bColor)}>Takım B</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input value={bName} onChange={e => setBName(e.target.value)} maxLength={20}
                   style={{ ...profileInput, flex: 1 }} />
            <ColorChip color={bColor} onChange={setBColor} />
          </div>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            Kaptan
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {teamBPlayers.length === 0 && (
              <div style={{ fontSize: 11, color: C.dim }}>Önce takıma oyuncu ekle</div>
            )}
            {teamBPlayers.map(p => {
              const isC = !!p.is_captain;
              return (
                <button key={p.device_id}
                  onClick={() => isC ? onRemoveCaptain(p.device_id) : onSetCaptain(p.device_id)}
                  style={{
                    background: isC ? `${C.warn}22` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isC ? C.warn + '77' : 'rgba(255,255,255,0.08)'}`,
                    color: isC ? C.warn : C.text,
                    borderRadius: 7, padding: '4px 9px',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontFamily: "'DM Sans',sans-serif",
                  }}>
                  {isC && '👑'} {p.nickname}
                </button>
              );
            })}
          </div>
        </div>

        {/* Co-admin (sadece admin) */}
        {isAdminUser && (
          <div style={settingsBlock(C.purple)}>
            <div style={settingsBlockTitle(C.purple)}>⚡ Yardımcı (Co-Admin)</div>
            <p style={{ margin: '0 0 8px', fontSize: 11, color: C.muted, lineHeight: 1.4 }}>
              Yardımcıya tüm admin yetkilerin verilir. Sen yokken maçı o yönetebilir.
            </p>
            {coAdminPlayer ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>
                  ⚡ {coAdminPlayer.nickname}
                </div>
                <button onClick={onRemoveCoAdmin} style={{
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  color: C.danger, borderRadius: 6, padding: '4px 10px',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}>Kaldır</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {otherPlayers.length === 0 && (
                  <div style={{ fontSize: 11, color: C.dim }}>Henüz başka oyuncu yok</div>
                )}
                {otherPlayers.map(p => (
                  <button key={p.device_id} onClick={() => onSetCoAdmin(p.device_id)}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: C.text, borderRadius: 7, padding: '4px 9px',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}>
                    {p.nickname}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <Btn onClick={persist} color={C.accent}>✓ Kaydet</Btn>
          <Btn onClick={onClose} color={C.muted} variant="ghost">İptal</Btn>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// GOAL SHEET — gol kayıt akışı (scorer → assist → goalType)
// ═══════════════════════════════════════════════════════════
const GOAL_TYPES = [
  { id: 'normal',   icon: '⚽', label: 'Normal' },
  { id: 'penalty',  icon: '🎯', label: 'Penaltı' },
  { id: 'freekick', icon: '🦶', label: 'Frikik' },
  { id: 'header',   icon: '🤯', label: 'Kafa' },
];

function GoalSheet({ team, teamColor, teamName, opponentName, myTeamPlayers, opponentPlayers, onConfirm, onClose }) {
  const [step, setStep] = useState('scorer'); // scorer | assist
  const [scorer, setScorer] = useState(null);
  const [assist, setAssist] = useState(null);
  const [goalType, setGoalType] = useState('normal');
  const [isOwnGoal, setIsOwnGoal] = useState(false);

  // Kendi kalesi seçildiyse asisti zorla null'la
  useEffect(() => { if (isOwnGoal) setAssist(null); }, [isOwnGoal]);

  const handleConfirm = () => {
    onConfirm({
      scorer: scorer || null,
      assist: isOwnGoal ? null : (assist || null),
      goalType: isOwnGoal ? 'own_goal' : goalType,
      isOwn: isOwnGoal,
    });
  };

  return (
    <div onClick={onClose} style={modalBackdrop}>
      <div onClick={e => e.stopPropagation()} style={{
        ...modalSheet, maxHeight: '88vh', overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        <div style={modalGrabber} />

        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '4px 12px', borderRadius: 999,
            background: `${teamColor}18`, border: `1px solid ${teamColor}44`,
            color: teamColor, fontWeight: 800, fontSize: 12,
            textTransform: 'uppercase', letterSpacing: 0.7,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: teamColor }} />
            {teamName} · GOL
          </div>
        </div>

        {/* Kendi kalesi toggle */}
        <button onClick={() => { setIsOwnGoal(o => !o); setScorer(null); }} style={{
          width: '100%', marginBottom: 12,
          padding: '10px 12px', borderRadius: 10,
          background: isOwnGoal ? '#ef444418' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${isOwnGoal ? '#ef444455' : 'rgba(255,255,255,0.08)'}`,
          color: isOwnGoal ? C.danger : C.muted,
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
          fontFamily: "'DM Sans',sans-serif",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          {isOwnGoal ? '✓' : '○'} Kendi kalesi (rakip oyuncusu attı)
        </button>

        {/* Step: SCORER */}
        {step === 'scorer' && (
          <>
            <p style={{ margin: '0 0 10px', fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7 }}>
              {isOwnGoal ? `Kim attı? (${opponentName})` : `Kim attı? (${teamName})`}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
              {(isOwnGoal ? opponentPlayers : myTeamPlayers).map(p => (
                <button key={p.device_id} onClick={() => { setScorer(p.device_id); hapticLight(); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 10,
                    background: scorer === p.device_id ? `${teamColor}22` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${scorer === p.device_id ? teamColor + '88' : 'rgba(255,255,255,0.06)'}`,
                    color: C.text, cursor: 'pointer',
                    fontFamily: 'inherit', textAlign: 'left',
                  }}>
                  <MiniAvatar player={p}
                    color={isOwnGoal ? (p.team === 'A' ? C.defaultA : C.defaultB) : teamColor}
                    size={30} isCaptain={p.is_captain} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{p.nickname}</div>
                    {p.position && (
                      <div style={{ fontSize: 10, color: C.muted }}>{POS_SHORT[p.position] || p.position}</div>
                    )}
                  </div>
                  {scorer === p.device_id && <span style={{ fontSize: 16 }}>✓</span>}
                </button>
              ))}
              <button onClick={() => { setScorer(null); }} style={{
                padding: '8px', borderRadius: 8,
                background: scorer === null ? 'rgba(255,255,255,0.06)' : 'transparent',
                border: '1px dashed rgba(255,255,255,0.1)',
                color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>Belirsiz / atlamak istiyorum</button>
            </div>

            {/* Goal type chips (sadece kendi kalesi değilse) */}
            {!isOwnGoal && (
              <>
                <p style={{ margin: '0 0 8px', fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7 }}>
                  Gol tipi
                </p>
                <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                  {GOAL_TYPES.map(g => (
                    <button key={g.id} onClick={() => { setGoalType(g.id); hapticLight(); }}
                      style={{
                        background: goalType === g.id ? `${teamColor}22` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${goalType === g.id ? teamColor + '88' : 'rgba(255,255,255,0.08)'}`,
                        color: goalType === g.id ? teamColor : C.text,
                        borderRadius: 8, padding: '6px 10px',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontFamily: "'DM Sans',sans-serif",
                      }}>
                      <span>{g.icon}</span> {g.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={onClose} color={C.muted} variant="ghost" small>İptal</Btn>
              {!isOwnGoal && (
                <Btn onClick={() => setStep('assist')} color={teamColor} small>Asist →</Btn>
              )}
              <Btn onClick={handleConfirm} color={teamColor} variant="solid" small>
                ⚽ Kaydet
              </Btn>
            </div>
          </>
        )}

        {/* Step: ASSIST */}
        {step === 'assist' && !isOwnGoal && (
          <>
            <p style={{ margin: '0 0 10px', fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7 }}>
              Asisti kim yaptı? ({teamName})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
              {myTeamPlayers
                .filter(p => p.device_id !== scorer)
                .map(p => (
                  <button key={p.device_id} onClick={() => { setAssist(p.device_id); hapticLight(); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 10,
                      background: assist === p.device_id ? `${teamColor}22` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${assist === p.device_id ? teamColor + '88' : 'rgba(255,255,255,0.06)'}`,
                      color: C.text, cursor: 'pointer',
                      fontFamily: 'inherit', textAlign: 'left',
                    }}>
                    <MiniAvatar player={p} color={teamColor} size={30} isCaptain={p.is_captain} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{p.nickname}</div>
                    </div>
                    {assist === p.device_id && <span style={{ fontSize: 16 }}>🎯</span>}
                  </button>
                ))}
              <button onClick={() => setAssist(null)} style={{
                padding: '8px', borderRadius: 8,
                background: assist === null ? 'rgba(255,255,255,0.06)' : 'transparent',
                border: '1px dashed rgba(255,255,255,0.1)',
                color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>Asist yok</button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={() => setStep('scorer')} color={C.muted} variant="ghost" small>← Geri</Btn>
              <Btn onClick={handleConfirm} color={teamColor} variant="solid" small>
                ⚽ Kaydet
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STİL YARDIMCILARI
// ═══════════════════════════════════════════════════════════
const bigActionBtn = (color) => ({
  background: `${color}12`,
  border: `1px solid ${color}33`,
  borderRadius: 16, padding: '20px 12px',
  cursor: 'pointer', color: C.text,
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', gap: 6,
  transition: 'all 0.15s',
  fontFamily: "'DM Sans',sans-serif",
});

const goalBtn = (color) => ({
  flex: 1,
  background: `${color}22`,
  border: `1px solid ${color}55`,
  color: color,
  borderRadius: 8, padding: '8px',
  fontSize: 12, fontWeight: 800,
  cursor: 'pointer',
  fontFamily: "'DM Sans',sans-serif",
});

const undoBtn = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: C.muted,
  borderRadius: 8, padding: '8px 10px',
  fontSize: 14, cursor: 'pointer',
};

const teamPickBtn = (color) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  background: `${color}15`,
  border: `1.5px solid ${color}55`,
  color: color,
  borderRadius: 12, padding: '14px 12px',
  fontSize: 14, fontWeight: 800,
  cursor: 'pointer',
  fontFamily: "'DM Sans',sans-serif",
});

const miniBtn = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: C.text,
  cursor: 'pointer', fontSize: 13, fontWeight: 600,
  padding: '6px 12px', borderRadius: 8,
  fontFamily: "'DM Sans',sans-serif",
};

const miniTeamBtn = (color) => ({
  background: `${color}22`, border: `1px solid ${color}55`,
  color, borderRadius: 5, padding: '2px 6px',
  fontSize: 10, fontWeight: 800, cursor: 'pointer',
  marginLeft: 2,
});

const inviteBtnStyle = (color) => ({
  background: `${color}1a`,
  border: `1px solid ${color}55`,
  color, borderRadius: 8, padding: '6px 12px',
  cursor: 'pointer', fontSize: 11, fontWeight: 700,
  whiteSpace: 'nowrap',
  fontFamily: "'DM Sans',sans-serif",
});

const lbl = {
  display: 'block',
  fontSize: 10, color: 'rgba(255,255,255,0.5)',
  fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8,
  marginBottom: 6,
  fontFamily: "'DM Sans',sans-serif",
};

const profileLabel = {
  display: 'block',
  fontSize: 10, color: 'rgba(255,255,255,0.5)',
  fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8,
  marginBottom: 5,
  fontFamily: "'DM Sans',sans-serif",
};

const profileInput = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, padding: '10px 12px',
  color: '#e2e8f0', fontSize: 14,
  boxSizing: 'border-box',
  fontFamily: "'DM Sans',sans-serif",
  outline: 'none',
};

const modalBackdrop = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.72)',
  backdropFilter: 'blur(6px)',
  zIndex: 200,
  display: 'flex', alignItems: 'flex-end',
};

const modalSheet = {
  background: C.surface, width: '100%',
  borderTopLeftRadius: 20, borderTopRightRadius: 20,
  padding: '14px 16px calc(20px + env(safe-area-inset-bottom, 0px))',
  borderTop: `1px solid ${C.border}`,
};

const modalGrabber = {
  width: 40, height: 4, background: 'rgba(255,255,255,0.2)',
  borderRadius: 2, margin: '0 auto 14px',
};

const settingsBlock = (color) => ({
  background: `${color}06`,
  border: `1px solid ${color}22`,
  borderRadius: 12,
  padding: 12,
  marginBottom: 12,
});

const settingsBlockTitle = (color) => ({
  fontSize: 11, fontWeight: 800, color,
  textTransform: 'uppercase', letterSpacing: 1,
  marginBottom: 8,
});