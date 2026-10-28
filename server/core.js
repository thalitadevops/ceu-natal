// Lógica do servidor, escrita só com APIs padrão da web (fetch, Request, Response,
// crypto.subtle), para rodar igual na Cloudflare Pages, na Vercel e no servidor local.
import { chartFromPayload, chartToText } from '../public/js/astro.js';

export const PARTS = [
  {
    id: 'essencia',
    title: 'Sua essência',
    brief: 'Visão geral do mapa e da personalidade. Cubra: a combinação Sol, Lua e Ascendente e como elas conversam entre si; o equilíbrio de elementos e modalidades (o que sobra e o que falta); como a pessoa é vista pelos outros e como ela se sente por dentro.',
  },
  {
    id: 'talentos',
    title: 'Mente, talentos e vocação',
    brief: 'Cubra: Mercúrio (jeito de pensar, aprender e se comunicar); talentos naturais (Júpiter, casa 5, aspectos harmônicos, planetas fortes por signo); carreira e vocação (Meio do Céu, casa 10, casa 6, Saturno, regente do MC); áreas e ambientes de trabalho que combinam com a pessoa e o tipo de rotina em que ela rende melhor.',
  },
  {
    id: 'prosperidade',
    title: 'Dinheiro e prosperidade',
    brief: 'Cubra: a relação com dinheiro, segurança e valor próprio (casa 2 e seu regente, Vênus, Júpiter); dinheiro compartilhado, investimentos e heranças (casa 8); padrões que podem bloquear o crescimento financeiro (Saturno, Plutão, Netuno, quadraturas e oposições envolvendo casas 2, 8 ou 10); atitudes práticas que favorecem a prosperidade para este mapa. Não dê conselhos de investimento específicos.',
  },
  {
    id: 'amor',
    title: 'Amor e relacionamentos',
    brief: 'Cubra: como a pessoa ama e demonstra afeto (Vênus); desejo, conquista e atração (Marte); o que ela busca e atrai num parceiro (casa 7, Descendente e seu regente); romance e prazer (casa 5); padrões que se repetem nos relacionamentos e como lidar com eles.',
  },
  {
    id: 'emocoes',
    title: 'Emoções e mundo interior',
    brief: 'Cubra: necessidades emocionais (Lua por signo, casa e aspectos); o que traz segurança e acolhimento; relação com família e raízes (casa 4, IC); como a pessoa reage sob estresse; caminhos de autocuidado que combinam com o mapa. Não faça diagnósticos de saúde mental.',
  },
  {
    id: 'proposito',
    title: 'Desafios, propósito e caminho',
    brief: 'Cubra: os principais desafios e aprendizados (Saturno, Plutão, aspectos tensos mais exatos); o eixo dos Nodos Lunares como direção de crescimento (Nodo Norte por signo e casa, e o Nodo Sul oposto); uma síntese do propósito de vida; termine com conselhos práticos para decisões mais conscientes, em forma de lista curta.',
  },
];

const SYSTEM = `Você é uma astróloga experiente e acolhedora que escreve leituras de mapa natal em português do Brasil.
Estilo:
- Fale direto com a pessoa, usando "você". Use o primeiro nome dela no máximo duas vezes.
- Linguagem simples, calorosa e clara. Sempre que usar um termo técnico, explique em poucas palavras.
- Baseie cada afirmação em posições concretas do mapa (cite planeta, signo, casa ou aspecto) e explique o porquê.
- Seja específica para ESTE mapa: evite frases genéricas que serviriam para qualquer pessoa.
- Equilibre potenciais e desafios. Apresente desafios como pontos de crescimento, nunca como sentença.
- Não faça previsões de eventos, não prometa resultados e não dê diagnósticos médicos, psicológicos ou recomendações financeiras específicas.
Formato:
- Comece direto no conteúdo, sem saudação e sem repetir o título da parte.
- Use subtítulos com "### " (de 3 a 5 subtítulos) e parágrafos curtos.
- Pode usar **negrito** com moderação e listas com "- " quando ajudar.
- Escreva entre 700 e 1000 palavras.`;

function getConfig(env) {
  return {
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    model: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    mpToken: env.MP_ACCESS_TOKEN || '',
    price: Number(env.PRICE || '29.90'),
    productName: env.PRODUCT_NAME || 'Leitura completa do Mapa Astral',
    siteUrl: (env.SITE_URL || '').replace(/\/$/, ''),
    secret: env.APP_SECRET || env.MP_ACCESS_TOKEN || 'troque-este-segredo',
    allowFree: env.ALLOW_FREE === 'true',
    anthropicUrl: env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    mpUrl: env.MP_BASE_URL || 'https://api.mercadopago.com',
  };
}

// paid: Mercado Pago configurado, a análise só sai após pagamento aprovado
// free: sem pagamento (apenas para testes!)   demo: sem chave da IA, textos de exemplo
function modeOf(cfg) {
  if (!cfg.anthropicKey) return 'demo';
  if (cfg.mpToken) return 'paid';
  return cfg.allowFree ? 'free' : 'demo';
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

function validBirth(b) {
  return b && typeof b.name === 'string' && b.name.trim().length > 0 && b.name.length <= 60
    && /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') && /^\d{2}:\d{2}$/.test(b.time || '')
    && !Number.isNaN(Date.parse(b.utc || ''))
    && Math.abs(Number(b.lat)) <= 90 && Math.abs(Number(b.lon)) <= 180;
}

function birthKey(b) {
  return [String(b.name).trim().toLowerCase(), b.date, b.time, b.utc, Number(b.lat).toFixed(2), Number(b.lon).toFixed(2), b.timeUnknown ? 'sem-hora' : ''].join('|');
}

// Assinatura que liga um pagamento a um mapa específico.
async function signBirth(b, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(birthKey(b)));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

// ---------- /api/config ----------
function config(cfg) {
  return json({ mode: modeOf(cfg), price: cfg.price, productName: cfg.productName, parts: PARTS.map(({ id, title }) => ({ id, title })) });
}

// ---------- /api/checkout ----------
async function checkout(request, cfg) {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const { birth } = await readJson(request);
  if (!validBirth(birth)) return json({ error: 'Dados de nascimento incompletos.' }, 400);
  const mode = modeOf(cfg);
  if (mode !== 'paid') return json({ mode });

  const origin = cfg.siteUrl || new URL(request.url).origin;
  const back = `${origin}/?retorno=1`;
  const r = await fetch(`${cfg.mpUrl}/checkout/preferences`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.mpToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ title: cfg.productName, quantity: 1, unit_price: cfg.price, currency_id: 'BRL' }],
      external_reference: await signBirth(birth, cfg.secret),
      back_urls: { success: back, pending: back, failure: back },
      auto_return: 'approved',
      statement_descriptor: 'MAPA ASTRAL',
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.init_point) {
    console.error('Mercado Pago', r.status, JSON.stringify(data));
    return json({ error: 'Não foi possível abrir o pagamento agora. Tente de novo em alguns minutos.' }, 502);
  }
  return json({ mode: 'paid', url: data.init_point });
}

// ---------- /api/analyze ----------
async function verifyPayment(cfg, paymentId, birth) {
  if (!/^\d+$/.test(String(paymentId || ''))) return false;
  const r = await fetch(`${cfg.mpUrl}/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${cfg.mpToken}` } });
  if (!r.ok) return false;
  const pay = await r.json();
  return pay.status === 'approved'
    && pay.external_reference === await signBirth(birth, cfg.secret)
    && Number(pay.transaction_amount) >= cfg.price - 0.01;
}

function demoText(part, chart) {
  const p = Object.fromEntries(chart.points.map((x) => [x.key, x]));
  return `### Texto de exemplo
Este é um **texto de demonstração** da parte "${part.title}". Quando a chave da IA estiver configurada no servidor, aqui aparecerá uma análise completa e personalizada.

### O que a análise vai usar
Seu Sol está em **${p.sun.sign.name}** na casa ${p.sun.house}, sua Lua em **${p.moon.sign.name}** na casa ${p.moon.house} e seu Ascendente em **${chart.angles[0].sign.name}**. Vênus está em ${p.venus.sign.name} e Marte em ${p.mars.sign.name}.

- ${chart.aspects.length} aspectos encontrados no mapa
- Casas calculadas pelo sistema ${chart.houseSystem}`;
}

async function analyze(request, cfg) {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const { birth, chart: payload, part: partId, paymentId } = await readJson(request);
  const part = PARTS.find((p) => p.id === partId);
  if (!part) return json({ error: 'Parte da leitura desconhecida.' }, 400);
  if (!validBirth(birth)) return json({ error: 'Dados de nascimento incompletos.' }, 400);
  const chart = chartFromPayload(payload);
  if (!chart) return json({ error: 'Dados do mapa inválidos.' }, 400);

  const mode = modeOf(cfg);
  const textHeaders = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' };
  if (mode === 'demo') return new Response(demoText(part, chart), { headers: textHeaders });

  if (mode === 'paid') {
    const ok = await verifyPayment(cfg, paymentId, birth).catch(() => false);
    if (!ok) return json({ error: 'Pagamento não encontrado ou ainda não aprovado para este mapa.' }, 402);
  }

  const firstName = birth.name.trim().split(/\s+/)[0].slice(0, 30);
  const user = `Nome: ${firstName}
Nascimento: ${birth.date} às ${birth.timeUnknown ? 'hora desconhecida' : birth.time} em ${String(birth.place || '').slice(0, 120)}
${birth.timeUnknown ? 'ATENÇÃO: a hora de nascimento é desconhecida. Não use casas, Ascendente nem Meio do Céu; trabalhe com signos e aspectos entre planetas e avise isso em uma frase.\n' : ''}
${chartToText(chart, { timeUnknown: !!birth.timeUnknown })}

Escreva agora a parte "${part.title}" da leitura.
${part.brief}`;

  const upstream = await fetch(`${cfg.anthropicUrl}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: cfg.model, max_tokens: 2600, stream: true, system: SYSTEM, messages: [{ role: 'user', content: user }] }),
  });
  if (!upstream.ok || !upstream.body) {
    console.error('Anthropic', upstream.status, await upstream.text().catch(() => ''));
    return json({ error: 'A análise não pôde ser gerada agora. Tente de novo em instantes.' }, 502);
  }

  // Converte o fluxo de eventos da API em texto puro, repassado conforme é escrito.
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  const stream = upstream.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        try {
          const evt = JSON.parse(line.slice(5));
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') controller.enqueue(encoder.encode(evt.delta.text));
        } catch { /* linha de controle */ }
      }
    },
  }));
  return new Response(stream, { headers: textHeaders });
}

export async function handle(name, request, env) {
  const cfg = getConfig(env || {});
  try {
    if (name === 'config') return config(cfg);
    if (name === 'checkout') return await checkout(request, cfg);
    if (name === 'analyze') return await analyze(request, cfg);
    return json({ error: 'Não encontrado.' }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: 'Erro interno. Tente de novo em instantes.' }, 500);
  }
}
