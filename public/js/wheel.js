// Desenho da mandala do mapa em SVG, com cores em atributos
// (para o mesmo SVG funcionar na tela e dentro do PDF).
import { SIGNS } from './astro.js';
import { GLYPH_FONT_B64 } from './glyphfont.js';

const THEMES = {
  night: {
    bg: 'none', line: '#C9A866', faint: 'rgba(201,168,102,0.28)', text: '#F2E9D8', muted: 'rgba(242,233,216,0.55)',
    band: 'rgba(201,168,102,0.07)', planet: '#F2E9D8', soft: '#8DB8A4', hard: '#E0898B', axis: '#F2E9D8',
    elements: { Fogo: '#E0898B', Terra: '#B9C47E', Ar: '#9DB7E0', Água: '#8DB8A4' },
  },
  paper: {
    bg: 'none', line: '#1F2550', faint: 'rgba(31,37,80,0.22)', text: '#1F2550', muted: 'rgba(31,37,80,0.6)',
    band: 'rgba(31,37,80,0.04)', planet: '#1F2550', soft: '#3E7D63', hard: '#B04A4F', axis: '#1F2550',
    elements: { Fogo: '#B04A4F', Terra: '#6E7A2E', Ar: '#3D5E9C', Água: '#3E7D63' },
  },
};

const D2R = Math.PI / 180;
const norm = (x) => ((x % 360) + 360) % 360;

export function drawWheel(chart, { theme = 'night', size = 600, showAspects = true, idPrefix = 'w' } = {}) {
  const t = THEMES[theme];
  const c = size / 2;
  const R = size / 2 - 6;
  const rZodOuter = R;
  const rZodInner = R * 0.84;
  const rHouseInner = R * 0.42;
  const rPlanet = R * 0.70;
  const rAspect = R * 0.40;
  const asc = chart.angles[0].lon;

  const ang = (lon) => (180 + (lon - asc)) * D2R;
  const pt = (lon, r) => [c + r * Math.cos(ang(lon)), c - r * Math.sin(ang(lon))];
  const f = (n) => n.toFixed(2);
  const out = [];

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Mandala do mapa astral" class="wheel-svg">`);
  out.push(`<defs><style>@font-face{font-family:'AstroGlyphs';src:url(data:font/woff2;base64,${GLYPH_FONT_B64}) format('woff2');}
    .g{font-family:'AstroGlyphs','Noto Sans Symbols','Segoe UI Symbol',serif}
    .n{font-family:'Figtree',Arial,sans-serif}</style></defs>`);

  // Faixa do zodíaco
  out.push(`<g class="draw">`);
  out.push(`<circle cx="${c}" cy="${c}" r="${rZodOuter}" fill="${t.band}" stroke="${t.line}" stroke-width="1.4"/>`);
  out.push(`<circle cx="${c}" cy="${c}" r="${rZodInner}" fill="none" stroke="${t.line}" stroke-width="1"/>`);
  out.push(`<circle cx="${c}" cy="${c}" r="${rHouseInner}" fill="none" stroke="${t.line}" stroke-width="0.9"/>`);

  // Graduação em graus
  for (let d = 0; d < 360; d++) {
    const len = d % 10 === 0 ? 0.035 : d % 5 === 0 ? 0.022 : 0.012;
    const [x1, y1] = pt(d, rZodInner);
    const [x2, y2] = pt(d, rZodInner + R * len);
    out.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${t.faint}" stroke-width="${d % 30 === 0 ? 1.2 : 0.7}"/>`);
  }

  // Divisões e símbolos dos signos
  SIGNS.forEach((s, i) => {
    const start = i * 30;
    const [x1, y1] = pt(start, rZodInner);
    const [x2, y2] = pt(start, rZodOuter);
    out.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${t.line}" stroke-width="1"/>`);
    const [gx, gy] = pt(start + 15, (rZodInner + rZodOuter) / 2 + R * 0.012);
    out.push(`<text x="${f(gx)}" y="${f(gy)}" class="g" font-size="${f(R * 0.085)}" fill="${t.elements[s.element]}" text-anchor="middle" dominant-baseline="central">${s.glyph}&#xFE0E;</text>`);
  });
  out.push(`</g>`);

  // Casas
  const cusps = chart.cusps;
  for (let h = 1; h <= 12; h++) {
    const isAxis = h === 1 || h === 4 || h === 7 || h === 10;
    const [x1, y1] = pt(cusps[h], rHouseInner);
    const [x2, y2] = pt(cusps[h], isAxis ? rZodOuter + R * 0.0 : rZodInner);
    out.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${isAxis ? t.axis : t.faint}" stroke-width="${isAxis ? 1.6 : 0.9}"/>`);
    const next = cusps[h === 12 ? 1 : h + 1];
    const mid = cusps[h] + norm(next - cusps[h]) / 2;
    const [nx, ny] = pt(mid, rHouseInner + R * 0.045);
    out.push(`<text x="${f(nx)}" y="${f(ny)}" class="n" font-size="${f(R * 0.042)}" fill="${t.muted}" text-anchor="middle" dominant-baseline="central">${h}</text>`);
  }

  // Rótulos AC / MC
  for (const a of chart.angles) {
    const [x, y] = pt(a.lon, rZodOuter + R * 0.0);
    const [lx, ly] = pt(a.lon + (a.key === 'asc' ? 4 : -4), rZodInner - R * 0.05);
    void x; void y;
    out.push(`<text x="${f(lx)}" y="${f(ly)}" class="n" font-size="${f(R * 0.04)}" font-weight="600" fill="${t.axis}" text-anchor="middle" dominant-baseline="central">${a.key === 'asc' ? 'AC' : 'MC'}</text>`);
  }

  // Aspectos
  if (showAspects) {
    const byKey = Object.fromEntries([...chart.points, ...chart.angles].map((p) => [p.key, p]));
    for (const a of chart.aspects) {
      if (a.angle === 0) continue;
      const p1 = byKey[a.a], p2 = byKey[a.b];
      const [x1, y1] = pt(p1.lon, rAspect);
      const [x2, y2] = pt(p2.lon, rAspect);
      const color = a.kind === 'soft' ? t.soft : t.hard;
      const op = Math.max(0.35, 1 - a.orb / 9);
      out.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${color}" stroke-opacity="${op.toFixed(2)}" stroke-width="${a.angle === 90 || a.angle === 180 ? 1.3 : 1}"${a.angle === 60 ? ' stroke-dasharray="4 3"' : ''}/>`);
    }
  }

  // Planetas, afastando os símbolos que ficariam sobrepostos
  const placed = chart.points.map((p) => ({ p, disp: p.lon })).sort((a, b) => a.p.lon - b.p.lon);
  const minSep = 8.5;
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      const a = placed[i], b = placed[(i + 1) % placed.length];
      const gap = norm(b.disp - a.disp);
      if (gap < minSep && placed.length > 1) {
        const push = (minSep - gap) / 2;
        a.disp = norm(a.disp - push);
        b.disp = norm(b.disp + push);
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (const { p, disp } of placed) {
    const [tx1, ty1] = pt(p.lon, rZodInner);
    const [tx2, ty2] = pt(p.lon, rZodInner - R * 0.035);
    out.push(`<line x1="${f(tx1)}" y1="${f(ty1)}" x2="${f(tx2)}" y2="${f(ty2)}" stroke="${t.planet}" stroke-width="1.4"/>`);
    const [gx, gy] = pt(disp, rPlanet);
    const [ex, ey] = pt(disp, rPlanet - R * 0.045);
    const [ax, ay] = pt(p.lon, rAspect);
    out.push(`<circle cx="${f(ax)}" cy="${f(ay)}" r="${f(R * 0.008)}" fill="${t.planet}"/>`);
    out.push(`<line x1="${f(tx2)}" y1="${f(ty2)}" x2="${f(ex)}" y2="${f(ey)}" stroke="${t.faint}" stroke-width="0.7"/>`);
    out.push(`<g class="planet" data-key="${p.key}"><title>${p.name}: ${p.label}${p.retro ? ' (retrógrado)' : ''}</title>`);
    if (p.key === 'sun') {
      // O símbolo do Sol é desenhado para não depender de fonte
      out.push(`<circle cx="${f(gx)}" cy="${f(gy)}" r="${f(R * 0.03)}" fill="none" stroke="${t.planet}" stroke-width="1.6"/><circle cx="${f(gx)}" cy="${f(gy)}" r="${f(R * 0.007)}" fill="${t.planet}"/>`);
    } else {
      out.push(`<text x="${f(gx)}" y="${f(gy)}" class="g" font-size="${f(R * 0.072)}" fill="${t.planet}" text-anchor="middle" dominant-baseline="central">${p.glyph}&#xFE0E;</text>`);
    }
    const [dx, dy] = pt(disp, rPlanet - R * 0.085);
    out.push(`<text x="${f(dx)}" y="${f(dy)}" class="n" font-size="${f(R * 0.032)}" fill="${t.muted}" text-anchor="middle" dominant-baseline="central">${p.deg}°${p.retro ? 'ʀ' : ''}</text>`);
    out.push(`</g>`);
  }

  out.push(`</svg>`);
  return out.join('');
}

// Converte o SVG em imagem PNG (usado no PDF, onde a fonte precisa estar embutida).
export async function svgToPng(svgString, px = 1400) {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = px; canvas.height = px;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, px, px);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
