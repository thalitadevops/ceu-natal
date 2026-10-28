// Cálculo do mapa natal (zodíaco tropical, casas Placidus).
// Funciona no navegador e no Node: recebe a biblioteca astronomy-engine como parâmetro.

export const SIGNS = [
  { name: 'Áries', glyph: '♈', element: 'Fogo', mode: 'Cardinal' },
  { name: 'Touro', glyph: '♉', element: 'Terra', mode: 'Fixo' },
  { name: 'Gêmeos', glyph: '♊', element: 'Ar', mode: 'Mutável' },
  { name: 'Câncer', glyph: '♋', element: 'Água', mode: 'Cardinal' },
  { name: 'Leão', glyph: '♌', element: 'Fogo', mode: 'Fixo' },
  { name: 'Virgem', glyph: '♍', element: 'Terra', mode: 'Mutável' },
  { name: 'Libra', glyph: '♎', element: 'Ar', mode: 'Cardinal' },
  { name: 'Escorpião', glyph: '♏', element: 'Água', mode: 'Fixo' },
  { name: 'Sagitário', glyph: '♐', element: 'Fogo', mode: 'Mutável' },
  { name: 'Capricórnio', glyph: '♑', element: 'Terra', mode: 'Cardinal' },
  { name: 'Aquário', glyph: '♒', element: 'Ar', mode: 'Fixo' },
  { name: 'Peixes', glyph: '♓', element: 'Água', mode: 'Mutável' },
];

export const POINTS = [
  { key: 'sun', name: 'Sol', glyph: '☉', body: 'Sun' },
  { key: 'moon', name: 'Lua', glyph: '☽', body: 'Moon' },
  { key: 'mercury', name: 'Mercúrio', glyph: '☿', body: 'Mercury' },
  { key: 'venus', name: 'Vênus', glyph: '♀', body: 'Venus' },
  { key: 'mars', name: 'Marte', glyph: '♂', body: 'Mars' },
  { key: 'jupiter', name: 'Júpiter', glyph: '♃', body: 'Jupiter' },
  { key: 'saturn', name: 'Saturno', glyph: '♄', body: 'Saturn' },
  { key: 'uranus', name: 'Urano', glyph: '♅', body: 'Uranus' },
  { key: 'neptune', name: 'Netuno', glyph: '♆', body: 'Neptune' },
  { key: 'pluto', name: 'Plutão', glyph: '♇', body: 'Pluto' },
  { key: 'node', name: 'Nodo Norte', glyph: '☊', body: null },
];

export const ASPECTS = [
  { name: 'Conjunção', angle: 0, orb: 8, glyph: '☌', kind: 'neutral' },
  { name: 'Oposição', angle: 180, orb: 8, glyph: '☍', kind: 'hard' },
  { name: 'Trígono', angle: 120, orb: 7, glyph: '△', kind: 'soft' },
  { name: 'Quadratura', angle: 90, orb: 7, glyph: '□', kind: 'hard' },
  { name: 'Sextil', angle: 60, orb: 5, glyph: '⚹', kind: 'soft' },
];

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const norm = (x) => ((x % 360) + 360) % 360;
const sind = (x) => Math.sin(x * D2R);
const cosd = (x) => Math.cos(x * D2R);
const tand = (x) => Math.tan(x * D2R);
const atan2d = (y, x) => Math.atan2(y, x) * R2D;

export function signOf(lon) {
  const l = norm(lon);
  const idx = Math.floor(l / 30);
  const within = l - idx * 30;
  const deg = Math.floor(within);
  const min = Math.floor((within - deg) * 60);
  return { index: idx, sign: SIGNS[idx], deg, min, label: `${deg}°${String(min).padStart(2, '0')}′ ${SIGNS[idx].name}` };
}

// Longitude eclíptica (de data) de um ponto do equador celeste com ascensão reta `ra`.
function eclipticFromRA(ra, eps) {
  return norm(atan2d(sind(ra), cosd(ra) * cosd(eps)));
}

function placidusCusps(ramc, lat, eps, asc, mc) {
  const cusps = new Array(13);
  cusps[1] = asc;
  cusps[10] = mc;
  cusps[4] = norm(mc + 180);
  cusps[7] = norm(asc + 180);

  // Casas acima do horizonte (11, 12): frações do semiarco diurno a partir do MC.
  // Casas abaixo (2, 3): frações do semiarco noturno a partir do IC.
  const solve = (f, upper) => {
    let lon = upper ? norm(mc + 90 * f) : norm(mc + 180 - 90 * f);
    for (let i = 0; i < 50; i++) {
      const dec = Math.asin(sind(eps) * sind(lon)) * R2D;
      const x = tand(lat) * tand(dec);
      if (Math.abs(x) >= 1) return null; // circumpolar: Placidus indefinido
      const ad = Math.asin(x) * R2D; // diferença ascensional
      const ra = upper ? ramc + f * (90 + ad) : ramc + 180 - f * (90 - ad);
      const next = eclipticFromRA(norm(ra), eps);
      if (Math.abs(norm(next - lon + 180) - 180) < 1e-7) { lon = next; break; }
      lon = next;
    }
    return lon;
  };

  const c11 = solve(1 / 3, true);
  const c12 = solve(2 / 3, true);
  const c3 = solve(1 / 3, false);
  const c2 = solve(2 / 3, false);

  if ([c11, c12, c2, c3].some((c) => c === null)) return null;
  cusps[11] = c11; cusps[12] = c12; cusps[2] = c2; cusps[3] = c3;
  cusps[5] = norm(c11 + 180); cusps[6] = norm(c12 + 180);
  cusps[8] = norm(c2 + 180); cusps[9] = norm(c3 + 180);
  return cusps;
}

function porphyryCusps(asc, mc) {
  const cusps = new Array(13);
  const q1 = norm(mc - asc + 360) % 360; // não usado diretamente
  const arcAscToIc = norm(mc + 180 - asc); // casa 1 → 4
  const arcIcToDsc = norm(asc + 180 - (mc + 180)); // casa 4 → 7
  cusps[1] = asc;
  cusps[2] = norm(asc + arcAscToIc / 3);
  cusps[3] = norm(asc + (2 * arcAscToIc) / 3);
  cusps[4] = norm(mc + 180);
  cusps[5] = norm(mc + 180 + arcIcToDsc / 3);
  cusps[6] = norm(mc + 180 + (2 * arcIcToDsc) / 3);
  for (let h = 7; h <= 12; h++) cusps[h] = norm(cusps[h - 6] + 180);
  void q1;
  return cusps;
}

export function houseOf(lon, cusps) {
  for (let h = 1; h <= 12; h++) {
    const start = cusps[h];
    const end = cusps[h === 12 ? 1 : h + 1];
    const span = norm(end - start);
    if (norm(lon - start) < span) return h;
  }
  return 1;
}

function meanNode(jdTT) {
  const T = (jdTT - 2451545.0) / 36525;
  return norm(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T * T * T * T) / 60616000);
}

function bodyLongitude(A, body, time) {
  if (body === 'Sun') return A.SunPosition(time).elon;
  if (body === 'Moon') return A.EclipticGeoMoon(time).lon;
  const vec = A.GeoVector(body, time, true);
  return A.Ecliptic(vec).elon;
}

/**
 * @param A biblioteca astronomy-engine
 * @param {{ date: Date, lat: number, lon: number }} input  date em UTC
 */
export function computeChart(A, { date, lat, lon }) {
  const time = A.MakeTime(date);
  const later = A.MakeTime(new Date(date.getTime() + 86400000));
  const eps = A.e_tilt(time).tobl; // obliquidade verdadeira

  const points = POINTS.map((p) => {
    let L, L2;
    if (p.key === 'node') {
      L = meanNode(time.tt + 2451545.0);
      L2 = meanNode(later.tt + 2451545.0);
    } else {
      L = norm(bodyLongitude(A, p.body, time));
      L2 = norm(bodyLongitude(A, p.body, later));
    }
    const speed = norm(L2 - L + 180) - 180;
    return { key: p.key, lon: L, retro: p.key !== 'node' && speed < 0 };
  });

  const gast = A.SiderealTime(time); // horas
  const ramc = norm(gast * 15 + lon);
  const mc = norm(atan2d(sind(ramc), cosd(ramc) * cosd(eps)));
  const asc = norm(atan2d(cosd(ramc), -(sind(ramc) * cosd(eps) + tand(lat) * sind(eps))));

  let houseSystem = 'Placidus';
  let cusps = Math.abs(lat) < 66 ? placidusCusps(ramc, lat, eps, asc, mc) : null;
  if (!cusps) { cusps = porphyryCusps(asc, mc); houseSystem = 'Porfírio'; }
  return assembleChart({ points: points.map(({ key, lon, retro }) => ({ key, lon, retro })), asc, mc, cusps, houseSystem });
}

// Monta o mapa completo (signos, casas, aspectos, elementos) a partir das longitudes.
// Usado no navegador e no servidor (que recebe só os números e não precisa de efemérides).
export function assembleChart({ points: raw, asc, mc, cusps, houseSystem }) {
  const points = POINTS.map((def) => {
    const r = raw.find((x) => x.key === def.key);
    return { ...def, lon: norm(r.lon), retro: !!r.retro && def.key !== 'node', ...signOf(r.lon) };
  });
  for (const p of points) p.house = houseOf(p.lon, cusps);

  const angles = [
    { key: 'asc', name: 'Ascendente', glyph: 'AC', lon: asc, ...signOf(asc) },
    { key: 'mc', name: 'Meio do Céu', glyph: 'MC', lon: mc, ...signOf(mc) },
  ];

  // Aspectos entre planetas e ângulos (o nodo entra só com conjunções).
  const aspectables = [...points, ...angles];
  const aspects = [];
  for (let i = 0; i < aspectables.length; i++) {
    for (let j = i + 1; j < aspectables.length; j++) {
      const a = aspectables[i], b = aspectables[j];
      if (a.key === 'asc' && b.key === 'mc') continue;
      const diff = Math.abs(norm(a.lon - b.lon + 180) - 180);
      for (const asp of ASPECTS) {
        if ((a.key === 'node' || b.key === 'node') && asp.angle !== 0) continue;
        const lum = ['sun', 'moon'].includes(a.key) || ['sun', 'moon'].includes(b.key);
        const orb = asp.orb + (lum ? 2 : 0);
        const delta = Math.abs(diff - asp.angle);
        if (delta <= orb) {
          aspects.push({ a: a.key, b: b.key, aName: a.name, bName: b.name, type: asp.name, glyph: asp.glyph, kind: asp.kind, angle: asp.angle, orb: Number(delta.toFixed(2)) });
          break;
        }
      }
    }
  }
  aspects.sort((x, y) => x.orb - y.orb);

  // Equilíbrio de elementos e modalidades (planetas pessoais pesam mais).
  const weights = { sun: 3, moon: 3, mercury: 2, venus: 2, mars: 2, jupiter: 1, saturn: 1, uranus: 0.5, neptune: 0.5, pluto: 0.5 };
  const elements = { Fogo: 0, Terra: 0, Ar: 0, Água: 0 };
  const modes = { Cardinal: 0, Fixo: 0, Mutável: 0 };
  for (const p of points) {
    const w = weights[p.key];
    if (!w) continue;
    elements[p.sign.element] += w;
    modes[p.sign.mode] += w;
  }
  elements[signOf(asc).sign.element] += 2;
  modes[signOf(asc).sign.mode] += 2;

  return { points, angles, cusps, houseSystem, aspects, elements, modes };
}

// Resumo compacto enviado para a IA.
export function chartToText(chart, { timeUnknown = false } = {}) {
  const fmt = (p) => `${p.name}: ${p.label}${p.house && !timeUnknown ? `, casa ${p.house}` : ''}${p.retro ? ' (retrógrado)' : ''}`;
  const lines = [];
  lines.push('POSIÇÕES');
  if (!timeUnknown) for (const a of chart.angles) lines.push(fmt(a));
  for (const p of chart.points) lines.push(p.key === 'moon' && timeUnknown ? `${fmt(p)} (aproximada: hora de nascimento desconhecida)` : fmt(p));
  if (!timeUnknown) {
    lines.push('', `CÚSPIDES DAS CASAS (${chart.houseSystem})`);
    for (let h = 1; h <= 12; h++) lines.push(`Casa ${h}: ${signOf(chart.cusps[h]).label}`);
  }
  lines.push('', 'ASPECTOS (orbe em graus)');
  for (const a of chart.aspects) {
    if (timeUnknown && (['asc', 'mc'].includes(a.a) || ['asc', 'mc'].includes(a.b))) continue;
    lines.push(`${a.aName} ${a.type} ${a.bName} (orbe ${a.orb.toFixed(1)}°)`);
  }
  lines.push('', 'ELEMENTOS: ' + Object.entries(chart.elements).map(([k, v]) => `${k} ${v}`).join(', '));
  lines.push('MODALIDADES: ' + Object.entries(chart.modes).map(([k, v]) => `${k} ${v}`).join(', '));
  return lines.join('\n');
}


// Versão enxuta do mapa para enviar ao servidor.
export function chartPayload(chart) {
  return {
    points: chart.points.map(({ key, lon, retro }) => ({ key, lon: Number(lon.toFixed(4)), retro })),
    asc: Number(chart.angles[0].lon.toFixed(4)), mc: Number(chart.angles[1].lon.toFixed(4)),
    cusps: chart.cusps.slice(1).map((c) => Number(c.toFixed(4))), houseSystem: chart.houseSystem,
  };
}

// Valida e reconstrói o mapa recebido do navegador.
export function chartFromPayload(p) {
  const ok = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 360;
  if (!p || !Array.isArray(p.points) || !Array.isArray(p.cusps) || p.cusps.length !== 12) return null;
  if (!ok(p.asc) || !ok(p.mc) || !p.cusps.every(ok)) return null;
  for (const def of POINTS) {
    const r = p.points.find((x) => x && x.key === def.key);
    if (!r || !ok(r.lon)) return null;
  }
  const houseSystem = p.houseSystem === 'Porfírio' ? 'Porfírio' : 'Placidus';
  return assembleChart({ points: p.points, asc: p.asc, mc: p.mc, cusps: [null, ...p.cusps], houseSystem });
}
