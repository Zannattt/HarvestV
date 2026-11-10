/* HarvestV frontend prototype: hash-routed single page app, plain JS. */
const app = document.getElementById('app');
const state = { profile: null, rotation: null, rotForm: null, report: null, coords: null, env: { data: null, fetchedAt: null, key: null } };
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const findCrop = n => cropData.find(c => c.name === n);
const tone = (label, goodHigh = true) => {
  const hi = /^High$/.test(label), lo = /^(Low|Lower)$/.test(label);
  return (hi ? goodHigh : lo && !goodHigh) ? 'good' : (lo ? (goodHigh ? 'bad' : 'good') : (hi ? 'bad' : 'mid'));
};
const badge = (lbl, goodHigh = true) => `<span class="badge ${tone(lbl, goodHigh)}">${esc(tv(lbl))}</span>`;
const seqHtml = seq => `<span class="seq">${seq.map(x => esc(tv(x))).join('<i> → </i>')}</span>`;
const cropOptions = (sel) => cropData.map(c => `<option value="${esc(c.name)}" ${c.name === sel ? 'selected' : ''}>${esc(tv(c.name))}</option>`).join('');

/* ---------- DEMO scoring, used ONLY by "Analyze My Rotation" and its report (not produced by the rotation engine) ----------
   Generated sequences come from POST /api/rotations/generate (see js/rotation.js). */
function evaluateRotation(seq, p) {
  const crops = seq.map(findCrop), avgWater = crops.reduce((s, c) => s + c.water, 0) / crops.length;
  const legume = crops.some(c => c.legume), unique = new Set(seq).size;
  const repeats = seq.some((c, i) => c === seq[(i + 1) % seq.length]);
  const irr = p.irrigation || 'Limited', weakIrr = irr === 'Limited' || irr === 'None';
  let risk = 0.4;
  if (avgWater >= 2.3 && weakIrr) risk += 1; else if (avgWater >= 2 && weakIrr) risk += .5;
  if (repeats) risk += 1; if (!legume) risk += .5;
  if (weakIrr && crops.some(c => c.drought === 'Low')) risk += .4;
  const riskLabel = risk < .8 ? 'Low' : risk < 1.5 ? 'Low–Moderate' : risk < 2.2 ? 'Moderate' : 'High';
  const pri = p.priorities || [];
  let score = 3 - risk * .6 + (legume ? .5 : 0) + (unique > 1 ? .3 : 0);
  const has = k => pri.includes(k), fit = [];
  if (has('Water efficiency') && avgWater < 2.2) { score += .5; fit.push('Lower overall water demand'); }
  if (has('Soil health') && legume) { score += .5; fit.push('Includes a nitrogen-fixing legume'); }
  if (has('Profitability') && seq.some(c => ['Potato', 'Maize', 'Mustard', 'Tomato'].includes(c))) { score += .4; fit.push('Includes higher-value crops'); }
  if (has('Lower risk') && risk < 1.5) { score += .4; fit.push('Lower-risk profile'); }
  if (has('Crop diversification') && unique >= 3) { score += .4; fit.push('Three different crops'); }
  if (has('Lower fertilizer requirement') && legume) { score += .4; fit.push('Legume may reduce nitrogen needs'); }
  const preferred = (p.crops || []).filter(c => seq.includes(c)).length; score += preferred * .15;
  const L = n => n >= 2.5 ? 'High' : n >= 1.8 ? 'Moderate' : 'Lower';
  const waterLabel = avgWater < 1.8 ? 'Low–Moderate' : avgWater < 2.4 ? 'Moderate' : 'Moderate–High';
  const seasonOk = seq.every((c, i) => i === 0 || findCrop(seq[i - 1]).after.includes(c) || c === 'Rice');
  const ratings = {
    'Environmental compatibility': weakIrr && avgWater > 2.3 ? 2 : 3,
    'Water compatibility': avgWater < 1.8 ? 3 : avgWater < 2.4 ? 2 : (weakIrr ? 1.2 : 2),
    'Seasonal compatibility': seasonOk ? 3 : 2,
    'Rotation compatibility': repeats ? 1.5 : (legume ? 3 : 2.3),
  };
  const strengths = [], risks = [], reasons = [], concerns = [];
  if (seasonOk) { strengths.push('Good seasonal compatibility'); reasons.push('Fits the selected growing seasons'); } else concerns.push('Check that planting windows line up');
  if (unique >= 3) strengths.push('Diversified crop sequence');
  if (legume) { strengths.push('Legume may support soil nitrogen'); reasons.push('Includes crops with different resource requirements'); }
  if (!weakIrr || avgWater < 2.3) { strengths.push('Compatible with selected water conditions'); reasons.push('Compatible with the selected irrigation level'); }
  fit.forEach(f => reasons.push(f));
  if (pri.length) reasons.push('Matches your selected priorities');
  if (weakIrr && avgWater >= 2) { risks.push('Possible water stress'); concerns.push('Possible late-season water stress'); }
  if (repeats) { risks.push('Same crop repeated back-to-back'); concerns.push('Repeated crops can build up pests and disease'); }
  if (!legume) risks.push('No legume to rebuild soil nitrogen');
  risks.push('Planting-window sensitivity'); concerns.push('Requires appropriate planting window');
  return { seq, score, suitability: score >= 3.4 ? 'High' : score >= 2.6 ? 'Moderate' : 'Lower', water: waterLabel, risk: riskLabel, risk_pts: risk,
    ratings: Object.fromEntries(Object.entries(ratings).map(([k, v]) => [k, v])), ratingLabel: L, strengths, risks, reasons, concerns };
}
async function analyzeRotation(seq, profile) { return evaluateRotation(seq, profile); } // API: POST /api/rotations/analyze

/* ---------- Shared UI pieces ---------- */
/* `e` comes from toEnvironmentView() in data.js; null means the data is unavailable. */
function displayEnvironmentalConditions(e) {
  if (!e) return `<div class="card sky">${t('env.unavailable')}</div>`;
  const has = v => v !== null && v !== undefined, na = t('env.na');
  const s = (i, k, v, pct) => `<div class="card stat env"><div class="i">${i}</div><div class="k">${k}</div><div class="v"${v === na ? ' style="font-size:1rem"' : ''}>${v}</div>${pct != null ? `<div class="bar sky"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>` : ''}</div>`;
  const solarMax = /kWh/i.test(e.solarUnits) ? 8 : 30;
  return `<div class="grid">
    ${s('🌡', t('env.temp'), e.temperature + '°C', e.temperature / 45 * 100)}
    ${s('🌧', t('env.rain', { n: e.rainfallDays }), e.rainfall + ' ' + t('unit.mm'), e.rainfall * 1.5)}
    ${s('☀', t('env.solar'), `${e.solar} ${esc(e.solarUnits)}`, e.solar / solarMax * 100)}
    ${s('💧', t('env.soilM'), has(e.soilMoisture) ? e.soilMoisture : na)}
    ${s('🌱', t('env.veg'), has(e.ndvi) ? e.ndvi : na)}</div>
  <details><summary>${t('env.details')}</summary><p>${t('env.detailsText', { source: esc(tv(e.source)), date: esc(e.dataDate) })}</p></details>`;
}
const fieldSel = (id, label, opts, val) => `<div><label for="${id}">${label}</label><select id="${id}" name="${id}">${opts.map(o => `<option value="${esc(o)}" ${o === val ? 'selected' : ''}>${esc(tv(o))}</option>`).join('')}</select></div>`;
function districtOptions(division, selectedDistrict = '') {
  return districtsByDivision[division].map(d => `<option value="${esc(d + ', Bangladesh')}" ${d === selectedDistrict ? 'selected' : ''}>${esc(tv(d))}</option>`).join('');
}
function locationFields(label, districtId) {
  const district = String(label || '').replace(/^Near /, '').split(',')[0];
  const division = Object.keys(districtsByDivision).find(d => districtsByDivision[d].includes(district)) || 'Dhaka';
  return `<div><label for="${districtId}Division">${t('farm.division')}</label><select id="${districtId}Division" data-district-target="${districtId}">${Object.keys(districtsByDivision).map(d => `<option value="${d}" ${d === division ? 'selected' : ''}>${esc(tv(d))}</option>`).join('')}</select></div>
    <div><label for="${districtId}">${t('farm.district')}</label><select id="${districtId}" name="location">${districtOptions(division, district)}</select></div>`;
}
// Delegation also handles forms inserted after navigation or a language change.
document.addEventListener('change', e => {
  const targetId = e.target.dataset.districtTarget;
  if (!targetId || !districtsByDivision[e.target.value]) return;
  const districtSelect = document.getElementById(targetId);
  if (districtSelect) districtSelect.innerHTML = districtOptions(e.target.value);
});
function farmFormFields(f, { skipPrevious = false } = {}) {
  return `<div class="form">
    ${locationFields(f.location, 'location')}
    <div><label for="size">${t('ff.size')}</label><input type="number" id="size" name="size" min="0.1" step="0.1" value="${f.size}"></div>
    ${fieldSel('soil', t('ff.soil'), ['Clay loam', 'Loam', 'Sandy loam', 'Alluvial', 'Clay'], f.soil)}
    ${skipPrevious ? '' : fieldSel('previous', t('ff.prevCur'), cropData.map(c => c.name), f.previous)}
    ${fieldSel('irrigation', t('ff.irr'), ['None', 'Limited', 'Moderate', 'Reliable'], f.irrigation)}
    ${fieldSel('labour', t('ff.labour'), ['Family only', 'Limited hired labour', 'Good availability'], 'Family only')}
  </div>
  <h2>${t('ff.matters')}</h2>
  <div class="chips">${['Water efficiency', 'Soil health', 'Profitability', 'Lower risk', 'Crop diversification', 'Lower fertilizer requirement'].map(p => `<label class="chip"><input type="checkbox" name="priorities" value="${p}" ${p === f.priority ? 'checked' : ''}><span>${esc(tv(p))}</span></label>`).join('')}</div>`;
}
function readProfile(form) {
  const d = new FormData(form);
  return { location: d.get('location'), size: d.get('size'), soil: d.get('soil'), previous: d.get('previous'), irrigation: d.get('irrigation'), labour: d.get('labour'), priorities: d.getAll('priorities'), crops: d.getAll('crops') };
}
function runProcessing(title, steps, done) {
  app.innerHTML = `<div class="proc"><div class="spin"></div><h1 class="title">${title}</h1><ul class="steps">${steps.map(s => `<li>${s}</li>`).join('')}</ul><p class="sub">${t('proc.prep')}</p></div>`;
  const lis = [...app.querySelectorAll('li')];
  lis.forEach((li, i) => setTimeout(() => li.classList.add('done'), 250 + i * 300));
  setTimeout(done, 250 + lis.length * 300 + 200);
}

/* ---------- Environmental data loading (Stage 1) ---------- */
let envRequestId = 0; // lets us ignore stale responses if the location changes mid-request
const envKey = c => c.latitude.toFixed(2) + ',' + c.longitude.toFixed(2);
/* Coordinates priority: browser GPS this session > saved farm coordinates > demo city coordinates. */
function resolveCoords(farm) {
  if (state.coords) return state.coords;
  if (farm.latitude != null && farm.longitude != null) return { latitude: farm.latitude, longitude: farm.longitude };
  const c = locations[(farm.location || '').replace('Near ', '').split(',')[0]];
  return c ? { latitude: c[0], longitude: c[1] } : null;
}
/* Uses GPS silently only if the user already granted permission (no surprise prompt). */
async function tryBrowserLocation() {
  if (!navigator.geolocation || !navigator.permissions) return null;
  try { if ((await navigator.permissions.query({ name: 'geolocation' })).state !== 'granted') return null; } catch (e) { return null; }
  return new Promise(res => navigator.geolocation.getCurrentPosition(
    pos => res({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }), () => res(null), { timeout: 8000 }));
}
function renderEnvBox({ loading = false, error = null, onRetry = null } = {}) {
  const box = document.getElementById('envBox'); if (!box) return; // user already navigated away
  const { data, fetchedAt } = state.env;
  let html = loading ? `<div class="note">${t('env.fetching')}</div>` : '';
  if (error) html += `<div class="note">${esc(error)}${data ? ' ' + t('env.lastGood') : ''}</div>`;
  html += displayEnvironmentalConditions(data);
  if (data) {
    const time = fetchedAt.toLocaleTimeString(I18N.lang === 'bn' ? 'bn-BD' : [], { hour: '2-digit', minute: '2-digit' });
    html += `<p class="sub" style="margin:12px 0 0">${t('env.updated', { time, src: data.isMock ? t('env.demoSrc') : t('env.nasaSrc', { date: esc(data.dataDate) }) })}</p>`;
  }
  if (onRetry) html += `<p><button class="btn ghost" id="retryEnv">${t('common.retry')}</button></p>`;
  box.innerHTML = html;
  if (onRetry) document.getElementById('retryEnv').onclick = onRetry;
}
/* Called once per visit to My Farm (and when the location changes), never on a timer. */
async function loadEnvironment(farm) {
  const coords = resolveCoords(farm), id = ++envRequestId;
  if (!coords) return renderEnvBox({ error: t('env.chooseLoc') });
  const key = envKey(coords);
  if (state.env.key !== key) state.env = { data: null, fetchedAt: null, key }; // never show another place's data
  renderEnvBox({ loading: true });
  try {
    const data = toEnvironmentView(await getEnvironmentalData(coords.latitude, coords.longitude));
    if (id !== envRequestId) return;
    state.env = { data, fetchedAt: new Date(), key };
    renderEnvBox();
  } catch (err) {
    console.warn('Environmental data request failed:', err);
    if (id === envRequestId) renderEnvBox({ error: t('env.unavailable'), onRetry: () => loadEnvironment(farm) });
  }
}
/* For the report page: reuse what My Farm already loaded; fetch once only if nothing is cached. */
async function ensureEnvironment() {
  if (state.env.data) return state.env.data;
  try {
    const c = resolveCoords(await getFarmData()); if (!c) return null;
    const data = toEnvironmentView(await getEnvironmentalData(c.latitude, c.longitude));
    state.env = { data, fetchedAt: new Date(), key: envKey(c) };
    return data;
  } catch (err) { console.warn('Environmental data request failed:', err); return null; }
}

/* Rotation pages and farm forms read the crop catalog synchronously, so make sure it is loaded first. */
async function ensureCropCatalog() {
  const stamp = location.hash;
  try { await getCropData(); return location.hash === stamp; }
  catch (err) {
    console.warn('Crop catalog request failed:', err);
    if (location.hash !== stamp) return false;
    app.innerHTML = `<h1 class="title">${t('crops.unavailTitle')}</h1><p class="sub">${t('crops.unavailSub')}</p><p><button class="btn" id="retryCrops">${t('common.retry')}</button></p>`;
    document.getElementById('retryCrops').onclick = route;
    return false;
  }
}

const ICON_BELL = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>';
const lpIcon = body => `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const LP_ICONS = {
  wheat: lpIcon('<path d="M12 22V8"/><path d="M12 8c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4z"/><path d="M12 8c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4z"/><path d="M12 14c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4z"/><path d="M12 14c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4z"/><path d="M12 20c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4z"/><path d="M12 20c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4z"/>'),
  sprout: lpIcon('<path d="M12 21v-9"/><path d="M12 12c0-4-2.6-6.5-7-6.5 0 4 2.6 6.5 7 6.5z"/><path d="M12 14c0-3.4 2.2-5.5 6-5.5 0 3.4-2.2 5.5-6 5.5z"/>'),
  leaf: lpIcon('<path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14z"/><path d="M5 19l9-9"/>'),
  round: lpIcon('<circle cx="12" cy="14" r="7"/><path d="M12 7c0-2 1-3.5 3-4"/><path d="M9 7.5c1 .8 2 .8 3 0 1 .8 2 .8 3 0"/>')
};

/* ---------- Views ---------- */
const views = {
    home() {
    app.className = 'wide fade';
    const crops = ['Rice', 'Mustard', 'Mung Bean'];
    const seq = () => `<ol class="lp-seq">${crops.map(x => `<li>${esc(tv(x))}</li>`).join('')}</ol>`;
    const thumbs = [['Wheat', LP_ICONS.wheat], ['Mung Bean', LP_ICONS.sprout], ['Jute', LP_ICONS.leaf], ['Tomato', LP_ICONS.round]]
      .map(([n, ic]) => `<li>${ic}<span>${esc(tv(n))}</span></li>`).join('');
    app.innerHTML = `
    <section class="lp-hero" aria-labelledby="lp-h1"><div class="lp-wrap lp-hero-grid">
      <div>
        <h1 id="lp-h1">${t('home.h1')}</h1>
        <p class="lp-lead">${t('home.lead')}</p>
        <div class="lp-actions"><a class="lp-btn" href="#/generate">${t('home.cta.plan')}</a><a class="lp-btn lp-btn-ghost" href="#/crops">${t('home.cta.crops')}</a></div>
        <p class="lp-tagline">${t('home.tagline')}</p>
      </div>
      <div class="lp-hero-media">
        <div class="lp-photo">
          <svg class="lp-art" viewBox="0 0 600 480" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><rect width="600" height="480" fill="#E9E2D0"/><circle cx="470" cy="96" r="34" fill="#DA9100"/><path d="M0 190Q150 120 300 170T600 150V480H0Z" fill="#918151"/><path d="M0 215Q180 160 320 200T600 185V480H0Z" fill="#4B5320"/><path d="M300 205L-80 480M300 205L70 480M300 205L190 480M300 205V480M300 205L410 480M300 205L530 480M300 205L680 480" stroke="#C3B091" stroke-width="4" fill="none"/></svg>
          <img src="tests/images/field.jpg" width="1200" height="960" alt="${esc(t('home.hero.alt'))}" fetchpriority="high" decoding="async" onerror="this.remove()">
        </div>
        <div class="lp-float"><span class="lp-float-label">${t('home.example')}</span>${seq()}</div>
      </div>
    </div></section>

    <section class="lp-section" aria-labelledby="lp-feat" style="padding-top:0"><div class="lp-wrap">
      <h2 class="lp-h2" id="lp-feat">${t('home.features.h')}</h2>
      <div class="lp-bento">
        <article class="lp-card lp-card-rot">
          <div><h3>${t('rot.title')}</h3><p>${t('home.f1.d')}</p></div>
          <div class="lp-visual">${seq()}<small>${t('home.example')}</small></div>
          <a class="lp-btn lp-btn-light" href="#/generate">${t('home.cta.plan')}</a>
        </article>
        <article class="lp-card lp-card-crops">
          <h3>${t('home.f2.t')}</h3><p>${t('home.f2.d')}</p>
          <ul class="lp-thumbs">${thumbs}</ul>
          <a class="lp-btn lp-btn-ghost" href="#/crops">${t('home.f2.a')}</a>
        </article>
        <article class="lp-card">
          <h3>${t('nav.farm')}</h3><p>${t('home.f3.d')}</p>
          <svg class="lp-farm-art" viewBox="0 0 240 96" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><rect width="240" height="96" fill="#E9E2D0"/><rect x="20" y="22" width="200" height="60" rx="6" fill="#C3B091"/><path d="M20 38H220M20 54H220M20 70H220" stroke="#918151" stroke-width="3"/><circle cx="196" cy="14" r="8" fill="#DA9100"/></svg>
          <a class="lp-btn lp-btn-ghost" href="#/farm">${t('home.f3.a')}</a>
        </article>
      </div>
    </div></section>

    <section class="lp-section" aria-labelledby="lp-how" style="padding-top:0"><div class="lp-wrap">
      <h2 class="lp-h2" id="lp-how">${t('home.how.h')}</h2>
      <ol class="lp-steps">${[1, 2, 3].map(n => `<li class="lp-step"><div class="lp-num" aria-hidden="true">${n}</div><h3>${t('home.s' + n + '.t')}</h3><p>${t('home.s' + n + '.d')}</p></li>`).join('')}</ol>
    </div></section>

    <section class="lp-cta" aria-labelledby="lp-final"><div class="lp-wrap">
      <h2 id="lp-final">${t('home.final.h')}</h2><p>${t('home.final.d')}</p>
      <a class="lp-btn lp-btn-light" href="#/generate">${t('home.cta.plan')}</a>
    </div></section>`;
  },
  async farm() {
    const f = await getFarmData();
    app.innerHTML = `<h1 class="title">${t('nav.farm')}</h1><p class="sub">${t('farm.sub')}</p>
      <div class="card sky row space"><div><h3>📍 ${t('farm.location')}</h3><div id="locText" style="font-size:1.3rem;font-weight:600">${esc(locName(f.location))}</div><small id="coords"></small></div>
      <div class="row"><button class="btn" id="geo">${t('farm.useGeo')}</button><button class="btn ghost" id="chg">${t('farm.change')}</button></div></div>
      <div id="manual" style="display:none;margin-top:12px" class="card"><div class="form">${locationFields(f.location, 'manLoc')}</div><p><button class="btn" id="manSave">${t('farm.saveLoc')}</button></p></div>
      <h2>${t('farm.conditions')}</h2><div id="envBox"></div>
      <h2>${t('farm.profile')}</h2><div id="profile"></div>`;
    const manual = document.getElementById('manual'), coordsEl = document.getElementById('coords');
    const renderProfile = f => {
      const it = (k, v) => `<div class="card stat"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`;
      document.getElementById('profile').innerHTML = `<div class="grid">${it(t('farm.size'), t('farm.sizeVal', { n: f.size }))}${it(t('farm.crop'), tv(f.crop))}${it(t('farm.prev'), tv(f.previous))}${it(t('farm.irr'), tv(f.irrigation))}${it(t('farm.priority'), tv(f.priority))}${it(t('farm.soil'), tv(f.soil))}</div><p><button class="btn yellow" id="edit">${t('farm.edit')}</button></p>`;
      document.getElementById('edit').onclick = async () => {
        try { await getCropData(); editFarm(f); }
        catch (err) { document.getElementById('edit').insertAdjacentHTML('afterend', ` <span class="note">${t('farm.cropsUnavail')}</span>`); }
      };
    };
    /* Saves the new location and fetches environmental data for it (one request per change). */
    const setLoc = async (label, text, coords) => {
      f.location = label;
      if (coords) { f.latitude = coords.latitude; f.longitude = coords.longitude; state.coords = coords; }
      await saveFarmData(f);
      document.getElementById('locText').textContent = locName(label); coordsEl.textContent = text || ''; manual.style.display = 'none';
      loadEnvironment(f);
    };
    function editFarm(f) {
      document.getElementById('profile').innerHTML = `<form class="card" id="ef"><div class="form">
        <div><label>${t('farm.fieldHa')}</label><input type="number" name="size" step="0.1" value="${f.size}"></div>
        ${fieldSel('crop', t('farm.crop'), cropData.map(c => c.name), f.crop)}${fieldSel('previous', t('farm.prev'), cropData.map(c => c.name), f.previous)}
        ${fieldSel('irrigation', t('farm.irr'), ['None', 'Limited', 'Moderate', 'Reliable'], f.irrigation)}
        ${fieldSel('priority', t('farm.priority'), ['Water efficiency', 'Soil health', 'Profitability', 'Lower risk', 'Crop diversification'], f.priority)}</div>
        <p class="row"><button class="btn">${t('farm.save')}</button><button type="button" class="btn ghost" id="cancel">${t('farm.cancel')}</button></p></form>`;
      document.getElementById('cancel').onclick = () => renderProfile(f);
      document.getElementById('ef').onsubmit = async e => { e.preventDefault(); Object.assign(f, Object.fromEntries(new FormData(e.target))); await saveFarmData(f); renderProfile(f); };
    }
    renderProfile(f);
    document.getElementById('chg').onclick = () => {
      manual.querySelector('.form').innerHTML = locationFields(f.location, 'manLoc');
      manual.style.display = 'block';
    };
    document.getElementById('manSave').onclick = () => {
      const label = document.getElementById('manLoc').value, c = locations[label.split(',')[0]];
      setLoc(label, '', { latitude: c[0], longitude: c[1] });
    };
    document.getElementById('geo').onclick = () => {
      if (!navigator.geolocation) { coordsEl.textContent = t('farm.noGeo'); manual.style.display = 'block'; return; }
      navigator.geolocation.getCurrentPosition(pos => {
        const { latitude: la, longitude: lo } = pos.coords; // Nearest district town (label only; actual GPS coordinates are retained)
        const near = Object.entries(locations).sort((a, b) => Math.hypot(a[1][0] - la, a[1][1] - lo) - Math.hypot(b[1][0] - la, b[1][1] - lo))[0][0];
        setLoc(`Near ${near}, Bangladesh`, t('farm.coords', { la: la.toFixed(3), lo: lo.toFixed(3) }), { latitude: la, longitude: lo });
      }, () => { coordsEl.textContent = t('farm.denied'); manual.style.display = 'block'; }, { timeout: 10000 });
    };
    // One environmental request per visit: use GPS if already permitted, otherwise the saved/chosen location.
    if (!state.coords) { const c = await tryBrowserLocation(); if (c) state.coords = c; }
    loadEnvironment(f);
  },
  async crops() {
    const stamp = location.hash;
    app.innerHTML = `<h1 class="title">${t('nav.crops')}</h1><p class="sub">${t('crops.sub')}</p><input type="search" id="q" placeholder="${t('crops.search')}" aria-label="${t('crops.searchAria')}" style="margin-bottom:16px" disabled><div class="list" id="cl"><p style="padding:20px">${t('crops.loading')}</p></div>`;
    const search = document.getElementById('q'), list = document.getElementById('cl');
    let data;
    try { data = await getCropData(); }
    catch (err) {
      console.warn('Crop list request failed:', err);
      if (location.hash !== stamp) return;
      list.innerHTML = `<div style="padding:20px"><p>${t('crops.dbUnavail')}</p><button class="btn" id="retryCrops">${t('common.retry')}</button></div>`;
      document.getElementById('retryCrops').onclick = () => views.crops();
      return;
    }
    if (location.hash !== stamp) return; // user already navigated elsewhere
    search.disabled = false;
    const draw = q => { const r = data.filter(c => (c.name + c.season + tv(c.name) + tv(c.season)).toLowerCase().includes(q.toLowerCase()));
      list.innerHTML = r.map(c => `<button class="item" data-id="${c.id}"><span class="n">${c.emoji}&nbsp; ${esc(tv(c.name))}</span><span class="tag ${c.season}">${esc(tv(c.season))}</span></button>`).join('') || `<p style="padding:20px">${t('crops.none')}</p>`; };
    draw(''); search.oninput = e => draw(e.target.value);
    list.onclick = e => { const b = e.target.closest('.item'); if (b) location.hash = '#/crop/' + b.dataset.id; };
  },
  async crop(id) {
    const stamp = location.hash, back = `<button class="back" onclick="location.hash='#/crops'">${t('crop.back')}</button>`;
    app.innerHTML = `${back}<p class="sub" style="margin-top:20px">${t('crop.loading')}</p>`;
    let c;
    try { c = await getCropById(id); } // GET /api/crops/{id}
    catch (err) {
      console.warn('Crop detail request failed:', err);
      if (location.hash !== stamp) return;
      app.innerHTML = err.status === 404
        ? `${back}<h1 class="title" style="margin-top:14px">${t('crop.notFoundTitle')}</h1><p class="sub">${t('crop.notFoundSub')}</p>`
        : `${back}<h1 class="title" style="margin-top:14px">${t('crop.detailUnavail')}</h1><p class="sub">${t('crop.tryLater')}</p><p><button class="btn" id="retryCrop">${t('common.retry')}</button></p>`;
      const retry = document.getElementById('retryCrop'); if (retry) retry.onclick = () => views.crop(id);
      return;
    }
    if (location.hash !== stamp) return;
    const it = (k, v) => `<div class="card stat"><div class="k">${k}</div><div class="v" style="font-size:1.1rem">${esc(v)}</div></div>`;
    app.innerHTML = `${back}
      <div class="crophead"><div class="cropimg">${c.emoji}</div><div><h1 class="title" style="color:#fff">${esc(tv(c.name))}</h1><p style="margin:0;color:var(--lav)">${esc(tv(c.desc))}</p></div></div>
      <div class="grid">${it(t('crop.season'), tv(c.season))}${it(t('crop.duration'), tv(c.duration))}${it(t('crop.temp'), c.temp)}${it(t('env.soilM'), tv(c.moisture))}${it(t('crop.water'), tv(c.waterLabel))}${it(t('crop.nitrogen'), tv(c.nitrogen))}${it(t('crop.drought'), tv(c.drought))}${it(t('crop.soilReq'), tv(c.soil))}</div>
      <h2>${t('crop.fertPests')}</h2><div class="grid">${it(t('crop.fert'), tv(c.fertilizer))}${it(t('crop.pests'), tvPests(c.pests))}</div>
      <h2>${t('crop.rotCons')}</h2><div class="card sky"><p>${t('crop.rotText', { crop: esc(tv(c.name)), prev: c.before.slice(0, 2).map(x => esc(tv(x))).join(' ' + t('crop.or') + ' ') })}${c.legume ? t('crop.legume') : ''}</p>
      <p><b>${t('crop.preceding')}</b> ${c.before.map(x => esc(tv(x))).join(', ')}<br><b>${t('crop.following')}</b> ${c.after.map(x => esc(tv(x))).join(', ')}</p>
      <details><summary>${t('crop.why')}</summary><p>${t('crop.mock')}</p></details></div>`;
  },
  async generate() {
    if (!(await ensureCropCatalog())) return;
    const stamp = location.hash, f = await getFarmData();
    if (location.hash !== stamp) return;
    const seasons = rotSeasonOptions(cropData), byName = n => (cropData.find(c => c.name === n) || {}).id || '';
    // Form state survives a round trip to the results page. Slots start empty on purpose: seasons are never assumed.
    const st = state.rotForm || { slots: ['', '', ''], previousId: byName(f.previous), mode: 'exploratory', cyclic: false, preferredIds: [], excludedIds: [] };
    const slotSelects = slots => slots.map((v, i) => `<div><label for="slot${i}">${t('gen.slotLabel', { n: i + 1 })}</label><select id="slot${i}" name="slot"><option value="">${t('gen.chooseSeason')}</option>${seasons.map(x => `<option value="${esc(x)}" ${x === v ? 'selected' : ''}>${esc(tv(x))}</option>`).join('')}</select></div>`).join('');
    const crops = (name, ids) => cropData.map(c => `<label class="chip"><input type="checkbox" name="${name}" value="${esc(c.id)}" ${ids.includes(c.id) ? 'checked' : ''}><span>${c.emoji ? esc(c.emoji) + ' ' : ''}${esc(tv(c.name))}</span></label>`).join('');
    app.innerHTML = `<h1 class="title">${t('nav.generate')}</h1><p class="sub">${t('gen.sub')}</p>${rotDisclaimerHtml()}
      <div id="rotMsg" aria-live="polite"></div>
      <form id="gf" class="card" novalidate>
        <h2 style="margin-top:0">${t('gen.plan')} <span class="used">${t('gen.used')}</span></h2>
        <div class="form">
          <div><label for="rotLen">${t('gen.len')}</label><select id="rotLen">${Array.from({ length: ROT_MAX_SLOTS }, (_, i) => `<option value="${i + 1}" ${i + 1 === st.slots.length ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></div>
          <div><label for="prevCrop">${t('farm.prev')}</label><select id="prevCrop"><option value="">${t('gen.prevNone')}</option>${cropData.map(c => `<option value="${esc(c.id)}" ${c.id === st.previousId ? 'selected' : ''}>${esc(tv(c.name))}</option>`).join('')}</select></div>
          <div><label for="rotMode">${t('gen.mode')}</label><select id="rotMode">${Object.keys(ROT_MODES).map(k => `<option value="${k}" ${k === st.mode ? 'selected' : ''}>${esc(t('rot.mode.' + k))}</option>`).join('')}</select></div>
        </div>
        <h3 style="margin-top:18px">${t('gen.slotSeasons')}</h3>
        <div class="form" id="slotBox">${slotSelects(st.slots)}</div>
        <p class="hint">${t('gen.hint')}</p>
        <label class="chip" style="margin-top:6px"><input type="checkbox" id="rotCyclic" ${st.cyclic ? 'checked' : ''}><span>${t('gen.cyclic')}</span></label>
        <h3 style="margin-top:18px">${t('gen.pref')} <span class="used">${t('gen.rankOnly')}</span></h3>
        <div class="chips">${crops('pref', st.preferredIds)}</div>
        <h3 style="margin-top:18px">${t('gen.excl')}</h3>
        <div class="chips">${crops('excl', st.excludedIds)}</div>
        <div class="unused"><h2 style="margin-top:0">${t('gen.about')} <span class="used off">${t('gen.notUsed')}</span></h2>
          <p class="hint">${t('gen.aboutHint')}</p>${farmFormFields(f, { skipPrevious: true })}</div>
        <p><button class="btn yellow" id="gBtn">${t('gen.btn')}</button></p></form>`;
    const form = document.getElementById('gf'), msg = document.getElementById('rotMsg'), btn = document.getElementById('gBtn');
    const read = () => ({
      slots: [...form.querySelectorAll('select[name=slot]')].map(x => x.value), previousId: form.prevCrop.value, mode: form.rotMode.value,
      cyclic: form.rotCyclic.checked, preferredIds: [...form.querySelectorAll('input[name=pref]:checked')].map(x => x.value),
      excludedIds: [...form.querySelectorAll('input[name=excl]:checked')].map(x => x.value) });
    state.readRotForm = read; // lets a language switch keep half-filled choices
    const show = (kind, html) => { msg.innerHTML = html ? `<div class="alert ${kind}" role="${kind === 'info' ? 'status' : 'alert'}">${html}</div>` : ''; };
    document.getElementById('rotLen').onchange = e => { // resize the slot list, keeping what was already chosen
      const n = +e.target.value, cur = read().slots;
      document.getElementById('slotBox').innerHTML = slotSelects(Array.from({ length: n }, (_, i) => cur[i] || ''));
    };
    let pending = false;
    form.onsubmit = async e => {
      e.preventDefault();
      if (pending) return; // no duplicate submissions
      const input = read(); state.rotForm = input; state.rotation = null; // an old result must never look like this request's
      const { errors, payload } = buildRotationRequest(input, cropData);
      if (errors.length) return show('err', `<b>${t('gen.fix')}</b><ul>${errors.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`);
      pending = true; btn.disabled = true; btn.textContent = t('gen.busy');
      show('info', t('gen.busyMsg'));
      try {
        const response = await requestRotations(payload);
        if (!response || !Array.isArray(response.results) || !response.search || !response.input) throw new Error('Unexpected rotation data format.');
        state.rotation = { request: payload, response };
        if (location.hash === stamp) location.hash = '#/results';
      } catch (err) {
        console.warn('Rotation request failed:', err);
        const m = rotationErrorMessage(err);
        if (document.body.contains(form)) show('err', `<b>${m.kind === 'validation' ? t('gen.badReq') : t('gen.wrong')}.</b> ${esc(m.message)}`);
      } finally {
        pending = false;
        if (document.body.contains(form)) { btn.disabled = false; btn.textContent = t('gen.btn'); }
      }
    };
  },
  results() {
    const r = state.rotation;
    if (!r) return location.hash = '#/generate';
    app.className = 'fade';
    app.innerHTML = `<button class="back" onclick="location.hash='#/generate'">${t('rot.back')}</button><div style="margin-top:14px">${renderRotationResults(r.response, cropData)}</div>`;
  },
  async report() {
    if (!state.report) return location.hash = '#/home';
    const { result: r, profile: p } = state.report, env = await ensureEnvironment();
    const pri = (p.priorities || []).map(tv).join(', ') || t('rep.none');
    const crops = r.seq.filter((c, i) => r.seq.indexOf(c) === i).map(findCrop);
    const sc = whatIfScenarios.map(s => { const pts = r.risk_pts + s.water * (r.water === 'Low–Moderate' ? .4 : 1);
      const l = pts < .8 ? 'Low' : pts < 1.5 ? 'Low–Moderate' : pts < 2.2 ? 'Moderate' : 'High'; return `<tr><td>${esc(tv(s.name))}</td><td>${badge(l, false)}</td><td>${esc(tv(s.note))}</td></tr>`; }).join('');
    const kv = (k, v) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`;
    const li = x => `<li>${esc(tv(x))}</li>`;
    app.innerHTML = `<div class="row space"><button class="back" onclick="history.back()">${t('rep.back')}</button><button class="btn yellow" id="dl">${t('rep.download')}</button></div>
      <div id="reportBody" class="report"><h1 class="title">${t('rep.title')}</h1><p>${seqHtml(r.seq)}</p><p>${t('rep.overall', { s: badge(r.suitability), r: badge(r.risk, false) })}</p>
      <h2>${t('rep.h1')}</h2><div class="card"><table>${kv(t('farm.location'), locName(p.location || 'Rangpur, Bangladesh'))}${kv(t('farm.size'), t('farm.sizeVal', { n: p.size || '1.0' }))}${kv(t('farm.soil'), p.soil ? tv(p.soil) : '-')}${kv(t('farm.irr'), p.irrigation ? tv(p.irrigation) : '-')}${kv(t('farm.prev'), p.previous ? tv(p.previous) : '-')}${kv(t('rep.priorities'), pri)}</table></div>
      <h2>${t('rep.h2')}</h2>${displayEnvironmentalConditions(env)}
      <h2>${t('rep.h3')}</h2><div class="grid">${crops.map(c => `<div class="card"><h3>${c.emoji} ${esc(tv(c.name))}</h3><small>${esc(tv(c.season))} · ${esc(tv(c.duration))}<br>${t('rep.water')} ${esc(tv(c.waterLabel))}<br>${t('rep.nitrogen')} ${esc(tv(c.nitrogen))}<br>${t('rep.pests')} ${esc(tvPests(c.pests))}</small></div>`).join('')}</div>
      <h2>${t('rep.h4')}</h2><div class="card"><ul class="ok">${r.reasons.map(li).join('')}</ul></div>
      <h2>${t('rep.h5')}</h2><div class="card"><ul class="ok">${r.strengths.map(li).join('')}</ul></div>
      <h2>${t('rep.h6')}</h2><div class="card"><ul class="warn">${r.risks.map(li).join('')}<li>${t('rep.mockLimit')}</li></ul></div>
      <h2>${t('rep.h7')}</h2><div class="card sky"><p>${t('rep.envIntro')} ${env ? t('rep.envData', { rain: env.rainfall, days: env.rainfallDays, temp: env.temperature }) : t('rep.envNone')}</p></div>
      <h2>${t('rep.h8')}</h2><div class="demo"><b>${t('rep.demoRef')}</b><ul>${demoReferences.map(li).join('')}</ul></div>
      <h2>${t('rep.h9')}</h2><div class="card"><table><tr><th>${t('rep.scenario')}</th><th>${t('rep.riskLevel')}</th><th>${t('rep.note')}</th></tr>${sc}</table></div></div>`;
    document.getElementById('dl').onclick = () => {
      const html = `<!DOCTYPE html><html lang="${I18N.lang}"><meta charset="utf-8"><title>${t('rep.fileTitle')}</title><style>body{font-family:Arial,'Noto Sans Bengali','Nirmala UI',sans-serif;max-width:800px;margin:30px auto;color:#1c2a12}.card,.stat{border:1px solid #ccd;padding:12px;margin:8px 0;border-radius:8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}.bar,details,.back{display:none}</style>${document.getElementById('reportBody').innerHTML}<p><i>${t('rep.fileFoot')}</i></p></html>`;
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([html], { type: 'text/html' })), download: 'field-shift-report.html' }); a.click();
    };
  },
  async analyze() {
    if (!(await ensureCropCatalog())) return;
    getFarmData().then(f => {
      app.innerHTML = `<h1 class="title">${t('an.title')}</h1><p class="sub">${t('an.sub')}</p><p class="disclaimer" role="note">${t('an.demo')}</p>
        <form id="af" class="card"><div class="form">${['Rice', 'Mung Bean', 'Rice'].map((v, i) => `<div><label for="c${i}">${t('an.crop', { n: i + 1 })}</label><select id="c${i}" name="seq">${cropOptions(v)}</select></div>`).join('')}</div>
        <h2>${t('an.farm')}</h2>${farmFormFields(f)}<p><button class="btn yellow">${t('an.btn')}</button></p></form>`;
      document.getElementById('af').onsubmit = e => { e.preventDefault(); const p = readProfile(e.target), seq = new FormData(e.target).getAll('seq'); state.profile = p;
        runProcessing(t('proc.title'), [1, 2, 3, 4, 5].map(n => t('proc.s' + n)),
          async () => { state.analysis = await analyzeRotation(seq, p); views.analysis(); history.replaceState(null, '', '#/analysis'); }); };
    });
  },
  analysis() {
    const r = state.analysis; if (!r) return location.hash = '#/analyze';
    const n = v => v >= 2.5 ? 'High' : v >= 1.8 ? 'Moderate' : 'Lower';
    state.report = { result: r, profile: state.profile };
    app.innerHTML = `<h1 class="title">${t('ana.title')}</h1><p>${seqHtml(r.seq)}</p><div class="card sky">${t('ana.overall')} <b>${r.suitability === 'High' ? t('ana.high') : r.suitability === 'Moderate' ? t('ana.mod') : t('ana.low')}</b></div>
      <h2>${t('ana.how')}</h2><div class="card">${Object.entries(r.ratings).map(([k, v]) => `<div class="rate"><span>${esc(tv(k))}</span><div class="bar"><i style="width:${v / 3 * 100}%"></i></div>${badge(n(v))}</div>`).join('')}
      <div class="rate"><span>${t('ana.risk')}</span><div class="bar"><i style="width:${Math.min(100, r.risk_pts / 3 * 100)}%;background:var(--sky)"></i></div>${badge(r.risk, false)}</div></div>
      <div class="grid"><div><h2>${t('ana.strengths')}</h2><ul class="ok">${r.strengths.map(x => `<li>${esc(tv(x))}</li>`).join('')}</ul></div><div><h2>${t('ana.risks')}</h2><ul class="warn">${r.risks.map(x => `<li>${esc(tv(x))}</li>`).join('')}</ul></div></div>
      <details><summary>${t('ana.why')}</summary><p>${r.reasons.map(x => esc(tv(x))).join('. ') || t('ana.basis')}. ${t('ana.notPred')}</p></details>
      <p><button class="btn" id="vr">${t('ana.viewReport')}</button></p>`;
    document.getElementById('vr').onclick = () => location.hash = '#/report';
  },
  // options() {
  //   app.innerHTML = `<h1 class="title">${t('nav.options')}</h1><p class="sub">${t('opt.sub')}</p>
  //     <div class="card"><label for="lang">${t('nav.lang')}</label><select id="lang"><option value="en" ${I18N.lang === 'en' ? 'selected' : ''}>English</option><option value="bn" ${I18N.lang === 'bn' ? 'selected' : ''}>বাংলা</option></select><small>${t('opt.langNote')}</small></div>
  //     <div class="grid" style="margin-top:14px">${[['notif', ICON_BELL], ['units', '📏'], ['data', '🗂']].map(([x, ic]) => `<div class="card off"><div class="optic" aria-hidden="true">${ic}</div><h3>${t('opt.' + x)}</h3><small>${t('opt.soon')}</small></div>`).join('')}</div>`;
  //   document.getElementById('lang').onchange = e => setLang(e.target.value);
  // }

  options() {
    app.innerHTML = `<div class="card off" style="max-width:360px">
      <div class="optic" aria-hidden="true">${ICON_BELL}</div>
      <h3>${t('opt.notif')}</h3>
      <small>${t('opt.soon')}</small>
    </div>`;
  }

};

/* ---------- Router ---------- */
/* ---------- Navigation menus ---------- */
const rotBtn = document.getElementById('rotBtn'), rotMenu = document.getElementById('rotMenu');
const burger = document.getElementById('burger'), mobileNav = document.getElementById('mobileNav');
function closeMenus() {
  rotMenu.classList.remove('open'); rotBtn.setAttribute('aria-expanded', 'false');
  mobileNav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', e => {
  if (e.target.closest('#rotBtn')) { const o = rotMenu.classList.toggle('open'); rotBtn.setAttribute('aria-expanded', String(o)); return; }
  if (e.target.closest('#burger')) { const o = mobileNav.classList.toggle('open'); burger.setAttribute('aria-expanded', String(o)); return; }
  if (e.target.closest('#rotMenu a') || e.target.closest('#mobileNav a') || !e.target.closest('#rotMenu')) closeMenus();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (rotMenu.classList.contains('open')) { closeMenus(); rotBtn.focus(); }
  else if (mobileNav.classList.contains('open')) { closeMenus(); burger.focus(); }
});
window.addEventListener('hashchange', closeMenus);
async function route() {
  const [, name = 'home', arg] = location.hash.slice(1).split('/');
  const view = views[name] || views.home;
  app.className = name === 'home' ? 'wide fade' : 'fade';
  document.querySelectorAll('[data-route]').forEach(a => { const on = a.dataset.route === name || (name === 'crop' && a.dataset.route === 'crops'); a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  window.scrollTo(0, 0);
  await view(arg);
}
window.addEventListener('hashchange', route);
applyStatic();
route();
