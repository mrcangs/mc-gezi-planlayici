// Ülke / şehir verisi ve yazarak filtrelenen açılır liste (combobox).
// Veri: data/countries.json ve data/cities/<ISO>.json (GeoNames, CC BY 4.0). Şehir dosyası ülke seçilince indirilir.
window.Places = (function () {
  'use strict';
  const { esc } = App;

  // Arama için sadeleştirme: küçük harf, aksansız, ı → i
  const norm = s => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').trim();

  let countriesP = null;
  const cityCache = {};

  // [{ code, name (arayüz dilinde), en }]
  function countries() {
    if (!countriesP) {
      countriesP = fetch('data/countries.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(list => {
        let dn = null;
        try { dn = new Intl.DisplayNames([App.lang()], { type: 'region' }); } catch (e) {}
        return list.map(([code, en, n]) => {
          let name = en;
          try { name = (dn && dn.of(code)) || en; } catch (e) {}
          return { code, name, en, n, k: norm(name) + ' ' + norm(en) };
        }).sort((a, b) => a.name.localeCompare(b.name, App.locale()));
      });
      countriesP.catch(() => { countriesP = null; });
    }
    return countriesP;
  }

  // [{ name (gösterilen), orig (yerel ad), admin }] nüfusa göre sıralı
  function cities(code) {
    if (!/^[A-Z]{2}$/.test(code || '')) return Promise.resolve([]);
    if (!cityCache[code]) {
      cityCache[code] = fetch('data/cities/' + code + '.json').then(r => r.ok ? r.json() : { a: [], c: [] }).then(d => d.c.map(([orig, ai, tr]) => {
        const admin = ai >= 0 ? d.a[ai] || '' : '';
        const name = tr || orig;
        return { name, orig, admin, k: norm(name) + ' ' + norm(orig) };
      }));
      cityCache[code].catch(() => { delete cityCache[code]; });
    }
    return cityCache[code];
  }

  // Basit sıralama: tam eşleşme > baştan eşleşme > kelime başı > içinde geçen; eşitlikte veri sırası (nüfus)
  function filter(items, q, max) {
    const nq = norm(q);
    if (!nq) return items.slice(0, max);
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const k = items[i].k;
      const at = k.indexOf(nq);
      if (at < 0) continue;
      const score = (k === nq || k.startsWith(nq + ' ')) ? 0 : at === 0 ? 1 : k[at - 1] === ' ' || k[at - 1] === '-' ? 2 : 3;
      out.push([score, i]);
    }
    out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return out.slice(0, max).map(([, i]) => items[i]);
  }

  let uid = 0;
  // root içine input + liste kurar. opts: { placeholder, load(): Promise<items>, sub(item), onPick(item|null), allowFree, freeLabel(q), disabled }
  function combo(root, opts) {
    const id = 'cb' + (++uid);
    root.classList.add('relative');
    root.innerHTML = `
      <input id="${id}" type="text" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list"
        class="mt-1 w-full rounded-xl pl-3 pr-9 py-2.5 text-sm" placeholder="${esc(opts.placeholder || '')}" ${opts.disabled ? 'disabled' : ''}>
      <i class="fa-solid fa-chevron-down text-[10px] muted absolute right-3 top-[26px] pointer-events-none" aria-hidden="true"></i>
      <ul id="${id}-list" role="listbox" class="hidden absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-y-auto surface rounded-xl shadow-xl py-1"></ul>`;
    const input = root.querySelector('input');
    const ul = root.querySelector('ul');
    let items = [], shown = [], active = -1, picked = null, loading = null;

    const ensure = () => loading || (loading = Promise.resolve(opts.load()).then(x => { items = x || []; return items; }, () => { loading = null; items = []; return items; }));

    function render() {
      const q = input.value.trim();
      shown = filter(items, picked && q === picked.name ? '' : q, 60);
      const exact = q && items.some(it => norm(it.name) === norm(q));
      const free = opts.allowFree && q && !exact ? [{ free: true, name: q }] : [];
      const all = shown.concat(free);
      if (active >= all.length) active = all.length - 1;
      if (q && active < 0 && all.length && !(picked && q === picked.name)) active = 0; // veri sonradan yüklendiyse ilk eşleşme seçili gelsin
      ul.innerHTML = all.length ? all.map((it, i) => `<li id="${id}-o${i}" role="option" data-i="${i}" aria-selected="${i === active}"
          class="px-3 py-2 text-sm cursor-pointer flex items-baseline gap-2 ${i === active ? 'btn-soft' : ''} ${it.free ? 'border-t line' : ''}">
          ${it.free ? `<i class="fa-solid fa-pen text-[10px] muted" aria-hidden="true"></i><span>${esc(opts.freeLabel ? opts.freeLabel(q) : q)}</span>`
            : `<span class="font-semibold">${esc(it.name)}</span>${opts.sub && opts.sub(it) ? `<span class="text-[11px] muted truncate">${esc(opts.sub(it))}</span>` : ''}`}
        </li>`).join('')
        : `<li class="px-3 py-2 text-xs muted">${esc(loading && !items.length ? '…' : opts.empty || '—')}</li>`;
      ul._all = all;
      input.setAttribute('aria-activedescendant', active >= 0 ? `${id}-o${active}` : '');
      const el = ul.querySelector(`[data-i="${active}"]`);
      if (el) el.scrollIntoView({ block: 'nearest' });
    }

    function open() {
      if (input.disabled) return;
      ul.classList.remove('hidden');
      input.setAttribute('aria-expanded', 'true');
      render();
      ensure().then(() => { if (!ul.classList.contains('hidden')) render(); });
    }
    function close() {
      ul.classList.add('hidden');
      input.setAttribute('aria-expanded', 'false');
      active = -1;
    }
    function choose(it) {
      picked = it.free ? { name: it.name, orig: it.name, free: true } : it;
      input.value = picked.name;
      close();
      opts.onPick && opts.onPick(picked);
    }

    input.addEventListener('focus', open);
    input.addEventListener('click', open);
    input.addEventListener('input', () => {
      if (picked && input.value !== picked.name) { picked = null; opts.onPick && opts.onPick(null); }
      active = input.value.trim() ? 0 : -1;
      open();
    });
    input.addEventListener('keydown', e => {
      const all = ul._all || [];
      if (e.key === 'ArrowDown') { e.preventDefault(); if (ul.classList.contains('hidden')) open(); else { active = Math.min(all.length - 1, active + 1); render(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); }
      else if (e.key === 'Enter') { if (!ul.classList.contains('hidden') && all[active]) { e.preventDefault(); choose(all[active]); } }
      else if (e.key === 'Escape') { if (!ul.classList.contains('hidden')) { e.preventDefault(); e.stopPropagation(); close(); } }
      else if (e.key === 'Tab') { if (!ul.classList.contains('hidden') && all[active] && input.value.trim() && !picked) choose(all[active]); close(); }
    });
    // mousedown: input blur olmadan seçim yapılsın
    ul.addEventListener('mousedown', e => {
      const li = e.target.closest('[data-i]');
      e.preventDefault();
      if (li) choose((ul._all || [])[Number(li.dataset.i)]);
    });
    input.addEventListener('blur', () => setTimeout(close, 120));

    return {
      input,
      value: () => picked,
      // Yeni veri kaynağı (ör. ülke değişince şehirler)
      reset(load, disabled) {
        opts.load = load; loading = null; items = []; picked = null;
        input.value = ''; input.disabled = !!disabled; close();
      },
      set(it) { picked = it; input.value = it ? it.name : ''; }
    };
  }

  return { countries, cities, combo, norm };
})();
