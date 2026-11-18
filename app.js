'use strict';

/* ---------- Storage ---------- */
const KEY = 'trainingslog.v1';
const DEFAULT_EXERCISES = ['Bankdrücken', 'Kniebeuge', 'Kreuzheben', 'Schulterdrücken', 'Klimmzüge', 'Rudern'];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (Array.isArray(d.exercises) && Array.isArray(d.sets)) { if (!Array.isArray(d.runs)) d.runs = []; return d; }
    }
  } catch (_) { /* ignore */ }
  return { exercises: DEFAULT_EXERCISES.map(name => ({ id: uid(), name })), sets: [], runs: [] };
}
let db = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (_) { toast('Speichern fehlgeschlagen – Speicher voll oder blockiert.'); }
}

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const fmt = n => nf.format(n);
const dateLong = iso => new Date(iso + 'T00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dateShort = iso => new Date(iso + 'T00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
const dateMed = iso => new Date(iso + 'T00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
const exName = id => (db.exercises.find(e => e.id === id) || { name: '(gelöscht)' }).name;
const e1rm = (w, r) => r === 1 ? w : w * (1 + r / 30); // Epley

function sortedExercises() {
  return [...db.exercises].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}
function setsLabel(sets) {
  // "80 kg × 8, 8, 6 · 85 kg × 5"
  const parts = [];
  for (const s of sets) {
    const last = parts[parts.length - 1];
    if (last && last.w === s.weight) last.r.push(s.reps); else parts.push({ w: s.weight, r: [s.reps] });
  }
  return parts.map(p => `${fmt(p.w)} kg × ${p.r.join(', ')}`).join(' · ');
}

let toastTimer;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = esc(msg);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.fn(); t.hidden = true; };
    t.appendChild(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 5000 : 2200);
}

/* ---------- Navigation ---------- */
const TITLES = { log: 'Training', runs: 'Laufen', history: 'Verlauf', progress: 'Fortschritt', exercises: 'Übungen' };
let currentView = 'log';
function show(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  $('#view-title').textContent = TITLES[view];
  render();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));

/* ---------- Training (log) ---------- */
const logEx = $('#log-exercise'), logDate = $('#log-date'), logW = $('#log-weight'), logR = $('#log-reps');
logDate.value = todayISO();

function fillExerciseSelect(sel, keep) {
  const prev = keep ?? sel.value;
  sel.innerHTML = sortedExercises().map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
  if (prev && db.exercises.some(e => e.id === prev)) sel.value = prev;
}

function lastSessionBefore(exId, date) {
  const prior = db.sets.filter(s => s.exerciseId === exId && s.date < date);
  if (!prior.length) return null;
  const d = prior.reduce((m, s) => s.date > m ? s.date : m, '');
  return { date: d, sets: prior.filter(s => s.date === d).sort((a, b) => a.ts - b.ts) };
}

function prefill() {
  const exId = logEx.value;
  const mine = db.sets.filter(s => s.exerciseId === exId).sort((a, b) => b.ts - a.ts);
  if (mine.length) { logW.value = String(mine[0].weight).replace('.', ','); logR.value = mine[0].reps; }
  else { logW.value = ''; logR.value = ''; }
  updateHint();
}
function updateHint() {
  const last = lastSessionBefore(logEx.value, logDate.value);
  $('#log-hint').textContent = last ? `Letztes Mal (${dateShort(last.date)}): ${setsLabel(last.sets)}` : '';
}
logEx.addEventListener('change', prefill);
logDate.addEventListener('change', () => { updateHint(); renderDay(); });

document.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
  const inp = b.dataset.step === 'weight' ? logW : logR;
  const min = b.dataset.step === 'weight' ? 0 : 1;
  const v = Math.max(min, (parseFloat(String(inp.value).replace(',', '.')) || 0) + parseFloat(b.dataset.delta));
  inp.value = String(Math.round(v * 100) / 100).replace('.', ',');
}));

$('#log-form').addEventListener('submit', e => {
  e.preventDefault();
  const weight = parseFloat(String(logW.value).replace(',', '.'));
  const reps = parseInt(logR.value, 10);
  if (!logEx.value) { toast('Lege zuerst eine Übung an.'); return; }
  if (!(weight >= 0) || !(reps >= 1)) { toast('Bitte Gewicht und Wiederholungen angeben.'); return; }
  const prevBest = bestE1rm(logEx.value);
  const set = { id: uid(), exerciseId: logEx.value, date: logDate.value || todayISO(), weight, reps, ts: Date.now() };
  db.sets.push(set);
  save();
  renderDay();
  const isPR = prevBest !== null && e1rm(weight, reps) > prevBest;
  toast(isPR ? '🏆 Neue Bestleistung!' : 'Satz gespeichert');
});

function bestE1rm(exId) {
  const s = db.sets.filter(x => x.exerciseId === exId);
  return s.length ? Math.max(...s.map(x => e1rm(x.weight, x.reps))) : null;
}

function deleteSet(id) {
  const idx = db.sets.findIndex(s => s.id === id);
  if (idx < 0) return;
  const [removed] = db.sets.splice(idx, 1);
  save(); render();
  toast('Satz gelöscht', { label: 'Rückgängig', fn: () => { db.sets.push(removed); save(); render(); } });
}

function renderDay() {
  const date = logDate.value || todayISO();
  $('#day-title').textContent = date === todayISO() ? 'Heute' : dateLong(date);
  const daySets = db.sets.filter(s => s.date === date).sort((a, b) => a.ts - b.ts);
  const el = $('#day-sets');
  if (!daySets.length) { el.innerHTML = '<div class="card empty">Noch keine Sätze an diesem Tag.</div>'; return; }
  let html = '';
  for (const [exId, sets] of groupBy(daySets, s => s.exerciseId)) {
    const volume = sets.reduce((a, s) => a + s.weight * s.reps, 0);
    html += `<div class="card group"><h3>${esc(exName(exId))}<small>${fmt(volume)} kg Volumen</small></h3><ul class="sets">`;
    sets.forEach((s, i) => {
      html += `<li><span class="n">${i + 1}.</span><span class="v">${fmt(s.weight)} kg × ${s.reps}</span>
        <button class="ghost" data-del="${s.id}" aria-label="Satz löschen">✕</button></li>`;
    });
    html += '</ul></div>';
  }
  el.innerHTML = html;
}

/* ---------- Verlauf ---------- */
function renderHistory() {
  const el = $('#history-list');
  if (!db.sets.length && !db.runs.length) { el.innerHTML = '<div class="card empty">Noch keine Trainings erfasst.</div>'; return; }
  const dates = [...new Set([...db.sets.map(s => s.date), ...db.runs.map(r => r.date)])].sort().reverse();
  el.innerHTML = dates.map(date => {
    const sets = db.sets.filter(s => s.date === date);
    const runs = db.runs.filter(r => r.date === date).sort((a, b) => a.ts - b.ts);
    const exs = [...groupBy(sets.sort((a, b) => a.ts - b.ts), s => s.exerciseId)];
    return `<div class="card day"><h2>${esc(dateLong(date))}</h2>` +
      runs.map(r => `<div class="ex"><strong>🏃 Lauf</strong><span>${esc(runLabel(r))}</span></div>`).join('') +
      exs.map(([id, ss]) => `<div class="ex"><strong>${esc(exName(id))}</strong><span>${esc(setsLabel(ss))}</span></div>`).join('') +
      (sets.length ? `<button type="button" class="link" data-goto="${date}">Bearbeiten ›</button>` : '') + '</div>';
  }).join('');
}
$('#history-list').addEventListener('click', e => {
  const b = e.target.closest('[data-goto]');
  if (!b) return;
  logDate.value = b.dataset.goto;
  show('log'); updateHint();
});

/* ---------- Fortschritt ---------- */
const progEx = $('#prog-exercise'), progMetric = $('#prog-metric');
let range = 0;
const METRIC = {
  max: { label: 'Max. Gewicht', unit: 'kg', fn: ss => Math.max(...ss.map(s => s.weight)) },
  e1rm: { label: 'Geschätztes 1RM', unit: 'kg', fn: ss => Math.max(...ss.map(s => e1rm(s.weight, s.reps))) },
  volume: { label: 'Volumen', unit: 'kg', fn: ss => ss.reduce((a, s) => a + s.weight * s.reps, 0) },
  reps: { label: 'Max. Wiederholungen', unit: 'Wdh', fn: ss => Math.max(...ss.map(s => s.reps)) },
};

progEx.addEventListener('change', renderProgress);
progMetric.addEventListener('change', renderProgress);
$('#prog-range').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  range = +b.dataset.range;
  document.querySelectorAll('#prog-range button').forEach(x => x.classList.toggle('on', x === b));
  renderProgress();
});

function seriesFor(exId, metricKey) {
  const ss = db.sets.filter(s => s.exerciseId === exId);
  let pts = [...groupBy(ss, s => s.date)]
    .map(([date, sets]) => ({ date, value: Math.round(METRIC[metricKey].fn(sets) * 10) / 10, sets: sets.sort((a, b) => a.ts - b.ts) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (range) {
    const from = new Date(); from.setDate(from.getDate() - range);
    const iso = from.toISOString().slice(0, 10);
    pts = pts.filter(p => p.date >= iso);
  }
  return pts;
}

function renderProgress() {
  const m = METRIC[progMetric.value];
  const pts = seriesFor(progEx.value, progMetric.value);
  const tiles = $('#prog-tiles');
  if (!pts.length) {
    tiles.innerHTML = '';
    $('#chart').innerHTML = '<div class="empty">Keine Daten für diese Übung im gewählten Zeitraum.</div>';
    $('#prog-table').innerHTML = '';
    return;
  }
  const best = Math.max(...pts.map(p => p.value));
  const first = pts[0].value, last = pts[pts.length - 1].value;
  const diff = last - first;
  const pct = first ? (diff / first) * 100 : 0;
  const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : '';
  tiles.innerHTML = `
    <div class="tile"><div class="k">Bestwert</div><div class="v">${fmt(best)} <small>${m.unit}</small></div></div>
    <div class="tile"><div class="k">Entwicklung</div><div class="v ${cls}">${diff > 0 ? '+' : ''}${fmt(Math.round(pct))} %</div></div>
    <div class="tile"><div class="k">Einheiten</div><div class="v">${pts.length}</div></div>`;
  drawChart(pts, m);
  $('#prog-table').innerHTML = `<table><thead><tr><th>Datum</th><th class="r">${esc(m.label)}</th><th>Sätze</th></tr></thead><tbody>` +
    [...pts].reverse().map(p => `<tr><td>${dateMed(p.date)}</td><td class="r">${fmt(p.value)} ${m.unit}</td><td>${esc(setsLabel(p.sets))}</td></tr>`).join('') +
    '</tbody></table>';
}

function niceTicks(min, max, count = 4) {
  if (min === max) { const d = Math.abs(min) * 0.1 || 1; min -= d; max += d; }
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

function drawChart(pts, m, el = $('#chart'), tip = $('#chart-tip')) {
  const vf = m.format || fmt;
  const W = el.clientWidth || 320, H = el.clientHeight || 260;
  const pad = { l: 40, r: 14, t: 14, b: 26 };
  const t0 = new Date(pts[0].date).getTime();
  const t1 = new Date(pts[pts.length - 1].date).getTime();
  const vals = pts.map(p => p.value);
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals));
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const x = d => pts.length === 1 ? (pad.l + W - pad.r) / 2 : pad.l + (new Date(d).getTime() - t0) / (t1 - t0) * (W - pad.l - pad.r);
  const y = v => { const f = (v - yMin) / (yMax - yMin); return pad.t + (m.invert ? f : 1 - f) * (H - pad.t - pad.b); };

  // running best -> mark PR sessions
  const sign = m.lowerBetter ? -1 : 1;
  let run = -Infinity;
  const pr = pts.map(p => { const v = sign * p.value; const is = v > run; if (is) run = v; return is; });

  const xy = pts.map(p => [x(p.date), y(p.value)]);
  const line = xy.map((c, i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ',' + c[1].toFixed(1)).join('');
  const area = pts.length > 1 ? `${line}L${xy[xy.length - 1][0].toFixed(1)},${H - pad.b}L${xy[0][0].toFixed(1)},${H - pad.b}Z` : '';

  // x labels: up to 4 evenly spaced
  const nX = Math.min(pts.length, W < 400 ? 3 : 5);
  const xIdx = nX === 1 ? [0] : [...new Set(Array.from({ length: nX }, (_, i) => Math.round(i * (pts.length - 1) / (nX - 1))))];

  const showDots = pts.length <= 60;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.label)} über die Zeit">
    <g class="grid">${ticks.map(t => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/>`).join('')}</g>
    <g class="axis">${ticks.map(t => `<text x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${vf(t)}</text>`).join('')}
      ${xIdx.map(i => `<text x="${xy[i][0]}" y="${H - 6}" text-anchor="${pts.length === 1 ? 'middle' : i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}">${dateShort(pts[i].date)}</text>`).join('')}</g>
    ${area ? `<path class="area" d="${area}"/>` : ''}
    <path class="line" d="${line}"/>
    ${showDots || pts.length === 1 ? xy.map((c, i) => `<circle class="dot${pr[i] ? ' pr' : ''}" cx="${c[0]}" cy="${c[1]}" r="${pr[i] ? 4.5 : 4}"/>`).join('') : ''}
    <line class="cross" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"/>
    <circle class="focus" r="6" visibility="hidden"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
  </svg>`;

  const svg = el.querySelector('svg'), cross = svg.querySelector('.cross'), focus = svg.querySelector('.focus');
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); focus.setAttribute('visibility', 'hidden'); };
  const move = ev => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / r.width);
    let bi = 0, bd = Infinity;
    xy.forEach((c, i) => { const d = Math.abs(c[0] - px); if (d < bd) { bd = d; bi = i; } });
    const [cx, cy] = xy[bi], p = pts[bi];
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    focus.setAttribute('cx', cx); focus.setAttribute('cy', cy); focus.setAttribute('visibility', 'visible');
    tip.innerHTML = `${esc(dateMed(p.date))}${pr[bi] && bi > 0 ? ' · 🏆' : ''}<br><b>${vf(p.value)} ${m.unit}</b><br>${esc(p.detail ?? setsLabel(p.sets))}`;
    tip.hidden = false;
    const cardR = el.parentElement.getBoundingClientRect();
    let left = r.left - cardR.left + cx * (r.width / W);
    const tw = tip.offsetWidth;
    left = Math.max(tw / 2 + 4, Math.min(cardR.width - tw / 2 - 4, left));
    tip.style.left = left + 'px';
    tip.style.top = (r.top - cardR.top + cy * (r.height / H)) + 'px';
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', hide);
}
window.addEventListener('resize', () => { if (currentView === 'progress') renderProgress(); if (currentView === 'runs') renderRuns(); });

/* ---------- Laufen ---------- */
const runDate = $('#run-date'), runDist = $('#run-dist'), runH = $('#run-h'), runM = $('#run-m'), runS = $('#run-s');
runDate.value = todayISO();
let runRange = 0, runMetric = 'pace';

const pad2 = n => String(n).padStart(2, '0');
function fmtDuration(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)} h` : `${m}:${pad2(s)} min`;
}
const fmtPace = secPerKm => { const t = Math.round(secPerKm); return `${Math.floor(t / 60)}:${pad2(t % 60)}`; };
const runPace = r => r.seconds / r.distance;          // Sekunden pro km
const runSpeed = r => r.distance / (r.seconds / 3600); // km/h
const runLabel = r => `${fmt(r.distance)} km in ${fmtDuration(r.seconds)} · ${fmtPace(runPace(r))} min/km`;

function readRunForm() {
  const distance = parseFloat(String(runDist.value).replace(',', '.'));
  const seconds = (parseInt(runH.value, 10) || 0) * 3600 + (parseInt(runM.value, 10) || 0) * 60 + (parseInt(runS.value, 10) || 0);
  return { distance, seconds };
}
function updateRunPreview() {
  const { distance, seconds } = readRunForm();
  $('#run-preview').innerHTML = distance > 0 && seconds > 0
    ? `Pace <b>${fmtPace(seconds / distance)} min/km</b> · ${fmt(Math.round(distance / (seconds / 3600) * 10) / 10)} km/h`
    : 'Pace wird automatisch berechnet';
}
[runDist, runH, runM, runS].forEach(i => i.addEventListener('input', updateRunPreview));

$('#run-form').addEventListener('submit', e => {
  e.preventDefault();
  const { distance, seconds } = readRunForm();
  if (!(distance > 0) || !(seconds > 0)) { toast('Bitte Distanz und Zeit angeben.'); return; }
  const prevBest = db.runs.length ? Math.min(...db.runs.map(runPace)) : null;
  db.runs.push({ id: uid(), date: runDate.value || todayISO(), distance, seconds, ts: Date.now() });
  save();
  [runDist, runH, runM, runS].forEach(i => { i.value = ''; });
  updateRunPreview();
  renderRuns();
  toast(prevBest !== null && seconds / distance < prevBest ? '🏆 Schnellste Pace bisher!' : 'Lauf gespeichert');
});

const RUN_METRIC = {
  pace: { label: 'Pace', unit: 'min/km', format: fmtPace, lowerBetter: true, invert: true, fn: runPace },
  distance: { label: 'Distanz', unit: 'km', fn: r => r.distance },
  speed: { label: 'Geschwindigkeit', unit: 'km/h', fn: r => Math.round(runSpeed(r) * 10) / 10 },
};
$('#run-metric').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  runMetric = b.dataset.metric;
  document.querySelectorAll('#run-metric button').forEach(x => x.classList.toggle('on', x === b));
  renderRuns();
});
$('#run-range').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  runRange = +b.dataset.range;
  document.querySelectorAll('#run-range button').forEach(x => x.classList.toggle('on', x === b));
  renderRuns();
});
$('#run-list').addEventListener('click', e => {
  const b = e.target.closest('[data-delrun]'); if (!b) return;
  const idx = db.runs.findIndex(r => r.id === b.dataset.delrun); if (idx < 0) return;
  const [removed] = db.runs.splice(idx, 1);
  save(); renderRuns();
  toast('Lauf gelöscht', { label: 'Rückgängig', fn: () => { db.runs.push(removed); save(); render(); } });
});

function renderRuns() {
  let runs = [...db.runs].sort((a, b) => a.date.localeCompare(b.date) || a.ts - b.ts);
  if (runRange) {
    const from = new Date(); from.setDate(from.getDate() - runRange);
    const iso = from.toISOString().slice(0, 10);
    runs = runs.filter(r => r.date >= iso);
  }
  const m = RUN_METRIC[runMetric];
  const tiles = $('#run-tiles');
  if (!runs.length) {
    tiles.innerHTML = '';
    $('#run-chart').innerHTML = '<div class="empty">Noch keine Läufe im gewählten Zeitraum.</div>';
  } else {
    const total = runs.reduce((a, r) => a + r.distance, 0);
    tiles.innerHTML = `
      <div class="tile"><div class="k">Gesamt</div><div class="v">${fmt(total >= 100 ? Math.round(total) : Math.round(total * 10) / 10)} <small>km</small></div></div>
      <div class="tile"><div class="k">Beste Pace</div><div class="v">${fmtPace(Math.min(...runs.map(runPace)))}</div></div>
      <div class="tile"><div class="k">Längster</div><div class="v">${fmt(Math.max(...runs.map(r => r.distance)))} <small>km</small></div></div>`;
    const pts = runs.map(r => ({ date: r.date, value: m.fn(r), detail: runLabel(r) }));
    drawChart(pts, m, $('#run-chart'), $('#run-tip'));
  }
  const all = [...db.runs].sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  $('#run-list').innerHTML = all.length ? all.map(r => `<li>
      <span class="name"><b>${fmt(r.distance)} km</b> · ${fmtDuration(r.seconds)}<br>
      <span class="meta">${esc(dateMed(r.date))} · ${fmtPace(runPace(r))} min/km · ${fmt(Math.round(runSpeed(r) * 10) / 10)} km/h</span></span>
      <button type="button" class="ghost" data-delrun="${r.id}" aria-label="Lauf löschen">✕</button></li>`).join('')
    : '<li class="empty">Noch keine Läufe erfasst.</li>';
}

/* ---------- Übungen ---------- */
$('#ex-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#ex-name').value.trim();
  if (!name) return;
  if (db.exercises.some(x => x.name.toLowerCase() === name.toLowerCase())) { toast('Diese Übung gibt es schon.'); return; }
  const ex = { id: uid(), name };
  db.exercises.push(ex); save();
  $('#ex-name').value = '';
  logEx.value = ex.id;
  render();
  fillExerciseSelect(logEx, ex.id);
  toast(`„${name}“ hinzugefügt`);
});

function renderExercises() {
  const counts = new Map();
  db.sets.forEach(s => counts.set(s.exerciseId, (counts.get(s.exerciseId) || 0) + 1));
  const list = sortedExercises();
  $('#ex-list').innerHTML = list.length ? list.map(e => `<li>
      <span class="name">${esc(e.name)}<br><span class="meta">${counts.get(e.id) || 0} Sätze</span></span>
      <button type="button" class="ghost" data-rename="${e.id}" aria-label="Umbenennen">✎</button>
      <button type="button" class="ghost" data-delex="${e.id}" aria-label="Löschen">✕</button>
    </li>`).join('') : '<li class="empty">Keine Übungen</li>';
}
$('#ex-list').addEventListener('click', e => {
  const rn = e.target.closest('[data-rename]'), del = e.target.closest('[data-delex]');
  if (rn) {
    const ex = db.exercises.find(x => x.id === rn.dataset.rename);
    const name = prompt('Neuer Name:', ex.name);
    if (name && name.trim()) { ex.name = name.trim(); save(); render(); }
  } else if (del) {
    const ex = db.exercises.find(x => x.id === del.dataset.delex);
    const n = db.sets.filter(s => s.exerciseId === ex.id).length;
    if (!confirm(`„${ex.name}“ löschen?` + (n ? `\nAuch ${n} erfasste Sätze werden gelöscht.` : ''))) return;
    db.exercises = db.exercises.filter(x => x.id !== ex.id);
    db.sets = db.sets.filter(s => s.exerciseId !== ex.id);
    save(); render();
  }
});

$('#btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `trainingslog-${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#file-import').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.exercises) || !Array.isArray(d.sets)) throw new Error();
    if (!Array.isArray(d.runs)) d.runs = [];
    if (!confirm(`Import: ${d.exercises.length} Übungen, ${d.sets.length} Sätze, ${d.runs.length} Läufe.\nAktuelle Daten werden ersetzt. Fortfahren?`)) return;
    db = d; save(); render(); toast('Import erfolgreich');
  } catch (_) { toast('Datei konnte nicht gelesen werden.'); }
});

/* ---------- Global ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-del]');
  if (b) deleteSet(b.dataset.del);
});

function render() {
  const hadLogValue = logEx.value;
  fillExerciseSelect(logEx);
  fillExerciseSelect(progEx);
  if (!hadLogValue && logEx.value) prefill();
  if (currentView === 'log') { updateHint(); renderDay(); }
  if (currentView === 'history') renderHistory();
  if (currentView === 'progress') renderProgress();
  if (currentView === 'exercises') renderExercises();
  if (currentView === 'runs') renderRuns();
}

render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
