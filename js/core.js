// Gezi Planlayıcı — çekirdek: Firebase, Google girişi, yönlendirme ve ortak yardımcılar.
// Sayfalar (home, trip, admin…) App.view(ad, { show, hide }) ile kaydolur; adres #/… ile seçilir.
window.App = (function () {
  'use strict';

  // ---------- yardımcılar ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC_MAP[c]);
  const pad = n => String(n).padStart(2, '0');
  const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fileSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const clean = v => JSON.parse(JSON.stringify(v)); // Firebase undefined kabul etmez

  // Serbest metindeki http(s) linklerini tıklanabilir yapar; geri kalan her şey kaçışlı
  function linkify(text) {
    const short = url => url.length <= 40 ? url : url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] + '/…';
    return String(text || '').split(/(https?:\/\/[^\s]+)/g).map((part, i) => i % 2
      ? `<a href="${esc(part)}" target="_blank" rel="noopener" class="accent underline break-all">${esc(short(part))}</a>`
      : esc(part)).join('');
  }

  // Tahmin edilemeyen kısa kimlik (davet kodu vb.)
  function randomId(n) {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const a = new Uint32Array(n);
    crypto.getRandomValues(a);
    return Array.from(a, x => abc[x % abc.length]).join('');
  }

  // Kurallardaki anahtarla aynı: küçük harf, nokta yerine virgül
  const emailKey = email => String(email || '').toLowerCase().replace(/\./g, ',');

  // ---------- dil ----------
  let LANG = 'tr';
  const TL = (lang, k, vars) => {
    let s = (UI[lang] && UI[lang][k]) || UI.tr[k] || k;
    if (vars) Object.keys(vars).forEach(n => { s = s.split('{' + n + '}').join(vars[n]); });
    return s;
  };
  const T = (k, vars) => TL(LANG, k, vars);
  const locale = () => (LANG === 'es' ? 'es-ES' : 'tr-TR');
  function applyStaticText() {
    $$('[data-i18n]').forEach(el => { el.textContent = T(el.dataset.i18n); });
    $$('[data-i18n-ph]').forEach(el => { el.placeholder = T(el.dataset.i18nPh); });
    $$('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', T(el.dataset.i18nAria)); });
  }
  function setLang(lang) {
    lang = lang === 'es' ? 'es' : 'tr';
    if (lang === LANG) return;
    LANG = lang;
    document.documentElement.lang = lang;
    applyStaticText();
  }
  // İçerik alanı düz metin ya da { tr, es } olabilir
  const L = v => (v && typeof v === 'object' && !Array.isArray(v) && 'tr' in v) ? (v[LANG] || v.tr) : v;

  const CATEGORIES = [
    { key: 'food', icon: 'fa-utensils' }, { key: 'coffee', icon: 'fa-mug-hot' }, { key: 'kids', icon: 'fa-child-reaching' },
    { key: 'sight', icon: 'fa-landmark' }, { key: 'night', icon: 'fa-martini-glass-citrus' }, { key: 'sport', icon: 'fa-dumbbell' }
  ];
  const catLabel = key => T('cat.' + (CATEGORIES.some(c => c.key === key) ? key : 'custom'));

  // ---------- bildirim ----------
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.add('hidden'), 2400);
  }

  // ---------- ekranlar ----------
  const SCREENS = ['vLoading', 'vMsg', 'vSignin', 'vHome', 'vNew', 'vAdmin', 'vTrip'];
  function screen(id) {
    SCREENS.forEach(x => { const el = $('#' + x); if (el) el.classList.toggle('hidden', x !== id); });
    window.scrollTo(0, 0);
  }
  function message(title, msg, icon) {
    $('#msgIcon').className = 'fa-solid ' + (icon || 'fa-lock');
    $('#msgTitle').textContent = title;
    $('#msgText').textContent = msg || '';
    screen('vMsg');
  }

  // ---------- Firebase ----------
  let db = null, auth = null, user = null;
  const cfg = window.FIREBASE_CONFIG || {};
  const configured = !!(cfg.apiKey && cfg.databaseURL);
  const TS = () => firebase.database.ServerValue.TIMESTAMP;

  // ---------- yönlendirme ----------
  const views = {};
  let current = null;
  function view(name, impl) { views[name] = impl; }
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const p = h.split('/').filter(Boolean).map(decodeURIComponent);
    if (p[0] === 't' && p[1]) return { name: 'trip', params: { id: p[1] } };
    if (p[0] === 'join' && p[1] && p[2]) return { name: 'join', params: { id: p[1], code: p[2] } };
    if (p[0] === 'admin') return { name: 'admin', params: {} };
    if (p[0] === 'new') return { name: 'new', params: {} };
    return { name: 'home', params: {} };
  }

  function route() {
    if (!configured) { message(T('setup.title'), T('setup.msg'), 'fa-gear'); return; }
    if (user === undefined) return; // giriş durumu henüz bilinmiyor
    if (!user) { screen('vSignin'); return; }
    const r = parseHash();
    if (current && current.name !== r.name && views[current.name] && views[current.name].hide) views[current.name].hide();
    current = r;
    const v = views[r.name];
    if (v) v.show(r.params); else go('#/');
  }

  // ---------- giriş ----------
  function signIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    auth.signInWithPopup(provider).catch(err => {
      if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment')) {
        auth.signInWithRedirect(provider);
      } else if (err && err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        toast(T('auth.fail', { e: err.code || err.message }));
      }
    });
  }
  function signOut() {
    if (current && views[current.name] && views[current.name].hide) views[current.name].hide();
    current = null;
    auth.signOut();
  }

  // Profil her girişte güncellenir; plan hakkı (allowlist) kişinin kendi kaydından okunur
  const account = { admin: false, limit: 0, count: 0, trips: {}, loaded: false };
  function loadAccount() {
    const uid = user.uid;
    const tasks = [
      db.ref('users/' + uid + '/profile').update({ name: user.displayName || user.email, email: user.email || '', photo: user.photoURL || '', lastSeen: TS() }).catch(() => {}),
      db.ref('admins/' + uid).once('value').then(s => { account.admin = s.val() === true; }, () => { account.admin = false; }),
      (user.email && user.emailVerified ? db.ref('allowlist/' + emailKey(user.email) + '/limit').once('value').then(s => { account.limit = Number(s.val()) || 0; }, () => { account.limit = 0; }) : Promise.resolve()),
      db.ref('users/' + uid + '/planCount').once('value').then(s => { account.count = Number(s.val()) || 0; }, () => {}),
      db.ref('users/' + uid + '/trips').once('value').then(s => { account.trips = s.val() || {}; }, () => {})
    ];
    return Promise.all(tasks).then(() => { account.loaded = true; });
  }

  function avatarHtml(size) {
    if (!user) return '';
    const name = user.displayName || user.email || '?';
    return user.photoURL
      ? `<img src="${esc(user.photoURL)}" alt="${esc(name)}" referrerpolicy="no-referrer" class="${size} rounded-full object-cover">`
      : `<span class="${size} rounded-full btn-accent inline-flex items-center justify-center font-extrabold">${esc(name[0])}</span>`;
  }

  // Tıklama eylemleri: data-action="…" → kayıtlı fonksiyon (her sayfa kendi eylemlerini ekler)
  const actions = {};
  function on(map) { Object.assign(actions, map); }
  document.addEventListener('click', e => {
    if (e.target.closest('a[href]') && !e.target.closest('[data-action]')) return;
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  on({
    'sign-in': () => signIn(),
    'sign-out': () => signOut(),
    'go': el => go(el.dataset.href)
  });

  function copyText(text, okMsg) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => { toast(okMsg || T('home.copied')); return true; }, () => false);
    return Promise.resolve(false);
  }

  function init() {
    applyStaticText();
    if (!configured) { route(); return; }
    firebase.initializeApp(cfg);
    db = firebase.database();
    auth = firebase.auth();
    user = undefined;
    screen('vLoading');
    auth.getRedirectResult().catch(err => toast(T('auth.fail', { e: err.code || err.message })));
    auth.onAuthStateChanged(u => {
      user = u || null;
      if (!user) { account.loaded = false; route(); return; }
      screen('vLoading');
      loadAccount().then(route);
    });
    window.addEventListener('hashchange', route);
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    $, $$, LS, esc, pad, localDate, fileSize, linkify, clean, randomId, emailKey,
    T, TL, L, setLang, locale, applyStaticText, lang: () => LANG,
    CATEGORIES, catLabel, toast, screen, message, view, go, on, copyText, avatarHtml,
    TS, db: () => db, user: () => user, account, loadAccount
  };
})();
