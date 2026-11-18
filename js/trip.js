// Plan ekranı: gün gün program, mekan havuzu, kararlar, hazırlık, sohbet ve değerlendirme.
// Veri: trips/<id>/… — plan içeriği def altında (kişiler, günler, slotlar, havuz…), canlı veriler yanında.
// Bilet dosyaları trip_files/<id>/<fid> altında ayrı durur ve sadece açılınca indirilir.
(function () {
  'use strict';
  const { $, $$, LS, esc, pad, localDate, fileSize, linkify, T, TL, L, toast, TS } = App;
  const locale = () => App.locale();
  const LS_CHAT_SEEN = 'gp_chat_seen_';
  const LS_VIEW = 'gp_view';

  const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;
  const person = id => PEOPLE.find(p => p.id === id);
  const dayOf = key => DAYS.find(d => d.key === key);
  const slotOf = key => SLOTS.find(s => s.key === key);
  const catOf = key => CATEGORIES.find(c => c.key === key);
  const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const mapsUrl = (name, where) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${name}, ${where || ''}, ${CITY}`);
  const mapsFor = a => mapsUrl(a.name, a.addr || a.area);

  // ---------- plan içeriği (def'ten kurulur, dile göre çözülür) ----------
  let PEOPLE = [], FORMER_PEOPLE = {}, GROUPS = {}, SLOTS = [], DAYS = [], POOL = [], FIXED_EVENTS = {};
  let DECISIONS = [], SUGGESTED_PLAN = {}, CHECKLIST = [], PRACTICAL = [], LISTS = [], CITY = '', META = {};
  let CATEGORIES = [];
  let defSig = '';

  // { tr, es } nesnelerini o anki dile çevirir (iç içe her yerde)
  function resolve(v) {
    if (Array.isArray(v)) return v.map(resolve);
    if (v && typeof v === 'object') {
      const keys = Object.keys(v);
      if ('tr' in v && keys.every(k => k === 'tr' || k === 'es')) return L(v);
      const o = {};
      keys.forEach(k => { o[k] = resolve(v[k]); });
      return o;
    }
    return v;
  }
  const arr = v => Array.isArray(v) ? v.filter(Boolean) : (v && typeof v === 'object' ? Object.values(v) : []);
  // Veritabanından gelen ve HTML sınıf/öznitelik içine giren alanlar burada süzülür
  const safeIcon = (x, fb) => /^fa-[a-z0-9-]{1,40}$/.test(x || '') ? x : (fb || 'fa-star');
  const safeId = x => /^[A-Za-z0-9_-]{1,40}$/.test(x || '');
  const safeColor = x => /^#[0-9a-fA-F]{3,8}$/.test(x || '') ? x : '#64748b';

  function applyDef(def, meta) {
    const sig = App.lang() + JSON.stringify(def || {}) + JSON.stringify(meta || {});
    if (sig === defSig) return;
    defSig = sig;
    const d = resolve(def || {});
    META = resolve(meta || {});
    CITY = d.city || META.city || '';
    PEOPLE = Object.entries(d.people || {}).filter(([id, p]) => safeId(id) && p && p.name)
      .map(([id, p]) => Object.assign({}, p, { id, name: String(p.name), color: safeColor(p.color) })).sort((a, b) => (a.order || 0) - (b.order || 0));
    FORMER_PEOPLE = d.former || {};
    GROUPS = {};
    Object.entries(d.groups || {}).forEach(([g, v]) => { if (safeId(g)) GROUPS[g] = Object.assign({ label: g, who: '', note: '' }, v); });
    SLOTS = arr(d.slots).filter(s => safeId(s.key) && /^\d\d:\d\d$/.test(s.start) && /^\d\d:\d\d$/.test(s.end)).map(s => Object.assign({ hint: '' }, s));
    DAYS = arr(d.days).filter(x => safeId(x.key) && /^\d{4}-\d\d-\d\d$/.test(x.date)).map((x, i) => {
      const dt = new Date(x.date + 'T12:00:00');
      const long = dt.toLocaleDateString(locale(), { day: 'numeric', month: 'long', weekday: 'long' });
      return Object.assign({
        short: dt.toLocaleDateString(locale(), { weekday: 'short' }).replace('.', ''),
        num: dt.getDate(),
        title: long.charAt(0).toLocaleUpperCase(locale()) + long.slice(1),
        desc: T('day.n', { n: i + 1 })
      }, x);
    });
    const catIcon = cat => (CATEGORIES_ALL.find(c => c.key === cat) || { icon: 'fa-star' }).icon;
    POOL = arr(d.pool).filter(a => safeId(a.id) && a.name).map(a => Object.assign({ area: '', desc: '' }, a, {
      cat: CATEGORIES_ALL.some(c => c.key === a.cat) ? a.cat : 'custom',
      icon: safeIcon(a.icon, catIcon(a.cat)),
      best: arr(a.best),
      url: /^https?:\/\//.test(a.url || '') ? a.url : '',
      ig: /^[A-Za-z0-9._]{1,40}$/.test(a.ig || '') ? a.ig : ''
    }));
    FIXED_EVENTS = {};
    Object.entries(d.fixed || {}).forEach(([day, slots]) => {
      FIXED_EVENTS[day] = {};
      Object.entries(slots || {}).forEach(([slot, list]) => { FIXED_EVENTS[day][slot] = arr(list).map(ev => Object.assign({ time: '' }, ev, { icon: safeIcon(ev.icon, 'fa-thumbtack') })); });
    });
    DECISIONS = arr(d.decisions).filter(x => safeId(x.id)).map(x => Object.assign({}, x, { icon: safeIcon(x.icon, 'fa-square-check'), options: arr(x.options).filter(o => safeId(o.id)) }));
    SUGGESTED_PLAN = d.suggested || {};
    CHECKLIST = arr(d.checklist).filter(c => safeId(c.id)).map(c => Object.assign({}, c, { url: /^https?:\/\//.test(c.url || '') ? c.url : '' }));
    PRACTICAL = arr(d.practical).map(p => Object.assign({}, p, { icon: safeIcon(p.icon, 'fa-circle-info') }));
    LISTS = Object.entries(d.lists || {}).filter(([id]) => safeId(id))
      .map(([id, l]) => Object.assign({ items: {}, title: id }, l, { id, icon: safeIcon(l.icon, 'fa-list'), sections: arr(l.sections) }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    CATEGORIES = CATEGORIES_ALL.map(c => ({ key: c.key, icon: c.icon, label: App.catLabel(c.key) }));
  }
  const CATEGORIES_ALL = App.CATEGORIES;

  // Kart içindeki web sitesi / harita kısayolları
  function linkButtons(a) {
    const cls = 'h-8 px-2.5 rounded-lg btn-ghost inline-flex items-center gap-1.5 text-xs font-bold';
    const web = a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener" class="${cls}" aria-label="${esc(a.name)} · ${esc(T('link.web'))}"><i class="fa-solid fa-globe accent" aria-hidden="true"></i>${esc(T('link.web'))}</a>` : '';
    const map = `<a href="${esc(mapsFor(a))}" target="_blank" rel="noopener" class="${cls}" aria-label="${esc(a.name)} · Google Maps"><i class="fa-solid fa-location-dot terra" aria-hidden="true"></i>${esc(T('link.map'))}</a>`;
    const ig = a.ig ? `<a href="https://www.instagram.com/${encodeURIComponent(a.ig)}/" target="_blank" rel="noopener" class="${cls}" aria-label="${esc(a.name)} · Instagram"><i class="fa-brands fa-instagram" style="color:#d62976" aria-hidden="true"></i>Instagram</a>` : '';
    return `<div class="flex flex-wrap gap-1.5 mt-2">${web}${ig}${map}</div>`;
  }

  const MAX_FILE_MB = 3;

  // Kişiyi seçen hesabın Google fotoğrafı (members/<uid>/photo); yoksa ya da yüklenemezse renkli baş harf
  function photoOf(id) {
    const uid = (D().claims || {})[id];
    return uid ? App.safePhoto(((D().members || {})[uid] || {}).photo) : null;
  }

  function avatar(id, size = 'w-7 h-7 text-[11px]') {
    const p = person(id);
    if (!p) return '';
    const ph = photoOf(id);
    return `<span class="${size} relative shrink-0 rounded-full inline-flex items-center justify-center font-extrabold text-white overflow-hidden" style="background:${esc(p.color || '#64748b')}" title="${esc(p.name)}">${esc(p.name[0])}${ph ? `<img src="${esc(ph)}" alt="" referrerpolicy="no-referrer" loading="lazy" class="absolute inset-0 w-full h-full object-cover" onerror="this.remove()">` : ''}</span>`;
  }

  // ---------- durum ----------
  const state = {
    key: null,      // plan kimliği
    me: null,       // bu hesabın plandaki kişisi
    day: 'day1',
    tab: 'plan',
    view: LS.get(LS_VIEW) === 'summary' ? 'summary' : 'day',
    poolCat: 'all',
    poolQuery: '',
    reviewView: 'mine',
    data: {},
    loaded: false,
    sheet: null
  };

  let db = null;
  let tripRef = null;

  // ---------- veri erişimi ----------
  const D = () => state.data || {};
  const slotItems = (day, slot) => ((D().slots || {})[day] || {})[slot] || {};
  const customActs = () => D().custom_activities || {};

  function activity(id) {
    if (!id) return null;
    if (id.startsWith('custom:')) {
      const c = customActs()[id.slice(7)];
      return c ? { id, name: c.name, area: c.area || '', cat: c.cat || 'custom', desc: c.desc || '', icon: 'fa-star', res: false, kid: false, best: [], custom: true, addedBy: c.addedBy } : null;
    }
    return POOL.find(a => a.id === id) || null;
  }

  // Havuz mekanlarında güncel (dile göre) ad/semt; kendi önerilerde kayıttaki değer
  const itemName = item => { const a = activity(item.activityId); return a && !a.custom ? a.name : item.name; };
  const itemArea = item => { const a = activity(item.activityId); return a && !a.custom ? a.area : item.area; };

  function allActivities() {
    const custom = Object.keys(customActs()).map(k => activity('custom:' + k)).filter(Boolean);
    return POOL.concat(custom);
  }

  function voteTally(itemKey) {
    const v = (D().slot_votes || {})[itemKey] || {};
    const up = [], down = [];
    Object.entries(v).forEach(([u, val]) => { if (val === 'up') up.push(u); else if (val === 'down') down.push(u); });
    return { up, down, mine: v[state.me] || null, score: up.length - down.length };
  }

  function decisionTally(decId) {
    const v = (D().decisions || {})[decId] || {};
    const counts = {};
    Object.entries(v).forEach(([u, opt]) => { (counts[opt] = counts[opt] || []).push(u); });
    const dec = DECISIONS.find(d => d.id === decId) || { options: [] };
    let winner = null, best = 0, tie = false;
    dec.options.forEach(o => {
      const n = (counts[o.id] || []).length;
      if (n > best) { best = n; winner = o.id; tie = false; } else if (n === best && n > 0) tie = true;
    });
    return { counts, mine: v[state.me] || null, winner: tie ? null : winner, total: Object.keys(v).length };
  }


  // ---------- zaman ----------
  function todayKey() {
    const t = localDate(new Date());
    const d = DAYS.find(x => x.date === t);
    return d ? d.key : null;
  }

  function slotStatus(dayKey, slot) {
    const t = localDate(new Date());
    const d = dayOf(dayKey);
    if (d.date < t) return 'past';
    if (d.date > t) return 'future';
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    if (now >= toMin(slot.end)) return 'past';
    if (now >= toMin(slot.start)) return 'now';
    return 'future';
  }

  const tripEnded = () => !!DAYS.length && localDate(new Date()) > DAYS[DAYS.length - 1].date;

  function rangeText() {
    if (!DAYS.length) return '';
    const a = new Date(DAYS[0].date + 'T12:00:00'), b = new Date(DAYS[DAYS.length - 1].date + 'T12:00:00');
    const sameMonth = a.getMonth() === b.getMonth();
    return sameMonth
      ? `${a.getDate()}–${b.toLocaleDateString(locale(), { day: 'numeric', month: 'long' })}`
      : `${a.toLocaleDateString(locale(), { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString(locale(), { day: 'numeric', month: 'short' })}`;
  }

  function countdownText() {
    if (!DAYS.length) return '';
    const start = new Date(DAYS[0].date + 'T00:00:00');
    const end = new Date(DAYS[DAYS.length - 1].date + 'T23:59:59');
    const now = new Date();
    const range = rangeText();
    if (now < start) {
      return T('count.before', { range, n: Math.ceil((start - now) / 86400000) });
    }
    if (now <= end) {
      const idx = DAYS.findIndex(d => d.key === todayKey());
      return T('count.during', { i: idx + 1, n: DAYS.length });
    }
    return T('count.after', { range });
  }

  const whereText = (day, slot) => `${dayOf(day).short} ${dayOf(day).num} ${slotOf(slot).label}`;

  // ---------- yazma işlemleri ----------
  function write(path, value) {
    if (!tripRef) return Promise.reject(new Error('offline'));
    return tripRef.child(path).set(value).catch(err => { toast(T('toast.saveFail', { e: err.code })); throw err; });
  }

  function addToSlot(actId, day, slot) {
    const act = activity(actId);
    if (!act) return;
    const exists = Object.values(slotItems(day, slot)).some(i => i.activityId === actId);
    if (exists) { toast(T('toast.dup')); return; }
    const ref = tripRef.child(`slots/${day}/${slot}`).push();
    ref.set({
      activityId: act.id,
      name: act.name,
      cat: act.cat,
      area: act.area || '',
      addedBy: state.me,
      addedAt: firebase.database.ServerValue.TIMESTAMP
    }).then(() => toast(T('toast.added', { where: whereText(day, slot) })))
      .catch(err => toast(T('toast.saveFail', { e: err.code })));
  }

  function moveItem(day, slot, key, toDay, toSlot) {
    if (day === toDay && slot === toSlot) return;
    const item = slotItems(day, slot)[key];
    if (!item) return;
    tripRef.update({
      [`slots/${toDay}/${toSlot}/${key}`]: item,
      [`slots/${day}/${slot}/${key}`]: null
    }).then(() => toast(T('toast.moved', { where: whereText(toDay, toSlot) })))
      .catch(err => toast(T('toast.moveFail', { e: err.code })));
  }

  function removeItem(day, slot, key) {
    tripRef.update({ [`slots/${day}/${slot}/${key}`]: null, [`slot_votes/${key}`]: null })
      .catch(err => toast(T('toast.delFail', { e: err.code })));
  }

  function vote(itemKey, v) {
    const cur = voteTally(itemKey).mine;
    write(`slot_votes/${itemKey}/${state.me}`, cur === v ? null : v);
  }

  function decide(decId, optId) {
    const cur = decisionTally(decId).mine;
    write(`decisions/${decId}/${state.me}`, cur === optId ? null : optId);
  }

  // ---------- RENDER: kimlik ----------
  // Hesap başına bir kişi: claims/<kişi> = uid (kurallar başkasının seçtiğini engeller)
  function renderWhoami() {
    const claims = D().claims || {};
    $('#whoTitle').textContent = META.title || '';
    $('#whoamiGrid').innerHTML = PEOPLE.map(p => {
      const taken = claims[p.id] && claims[p.id] !== App.user().uid;
      const g = GROUPS[p.group];
      return `<button data-action="pick-me" data-id="${esc(p.id)}" ${taken ? 'disabled' : ''} class="surface rounded-2xl p-4 text-left flex items-center gap-3 transition min-h-[72px] ${taken ? 'opacity-40' : 'hover:ring-accent'}">
        ${avatar(p.id, 'w-11 h-11 text-base')}
        <span class="min-w-0">
          <span class="block font-extrabold">${esc(p.name)}</span>
          <span class="block text-[11px] muted">${esc(g ? g.label : '')}${taken ? (g ? ' · ' : '') + esc(T('who.taken')) : ''}</span>
        </span>
      </button>`;
    }).join('');
  }

  // ---------- RENDER: üst bar ----------
  function renderHeader() {
    $('#countdown').textContent = countdownText();
    $('#tripTitle').textContent = META.title || '';
    $('#tripBadge').textContent = String(CITY || META.title || '').slice(0, 3).toLocaleUpperCase(locale());
    document.title = (META.title || '') + ' · ' + T('app.name');
    const p = person(state.me);
    $('#meBadge').innerHTML = p ? `${avatar(p.id, 'w-9 h-9 text-sm')}<span class="hidden md:inline text-sm font-bold">${esc(p.name)}</span>` : '';
  }

  function renderTabs() {
    $$('[data-panel]').forEach(el => el.classList.toggle('hidden', el.dataset.panel !== state.tab));
    $$('.nav-btn').forEach(b => {
      const on = b.dataset.tab === state.tab;
      b.classList.toggle('accent', on);
      b.classList.toggle('muted', !on);
    });
    // Değerlendirme masaüstünde de 3 kolonun yerine geçer (lg:grid, hidden sınıfını ezdiği için style ile)
    const rev = state.tab === 'review';
    $('#mainGrid').style.display = rev ? 'none' : '';
    $('#reviewMain').classList.toggle('hidden', !rev);
    $('#reviewToggle').innerHTML = rev
      ? `<i class="fa-solid fa-calendar-days" aria-hidden="true"></i><span>${esc(T('nav.plan'))}</span>`
      : `<i class="fa-solid fa-star text-amber-500" aria-hidden="true"></i><span>${esc(T('nav.review'))}</span>`;
  }

  // ---------- RENDER: gün çipleri ----------
  function renderDayChips() {
    const today = todayKey();
    $('#dayChips').innerHTML = DAYS.map(d => {
      const on = state.view === 'day' && d.key === state.day;
      const count = SLOTS.reduce((n, s) => n + Object.keys(slotItems(d.key, s.key)).length, 0);
      return `<button data-action="day" data-day="${d.key}" class="shrink-0 w-[52px] h-11 rounded-xl flex flex-col items-center justify-center leading-none transition ${on ? 'btn-accent shadow' : 'surface'}">
        <span class="text-[10px] font-bold ${on ? '' : 'muted'}">${esc(d.short)}${d.key === today ? ' •' : ''}</span>
        <span class="text-base font-extrabold">${d.num}</span>
        ${count ? `<span class="sr-only">${count} plan</span>` : ''}
      </button>`;
    }).join('');
    $('#viewToggle').innerHTML = state.view === 'day'
      ? `<i class="fa-solid fa-list" aria-hidden="true"></i><span class="ml-1.5">${esc(T('view.summary'))}</span>`
      : `<i class="fa-solid fa-calendar-day" aria-hidden="true"></i><span class="ml-1.5">${esc(T('view.day'))}</span>`;
  }

  // ---------- RENDER: zaman çizelgesi ----------
  const fixedEventsFor = (day, slot) => (FIXED_EVENTS[day] || {})[slot] || [];

  function fixedCard(ev) {
    return `<div class="flex items-center gap-3 rounded-xl px-3 py-2.5 surface2">
      <i class="fa-solid ${ev.icon} w-4 text-center accent" aria-hidden="true"></i>
      <span class="text-[11px] font-bold muted w-14 shrink-0">${esc(ev.time)}</span>
      <span class="text-sm font-semibold">${esc(ev.title)}</span>
      <i class="fa-solid fa-lock text-[10px] muted ml-auto" aria-label="${esc(T('fixed.locked'))}"></i>
    </div>`;
  }

  function groupChips(groups) {
    const on = Object.keys(groups || {}).filter(g => groups[g]);
    return on.map(g => `<span class="tag surface2 muted">${g}</span>`).join('');
  }

  function itemCard(day, slot, rawKey, item) {
    const act = activity(item.activityId) || {};
    const t = voteTally(rawKey);
    const key = esc(rawKey);
    const cat = item.cat || act.cat || 'custom';
    const by = person(item.addedBy);
    const area = itemArea(item);
    return `<article data-action="detail" data-day="${day}" data-slot="${slot}" data-key="${key}" draggable="true" data-drag-item="1"
      class="surface rounded-xl p-3 cursor-pointer hover:shadow-md transition ${item.confirmed ? 'ring-accent' : ''}">
      <div class="flex items-start gap-3">
        <span class="tag-${esc(cat)} w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"><i class="fa-solid ${act.icon ? safeIcon(act.icon) : safeIcon(item.icon)}" aria-hidden="true"></i></span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <h4 class="text-sm font-extrabold leading-snug">${esc(itemName(item))}</h4>
            ${item.confirmed ? `<span class="tag btn-accent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${esc(T('item.confirmed'))}</span>` : ''}
            ${item.ticket || item.files ? `<span class="tag surface2 ok" title="${esc(T('info.hasTicket'))}"><i class="fa-solid fa-ticket" aria-hidden="true"></i> ✓</span>`
              : act.res ? `<span class="tag tag-res" title="${esc(T('item.resNeeded'))}"><i class="fa-solid fa-ticket" aria-hidden="true"></i></span>` : ''}
            ${item.note ? `<span class="tag surface2 muted" title="${esc(T('info.hasNote'))}"><i class="fa-solid fa-note-sticky" aria-hidden="true"></i></span>` : ''}
          </div>
          <div class="flex items-center gap-1.5 mt-1 flex-wrap text-[11px] muted">
            ${area ? `<span class="truncate max-w-full">${esc(area)}</span>` : ''}
            ${groupChips(item.groups)}
            ${by ? `<span class="inline-flex items-center gap-1">· <span class="w-3.5 h-3.5 rounded-full inline-block" style="background:${esc(by.color)}"></span>${esc(by.name)}</span>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-0.5 shrink-0">
          <button data-action="vote" data-key="${key}" data-v="up" class="h-9 min-w-[40px] px-2 rounded-lg text-xs font-bold ${t.mine === 'up' ? 'ok btn-ghost' : 'muted'}" aria-label="${esc(T('item.like'))}"><i class="fa-solid fa-thumbs-up" aria-hidden="true"></i> ${t.up.length}</button>
          <button data-action="vote" data-key="${key}" data-v="down" class="h-9 min-w-[40px] px-2 rounded-lg text-xs font-bold ${t.mine === 'down' ? 'bad btn-ghost' : 'muted'}" aria-label="${esc(T('item.dislike'))}"><i class="fa-solid fa-thumbs-down" aria-hidden="true"></i> ${t.down.length}</button>
        </div>
      </div>
    </article>`;
  }

  function suggestionCard(day, slot, s) {
    const act = activity(s.id);
    if (!act) return '';
    const who = s.who && GROUPS[s.who] ? `${GROUPS[s.who].label} · ` : '';
    return `<div class="dashed rounded-xl p-3 flex items-center gap-3">
      <span class="tag-${esc(act.cat)} w-9 h-9 shrink-0 rounded-xl flex items-center justify-center opacity-70"><i class="fa-solid ${safeIcon(act.icon)}" aria-hidden="true"></i></span>
      <div class="min-w-0 flex-1">
        <div class="text-[10px] font-bold uppercase tracking-wide terra">${esc(T('sugg.label'))}</div>
        <div class="text-sm font-bold leading-snug">${esc(act.name)}</div>
        <div class="text-[11px] muted">${esc(who)}${esc(s.note || act.area)}</div>
      </div>
      <button data-action="accept" data-act="${esc(act.id)}" data-day="${day}" data-slot="${slot}" class="h-9 px-3 rounded-lg btn-soft text-xs font-bold shrink-0">${esc(T('sugg.add'))}</button>
    </div>`;
  }

  function renderTimeline() {
    const d = dayOf(state.day);
    const closed = d.closed || {};
    let html = `<div class="mb-1">
      <h2 class="text-xl font-extrabold">${esc(d.title)}</h2>
      <p class="text-sm muted">${esc(d.desc)}</p>
    </div><div class="space-y-3">`;

    SLOTS.forEach(slot => {
      const status = slotStatus(d.key, slot);
      const items = Object.entries(slotItems(d.key, slot.key))
        .sort((a, b) => (b[1].confirmed ? 1 : 0) - (a[1].confirmed ? 1 : 0) || voteTally(b[0]).score - voteTally(a[0]).score || (a[1].addedAt || 0) - (b[1].addedAt || 0));
      const fixed = fixedEventsFor(d.key, slot.key);
      const takenIds = new Set(items.map(([, it]) => it.activityId));
      const sugg = (((SUGGESTED_PLAN[d.key] || {})[slot.key]) || []).filter(s => !takenIds.has(s.id));
      const isClosed = !!closed[slot.key];

      html += `<section class="grid grid-cols-[44px_minmax(0,1fr)] gap-2.5 ${status === 'past' ? 'past' : ''}">
        <div class="pt-3 text-right">
          <div class="text-xs font-extrabold">${slot.start}</div>
          <div class="text-[10px] muted">${slot.end}</div>
        </div>
        <div data-drop="${slot.key}" class="rounded-2xl p-3 border transition ${slot.nap ? 'nap' : 'surface'} ${status === 'now' ? 'ring-accent' : ''}">
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="min-w-0">
              <h3 class="text-sm font-extrabold flex items-center gap-2 ${slot.nap ? 'nap-ink' : ''}">
                ${slot.nap ? '<i class="fa-solid fa-moon" aria-hidden="true"></i>' : ''}${esc(slot.label)}
                ${status === 'now' ? `<span class="tag btn-accent">${esc(T('slot.now'))}</span>` : ''}
              </h3>
              <p class="text-[11px] ${slot.nap ? 'nap-ink opacity-80' : 'muted'} truncate">${esc(isClosed ? closed[slot.key] : slot.hint)}</p>
            </div>
            ${isClosed ? '' : `<button data-action="pick-activity" data-slot="${slot.key}" class="shrink-0 w-10 h-10 rounded-xl btn-soft" aria-label="${esc(T('slot.addAria', { slot: slot.label }))}"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>`}
          </div>
          <div class="space-y-2">
            ${fixed.map(fixedCard).join('')}
            ${items.map(([k, it]) => itemCard(d.key, slot.key, k, it)).join('')}
            ${isClosed ? '' : sugg.map(s => suggestionCard(d.key, slot.key, s)).join('')}
            ${!fixed.length && !items.length && (isClosed || !sugg.length) ? `<p class="text-xs muted text-center py-3">${isClosed ? esc(closed[slot.key]) : esc(T('slot.empty'))}</p>` : ''}
          </div>
        </div>
      </section>`;
    });
    html += '</div>';
    $('#planBody').innerHTML = html;
  }

  function renderSummary() {
    const today = todayKey();
    $('#planBody').innerHTML = `<div class="space-y-3">${DAYS.map(d => {
      const rows = SLOTS.map(slot => {
        const fixed = fixedEventsFor(d.key, slot.key).map(e => `<span class="muted">${esc(e.title)}</span>`);
        const items = Object.values(slotItems(d.key, slot.key))
          .sort((a, b) => (b.confirmed ? 1 : 0) - (a.confirmed ? 1 : 0))
          .map(i => i.confirmed ? `<strong>${esc(itemName(i))} ✓</strong>` : esc(itemName(i)));
        const all = fixed.concat(items);
        if (!all.length) return '';
        return `<div class="flex gap-3 text-sm py-1"><span class="w-20 shrink-0 text-[11px] font-bold muted pt-0.5">${esc(slot.label)}</span><span class="min-w-0">${all.join(' · ')}</span></div>`;
      }).join('');
      return `<button data-action="open-day" data-day="${d.key}" class="surface rounded-2xl p-4 w-full text-left block hover:shadow-md transition ${d.key === today ? 'ring-accent' : ''}">
        <div class="flex items-center justify-between mb-1">
          <h3 class="font-extrabold">${esc(d.title)}</h3>
          <i class="fa-solid fa-chevron-right text-xs muted" aria-hidden="true"></i>
        </div>
        <p class="text-[11px] muted mb-2">${esc(d.desc)}</p>
        ${rows || `<p class="text-xs muted">${esc(T('summary.empty'))}</p>`}
      </button>`;
    }).join('')}</div>`;
  }

  function renderPlan() {
    if (!DAYS.length || !SLOTS.length) { $('#dayChips').innerHTML = ''; $('#planBody').innerHTML = ''; return; }
    renderDayChips();
    if (state.view === 'summary') renderSummary(); else renderTimeline();
  }

  // ---------- RENDER: havuz ----------
  // Listeler: kişilerin/ekibin derlediği sıralı ya da bölümlü öneri listeleri (ör. "Atay'ın önerileri", "Tapascılar")
  const listOf = id => LISTS.find(l => l.id === id);
  const listEntry = (l, actId) => (l.items || {})[actId] || null;
  const activeList = () => state.poolCat.startsWith('list:') ? listOf(state.poolCat.slice(5)) : null;

  function filteredActivities(targetSlot) {
    const q = state.poolQuery.trim().toLocaleLowerCase(App.lang());
    const lst = activeList();
    const notes = a => LISTS.map(l => (listEntry(l, a.id) || {}).note || '').join(' ');
    let list = allActivities().filter(a =>
      (state.poolCat === 'all' || (lst ? !!listEntry(lst, a.id) : a.cat === state.poolCat)) &&
      (!q || `${a.name} ${a.area} ${a.desc} ${notes(a)}`.toLocaleLowerCase(App.lang()).includes(q)));
    if (targetSlot) list = list.slice().sort((a, b) => (b.best.includes(targetSlot) ? 1 : 0) - (a.best.includes(targetSlot) ? 1 : 0));
    return list;
  }

  function catChipsHtml() {
    const chips = [{ key: 'all', label: T('pool.all'), icon: 'fa-border-all' }]
      .concat(LISTS.map(l => ({ key: 'list:' + l.id, label: l.title, icon: l.icon })))
      .concat(CATEGORIES);
    return chips.map(c => `<button data-action="pool-cat" data-cat="${esc(c.key)}" class="shrink-0 h-9 px-3 rounded-full text-xs font-bold flex items-center gap-1.5 ${state.poolCat === c.key ? 'btn-accent' : 'surface'}"><i class="fa-solid ${safeIcon(c.icon)}" aria-hidden="true"></i>${esc(c.label)}</button>`).join('');
  }

  function poolCard(a, targetSlot) {
    const catLabel = (catOf(a.cat) || { label: T('pool.teamIdea') }).label;
    const fits = targetSlot && a.best.includes(targetSlot);
    return `<div ${targetSlot ? `data-action="add-here" data-act="${esc(a.id)}"` : `draggable="true" data-drag-act="${esc(a.id)}"`}
      class="surface rounded-xl p-3 flex gap-3 ${targetSlot ? 'cursor-pointer hover:shadow-md' : 'lg:cursor-grab'} transition">
      <span class="tag-${esc(a.cat)} w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"><i class="fa-solid ${safeIcon(a.icon)}" aria-hidden="true"></i></span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5 flex-wrap">
          <h4 class="text-sm font-extrabold leading-snug">${esc(a.name)}</h4>
          ${fits ? `<span class="tag btn-soft">${esc(T('pool.fits'))}</span>` : ''}
        </div>
        <div class="flex items-center gap-1.5 flex-wrap mt-0.5">
          <span class="tag tag-${esc(a.cat)}">${esc(catLabel)}</span>
          ${a.res ? `<span class="tag tag-res"><i class="fa-solid fa-ticket" aria-hidden="true"></i> ${esc(T('pool.res'))}</span>` : ''}
          ${a.kid ? '<span class="tag surface2 muted"><i class="fa-solid fa-child" aria-hidden="true"></i></span>' : ''}
          ${a.ai ? `<span class="tag surface2 muted" title="${esc(T('ai.madeBy'))}"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> AI</span>` : ''}
          ${a.area ? `<span class="text-[11px] muted truncate max-w-full">${esc(a.area)}</span>` : ''}
        </div>
        <p class="text-xs muted mt-1 leading-snug [overflow-wrap:anywhere]">${linkify(a.desc)}</p>
        ${listTips(a.id)}
        ${linkButtons(a)}
      </div>
      ${targetSlot ? '<span class="self-start w-9 h-9 shrink-0 rounded-lg btn-soft inline-flex items-center justify-center"><i class="fa-solid fa-plus" aria-hidden="true"></i></span>'
        : `<button data-action="pick-slot" data-act="${esc(a.id)}" class="self-start w-9 h-9 shrink-0 rounded-lg btn-soft" aria-label="${esc(T('pool.addAria', { name: a.name }))}"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>`}
    </div>`;
  }

  // Mekanın girdiği her listenin satırı: kişinin listesiyse avatar + not, değilse ikon + yıldız + not
  function listTips(id) {
    return LISTS.map(l => {
      const e = listEntry(l, id);
      if (!e) return '';
      const by = l.by && person(l.by);
      if (by && e.note) {
        return `<p class="text-[11px] mt-1.5 rounded-lg surface2 px-2 py-1.5 flex gap-1.5 items-start leading-snug">${avatar(by.id, 'w-4 h-4 text-[8px] mt-px')}<span><strong>${esc(by.name)}:</strong> ${esc(e.note)}</span></p>`;
      }
      const stars = '<i class="fa-solid fa-star text-amber-500" aria-hidden="true"></i>'.repeat(Math.max(0, Math.min(5, Number(e.stars) || 0)));
      return `<p class="text-[11px] mt-1.5 flex gap-1.5 items-center flex-wrap"><i class="fa-solid ${safeIcon(l.icon)} terra" aria-hidden="true"></i><strong>${esc(l.title)}</strong>${stars}${e.note ? `<span class="muted">· ${esc(e.note)}</span>` : ''}</p>`;
    }).join('');
  }

  // Liste filtresi: sıralı listede listenin sırası, bölümlü listede bölüm başlıkları
  function poolListHtml(list, targetSlot) {
    if (!list.length) return `<p class="text-sm muted text-center py-6">${esc(T('pool.none'))}</p>`;
    const lst = activeList();
    if (!lst) return list.map(a => poolCard(a, targetSlot)).join('');
    const ord = a => Number((listEntry(lst, a.id) || {}).o) || 0;
    const sorted = list.slice().sort((a, b) => ord(a) - ord(b));
    if (!lst.sections.length) return sorted.map(a => poolCard(a, targetSlot)).join('');
    const known = new Set(lst.sections.map(s => s.key));
    const groups = lst.sections.concat([{ key: '', label: '' }]);
    return groups.map(sec => {
      const items = sorted.filter(a => { const s = (listEntry(lst, a.id) || {}).sec || ''; return sec.key ? s === sec.key : !known.has(s); });
      if (!items.length) return '';
      return (sec.label ? `<h3 class="text-xs font-extrabold uppercase tracking-wide muted pt-2">${esc(sec.label)}</h3>` : '') + items.map(a => poolCard(a, targetSlot)).join('');
    }).join('');
  }

  function aiEmptyCard(textKey, tab) {
    return `<div class="dashed rounded-2xl p-4 text-center space-y-2.5">
      <i class="fa-solid fa-wand-magic-sparkles text-xl accent" aria-hidden="true"></i>
      <p class="text-sm">${esc(T(textKey))}</p>
      <button data-action="ai-open" data-tab="${tab}" class="h-10 px-4 rounded-xl btn-accent text-sm font-bold"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> ${esc(T(tab === 'practical' ? 'ai.goPractical' : 'ai.goPlaces'))}</button>
    </div>`;
  }

  function renderPool() {
    $('#poolCats').innerHTML = catChipsHtml();
    $('#poolList').innerHTML = allActivities().length
      ? poolListHtml(filteredActivities(null), null)
      : aiEmptyCard('ai.poolEmpty', 'places');
  }

  // ---------- RENDER: kararlar, ekip, checklist ----------
  function renderTeam() {
    const members = D().claims || {}; // kişi → hesabı bağlanmış mı
    const joined = PEOPLE.filter(p => members[p.id]).length;
    $('#teamCard').innerHTML = `<div class="surface rounded-2xl p-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-extrabold">${esc(T('team.title'))}</h2>
        <span class="text-[11px] muted">${esc(T('team.joined', { n: joined, m: PEOPLE.length }))}</span>
      </div>
      <div class="flex gap-2 flex-wrap">${PEOPLE.map(p => `<div class="flex flex-col items-center gap-1 w-12 ${members[p.id] ? '' : 'opacity-35'}">${avatar(p.id, 'w-9 h-9 text-sm')}<span class="text-[10px] font-semibold truncate w-full text-center">${esc(p.name)}</span></div>`).join('')}</div>
      <div class="mt-3 grid gap-1.5">${Object.entries(GROUPS).map(([k, g]) => `<p class="text-[11px] muted"><strong class="accent">${k}</strong> · ${esc(g.who)}</p>`).join('')}</div>
    </div>`;
  }

  function renderDecisions() {
    $('#decisions').innerHTML = DECISIONS.map(dec => {
      const t = decisionTally(dec.id);
      return `<div class="surface rounded-2xl p-4">
        <div class="flex items-center gap-2 mb-1">
          <i class="fa-solid ${dec.icon} terra" aria-hidden="true"></i>
          <h2 class="text-sm font-extrabold">${esc(dec.title)}</h2>
          <span class="ml-auto text-[11px] muted">${esc(T('dec.votes', { n: t.total, m: PEOPLE.length }))}</span>
        </div>
        <p class="text-xs muted mb-3">${esc(dec.desc)}</p>
        <div class="space-y-2">${dec.options.map(o => {
          const voters = t.counts[o.id] || [];
          const pct = Math.round(voters.length / PEOPLE.length * 100);
          const mine = t.mine === o.id;
          return `<button data-action="decide" data-dec="${dec.id}" data-opt="${o.id}" class="relative w-full text-left rounded-xl p-3 overflow-hidden border ${mine ? 'ring-accent line' : 'line'}">
            <span class="absolute inset-y-0 left-0 btn-soft" style="width:${pct}%" aria-hidden="true"></span>
            <span class="relative flex items-center gap-2">
              <span class="w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center ${mine ? 'btn-accent border-transparent' : 'line'}">${mine ? '<i class="fa-solid fa-check text-[10px]" aria-hidden="true"></i>' : ''}</span>
              <span class="font-bold text-sm">${esc(o.label)}</span>
              ${t.winner === o.id ? `<span class="tag btn-accent">${esc(T('dec.leading'))}</span>` : ''}
              <span class="ml-auto flex -space-x-1.5">${voters.map(u => avatar(u, 'w-5 h-5 text-[9px] ring-2 ring-white/70')).join('')}</span>
            </span>
            <span class="relative block text-[11px] muted mt-1 pl-7">${esc(o.sub)}</span>
          </button>`;
        }).join('')}</div>
      </div>`;
    }).join('');
  }

  function renderChecklist() {
    if (!CHECKLIST.length) { $('#checklist').innerHTML = ''; return; }
    const done = D().checklist || {};
    const n = CHECKLIST.filter(c => done[c.id] && done[c.id].done).length;
    const cats = [...new Set(CHECKLIST.map(c => c.cat))];
    $('#checklist').innerHTML = `<div class="surface rounded-2xl p-4">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-sm font-extrabold flex items-center gap-2"><i class="fa-solid fa-list-check accent" aria-hidden="true"></i> ${esc(T('check.title'))}</h2>
        <span class="text-[11px] font-bold muted">${n}/${CHECKLIST.length}</span>
      </div>
      <div class="h-1.5 rounded-full surface2 mb-3 overflow-hidden"><div class="h-full btn-accent" style="width:${Math.round(n / CHECKLIST.length * 100)}%"></div></div>
      ${cats.map(cat => `<div class="mb-2">
        <p class="text-[10px] font-bold uppercase tracking-wide muted mb-1">${esc(cat)}</p>
        ${CHECKLIST.filter(c => c.cat === cat).map(c => {
          const st = done[c.id] || {};
          const by = person(st.by);
          return `<div class="flex items-center gap-1">
            <button data-action="check" data-id="${c.id}" class="flex-1 min-w-0 flex items-center gap-2.5 py-2 text-left">
              <span class="w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center ${st.done ? 'btn-accent border-transparent' : 'line'}">${st.done ? '<i class="fa-solid fa-check text-[10px]" aria-hidden="true"></i>' : ''}</span>
              <span class="text-sm flex-1 ${st.done ? 'line-through muted' : ''}">${esc(c.text)}</span>
              ${st.done && by ? avatar(by.id, 'w-5 h-5 text-[9px]') : ''}
            </button>
            ${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener" class="w-9 h-9 shrink-0 rounded-lg inline-flex items-center justify-center accent" title="${esc(T('check.linkTitle'))}" aria-label="${esc(c.text)} · ${esc(T('check.linkTitle'))}"><i class="fa-solid fa-arrow-up-right-from-square text-xs" aria-hidden="true"></i></a>` : ''}
          </div>`;
        }).join('')}
      </div>`).join('')}
    </div>`;
  }

  function renderPractical() {
    const title = `<h2 class="text-sm font-extrabold flex items-center gap-2"><i class="fa-solid fa-circle-info accent" aria-hidden="true"></i> ${esc(T('practical.title'))}</h2>`;
    if (!PRACTICAL.length) {
      $('#practical').innerHTML = `<div class="surface rounded-2xl p-4 space-y-3">${title}
        ${isOwner() ? aiEmptyCard('ai.practicalEmpty', 'practical') : `<p class="text-xs muted">${esc(T('ai.practicalEmptyMember'))}</p>`}
      </div>`;
      return;
    }
    $('#practical').innerHTML = `<div class="surface rounded-2xl p-4">
      <div class="flex items-center justify-between gap-2 mb-3">${title}
        ${isOwner() ? `<button data-action="ai-open" data-tab="practical" class="h-8 px-2.5 rounded-lg btn-ghost text-xs font-bold" title="${esc(T('ai.refreshPractical'))}" aria-label="${esc(T('ai.refreshPractical'))}"><i class="fa-solid fa-wand-magic-sparkles accent" aria-hidden="true"></i></button>` : ''}
      </div>
      <div class="space-y-3">${PRACTICAL.map(p => `<div class="flex gap-3">
        <i class="fa-solid ${p.icon} w-4 text-center terra mt-0.5" aria-hidden="true"></i>
        <div><p class="text-xs font-bold">${esc(p.title)}</p><p class="text-xs muted leading-snug">${esc(p.text)}</p></div>
      </div>`).join('')}</div>
    </div>`;
  }

  // ---------- RENDER: değerlendirme (seyahat sonrası anket) ----------
  // Kişi başı puanlar: reviews/<activityId>/<kişi> = { went, rating, kids, again, note, at }
  const KIDS_OPTS = [{ v: 'loved', e: '😍' }, { v: 'ok', e: '🙂' }, { v: 'no', e: '😕' }];
  const reviewsOf = id => (D().reviews || {})[id] || {};
  const myReview = id => reviewsOf(id)[state.me] || null;
  const isReviewed = r => !!r && (r.went === false || !!r.rating);
  const decimal = n => n.toFixed(1).replace('.', ',');

  // Plandaki her yer bir kez (ilk geçtiği gün sırasıyla) + planda olmayıp birinin "gittik" dediği yerler.
  // Havuzda/kendi önerilerde karşılığı olmayan kalemler (havalimanı transferi gibi) ankete girmez.
  function reviewPlaces() {
    const map = new Map();
    DAYS.forEach(d => SLOTS.forEach(sl => {
      Object.values(slotItems(d.key, sl.key)).forEach(it => {
        const act = activity(it.activityId);
        if (!act) return;
        const e = map.get(act.id) || { act, where: [] };
        const w = `${d.short} ${d.num} ${sl.label}`;
        if (!e.where.includes(w)) e.where.push(w);
        map.set(act.id, e);
      });
    }));
    Object.keys(D().reviews || {}).forEach(id => {
      const act = !map.has(id) && activity(id);
      if (act) map.set(id, { act, where: [] });
    });
    return [...map.values()];
  }

  // patch null → kaydı sil; replace → kaydı baştan yaz; yoksa alanları güncelle. Sonuç: başarılı mı
  function reviewWrite(id, patch, replace) {
    const ref = tripRef.child(`reviews/${id}/${state.me}`);
    const val = patch && Object.assign({}, patch, { at: firebase.database.ServerValue.TIMESTAMP });
    return (replace || !patch ? ref.set(val || null) : ref.update(val))
      .then(() => true, err => { toast(T('toast.saveFail', { e: err.code })); return false; });
  }

  function reviewCard(p) {
    const a = p.act;
    const id = esc(a.id);
    const r = myReview(a.id);
    const done = isReviewed(r);
    const others = PEOPLE.filter(x => x.id !== state.me && isReviewed(reviewsOf(a.id)[x.id]));
    const seg = (v, label, icon, on) => `<button data-action="rv-went" data-id="${id}" data-v="${v}" class="h-10 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 ${on ? 'btn-accent' : 'btn-ghost'}"><i class="fa-solid ${icon}" aria-hidden="true"></i>${esc(label)}</button>`;
    let detail = '';
    if (r && r.went) {
      const stars = [1, 2, 3, 4, 5].map(n => `<button data-action="rv-rate" data-id="${id}" data-n="${n}" class="w-10 h-10 rounded-lg text-xl ${r.rating >= n ? 'text-amber-500' : 'muted opacity-40'}" aria-label="${n}/5"><i class="fa-solid fa-star" aria-hidden="true"></i></button>`).join('');
      const kids = KIDS_OPTS.map(k => `<button data-action="rv-kids" data-id="${id}" data-v="${k.v}" class="h-9 px-2.5 rounded-full text-xs font-bold ${r.kids === k.v ? 'btn-soft ring-accent' : 'surface2'}">${k.e} ${esc(T('rv.kids.' + k.v))}</button>`).join('');
      detail = `
        <div class="flex items-center gap-0.5">${stars}${r.rating ? '' : `<span class="text-[11px] terra font-bold ml-2">${esc(T('rv.rateHint'))}</span>`}</div>
        <div class="flex items-center gap-1.5 flex-wrap"><span class="text-[11px] font-bold muted mr-1">${esc(T('rv.kids'))}</span>${kids}</div>
        <div class="flex gap-2 flex-wrap">
          <button data-action="rv-again" data-id="${id}" class="h-9 px-3 rounded-xl text-xs font-bold ${r.again ? 'btn-soft ring-accent' : 'btn-ghost'}"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> ${esc(T('rv.again'))}</button>
          <button data-action="rv-note" data-id="${id}" class="h-9 px-3 rounded-xl btn-ghost text-xs font-bold"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${esc(T(r.note ? 'rv.noteEdit' : 'rv.noteAdd'))}</button>
        </div>
        ${r.note ? `<p class="text-xs rounded-lg surface2 px-2.5 py-2 whitespace-pre-line [overflow-wrap:anywhere]">${esc(r.note)}</p>` : ''}`;
    }
    return `<article class="surface rounded-2xl p-3.5 space-y-3 ${done ? '' : 'ring-accent'}">
      <div class="flex items-start gap-3">
        <span class="tag-${esc(a.cat)} w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"><i class="fa-solid ${a.icon || 'fa-star'}" aria-hidden="true"></i></span>
        <div class="min-w-0 flex-1">
          <h3 class="text-sm font-extrabold leading-snug">${esc(a.name)}${done ? ' <i class="fa-solid fa-circle-check ok text-xs" aria-hidden="true"></i>' : ''}</h3>
          <p class="text-[11px] muted truncate">${esc(p.where.length ? p.where.join(' · ') : T('rv.extra'))}</p>
        </div>
        <span class="flex -space-x-1.5 shrink-0" title="${esc(T('rv.othersDone'))}">${others.map(x => avatar(x.id, 'w-5 h-5 text-[9px] ring-2 ring-white/70')).join('')}</span>
      </div>
      <div class="grid grid-cols-2 gap-2">${seg(1, T('rv.went'), 'fa-check', r && r.went === true)}${seg(0, T('rv.notWent'), 'fa-xmark', r && r.went === false)}</div>
      ${detail}
    </article>`;
  }

  function reviewResultsHtml(places) {
    const rows = places.map(p => {
      const all = reviewsOf(p.act.id);
      const rated = PEOPLE.map(x => [x, all[x.id]]).filter(([, r]) => r && r.went && r.rating);
      const avg = rated.length ? rated.reduce((s, [, r]) => s + r.rating, 0) / rated.length : 0;
      return { p, rated, avg, again: rated.filter(([, r]) => r.again).length };
    });
    const scored = rows.filter(r => r.rated.length).sort((a, b) => b.avg - a.avg || b.rated.length - a.rated.length || b.again - a.again);
    const unrated = rows.filter(r => !r.rated.length);
    if (!scored.length) return `<p class="text-sm muted text-center py-8">${esc(T('rv.noResults'))}</p>`;
    return scored.map((r, i) => `<article class="surface rounded-2xl p-3.5 space-y-2.5">
        <div class="flex items-start gap-3">
          <span class="w-9 h-9 shrink-0 rounded-xl surface2 flex items-center justify-center text-sm font-extrabold">${i + 1}</span>
          <div class="min-w-0 flex-1">
            <h3 class="text-sm font-extrabold leading-snug">${esc(r.p.act.name)}</h3>
            <p class="text-[11px] muted">${esc(T('rv.summary', { n: r.rated.length }) + (r.again ? T('rv.summaryAgain', { a: r.again }) : ''))}</p>
          </div>
          <span class="shrink-0 text-lg font-extrabold text-amber-500"><i class="fa-solid fa-star text-sm" aria-hidden="true"></i> ${decimal(r.avg)}</span>
        </div>
        <div class="space-y-1.5">${r.rated.map(([x, rv]) => {
          const kid = KIDS_OPTS.find(k => k.v === rv.kids);
          return `<div class="flex items-start gap-2 text-xs">
            ${avatar(x.id, 'w-5 h-5 text-[9px]')}
            <span class="font-bold shrink-0 mt-0.5">${rv.rating}★</span>
            ${rv.again ? `<i class="fa-solid fa-rotate-right accent mt-1" title="${esc(T('rv.again'))}" aria-label="${esc(T('rv.again'))}"></i>` : ''}
            ${kid ? `<span class="mt-0.5" title="${esc(T('rv.kids') + ': ' + T('rv.kids.' + kid.v))}">${kid.e}</span>` : ''}
            ${rv.note ? `<span class="muted mt-0.5 min-w-0 [overflow-wrap:anywhere]">${esc(rv.note)}</span>` : ''}
          </div>`;
        }).join('')}</div>
      </article>`).join('') +
      (unrated.length ? `<p class="text-xs muted px-1">${esc(T('rv.unrated'))}: ${unrated.map(r => esc(r.p.act.name)).join(', ')}</p>` : '');
  }

  function renderReview() {
    const places = reviewPlaces();
    const pending = places.filter(p => !isReviewed(myReview(p.act.id))).length;
    const progress = PEOPLE.map(p => {
      const n = places.filter(x => isReviewed(reviewsOf(x.act.id)[p.id])).length;
      return `<div class="flex flex-col items-center gap-1 w-12">${avatar(p.id, 'w-9 h-9 text-sm')}<span class="text-[10px] font-bold ${places.length && n === places.length ? 'ok' : 'muted'}">${n}/${places.length}</span></div>`;
    }).join('');
    const views = [['mine', T('rv.mine')], ['results', T('rv.results')]].map(([k, l]) =>
      `<button data-action="rv-view" data-v="${k}" class="h-10 rounded-xl text-sm font-bold ${state.reviewView === k ? 'btn-accent' : 'surface'}">${esc(l)}</button>`).join('');
    const body = state.reviewView === 'results'
      ? reviewResultsHtml(places)
      : places.map(reviewCard).join('') + `<button data-action="rv-add-open" class="w-full h-12 rounded-xl border border-dashed line text-sm font-bold muted"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${esc(T('rv.addExtra'))}</button>`;
    $('#reviewBody').innerHTML = `<div class="space-y-4">
      <div>
        <h2 class="text-xl font-extrabold">${esc(T('rv.title'))}</h2>
        <p class="text-sm muted">${esc(T('rv.sub'))}</p>
      </div>
      <div class="surface rounded-2xl p-3 flex items-center justify-between gap-3 flex-wrap">
        <div class="flex gap-1">${progress}</div>
        <p class="text-xs font-bold ${pending ? 'terra' : 'ok'}">${esc(pending ? T('rv.pending', { n: pending }) : T('rv.allDone'))}</p>
      </div>
      <div class="grid grid-cols-2 gap-2">${views}</div>
      <div class="space-y-3">${body}</div>
    </div>`;
    const b = $('#reviewBadge');
    b.textContent = pending > 9 ? '9+' : String(pending);
    b.classList.toggle('hidden', !pending);
  }

  // ---------- RENDER: sohbet ----------
  function chatMessages() {
    return Object.values(D().discussions || {}).filter(m => m && m.text).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).slice(-100);
  }

  function renderChat() {
    const box = $('#chatList');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    const msgs = chatMessages();
    const today = localDate(new Date());
    box.innerHTML = msgs.length ? msgs.map(m => {
      const mine = m.user === state.me;
      const p = person(m.user);
      const d = new Date(m.timestamp || Date.now());
      const when = (localDate(d) === today ? '' : `${d.getDate()}.${d.getMonth() + 1} `) + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      return `<div class="flex gap-2 ${mine ? 'flex-row-reverse' : ''}">
        ${mine ? '' : avatar(m.user)}
        <div class="max-w-[80%] ${mine ? 'text-right' : ''}">
          <div class="text-[10px] muted mb-0.5">${mine ? '' : esc(p ? p.name : (L(FORMER_PEOPLE[m.user]) || m.user)) + ' · '}${when}</div>
          <div class="inline-block max-w-full text-left px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${mine ? 'btn-accent rounded-tr-md' : 'surface2 rounded-tl-md'}">${esc(m.text)}</div>
        </div>
      </div>`;
    }).join('') : `<p class="text-sm muted text-center py-8">${esc(T('chat.empty'))}</p>`;
    if (atBottom || !renderChat.didInit) box.scrollTop = box.scrollHeight;
    renderChat.didInit = true;
    updateChatBadge();
  }

  function updateChatBadge() {
    const msgs = chatMessages();
    const chatVisible = isDesktop() || state.tab === 'chat';
    if (chatVisible && msgs.length) LS.set(LS_CHAT_SEEN + state.key, String(msgs[msgs.length - 1].timestamp || Date.now()));
    const seen = Number(LS.get(LS_CHAT_SEEN + state.key) || 0);
    const unread = msgs.filter(m => m.user !== state.me && (m.timestamp || 0) > seen).length;
    const b = $('#chatBadge');
    b.textContent = unread > 9 ? '9+' : String(unread);
    b.classList.toggle('hidden', !unread);
    const myDecisions = DECISIONS.every(dec => decisionTally(dec.id).mine);
    $("#decideBadge").classList.toggle("hidden", myDecisions || !DECISIONS.length);
  }

  function renderAll() {
    if (!state.me) return;
    renderHeader();
    renderTabs();
    renderPlan();
    renderPool();
    renderTeam();
    renderDecisions();
    renderChecklist();
    renderPractical();
    renderChat();
    renderReview();
    if (state.sheet) renderSheet(true);
  }

  // ---------- ALT SAYFA (sheet) ----------
  function openSheet(s) {
    state.sheet = s;
    renderSheet(false);
    const el = $('#sheet');
    el.classList.remove('sheet-hidden');
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const focusEl = $('#sheetContent [data-autofocus]');
    if (focusEl && isDesktop()) setTimeout(() => focusEl.focus(), 50);
  }

  function closeSheet() {
    if (aiJob) { aiJob.abort(); aiJob = null; }
    state.sheet = null;
    const el = $('#sheet');
    el.classList.add('sheet-hidden');
    el.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function sheetHeader(title, sub) {
    return `<div class="px-5 pt-3 pb-3 flex items-start gap-3 border-b line">
      <div class="min-w-0 flex-1"><h2 class="text-lg font-extrabold leading-tight">${title}</h2>${sub ? `<p class="text-xs muted mt-0.5">${sub}</p>` : ''}</div>
      <button data-action="close" class="w-9 h-9 shrink-0 rounded-full btn-ghost" aria-label="${esc(T('sheet.close'))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    </div>`;
  }

  function renderSheet(isUpdate) {
    const s = state.sheet;
    const c = $('#sheetContent');
    if (!s) return;
    if (s.type === 'pick-activity') {
      if (!isUpdate) {
        const d = dayOf(s.day);
        c.innerHTML = sheetHeader(esc(T('sheet.addTo', { slot: slotOf(s.slot).label })), `${esc(d.title)} · ${slotOf(s.slot).start}–${slotOf(s.slot).end}`) + `
          <div class="px-5 pt-3 space-y-2">
            <input id="sheetSearch" data-autofocus type="search" placeholder="${esc(T('sheet.search'))}" value="${esc(state.poolQuery)}" class="w-full rounded-xl px-3 py-2.5 text-sm">
            <div id="sheetCats" class="flex gap-1.5 overflow-x-auto hide-scrollbar pb-1"></div>
          </div>
          <div id="sheetList" class="px-5 py-3 space-y-2 overflow-y-auto flex-1"></div>
          <div class="px-5 py-3 border-t line pb-safe"><button data-action="custom" class="w-full h-11 rounded-xl btn-ghost text-sm font-bold"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${esc(T('sheet.notListed'))}</button></div>`;
      }
      $('#sheetCats').innerHTML = catChipsHtml();
      $('#sheetList').innerHTML = poolListHtml(filteredActivities(s.slot), s.slot);
      return;
    }
    if (s.type === 'pick-slot') {
      const act = activity(s.act);
      const pickDay = s.pickDay || state.day;
      const title = s.move ? esc(T('sheet.move')) : esc(act ? act.name : '');
      c.innerHTML = sheetHeader(title, s.move ? esc(s.move.name) : esc(T('sheet.whichSlot'))) + `
        <div class="px-5 py-4 space-y-4 overflow-y-auto pb-safe">
          <div class="flex gap-1.5 overflow-x-auto hide-scrollbar">${DAYS.map(d => `<button data-action="sheet-day" data-day="${d.key}" class="shrink-0 w-[52px] h-12 rounded-xl flex flex-col items-center justify-center leading-none ${d.key === pickDay ? 'btn-accent' : 'surface'}"><span class="text-[10px] font-bold">${d.short}</span><span class="text-base font-extrabold">${d.num}</span></button>`).join('')}</div>
          <div class="grid grid-cols-2 gap-2">${SLOTS.map(sl => {
            const closed = (dayOf(pickDay).closed || {})[sl.key];
            return `<button data-action="sheet-slot" data-slot="${sl.key}" ${closed ? 'disabled' : ''} class="rounded-xl p-3 text-left border ${sl.nap ? 'nap' : 'surface'} ${closed ? 'opacity-40' : 'hover:ring-accent'}">
              <span class="block text-sm font-extrabold ${sl.nap ? 'nap-ink' : ''}">${esc(sl.label)}</span>
              <span class="block text-[11px] muted">${closed ? esc(closed) : sl.start + '–' + sl.end}</span>
              ${act && act.best.includes(sl.key) && !closed ? `<span class="tag btn-soft mt-1 inline-block">${esc(T('sheet.fits'))}</span>` : ''}
            </button>`;
          }).join('')}</div>
        </div>`;
      return;
    }
    if (s.type === 'detail') {
      const item = slotItems(s.day, s.slot)[s.key];
      if (!item) { closeSheet(); return; }
      const act = activity(item.activityId) || {};
      const t = voteTally(s.key);
      const by = person(item.addedBy);
      const groups = item.groups || {};
      const key = esc(s.key);
      const desc = act.desc || '';
      const name = itemName(item);
      const area = itemArea(item);
      // Canlı güncellemeler sheet'i yeniden çizer; yazılan metni, odağı ve kaydırmayı koru
      const keep = {};
      if (isUpdate) {
        const body = $('#detailBody');
        if (body) keep.scroll = body.scrollTop;
        const form = $('#infoForm');
        if (form && s.editInfo) {
          keep.ticket = form.elements.ticket.value;
          keep.note = form.elements.note.value;
          const a = document.activeElement;
          if (a && a.form === form) keep.focus = { name: a.name, start: a.selectionStart, end: a.selectionEnd };
        }
      }
      const infoBy = person(item.infoBy);
      const fld = 'mt-1 w-full rounded-xl px-3 py-2.5 text-sm';
      const files = Object.entries(item.files || {});
      const fileRow = ([fid, f]) => `<div class="flex items-center gap-2">
            <button data-action="open-file" data-fid="${esc(fid)}" class="flex-1 min-w-0 h-11 px-3 rounded-xl btn-ghost inline-flex items-center gap-2 text-sm font-bold text-left">
              <i class="fa-solid ${f.type === 'application/pdf' ? 'fa-file-pdf bad' : 'fa-file-image accent'}" aria-hidden="true"></i><span class="truncate">${esc(f.name)}</span><span class="text-[11px] muted font-normal shrink-0">${fileSize(f.size)}</span>
            </button>
            ${s.editInfo ? `<button type="button" data-action="del-file" data-fid="${esc(fid)}" class="w-11 h-11 shrink-0 rounded-xl btn-ghost bad" aria-label="${esc(T('file.del'))}"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>` : ''}
          </div>`;
      const filesHtml = files.map(fileRow).join('');
      const infoHtml = s.editInfo ? `
          <form id="infoForm" class="space-y-3">
            <label class="block"><span class="text-xs font-bold muted">${esc(T('info.ticket'))}</span><textarea name="ticket" maxlength="500" rows="2" class="${fld}" placeholder="${esc(T('info.ticketPh'))}">${esc(item.ticket || '')}</textarea></label>
            <label class="block"><span class="text-xs font-bold muted">${esc(T('info.note'))}</span><textarea name="note" maxlength="1000" rows="4" class="${fld}" placeholder="${esc(T('info.notePh'))}">${esc(item.note || '')}</textarea></label>
            <div class="space-y-2">
              <span class="text-xs font-bold muted">${esc(T('file.title'))}</span>
              ${filesHtml}
              <label class="h-11 rounded-xl border border-dashed line text-sm muted font-bold flex items-center justify-center gap-2 cursor-pointer">
                <i class="fa-solid fa-paperclip" aria-hidden="true"></i> ${esc(T('file.add', { mb: MAX_FILE_MB }))}
                <input id="fileInput" type="file" accept="application/pdf,image/*" class="sr-only">
              </label>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <button type="button" data-action="cancel-info" class="h-11 rounded-xl btn-ghost text-sm font-bold">${esc(T('info.cancel'))}</button>
              <button type="submit" class="h-11 rounded-xl btn-accent text-sm font-bold">${esc(T('info.save'))}</button>
            </div>
          </form>`
        : (item.ticket || item.note || files.length) ? `
          <div class="rounded-xl surface2 p-3 space-y-2.5">
            ${filesHtml}
            ${item.ticket ? `<div class="flex gap-2.5 text-sm"><i class="fa-solid fa-ticket ok mt-1" aria-hidden="true"></i><div class="min-w-0 break-words whitespace-pre-line">${linkify(item.ticket)}</div></div>` : ''}
            ${item.note ? `<div class="flex gap-2.5 text-sm"><i class="fa-solid fa-note-sticky muted mt-1" aria-hidden="true"></i><div class="min-w-0 break-words whitespace-pre-line">${linkify(item.note)}</div></div>` : ''}
            ${infoBy ? `<p class="text-[11px] muted">${esc(T('info.by', { name: infoBy.name }))}${item.infoAt ? ' · ' + new Date(item.infoAt).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</p>` : ''}
          </div>`
        : `<button data-action="edit-info" class="w-full rounded-xl border border-dashed line p-3 text-sm muted text-left"><i class="fa-solid fa-ticket" aria-hidden="true"></i> ${esc(T('info.add'))}</button>`;
      c.innerHTML = sheetHeader(esc(name), `${esc(dayOf(s.day).title)} · ${esc(slotOf(s.slot).label)} ${slotOf(s.slot).start}–${slotOf(s.slot).end}`) + `
        <div id="detailBody" class="px-5 py-4 space-y-5 overflow-y-auto pb-safe">
          <div class="flex flex-wrap gap-1.5 items-center">
            <span class="tag tag-${esc(item.cat || 'custom')}">${esc((catOf(item.cat) || { label: T('pool.teamIdea') }).label)}</span>
            ${act.res ? `<span class="tag tag-res"><i class="fa-solid fa-ticket" aria-hidden="true"></i> ${esc(T('item.resNeeded'))}</span>` : ''}
            ${area ? `<span class="text-xs muted truncate max-w-full">${esc(area)}</span>` : ''}
          </div>
          ${desc ? `<p class="text-sm leading-relaxed [overflow-wrap:anywhere]">${linkify(desc)}</p>` : ''}
          ${listTips(item.activityId)}
          <div class="flex flex-wrap gap-2">
            ${act.url ? `<a href="${esc(act.url)}" target="_blank" rel="noopener" class="h-10 px-4 rounded-xl btn-ghost inline-flex items-center gap-2 text-sm font-bold"><i class="fa-solid fa-globe accent" aria-hidden="true"></i> ${esc(T('link.web'))}</a>` : ''}
            ${item.noMap ? '' : `<a href="${esc(mapsFor({ name, addr: act.addr, area }))}" target="_blank" rel="noopener" class="h-10 px-4 rounded-xl btn-ghost inline-flex items-center gap-2 text-sm font-bold"><i class="fa-solid fa-location-dot terra" aria-hidden="true"></i> ${esc(T('link.mapOpen'))}</a>`}
          </div>

          <div>
            <p class="text-xs font-bold muted mb-2">${esc(T('detail.votes'))}</p>
            <div class="grid grid-cols-2 gap-2">
              <button data-action="vote" data-key="${key}" data-v="up" class="rounded-xl p-3 border line text-left ${t.mine === 'up' ? 'ring-accent' : ''}">
                <span class="text-sm font-extrabold ok"><i class="fa-solid fa-thumbs-up" aria-hidden="true"></i> ${t.up.length}</span>
                <span class="flex -space-x-1 mt-1.5 min-h-[20px]">${t.up.map(u => avatar(u, 'w-5 h-5 text-[9px]')).join('')}</span>
              </button>
              <button data-action="vote" data-key="${key}" data-v="down" class="rounded-xl p-3 border line text-left ${t.mine === 'down' ? 'ring-accent' : ''}">
                <span class="text-sm font-extrabold bad"><i class="fa-solid fa-thumbs-down" aria-hidden="true"></i> ${t.down.length}</span>
                <span class="flex -space-x-1 mt-1.5 min-h-[20px]">${t.down.map(u => avatar(u, 'w-5 h-5 text-[9px]')).join('')}</span>
              </button>
            </div>
          </div>

          ${Object.keys(GROUPS).length > 1 ? `<div>
            <p class="text-xs font-bold muted mb-2">${esc(T('detail.who'))}</p>
            <div class="grid grid-cols-2 gap-2">${Object.entries(GROUPS).map(([g, info]) => `
              <button data-action="group" data-g="${g}" class="rounded-xl p-2.5 border text-left ${groups[g] ? 'btn-soft ring-accent line' : 'line'}">
                <span class="block text-sm font-extrabold">${g}</span>
                <span class="block text-[10px] muted leading-tight">${esc(String(info.who || info.label || '').split(',')[0])}…</span>
              </button>`).join('')}</div>
          </div>` : ''}

          <div>
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs font-bold muted">${esc(T('info.title'))}</p>
              ${!s.editInfo && (item.ticket || item.note || files.length) ? `<button data-action="edit-info" class="h-8 px-2.5 rounded-lg btn-ghost text-xs font-bold"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${esc(T('info.edit'))}</button>` : ''}
            </div>
            ${infoHtml}
          </div>

          <div class="flex flex-col gap-2">
            <button data-action="confirm-item" class="h-12 rounded-xl text-sm font-bold ${item.confirmed ? 'btn-ghost' : 'btn-accent'}">
              <i class="fa-solid ${item.confirmed ? 'fa-rotate-left' : 'fa-check'}" aria-hidden="true"></i> ${esc(T(item.confirmed ? 'detail.unconfirm' : 'detail.confirm'))}
            </button>
            <div class="grid grid-cols-2 gap-2">
              <button data-action="move" class="h-11 rounded-xl btn-ghost text-sm font-bold"><i class="fa-solid fa-arrows-up-down" aria-hidden="true"></i> ${esc(T('detail.move'))}</button>
              <button data-action="remove" class="h-11 rounded-xl btn-ghost text-sm font-bold bad"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> ${esc(T('detail.remove'))}</button>
            </div>
          </div>
          <p class="text-[11px] muted">${by ? esc(T('detail.addedBy', { name: by.name })) : ''}${item.addedAt ? ' · ' + new Date(item.addedAt).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</p>
        </div>`;
      const form = $('#infoForm');
      if (form && 'ticket' in keep) {
        form.elements.ticket.value = keep.ticket;
        form.elements.note.value = keep.note;
      }
      if (form && keep.focus) {
        const f = form.elements[keep.focus.name];
        f.focus();
        try { f.setSelectionRange(keep.focus.start, keep.focus.end); } catch (e) { /* yok say */ }
      }
      if (keep.scroll) $('#detailBody').scrollTop = keep.scroll;
      return;
    }
    if (s.type === 'ai') { renderAiSheet(c, isUpdate); return; }
    if (s.type === 'custom') {
      if (isUpdate) return;
      const lbl = 'text-xs font-bold muted';
      const inp = 'mt-1 w-full rounded-xl px-3 py-2.5 text-sm';
      c.innerHTML = sheetHeader(esc(T('custom.title')), s.slot ? esc(T('custom.subSlot', { where: `${dayOf(s.day).title} · ${slotOf(s.slot).label}` })) : esc(T('custom.subPool'))) + `
        <form id="customForm" class="px-5 py-4 space-y-3 overflow-y-auto pb-safe">
          <label class="block"><span class="${lbl}">${esc(T('custom.name'))}</span><input name="name" data-autofocus required maxlength="80" class="${inp}" placeholder="${esc(T('custom.namePh'))}"></label>
          <label class="block"><span class="${lbl}">${esc(T('custom.area'))}</span><input name="area" maxlength="60" class="${inp}" placeholder="${esc(T('custom.areaPh'))}"></label>
          <label class="block"><span class="${lbl}">${esc(T('custom.cat'))}</span><select name="cat" class="${inp}">${CATEGORIES.map(c2 => `<option value="${c2.key}">${esc(c2.label)}</option>`).join('')}</select></label>
          <label class="block"><span class="${lbl}">${esc(T('custom.note'))}</span><textarea name="desc" maxlength="300" rows="3" class="${inp}" placeholder="${esc(T('custom.notePh'))}"></textarea></label>
          <button type="submit" class="w-full h-12 rounded-xl btn-accent text-sm font-bold">${esc(T('custom.submit'))}</button>
        </form>`;
      return;
    }
    if (s.type === 'review-note') {
      if (isUpdate) return; // canlı güncelleme yazılan notu silmesin
      const a = activity(s.id);
      const r = myReview(s.id) || {};
      c.innerHTML = sheetHeader(esc(a ? a.name : ''), esc(T('rv.noteSub'))) + `
        <form id="reviewNoteForm" class="px-5 py-4 space-y-3 pb-safe">
          <textarea name="note" data-autofocus maxlength="300" rows="4" class="w-full rounded-xl px-3 py-2.5 text-sm" placeholder="${esc(T('rv.notePh'))}">${esc(r.note || '')}</textarea>
          <button type="submit" class="w-full h-12 rounded-xl btn-accent text-sm font-bold">${esc(T('info.save'))}</button>
        </form>`;
      return;
    }
    if (s.type === 'review-add') {
      if (!isUpdate) {
        c.innerHTML = sheetHeader(esc(T('rv.addTitle')), esc(T('rv.addSub'))) + `
          <div class="px-5 pt-3"><input id="reviewSearch" data-autofocus type="search" placeholder="${esc(T('sheet.search'))}" value="${esc(s.q || '')}" class="w-full rounded-xl px-3 py-2.5 text-sm"></div>
          <div id="reviewAddList" class="px-5 py-3 space-y-2 overflow-y-auto flex-1"></div>
          <div class="px-5 py-3 border-t line pb-safe"><button data-action="rv-custom" class="w-full h-11 rounded-xl btn-ghost text-sm font-bold"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${esc(T('sheet.notListed'))}</button></div>`;
      }
      const have = new Set(reviewPlaces().map(p => p.act.id));
      const q = (s.q || '').trim().toLocaleLowerCase(App.lang());
      const list = allActivities().filter(a => !have.has(a.id) && (!q || `${a.name} ${a.area}`.toLocaleLowerCase(App.lang()).includes(q)));
      $('#reviewAddList').innerHTML = list.length ? list.map(a => `<button data-action="rv-add" data-act="${esc(a.id)}" class="w-full surface rounded-xl p-3 flex items-center gap-3 text-left hover:shadow-md transition">
          <span class="tag-${esc(a.cat)} w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"><i class="fa-solid ${a.icon || 'fa-star'}" aria-hidden="true"></i></span>
          <span class="min-w-0 flex-1"><span class="block text-sm font-extrabold truncate">${esc(a.name)}</span><span class="block text-[11px] muted truncate">${esc(a.area)}</span></span>
          <i class="fa-solid fa-plus accent" aria-hidden="true"></i>
        </button>`).join('') : `<p class="text-sm muted text-center py-6">${esc(T('pool.none'))}</p>`;
      return;
    }
    if (s.type === 'confirm-me') {
      // Onay ekranı seçilen kişinin dilinde gösterilir
      const p = person(s.id);
      const pl = p.lang || 'tr';
      c.innerHTML = sheetHeader(esc(TL(pl, 'me.title', { name: p.name })), '') + `
        <div class="px-5 py-5 space-y-4 pb-safe">
          <div class="flex items-center gap-3">${avatar(p.id, 'w-12 h-12 text-lg')}<p class="text-sm">${TL(pl, 'me.bodyAccount', { name: esc(p.name) })}</p></div>
          <div class="grid grid-cols-2 gap-2">
            <button data-action="close" class="h-12 rounded-xl btn-ghost text-sm font-bold">${esc(TL(pl, 'me.cancel'))}</button>
            <button data-action="confirm-me" data-id="${esc(p.id)}" class="h-12 rounded-xl btn-accent text-sm font-bold">${esc(TL(pl, 'me.ok'))}</button>
          </div>
        </div>`;
      return;
    }
    if (s.type === 'invite') {
      c.innerHTML = sheetHeader(esc(T('invite.title')), esc(T('invite.sub'))) + `
        <div class="px-5 py-5 space-y-3 pb-safe">
          <input readonly value="${esc(s.url)}" class="w-full rounded-xl px-3 py-2.5 text-xs" onfocus="this.select()">
          <p class="text-xs muted">${esc(T('invite.hint'))}</p>
        </div>`;
    }
  }

  // ---------- AI önerileri (Claude) ----------
  // Plan sahibi: öneriler def/pool'a (havuz), pratik bilgiler def/practical'a yazılır.
  // Diğer üyeler: öneriler custom_activities'e "ekip önerisi" olarak eklenir; pratik bilgileri sahibi oluşturur.
  let aiJob = null, aiClock = null;
  const isOwner = () => !!META.owner && META.owner === App.user().uid;
  const bilingual = () => PEOPLE.some(p => p.lang === 'es');
  const normName = s => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, '');

  function aiContext() {
    const def = D().def || {};
    const kids = PEOPLE.filter(p => p.age != null && p.age < 18);
    return {
      city: CITY, cityOrig: def.cityLocal || '', country: L(def.country) || META.country || '',
      start: DAYS[0].date, end: DAYS[DAYS.length - 1].date, days: DAYS.length,
      people: `${PEOPLE.length} kişi` + (kids.length ? `, ${kids.length} çocuk (yaşları: ${kids.map(k => k.age).join(', ')})` : ', hepsi yetişkin'),
      kids: kids.length > 0,
      slots: SLOTS.map(s => ({ key: s.key, label: String(s.label), start: s.start, end: s.end, nap: !!s.nap })),
      existing: allActivities().map(a => a.name),
      es: bilingual()
    };
  }

  // Modelden gelen veri arayüze girmeden önce süzülür
  function cleanPlaces(list) {
    const slotKeys = new Set(SLOTS.map(s => s.key));
    const have = new Set(allActivities().map(a => normName(a.name)));
    const seen = new Set();
    return (Array.isArray(list) ? list : []).filter(p => p && typeof p.name === 'string' && p.name.trim()).map(p => {
      const n = normName(p.name);
      const dup = have.has(n) || seen.has(n);
      seen.add(n);
      return {
        name: p.name.trim().slice(0, 80), area: String(p.area || '').trim().slice(0, 60),
        cat: AI.CATS.includes(p.cat) ? p.cat : 'sight', icon: safeIcon(p.icon, 'fa-star'),
        desc_tr: String(p.desc_tr || '').trim().slice(0, 300), desc_es: String(p.desc_es || '').trim().slice(0, 300),
        best: (Array.isArray(p.best) ? p.best : []).filter(k => slotKeys.has(k)),
        res: p.res === true, kid: p.kid === true,
        url: /^https:\/\/[^\s"'<>]{4,300}$/.test(p.url || '') ? p.url : '',
        dup
      };
    });
  }
  function cleanPractical(list) {
    return (Array.isArray(list) ? list : []).filter(p => p && p.title_tr && p.text_tr).slice(0, 16).map(p => ({
      icon: safeIcon(p.icon, 'fa-circle-info'),
      title_tr: String(p.title_tr).slice(0, 80), text_tr: String(p.text_tr).slice(0, 500),
      title_es: String(p.title_es || '').slice(0, 80), text_es: String(p.text_es || '').slice(0, 500)
    }));
  }

  function aiRun() {
    const s = state.sheet;
    if (!s || s.type !== 'ai' || aiJob) return;
    const ctx = aiContext();
    const req = s.tab === 'practical' ? AI.practicalRequest(ctx) : AI.placesRequest(ctx, (s.wish || '').trim().slice(0, 300), s.count || 15);
    const job = AI.ask(req);
    aiJob = job;
    Object.assign(s, { phase: 'loading', started: Date.now(), err: '' });
    renderSheet(false);
    clearInterval(aiClock);
    aiClock = setInterval(() => { const el = $('#aiElapsed'); if (el && state.sheet === s) el.textContent = T('ai.elapsed', { n: Math.round((Date.now() - s.started) / 1000) }); }, 1000);
    job.promise.then(data => {
      if (state.sheet !== s) return;
      if (s.tab === 'practical') {
        s.result = cleanPractical(data.items);
      } else {
        s.result = cleanPlaces(data.places);
        s.sel = {};
        s.result.forEach((p, i) => { if (!p.dup) s.sel[i] = true; });
      }
      s.phase = s.result.length ? 'result' : 'error';
      if (!s.result.length) s.err = 'empty';
    }, e => {
      if (state.sheet !== s) return;
      if (e.code === 'aborted') { s.phase = 'form'; } else { s.phase = 'error'; s.err = e.code || 'unknown'; }
    }).then(() => {
      if (aiJob === job) aiJob = null;
      clearInterval(aiClock);
      if (state.sheet === s) renderSheet(false);
    });
  }

  function aiAddPlaces() {
    const s = state.sheet;
    const picked = (s.result || []).filter((p, i) => s.sel[i]);
    if (!picked.length) return;
    const es = bilingual();
    const done = n => { toast(T('ai.added', { n })); closeSheet(); state.poolCat = 'all'; renderPool(); };
    const fail = err => toast(T('toast.saveFail', { e: err.code || err.message }));
    if (isOwner()) {
      const items = picked.map(p => App.clean({
        id: 'ai' + App.randomId(10), name: p.name, area: p.area, cat: p.cat, icon: p.icon,
        desc: es && p.desc_es ? { tr: p.desc_tr, es: p.desc_es } : p.desc_tr,
        best: p.best.length ? p.best : null, res: p.res || null, kid: p.kid || null, url: p.url || null, ai: true
      }));
      tripRef.child('def/pool').set(arr((D().def || {}).pool).concat(items)).then(() => done(items.length), fail);
    } else {
      const upd = {};
      picked.forEach(p => {
        upd['custom_activities/' + tripRef.child('custom_activities').push().key] = {
          name: p.name, area: p.area, cat: p.cat, desc: p.desc_tr, addedBy: state.me, addedAt: TS()
        };
      });
      tripRef.update(upd).then(() => done(picked.length), fail);
    }
  }

  function aiSavePractical() {
    const s = state.sheet;
    if (!isOwner() || !(s.result || []).length) return;
    const es = bilingual();
    const items = s.result.map(p => ({
      icon: p.icon,
      title: es && p.title_es ? { tr: p.title_tr, es: p.title_es } : p.title_tr,
      text: es && p.text_es ? { tr: p.text_tr, es: p.text_es } : p.text_tr,
      ai: true
    }));
    tripRef.child('def/practical').set(items).then(() => { toast(T('ai.savedPractical')); closeSheet(); },
      err => toast(T('toast.saveFail', { e: err.code })));
  }

  const slotName = k => { const sl = slotOf(k); return sl ? sl.label : k; };

  function renderAiSheet(c, isUpdate) {
    const s = state.sheet;
    // Canlı veri değişince yazılan isteği / beklemeyi bozma; sadece sonuç listesi tazelenir
    if (isUpdate && s.phase !== 'result') return;
    const owner = isOwner();
    const bodyCls = 'px-5 py-4 space-y-4 overflow-y-auto flex-1';
    const foot = inner => `<div class="px-5 py-3 border-t line pb-safe flex gap-2">${inner}</div>`;
    const btn = (action, label, icon, cls) => `<button data-action="${action}" class="h-12 rounded-xl text-sm font-bold ${cls}">${icon ? `<i class="fa-solid ${icon}" aria-hidden="true"></i> ` : ''}${esc(label)}</button>`;
    const head = sheetHeader(`<i class="fa-solid fa-wand-magic-sparkles accent" aria-hidden="true"></i> ${esc(T('ai.title'))}`, esc(T('ai.sub', { city: CITY })));

    if (!AI.hasKey()) {
      c.innerHTML = head + `<form id="aiKeyFormTrip" class="${bodyCls}">
          <p class="text-sm">${esc(T('ai.needKey'))}</p>
          <input name="key" type="password" data-autofocus autocomplete="off" spellcheck="false" placeholder="sk-ant-…" class="w-full rounded-xl px-3 py-2.5 text-sm font-mono" aria-label="${esc(T('key.label'))}">
          ${s.err ? `<p class="text-xs font-bold bad">${esc(T(s.err === 'format' ? 'key.format' : 'ai.err.' + s.err))}</p>` : ''}
          <button type="submit" class="w-full h-12 rounded-xl btn-accent text-sm font-bold" ${s.busy ? 'disabled' : ''}>${esc(T(s.busy ? 'key.testing' : 'key.save'))}</button>
          <div class="border-t line pt-4">${AI.guideHtml()}</div>
          <p class="text-[11px] muted">${esc(T('key.privacy'))}</p>
        </form>`;
      return;
    }

    const tabs = owner ? `<div class="grid grid-cols-2 gap-2">${[['places', T('ai.tabPlaces'), 'fa-location-dot'], ['practical', T('ai.tabPractical'), 'fa-circle-info']].map(([k, l, ic]) =>
      `<button data-action="ai-tab" data-tab="${k}" class="h-10 rounded-xl text-sm font-bold ${s.tab === k ? 'btn-accent' : 'btn-ghost'}" ${s.phase === 'loading' ? 'disabled' : ''}><i class="fa-solid ${ic}" aria-hidden="true"></i> ${esc(l)}</button>`).join('')}</div>` : '';

    if (s.phase === 'loading') {
      c.innerHTML = head + `<div class="${bodyCls}">${tabs}
          <div class="py-10 text-center space-y-3">
            <i class="fa-solid fa-wand-magic-sparkles fa-beat-fade text-3xl accent" aria-hidden="true"></i>
            <p class="font-extrabold">${esc(T(s.tab === 'practical' ? 'ai.loadingPractical' : 'ai.loadingPlaces'))}</p>
            <p id="aiElapsed" class="text-xs muted" aria-live="polite">${esc(T('ai.elapsed', { n: 0 }))}</p>
            <p class="text-[11px] muted">${esc(T('ai.slow'))}</p>
          </div>
        </div>` + foot(btn('ai-cancel', T('ai.cancel'), 'fa-xmark', 'btn-ghost w-full'));
      return;
    }

    if (s.phase === 'error') {
      const code = s.err || 'unknown';
      c.innerHTML = head + `<div class="${bodyCls}">${tabs}
          <div class="rounded-2xl surface2 p-4 space-y-2">
            <p class="text-sm font-extrabold bad"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${esc(T('ai.failed'))}</p>
            <p class="text-sm">${esc(T('ai.err.' + code))}</p>
          </div>
          ${code === 'limit' ? AI.limitHtml(true) : ''}
        </div>` + foot((code === 'auth' || code === 'permission' || code === 'credit' ? btn('ai-key-reset', T('key.change'), 'fa-key', 'btn-ghost flex-1') : btn('ai-back', T('ai.back'), 'fa-arrow-left', 'btn-ghost flex-1')) + btn('ai-run', T('ai.retry'), 'fa-rotate-right', 'btn-accent flex-1'));
      return;
    }

    if (s.phase === 'result' && s.tab === 'practical') {
      c.innerHTML = head + `<div class="${bodyCls}">${tabs}
          <p class="text-xs muted">${esc(T('ai.reviewPractical'))}</p>
          <div class="space-y-3">${s.result.map(p => `<div class="flex gap-3">
            <i class="fa-solid ${p.icon} w-4 text-center terra mt-0.5" aria-hidden="true"></i>
            <div><p class="text-sm font-bold">${esc(p.title_tr)}</p><p class="text-xs muted leading-snug">${esc(p.text_tr)}</p></div>
          </div>`).join('')}</div>
          ${PRACTICAL.length ? `<p class="text-[11px] terra font-bold">${esc(T('ai.replaceWarn', { n: PRACTICAL.length }))}</p>` : ''}
        </div>` + foot(btn('ai-run', T('ai.again'), 'fa-rotate-right', 'btn-ghost flex-1') + btn('ai-save-practical', T('ai.savePractical'), 'fa-check', 'btn-accent flex-1'));
      return;
    }

    if (s.phase === 'result') {
      const keep = isUpdate ? ($('#aiList') || {}).scrollTop : 0;
      const n = Object.values(s.sel).filter(Boolean).length;
      c.innerHTML = head + `<div id="aiList" class="${bodyCls}">${tabs}
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs muted">${esc(T(owner ? 'ai.reviewPlaces' : 'ai.reviewPlacesMember'))}</p>
            <button data-action="ai-sel-all" class="text-xs font-bold accent shrink-0">${esc(T(n === s.result.length ? 'ai.selNone' : 'ai.selAll'))}</button>
          </div>
          <div class="space-y-2">${s.result.map((p, i) => {
            const on = !!s.sel[i];
            return `<button data-action="ai-sel" data-i="${i}" aria-pressed="${on}" class="w-full text-left rounded-xl p-3 flex gap-3 border transition ${on ? 'ring-accent line surface' : 'line surface2'}">
              <span class="w-5 h-5 mt-0.5 shrink-0 rounded-md border-2 flex items-center justify-center ${on ? 'btn-accent border-transparent' : 'line'}">${on ? '<i class="fa-solid fa-check text-[10px]" aria-hidden="true"></i>' : ''}</span>
              <span class="tag-${esc(p.cat)} w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"><i class="fa-solid ${p.icon}" aria-hidden="true"></i></span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-extrabold leading-snug">${esc(p.name)}</span>
                <span class="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span class="tag tag-${esc(p.cat)}">${esc(App.catLabel(p.cat))}</span>
                  ${p.dup ? `<span class="tag surface2 terra">${esc(T('ai.dup'))}</span>` : ''}
                  ${p.res ? `<span class="tag tag-res"><i class="fa-solid fa-ticket" aria-hidden="true"></i> ${esc(T('pool.res'))}</span>` : ''}
                  ${p.kid ? '<span class="tag surface2 muted"><i class="fa-solid fa-child" aria-hidden="true"></i></span>' : ''}
                  ${p.area ? `<span class="text-[11px] muted">${esc(p.area)}</span>` : ''}
                </span>
                <span class="block text-xs muted mt-1 leading-snug">${esc(App.lang() === 'es' && p.desc_es ? p.desc_es : p.desc_tr)}</span>
                ${p.best.length ? `<span class="block text-[11px] mt-1 accent font-bold">${esc(p.best.map(slotName).join(' · '))}</span>` : ''}
              </span>
            </button>`;
          }).join('')}</div>
        </div>` + foot(btn('ai-run', T('ai.again'), 'fa-rotate-right', 'btn-ghost px-4') + `<button data-action="ai-add" class="h-12 flex-1 rounded-xl btn-accent text-sm font-bold" ${n ? '' : 'disabled'}><i class="fa-solid fa-plus" aria-hidden="true"></i> ${esc(T('ai.add', { n }))}</button>`);
      if (keep) $('#aiList').scrollTop = keep;
      return;
    }

    // form
    const isPr = s.tab === 'practical';
    c.innerHTML = head + `<div class="${bodyCls}">${tabs}
        ${isPr ? `<p class="text-sm">${esc(T('ai.practicalIntro'))}</p>
            ${PRACTICAL.length ? `<p class="text-xs terra font-bold">${esc(T('ai.replaceWarn', { n: PRACTICAL.length }))}</p>` : ''}`
          : `<label class="block"><span class="text-xs font-bold muted">${esc(T('ai.wish'))}</span>
              <textarea id="aiWish" data-autofocus maxlength="300" rows="3" class="mt-1 w-full rounded-xl px-3 py-2.5 text-sm" placeholder="${esc(T('ai.wishPh'))}">${esc(s.wish || '')}</textarea></label>
            <div><span class="text-xs font-bold muted">${esc(T('ai.count'))}</span>
              <div class="grid grid-cols-3 gap-2 mt-1">${[10, 15, 25].map(n => `<button data-action="ai-count" data-n="${n}" class="h-10 rounded-xl text-sm font-bold ${s.count === n ? 'btn-soft ring-accent' : 'btn-ghost'}">${n}</button>`).join('')}</div>
            </div>
            <p class="text-[11px] muted">${esc(T(owner ? 'ai.whereOwner' : 'ai.whereMember'))}</p>`}
        <div class="border-t line pt-3">${AI.limitHtml(true)}</div>
        <p class="text-[11px] muted"><i class="fa-solid fa-key" aria-hidden="true"></i> ${esc(T('ai.using', { key: AI.maskKey(AI.getKey()) }))} · <button data-action="ai-key-reset" class="underline">${esc(T('key.change'))}</button></p>
      </div>` + foot(btn('ai-run', T(isPr ? 'ai.goPractical' : 'ai.goPlaces'), 'fa-wand-magic-sparkles', 'btn-accent w-full'));
  }

  const aiActions = {
    'ai-open': el => {
      const tab = el.dataset.tab === 'practical' && isOwner() ? 'practical' : 'places';
      openSheet({ type: 'ai', tab, phase: 'form', wish: '', count: 15, result: [], sel: {} });
    },
    'ai-tab': el => { const s = state.sheet; if (!s || aiJob) return; Object.assign(s, { tab: el.dataset.tab === 'practical' ? 'practical' : 'places', phase: 'form', result: [], sel: {} }); renderSheet(false); },
    'ai-count': el => { state.sheet.count = Number(el.dataset.n) || 15; renderSheet(false); },
    'ai-run': () => aiRun(),
    'ai-cancel': () => { if (aiJob) aiJob.abort(); },
    'ai-back': () => { state.sheet.phase = 'form'; renderSheet(false); },
    'ai-key-reset': () => { if (!confirm(T('key.delAsk'))) return; AI.setKey(''); Object.assign(state.sheet, { phase: 'form', err: '' }); renderSheet(false); },
    'ai-sel': el => { const s = state.sheet; const i = Number(el.dataset.i); s.sel[i] = !s.sel[i]; renderSheet(true); },
    'ai-sel-all': () => { const s = state.sheet; const all = s.result.every((p, i) => s.sel[i]); s.sel = {}; if (!all) s.result.forEach((p, i) => { s.sel[i] = true; }); renderSheet(true); },
    'ai-add': () => aiAddPlaces(),
    'ai-save-practical': () => aiSavePractical()
  };

  document.addEventListener('input', e => { if (e.target.id === 'aiWish' && state.sheet && state.sheet.type === 'ai') state.sheet.wish = e.target.value; });
  document.addEventListener('submit', e => {
    if (e.target.id !== 'aiKeyFormTrip') return;
    e.preventDefault();
    const s = state.sheet;
    const k = String(e.target.elements.key.value || '').trim();
    if (!s || !k || s.busy) return;
    s.busy = true; s.err = ''; renderSheet(false);
    AI.saveKey(k).then(r => {
      s.busy = false;
      s.phase = 'form';
      s.err = r.saved ? '' : r.code; // kaydedildiyse form açılır; ağ hatası varsa denemede tekrar görünür
      if (state.sheet === s) renderSheet(false);
    });
  });
  App.on(aiActions);
  // Rehber açıldı / limit değişti: AI penceresi açıksa yeniden çiz
  AI.onChange(() => { if (state.sheet && state.sheet.type === 'ai' && state.sheet.phase !== 'loading') renderSheet(false); });

  // ---------- olaylar ----------
  function inviteUrl() {
    const code = (D().invite || {}).code;
    return location.origin + location.pathname + '#/join/' + encodeURIComponent(state.key) + '/' + encodeURIComponent(code || '');
  }

  const actions = {
    'pick-me': el => openSheet({ type: 'confirm-me', id: el.dataset.id }),
    // Kişi seçimi hesaba bağlanır: claims/<kişi> = uid ve members/<uid>/personId tek seferde yazılır
    'confirm-me': el => {
      const id = el.dataset.id;
      if (!person(id)) return;
      const uid = App.user().uid;
      tripRef.update({ [`claims/${id}`]: uid, [`members/${uid}/personId`]: id })
        .then(() => { closeSheet(); toast(T('who.ok')); }, err => { closeSheet(); toast(T('who.fail', { e: err.code })); });
    },
    close: () => closeSheet(),
    tab: el => { state.tab = el.dataset.tab; renderTabs(); updateChatBadge(); window.scrollTo(0, 0); if (state.tab === 'chat') { const b = $('#chatList'); b.scrollTop = b.scrollHeight; } },
    day: el => { state.day = el.dataset.day; state.view = 'day'; LS.set(LS_VIEW, 'day'); renderPlan(); },
    'open-day': el => { state.day = el.dataset.day; state.view = 'day'; LS.set(LS_VIEW, 'day'); renderPlan(); window.scrollTo(0, 0); },
    view: () => { state.view = state.view === 'day' ? 'summary' : 'day'; LS.set(LS_VIEW, state.view); renderPlan(); },
    'pool-cat': el => { state.poolCat = el.dataset.cat; renderPool(); if (state.sheet && state.sheet.type === 'pick-activity') renderSheet(true); },
    'pick-activity': el => openSheet({ type: 'pick-activity', day: state.day, slot: el.dataset.slot }),
    'add-here': el => { const s = state.sheet; addToSlot(el.dataset.act, s.day, s.slot); closeSheet(); },
    'pick-slot': el => openSheet({ type: 'pick-slot', act: el.dataset.act, pickDay: state.day }),
    'sheet-day': el => { state.sheet.pickDay = el.dataset.day; renderSheet(true); },
    'sheet-slot': el => {
      const s = state.sheet;
      const day = s.pickDay || state.day;
      if (s.move) moveItem(s.move.day, s.move.slot, s.move.key, day, el.dataset.slot);
      else addToSlot(s.act, day, el.dataset.slot);
      closeSheet();
    },
    accept: el => addToSlot(el.dataset.act, el.dataset.day, el.dataset.slot),
    detail: el => openSheet({ type: 'detail', day: el.dataset.day, slot: el.dataset.slot, key: el.dataset.key }),
    vote: el => vote(el.dataset.key, el.dataset.v),
    group: el => {
      const s = state.sheet;
      const item = slotItems(s.day, s.slot)[s.key];
      const cur = !!(item && item.groups && item.groups[el.dataset.g]);
      write(`slots/${s.day}/${s.slot}/${s.key}/groups/${el.dataset.g}`, cur ? null : true);
    },
    'confirm-item': () => {
      const s = state.sheet;
      const item = slotItems(s.day, s.slot)[s.key];
      write(`slots/${s.day}/${s.slot}/${s.key}/confirmed`, item && item.confirmed ? null : true);
    },
    'edit-info': () => {
      state.sheet.editInfo = true;
      renderSheet(true);
      const f = $('#infoForm textarea');
      if (f) f.focus();
    },
    'cancel-info': () => { state.sheet.editInfo = false; renderSheet(false); },
    // Dosya içeriği trip_files altında; sadece açılınca indirilir. Pencere tıklama anında açılır
    // (sonradan açılan pencereleri mobil tarayıcılar engelliyor), içerik gelince yönlendirilir.
    'open-file': el => {
      const s = state.sheet;
      const item = slotItems(s.day, s.slot)[s.key];
      const fid = el.dataset.fid;
      const f = item && item.files && item.files[fid];
      if (!f) return;
      const win = window.open('', '_blank');
      toast(T('file.loading'));
      App.db().ref(`trip_files/${state.key}/${fid}/data`).once('value').then(snap => {
        const data = snap.val() || f.data; // eski kayıtlarda içerik kartın içinde olabilir
        if (!data) throw new Error('missing');
        const bin = atob(data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: f.type }));
        if (win) win.location.href = url; else location.href = url;
      }).catch(err => { if (win) win.close(); toast(T('toast.saveFail', { e: err.code || err.message })); });
    },
    'del-file': el => {
      const s = state.sheet;
      const item = slotItems(s.day, s.slot)[s.key];
      const fid = el.dataset.fid;
      const f = item && item.files && item.files[fid];
      if (!f || !confirm(T('file.delAsk', { name: f.name }))) return;
      App.db().ref().update({ [`trips/${state.key}/slots/${s.day}/${s.slot}/${s.key}/files/${fid}`]: null, [`trip_files/${state.key}/${fid}`]: null })
        .catch(err => toast(T('toast.delFail', { e: err.code })));
    },
    move: () => {
      const s = state.sheet;
      const item = slotItems(s.day, s.slot)[s.key];
      openSheet({ type: 'pick-slot', act: item.activityId, pickDay: s.day, move: { day: s.day, slot: s.slot, key: s.key, name: itemName(item) } });
    },
    remove: () => {
      const s = state.sheet;
      const item = slotItems(s.day, s.slot)[s.key];
      if (!item || !confirm(T('detail.removeAsk', { name: itemName(item) }))) return;
      removeItem(s.day, s.slot, s.key);
      closeSheet();
    },
    custom: () => {
      const s = state.sheet;
      openSheet(s && s.type === 'pick-activity' ? { type: 'custom', day: s.day, slot: s.slot } : { type: 'custom' });
    },
    decide: el => decide(el.dataset.dec, el.dataset.opt),
    'review-toggle': () => { state.tab = state.tab === 'review' ? 'plan' : 'review'; renderTabs(); window.scrollTo(0, 0); },
    'rv-view': el => { state.reviewView = el.dataset.v === 'results' ? 'results' : 'mine'; renderReview(); },
    'rv-went': el => {
      const id = el.dataset.id;
      const r = myReview(id);
      if (el.dataset.v === '1') { if (!(r && r.went)) reviewWrite(id, { went: true }, true); return; }
      if (r && r.went === false) { reviewWrite(id, null); return; } // tekrar basınca seçim kalkar
      if (r && (r.rating || r.note) && !confirm(T('rv.clearAsk'))) return;
      reviewWrite(id, { went: false }, true);
    },
    'rv-rate': el => reviewWrite(el.dataset.id, { rating: Number(el.dataset.n) }),
    'rv-kids': el => { const r = myReview(el.dataset.id) || {}; reviewWrite(el.dataset.id, { kids: r.kids === el.dataset.v ? null : el.dataset.v }); },
    'rv-again': el => { const r = myReview(el.dataset.id) || {}; reviewWrite(el.dataset.id, { again: r.again ? null : true }); },
    'rv-note': el => openSheet({ type: 'review-note', id: el.dataset.id }),
    'rv-add-open': () => openSheet({ type: 'review-add', q: '' }),
    'rv-add': el => { reviewWrite(el.dataset.act, { went: true }, true).then(ok => ok && toast(T('rv.added'))); closeSheet(); },
    'rv-custom': () => openSheet({ type: 'custom', review: true }),
    check: el => {
      const cur = (D().checklist || {})[el.dataset.id];
      write(`checklist/${el.dataset.id}`, cur && cur.done ? null : { done: true, by: state.me, at: firebase.database.ServerValue.TIMESTAMP });
    },
    invite: () => {
      const url = inviteUrl();
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(() => toast(T('toast.copied')), () => openSheet({ type: 'invite', url }));
      } else {
        openSheet({ type: 'invite', url });
      }
    }
  };

  App.on(actions);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.sheet) closeSheet();
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'poolSearch' || e.target.id === 'sheetSearch') {
      state.poolQuery = e.target.value;
      if (e.target.id === 'poolSearch') renderPool(); else renderSheet(true);
    }
    if (e.target.id === 'reviewSearch' && state.sheet) {
      state.sheet.q = e.target.value;
      renderSheet(true);
    }
  });

  document.addEventListener('change', e => {
    if (e.target.id !== 'fileInput') return;
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    const s = state.sheet;
    if (!file || !s || s.type !== 'detail' || !slotItems(s.day, s.slot)[s.key]) return;
    if (file.size > MAX_FILE_MB * 1048576) { toast(T('file.tooBig', { mb: MAX_FILE_MB })); return; }
    const reader = new FileReader();
    reader.onload = () => {
      toast(T('file.uploading'));
      // Kartta sadece dosya bilgisi; içerik trip_files altında (plan açılırken indirilmesin diye)
      const fid = tripRef.child('slots').push().key;
      App.db().ref().update({
        [`trips/${state.key}/slots/${s.day}/${s.slot}/${s.key}/files/${fid}`]: {
          name: file.name.slice(0, 120),
          type: file.type || 'application/octet-stream',
          size: file.size,
          by: state.me,
          at: TS()
        },
        [`trip_files/${state.key}/${fid}`]: { data: String(reader.result).split(',')[1], at: TS() }
      }).then(() => toast(T('file.added')), err => toast(T('toast.saveFail', { e: err.code })));
    };
    reader.readAsDataURL(file);
  });

  document.addEventListener('submit', e => {
    if (e.target.id === 'chatForm') {
      e.preventDefault();
      const input = $('#chatInput');
      const text = input.value.trim().slice(0, 500);
      if (!text || !tripRef) return;
      tripRef.child('discussions').push({ user: state.me, text, timestamp: firebase.database.ServerValue.TIMESTAMP })
        .catch(err => toast(T('toast.sendFail', { e: err.code })));
      input.value = '';
    }
    if (e.target.id === 'infoForm') {
      e.preventDefault();
      const s = state.sheet;
      if (!s || !slotItems(s.day, s.slot)[s.key]) return;
      const ticket = e.target.elements.ticket.value.trim().slice(0, 500);
      const note = e.target.elements.note.value.trim().slice(0, 1000);
      tripRef.child(`slots/${s.day}/${s.slot}/${s.key}`).update({
        ticket: ticket || null,
        note: note || null,
        infoBy: state.me,
        infoAt: firebase.database.ServerValue.TIMESTAMP
      }).then(() => {
        toast(T('toast.saved'));
        if (state.sheet === s) { s.editInfo = false; renderSheet(false); }
      }).catch(err => toast(T('toast.saveFail', { e: err.code })));
      return;
    }
    if (e.target.id === 'reviewNoteForm') {
      e.preventDefault();
      const s = state.sheet;
      if (!s) return;
      const note = e.target.elements.note.value.trim().slice(0, 300);
      reviewWrite(s.id, { note: note || null }).then(ok => ok && toast(T('toast.saved')));
      closeSheet();
      return;
    }
    if (e.target.id === 'customForm') {
      e.preventDefault();
      const f = new FormData(e.target);
      const name = String(f.get('name') || '').trim();
      if (!name) return;
      const ref = tripRef.child('custom_activities').push();
      const s = state.sheet;
      ref.set({
        name: name.slice(0, 80),
        area: String(f.get('area') || '').trim().slice(0, 60),
        cat: String(f.get('cat') || 'food'),
        desc: String(f.get('desc') || '').trim().slice(0, 300),
        addedBy: state.me,
        addedAt: firebase.database.ServerValue.TIMESTAMP
      }).then(() => {
        if (s && s.review) reviewWrite('custom:' + ref.key, { went: true }, true).then(ok => ok && toast(T('rv.added')));
        else if (s && s.slot) setTimeout(() => addToSlot('custom:' + ref.key, s.day, s.slot), 300);
        else toast(T('toast.poolAdded'));
      }).catch(err => toast(T('toast.saveFail', { e: err.code })));
      closeSheet();
    }
  });

  // Masaüstü sürükle-bırak: havuzdan slota ekle, slotlar arasında taşı
  document.addEventListener('dragstart', e => {
    const a = e.target.closest('[data-drag-act]');
    const it = e.target.closest('[data-drag-item]');
    if (a) e.dataTransfer.setData('text/plain', 'act:' + a.dataset.dragAct);
    else if (it) e.dataTransfer.setData('text/plain', `item:${it.dataset.day}:${it.dataset.slot}:${it.dataset.key}`);
    else return;
    e.dataTransfer.effectAllowed = 'copyMove';
  });
  document.addEventListener('dragover', e => {
    const z = e.target.closest('[data-drop]');
    if (!z) return;
    e.preventDefault();
    $$('.drop-over').forEach(x => x !== z && x.classList.remove('drop-over'));
    z.classList.add('drop-over');
  });
  document.addEventListener('dragleave', e => {
    const z = e.target.closest('[data-drop]');
    if (z && !z.contains(e.relatedTarget)) z.classList.remove('drop-over');
  });
  document.addEventListener('drop', e => {
    const z = e.target.closest('[data-drop]');
    if (!z) return;
    e.preventDefault();
    z.classList.remove('drop-over');
    const payload = e.dataTransfer.getData('text/plain') || '';
    if (payload.startsWith('act:')) addToSlot(payload.slice(4), state.day, z.dataset.drop);
    else if (payload.startsWith('item:')) {
      const [, d, s, k] = payload.split(':');
      moveItem(d, s, k, state.day, z.dataset.drop);
    }
  });

  window.addEventListener('resize', () => { if (state.key && state.me) updateChatBadge(); });

  // ---------- akış ----------
  let connRef = null, clock = null;

  function showPart(id) { ['whoami', 'app'].forEach(x => $('#' + x).classList.toggle('hidden', x !== id)); }

  function onData(snap) {
    const v = snap.val();
    if (!v || !v.meta) { App.message(T('trip.missing'), '', 'fa-map'); return; }
    state.data = v;
    // Bu hesabın plandaki kişisi; dili kişinin lang alanından
    const m = (v.members || {})[App.user().uid] || {};
    const raw = m.personId && v.def && v.def.people && v.def.people[m.personId];
    App.setLang(raw && raw.lang === 'es' ? 'es' : 'tr');
    applyDef(v.def, v.meta);
    state.me = raw ? m.personId : null;
    // Google fotoğrafı değiştiyse (ya da eski üyelikte yoksa) üye kaydına yazılır; diğer üyeler avatarda görür
    const ph = App.photoUrl();
    if (v.members && v.members[App.user().uid] && (m.photo || null) !== ph && !onData.photoTried) {
      onData.photoTried = true;
      tripRef.child(`members/${App.user().uid}/photo`).set(ph).catch(() => {});
    }
    if (!dayOf(state.day)) state.day = todayKey() || (DAYS[0] || {}).key || 'day1';
    if (!state.loaded) {
      state.loaded = true;
      if (tripEnded()) state.tab = 'review'; // seyahat bittiyse değerlendirme anketiyle açılır
      App.screen('vTrip');
    }
    if (state.me) { showPart('app'); renderAll(); } else { showPart('whoami'); renderWhoami(); }
  }

  function close() {
    if (tripRef) tripRef.off();
    if (connRef) connRef.off();
    clearInterval(clock);
    tripRef = connRef = null;
    if (state.sheet) closeSheet();
    state.key = null;
    state.me = null;
    state.data = {};
    defSig = '';
    onData.photoTried = false;
    if (aiJob) { aiJob.abort(); aiJob = null; }
    App.setLang('tr');
  }

  App.view('trip', {
    show({ id }) {
      if (state.key === id && tripRef) { App.screen('vTrip'); return; }
      close();
      Object.assign(state, { key: id, loaded: false, tab: 'plan', poolCat: 'all', poolQuery: '', reviewView: 'mine', day: 'day1' });
      App.screen('vLoading');
      tripRef = App.db().ref('trips/' + id);
      tripRef.on('value', onData, err => {
        App.message(T(err && err.code === 'PERMISSION_DENIED' ? 'trip.denied' : 'gate.offline'), '', 'fa-lock');
      });
      connRef = App.db().ref('.info/connected');
      connRef.on('value', snap => {
        const dot = $('#connDot');
        const ok = snap.val() === true;
        dot.className = 'w-2 h-2 rounded-full ' + (ok ? 'bg-emerald-500' : 'bg-amber-500');
        dot.title = T(ok ? 'conn.ok' : 'conn.wait');
      });
      // Slotlar "şimdi" vurgusu için dakikada bir tazelenir
      clock = setInterval(() => { if (state.me && !state.sheet) { renderHeader(); renderPlan(); } }, 60000);
    },
    hide() { close(); }
  });
})();
