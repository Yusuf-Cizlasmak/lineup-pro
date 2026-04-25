import { useState, useCallback, useRef, useEffect } from "react";
import logo from "./ssssss.png";
import { startAds, showInterstitial, showRewarded, showBanner, hideBanner } from "./admob";
import { t, useLang, setLang } from "./i18n";
import { LangToggle } from "./Onboarding";

// ─── SCREENSHOT & SHARE UTILITY ───
const captureAndShare = async (element, filename = "halisaha-kolik.png") => {
  if (!element) return;
  try {
    // html2canvas'ı dinamik yükle (CDN)
    if (!window.html2canvas) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    const canvas = await window.html2canvas(element, {
      backgroundColor: "#0a1628",
      scale: 2,
      useCORS: true,
      logging: false,
    });
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    const file = new File([blob], filename, { type: "image/png" });

    // Native share (iOS/Android + modern browsers)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "HalıSaha-Kolik",
        text: "⚽ HalıSaha-Kolik",
      });
      return true;
    }
    // Fallback: sadece metin paylaş
    if (navigator.share) {
      const dataUrl = canvas.toDataURL("image/png");
      // Yeni sekmede aç
      const w = window.open();
      if (w) { w.document.write(`<img src="${dataUrl}" style="max-width:100%">`); }
      return true;
    }
    // Son fallback: indir
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    console.error("Share error:", e);
    return false;
  }
};

// ─── FORMATIONS (7-a-side: kaleci + 6 oyuncu)
const FORMATIONS = {
  "4-2": {
    label: "4-2",
    positions: [
      { x: 50, y: 95, role: "KALECİ" },
      { x: 12, y: 70, role: "SOL BEK" },
      { x: 37, y: 72, role: "STOPER" },
      { x: 63, y: 72, role: "STOPER" },
      { x: 88, y: 70, role: "SAĞ BEK" },
      { x: 35, y: 42, role: "ORTA SAHA" },
      { x: 65, y: 42, role: "ORTA SAHA" },
    ],
  },
  "3-2-1": {
    label: "3-2-1",
    positions: [
      { x: 50, y: 95, role: "KALECİ" },
      { x: 20, y: 72, role: "DEFANS" },
      { x: 50, y: 74, role: "DEFANS" },
      { x: 80, y: 72, role: "DEFANS" },
      { x: 30, y: 44, role: "ORTA SAHA" },
      { x: 70, y: 44, role: "ORTA SAHA" },
      { x: 50, y: 18, role: "FORVET" },
    ],
  },
  "2-3-1": {
    label: "2-3-1",
    positions: [
      { x: 50, y: 95, role: "KALECİ" },
      { x: 28, y: 72, role: "DEFANS" },
      { x: 72, y: 72, role: "DEFANS" },
      { x: 18, y: 44, role: "ORTA SAHA" },
      { x: 50, y: 40, role: "ORTA SAHA" },
      { x: 82, y: 44, role: "ORTA SAHA" },
      { x: 50, y: 16, role: "FORVET" },
    ],
  },
  "3-1-2": {
    label: "3-1-2",
    positions: [
      { x: 50, y: 95, role: "KALECİ" },
      { x: 20, y: 72, role: "DEFANS" },
      { x: 50, y: 74, role: "DEFANS" },
      { x: 80, y: 72, role: "DEFANS" },
      { x: 50, y: 44, role: "ORTA SAHA" },
      { x: 30, y: 20, role: "FORVET" },
      { x: 70, y: 20, role: "FORVET" },
    ],
  },
  "1-4-1": {
    label: "1-4-1",
    positions: [
      { x: 50, y: 95, role: "KALECİ" },
      { x: 50, y: 72, role: "DEFANS" },
      { x: 14, y: 44, role: "ORTA SAHA" },
      { x: 38, y: 40, role: "ORTA SAHA" },
      { x: 62, y: 40, role: "ORTA SAHA" },
      { x: 86, y: 44, role: "ORTA SAHA" },
      { x: 50, y: 16, role: "FORVET" },
    ],
  },
  "2-2-2": {
    label: "2-2-2",
    positions: [
      { x: 50, y: 95, role: "KALECİ" },
      { x: 30, y: 72, role: "DEFANS" },
      { x: 70, y: 72, role: "DEFANS" },
      { x: 30, y: 46, role: "ORTA SAHA" },
      { x: 70, y: 46, role: "ORTA SAHA" },
      { x: 30, y: 20, role: "FORVET" },
      { x: 70, y: 20, role: "FORVET" },
    ],
  },
  "1-3-2": {
    label: "1-3-2",
    positions: [
      { x: 50, y: 95, role: "KALECİ" },
      { x: 50, y: 72, role: "DEFANS" },
      { x: 18, y: 46, role: "ORTA SAHA" },
      { x: 50, y: 42, role: "ORTA SAHA" },
      { x: 82, y: 46, role: "ORTA SAHA" },
      { x: 30, y: 18, role: "FORVET" },
      { x: 70, y: 18, role: "FORVET" },
    ],
  },
};

const mapPos = (pos, side, isMatch) => {
  if (!isMatch) return pos;
  if (side === "A") {
    return { ...pos, x: pos.x, y: 51 + (pos.y / 100) * 47 };
  }
  return { ...pos, x: 100 - pos.x, y: 49 - (pos.y / 100) * 47 };
};

const POSITIONS_LIST = [
  "KALECİ", "DEFANS", "ORTA SAHA", "FORVET", "SOL BEK", "SAĞ BEK", "STOPER",
];

const TEAM_COLORS = [
  { name: "Yeşil", primary: "#059669", secondary: "#34d399" },
  { name: "Mavi", primary: "#1d4ed8", secondary: "#60a5fa" },
  { name: "Kırmızı", primary: "#dc2626", secondary: "#f87171" },
  { name: "Sarı", primary: "#b45309", secondary: "#fbbf24" },
  { name: "Mor", primary: "#7c3aed", secondary: "#a78bfa" },
  { name: "Turuncu", primary: "#c2410c", secondary: "#fb923c" },
  { name: "Beyaz", primary: "#64748b", secondary: "#e2e8f0" },
  { name: "Siyah", primary: "#1e293b", secondary: "#94a3b8" },
];

const generateId = () => Math.random().toString(36).substr(2, 9);
const getInitials = (n, s) => `${(n || "?")[0]}${(s || "?")[0]}`.toUpperCase();
const ratingColor = (r) => r >= 80 ? "#22c55e" : r >= 65 ? "#eab308" : "#ef4444";
const avatarPalette = [
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6",
];
const avatarColor = (id) => {
  let h = 0;
  for (const c of id) h = c.charCodeAt(0) + ((h << 5) - h);
  return avatarPalette[Math.abs(h) % avatarPalette.length];
};

const mkTeam = (name, color, withPlayers) => ({
  name, color, formation: "3-2-1", fieldPlayers: Array(7).fill(null), captain: null,
  players: withPlayers
    ? [
        { id: generateId(), name: "Ahmet", surname: "Yılmaz", position: "KALECİ", rating: 85, photo: null },
        { id: generateId(), name: "Mehmet", surname: "Demir", position: "DEFANS", rating: 78, photo: null },
        { id: generateId(), name: "Can", surname: "Özkan", position: "DEFANS", rating: 80, photo: null },
        { id: generateId(), name: "Burak", surname: "Kaya", position: "STOPER", rating: 76, photo: null },
        { id: generateId(), name: "Emre", surname: "Çelik", position: "ORTA SAHA", rating: 82, photo: null },
        { id: generateId(), name: "Ali", surname: "Şahin", position: "ORTA SAHA", rating: 88, photo: null },
        { id: generateId(), name: "Oğuz", surname: "Aydın", position: "SAĞ BEK", rating: 74, photo: null },
        { id: generateId(), name: "Kerem", surname: "Arslan", position: "FORVET", rating: 90, photo: null },
        { id: generateId(), name: "Hakan", surname: "Koç", position: "FORVET", rating: 83, photo: null },
        { id: generateId(), name: "Serkan", surname: "Güneş", position: "SOL BEK", rating: 77, photo: null },
        { id: generateId(), name: "Yusuf", surname: "Tekin", position: "ORTA SAHA", rating: 72, photo: null },
        { id: generateId(), name: "Onur", surname: "Yıldız", position: "DEFANS", rating: 69, photo: null },
      ]
    : [],
});

// ─── KALICI DEPOLAMA (localStorage) ───
const STORAGE_KEY = "halisaha_kolik_data";
const saveData = (a, b) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ teamA: a, teamB: b })); } catch {}
};
const loadData = () => {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (d?.teamA?.players) return d;
  } catch {}
  return null;
};
const loadTeam = (key, fallbackName, fallbackColor, withPlayers) => {
  const d = loadData();
  return d?.[key] || mkTeam(fallbackName, fallbackColor, withPlayers);
};

// ─── ICONS ───
const I = {
  Plus: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>),
  Trash: () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>),
  Edit: () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>),
  Share: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>),
  Camera: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>),
  Users: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>),
  Field: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="18" rx="2" /><line x1="2" y1="12" x2="22" y2="12" /><circle cx="12" cy="12" r="3" /></svg>),
  Star: () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>),
  X: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>),
  Check: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>),
  Chevron: () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>),
  Reset: () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>),
  Crown: () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M2.5 19h19v2h-19zM22.5 7l-5.5 5-5-7-5 7L1.5 7 4 17h16z" /></svg>),
  Shield: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>),
  Trophy: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 19.24 7 20v2h10v-2c0-.76-.85-1.25-2.03-1.79C14.47 17.98 14 17.55 14 17v-2.34" /><path d="M18 2H6v7a6 6 0 1012 0V2z" /></svg>),
  Back: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>),
  Flag: () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>),
  Armband: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><text x="12" y="15" textAnchor="middle" fontSize="8" fontWeight="900" fill="currentColor" stroke="none">C</text></svg>),
  Stats: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>),
  Zap: () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>),
};

// ─── PITCH SVG ───
const Pitch = ({ colA, colB, isMatch }) => (
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.4 }}>
    <defs>
      <pattern id="grass" patternUnits="userSpaceOnUse" width="100" height="5.5">
        <rect width="100" height="5.5" fill="#1a6b31" />
        <rect width="100" height="2.75" fill="#1e7a38" opacity="0.5" />
      </pattern>
      <linearGradient id="glowA" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor={colA} stopOpacity="0.18" />
        <stop offset="100%" stopColor={colA} stopOpacity="0" />
      </linearGradient>
      <linearGradient id="glowB" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={colB} stopOpacity="0.18" />
        <stop offset="100%" stopColor={colB} stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#grass)" />
    {isMatch && (<><rect x="0" y="50" width="100" height="50" fill="url(#glowA)" /><rect x="0" y="0" width="100" height="50" fill="url(#glowB)" /></>)}
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
    <path d="M4 5 A3 3 0 0 1 7 2" fill="none" stroke="#fff" strokeWidth="0.3" strokeOpacity="0.5" />
    <path d="M93 2 A3 3 0 0 1 96 5" fill="none" stroke="#fff" strokeWidth="0.3" strokeOpacity="0.5" />
    <path d="M4 95 A3 3 0 0 0 7 98" fill="none" stroke="#fff" strokeWidth="0.3" strokeOpacity="0.5" />
    <path d="M93 98 A3 3 0 0 0 96 95" fill="none" stroke="#fff" strokeWidth="0.3" strokeOpacity="0.5" />
  </svg>
);

// ─── FIELD PLAYER ───
const FieldPlayer = ({ player, x, y, fieldRef, teamColor, isCaptain, onToggleCaptain, onRemove, isMatch, side, isGoalkeeper }) => {
  const [pos, setPos] = useState({ x, y });
  const [drag, setDrag] = useState(false);
  const [hover, setHover] = useState(false);
  const off = useRef({ x: 0, y: 0 });

  useEffect(() => { setPos({ x, y }); }, [x, y]);

  const clampY = useCallback((raw) => {
    if (!isMatch) return Math.max(1, Math.min(99, raw));
    if (side === "A") return Math.max(51, Math.min(99, raw));
    return Math.max(1, Math.min(49, raw));
  }, [isMatch, side]);
  const clampX = useCallback((raw) => Math.max(3, Math.min(97, raw)), []);

  const begin = (cx, cy) => {
    if (isGoalkeeper) return; // ★ Kaleci sabit — taşınamaz
    const r = fieldRef.current?.getBoundingClientRect();
    if (!r) return;
    off.current = { x: (cx - r.left) / r.width * 100 - pos.x, y: (cy - r.top) / r.height * 100 - pos.y };
    setDrag(true);
    setHover(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const move = useCallback((cx, cy) => {
    if (!drag) return;
    const r = fieldRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: clampX((cx - r.left) / r.width * 100 - off.current.x), y: clampY((cy - r.top) / r.height * 100 - off.current.y) });
  }, [drag, clampX, clampY, fieldRef]);

  const stop = useCallback(() => setDrag(false), []);

  useEffect(() => {
    if (!drag) return;
    const mm = (e) => move(e.clientX, e.clientY);
    const tm = (e) => { e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", tm, { passive: false });
    window.addEventListener("touchend", stop);
    return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", stop); window.removeEventListener("touchmove", tm); window.removeEventListener("touchend", stop); };
  }, [drag, move, stop]);

  const rc = ratingColor(player?.rating || 50);
  const isBottom = side === "A" || !isMatch;

  return (
    <div
      onMouseDown={(e) => { e.preventDefault(); begin(e.clientX, e.clientY); }}
      onTouchStart={(e) => begin(e.touches[0].clientX, e.touches[0].clientY)}
      onMouseEnter={() => !drag && setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%,-50%)", zIndex: drag || hover ? 100 : 10, cursor: isGoalkeeper ? "default" : (drag ? "grabbing" : "grab"), userSelect: "none", touchAction: "none", transition: drag ? "none" : "left 0.4s cubic-bezier(.4,0,.2,1), top 0.4s cubic-bezier(.4,0,.2,1)" }}
    >
      {hover && !drag && (
        <div style={{ position: "absolute", [isBottom ? "bottom" : "top"]: "100%", left: "50%", transform: `translate(-50%, ${isBottom ? "-8px" : "8px"})`, background: "rgba(8,12,20,0.96)", border: `1px solid ${teamColor}55`, backdropFilter: "blur(12px)", padding: "6px 12px", borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, boxShadow: `0 10px 28px rgba(0,0,0,0.7), 0 0 14px ${teamColor}22`, zIndex: 110, whiteSpace: "nowrap", animation: "tooltipIn 0.18s ease-out" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{player?.name} {player?.surname}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>{player?.position}</span>
            <span style={{ color: rc, fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>{player?.rating}</span>
          </div>
          <div style={{ position: "absolute", [isBottom ? "top" : "bottom"]: "100%", left: "50%", transform: "translateX(-50%)", border: "5px solid transparent", [isBottom ? "borderTopColor" : "borderBottomColor"]: "rgba(8,12,20,0.96)" }} />
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, filter: drag ? "drop-shadow(0 10px 24px rgba(0,0,0,0.75))" : "drop-shadow(0 3px 8px rgba(0,0,0,0.5))", transform: drag ? "scale(1.18)" : "scale(1)", transition: "transform 0.15s, filter 0.15s" }}>
        <div style={{ position: "relative" }}>
          {isCaptain && (
            <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", zIndex: 5, background: "linear-gradient(135deg,#fbbf24,#f59e0b)", borderRadius: 4, padding: "1px 4px", display: "flex", alignItems: "center", gap: 2, boxShadow: "0 2px 8px rgba(251,191,36,0.45)", border: "1px solid rgba(251,191,36,0.6)" }}>
              <I.Crown /><span style={{ fontSize: 7, fontWeight: 800, color: "#78350f", letterSpacing: 0.5 }}>C</span>
            </div>
          )}
          <div onClick={(e) => { e.stopPropagation(); onToggleCaptain?.(); }} style={{ width: 40, height: 40, borderRadius: "50%", background: player?.photo ? `url(${player.photo}) center/cover` : avatarColor(player?.id || "x"), border: `2.5px solid ${teamColor}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14, fontFamily: "'Bebas Neue','Oswald',sans-serif", boxShadow: drag ? `0 0 0 3px rgba(255,255,255,0.35), 0 0 18px ${teamColor}88` : `0 0 0 2px rgba(0,0,0,0.35), 0 0 8px ${teamColor}33`, transition: "box-shadow 0.2s" }}>
            {!player?.photo && getInitials(player?.name, player?.surname)}
          </div>
          <div style={{ position: "absolute", bottom: -3, right: -6, background: rc, color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: 5, padding: "1px 4px", lineHeight: "13px", border: "1.5px solid rgba(0,0,0,0.35)", fontFamily: "'JetBrains Mono',monospace", boxShadow: "0 2px 5px rgba(0,0,0,0.35)" }}>{player?.rating}</div>
          <button onClick={(e) => { e.stopPropagation(); onRemove?.(); }} style={{ position: "absolute", top: -5, right: -7, width: 16, height: 16, borderRadius: "50%", background: "#ef4444", border: "1.5px solid rgba(0,0,0,0.35)", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, boxShadow: "0 2px 5px rgba(0,0,0,0.35)", lineHeight: 1 }}>×</button>
        </div>
        {!hover && (
          <div style={{ background: "rgba(0,0,0,0.8)", color: "#fff", fontSize: 8.5, fontWeight: 700, padding: "2px 5px", borderRadius: 3, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: 0.4, fontFamily: "'Bebas Neue','Oswald',sans-serif", backdropFilter: "blur(4px)", maxWidth: 72, overflow: "hidden", textOverflow: "ellipsis", borderBottom: `2px solid ${teamColor}` }}>
            {player?.name} {player?.surname?.[0]}.
          </div>
        )}
      </div>
    </div>
  );
};

// ─── EMPTY SLOT ───
const EmptySlot = ({ x, y, role, teamColor, onDrop, onClickPlus }) => (
  <div onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("playerId"); if (id) onDrop(id); }} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)", zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
    <button onClick={onClickPlus} style={{ width: 40, height: 40, borderRadius: "50%", border: `2px dashed ${teamColor}66`, background: `${teamColor}12`, display: "flex", alignItems: "center", justifyContent: "center", color: teamColor, fontSize: 20, cursor: "pointer", padding: 0, transition: "transform 0.12s, background 0.12s" }} onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.12)"; e.currentTarget.style.background = `${teamColor}25`; }} onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = `${teamColor}12`; }}>+</button>
    <div style={{ fontSize: 7, color: "rgba(255,255,255,0.35)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, fontFamily: "'Bebas Neue',sans-serif", background: "rgba(0,0,0,0.35)", padding: "1px 4px", borderRadius: 3 }}>{role}</div>
  </div>
);

// ─── SHARED STYLES ───
const S = {
  input: { width: "100%", padding: "10px 13px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: 16, outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
  label: { color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5, display: "block" },
  btn: { width: "100%", padding: "11px", borderRadius: 10, border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, transition: "opacity 0.15s" },
  mini: { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: 5, cursor: "pointer", color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center" },
};

// ─── MODAL ───
const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, paddingTop: "calc(16px + env(safe-area-inset-top, 0px))", paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111318", borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", width: "100%", maxWidth: 440, maxHeight: "calc(100% - 32px)", overflow: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.6)", WebkitOverflowScrolling: "touch" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", position: "sticky", top: 0, background: "#111318", zIndex: 5, borderRadius: "16px 16px 0 0" }}>
          <h3 style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ ...S.mini, border: "none", background: "none" }}><I.X /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
};

// ─── PLAYER CARD ───
const PlayerCard = ({ player, onEdit, onDelete, isOnField, teamColor, compact, isCaptain, onToggleCaptain }) => {
  const rc = ratingColor(player.rating);
  return (
    <div draggable={!isOnField} onDragStart={(e) => { if (!isOnField) e.dataTransfer.setData("playerId", player.id); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: compact ? "7px 10px" : "10px 12px", background: isOnField ? `${teamColor}11` : "rgba(255,255,255,0.03)", borderRadius: 10, border: isOnField ? `1px solid ${teamColor}33` : "1px solid rgba(255,255,255,0.06)", cursor: isOnField ? "default" : "grab", opacity: isOnField ? 0.5 : 1, transition: "opacity 0.2s" }}>
      <div style={{ position: "relative" }}>
        <div style={{ width: compact ? 28 : 34, height: compact ? 28 : 34, borderRadius: "50%", flexShrink: 0, background: player.photo ? `url(${player.photo}) center/cover` : avatarColor(player.id), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: compact ? 10 : 12, fontFamily: "'Bebas Neue',sans-serif", border: `2px solid ${rc}` }}>
          {!player.photo && getInitials(player.name, player.surname)}
        </div>
        {isCaptain && (<div style={{ position: "absolute", top: -5, right: -5, background: "linear-gradient(135deg,#fbbf24,#f59e0b)", borderRadius: 3, padding: "0px 3px", fontSize: 7, fontWeight: 900, color: "#78350f", border: "1px solid rgba(251,191,36,0.6)", lineHeight: "12px" }}>C</div>)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#e2e8f0", fontSize: compact ? 12 : 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{player.name} {player.surname}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
          <span style={{ fontSize: compact ? 9 : 10, color: "rgba(255,255,255,0.38)", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.4 }}>{player.position}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: rc, fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}><I.Star /> {player.rating}</span>
        </div>
      </div>
      {!compact && (
        <div style={{ display: "flex", gap: 3 }}>
          {onToggleCaptain && (<button onClick={() => onToggleCaptain(player.id)} title="Kaptan yap" style={{ ...S.mini, color: isCaptain ? "#fbbf24" : "rgba(255,255,255,0.3)", background: isCaptain ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.06)", border: isCaptain ? "1px solid rgba(251,191,36,0.3)" : "1px solid rgba(255,255,255,0.08)" }}><I.Armband /></button>)}
          <button onClick={() => onEdit?.(player)} style={S.mini}><I.Edit /></button>
          <button onClick={() => onDelete?.(player.id)} style={{ ...S.mini, color: "#f87171" }}><I.Trash /></button>
        </div>
      )}
      {isOnField && (<div style={{ fontSize: 8, color: teamColor, fontWeight: 700 }}>✓</div>)}
    </div>
  );
};

// ─── PLAYER FORM ───
const PlayerForm = ({ player, onSave, onCancel, accent }) => {
  const [f, sF] = useState({ name: player?.name || "", surname: player?.surname || "", position: player?.position || "ORTA SAHA", rating: player?.rating || 70, photo: player?.photo || null });
  const fr = useRef();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div onClick={() => fr.current?.click()} style={{ width: 70, height: 70, borderRadius: "50%", cursor: "pointer", background: f.photo ? `url(${f.photo}) center/cover` : "rgba(255,255,255,0.06)", border: "2px dashed rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)" }}>
          {!f.photo && <I.Camera />}
        </div>
        <input ref={fr} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = (ev) => sF((p) => ({ ...p, photo: ev.target.result })); r.readAsDataURL(file); }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><label style={S.label}>{t("name")}</label><input style={S.input} value={f.name} onChange={(e) => sF((p) => ({ ...p, name: e.target.value }))} placeholder={t("name")} /></div>
        <div><label style={S.label}>{t("surname")}</label><input style={S.input} value={f.surname} onChange={(e) => sF((p) => ({ ...p, surname: e.target.value }))} placeholder={t("surname")} /></div>
      </div>
      <div>
        <label style={S.label}>{t("position")}</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {POSITIONS_LIST.map((p) => (<button key={p} onClick={() => sF((x) => ({ ...x, position: p }))} style={{ padding: "5px 11px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.4, border: f.position === p ? `1px solid ${accent}` : "1px solid rgba(255,255,255,0.08)", background: f.position === p ? `${accent}22` : "rgba(255,255,255,0.03)", color: f.position === p ? accent : "rgba(255,255,255,0.45)" }}>{p}</button>))}
        </div>
      </div>
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "14px", marginTop: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <label style={{ ...S.label, marginBottom: 0 }}>{t("rating")}</label>
          <div style={{ background: `${ratingColor(f.rating)}22`, color: ratingColor(f.rating), padding: "2px 8px", borderRadius: 6, fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", border: `1px solid ${ratingColor(f.rating)}55` }}>{f.rating}</div>
        </div>
        <input type="range" min="40" max="99" value={f.rating} style={{ width: "100%", height: 6, borderRadius: 6, appearance: "none", outline: "none", background: `linear-gradient(to right, ${ratingColor(f.rating)} ${((f.rating - 40) / (99 - 40)) * 100}%, rgba(255,255,255,0.08) ${((f.rating - 40) / (99 - 40)) * 100}%)` }} onChange={(e) => sF((p) => ({ ...p, rating: +e.target.value }))} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.25)", fontWeight: 600 }}><span>40</span><span>99</span></div>
      </div>
      <div style={{ display: "flex", gap: 9 }}>
        <button onClick={onCancel} style={{ ...S.btn, background: "rgba(255,255,255,0.06)", flex: 1 }}>{t("cancel")}</button>
        <button onClick={() => { if (!f.name.trim()) return; onSave({ ...player, ...f, id: player?.id || generateId() }); }} style={{ ...S.btn, flex: 1, background: `linear-gradient(135deg,${accent},${accent}bb)` }}><I.Check /> {player?.id ? t("update") : t("save")}</button>
      </div>
    </div>
  );
};

// ─── COLOR PICKER ───
const ColorPicker = ({ value, onChange }) => (
  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
    {TEAM_COLORS.map((c) => (<button key={c.name} onClick={() => onChange(c)} title={c.name} style={{ width: 26, height: 26, borderRadius: "50%", cursor: "pointer", border: value?.name === c.name ? "2.5px solid #fff" : "2.5px solid transparent", background: `linear-gradient(135deg,${c.primary},${c.secondary})`, boxShadow: value?.name === c.name ? `0 0 10px ${c.primary}99` : "none" }} />))}
  </div>
);

// ─── QUICK SELECT ───
const QuickSelect = ({ role, players, onSelect, teamColor, onFieldIds }) => {
  const candidates = players.filter((p) => { if (onFieldIds.has(p.id)) return false; if (p.position === role) return true; if (role.includes("BEK") || role === "STOPER" || role === "DEFANS") { return ["DEFANS", "SOL BEK", "SAĞ BEK", "STOPER"].includes(p.position); } return false; });
  const others = players.filter((p) => !onFieldIds.has(p.id) && !candidates.includes(p));
  const PlayerBtn = ({ p }) => (
    <button onClick={() => onSelect(p.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, cursor: "pointer", textAlign: "left", width: "100%" }}>
      <div style={{ width: 30, height: 30, borderRadius: "50%", background: p.photo ? `url(${p.photo}) center/cover` : avatarColor(p.id), border: `2px solid ${ratingColor(p.rating)}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{!p.photo && getInitials(p.name, p.surname)}</div>
      <div style={{ flex: 1 }}><div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{p.name} {p.surname}</div><div style={{ fontSize: 9, color: teamColor, fontWeight: 700 }}>{p.position}</div></div>
      <div style={{ color: ratingColor(p.rating), fontFamily: "'JetBrains Mono'", fontSize: 12, fontWeight: 800 }}>{p.rating}</div>
    </button>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("candidates_for", {role})}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 300, overflow: "auto" }}>
        {candidates.map((p) => (<PlayerBtn key={p.id} p={p} />))}
        {candidates.length === 0 && others.length === 0 && (<div style={{ textAlign: "center", padding: 20, color: "rgba(255,255,255,0.2)", fontSize: 12 }}>{t("no_candidates")}</div>)}
      </div>
      {others.length > 0 && (<><div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginTop: 4 }}>{t("other_free")}</div><div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 200, overflow: "auto" }}>{others.map((p) => (<PlayerBtn key={p.id} p={p} />))}</div></>)}
    </div>
  );
};

// ─── CAPTAIN SELECTOR ───
const CaptainSelector = ({ team, onSelect, accent }) => {
  const fieldPlayerIds = new Set(team.fieldPlayers.filter(Boolean));
  const fieldPlayers = team.players.filter((p) => fieldPlayerIds.has(p.id));
  const benchPlayers = team.players.filter((p) => !fieldPlayerIds.has(p.id));
  const PlayerRow = ({ p }) => {
    const isCap = team.captain === p.id;
    const rc = ratingColor(p.rating);
    return (
      <button onClick={() => onSelect(p.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", width: "100%", background: isCap ? `${accent}18` : "rgba(255,255,255,0.03)", border: isCap ? `1.5px solid ${accent}55` : "1px solid rgba(255,255,255,0.06)", borderRadius: 10, cursor: "pointer", textAlign: "left" }}>
        <div style={{ position: "relative" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: p.photo ? `url(${p.photo}) center/cover` : avatarColor(p.id), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12, fontFamily: "'Bebas Neue',sans-serif", border: `2px solid ${isCap ? "#fbbf24" : rc}` }}>{!p.photo && getInitials(p.name, p.surname)}</div>
          {isCap && (<div style={{ position: "absolute", top: -4, right: -4, background: "linear-gradient(135deg,#fbbf24,#f59e0b)", borderRadius: 3, padding: "0px 3px", fontSize: 7, fontWeight: 900, color: "#78350f", border: "1px solid rgba(251,191,36,0.6)", lineHeight: "13px" }}>C</div>)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{p.name} {p.surname}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 500, textTransform: "uppercase" }}>{p.position}</div></div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: rc, fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>{p.rating}</span>
          {isCap ? (<div style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)", borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 800, color: "#78350f" }}>{t("captain")}</div>) : (<div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.35)" }}>{t("select")}</div>)}
        </div>
      </button>
    );
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(251,191,36,0.08)", borderRadius: 10, border: "1px solid rgba(251,191,36,0.15)" }}>
        <div style={{ fontSize: 20 }}>👑</div>
        <div><div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24" }}>{t("captain_select")}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{t("captain_hint")}</div></div>
      </div>
      {team.captain && (<button onClick={() => onSelect(null)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)", cursor: "pointer", color: "#f87171", fontSize: 12, fontWeight: 600, textAlign: "center", width: "100%" }}>{t("captain_remove")}</button>)}
      {fieldPlayers.length > 0 && (<div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>{t("on_pitch")}</div><div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{fieldPlayers.map((p) => (<PlayerRow key={p.id} p={p} />))}</div></div>)}
      {benchPlayers.length > 0 && (<div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>{t("on_bench")}</div><div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{benchPlayers.map((p) => (<PlayerRow key={p.id} p={p} />))}</div></div>)}
      {team.players.length === 0 && (<div style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.2)" }}><div style={{ fontSize: 26, marginBottom: 6 }}>👥</div><div style={{ fontSize: 12 }}>{t("captain_first_squad")}</div></div>)}
    </div>
  );
};

// ─── TEAM STATS CARD ───
const TeamStatsCard = ({ team, accent }) => {
  const avgRating = team.players.length ? Math.round(team.players.reduce((a, p) => a + p.rating, 0) / team.players.length) : 0;
  const onField = team.fieldPlayers.filter(Boolean).length;
  const topPlayer = [...team.players].sort((a, b) => b.rating - a.rating)[0];
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}><I.Stats /><span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{t("team_stats")}</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[{ label: t("stat_squad"), value: team.players.length, icon: "👥" }, { label: t("stat_field"), value: `${onField}/7`, icon: "⚽" }, { label: t("stat_avg"), value: avgRating, icon: "⭐" }].map((s) => (
          <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
            <div style={{ fontSize: 14, marginBottom: 2 }}>{s.icon}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0", fontFamily: "'JetBrains Mono',monospace" }}>{s.value}</div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>
      {topPlayer && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: `${accent}0a`, borderRadius: 8, padding: "6px 10px", border: `1px solid ${accent}22` }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, background: topPlayer.photo ? `url(${topPlayer.photo}) center/cover` : avatarColor(topPlayer.id), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 9, fontFamily: "'Bebas Neue',sans-serif", border: `2px solid ${accent}` }}>{!topPlayer.photo && getInitials(topPlayer.name, topPlayer.surname)}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>{t("top_player")}</div><div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 700 }}>{topPlayer.name} {topPlayer.surname}</div></div>
          <div style={{ color: ratingColor(topPlayer.rating), fontSize: 14, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>{topPlayer.rating}</div>
        </div>
      )}
    </div>
  );
};

// ─── MATCH RESULT MODAL ────
const MatchResultModal = ({ open, onClose, teamA, teamB }) => {
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [goals, setGoals] = useState([]);
  const [gSide, setGSide] = useState("A");
  const [gName, setGName] = useState("");
  const [gMin, setGMin] = useState("");
  const [copied, setCopied] = useState(false);
  const scoreRef = useRef(null);
  const acA = teamA.color.secondary;
  const acB = teamB.color.secondary;
  const addGoal = () => { if (!gName.trim()) return; setGoals((g) => [...g, { side: gSide, scorer: gName.trim(), minute: gMin.trim() }]); setGName(""); setGMin(""); };
  const winner = scoreA > scoreB ? teamA.name : scoreB > scoreA ? teamB.name : null;
  const buildText = () => {
    const gA = goals.filter((g) => g.side === "A"); const gB = goals.filter((g) => g.side === "B");
    let t = `⚽ MAÇ SONUCU\n━━━━━━━━━━━━━━━━━━\n`;
    t += `${teamA.name.toUpperCase()}  ${scoreA} – ${scoreB}  ${teamB.name.toUpperCase()}\n━━━━━━━━━━━━━━━━━━\n`;
    t += winner ? `🏆 Kazanan: ${winner}\n` : scoreA === scoreB && (scoreA > 0 || scoreB > 0) ? `🤝 Beraberlik\n` : "";
    if (gA.length || gB.length) { t += `\n⚽ Goller\n`; if (gA.length) { t += `${teamA.name}:\n`; gA.forEach((g) => (t += `  • ${g.scorer}${g.minute ? " (" + g.minute + "')" : ""}\n`)); } if (gB.length) { t += `${teamB.name}:\n`; gB.forEach((g) => (t += `  • ${g.scorer}${g.minute ? " (" + g.minute + "')" : ""}\n`)); } }
    t += `\n📱 HalıSaha-Kolik`; return t;
  };

  const share = async () => {
    showInterstitial();
    if (scoreRef.current) {
      const ok = await captureAndShare(scoreRef.current, "mac-sonucu.png");
      if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2200); }
    }
  };

  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.82)", backdropFilter: "blur(12px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#0e1117", borderRadius: "22px 22px 0 0", border: "1px solid rgba(255,255,255,0.08)", width: "100%", maxWidth: 480, maxHeight: "92vh", overflow: "auto", paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}><div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.14)" }} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#e2e8f0", fontSize: 16, fontWeight: 700 }}><I.Trophy /> {t("match_result")}</div>
          <button onClick={onClose} style={{ ...S.mini, border: "none", background: "none" }}><I.X /></button>
        </div>
        <div ref={scoreRef} style={{ padding: "0 18px 20px", display: "flex", flexDirection: "column", gap: 18, background: "#0e1117" }}>
          {/* Score board */}
          <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)", padding: "20px 12px", background: "rgba(20,22,30,0.98)" }}>
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg,${acA}18,transparent 42%,transparent 58%,${acB}18)`, pointerEvents: "none" }} />
            <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: acA, textTransform: "uppercase", fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.2, marginBottom: 8 }}>{teamA.name}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <button onClick={() => setScoreA((s) => Math.max(0, s - 1))} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${acA}44`, background: `${acA}14`, color: acA, fontSize: 18, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                  <span style={{ fontSize: 52, fontWeight: 800, color: "#fff", fontFamily: "'Bebas Neue',sans-serif", lineHeight: 1, minWidth: 40, textAlign: "center", textShadow: `0 0 24px ${acA}55` }}>{scoreA}</span>
                  <button onClick={() => setScoreA((s) => s + 1)} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${acA}44`, background: `${acA}14`, color: acA, fontSize: 18, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                </div>
              </div>
              <div style={{ padding: "0 6px", textAlign: "center" }}><div style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2 }}>–</div></div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: acB, textTransform: "uppercase", fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.2, marginBottom: 8 }}>{teamB.name}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <button onClick={() => setScoreB((s) => Math.max(0, s - 1))} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${acB}44`, background: `${acB}14`, color: acB, fontSize: 18, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                  <span style={{ fontSize: 52, fontWeight: 800, color: "#fff", fontFamily: "'Bebas Neue',sans-serif", lineHeight: 1, minWidth: 40, textAlign: "center", textShadow: `0 0 24px ${acB}55` }}>{scoreB}</span>
                  <button onClick={() => setScoreB((s) => s + 1)} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${acB}44`, background: `${acB}14`, color: acB, fontSize: 18, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                </div>
              </div>
            </div>
            {(scoreA > 0 || scoreB > 0) && (<div style={{ textAlign: "center", marginTop: 12, fontSize: 13, fontWeight: 700, color: winner ? "#fbbf24" : "rgba(255,255,255,0.45)", letterSpacing: 0.3 }}>{winner ? t("winner", {name: winner}) : t("draw")}</div>)}
          </div>
          {/* Goals */}
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>{t("goals")} <span style={{ color: "rgba(255,255,255,0.2)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{t("optional")}</span></div>
            <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
              <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
                {["A", "B"].map((s) => { const ac = s === "A" ? acA : acB; return (<button key={s} onClick={() => setGSide(s)} style={{ padding: "7px 10px", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, background: gSide === s ? `${ac}20` : "transparent", color: gSide === s ? ac : "rgba(255,255,255,0.28)" }}>{s === "A" ? teamA.name.slice(0, 5) : teamB.name.slice(0, 5)}</button>); })}
              </div>
              <input list="scorer-opts" value={gName} onChange={(e) => setGName(e.target.value)} placeholder={t("scorer_ph")} onKeyDown={(e) => e.key === "Enter" && addGoal()} style={{ ...S.input, flex: 1, fontSize: 12, padding: "7px 10px" }} />
              <datalist id="scorer-opts">{(gSide === "A" ? teamA : teamB).players.map((p) => (<option key={p.id} value={`${p.name} ${p.surname}`} />))}</datalist>
              <input value={gMin} onChange={(e) => setGMin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addGoal()} type="number" min="1" max="120" placeholder="'" style={{ ...S.input, width: 46, fontSize: 12, padding: "7px 6px", textAlign: "center" }} />
              <button onClick={addGoal} style={{ ...S.mini, padding: "7px 9px", borderRadius: 8, color: gSide === "A" ? acA : acB, border: `1px solid ${gSide === "A" ? acA : acB}33`, background: gSide === "A" ? `${acA}14` : `${acB}14` }}><I.Plus /></button>
            </div>
            {goals.length > 0 && (<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{goals.map((g, i) => (<div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 8, borderLeft: `3px solid ${g.side === "A" ? acA : acB}` }}><span style={{ fontSize: 14 }}>⚽</span><span style={{ flex: 1, fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>{g.scorer}</span>{g.minute && (<span style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", fontFamily: "'JetBrains Mono',monospace" }}>{g.minute}'</span>)}<span style={{ fontSize: 9.5, color: g.side === "A" ? acA : acB, fontWeight: 700, letterSpacing: 0.3 }}>{g.side === "A" ? teamA.name.slice(0, 8) : teamB.name.slice(0, 8)}</span><button onClick={() => setGoals((gl) => gl.filter((_, j) => j !== i))} style={{ ...S.mini, padding: 2, border: "none", background: "none", color: "#f87171" }}>×</button></div>))}</div>)}
          </div>
          <button onClick={share} style={{ ...S.btn, borderRadius: 13, padding: "14px", fontSize: 15, letterSpacing: 0.4, background: copied ? "linear-gradient(135deg,#059669,#10b981)" : "linear-gradient(135deg,#7c3aed,#a855f7)", boxShadow: copied ? "0 8px 24px rgba(5,150,105,0.35)" : "0 8px 28px rgba(124,58,237,0.38)" }}><I.Share />{copied ? t("copied") : t("share_result")}</button>
        </div>
      </div>
    </div>
  );
};

// ─── TOAST ───
const Toast = ({ message, show }) => (
  <div style={{ position: "fixed", bottom: "calc(76px + env(safe-area-inset-bottom, 0px))", left: "50%", transform: "translateX(-50%)", background: "#059669", color: "#fff", padding: "9px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 8px 28px rgba(5,150,105,0.4)", opacity: show ? 1 : 0, transition: "opacity 0.25s", pointerEvents: "none", zIndex: 2000, whiteSpace: "nowrap" }}>{message}</div>
);


// ═══════════════════════════════════════════════════════════════════
// ═══ MAIN APP
// ═══════════════════════════════════════════════════════════════════
export default function LineupPro() {
  const [lang] = useLang(); // ★ Dil değişikliklerinde re-render
  const [mode, setMode] = useState(null);
  const [tab, setTab] = useState("field");
  const [teamA, setTeamA] = useState(() => loadTeam("teamA", "Takımım", TEAM_COLORS[0], true));
  const [teamB, setTeamB] = useState(() => loadTeam("teamB", "Rakip Takım", TEAM_COLORS[2], false));
  const [activeTeam, setAT] = useState("A");
  const [showPlayer, setSP] = useState(false);
  const [editPlayer, setEP] = useState(null);
  const [showForm, setSF] = useState(null);
  const [showSettings, setSS] = useState(null);
  const [showResult, setSR] = useState(false);
  const [showCaptain, setSC] = useState(false);
  const [quickSelect, setQS] = useState(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState({ show: false, msg: "" });
  const fieldRef = useRef(null);

  const isMatch = mode === "match";
  const team = activeTeam === "A" ? teamA : teamB;
  const setTeam = activeTeam === "A" ? setTeamA : setTeamB;
  const tc = team.color.secondary;

  // ★ REKLAM: Uygulama açılışında reklamları başlat
  useEffect(() => {
    startAds();
  }, []);

  // ★ KAYIT: Takım verilerini localStorage'a kaydet
  useEffect(() => {
    saveData(teamA, teamB);
  }, [teamA, teamB]);

  const toast_ = (m) => { setToast({ show: true, msg: m }); setTimeout(() => setToast({ show: false, msg: "" }), 1800); };

  const getPositions = (side) => FORMATIONS[(side === "A" ? teamA : teamB).formation].positions.map((p) => mapPos(p, side, isMatch));

  const savePlayer = (p) => {
    setTeam((t) => { const i = t.players.findIndex((x) => x.id === p.id); return { ...t, players: i >= 0 ? t.players.map((x, j) => (j === i ? p : x)) : [...t.players, p] }; });
    setSP(false); setEP(null); toast_(t("t_saved"));
  };

  const deletePlayer = (id) => {
    setTeam((t) => ({ ...t, players: t.players.filter((x) => x.id !== id), fieldPlayers: t.fieldPlayers.map((x) => (x === id ? null : x)), captain: t.captain === id ? null : t.captain }));
    toast_(t("t_deleted"));
  };

  const autoFill = async (side) => {
    const doFill = () => {
      const setter = side === "A" ? setTeamA : setTeamB;
      setter((t) => {
        const on = new Set(t.fieldPlayers.filter(Boolean));
        const av = [...t.players.filter((p) => !on.has(p.id))];
        const n = [...t.fieldPlayers];
        const positionsNeeded = FORMATIONS[t.formation].positions;
        for (let i = 0; i < 7; i++) { if (!n[i] && av.length) { const reqRole = positionsNeeded[i].role; const matchIdx = av.findIndex((p) => p.position === reqRole); if (matchIdx !== -1) { n[i] = av[matchIdx].id; av.splice(matchIdx, 1); } } }
        for (let i = 0; i < 7; i++) { if (!n[i] && av.length) { const reqRole = positionsNeeded[i].role; const matchIdx = av.findIndex((p) => { if (reqRole.includes("BEK") || reqRole === "STOPER" || reqRole === "DEFANS") { return ["DEFANS", "SOL BEK", "SAĞ BEK", "STOPER"].includes(p.position); } return false; }); if (matchIdx !== -1) { n[i] = av[matchIdx].id; av.splice(matchIdx, 1); } } }
        av.sort((a, b) => b.rating - a.rating);
        for (let i = 0; i < 7; i++) { if (!n[i] && av.length) { n[i] = av.shift().id; } }
        return { ...t, fieldPlayers: n };
      });
      toast_(t("t_auto_filled"));
    };

    const rewarded = await showRewarded(doFill);
    if (!rewarded) {
      showInterstitial();
      doFill();
    }
  };

  const clearField = (side) => { (side === "A" ? setTeamA : setTeamB)((t) => ({ ...t, fieldPlayers: Array(7).fill(null) })); toast_(t("t_field_cleared")); };

  const placePlayer = (side, idx, id) => {
    const setter = side === "A" ? setTeamA : setTeamB;
    setter((t) => { if (t.fieldPlayers.includes(id)) return t; const n = [...t.fieldPlayers]; n[idx] = id; return { ...t, fieldPlayers: n }; });
  };

  const removeFromField = (side, idx) => { (side === "A" ? setTeamA : setTeamB)((t) => { const n = [...t.fieldPlayers]; n[idx] = null; return { ...t, fieldPlayers: n }; }); };

  const toggleCaptain = (side, id) => { (side === "A" ? setTeamA : setTeamB)((t) => ({ ...t, captain: t.captain === id ? null : id })); };

  const handleModeSelect = async (newMode) => {
    showInterstitial();
    hideBanner();
    setMode(newMode);
  };

  const handleMatchEnd = async () => {
    showInterstitial();
    setSR(true);
  };

  const handleShareLineup = async () => {
    const pitchEl = fieldRef.current;
    if (!pitchEl) { toast_(t("t_field_not_found")); return; }
    toast_(t("t_screenshot"));
    showInterstitial();
    const ok = await captureAndShare(pitchEl, "dizilim.png");
    if (ok) toast_(t("t_lineup_shared"));
  };

  const onFieldIds = new Set(team.fieldPlayers.filter(Boolean));
  const filtered = team.players.filter((p) => { const q = search.toLowerCase(); return p.name.toLowerCase().includes(q) || p.surname.toLowerCase().includes(q) || p.position.toLowerCase().includes(q); });

  const globalCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@700&display=swap');
    @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
    @keyframes tooltipIn { from { opacity: 0; transform: translate(-50%, -4px) scale(0.95) } to { opacity: 1; transform: translate(-50%, 0) scale(1) } }
    @keyframes pulseGlow { 0%,100% { opacity: 0.5 } 50% { opacity: 1 } }
    @keyframes pulse { 0%,100% { opacity: 0.6 } 50% { opacity: 1 } }
    * { box-sizing: border-box; margin: 0; padding: 0 }
    html { height: 100%; overflow: hidden; }
    body { height: 100%; overflow: hidden; position: fixed; width: 100%; }
    #root { height: 100%; overflow: hidden; }
    ::-webkit-scrollbar { width: 3px }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #fff; border: 3px solid #22c55e; box-shadow: 0 3px 8px rgba(0,0,0,0.4); cursor: pointer; }
    input[type=range]::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: #fff; border: 3px solid #22c55e; box-shadow: 0 3px 8px rgba(0,0,0,0.4); cursor: pointer; }
  `;

  // ══════════════════════════════════════════════
  // ══ MODE SELECT SCREEN
  // ══════════════════════════════════════════════
  if (!mode) return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "linear-gradient(160deg,#070a0f,#0c1117 45%,#0a1628)", color: "#e2e8f0", position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, paddingTop: "calc(24px + env(safe-area-inset-top, 0px))", paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))", textAlign: "center" }}>
      <style>{globalCSS}</style>
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "15%", left: "10%", width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(5,150,105,0.08) 0%, transparent 70%)", animation: "pulseGlow 4s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "20%", right: "5%", width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)", animation: "pulseGlow 5s ease-in-out infinite 1s" }} />
      </div>

      {/* ★ TOP BAR: Sadece dil seçici (sağ üst) */}
      <div style={{ position: "absolute", top: "calc(14px + env(safe-area-inset-top, 0px))", right: 16, zIndex: 2 }}>
        <LangToggle lang={lang} onChange={setLang} />
      </div>

      <div style={{ position: "relative", zIndex: 1 }}>
        <img src={logo} alt="HalıSaha-Kolik" style={{ width: 72, height: 72, borderRadius: 18, objectFit: "cover", boxShadow: "0 12px 36px rgba(5,150,105,0.35), 0 0 60px rgba(5,150,105,0.15)", margin: "0 auto 18px", animation: "fadeUp 0.45s" }} />
        <h1 style={{ fontSize: 30, fontWeight: 700, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 3, marginBottom: 4, animation: "fadeUp 0.45s 0.08s both" }}>HalıSaha-Kolik</h1>
        <p style={{ color: "rgba(255,255,255,0.32)", fontSize: 13, marginBottom: 10, animation: "fadeUp 0.45s 0.16s both" }}>{t("mode_subtitle")}</p>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 32, animation: "fadeUp 0.45s 0.2s both" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 360 }}>
            {[
              { key: "myteam", icon: <I.Shield />, col: "#34d399", bg: "rgba(5,150,105,0.12)", bd: "rgba(52,211,153,0.2)", title: t("mode_myteam_title"), sub: t("mode_myteam_sub"), detail: t("mode_myteam_detail") },
              { key: "match", icon: <I.Trophy />, col: "#fbbf24", bg: "rgba(245,158,11,0.12)", bd: "rgba(251,191,36,0.2)", title: t("mode_match_title"), sub: t("mode_match_sub"), detail: t("mode_match_detail") },
            ].map((m, i) => (
              <button key={m.key} onClick={() => handleModeSelect(m.key)} style={{ padding: "18px 20px", borderRadius: 16, background: m.bg, border: `1px solid ${m.bd}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 14, textAlign: "left", animation: `fadeUp 0.45s ${0.24 + i * 0.08}s both`, transition: "transform 0.15s, box-shadow 0.15s" }}>
                <div style={{ width: 48, height: 48, borderRadius: 13, background: `${m.col}22`, display: "flex", alignItems: "center", justifyContent: "center", color: m.col, flexShrink: 0 }}>{m.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: m.col, fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{m.title}</div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, lineHeight: 1.45 }}>{m.sub}</div>
                  <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 9, marginTop: 4, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>{m.detail}</div>
                </div>
                <div style={{ color: m.col, opacity: 0.5, transform: "rotate(-90deg)" }}><I.Chevron /></div>
              </button>
            ))}
          </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════
  // ══ MAIN UI
  // ══════════════════════════════════════════════

  // ★ SAFE AREA: Tab bar yüksekliği + safe area bottom
  const TAB_BAR_HEIGHT = 56; // px
  const BOTTOM_SAFE = "env(safe-area-inset-bottom, 0px)";

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "linear-gradient(160deg,#070a0f,#0c1117 45%,#0a1628)", color: "#e2e8f0", position: "fixed", inset: 0, maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{globalCSS}</style>

      {/* ★ HEADER — safe-area-inset-top ile status bar'ın altına itildi */}
      <div style={{ padding: "10px 13px", paddingTop: "calc(10px + env(safe-area-inset-top, 0px))", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(7,10,15,0.95)", backdropFilter: "blur(14px)", flexShrink: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <button onClick={() => { setMode(null); showBanner(); }} style={{ ...S.mini, border: "none", background: "none", padding: 3 }}><I.Back /></button>
          <img src={logo} alt="HalıSaha-Kolik" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{isMatch ? t("hdr_match") : t("hdr_myteam")}</div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.28)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{isMatch ? `${teamA.name} vs ${teamB.name}` : teamA.name}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setSS(activeTeam)} style={{ ...S.mini, padding: "5px 7px", fontSize: 10 }}>⚙️</button>
          {isMatch ? (
            <button onClick={handleMatchEnd} style={{ ...S.mini, padding: "5px 10px", gap: 5, fontSize: 10, fontWeight: 700, color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.08)", borderRadius: 8, display: "flex", alignItems: "center" }}><I.Flag /> {t("hdr_end_match")}</button>
          ) : (
            <button onClick={handleShareLineup} style={{ ...S.mini, padding: "5px 10px", gap: 4, display: "flex", alignItems: "center", borderRadius: 8, fontSize: 10, fontWeight: 600, color: tc, border: `1px solid ${tc}33`, background: `${tc}11` }}><I.Share /></button>
          )}
        </div>
      </div>

      {/* TEAM TOGGLE */}
      {isMatch && tab === "players" && (
        <div style={{ display: "flex", padding: "5px 13px", gap: 4, borderBottom: "1px solid rgba(255,255,255,0.04)", flexShrink: 0 }}>
          {["A", "B"].map((s) => { const tm = s === "A" ? teamA : teamB; return (<button key={s} onClick={() => setAT(s)} style={{ flex: 1, padding: "6px", borderRadius: 8, border: "none", cursor: "pointer", background: activeTeam === s ? `${tm.color.secondary}22` : "rgba(255,255,255,0.03)", color: activeTeam === s ? tm.color.secondary : "rgba(255,255,255,0.32)", fontSize: 11, fontWeight: 700, borderBottom: activeTeam === s ? `2px solid ${tm.color.secondary}` : "2px solid transparent" }}><span style={{ width: 5, height: 5, borderRadius: "50%", display: "inline-block", marginRight: 4, background: tm.color.secondary, verticalAlign: "middle" }} />{tm.name} ({tm.players.length})</button>); })}
        </div>
      )}

      {/* ★ CONTENT — paddingBottom artırıldı: tab bar + safe area + boşluk */}
      <div style={{ flex: 1, overflow: "auto", paddingBottom: `calc(${TAB_BAR_HEIGHT}px + ${BOTTOM_SAFE} + 8px)` }}>
        {tab === "field" ? (
          <div style={{ animation: "fadeIn 0.25s" }}>
            {/* Formation bar */}
            <div style={{ padding: "5px 13px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", gap: 4 }}>
                {(isMatch ? ["A", "B"] : ["A"]).map((s) => { const tm = s === "A" ? teamA : teamB; return (
                  <div key={s} style={{ position: "relative" }}>
                    <button onClick={() => setSF(showForm === s ? null : s)} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "5px 9px", cursor: "pointer", color: "#e2e8f0", fontSize: 11, fontWeight: 600 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: tm.color.secondary }} />
                      <span style={{ color: tm.color.secondary, fontFamily: "'JetBrains Mono',monospace" }}>{tm.formation}</span>
                      <I.Chevron />
                    </button>
                    {showForm === s && (<div style={{ position: "absolute", top: "108%", left: 0, zIndex: 40, background: "#111318", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden", minWidth: 120, boxShadow: "0 12px 40px rgba(0,0,0,0.55)" }}>{Object.keys(FORMATIONS).map((f) => (<button key={f} onClick={() => { (s === "A" ? setTeamA : setTeamB)((t) => ({ ...t, formation: f })); setSF(null); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 12px", border: "none", cursor: "pointer", background: f === tm.formation ? `${tm.color.secondary}18` : "transparent", color: f === tm.formation ? tm.color.secondary : "#e2e8f0", fontSize: 12, fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.04)", fontFamily: "'JetBrains Mono',monospace" }}>{f}</button>))}</div>)}
                  </div>
                ); })}
              </div>
              <div style={{ display: "flex", gap: 2 }}>
                {(isMatch ? ["A", "B"] : ["A"]).map((s) => (<button key={`af${s}`} onClick={() => autoFill(s)} style={{ ...S.mini, padding: "4px 6px", fontSize: 9, fontWeight: 800, gap: 3, display: "flex", alignItems: "center", color: (s === "A" ? teamA : teamB).color.secondary, border: `1px solid ${(s === "A" ? teamA : teamB).color.secondary}33` }}><I.Zap />{isMatch ? s : t("auto_fill")}</button>))}
                <button onClick={() => { clearField("A"); if (isMatch) clearField("B"); }} style={{ ...S.mini, padding: 5, color: "#f87171" }}><I.Reset /></button>
              </div>
            </div>

            {/* PITCH */}
            <div style={{ padding: 0 }}>
              <div ref={fieldRef} style={{ position: "relative", width: "100%", paddingTop: isMatch ? "170%" : "145%", borderRadius: "0 0 24px 24px", overflow: "hidden", background: "linear-gradient(180deg,#1a6b31 0%,#1e7a38 25%,#1a6b31 50%,#1e7a38 75%,#1a6b31 100%)", boxShadow: "0 12px 40px rgba(0,0,0,0.55), inset 0 0 80px rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ position: "absolute", inset: 0 }}>
                  <Pitch colA={teamA.color.secondary} colB={isMatch ? teamB.color.secondary : teamA.color.secondary} isMatch={isMatch} />
                  {isMatch && (<div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", display: "flex", alignItems: "center", gap: 6, zIndex: 2, pointerEvents: "none" }}><div style={{ background: "rgba(0,0,0,0.5)", padding: "2px 8px", borderRadius: 4, fontSize: 7, color: "rgba(255,255,255,0.3)", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "'Bebas Neue',sans-serif", backdropFilter: "blur(4px)" }}>{t("midfield")}</div></div>)}

                  {/* Team A */}
                  {getPositions("A").map((pos, idx) => { const pid = teamA.fieldPlayers[idx]; const p = pid ? teamA.players.find((x) => x.id === pid) : null; return p ? (<FieldPlayer key={`a${idx}`} player={p} x={pos.x} y={pos.y} fieldRef={fieldRef} teamColor={teamA.color.secondary} isCaptain={teamA.captain === p.id} side="A" isMatch={isMatch} isGoalkeeper={pos.role === "KALECİ"} onToggleCaptain={() => toggleCaptain("A", p.id)} onRemove={() => removeFromField("A", idx)} />) : (<EmptySlot key={`ae${idx}`} x={pos.x} y={pos.y} role={pos.role} teamColor={teamA.color.secondary} onDrop={(id) => placePlayer("A", idx, id)} onClickPlus={() => setQS({ side: "A", idx, role: pos.role })} />); })}

                  {/* Team B */}
                  {isMatch && getPositions("B").map((pos, idx) => { const pid = teamB.fieldPlayers[idx]; const p = pid ? teamB.players.find((x) => x.id === pid) : null; return p ? (<FieldPlayer key={`b${idx}`} player={p} x={pos.x} y={pos.y} fieldRef={fieldRef} teamColor={teamB.color.secondary} isCaptain={teamB.captain === p.id} side="B" isMatch={isMatch} isGoalkeeper={pos.role === "KALECİ"} onToggleCaptain={() => toggleCaptain("B", p.id)} onRemove={() => removeFromField("B", idx)} />) : (<EmptySlot key={`be${idx}`} x={pos.x} y={pos.y} role={pos.role} teamColor={teamB.color.secondary} onDrop={(id) => placePlayer("B", idx, id)} onClickPlus={() => setQS({ side: "B", idx, role: pos.role })} />); })}

                  {/* Labels */}
                  <div style={{ position: "absolute", bottom: 3, left: 7, display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 4, height: 4, borderRadius: "50%", background: teamA.color.secondary }} /><span style={{ fontSize: 6.5, color: "rgba(255,255,255,0.2)", fontWeight: 700, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{teamA.name}</span></div>
                  {isMatch && (<div style={{ position: "absolute", top: 3, right: 7, display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 4, height: 4, borderRadius: "50%", background: teamB.color.secondary }} /><span style={{ fontSize: 6.5, color: "rgba(255,255,255,0.2)", fontWeight: 700, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{teamB.name}</span></div>)}
                  <div style={{ position: "absolute", bottom: 3, right: 7, fontSize: 6.5, color: "rgba(255,255,255,0.1)", fontWeight: 700, letterSpacing: 1, fontFamily: "'Bebas Neue',sans-serif" }}>HalıSaha-Kolik</div>
                </div>
              </div>
            </div>

            {/* Drag list */}
            <div style={{ padding: "6px 13px 10px" }}>
              {isMatch && (<div style={{ display: "flex", gap: 4, marginBottom: 7 }}>{["A", "B"].map((s) => (<button key={s} onClick={() => setAT(s)} style={{ flex: 1, padding: "5px", borderRadius: 6, border: "none", cursor: "pointer", background: activeTeam === s ? `${(s === "A" ? teamA : teamB).color.secondary}20` : "rgba(255,255,255,0.03)", color: activeTeam === s ? (s === "A" ? teamA : teamB).color.secondary : "rgba(255,255,255,0.28)", fontSize: 11, fontWeight: 700 }}>{(s === "A" ? teamA : teamB).name}</button>))}</div>)}
              <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.22)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.9, marginBottom: 5 }}>{team.players.length ? t("drag_hint") : t("no_squad_hint")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {team.players.map((p) => (<PlayerCard key={p.id} player={p} compact isOnField={onFieldIds.has(p.id)} teamColor={tc} isCaptain={team.captain === p.id} onEdit={(pl) => { setEP(pl); setSP(true); }} onDelete={deletePlayer} />))}
              </div>
            </div>
          </div>
        ) : (
          /* PLAYERS TAB */
          <div style={{ animation: "fadeIn 0.25s", padding: "11px 13px" }}>
            <div style={{ display: "flex", gap: 7, marginBottom: 11 }}>
              <input style={{ ...S.input, flex: 1 }} placeholder={t("search_player")} value={search} onChange={(e) => setSearch(e.target.value)} />
              <button onClick={() => { setEP(null); setSP(true); }} style={{ ...S.btn, width: "auto", padding: "10px 13px", borderRadius: 8, background: `linear-gradient(135deg,${team.color.primary},${team.color.secondary})` }}><I.Plus /></button>
            </div>
            <button onClick={async () => { showInterstitial(); setSC(true); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(251,191,36,0.06)", borderRadius: 10, marginBottom: 10, border: "1px solid rgba(251,191,36,0.15)", cursor: "pointer", width: "100%" }}>
              <div style={{ fontSize: 16 }}>👑</div>
              <div style={{ flex: 1, textAlign: "left" }}><div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24" }}>{t("captain")}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{team.captain ? (() => { const cp = team.players.find((p) => p.id === team.captain); return cp ? `${cp.name} ${cp.surname}` : t("captain_none"); })() : t("captain_none")}</div></div>
              <div style={{ color: "rgba(251,191,36,0.5)", transform: "rotate(-90deg)" }}><I.Chevron /></div>
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}><span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>{t("players_count", {n: filtered.length})}</span><span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>{t("on_field", {n: onFieldIds.size})}</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {filtered.map((p) => (<PlayerCard key={p.id} player={p} isOnField={onFieldIds.has(p.id)} teamColor={tc} isCaptain={team.captain === p.id} onToggleCaptain={(id) => toggleCaptain(activeTeam, id)} onEdit={(pl) => { setEP(pl); setSP(true); }} onDelete={deletePlayer} />))}
              {filtered.length === 0 && (<div style={{ textAlign: "center", padding: 38, color: "rgba(255,255,255,0.18)" }}><div style={{ fontSize: 30, marginBottom: 7 }}>⚽</div><div style={{ fontSize: 13, marginBottom: 11 }}>{t("no_player_found")}</div><button onClick={() => { setSearch(""); setEP(null); setSP(true); }} style={{ ...S.btn, width: "auto", padding: "7px 18px", fontSize: 12, display: "inline-flex", background: `linear-gradient(135deg,${team.color.primary},${team.color.secondary})` }}><I.Plus /> {t("add_player")}</button></div>)}
            </div>
            <div style={{ marginTop: 14 }}><TeamStatsCard team={team} accent={tc} /></div>
          </div>
        )}
      </div>

      {/* ★ TAB BAR — fixed bottom + safe-area-inset-bottom */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "rgba(7,10,15,0.96)", backdropFilter: "blur(16px)", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", zIndex: 50, paddingBottom: BOTTOM_SAFE }}>
        {[{ id: "field", icon: <I.Field />, label: t("tab_field") }, { id: "players", icon: <I.Users />, label: t("tab_squad") }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "9px 0 7px", border: "none", cursor: "pointer", background: "transparent", color: tab === t.id ? tc : "rgba(255,255,255,0.28)", fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{t.icon}{t.label}</button>
        ))}
      </div>

      {/* MODALS */}
      <Modal open={showPlayer} onClose={() => { setSP(false); setEP(null); }} title={editPlayer ? t("edit_player") : t("new_player")}><PlayerForm player={editPlayer} onSave={savePlayer} onCancel={() => { setSP(false); setEP(null); }} accent={tc} /></Modal>
      <Modal open={showCaptain} onClose={() => setSC(false)} title={t("captain_select")}><CaptainSelector team={team} accent={tc} onSelect={(id) => { toggleCaptain(activeTeam, id); if (id) { setSC(false); toast_(t("t_captain_set")); } else { toast_(t("t_captain_removed")); } }} /></Modal>
      <Modal open={!!quickSelect} onClose={() => setQS(null)} title={t("select")}>{quickSelect && (<QuickSelect role={quickSelect.role} players={(quickSelect.side === "A" ? teamA : teamB).players} teamColor={(quickSelect.side === "A" ? teamA : teamB).color.secondary} onFieldIds={new Set((quickSelect.side === "A" ? teamA : teamB).fieldPlayers.filter(Boolean))} onSelect={(id) => { placePlayer(quickSelect.side, quickSelect.idx, id); setQS(null); }} />)}</Modal>
      <Modal open={!!showSettings} onClose={() => setSS(null)} title={t("team_settings")}>
        {showSettings && (() => { const tm = showSettings === "A" ? teamA : teamB; const setter = showSettings === "A" ? setTeamA : setTeamB; return (
          <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            {isMatch && (<div style={{ display: "flex", gap: 5 }}>{["A", "B"].map((s) => { const t = s === "A" ? teamA : teamB; return (<button key={s} onClick={() => setSS(s)} style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", cursor: "pointer", background: showSettings === s ? `${t.color.secondary}20` : "transparent", color: showSettings === s ? t.color.secondary : "rgba(255,255,255,0.38)", fontWeight: 600, fontSize: 12, borderBottom: showSettings === s ? `2px solid ${t.color.secondary}` : "none" }}>{t.name}</button>); })}</div>)}
            <div><label style={S.label}>{t("team_name")}</label><input style={S.input} value={tm.name} onChange={(e) => setter((t) => ({ ...t, name: e.target.value }))} /></div>
            <div><label style={S.label}>{t("team_color")}</label><ColorPicker value={tm.color} onChange={(c) => setter((t) => ({ ...t, color: c }))} /></div>
            <button onClick={() => setSS(null)} style={{ ...S.btn, background: `linear-gradient(135deg,${tm.color.primary},${tm.color.secondary})` }}><I.Check /> {t("ok")}</button>
          </div>
        ); })()}
      </Modal>

      <MatchResultModal open={showResult} onClose={() => setSR(false)} teamA={teamA} teamB={teamB} />
      <Toast message={toast.msg} show={toast.show} />
    </div>
  );
}