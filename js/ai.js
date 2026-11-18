// Claude ile mekan önerileri ve pratik bilgiler.
// Sunucu yok: istek tarayıcıdan, kullanıcının kendi API anahtarıyla doğrudan Anthropic'e gider.
// Anahtar yalnızca bu tarayıcının localStorage'ında durur; veritabanına yazılmaz.
window.AI = (function () {
  'use strict';
  const { LS } = App;
  const LS_KEY = 'gp_claude_key';
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.10.0/+esm';
  const MODEL = 'claude-opus-5-5';
  // Claude Console sayfaları (anahtar alma adımları)
  const LINKS = {
    signup: 'https://platform.claude.com/login',
    billing: 'https://platform.claude.com/settings/billing',
    keys: 'https://platform.claude.com/settings/keys',
    limits: 'https://platform.claude.com/settings/limits',
    usage: 'https://platform.claude.com/usage'
  };

  // ---------- kullanım ve aylık limit (bu tarayıcıda) ----------
  // Fiyat (Claude Opus 5.5, 1M token başına $): giriş 4, çıkış 20, önbellek okuma 0,20. Düşünme tokenları çıkışa dahildir.
  const PRICE = { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 };
  const LS_USAGE = 'gp_ai_usage', LS_LIMIT = 'gp_ai_limit';
  const LIMITS = [50000, 150000, 500000, 0]; // 0 = sınırsız
  const DEFAULT_LIMIT = 150000;
  const thisMonth = () => new Date().toISOString().slice(0, 7);
  function usage() {
    let u = null;
    try { u = JSON.parse(LS.get(LS_USAGE) || 'null'); } catch (e) {}
    if (!u || u.month !== thisMonth()) u = { month: thisMonth(), tokens: 0, cost: 0, n: 0 };
    return u;
  }
  function addUsage(us) {
    if (!us) return;
    const inT = (us.input_tokens || 0) + (us.cache_creation_input_tokens || 0) + (us.cache_read_input_tokens || 0);
    const outT = us.output_tokens || 0;
    const cost = ((us.input_tokens || 0) * PRICE.in + (us.cache_creation_input_tokens || 0) * PRICE.cacheWrite +
      (us.cache_read_input_tokens || 0) * PRICE.cacheRead + outT * PRICE.out) / 1e6;
    const u = usage();
    u.tokens += inT + outT; u.cost += cost; u.n += 1;
    LS.set(LS_USAGE, JSON.stringify(u));
  }
  function getLimit() { const v = LS.get(LS_LIMIT); return v == null ? DEFAULT_LIMIT : (LIMITS.includes(Number(v)) ? Number(v) : DEFAULT_LIMIT); }
  const setLimit = n => LS.set(LS_LIMIT, String(LIMITS.includes(Number(n)) ? Number(n) : DEFAULT_LIMIT));
  // Kabaca: tokenların çoğu çıkış (düşünme + yanıt) olduğundan 1000 token ≈ $0,02
  const estCost = tokens => tokens * 0.00002;
  const overLimit = () => { const l = getLimit(); return l > 0 && usage().tokens >= l; };
  const fmtTokens = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n);
  const fmtUsd = n => '$' + (n < 0.1 && n > 0 ? n.toFixed(3) : n.toFixed(2));

  const getKey = () => (LS.get(LS_KEY) || '').trim();
  const hasKey = () => !!getKey();
  const setKey = k => { k = String(k || '').trim(); if (k) LS.set(LS_KEY, k); else LS.del(LS_KEY); };
  const maskKey = k => k ? k.slice(0, 7) + '…' + k.slice(-4) : '';

  let sdkP = null;
  function sdk() {
    if (!sdkP) { sdkP = import(SDK_URL); sdkP.catch(() => { sdkP = null; }); }
    return sdkP;
  }
  function client(k) {
    const key = (k || getKey()).trim();
    if (!key) return Promise.reject(Object.assign(new Error('nokey'), { code: 'nokey' }));
    return sdk().then(m => ({ Anthropic: m.default, c: new m.default({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 }) }));
  }

  // Hata → kısa kod (arayüz metni i18n'de: ai.err.<kod>)
  function errCode(e, Anthropic) {
    if (!e) return 'unknown';
    if (['nokey', 'refusal', 'truncated', 'parse', 'limit'].includes(e.code)) return e.code;
    if (Anthropic) {
      if (e instanceof Anthropic.APIUserAbortError) return 'aborted';
      if (e instanceof Anthropic.AuthenticationError) return 'auth';
      if (e instanceof Anthropic.PermissionDeniedError) return 'permission';
      if (e instanceof Anthropic.NotFoundError) return 'model';
      if (e instanceof Anthropic.RateLimitError) return 'rate';
      if (e instanceof Anthropic.BadRequestError) return /credit|billing|balance/i.test(e.message || '') ? 'credit' : 'bad';
      if (e instanceof Anthropic.APIConnectionError) return 'network';
      if (e instanceof Anthropic.InternalServerError) return 'server';
    }
    if (e.name === 'AbortError') return 'aborted';
    if (e instanceof TypeError) return 'network'; // SDK modülü indirilemedi
    return 'unknown';
  }

  // Anahtarı ücretsiz bir çağrıyla dener (model bilgisi). k verilmezse kayıtlı anahtar
  function testKey(k) {
    let A = null;
    return client(k).then(({ Anthropic, c }) => { A = Anthropic; return c.models.retrieve(MODEL); })
      .then(() => ({ ok: true }), e => ({ ok: false, code: errCode(e, A) }));
  }

  // Yapılandırılmış çıktı: yanıt şemaya uygun JSON. Akışla istenir (uzun yanıtta zaman aşımı olmasın).
  // Döner: { promise, abort }
  function ask({ system, prompt, schema, maxTokens }) {
    let stream = null, aborted = false, A = null;
    const promise = (overLimit() ? Promise.reject(Object.assign(new Error('limit'), { code: 'limit' })) : client()).then(({ Anthropic, c }) => {
      A = Anthropic;
      if (aborted) throw new Anthropic.APIUserAbortError();
      stream = c.beta.messages.stream({
        model: MODEL,
        max_tokens: maxTokens || 16000,
        // Güvenlik sınıflandırıcısı reddederse sunucu uygun modelle yeniden dener
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
        system,
        messages: [{ role: 'user', content: prompt }]
      });
      return stream.finalMessage();
    }).then(msg => {
      addUsage(msg.usage); // reddedilen ya da yarıda kalan yanıt da ücretlenir
      if (msg.stop_reason === 'refusal') throw Object.assign(new Error('refusal'), { code: 'refusal' });
      if (msg.stop_reason === 'max_tokens') throw Object.assign(new Error('truncated'), { code: 'truncated' });
      const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
      try { return JSON.parse(text); } catch (e) { throw Object.assign(new Error('parse'), { code: 'parse' }); }
    }).catch(e => { throw Object.assign(new Error(errCode(e, A)), { code: errCode(e, A) }); });
    return { promise, abort() { aborted = true; if (stream) stream.abort(); } };
  }

  // ---------- şemalar ----------
  const CATS = ['food', 'coffee', 'kids', 'sight', 'night', 'sport'];
  const PLACE_ICONS = ['fa-utensils', 'fa-mug-hot', 'fa-ice-cream', 'fa-pizza-slice', 'fa-burger', 'fa-fish', 'fa-wine-glass', 'fa-beer-mug-empty',
    'fa-martini-glass-citrus', 'fa-cake-candles', 'fa-bread-slice', 'fa-landmark', 'fa-monument', 'fa-church', 'fa-mosque', 'fa-building-columns',
    'fa-palette', 'fa-masks-theater', 'fa-music', 'fa-tree', 'fa-leaf', 'fa-umbrella-beach', 'fa-water', 'fa-mountain', 'fa-person-hiking',
    'fa-bicycle', 'fa-person-swimming', 'fa-futbol', 'fa-dumbbell', 'fa-child-reaching', 'fa-paw', 'fa-ship', 'fa-train', 'fa-camera',
    'fa-binoculars', 'fa-bag-shopping', 'fa-store', 'fa-sun', 'fa-moon', 'fa-star'];
  const INFO_ICONS = ['fa-plane-arrival', 'fa-train-subway', 'fa-bus', 'fa-taxi', 'fa-person-walking', 'fa-money-bill-wave', 'fa-credit-card',
    'fa-coins', 'fa-hand-holding-dollar', 'fa-shield-halved', 'fa-triangle-exclamation', 'fa-phone', 'fa-kit-medical', 'fa-language',
    'fa-comments', 'fa-clock', 'fa-utensils', 'fa-sun', 'fa-cloud-sun-rain', 'fa-shirt', 'fa-plug', 'fa-wifi', 'fa-sim-card', 'fa-passport',
    'fa-ticket', 'fa-child-reaching', 'fa-droplet', 'fa-circle-info'];

  const obj = (props, req) => ({ type: 'object', properties: props, required: req || Object.keys(props), additionalProperties: false });
  const str = d => ({ type: 'string', description: d });

  function placesSchema(slotKeys, es) {
    const p = {
      name: str('Mekanın gerçek, yerel adı'),
      area: str('Semt / mahalle'),
      cat: { type: 'string', enum: CATS },
      icon: { type: 'string', enum: PLACE_ICONS },
      desc_tr: str('Türkçe, en fazla 2 cümle'),
      best: { type: 'array', items: { type: 'string', enum: slotKeys }, description: 'En uygun zaman dilimleri' },
      res: { type: 'boolean', description: 'Önceden bilet/rezervasyon gerekir mi' },
      kid: { type: 'boolean', description: 'Küçük çocuklar için uygun mu' },
      url: str('Kesin bildiğin resmi web sitesi; emin değilsen boş metin')
    };
    if (es) p.desc_es = str('İspanyolca, en fazla 2 cümle');
    return obj({ places: { type: 'array', items: obj(p) } });
  }

  function practicalSchema(es) {
    const p = { icon: { type: 'string', enum: INFO_ICONS }, title_tr: str('Kısa başlık'), text_tr: str('Türkçe, en fazla 3 cümle') };
    if (es) { p.title_es = str('İspanyolca başlık'); p.text_es = str('İspanyolca, en fazla 3 cümle'); }
    return obj({ items: { type: 'array', items: obj(p) } });
  }

  // ---------- istemler ----------
  const SYSTEM = [
    'Sen deneyimli bir gezi planlayıcısısın. Bir ekibin ortak gezi planı için öneri hazırlıyorsun.',
    'Yalnızca gerçekten var olan, uzun süredir açık ve iyi bilinen yerleri öner. Kapandığından şüphelendiğin yeri önerme.',
    'Emin olmadığın bilgiyi uydurma: web sitesinden emin değilsen url alanını boş bırak, saat ve fiyat verirken "yaklaşık" de.',
    'Açıklamalar kısa, somut ve işe yarar olsun: neden gidilmeli, ne zaman, neye dikkat edilmeli.'
  ].join('\n');

  function tripContext(ctx) {
    const lines = [
      `Şehir: ${ctx.city}${ctx.cityOrig && ctx.cityOrig !== ctx.city ? ` (${ctx.cityOrig})` : ''}${ctx.country ? ', ' + ctx.country : ''}`,
      `Tarihler: ${ctx.start} – ${ctx.end} (${ctx.days} gün)`,
      `Ekip: ${ctx.people}`,
      `Gün dilimleri (best alanında bu anahtarları kullan): ${ctx.slots.map(s => `${s.key} = ${s.label} ${s.start}–${s.end}${s.nap ? ' (küçükler uyurken, yakın ve sakin plan)' : ''}`).join('; ')}`
    ];
    return lines.join('\n');
  }

  function placesRequest(ctx, wish, count) {
    const have = ctx.existing.length ? `\nHavuzda zaten olanlar (bunları tekrar önerme): ${ctx.existing.slice(0, 150).join(', ')}` : '';
    return {
      system: SYSTEM,
      schema: placesSchema(ctx.slots.map(s => s.key), ctx.es),
      prompt: `${tripContext(ctx)}${have}
${wish ? `\nEkibin isteği: ${wish}` : ''}

Bu gezi için ${count} mekan ve aktivite öner. Yemek, kahve/tatlı, gezilecek yerler ve (ekipte çocuk varsa) çocuk dostu yerler arasında denge kur; ekibin isteği varsa ona öncelik ver.
Her biri için kategori (food, coffee, kids, sight, night, sport), uygun bir ikon, semt, kısa açıklama ve en uygun gün dilimlerini ver.${ctx.es ? '\nAçıklamaları hem Türkçe (desc_tr) hem İspanyolca (desc_es) yaz.' : ''}`,
      maxTokens: 16000
    };
  }

  function practicalRequest(ctx) {
    return {
      system: SYSTEM,
      schema: practicalSchema(ctx.es),
      prompt: `${tripContext(ctx)}

Bu gezi için 8–12 maddelik pratik bilgi hazırla. Konular: havalimanından şehre ulaşım, şehir içi ulaşım ve bilet, para / kart / bahşiş, güvenlik ve yankesicilik, acil durum numarası, yemek saatleri ve açılış saatleri, bu tarihlerde beklenen hava ve kıyafet, priz tipi, internet / SIM, birkaç işe yarar yerel ifade${ctx.kids ? ', çocuklu gezi ipuçları' : ''}.
Her madde için uygun ikon, kısa başlık ve en fazla 3 cümlelik somut bilgi ver.${ctx.es ? '\nBaşlık ve metni hem Türkçe (_tr) hem İspanyolca (_es) yaz.' : ''}`,
      maxTokens: 12000
    };
  }

  // ---------- ortak arayüz parçaları: anahtar alma rehberi, limit seçimi ----------
  const listeners = [];
  const onChange = fn => listeners.push(fn);
  const changed = () => listeners.forEach(fn => { try { fn(); } catch (e) {} });
  let guideOpen = false;
  const ext = (href, label, cls) => `<a href="${App.esc(href)}" target="_blank" rel="noopener" class="${cls || 'h-9 px-3 rounded-xl btn-ghost text-xs font-bold inline-flex items-center gap-1.5 shrink-0'}">${App.esc(label)} <i class="fa-solid fa-arrow-up-right-from-square text-[10px]" aria-hidden="true"></i></a>`;

  function guideHtml(forceOpen) {
    const { esc, T } = App;
    const open = forceOpen || guideOpen;
    const L = LINKS;
    const step = (n, title, text, link) => `<li class="flex gap-3">
        <span class="w-6 h-6 shrink-0 rounded-full btn-soft text-xs font-extrabold flex items-center justify-center">${n}</span>
        <div class="min-w-0 flex-1 space-y-1.5"><p class="text-sm font-bold">${esc(title)}</p><p class="text-xs muted leading-snug">${esc(text)}</p>${link || ''}</div>
      </li>`;
    return `<div class="space-y-3">
      <div class="flex gap-2 flex-wrap">
        ${ext(L.keys, T('guide.direct'), 'h-10 px-4 rounded-xl btn-soft text-sm font-bold inline-flex items-center gap-1.5')}
        ${forceOpen ? '' : `<button type="button" data-action="ai-guide" aria-expanded="${open}" class="h-10 px-4 rounded-xl btn-ghost text-sm font-bold"><i class="fa-solid ${open ? 'fa-chevron-up' : 'fa-circle-question'}" aria-hidden="true"></i> ${esc(T('guide.toggle'))}</button>`}
      </div>
      ${open ? `<ol class="rounded-2xl surface2 p-4 space-y-4">
        ${step(1, T('guide.s1'), T('guide.s1t'), ext(L.signup, T('guide.s1b')))}
        ${step(2, T('guide.s2'), T('guide.s2t'), ext(L.billing, T('guide.s2b')))}
        ${step(3, T('guide.s3'), T('guide.s3t'), ext(L.keys, T('guide.s3b')))}
        ${step(4, T('guide.s4'), T('guide.s4t'))}
        <li class="text-[11px] muted border-t line pt-3">${esc(T('guide.tip'))} ${ext(L.limits, T('guide.tipB'), 'accent underline font-bold')}</li>
      </ol>` : ''}
    </div>`;
  }

  // compact: plan ekranındaki kısa hali
  function limitHtml(compact) {
    const { esc, T } = App;
    const u = usage(), lim = getLimit();
    const pct = lim ? Math.min(100, Math.round(u.tokens / lim * 100)) : 0;
    const over = lim > 0 && u.tokens >= lim;
    const chips = LIMITS.map(n => `<button type="button" data-action="ai-limit" data-n="${n}" aria-pressed="${n === lim}" class="h-10 rounded-xl text-xs font-bold leading-tight ${n === lim ? 'btn-soft ring-accent' : 'btn-ghost'}">
        ${n ? `${esc(fmtTokens(n))}<span class="block text-[10px] muted font-semibold">~${esc(fmtUsd(estCost(n)))}</span>` : esc(T('limit.none'))}</button>`).join('');
    const line = `${esc(T('limit.used', { u: fmtTokens(u.tokens), l: lim ? fmtTokens(lim) : '∞', c: fmtUsd(u.cost), n: u.n }))}`;
    return `<div class="space-y-2">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-bold">${esc(T('limit.title'))}</p>
        <p class="text-[11px] ${over ? 'bad font-bold' : 'muted'}">${line}</p>
      </div>
      ${lim ? `<div class="h-1.5 rounded-full surface2 overflow-hidden"><div class="h-full ${over ? 'bg-rose-500' : 'btn-accent'}" style="width:${pct}%"></div></div>` : ''}
      ${over ? `<p class="text-xs bad font-bold">${esc(T('limit.over'))}</p>` : ''}
      <div class="grid grid-cols-4 gap-2">${chips}</div>
      ${compact ? '' : `<p class="text-[11px] muted">${esc(T('limit.note'))} ${ext(LINKS.limits, T('guide.tipB'), 'accent underline font-bold')}</p>`}
    </div>`;
  }

  App.on({
    'ai-guide': () => { guideOpen = !guideOpen; changed(); },
    'ai-limit': el => { setLimit(el.dataset.n); changed(); }
  });

  const validFormat = k => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(String(k || '').trim());

  // Yeni anahtar: önce denenir; Anthropic reddederse kaydedilmez. Ağ/yoğunluk hatasında yine de kaydedilir.
  function saveKey(k) {
    k = String(k || '').trim();
    if (!validFormat(k)) return Promise.resolve({ ok: false, code: 'format', saved: false });
    return testKey(k).then(r => {
      const saved = r.ok || !['auth', 'permission'].includes(r.code);
      if (saved) setKey(k);
      return Object.assign(r, { saved });
    });
  }

  return {
    MODEL, getKey, hasKey, setKey, saveKey, maskKey, testKey, ask, placesRequest, practicalRequest, CATS,
    usage, addUsage, getLimit, setLimit, LIMITS, overLimit, estCost, fmtTokens, fmtUsd, guideHtml, limitHtml, onChange, changed,
    consoleUrl: 'https://platform.claude.com/settings/keys',
    links: LINKS
  };
})();
