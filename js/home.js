// Ana sayfa (planlarım), yeni plan formu ve davet linkiyle katılma
(function () {
  'use strict';
  const { $, esc, T, L, go, on, toast, screen, message, account, TS, clean, randomId } = App;
  const db = () => App.db();
  const uid = () => App.user().uid;

  const PALETTE = ['#4f46e5', '#db2777', '#0891b2', '#ea580c', '#059669', '#7c3aed', '#ca8a04', '#dc2626'];

  // ---------- ana sayfa ----------
  function fmtRange(start, end) {
    if (!start) return '';
    const o = { day: 'numeric', month: 'short' };
    const a = new Date(start + 'T12:00:00'), b = new Date((end || start) + 'T12:00:00');
    return a.toLocaleDateString(App.locale(), o) + ' – ' + b.toLocaleDateString(App.locale(), Object.assign({ year: 'numeric' }, o));
  }

  function headerHtml() {
    return `<header class="glass sticky top-0 z-40 border-b line">
      <div class="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <button data-action="go" data-href="#/" class="flex items-center gap-2.5 min-w-0">
          <span class="w-9 h-9 shrink-0 rounded-xl btn-accent flex items-center justify-center"><i class="fa-solid fa-route" aria-hidden="true"></i></span>
          <span class="text-[15px] font-extrabold truncate">${esc(T('app.name'))}</span>
        </button>
        <div class="flex items-center gap-2">
          <span data-ai-badge class="contents">${AI.badgeHtml()}</span>
          ${account.admin ? `<button data-action="go" data-href="#/admin" class="h-9 px-3 rounded-full btn-ghost text-xs font-bold"><i class="fa-solid fa-user-shield" aria-hidden="true"></i><span class="hidden sm:inline ml-1.5">${esc(T('home.admin'))}</span></button>` : ''}
          <button data-action="sign-out" class="h-9 px-3 rounded-full btn-ghost text-xs font-bold" title="${esc(T('auth.signout'))}"><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i><span class="hidden sm:inline ml-1.5">${esc(T('auth.signout'))}</span></button>
          ${App.avatarHtml('w-9 h-9')}
        </div>
      </div>
    </header>`;
  }

  function renderHome() {
    const trips = Object.entries(account.trips || {}).sort((a, b) => (b[1].start || '').localeCompare(a[1].start || '') || (b[1].at || 0) - (a[1].at || 0));
    const canCreate = account.limit > 0 && account.count < account.limit;
    const quota = account.limit > 0
      ? `<p class="text-[11px] muted">${esc(account.count >= account.limit ? T('home.quotaFull', { m: account.limit }) : T('home.quota', { n: account.count, m: account.limit }))}</p>`
      : `<p class="text-xs muted">${esc(T('home.noPermission'))}</p>`;
    $('#vHome').innerHTML = headerHtml() + `
      <main class="max-w-3xl mx-auto px-4 py-5 space-y-6 pb-16">
        <section class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <h1 class="text-xl font-extrabold">${esc(T('home.myTrips'))}</h1>
            ${canCreate ? `<button data-action="go" data-href="#/new" class="h-10 px-4 rounded-xl btn-accent text-sm font-bold"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${esc(T('home.new'))}</button>` : ''}
          </div>
          ${quota}
          <div class="grid gap-3 sm:grid-cols-2">
            ${trips.length ? trips.map(([id, t]) => `<button data-action="go" data-href="#/t/${esc(id)}" class="surface rounded-2xl p-4 text-left hover:shadow-md transition">
                <div class="flex items-start gap-3">
                  <span class="w-11 h-11 shrink-0 rounded-xl btn-soft flex items-center justify-center font-extrabold text-xs tracking-wide">${esc(String(t.city || t.title || '?').slice(0, 3).toUpperCase())}</span>
                  <span class="min-w-0">
                    <span class="block font-extrabold truncate">${esc(L(t.title))}</span>
                    <span class="block text-xs muted">${esc(fmtRange(t.start, t.end))}</span>
                    <span class="tag mt-1.5 inline-block ${t.role === 'owner' ? 'btn-soft' : 'surface2 muted'}">${esc(T(t.role === 'owner' ? 'home.owner' : 'home.member'))}</span>
                  </span>
                </div>
              </button>`).join('') : `<p class="text-sm muted surface rounded-2xl p-4 sm:col-span-2">${esc(T('home.noTrips'))}</p>`}
          </div>
        </section>
        <section class="space-y-2">
          <h2 class="text-sm font-extrabold">${esc(T('home.templates'))}</h2>
          <p class="text-xs muted dashed rounded-2xl p-4">${esc(T('home.templatesSoon'))}</p>
        </section>
        <section class="space-y-1.5">
          <h2 class="text-sm font-extrabold">${esc(T('home.account'))}</h2>
          <p class="text-xs muted">${esc(App.user().email || '')}</p>
          <button data-action="copy-uid" class="text-[11px] muted underline">${esc(T('home.uid'))}: <span class="font-mono">${esc(uid())}</span></button>
        </section>
        <section id="aiKeyBox">${aiKeyHtml()}</section>
      </main>`;
    screen('vHome');
  }

  // ---------- Claude API anahtarı (parolayla şifreli, hesapta) ----------
  function aiKeyHtml() {
    return `<div class="surface rounded-2xl p-4 space-y-3">
      <div class="flex items-start gap-3">
        <span class="w-9 h-9 shrink-0 rounded-xl btn-soft flex items-center justify-center"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></span>
        <div class="min-w-0">
          <h2 class="text-sm font-extrabold">${esc(T('key.title'))}</h2>
          <p class="text-xs muted">${esc(T('key.sub'))}</p>
        </div>
      </div>
      ${AI.keyPanelHtml()}
      <p class="text-[11px] muted">${esc(T('key.privacy'))}</p>
    </div>`;
  }
  // Panel yeniden çizilirken yazılmakta olan alanlar korunur (canlı kullanım güncellemesi formu silmesin)
  function renderKey() {
    const b = $('#aiKeyBox');
    if (!b) return;
    const keep = {};
    b.querySelectorAll('input[name]').forEach(i => { if (i.type !== 'checkbox' && i.type !== 'hidden') keep[i.name] = i.value; });
    b.innerHTML = aiKeyHtml();
    b.querySelectorAll('input[name]').forEach(i => { if (keep[i.name]) i.value = keep[i.name]; });
  }
  AI.onChange(() => { if (!$('#vHome').classList.contains('hidden')) renderKey(); });

  App.view('home', {
    show() {
      renderHome();
      // Liste her açılışta tazelenir (başka cihazda açılan plan, yeni katılım)
      Promise.all([
        db().ref('users/' + uid() + '/trips').once('value').then(s => { account.trips = s.val() || {}; }),
        db().ref('users/' + uid() + '/planCount').once('value').then(s => { account.count = Number(s.val()) || 0; })
      ]).then(() => { if (!$('#vHome').classList.contains('hidden')) renderHome(); }, () => {});
    }
  });

  on({ 'copy-uid': () => App.copyText(uid()) });

  // ---------- yeni plan ----------
  // Gün ritmi şablonları: küçük çocuk varsa öğle uykusu bloğu korunur
  const RHYTHMS = {
    kids: [
      { key: 'morning', label: { tr: 'Sabah', es: 'Mañana' }, start: '08:30', end: '12:00', hint: { tr: 'Kahvaltı, serin saatte park veya gezi', es: 'Desayuno, parque o visita con el fresco' } },
      { key: 'lunch_nap', label: { tr: 'Öğle & Uyku', es: 'Mediodía y siesta' }, start: '12:30', end: '15:30', nap: true, hint: { tr: 'Küçükler uyurken yakın plan', es: 'Plan cercano mientras duermen los peques' } },
      { key: 'afternoon', label: { tr: 'İkindi', es: 'Tarde' }, start: '15:30', end: '19:30', hint: { tr: 'Tatlı molası, park, müze', es: 'Merienda, parque, museo' } },
      { key: 'evening', label: { tr: 'Akşam', es: 'Noche' }, start: '20:00', end: '23:30', hint: { tr: 'Akşam yemeği', es: 'Cena' } }
    ],
    adults: [
      { key: 'morning', label: { tr: 'Sabah', es: 'Mañana' }, start: '09:00', end: '12:30', hint: { tr: 'Kahvaltı ve gezi', es: 'Desayuno y visita' } },
      { key: 'noon', label: { tr: 'Öğle', es: 'Mediodía' }, start: '12:30', end: '16:00', hint: { tr: 'Öğle yemeği, müze', es: 'Comida, museo' } },
      { key: 'evening', label: { tr: 'Akşam', es: 'Tarde-noche' }, start: '16:00', end: '20:30', hint: { tr: 'Gün batımı, yürüyüş', es: 'Atardecer, paseo' } },
      { key: 'night', label: { tr: 'Gece', es: 'Noche' }, start: '20:30', end: '01:00', hint: { tr: 'Akşam yemeği ve gece', es: 'Cena y noche' } }
    ]
  };

  const slug = s => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'kisi';

  function daysBetween(start, end) {
    const out = [];
    const d = new Date(start + 'T12:00:00'), e = new Date(end + 'T12:00:00');
    while (d <= e && out.length < 31) { out.push(App.localDate(d)); d.setDate(d.getDate() + 1); }
    return out;
  }

  const newState = { people: [] };

  function personRow(p, i) {
    return `<div class="grid grid-cols-[minmax(0,1fr)_56px_56px_auto] gap-2 items-center" data-row="${i}">
      <input data-f="name" value="${esc(p.name)}" maxlength="30" placeholder="${esc(T('new.personName'))}" class="rounded-xl px-3 py-2.5 text-sm min-w-0">
      <input data-f="age" value="${esc(p.age == null ? '' : p.age)}" inputmode="numeric" maxlength="2" placeholder="${esc(T('new.personAge'))}" class="rounded-xl px-2 py-2.5 text-sm text-center">
      <input data-f="group" value="${esc(p.group || '')}" maxlength="2" placeholder="${esc(T('new.personGroup'))}" class="rounded-xl px-2 py-2.5 text-sm text-center uppercase">
      <label class="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap"><input type="radio" name="me" value="${i}" ${p.me ? 'checked' : ''}> ${esc(T('new.me'))}</label>
    </div>`;
  }

  function renderNew() {
    const lbl = 'text-xs font-bold muted';
    const inp = 'mt-1 w-full rounded-xl px-3 py-2.5 text-sm';
    $('#vNew').innerHTML = headerHtml() + `
      <main class="max-w-xl mx-auto px-4 py-5 pb-16">
        <h1 class="text-xl font-extrabold mb-4">${esc(T('new.title'))}</h1>
        <form id="newForm" class="space-y-4">
          <label class="block"><span class="${lbl}">${esc(T('new.name'))}</span><input name="title" required maxlength="60" class="${inp}" placeholder="${esc(T('new.namePh'))}"></label>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="${lbl}" for="cbCountry">${esc(T('new.country'))}</label><div id="countryBox"></div></div>
            <div><label class="${lbl}" for="cbCity">${esc(T('new.city'))}</label><div id="cityBox"></div></div>
            <p class="col-span-2 -mt-1.5 text-[10px] muted">${esc(T('new.placesHint'))}</p>
            <label class="block"><span class="${lbl}">${esc(T('new.start'))}</span><input name="start" type="date" required class="${inp}"></label>
            <label class="block"><span class="${lbl}">${esc(T('new.end'))}</span><input name="end" type="date" required class="${inp}"></label>
          </div>
          <fieldset class="space-y-2">
            <legend class="${lbl} mb-1">${esc(T('new.people'))}</legend>
            <div id="peopleRows" class="space-y-2">${newState.people.map(personRow).join('')}</div>
            <button type="button" data-action="new-add-person" class="h-10 px-3 rounded-xl btn-ghost text-xs font-bold"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> ${esc(T('new.addPerson'))}</button>
          </fieldset>
          <fieldset class="space-y-2">
            <legend class="${lbl} mb-1">${esc(T('new.rhythm'))}</legend>
            <label class="flex items-center gap-2 text-sm"><input type="radio" name="rhythm" value="adults" checked> ${esc(T('new.rhythmAdults'))}</label>
            <label class="flex items-center gap-2 text-sm"><input type="radio" name="rhythm" value="kids"> ${esc(T('new.rhythmKids'))}</label>
          </fieldset>
          <p id="newErr" class="text-sm bad hidden"></p>
          <button type="submit" class="w-full h-12 rounded-xl btn-accent text-sm font-bold">${esc(T('new.submit'))}</button>
        </form>
      </main>`;
    screen('vNew');
    setupPlaces();
  }

  // Önce ülke, sonra o ülkenin şehirleri; ikisi de yazarak filtrelenir. Şehir listede yoksa yazılan ad kullanılır.
  function setupPlaces() {
    newState.country = null; newState.city = null;
    const cityCombo = Places.combo($('#cityBox'), {
      placeholder: T('new.cityFirst'), disabled: true, allowFree: true,
      load: () => [], sub: c => c.orig !== c.name ? [c.orig, c.admin].filter(Boolean).join(' · ') : c.admin,
      freeLabel: q => T('new.useTyped', { q }), empty: T('new.noMatch'),
      onPick: c => { newState.city = c; }
    });
    const countryCombo = Places.combo($('#countryBox'), {
      placeholder: T('new.countryPh'), load: () => Places.countries(), empty: T('new.noMatch'),
      sub: c => c.name !== c.en ? c.en : '',
      onPick: c => {
        if (newState.country && c && newState.country.code === c.code) return;
        newState.country = c; newState.city = null;
        cityCombo.reset(() => c ? Places.cities(c.code) : [], !c);
        cityCombo.input.placeholder = c ? T('new.cityPh') : T('new.cityFirst');
        if (c) { Places.cities(c.code).catch(() => {}); setTimeout(() => cityCombo.input.focus(), 0); }
      }
    });
    countryCombo.input.id = 'cbCountry';
    cityCombo.input.id = 'cbCity';
  }

  function readPeopleRows() {
    newState.people = Array.from(document.querySelectorAll('#peopleRows [data-row]')).map(row => {
      const i = Number(row.dataset.row);
      const v = f => row.querySelector(`[data-f="${f}"]`).value.trim();
      const age = parseInt(v('age'), 10);
      return { name: v('name'), age: Number.isFinite(age) ? age : null, group: v('group').toUpperCase(), me: !!row.querySelector('input[name="me"]:checked') && i >= 0 };
    });
  }

  on({
    'new-add-person': () => {
      readPeopleRows();
      newState.people.push({ name: '', age: null, group: '', me: false });
      $('#peopleRows').innerHTML = newState.people.map(personRow).join('');
      const last = $('#peopleRows [data-row]:last-child input');
      if (last) last.focus();
    }
  });

  function createTrip(form) {
    readPeopleRows();
    const f = new FormData(form);
    const title = String(f.get('title')).trim();
    const start = String(f.get('start')), end = String(f.get('end'));
    const err = msg => { const e = $('#newErr'); e.textContent = msg; e.classList.remove('hidden'); };
    const c = newState.country, ct = newState.city;
    if (!c) { err(T('new.errCountry')); $('#cbCountry').focus(); return; }
    if (!ct || !ct.name.trim()) { err(T('new.errCity')); $('#cbCity').focus(); return; }
    const city = ct.name.trim().slice(0, 60), country = c.name.slice(0, 60), countryCode = c.code;
    const cityLocal = ct.orig && ct.orig !== ct.name ? ct.orig.slice(0, 60) : null;
    const dates = start && end && end >= start ? daysBetween(start, end) : [];
    if (!dates.length || dates.length > 30) { err(T('new.errDates')); return; }
    const people = newState.people.filter(p => p.name);
    const me = people.find(p => p.me);
    if (!people.length || !me) { err(T('new.errPeople')); return; }

    // Kişi kimlikleri addan türetilir (tekil)
    const used = new Set();
    const peopleObj = {};
    people.forEach((p, i) => {
      let id = slug(p.name);
      while (used.has(id)) id += i;
      used.add(id);
      p.id = id;
      peopleObj[id] = { name: p.name, order: i, color: PALETTE[i % PALETTE.length], group: p.group || null, age: p.age };
    });
    const groups = {};
    people.forEach(p => { if (p.group) (groups[p.group] = groups[p.group] || { label: { tr: 'Grup ' + p.group, es: 'Grupo ' + p.group }, who: [] }).who.push(p.name + (p.age != null && p.age < 18 ? ` (${p.age})` : '')); });
    Object.values(groups).forEach(g => { g.who = g.who.join(', '); });

    const def = {
      city, country, countryCode, cityLocal,
      people: peopleObj,
      groups,
      slots: RHYTHMS[f.get('rhythm') === 'kids' ? 'kids' : 'adults'],
      days: dates.map((date, i) => ({ key: 'day' + (i + 1), date })),
      pool: [], fixed: {}, suggested: {}, decisions: [], checklist: [], practical: [], lists: {}
    };
    const tid = db().ref('trips').push().key;
    const code = randomId(12);
    const u = uid();
    const updates = {
      [`trips/${tid}/meta`]: { title, city, country, countryCode, start, end: dates[dates.length - 1], owner: u, status: 'active', createdAt: TS() },
      [`trips/${tid}/invite`]: { code },
      [`trips/${tid}/def`]: clean(def),
      [`trips/${tid}/members/${u}`]: { code, personId: me.id, at: TS(), photo: App.photoUrl() },
      [`trips/${tid}/claims/${me.id}`]: u,
      [`users/${u}/planCount`]: account.count + 1,
      [`users/${u}/trips/${tid}`]: { title, city, start, end: dates[dates.length - 1], role: 'owner', at: TS() }
    };
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = T('new.creating');
    db().ref().update(updates).then(() => {
      account.count += 1;
      account.trips[tid] = { title, city, start, role: 'owner' };
      newState.people = [];
      go('#/t/' + tid);
    }, e => {
      btn.disabled = false;
      btn.textContent = T('new.submit');
      err(T('new.fail', { e: e.code || e.message }));
    });
  }

  App.view('new', {
    show() {
      if (!(account.limit > 0 && account.count < account.limit)) { go('#/'); return; }
      const name = (App.user().displayName || '').split(' ')[0];
      if (!newState.people.length) newState.people = [{ name, age: null, group: '', me: true }];
      renderNew();
    }
  });

  document.addEventListener('submit', e => {
    if (e.target.id === 'newForm') { e.preventDefault(); createTrip(e.target); }
  });

  // ---------- davet linkiyle katılma ----------
  App.view('join', {
    show({ id, code }) {
      message(T('join.working'), '', 'fa-spinner fa-spin');
      const u = uid();
      const memberRef = db().ref(`trips/${id}/members/${u}`);
      // Zaten üyeyse doğrudan plana; değilse kodla üyelik yazılır (kurallar kodu doğrular)
      memberRef.once('value').then(s => s.exists(), () => false).then(isMember => {
        if (isMember) return true;
        return memberRef.set({ code, at: TS(), photo: App.photoUrl() }).then(() => true, () => false);
      }).then(ok => {
        if (!ok) { message(T('join.bad'), '', 'fa-link-slash'); return; }
        return db().ref(`trips/${id}/meta`).once('value').then(s => {
          const m = s.val() || {};
          const entry = { title: m.title || '', city: m.city || '', start: m.start || '', end: m.end || '', role: m.owner === u ? 'owner' : 'member', at: TS() };
          account.trips[id] = entry;
          return db().ref(`users/${u}/trips/${id}`).set(entry).catch(() => {});
        }).then(() => go('#/t/' + id));
      });
    }
  });
})();
