// ─────────────────────────────────────────────────────────────
// HalıSaha-Kolik · SpiderChart (Radar Chart)
// Pure SVG — hiçbir dependency yok. 6 attribute için optimize.
//
// ★ YENİLİKLER:
//   - Drag desteği: Köşeleri sürükleyerek değer değiştir (touch + mouse)
//   - Label çakışma fix: yan/diyagonal köşelerde label pozisyonu ince ayar
//   - Hover dot büyür, drag esnasında highlight
//   - "Live mode": editable iken parent'a sürekli haber verir,
//     bu sayede rating slider canlı senkron olur
//   - Sıfırla butonu: SVG içinde foreignObject ile sol-alt köşeye sabitlendi.
//     overflow:visible olan SVG'de dış div'e absolute koymak güvenilmez;
//     foreignObject viewBox koordinatlarına göre çalışır, hiçbir öğeyle çakışmaz.
// ─────────────────────────────────────────────────────────────
import React, { useRef, useState, useCallback, useEffect } from "react";
import { t } from "./i18n";



// ─── SpiderChart ─────────────────────────────────────────────
// attributes: { pas: 80, sut: 75, ... }  -- 0-99 arası
// keys:       ["pas","sut","hiz","dribbling","defans","fizik"]  -- sıra önemli
// accent:     "#34d399"  -- ana renk
// size:       SVG genişliği (kare). default 240
// editable:   true ise sürükleme + +/- butonları açılır
// onChange:   (key, newVal) => void  -- editable=true iken
// onReset:    () => void -- Sıfırlama işlemi için parent fonksiyonu
// minValue:   editable iken alt sınır (default 30)
// maxValue:   üst sınır (default 99)
export default function SpiderChart({
  attributes,
  keys,
  accent = "#34d399",
  size = 240,
  editable = false,
  onChange,
  onReset,
  showValues = true,
  minValue = 30,
  maxValue = 99,
}) {
  const svgRef = useRef(null);
  const [dragKey, setDragKey] = useState(null); // hangi köşe sürükleniyor
  const [hoverKey, setHoverKey] = useState(null);

  // ★ Hook'lar koşulsuz çalışmalı — boş veri durumunda fallback değerler kullanıyoruz.
  const safeKeys = keys && keys.length > 0 ? keys : [];
  const N = safeKeys.length || 1;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.34;               // ★ veri alanı yarıçapı
  const labelRadius = radius + size * 0.13; // ★ label outer
  const valueOffset = size * 0.055;         // ★ label altındaki sayının dikey offset'i
  const btnRadius = radius + size * 0.24;   // edit butonları daha dışta
  const hitRadius = size * 0.1;             // ★ Sürükleme için touch hit alanı

  // ═══ DRAG HANDLING ═══
  const projectPointerToValue = useCallback(
    (clientX, clientY, keyIndex) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const localX = ((clientX - rect.left) / rect.width) * size;
      const localY = ((clientY - rect.top) / rect.height) * size;

      const angle = (Math.PI * 2 * keyIndex) / N - Math.PI / 2;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);

      const px = localX - cx;
      const py = localY - cy;

      // Eksen üstüne projeksiyon
      const proj = px * ux + py * uy;

      let v = (proj / radius) * maxValue;
      v = Math.max(minValue, Math.min(maxValue, Math.round(v)));
      return v;
    },
    [N, cx, cy, radius, maxValue, minValue, size]
  );

  // Drag aktifken global mouse/touch listener
  useEffect(() => {
    if (!editable || dragKey == null) return;
    const keyIndex = safeKeys.indexOf(dragKey);
    if (keyIndex < 0) return;
    if (!attributes) return;

    const onMove = (e) => {
      const point = e.touches?.[0] || e;
      if (e.touches && e.cancelable) e.preventDefault();
      const v = projectPointerToValue(point.clientX, point.clientY, keyIndex);
      if (v != null && v !== attributes[dragKey]) {
        onChange?.(dragKey, v);
      }
    };
    const onUp = () => setDragKey(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      window.removeEventListener("touchcancel", onUp);
    };
  }, [dragKey, editable, safeKeys, attributes, projectPointerToValue, onChange]);

  if (!attributes || !keys || keys.length === 0) return null;

  const pointAt = (i, r) => {
    const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  };

  const gridLayers = [0.33, 0.66, 1.0].map((scale) => {
    const pts = keys.map((_, i) => pointAt(i, radius * scale));
    return pts.map((p) => `${p.x},${p.y}`).join(" ");
  });

  const axes = keys.map((_, i) => pointAt(i, radius));

  const dataPts = keys.map((k, i) => {
    const v = Math.max(0, Math.min(maxValue, attributes[k] || 0));
    const r = (v / maxValue) * radius;
    return pointAt(i, r);
  });
  const dataPath = dataPts.map((p) => `${p.x},${p.y}`).join(" ");

  const labelInfo = keys.map((_, i) => {
    const lp = pointAt(i, labelRadius);
    const dx = lp.x - cx;
    const dy = lp.y - cy;
    let anchor = "middle";
    if (Math.abs(dx) > 6) anchor = dx > 0 ? "start" : "end";
    const yShift = dy < -2 ? -3 : dy > 2 ? 3 : 0;
    return { x: lp.x, y: lp.y + yShift, anchor };
  });

  const startDrag = (k) => (e) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    setDragKey(k);
  };

  // SVG overflow:visible olduğundan label'lar ve +/- butonları dışa taşıyor.
  // Taşma miktarını padding olarak dış container'a ekliyoruz; böylece
  // container'ın gerçek boyutu görsel alanı tam olarak kapsar.
  // btnRadius = size*0.58 → en uzak nokta merkezden size*0.58 uzakta.
  // Buton dairesi r=9.5, metin offset +18 → toplam ~size*0.58+28 px merkezden.
  // Merkez = padding + size/2, yani taşma = size*0.58+28 - size/2 ≈ size*0.08+28.
  const overflow = Math.ceil(size * 0.08 + 30); // her kenarda güvenli pay

  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        // padding, taşan SVG içeriğini tam olarak sarar
        padding: overflow,
        // box-sizing:content-box olduğundan toplam genişlik = 2*overflow + size
        boxSizing: "content-box",
      }}
    >
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: "visible", touchAction: editable ? "none" : "auto", display: "block" }}
      >
        {/* Grid backgrounds */}
        {gridLayers.map((pts, i) => (
          <polygon
            key={i}
            points={pts}
            fill={i === 2 ? `${accent}06` : "transparent"}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={i === 2 ? 1 : 0.7}
            strokeDasharray={i === 2 ? "0" : "3 3"}
          />
        ))}

        {/* Eksen çizgileri */}
        {axes.map((p, i) => (
          <line
            key={`ax-${i}`}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={0.6}
          />
        ))}

        {/* Veri alanı */}
        <polygon
          points={dataPath}
          fill={`${accent}33`}
          stroke={accent}
          strokeWidth={2}
          strokeLinejoin="round"
          style={{ transition: dragKey ? "none" : "all 0.18s ease-out" }}
        />

        {/* Veri noktaları */}
        {dataPts.map((p, i) => {
          const k = keys[i];
          const isActive = dragKey === k || hoverKey === k;
          return (
            <circle
              key={`pt-${i}`}
              cx={p.x}
              cy={p.y}
              r={isActive ? 5.5 : 3.5}
              fill={accent}
              stroke="#0c1117"
              strokeWidth={isActive ? 2 : 1.5}
              style={{
                transition: dragKey ? "none" : "r 0.15s ease-out",
                filter: isActive ? `drop-shadow(0 0 6px ${accent})` : "none",
              }}
            />
          );
        })}

        {/* Köşe etiketleri */}
        {keys.map((k, i) => {
          const lp = labelInfo[i];
          const v = attributes[k] || 0;
          const isActive = dragKey === k || hoverKey === k;
          return (
            <g key={`lb-${i}`}>
              <text
                x={lp.x}
                y={lp.y}
                fill={isActive ? accent : "rgba(255,255,255,0.65)"}
                fontSize={10}
                fontWeight={700}
                textAnchor={lp.anchor}
                dominantBaseline="middle"
                style={{
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                  fontFamily: "'DM Sans',sans-serif",
                  transition: "fill 0.15s",
                  pointerEvents: "none",
                }}
              >
                {t(`attr_${k}`)}
              </text>
              {showValues && (
                <text
                  x={lp.x}
                  y={lp.y + valueOffset}
                  fill={accent}
                  fontSize={isActive ? 12.5 : 11}
                  fontWeight={800}
                  textAnchor={lp.anchor}
                  dominantBaseline="middle"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    transition: dragKey ? "none" : "font-size 0.15s",
                    pointerEvents: "none",
                  }}
                >
                  {v}
                </text>
              )}
            </g>
          );
        })}

        {/* DRAG HIT AREA */}
        {editable &&
          dataPts.map((p, i) => {
            const k = keys[i];
            return (
              <circle
                key={`hit-${i}`}
                cx={p.x}
                cy={p.y}
                r={hitRadius}
                fill="transparent"
                style={{ cursor: dragKey ? "grabbing" : "grab" }}
                onMouseDown={startDrag(k)}
                onTouchStart={startDrag(k)}
                onMouseEnter={() => setHoverKey(k)}
                onMouseLeave={() => setHoverKey(null)}
              />
            );
          })}

        {/* Editable: köşelere + / - */}
        {editable &&
          keys.map((k, i) => {
            const v = attributes[k] || 0;
            const bp = pointAt(i, btnRadius);
            const dec = (e) => {
              e.stopPropagation();
              onChange?.(k, Math.max(minValue, v - 1));
            };
            const inc = (e) => {
              e.stopPropagation();
              onChange?.(k, Math.min(maxValue, v + 1));
            };
            return (
              <g key={`bt-${i}`}>
                <circle
                  cx={bp.x - 11}
                  cy={bp.y + 18}
                  r={9.5}
                  fill="rgba(255,255,255,0.06)"
                  stroke="rgba(255,255,255,0.14)"
                  strokeWidth={1}
                  style={{ cursor: "pointer" }}
                  onClick={dec}
                />
                <text
                  x={bp.x - 11}
                  y={bp.y + 18}
                  fill="#e2e8f0"
                  fontSize={13}
                  fontWeight={700}
                  textAnchor="middle"
                  dominantBaseline="central"
                  pointerEvents="none"
                >
                  −
                </text>

                <circle
                  cx={bp.x + 11}
                  cy={bp.y + 18}
                  r={9.5}
                  fill={`${accent}22`}
                  stroke={`${accent}77`}
                  strokeWidth={1}
                  style={{ cursor: "pointer" }}
                  onClick={inc}
                />
                <text
                  x={bp.x + 11}
                  y={bp.y + 18}
                  fill={accent}
                  fontSize={13}
                  fontWeight={700}
                  textAnchor="middle"
                  dominantBaseline="central"
                  pointerEvents="none"
                >
                  +
                </text>
              </g>
            );
          })}

      </svg>

      {/* SIFIRLA BUTONU
          Dış container padding ile SVG'nin görsel taşmasını tam olarak sardığından
          position:absolute + bottom/left:0 artık güvenilir şekilde sol-alt köşeye denk gelir.
          SVG içeriğiyle kesinlikle çakışmaz. */}
      {editable && onReset && (
        <button
          onClick={onReset}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            background: "transparent",
            color: "rgba(255,255,255,0.65)",
            border: "1px solid rgba(255,255,255,0.14)",
            padding: "4px 8px",
            fontSize: "11px",
            fontWeight: 600,
            borderRadius: "6px",
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
            textTransform: "uppercase",
            transition: "color 0.2s ease, border-color 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#ef4444";
            e.currentTarget.style.borderColor = "#ef4444";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "rgba(255,255,255,0.65)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)";
          }}
        >
          Sıfırla
        </button>
      )}
    </div>
  );
}