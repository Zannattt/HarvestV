/* Rotation generation (Stage 3D): request building, validation, error mapping and result rendering.
   Pure functions plus one API call, so they can be tested outside the browser (see tests/rotation.test.js).
   Everything shown here comes from POST /api/rotations/generate; nothing in this file scores or ranks crops. */

const ROT_MAX_SLOTS = 6; // UI limit (the engine allows 12); keeps the form and the result cards readable
const ROT_MODES = {
  exploratory: 'Exploratory: show all sequences except forbidden ones',
  supported_only: 'Supported only: keep only transitions both crops list'
};
const ROT_DISCLAIMER_EN = 'HarvestV generates exploratory crop-rotation sequences using the current crop catalog and its recorded transition relationships. Some catalog data is illustrative or incomplete. Results are not yet locally validated agronomic recommendations; check local agricultural guidance before making planting decisions.';
const ROT_DISCLAIMER = I18N.strings.en['rot.disclaimer'] || ROT_DISCLAIMER_EN; // English text; rendered through t('rot.disclaimer')

/* Plain-language meaning of each transition status (text + icon; never colour alone). */
const ROT_TRANSITIONS = {
  supported: { label: 'Supported', icon: '✓', legend: 'Both crops’ transition lists agree.' },
  one_sided: { label: 'One-sided', icon: '◐', legend: 'Only one crop’s list supports the transition.' },
  unknown: { label: 'Unknown', icon: '?', legend: 'Neither list establishes support or prohibition. Not verified, and not prohibited.' },
  forbidden: { label: 'Forbidden', icon: '⛔', legend: 'The catalog explicitly marks the transition as prohibited. Such sequences are never returned.' }
};
const ROT_TIERS = {
  all_supported: 'All transitions supported',
  no_transitions: 'No transitions to check',
  has_one_sided: 'Includes one-sided transitions',
  has_unknown: 'Includes unknown transitions'
};
const ROT_KIND_LABEL = { from_previous: 'Previous crop → first crop', within_plan: '', cyclic_closing: 'Last crop → first crop (cyclic)' };

const rotEsc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Explicit season labels the catalog uses ('All Seasons' is a wildcard on crops, never a slot value). */
function rotSeasonOptions(crops) {
  const out = [];
  (crops || []).forEach(c => { if (c.season && c.season !== 'All Seasons' && !out.includes(c.season)) out.push(c.season); });
  return out;
}

/* Turns the form state into the exact request body the API expects, or a list of readable problems.
   input: { slots: [season|''], previousId: id|'', mode, cyclic, preferredIds: [id], excludedIds: [id] } */
function buildRotationRequest(input, crops) {
  const errors = [], seasons = rotSeasonOptions(crops), ids = new Set((crops || []).map(c => c.id));
  const slots = Array.isArray(input.slots) ? input.slots : [];
  if (!slots.length || slots.length > ROT_MAX_SLOTS) errors.push(t('rot.err.count', { max: ROT_MAX_SLOTS }));
  slots.forEach((s, i) => {
    if (!s) errors.push(t('rot.err.slot', { n: i + 1 }));
    else if (!seasons.includes(s)) errors.push(t('rot.err.badSeason', { s: tv(s), n: i + 1 }));
  });
  const mode = input.mode || 'exploratory';
  if (!Object.prototype.hasOwnProperty.call(ROT_MODES, mode)) errors.push(t('rot.err.mode'));
  const previous = input.previousId || null, pref = [...new Set(input.preferredIds || [])], excl = [...new Set(input.excludedIds || [])];
  if (previous && !ids.has(previous)) errors.push(t('rot.err.prev'));
  if (pref.some(id => !ids.has(id)) || excl.some(id => !ids.has(id))) errors.push(t('rot.err.crop'));
  if (input.cyclic && previous) errors.push(t('rot.err.cyclicPrev'));
  const both = pref.filter(id => excl.includes(id));
  if (both.length) errors.push(t('rot.err.both', { names: both.map(id => tv(((crops || []).find(c => c.id === id) || { name: id }).name)).join(', ') }));
  if (errors.length) return { errors, payload: null };
  return {
    errors: [],
    payload: { season_slots: slots.slice(), previous_crop_id: previous, excluded_crop_ids: excl, preferred_crop_ids: pref, mode, cyclic: !!input.cyclic }
  };
}

const requestRotations = payload => apiPost('/api/rotations/generate', payload);

/* Maps a failed request to { kind, message } for the UI. 4xx = the request (shown as-is); anything else = server/network. */
function rotationErrorMessage(err) {
  if (err && err.status >= 400 && err.status < 500) {
    return { kind: 'validation', message: err.detail || t('rot.err.rejected') };
  }
  if (err && err.status) return { kind: 'server', message: t('rot.err.server') };
  return { kind: 'network', message: t('rot.err.network') };
}

/* ---------- Rendering ---------- */
const rotTrInfo = status => {
  const base = ROT_TRANSITIONS[status] || { label: status, icon: '?', legend: '' };
  return ROT_TRANSITIONS[status] ? { icon: base.icon, label: t('rot.tr.' + status + '.label'), legend: t('rot.tr.' + status + '.legend') } : base;
};
const rotTransition = status => {
  const tr = rotTrInfo(status);
  return `<span class="tr tr-${rotEsc(status)}" title="${rotEsc(tr.legend)}"><span aria-hidden="true">${tr.icon}</span> ${rotEsc(tr.label)}</span>`;
};

function rotLegendHtml() {
  return `<details class="legend"><summary>${t('rot.legendQ')}</summary><ul>${Object.keys(ROT_TRANSITIONS).map(k =>
    `<li>${rotTransition(k)} ${rotEsc(rotTrInfo(k).legend)}</li>`).join('')}</ul>
    <p class="sub" style="margin:8px 0 0">${t('rot.legendNote')}</p></details>`;
}
const rotDisclaimerHtml = () => `<p class="disclaimer" role="note">${rotEsc(t('rot.disclaimer'))}</p>`;

function rotRequestSummary(input, nameOf) {
  const n = input.season_slots.length;
  const parts = [t(n === 1 ? 'rot.sum.slot1' : 'rot.sum.slotN', { n, list: input.season_slots.map(x => rotEsc(tv(x))).join(' → ') }),
    t('rot.sum.mode', { m: rotEsc(t(input.mode === 'supported_only' ? 'rot.sum.supported' : 'rot.sum.exploratory')) }),
    t('rot.sum.checking', { m: t(input.cyclic ? 'rot.sum.cyclic' : 'rot.sum.linear') })];
  parts.push(input.previous_crop_id ? t('rot.sum.prev', { c: rotEsc(nameOf(input.previous_crop_id)) }) : t('rot.sum.noprev'));
  if ((input.preferred_crop_ids || []).length) parts.push(t('rot.sum.pref', { c: input.preferred_crop_ids.map(id => rotEsc(nameOf(id))).join(', ') }));
  if ((input.excluded_crop_ids || []).length) parts.push(t('rot.sum.excl', { c: input.excluded_crop_ids.map(id => rotEsc(nameOf(id))).join(', ') }));
  return parts.join(' · ');
}

function rotResultCard(res, resp, nameOf, emojiOf) {
  const input = resp.input, trs = res.transitions || [];
  const prev = trs.find(t => t.kind === 'from_previous'), closing = trs.find(t => t.kind === 'cyclic_closing');
  const within = trs.filter(t => t.kind === 'within_plan');
  const steps = res.slots.map((s, i) => {
    const e = emojiOf(s.crop_id);
    const crop = `<li class="rslot"><span class="rs">${t('rot.slot', { n: s.slot, season: rotEsc(tv(s.season)) })}</span><b>${e ? rotEsc(e) + ' ' : ''}${rotEsc(tv(s.crop_name))}</b></li>`;
    return crop + (within[i] ? `<li class="rarrow" aria-label="${rotEsc(t('rot.transAria', { l: rotTrInfo(within[i].status).label }))}">${rotTransition(within[i].status)}</li>` : '');
  }).join('');
  const c = res.ranking_criteria || {};
  const prefNote = (input.preferred_crop_ids || []).length ? t('rot.prefNote', { n: c.preferred_matches }) : '';
  const total = resp.search.sequences_passing;
  const extra = [prev ? `<div class="rextra">${rotEsc(t('rot.kind.from_previous'))} (${rotEsc(nameOf(prev.from_crop_id))} → ${rotEsc(nameOf(prev.to_crop_id))}): ${rotTransition(prev.status)}</div>` : '',
    closing ? `<div class="rextra">${rotEsc(t('rot.kind.cyclic_closing'))} (${rotEsc(nameOf(closing.from_crop_id))} → ${rotEsc(nameOf(closing.to_crop_id))}): ${rotTransition(closing.status)}</div>` : ''].join('');
  return `<article class="card opt rot-result"><div class="num" title="${rotEsc(t('rot.rank', { n: res.rank }))}">${res.rank}</div><div class="body">
    <div class="row space"><span class="tier tier-${rotEsc(res.evidence_tier)}">${rotEsc(ROT_TIERS[res.evidence_tier] ? t('rot.tier.' + res.evidence_tier) : res.evidence_tier)}</span></div>
    <ol class="rseq" aria-label="${rotEsc(t('rot.seqAria'))}">${steps}</ol>${extra}
    <p class="why">${t('rot.why', { tier: c.tier, u: c.unknown_transitions, o: c.one_sided_transitions, pref: prefNote, rank: res.rank, total, seqs: t(total === 1 ? 'rot.seq1' : 'rot.seqN'), trunc: resp.search.truncated ? t('rot.trunc') : '' })}</p>
    ${(res.warnings || []).length ? `<ul class="warn">${res.warnings.map(w => `<li>${rotEsc(tApi(w))}</li>`).join('')}</ul>` : ''}
  </div></article>`;
}

/* The whole results page body. `crops` (the live catalog) is optional and only adds emoji. */
function renderRotationResults(resp, crops) {
  const byId = {}; (crops || []).forEach(c => { byId[c.id] = c; });
  const names = {}; (resp.results || []).forEach(r => r.slots.forEach(s => { names[s.crop_id] = s.crop_name; }));
  const nameOf = id => (byId[id] && byId[id].name) || names[id] || id, emojiOf = id => (byId[id] && byId[id].emoji) || '';
  const s = resp.search, input = resp.input;
  const truncated = s.truncated ? `<div class="alert warn" role="alert">${t('rot.searchIncomplete', { nodes: s.nodes_visited, max: s.max_nodes })}</div>` : '';
  const globals = (resp.warnings || []).filter(w => !(s.truncated && /NOT exhaustive/.test(w)));
  const warnBlock = globals.length ? `<div class="alert info" role="status"><ul>${globals.map(w => `<li>${rotEsc(tApi(w))}</li>`).join('')}</ul></div>` : '';
  const audit = `<details><summary>${t('rot.auditQ')}</summary>
    <p>${rotRequestSummary(input, nameOf)}</p>
    <ul><li>${t('rot.audit.space', { n: s.search_space_size })}</li>
    <li>${t('rot.audit.valid', { n: s.sequences_passing, extra: s.sequences_excluded_by_transition_rules == null ? '' : t('rot.audit.removed', { n: s.sequences_excluded_by_transition_rules }) })}</li>
    <li>${t('rot.audit.steps', { n: s.nodes_visited, max: s.max_nodes, lim: s.truncated ? t('rot.audit.limit') : '' })}</li>
    <li>${t('rot.audit.pruned', { list: Object.keys(s.pruned_extensions || {}).length ? Object.entries(s.pruned_extensions).map(([k, v]) => `${rotEsc(tPrune(k))} ${v}`).join(', ') : t('rot.audit.none') })}</li></ul>
    <p><b>${t('rot.audit.order')}</b></p><ol>${(resp.ranking_policy || []).map(p => `<li>${rotEsc(tApi(p.replace(/^\d+\.\s*/, '')))}</li>`).join('')}</ol>
    <p class="sub" style="margin:0">${t('rot.audit.engine', { v: rotEsc(resp.engine_version), cat: resp.catalog ? t('rot.crops', { n: resp.catalog.crop_count }) : t('na'), disc: rotEsc(tApi(resp.disclaimer || '')) })}</p></details>`;
  const head = `<h1 class="title">${t('rot.heading')}</h1><p class="sub">${resp.returned ? t(s.sequences_passing === 1 ? 'rot.showing1' : 'rot.showingN', { r: resp.returned, s: s.sequences_passing }) : t('rot.noShow')}</p>${rotDisclaimerHtml()}`;
  const body = resp.returned
    ? rotLegendHtml() + truncated + warnBlock + resp.results.map(r => rotResultCard(r, resp, nameOf, emojiOf)).join('')
    : `<div class="card rot-empty"><h2 style="margin-top:0">${t('rot.emptyTitle')}</h2><p>${t('rot.emptyText')}</p>${truncated}${warnBlock}<p>${t('rot.emptyTry')}</p></div>`;
  return head + body + `<div class="card sky" style="margin-top:14px">${audit}</div>`;
}

