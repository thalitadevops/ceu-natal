import { computeChart, chartPayload } from './astro.js';
import { drawWheel, svgToPng } from './wheel.js';

const A = window.Astronomy;
const { DateTime } = window.luxon;
const $ = (sel) => document.querySelector(sel);

const STORE_PENDING = 'ceunatal:pending';
const STORE_LAST = 'ceunatal:last';
const CONCURRENCY = 2; // partes escritas ao mesmo tempo (respeita limites da API)

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* armazenamento indisponível */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* idem */ } },
};

let siteConfig = { mode: 'demo', price: 29.9, parts: [] };
let current = null; // { birth, chart, paymentId, texts }

const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Céu de agora (hero) ----------
function renderLiveSky() {
  const chart = computeChart(A, { date: new Date(), lat: -23.55, lon: -46.63 });
  const el = $('#live-wheel');
  el.innerHTML = drawWheel(chart, { theme: 'night', size: 600 });
  el.querySelectorAll('.planet').forEach((g, i) => g.style.setProperty('--i', i));
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  const sun = chart.points[0], moon = chart.points[1];
  $('#live-caption').textContent = `O céu de agora, ${time} em São Paulo: Sol em ${sun.sign.name}, Lua em ${moon.sign.name}, Ascendente em ${chart.angles[0].sign.name}.`;
}

// ---------- Busca de cidade (Photon / OpenStreetMap) ----------
const placeInput = $('#f-place');
const placeList = $('#place-list');
const placeStatus = $('#place-status');
let chosenPlace = null;
let searchTimer = null;
let searchSeq = 0;
let activeIdx = -1;

const PLACE_TYPES = new Set(['city', 'town', 'village', 'hamlet', 'municipality', 'suburb', 'borough', 'locality', 'county']);

async function searchPlaces(q) {
  const seq = ++searchSeq;
  placeStatus.textContent = 'Buscando…';
  try {
    const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10&lang=default`);
    if (!r.ok) throw new Error('falha');
    const data = await r.json();
    if (seq !== searchSeq) return;
    const seen = new Set();
    const items = [];
    for (const f of data.features || []) {
      const p = f.properties || {};
      if (p.osm_key !== 'place' && p.osm_key !== 'boundary') continue;
      if (p.osm_key === 'place' && !PLACE_TYPES.has(p.osm_value)) continue;
      const label = p.name;
      const detail = [p.state, p.country].filter(Boolean).join(', ');
      const key = `${label}|${detail}`;
      if (!label || seen.has(key)) continue;
      seen.add(key);
      items.push({ label, detail, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] });
      if (items.length >= 6) break;
    }
    showPlaces(items);
    placeStatus.textContent = items.length ? '' : 'Nenhuma cidade encontrada. Tente o nome da cidade e o estado, ex.: Campinas SP.';
  } catch {
    if (seq !== searchSeq) return;
    showPlaces([]);
    placeStatus.textContent = 'Não foi possível buscar cidades agora. Verifique sua conexão e tente de novo.';
  }
}

function showPlaces(items) {
  placeList.innerHTML = '';
  activeIdx = -1;
  items.forEach((it, i) => {
    const li = document.createElement('li');
    li.id = `place-opt-${i}`;
    li.setAttribute('role', 'option');
    li.innerHTML = `${escapeHtml(it.label)}<small>${escapeHtml(it.detail)}</small>`;
    li.addEventListener('mousedown', (e) => { e.preventDefault(); pickPlace(it); });
    placeList.appendChild(li);
  });
  placeList._items = items;
  const open = items.length > 0;
  placeList.hidden = !open;
  placeInput.setAttribute('aria-expanded', String(open));
}

function pickPlace(it) {
  chosenPlace = it;
  placeInput.value = it.detail ? `${it.label}, ${it.detail}` : it.label;
  placeInput.removeAttribute('aria-invalid');
  showPlaces([]);
  placeStatus.textContent = '';
}

placeInput.addEventListener('input', () => {
  chosenPlace = null;
  clearTimeout(searchTimer);
  const q = placeInput.value.trim();
  if (q.length < 3) { showPlaces([]); placeStatus.textContent = ''; return; }
  searchTimer = setTimeout(() => searchPlaces(q), 350);
});
placeInput.addEventListener('keydown', (e) => {
  const items = placeList._items || [];
  if (!items.length || placeList.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    activeIdx = (activeIdx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    [...placeList.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === activeIdx)));
    placeInput.setAttribute('aria-activedescendant', `place-opt-${activeIdx}`);
  } else if (e.key === 'Enter' && activeIdx >= 0) {
    e.preventDefault(); pickPlace(items[activeIdx]);
  } else if (e.key === 'Escape') {
    showPlaces([]);
  }
});
placeInput.addEventListener('blur', () => setTimeout(() => showPlaces([]), 120));

// ---------- Horário desconhecido ----------
$('#f-notime').addEventListener('change', (e) => {
  const t = $('#f-time');
  t.disabled = e.target.checked;
  t.required = !e.target.checked;
  $('#notime-hint').hidden = !e.target.checked;
});

// ---------- Envio do formulário ----------
function formError(msg, field) {
  const el = $('#form-error');
  el.textContent = msg;
  el.hidden = !msg;
  if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
}

$('#birth-form').addEventListener('submit', (e) => {
  e.preventDefault();
  document.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
  formError('');
  const name = $('#f-name').value.trim();
  const date = $('#f-date').value;
  const timeUnknown = $('#f-notime').checked;
  const time = timeUnknown ? '12:00' : $('#f-time').value;

  if (!name) return formError('Escreva seu nome.', $('#f-name'));
  if (!date) return formError('Informe a data de nascimento.', $('#f-date'));
  if (!time) return formError('Informe o horário ou marque "Não sei meu horário".', $('#f-time'));
  if (!chosenPlace) return formError('Escolha a cidade na lista que aparece enquanto você digita.', placeInput);

  const birth = buildBirth({ name, date, time, timeUnknown, place: chosenPlace });
  if (!birth) return formError('Essa data ou horário não existe nesse fuso. Confira os dados.', $('#f-date'));
  showResult({ birth });
});

function buildBirth({ name, date, time, timeUnknown, place }) {
  const zone = window.tzlookup(place.lat, place.lon);
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const local = DateTime.fromObject({ year: y, month: m, day: d, hour: hh, minute: mm }, { zone });
  if (!local.isValid) return null;
  return {
    name, date, time, timeUnknown,
    place: place.detail ? `${place.label}, ${place.detail}` : place.label,
    lat: Number(place.lat.toFixed(4)), lon: Number(place.lon.toFixed(4)),
    zone, utc: local.toUTC().toISO({ suppressMilliseconds: true }), offset: local.toFormat('ZZ'),
  };
}

// ---------- Tela de resultado ----------
function showResult({ birth, paymentId = null, texts = null, autoRead = false }) {
  const chart = computeChart(A, { date: new Date(birth.utc), lat: birth.lat, lon: birth.lon });
  current = { birth, chart, paymentId, texts: texts || {} };

  $('#landing').hidden = true;
  $('#resultado').hidden = false;
  window.scrollTo({ top: 0 });

  const first = birth.name.split(/\s+/)[0];
  $('#res-title').textContent = `Mapa natal de ${first}`;
  const dateTxt = DateTime.fromISO(birth.date).setLocale('pt-BR').toFormat("d 'de' LLLL 'de' yyyy");
  $('#res-sub').textContent = `${dateTxt}, ${birth.timeUnknown ? 'horário desconhecido' : `às ${birth.time} (UTC${birth.offset})`}, ${birth.place}`;

  const wheel = $('#res-wheel');
  wheel.innerHTML = drawWheel(chart, { theme: 'night', size: 640, showAspects: true });

  renderPositions(chart, birth.timeUnknown);
  renderBalance(chart);
  renderAspects(chart, birth.timeUnknown);

  const hasReading = texts && Object.keys(texts).length;
  $('#btn-pdf').hidden = false;
  $('#unlock').hidden = !!(hasReading || autoRead);
  $('#reading').hidden = !(hasReading || autoRead);
  updateUnlockCopy();

  if (hasReading) renderSavedReading(texts);
  else if (autoRead) startReading();
  document.title = `Mapa natal de ${first} · Céu Natal`;
}

function renderPositions(chart, timeUnknown) {
  const rows = [];
  const glyph = (p) => (p.key === 'sun' ? '☉' : p.glyph);
  if (!timeUnknown) {
    for (const a of chart.angles) rows.push(`<tr class="angle"><td><span class="pg">${a.key === 'asc' ? 'AC' : 'MC'}</span>${a.name}</td><td>${a.label}</td><td>${a.key === 'asc' ? 1 : 10}</td></tr>`);
  }
  for (const p of chart.points) {
    rows.push(`<tr><td><span class="pg">${glyph(p)}&#xFE0E;</span>${p.name}</td><td>${p.label}${p.retro ? '<span class="retro" title="retrógrado">R</span>' : ''}</td><td>${timeUnknown ? '–' : p.house}</td></tr>`);
  }
  $('#positions tbody').innerHTML = rows.join('');
}

function renderBalance(chart) {
  const colors = { Fogo: 'var(--rose)', Terra: '#B9C47E', Ar: '#9DB7E0', Água: 'var(--sage)' };
  const total = Object.values(chart.elements).reduce((a, b) => a + b, 0);
  const rows = Object.entries(chart.elements).map(([k, v]) => {
    const pct = Math.round((v / total) * 100);
    return `<div class="bar"><span>${k}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${colors[k]}"></div></div><span>${pct}%</span></div>`;
  });
  $('#balance').innerHTML = `<h3>Equilíbrio dos elementos</h3>${rows.join('')}`;
}

function renderAspects(chart, timeUnknown) {
  const list = chart.aspects.filter((a) => !timeUnknown || (!['asc', 'mc'].includes(a.a) && !['asc', 'mc'].includes(a.b)));
  $('#aspect-count').textContent = `(${list.length})`;
  $('#aspects').innerHTML = list.map((a) => `<li><span>${a.aName} <span class="k-${a.kind}">${a.type.toLowerCase()}</span> ${a.bName}</span><small>orbe ${a.orb.toFixed(1)}°</small></li>`).join('');
}

function updateUnlockCopy() {
  const btn = $('#btn-unlock');
  const note = $('#unlock-note');
  if (siteConfig.mode === 'paid') {
    btn.textContent = `Desbloquear leitura completa por ${brl(siteConfig.price)}`;
    note.textContent = 'Pagamento único e seguro pelo Mercado Pago, com Pix ou cartão. A leitura aparece aqui assim que o pagamento é aprovado.';
  } else if (siteConfig.mode === 'free') {
    btn.textContent = 'Gerar leitura completa';
    note.textContent = '';
  } else {
    btn.textContent = 'Ver leitura de demonstração';
    note.textContent = 'Modo de demonstração: a chave da IA ainda não foi configurada no servidor.';
  }
}

$('#btn-new').addEventListener('click', () => {
  $('#resultado').hidden = true;
  $('#landing').hidden = false;
  history.replaceState(null, '', location.pathname);
  document.title = 'Céu Natal · Seu mapa astral com leitura completa';
  $('#fazer').scrollIntoView();
});

// ---------- Pagamento ----------
$('#btn-unlock').addEventListener('click', async () => {
  const btn = $('#btn-unlock');
  const err = $('#unlock-error');
  err.hidden = true;
  if (siteConfig.mode !== 'paid') { $('#unlock').hidden = true; $('#reading').hidden = false; startReading(); return; }
  btn.disabled = true;
  btn.textContent = 'Abrindo o pagamento…';
  try {
    const r = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ birth: current.birth }) });
    const data = await r.json();
    if (!r.ok || !data.url) throw new Error(data.error || 'Não foi possível abrir o pagamento.');
    store.set(STORE_PENDING, { birth: current.birth });
    location.href = data.url;
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
    btn.disabled = false;
    updateUnlockCopy();
  }
});

function handlePaymentReturn() {
  const params = new URLSearchParams(location.search);
  if (!params.get('retorno')) return false;
  const pending = store.get(STORE_PENDING);
  const paymentId = params.get('payment_id') || params.get('collection_id');
  const status = params.get('status') || params.get('collection_status');
  if (!pending) return false;

  if (status === 'approved' && paymentId) {
    showResult({ birth: pending.birth, paymentId, autoRead: true });
    return true;
  }
  showResult({ birth: pending.birth });
  const err = $('#unlock-error');
  if (status === 'pending' || status === 'in_process') {
    err.textContent = 'Seu pagamento está em processamento. Assim que ele for aprovado, clique em "Já paguei, verificar".';
    if (paymentId) addVerifyButton(paymentId);
  } else {
    err.textContent = 'O pagamento não foi concluído. Você pode tentar de novo quando quiser.';
  }
  err.hidden = false;
  return true;
}

function addVerifyButton(paymentId) {
  const b = document.createElement('button');
  b.className = 'btn btn-ghost';
  b.style.marginTop = '14px';
  b.textContent = 'Já paguei, verificar';
  b.addEventListener('click', () => {
    current.paymentId = paymentId;
    $('#unlock').hidden = true;
    $('#reading').hidden = false;
    startReading();
  });
  $('.unlock-card').appendChild(b);
}

// ---------- Leitura (texto chegando aos poucos) ----------
function mdToHtml(md) {
  const lines = escapeHtml(md).split('\n');
  const out = [];
  let para = [];
  let list = null;
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`); list = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) { flushPara(); flushList(); out.push(`<h4>${inline(h[1])}</h4>`); continue; }
    const li = line.match(/^[-•*]\s+(.*)$/) || line.match(/^\d+[.)]\s+(.*)$/);
    if (li) { flushPara(); (list ||= []).push(li[1]); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return out.join('');
}

function partEl(part) {
  let el = document.getElementById(`part-${part.id}`);
  if (!el) {
    el = document.createElement('article');
    el.className = 'part waiting';
    el.id = `part-${part.id}`;
    el.innerHTML = `<h3>${escapeHtml(part.title)}</h3><div class="part-body">Na fila…</div>`;
    $('#reading-parts').appendChild(el);
  }
  return el;
}

async function readPart(part) {
  const el = partEl(part);
  const body = el.querySelector('.part-body');
  el.className = 'part writing';
  body.textContent = '';
  let text = '';
  let raf = 0;
  const paint = () => { raf = 0; body.innerHTML = mdToHtml(text); };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birth: current.birth, chart: chartPayload(current.chart), part: part.id, paymentId: current.paymentId }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        const e = new Error(data.error || 'Não foi possível gerar esta parte.');
        e.status = r.status;
        throw e;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        if (!raf) raf = requestAnimationFrame(paint);
      }
      if (!text.trim()) throw new Error('A resposta veio vazia.');
      paint();
      el.className = 'part done';
      current.texts[part.id] = text;
      return true;
    } catch (e) {
      if (e.status === 402 || attempt === 1) {
        el.className = 'part failed';
        body.innerHTML = `<p>${escapeHtml(e.message)}</p>`;
        const retry = document.createElement('button');
        retry.className = 'btn btn-ghost retry';
        retry.textContent = 'Tentar esta parte de novo';
        retry.addEventListener('click', () => { retry.remove(); readPart(part).then(saveIfComplete); });
        body.appendChild(retry);
        return false;
      }
      text = '';
      body.textContent = 'Reconectando…';
      await new Promise((res) => setTimeout(res, 8000));
    }
  }
  return false;
}

async function startReading() {
  $('#reading-parts').innerHTML = '';
  const parts = siteConfig.parts;
  parts.forEach(partEl);
  $('#reading-status').textContent = 'Sua leitura está sendo escrita agora. Cada capítulo aparece aqui conforme fica pronto; isso leva de um a três minutos.';
  const queue = [...parts];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) await readPart(queue.shift());
  });
  await Promise.all(workers);
  saveIfComplete();
}

function saveIfComplete() {
  const done = siteConfig.parts.every((p) => current.texts[p.id]);
  $('#reading-status').textContent = done
    ? 'Leitura completa. Ela fica salva neste aparelho, e você pode baixar tudo em PDF.'
    : 'Algumas partes não foram geradas. Use o botão em cada uma para tentar de novo.';
  if (done) {
    store.set(STORE_LAST, { birth: current.birth, paymentId: current.paymentId, texts: current.texts });
    store.del(STORE_PENDING);
    history.replaceState(null, '', location.pathname);
  }
}

function renderSavedReading(texts) {
  $('#reading-parts').innerHTML = '';
  for (const part of siteConfig.parts) {
    const el = partEl(part);
    el.className = 'part done';
    el.querySelector('.part-body').innerHTML = mdToHtml(texts[part.id] || '');
  }
  $('#reading-status').textContent = 'Sua leitura salva neste aparelho.';
}

// ---------- PDF ----------
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Não foi possível carregar o gerador de PDF.'));
    document.head.appendChild(s);
  });
}

$('#btn-pdf').addEventListener('click', async () => {
  const btn = $('#btn-pdf');
  btn.disabled = true;
  btn.textContent = 'Gerando PDF…';
  try {
    await loadScript('vendor/html2pdf.bundle.min.js');
    await document.fonts.ready;
    const { birth, chart, texts } = current;
    const png = await svgToPng(drawWheel(chart, { theme: 'paper', size: 600 }), 1400);
    const first = birth.name.split(/\s+/)[0];
    const glyph = (p) => (p.key === 'sun' ? '☉' : p.glyph);
    const rows = [
      ...(birth.timeUnknown ? [] : chart.angles.map((a) => `<tr><td>${a.name}</td><td>${a.label}</td><td></td></tr>`)),
      ...chart.points.map((p) => `<tr><td><span class="pg">${glyph(p)}&#xFE0E;</span> ${p.name}</td><td>${p.label}${p.retro ? ' (R)' : ''}</td><td>${birth.timeUnknown ? '' : `casa ${p.house}`}</td></tr>`),
    ].join('');
    const reading = siteConfig.parts.filter((p) => texts[p.id]).map((p, i) => `
      ${i > 0 ? '<div class="page-break"></div>' : ''}
      <section class="pdf-section"><h2>${escapeHtml(p.title)}</h2>${mdToHtml(texts[p.id])}</section>`).join('');

    const doc = document.createElement('div');
    doc.className = 'pdf-doc';
    doc.innerHTML = `
      <div class="pdf-cover">
        <div class="brand-line">Céu Natal</div>
        <h1>Mapa natal de ${escapeHtml(first)}</h1>
        <p>${escapeHtml($('#res-sub').textContent)}</p>
        <img src="${png}" alt="">
      </div>
      <div class="page-break"></div>
      <section class="pdf-section">
        <h2>Posições do mapa</h2>
        <table class="pdf-table"><tbody>${rows}</tbody></table>
        ${chart.houseSystem ? `<p style="margin-top:10px;font-size:12px;color:#6A6E8F">Zodíaco tropical, casas ${chart.houseSystem}.</p>` : ''}
      </section>
      ${reading ? `<div class="page-break"></div>${reading}` : ''}
      <div class="pdf-foot">Leitura para autoconhecimento. Não substitui orientação médica, psicológica, jurídica ou financeira.</div>`;
    const root = $('#pdf-root');
    root.innerHTML = '';
    root.appendChild(doc);

    await window.html2pdf().set({
      margin: [12, 0, 12, 0],
      filename: `mapa-astral-${first.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, backgroundColor: '#FBF8F1', useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['h2', 'h4', 'p', 'li', 'tr', 'img'] },
    }).from(doc).save();
    root.innerHTML = '';
  } catch (e) {
    alert(e.message || 'Não foi possível gerar o PDF.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Baixar PDF';
  }
});

// ---------- Início ----------
async function init() {
  renderLiveSky();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const el = $('#live-wheel');
    el.classList.add('animate');
    setTimeout(() => el.classList.remove('animate'), 4000);
  }
  setInterval(renderLiveSky, 60000);

  try {
    const r = await fetch('/api/config');
    if (r.ok) siteConfig = await r.json();
  } catch { /* segue no modo demonstração */ }
  if (!siteConfig.parts?.length) {
    siteConfig.parts = [
      { id: 'essencia', title: 'Sua essência' }, { id: 'talentos', title: 'Mente, talentos e vocação' },
      { id: 'prosperidade', title: 'Dinheiro e prosperidade' }, { id: 'amor', title: 'Amor e relacionamentos' },
      { id: 'emocoes', title: 'Emoções e mundo interior' }, { id: 'proposito', title: 'Desafios, propósito e caminho' },
    ];
  }
  if (siteConfig.mode === 'paid') {
    $('#price').textContent = brl(siteConfig.price);
    $('#price-line').hidden = false;
  }

  if (handlePaymentReturn()) return;

  const saved = store.get(STORE_LAST);
  if (saved?.birth && saved?.texts) {
    $('#saved-banner').hidden = false;
    $('#open-saved').addEventListener('click', () => showResult(saved));
  }
}

init();
