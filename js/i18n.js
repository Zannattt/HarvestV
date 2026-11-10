/* Tiny i18n layer (no build step). Strings live in js/lang-<code>.js; to add a language, add a lang file,
   a <script> tag in index.html and an <option> in the language selector. Missing keys fall back to English. */
const I18N = { lang: 'en', codes: { en: 'EN', bn: 'বাং' }, strings: { en: {}, bn: {} } };
try { const saved = localStorage.getItem('hvLang'); if (saved && saved !== 'en') I18N.lang = saved; } catch (e) { /* storage blocked */ }

/* t('key', {name: value}) -> translated text with {name} placeholders filled. */
function t(key, vars) {
  const cur = I18N.strings[I18N.lang] || {};
  let s = cur[key] !== undefined ? cur[key] : (I18N.strings.en[key] !== undefined ? I18N.strings.en[key] : key);
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? vars[k] : m));
  return s;
}
/* tv(value): translate a data value (crop name, season, soil type, level label...). Unknown values pass through unchanged. */
function tv(s) {
  if (s === null || s === undefined || I18N.lang === 'en') return s;
  const d = I18N.strings[I18N.lang] || {};
  if (d['d.' + s] !== undefined) return d['d.' + s];
  const m = /^(\d+)\s*[–-]\s*(\d+) days$/.exec(s);
  return m ? m[1] + '–' + m[2] + ' ' + (d['d.days'] || 'days') : s;
}
/* Comma-separated pest/disease lists. */
function tvPests(s) {
  if (!s || I18N.lang === 'en') return s;
  const d = I18N.strings[I18N.lang] || {};
  return String(s).split(',').map(x => x.trim()).map(x => d['p.' + x.toLowerCase()] !== undefined ? d['p.' + x.toLowerCase()] : x).join(', ');
}
/* Sentences that come from the backend API (warnings, disclaimer, ranking policy). Unrecognised text stays as received. */
function tApi(s) {
  if (typeof s !== 'string' || I18N.lang === 'en') return s;
  const d = I18N.strings[I18N.lang] || {}, plain = s.replace(/^\d+\.\s*/, '');
  if (d['a.' + s] !== undefined) return d['a.' + s];
  if (d['a.' + plain] !== undefined) return d['a.' + plain];
  let m;
  if ((m = /^(\d+) transition\(s\) are one-sided/.exec(s))) return t('api.oneSided', { n: m[1] });
  if ((m = /^(\d+) transition\(s\) are unknown/.exec(s))) return t('api.unknown', { n: m[1] });
  if ((m = /^Search stopped after (\d+) nodes/.exec(s))) return t('api.stopped', { n: m[1] });
  return s;
}
const tPrune = k => { const d = I18N.strings[I18N.lang] || {}; return I18N.lang !== 'en' && d['a.prune.' + k] !== undefined ? d['a.prune.' + k] : String(k).replace(/_/g, ' '); };
/* 'Near Rangpur, Bangladesh' / 'Rangpur, Bangladesh' -> display text. The stored value stays English. */
function locName(label) {
  const near = /^Near /.test(label), place = String(label).replace(/^Near /, '').split(',').map(x => tv(x.trim())).join(', ');
  return near ? t('farm.near', { place }) : place;
}

/* Bangla digits: applied to text nodes only (never attributes, values or ids), so data and logic are untouched. */
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
function localizeDigits(root) {
  if (I18N.lang !== 'bn' || typeof document === 'undefined') return;
  const fix = n => { const v = n.nodeValue.replace(/[0-9]/g, d => BN_DIGITS[d]); if (v !== n.nodeValue) n.nodeValue = v; };
  if (root.nodeType === 3) { if (!/^(SCRIPT|STYLE|TEXTAREA)$/.test(root.parentNode ? root.parentNode.nodeName : '')) fix(root); return; }
  if (root.nodeType !== 1) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const nodes = []; let n; while ((n = w.nextNode())) nodes.push(n);
  nodes.forEach(fix);
}

/* Static page parts (header, footer) are marked with data-i18n. */
function applyStatic() {
  document.documentElement.lang = I18N.lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  const code = document.getElementById('langCode'); if (code) code.textContent = I18N.codes[I18N.lang] || I18N.lang.toUpperCase();
    document.querySelectorAll('[data-lang]').forEach(b => { const on = b.dataset.lang === I18N.lang; b.classList.toggle('active', on); if (b.closest('.mobile-lang')) b.setAttribute('aria-pressed', String(on)); });
  const copy = document.getElementById('copy'); if (copy) copy.textContent = t('foot.copy', { year: new Date().getFullYear() });
}
function setLang(lang) {
  if (!I18N.strings[lang] || lang === I18N.lang) return;
  /* keep half-filled Generate form choices across the re-render */
  if (typeof state !== 'undefined' && state.readRotForm && location.hash === '#/generate') { try { state.rotForm = state.readRotForm(); } catch (e) { /* ignore */ } }
  I18N.lang = lang;
  try { localStorage.setItem('hvLang', lang); } catch (e) { /* storage blocked */ }
  applyStatic();
  if (typeof route === 'function') route();
}
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(localizeDigits))).observe(document.body, { childList: true, subtree: true });
  /* header language button: icon + short code (EN / বাং) with a small menu */
    /* language buttons (header menu and mobile menu) */
  const langBtn = document.getElementById('langBtn'), langMenu = document.getElementById('langMenu'), langBox = document.getElementById('langBox');
  const closeLang = () => { if (langMenu) langMenu.classList.remove('open'); if (langBtn) langBtn.setAttribute('aria-expanded', 'false'); };
  if (langBtn && langMenu) langBtn.addEventListener('click', e => { e.stopPropagation(); const open = langMenu.classList.toggle('open'); langBtn.setAttribute('aria-expanded', String(open)); });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-lang]');
    if (b) { setLang(b.dataset.lang); closeLang(); return; }
    if (langBox && !langBox.contains(e.target)) closeLang();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLang(); });
}

