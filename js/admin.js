// Yönetim: kim plan açabilir (allowlist + limit), giriş yapanlar, Barselona planını içe aktarma
(function () {
  'use strict';
  const { $, esc, T, on, toast, screen, account, TS, clean, randomId, emailKey } = App;
  const db = () => App.db();

  const OLD_DB = 'https://barcelona-11-16nov-default-rtdb.firebaseio.com';
  const OLD_SITE = 'https://mrcangs.github.io/Barcelona/js/';

  function shell(body) {
    return `<header class="glass sticky top-0 z-40 border-b line">
      <div class="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
        <button data-action="go" data-href="#/" class="w-9 h-9 rounded-xl btn-ghost" aria-label="${esc(T('trip.back'))}"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
        <h1 class="text-[15px] font-extrabold">${esc(T('admin.title'))}</h1>
      </div>
    </header>
    <main class="max-w-3xl mx-auto px-4 py-5 space-y-6 pb-16">${body}</main>`;
  }

  const unKey = k => String(k).replace(/,/g, '.');

  function render(allow, users) {
    const lbl = 'text-xs font-bold muted';
    const inp = 'mt-1 w-full rounded-xl px-3 py-2.5 text-sm';
    const allowRows = Object.entries(allow).sort().map(([k, v]) => `<div class="flex items-center gap-2 py-1.5">
        <span class="flex-1 min-w-0 truncate text-sm">${esc(unKey(k))}</span>
        <span class="tag surface2">${esc(T('admin.limit'))}: ${Number(v.limit) || 0}</span>
        <button data-action="adm-remove" data-k="${esc(k)}" class="w-9 h-9 rounded-lg btn-ghost bad" aria-label="${esc(T('admin.remove'))}"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
      </div>`).join('');
    const userRows = Object.entries(users).map(([uid, u]) => {
      const p = u.profile || {};
      return `<div class="flex items-center gap-2 py-1.5 text-sm">
        <span class="flex-1 min-w-0 truncate">${esc(p.name || '')} <span class="muted text-xs">${esc(p.email || '')}</span></span>
        <span class="tag surface2">${esc(T('admin.planCount', { n: Number(u.planCount) || 0 }))}</span>
      </div>`;
    }).join('');
    $('#vAdmin').innerHTML = shell(`
      <section class="surface rounded-2xl p-4 space-y-3">
        <h2 class="text-sm font-extrabold">${esc(T('admin.allow'))}</h2>
        <p class="text-xs muted">${esc(T('admin.allowHint'))}</p>
        <div class="divide-y line">${allowRows || '<p class="text-xs muted">—</p>'}</div>
        <form id="allowForm" class="grid grid-cols-[minmax(0,1fr)_88px] gap-2 items-end">
          <label class="block"><span class="${lbl}">${esc(T('admin.email'))}</span><input name="email" type="email" required class="${inp}"></label>
          <label class="block"><span class="${lbl}">${esc(T('admin.limit'))}</span><input name="limit" type="number" min="0" max="50" value="3" required class="${inp}"></label>
          <button type="submit" class="col-span-2 h-11 rounded-xl btn-accent text-sm font-bold">${esc(T('admin.add'))}</button>
        </form>
      </section>
      <section class="surface rounded-2xl p-4 space-y-2">
        <h2 class="text-sm font-extrabold">${esc(T('admin.users'))}</h2>
        <div class="divide-y line">${userRows || '<p class="text-xs muted">—</p>'}</div>
      </section>
      <section class="surface rounded-2xl p-4 space-y-3">
        <h2 class="text-sm font-extrabold">${esc(T('admin.import'))}</h2>
        <p class="text-xs muted">${esc(T('admin.importHint'))}</p>
        <form id="importForm" class="space-y-3">
          <label class="block"><span class="${lbl}">${esc(T('admin.importKey'))}</span><input name="key" required pattern="[A-Za-z0-9_-]{20,}" autocomplete="off" class="${inp} font-mono"></label>
          <label class="block"><span class="${lbl}">${esc(T('admin.importAs'))}</span>
            <select name="me" class="${inp}"><option value="mertcan">Mertcan</option><option value="elif">Elif</option><option value="atay">Atay</option><option value="alev">Alev</option></select></label>
          <button type="submit" class="w-full h-11 rounded-xl btn-ghost text-sm font-bold"><i class="fa-solid fa-file-import" aria-hidden="true"></i> ${esc(T('admin.importGo'))}</button>
          <pre id="importLog" class="text-[11px] muted whitespace-pre-wrap"></pre>
        </form>
      </section>`);
    screen('vAdmin');
  }

  function load() {
    Promise.all([
      db().ref('allowlist').once('value').then(s => s.val() || {}),
      db().ref('users').once('value').then(s => s.val() || {})
    ]).then(([a, u]) => render(a, u), err => toast(T('toast.saveFail', { e: err.code })));
  }

  App.view('admin', {
    show() {
      if (!account.admin) { App.message(T('admin.notAdmin'), '', 'fa-user-shield'); return; }
      load();
    }
  });

  on({
    'adm-remove': el => {
      if (!confirm(T('admin.remove') + ': ' + unKey(el.dataset.k) + '?')) return;
      db().ref('allowlist/' + el.dataset.k).remove().then(load, err => toast(T('toast.saveFail', { e: err.code })));
    }
  });

  document.addEventListener('submit', e => {
    if (e.target.id === 'allowForm') {
      e.preventDefault();
      const f = new FormData(e.target);
      const k = emailKey(String(f.get('email')).trim());
      const limit = Math.max(0, Math.min(50, parseInt(f.get('limit'), 10) || 0));
      db().ref('allowlist/' + k).set({ limit, at: TS() }).then(() => {
        // Kendi hakkını eklediysen ana sayfada hemen görünsün
        if (k === emailKey(App.user().email)) account.limit = limit;
        toast(T('toast.saved'));
        load();
      }, err => toast(T('toast.saveFail', { e: err.code })));
    }
    if (e.target.id === 'importForm') {
      e.preventDefault();
      const f = new FormData(e.target);
      importBarcelona(String(f.get('key')).trim(), String(f.get('me')), e.target.querySelector('button'));
    }
  });

  // ---------- Barselona içe aktarma ----------
  // Eski sitenin sabit içeriği (data.js + i18n.js, herkese açık) ve eski veritabanındaki canlı veri
  // (oylar, sohbet, puanlar, bilet dosyaları) yeni plan yapısına çevrilir.
  function logLine(msg) { const el = $('#importLog'); if (el) el.textContent += msg + '\n'; }

  function loadLegacy() {
    return Promise.all(['data.js', 'i18n.js'].map(f => fetch(OLD_SITE + f, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.text(); })))
      .then(([data, i18n]) => {
        // Kendi sitemizin dosyaları; sabitleri bir fonksiyon kapsamında okuruz
        // eslint-disable-next-line no-new-func
        return new Function(data + '\n' + i18n + '\nreturn { PEOPLE, FORMER_PEOPLE, GROUPS, SLOTS, DAYS, POOL, ATAY_SECTIONS, TAPAS_LIST, ATAY_TIPS, FIXED_EVENTS, DECISIONS, SUGGESTED_PLAN, CHECKLIST, PRACTICAL, CONTENT_ES };')();
      });
  }

  const tres = (tr, es) => (es && es !== tr ? { tr, es } : tr);

  function buildDef(C) {
    const E = C.CONTENT_ES || {};
    const people = {};
    C.PEOPLE.forEach((p, i) => { people[p.id] = { name: p.name, order: i, color: p.color, group: p.group, lang: p.lang || null }; });
    const groups = {};
    Object.entries(C.GROUPS).forEach(([g, v]) => {
      const es = (E.groups || {})[g] || {};
      groups[g] = { label: tres(v.label, es.label), who: tres(v.who, es.who), note: tres(v.note, es.note) };
    });
    const slots = C.SLOTS.map(s => {
      const es = (E.slots || {})[s.key] || {};
      return { key: s.key, label: tres(s.label, es.label), start: s.start, end: s.end, hint: tres(s.hint, es.hint), nap: s.nap || null };
    });
    const days = C.DAYS.map(d => {
      const es = (E.days || {})[d.key] || {};
      const closed = d.closed ? Object.fromEntries(Object.entries(d.closed).map(([k, v]) => [k, tres(v, (es.closed || {})[k])])) : null;
      return { key: d.key, date: d.date, title: tres(d.title, es.title), desc: tres(d.desc, es.desc), closed };
    });
    const pool = C.POOL.map(a => {
      const es = (E.pool || {})[a.id] || {};
      return Object.assign({}, a, { name: tres(a.name, es.name), area: tres(a.area, es.area), desc: tres(a.desc, es.desc) });
    });
    const fixed = {};
    Object.entries(C.FIXED_EVENTS).forEach(([day, slotsMap]) => {
      fixed[day] = {};
      Object.entries(slotsMap).forEach(([slot, list]) => {
        fixed[day][slot] = list.map((ev, i) => {
          const es = (((E.fixed || {})[day] || {})[slot] || [])[i] || {};
          return { time: tres(ev.time, es.time), title: tres(ev.title, es.title), icon: ev.icon };
        });
      });
    });
    const decisions = C.DECISIONS.map(dec => {
      const es = (E.decisions || {})[dec.id] || {};
      return {
        id: dec.id, icon: dec.icon, title: tres(dec.title, es.title), desc: tres(dec.desc, es.desc),
        options: dec.options.map(o => { const oe = (es.options || {})[o.id] || {}; return { id: o.id, label: tres(o.label, oe.label), sub: tres(o.sub, oe.sub) }; })
      };
    });
    const notes = E.notes || {};
    const suggested = {};
    Object.entries(C.SUGGESTED_PLAN).forEach(([day, m]) => {
      suggested[day] = {};
      Object.entries(m).forEach(([slot, list]) => { suggested[day][slot] = list.map(s => Object.assign({}, s, s.note ? { note: tres(s.note, notes[s.note]) } : {})); });
    });
    const catsEs = E.checklistCats || {};
    const checklist = C.CHECKLIST.map(c => Object.assign({}, c, { text: tres(c.text, (E.checklist || {})[c.id]), cat: tres(c.cat, catsEs[c.cat]) }));
    // Pratik bilgiler İspanyolcayla sıra numarasına göre eşleşir (eski sitede de öyleydi)
    const practical = C.PRACTICAL.map((p, i) => { const es = (E.practical || [])[i] || {}; return { icon: p.icon, title: tres(p.title, es.title), text: tres(p.text, es.text) }; });
    const atayItems = {};
    Object.entries(C.ATAY_TIPS).forEach(([id, t], i) => { atayItems[id] = { sec: t.sec, note: t.note, o: i }; });
    const tapasItems = {};
    C.TAPAS_LIST.forEach((t, i) => { tapasItems[t.id] = { stars: t.stars || 0, note: t.note || null, o: i }; });
    const lists = {
      atay: { title: tres("Atay'ın önerileri", 'Recomendaciones de Atay'), icon: 'fa-star', by: 'atay', order: 0, sections: C.ATAY_SECTIONS, items: atayItems },
      tapas: { title: tres('Tapascılar', 'Bares de tapas'), icon: 'fa-wine-glass', order: 1, items: tapasItems }
    };
    return clean({ city: 'Barcelona', country: 'İspanya', people, former: C.FORMER_PEOPLE, groups, slots, days, pool, fixed, decisions, suggested, checklist, practical, lists });
  }

  // Eski kartlardaki dosya içerikleri ayrılır: kartta bilgi kalır, içerik trip_files'a gider
  function splitFiles(slots) {
    const files = {};
    Object.values(slots || {}).forEach(day => Object.values(day || {}).forEach(slot => Object.values(slot || {}).forEach(item => {
      Object.entries(item.files || {}).forEach(([fid, f]) => {
        if (f.data) files[fid] = f.data;
        delete f.data;
      });
    })));
    return files;
  }

  function importBarcelona(oldKey, me, btn) {
    if (!(account.limit > account.count)) { toast(T('home.noPermission')); return; }
    btn.disabled = true;
    $('#importLog').textContent = '';
    const uid = App.user().uid;
    let def, old, files;
    logLine('1/4 Eski site içeriği okunuyor…');
    loadLegacy().then(C => {
      def = buildDef(C);
      logLine(`   ${def.pool.length} mekan, ${def.days.length} gün, ${Object.keys(def.people).length} kişi`);
      logLine('2/4 Eski veritabanı okunuyor…');
      return fetch(`${OLD_DB}/trips/${encodeURIComponent(oldKey)}.json`).then(r => { if (!r.ok) throw new Error('eski veritabanı ' + r.status); return r.json(); });
    }).then(o => {
      if (!o || !o.slots) throw new Error('eski anahtarla veri bulunamadı');
      old = o;
      files = splitFiles(old.slots);
      logLine(`   ${Object.keys(files).length} dosya, ${Object.keys(old.discussions || {}).length} mesaj, ${Object.keys(old.reviews || {}).length} puanlı yer`);
      logLine('3/4 Yeni plan yazılıyor…');
      const tid = db().ref('trips').push().key;
      const code = randomId(12);
      const start = def.days[0].date, end = def.days[def.days.length - 1].date;
      const title = 'Barselona 2026';
      const trip = `trips/${tid}`;
      const updates = {
        [`${trip}/meta`]: { title, city: 'Barcelona', country: 'İspanya', start, end, owner: uid, status: 'done', createdAt: TS(), importedFrom: 'barcelona-2026' },
        [`${trip}/invite`]: { code },
        [`${trip}/def`]: def,
        [`${trip}/members/${uid}`]: { code, personId: me, at: TS() },
        [`${trip}/claims/${me}`]: uid,
        [`users/${uid}/planCount`]: account.count + 1,
        [`users/${uid}/trips/${tid}`]: { title, city: 'Barcelona', start, end, role: 'owner', at: TS() }
      };
      ['slots', 'slot_votes', 'decisions', 'custom_activities', 'checklist', 'discussions', 'reviews'].forEach(k => {
        if (old[k]) updates[`${trip}/${k}`] = clean(old[k]);
      });
      return db().ref().update(updates).then(() => tid);
    }).then(tid => {
      account.count += 1;
      logLine('4/4 Bilet dosyaları kopyalanıyor…');
      const ids = Object.keys(files);
      return ids.reduce((p, fid, i) => p.then(() => db().ref(`trip_files/${tid}/${fid}`).set({ data: files[fid], at: TS() }).then(() => logLine(`   ${i + 1}/${ids.length}`))), Promise.resolve()).then(() => tid);
    }).then(tid => {
      logLine('Tamam. Plan açılıyor…');
      setTimeout(() => App.go('#/t/' + tid), 800);
    }).catch(err => {
      logLine('HATA: ' + (err.code || err.message));
      btn.disabled = false;
    });
  }
})();
