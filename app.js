'use strict';

/* =========================================================
   Trainingslog – Krafttraining & Laufen
   Daten liegen lokal im Browser (localStorage).
   ========================================================= */

/* ---------- Speicher ---------- */
const KEY = 'trainingslog.v1';
const THEME_KEY = 'trainingslog.theme';
const DEFAULT_EXERCISES = ['Bankdrücken', 'Kniebeuge', 'Kreuzheben', 'Schulterdrücken', 'Klimmzüge', 'Rudern'];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function normalize(d) {
  if (!d || !Array.isArray(d.exercises) || !Array.isArray(d.sets)) return null;
  if (!Array.isArray(d.runs)) d.runs = [];
  return d;
}
function load() {
  try {
    const d = normalize(JSON.parse(localStorage.getItem(KEY)));
    if (d) return d;
  } catch (_) { /* leer oder ungültig */ }
  return { exercises: DEFAULT_EXERCISES.map(name => ({ id: uid(), name })), sets: [], runs: [] };
}
let db = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (_) { toast('Speichern fehlgeschlagen – Speicher voll oder blockiert.'); }
}

/* ---------- Kleine Helfer ---------- */
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const parseNum = v => parseFloat(String(v).replace(',', '.').trim());
const numIn = n => String(Math.round(n * 100) / 100).replace('.', ',');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const byTs = (a, b) => a.ts - b.ts;
function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}

/* ---------- Datum ---------- */
const pad2 = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseISO = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const todayISO = () => isoOf(new Date());
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); };
const dayNum = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
const weekStart = iso => addDays(iso, -((parseISO(iso).getDay() + 6) % 7));
const WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/* ---------- Formatierung ---------- */
const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const fmt = n => nf.format(n);
const fmt1 = n => nf1.format(n);
const sameYear = iso => iso.slice(0, 4) === todayISO().slice(0, 4);
const fmtLong = iso => parseISO(iso).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear(iso) ? {} : { year: 'numeric' }) });
const fmtShort = iso => parseISO(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
const fmtWeekday = iso => parseISO(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtMonth = ym => parseISO(ym + '-01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
const fmtDM = iso => { const d = parseISO(iso); return `${d.getDate()}.${d.getMonth() + 1}.`; };
function relDay(iso) {
  const d = dayNum(todayISO()) - dayNum(iso);
  if (d === 0) return 'Heute';
  if (d === 1) return 'Gestern';
  if (d > 1 && d < 7) return `vor ${d} Tagen`;
  return fmtShort(iso) + (sameYear(iso) ? '' : ' ' + iso.slice(0, 4));
}
const fmtMass = kg => kg >= 1000 ? `${fmt1(kg / 1000)} t` : `${fmt(Math.round(kg))} kg`;
function greeting() {
  const h = new Date().getHours();
  return h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
}

/* ---------- Kraft: Auswertung ---------- */
const e1rm = (w, r) => (r <= 1 ? w : w * (1 + r / 30)); // Epley-Formel
const exById = id => db.exercises.find(e => e.id === id);
const exName = id => exById(id)?.name ?? 'Gelöschte Übung';
const isBodyweight = exId => {
  const ss = db.sets.filter(s => s.exerciseId === exId);
  return ss.length > 0 && ss.every(s => s.weight === 0);
};
const setScore = (s, bw) => (bw ? s.reps : e1rm(s.weight, s.reps));

function setsLabel(sets) {
  const parts = [];
  for (const s of sets) {
    const last = parts[parts.length - 1];
    if (last && last.w === s.weight) last.r.push(s.reps); else parts.push({ w: s.weight, r: [s.reps] });
  }
  return parts.map(p => `${p.w ? fmt(p.w) + ' kg' : 'Körpergew.'} × ${p.r.join(', ')}`).join(' · ');
}
function sessionsOf(exId) {
  return [...groupBy(db.sets.filter(s => s.exerciseId === exId), s => s.date)]
    .map(([date, sets]) => ({ date, sets: sets.sort(byTs) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
function lastSessionBefore(exId, date) {
  const prior = db.sets.filter(s => s.exerciseId === exId && s.date < date);
  if (!prior.length) return null;
  const d = prior.reduce((m, s) => (s.date > m ? s.date : m), '');
  return { date: d, sets: prior.filter(s => s.date === d).sort(byTs) };
}
function recentExercises() {
  const last = new Map();
  db.sets.forEach(s => last.set(s.exerciseId, Math.max(last.get(s.exerciseId) || 0, s.ts)));
  return [...db.exercises].sort((a, b) => (last.get(b.id) || 0) - (last.get(a.id) || 0) || a.name.localeCompare(b.name, 'de'));
}
function isKraftPR(exId, weight, reps) {
  const prev = db.sets.filter(s => s.exerciseId === exId);
  if (!prev.length) return false;
  if (weight > 0) return e1rm(weight, reps) > Math.max(...prev.map(s => e1rm(s.weight, s.reps))) + 1e-9;
  return prev.every(s => s.weight === 0) && reps > Math.max(...prev.map(s => s.reps));
}

const EX_METRICS = {
  max: { label: 'Gewicht', long: 'Max. Gewicht', unit: 'kg', fn: ss => Math.max(...ss.map(s => s.weight)) },
  e1rm: { label: '1RM', long: 'Geschätztes 1RM', unit: 'kg', fn: ss => Math.max(...ss.map(s => e1rm(s.weight, s.reps))) },
  volume: { label: 'Volumen', long: 'Volumen', unit: 'kg', fn: ss => ss.reduce((a, s) => a + s.weight * s.reps, 0) },
  reps: { label: 'Wdh.', long: 'Max. Wiederholungen', unit: 'Wdh.', fn: ss => Math.max(...ss.map(s => s.reps)) },
};

/* ---------- Laufen: Auswertung ---------- */
const runPace = r => r.seconds / r.distance;            // Sekunden pro km
const runSpeed = r => r.distance / (r.seconds / 3600);  // km/h
const fmtPace = sec => { const t = Math.round(sec); return `${Math.floor(t / 60)}:${pad2(t % 60)}`; };
function fmtDur(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)} h` : `${m}:${pad2(s)} min`;
}
const RUN_METRICS = {
  pace: { label: 'Pace', unit: 'min/km', fn: runPace, format: fmtPace, lowerBetter: true, invert: true, steps: [5, 10, 15, 20, 30, 60, 120, 300] },
  distance: { label: 'Distanz', unit: 'km', fn: r => r.distance, format: fmt1 },
  speed: { label: 'km/h', unit: 'km/h', fn: runSpeed, format: fmt1 },
};

/* ---------- Gesamtauswertung ---------- */
function dayIndex() {
  const m = new Map();
  const get = iso => { let v = m.get(iso); if (!v) m.set(iso, (v = { sets: [], runs: [] })); return v; };
  db.sets.forEach(s => get(s.date).sets.push(s));
  db.runs.forEach(r => get(r.date).runs.push(r));
  return m;
}
function weekStats(ws, idx) {
  const out = { days: 0, volume: 0, km: 0, sets: 0, runs: 0 };
  for (let i = 0; i < 7; i++) {
    const info = idx.get(addDays(ws, i));
    if (!info) continue;
    if (info.sets.length || info.runs.length) out.days++;
    out.sets += info.sets.length;
    out.runs += info.runs.length;
    out.volume += info.sets.reduce((a, s) => a + s.weight * s.reps, 0);
    out.km += info.runs.reduce((a, r) => a + r.distance, 0);
  }
  return out;
}
function weekStreak(idx) {
  const weeks = new Set([...idx.keys()].map(weekStart));
  let w = weekStart(todayISO());
  if (!weeks.has(w)) w = addDays(w, -7);
  let n = 0;
  while (weeks.has(w)) { n++; w = addDays(w, -7); }
  return n;
}
function weeklySeries(n, fn) {
  const ws = weekStart(todayISO());
  return Array.from({ length: n }, (_, i) => {
    const w = addDays(ws, -7 * (n - 1 - i));
    return { ws: w, value: fn(w, addDays(w, 6)) };
  });
}
function records(since) {
  const out = [];
  for (const ex of db.exercises) {
    const bw = isBodyweight(ex.id);
    let best = -Infinity;
    for (const ses of sessionsOf(ex.id)) {
      const top = ses.sets.reduce((a, s) => (setScore(s, bw) > setScore(a, bw) ? s : a));
      const v = setScore(top, bw);
      if (best > -Infinity && v > best + 1e-9 && ses.date >= since) {
        out.push({
          date: ses.date, title: ex.name, go: 'uebung/' + ex.id,
          value: bw ? `${top.reps} Wdh.` : `${fmt(top.weight)} kg × ${top.reps}`,
          sub: bw ? 'Meiste Wiederholungen' : `1RM ≈ ${fmt1(v)} kg`,
        });
      }
      best = Math.max(best, v);
    }
  }
  const runs = [...db.runs].sort((a, b) => a.date.localeCompare(b.date) || a.ts - b.ts);
  let bestPace = Infinity, bestDist = 0;
  runs.forEach((r, i) => {
    if (i > 0 && r.date >= since) {
      if (r.distance >= 1 && bestPace < Infinity && runPace(r) < bestPace - 1e-9) {
        out.push({ date: r.date, title: 'Schnellste Pace', go: 'laufen', value: `${fmtPace(runPace(r))} /km`, sub: `${fmt(r.distance)} km Lauf` });
      }
      if (r.distance > bestDist + 1e-9) {
        out.push({ date: r.date, title: 'Längster Lauf', go: 'laufen', value: `${fmt(r.distance)} km`, sub: fmtDur(r.seconds) });
      }
    }
    if (r.distance >= 1) bestPace = Math.min(bestPace, runPace(r));
    bestDist = Math.max(bestDist, r.distance);
  });
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/* =========================================================
   Diagramme (SVG, ohne Bibliotheken)
   ========================================================= */
function niceTicks(min, max, count = 4, steps) {
  if (min === max) { const d = Math.abs(min) * 0.1 || 1; min -= d; max += d; }
  const raw = (max - min) / count;
  let step;
  if (steps) step = steps.find(s => s >= raw) || steps[steps.length - 1] * Math.ceil(raw / steps[steps.length - 1]);
  else {
    const mag = 10 ** Math.floor(Math.log10(raw));
    step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw - 1e-12);
  }
  const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(6));
  return out;
}
const labelWidth = (labels) => Math.max(...labels.map(l => String(l).length)) * 6.4 + 10;

/** Tooltip-Logik, die Linien-, Balken- und Kalenderdiagramm teilen. */
function makeTip(el) {
  const tip = el.querySelector('.tip');
  const svg = el.querySelector('svg');
  const vbW = svg.viewBox.baseVal.width;
  return {
    scale: () => svg.getBoundingClientRect().width / vbW,
    show(x, y, html) {
      const s = this.scale();
      tip.innerHTML = html;
      tip.hidden = false;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      const below = y * s - th - 14 < -10;
      tip.classList.toggle('below', below);
      tip.style.left = clamp(x * s, tw / 2 + 2, el.clientWidth - tw / 2 - 2) + 'px';
      tip.style.top = y * s + 'px';
    },
    hide() { tip.hidden = true; },
    svg,
  };
}
function svgPoint(svg, ev, vbW) {
  const r = svg.getBoundingClientRect();
  const s = r.width / vbW;
  return [(ev.clientX - r.left) / s, (ev.clientY - r.top) / s];
}
function bindPointer(el, onMove, onHide) {
  const svg = el.querySelector('svg');
  svg.addEventListener('pointerdown', onMove);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') onHide(); });
  el._hide = onHide;
}

/** Liniendiagramm über die Zeit. pts: [{iso, value, detail}] aufsteigend sortiert. */
function lineChart(el, pts, o = {}) {
  const W = Math.max(260, Math.round(el.clientWidth)), H = o.height || 230;
  const vf = o.format || fmt;
  const vals = pts.map(p => p.value);
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals), 4, o.steps);
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const pad = { l: labelWidth(ticks.map(vf)), r: 16, t: 26, b: 26 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const d0 = dayNum(pts[0].iso), span = dayNum(pts[pts.length - 1].iso) - d0;
  const x = iso => (span === 0 ? pad.l + iw / 2 : pad.l + ((dayNum(iso) - d0) / span) * iw);
  const y = v => { const f = (v - yMin) / (yMax - yMin); return pad.t + (o.invert ? f : 1 - f) * ih; };
  const sign = o.lowerBetter ? -1 : 1;
  let best = -Infinity;
  const pr = pts.map((p, i) => { const v = sign * p.value; const is = i > 0 && v > best + 1e-9; best = Math.max(best, v); return is; });
  const xy = pts.map(p => [x(p.iso), y(p.value)]);
  const line = xy.map((c, i) => `${i ? 'L' : 'M'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join('');
  const bottom = pad.t + ih;
  const area = pts.length > 1 ? `${line}L${xy[xy.length - 1][0].toFixed(1)},${bottom}L${xy[0][0].toFixed(1)},${bottom}Z` : '';
  const gid = 'g' + uid();

  let xt = span === 0 ? [pts[0].iso] : [pts[0].iso, addDays(pts[0].iso, Math.round(span / 2)), pts[pts.length - 1].iso];
  if (W < 300 && xt.length === 3) xt = [xt[0], xt[2]];
  const xl = span > 300 ? iso => parseISO(iso).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }) : fmtShort;
  const anchor = i => (xt.length === 1 ? 'middle' : i === 0 ? 'start' : i === xt.length - 1 ? 'end' : 'middle');
  const showDots = pts.length <= 45;
  const [lx, ly] = xy[xy.length - 1];
  const endAnchor = lx > W - pad.r - 24 ? 'end' : lx < pad.l + 24 ? 'start' : 'middle';

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || 'Verlauf')}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g-top"/><stop offset="1" class="g-bot"/></linearGradient></defs>
    <g class="grid">${ticks.map(t => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`).join('')}</g>
    <g>${ticks.map(t => `<text x="${pad.l - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${esc(vf(t))}</text>`).join('')}</g>
    <g>${xt.map((iso, i) => `<text x="${x(iso).toFixed(1)}" y="${H - 6}" text-anchor="${anchor(i)}">${esc(xl(iso))}</text>`).join('')}</g>
    ${area ? `<path d="${area}" fill="url(#${gid})"/>` : ''}
    <path class="line" d="${line}"/>
    ${showDots ? xy.map((c, i) => (i === xy.length - 1 ? '' : `<circle class="dot${pr[i] ? ' pr' : ''}" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${pr[i] ? 4.5 : 3.5}"/>`)).join('') : ''}
    <circle class="dot last${pr[pr.length - 1] ? ' pr' : ''}" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="5"/>
    <text class="end-label" x="${lx.toFixed(1)}" y="${(ly - 11).toFixed(1)}" text-anchor="${endAnchor}">${esc(vf(pts[pts.length - 1].value))}</text>
    <line class="cross" y1="${pad.t}" y2="${bottom}" visibility="hidden"/>
    <circle class="focus" r="6" visibility="hidden"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
  </svg><div class="tip" hidden></div>`;

  const t = makeTip(el), cross = $('.cross', el), focus = $('.focus', el);
  bindPointer(el, ev => {
    const [px, py] = svgPoint(t.svg, ev, W);
    let bi = 0, bd = Infinity;
    xy.forEach((c, i) => { const d = Math.abs(c[0] - px) + Math.abs(c[1] - py) * 0.15; if (d < bd) { bd = d; bi = i; } });
    const [cx, cy] = xy[bi], p = pts[bi];
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    focus.setAttribute('cx', cx); focus.setAttribute('cy', cy); focus.setAttribute('visibility', 'visible');
    t.show(cx, cy, `<span class="t-d">${esc(fmtWeekday(p.iso))}${pr[bi] ? ' · 🏆 Bestwert' : ''}</span>
      <b>${esc(vf(p.value))} ${esc(o.unit || '')}</b>${p.detail ? esc(p.detail) : ''}`);
  }, () => { t.hide(); cross.setAttribute('visibility', 'hidden'); focus.setAttribute('visibility', 'hidden'); });
}

/** Balkendiagramm (z. B. pro Woche). bars: [{label, value, tip}] */
function barChart(el, bars, o = {}) {
  const W = Math.max(140, Math.round(el.clientWidth)), H = o.height || 150;
  const vf = o.format || fmt1;
  const max = Math.max(0, ...bars.map(b => b.value));
  const ticks = max > 0 ? niceTicks(0, max, 3) : [0, 1];
  const yMax = ticks[ticks.length - 1];
  const pad = { l: labelWidth(ticks.map(vf)), r: 2, t: 8, b: 22 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const n = bars.length, slot = iw / n, bw = clamp(slot * 0.62, 4, 30);
  const y = v => pad.t + ih - (v / yMax) * ih;
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 40))));
  const r = Math.min(4, bw / 2);
  const barPath = (bx, by, w, h) => {
    const rr = Math.min(r, h);
    return `M${bx},${by + h}V${by + rr}Q${bx},${by} ${bx + rr},${by}H${bx + w - rr}Q${bx + w},${by} ${bx + w},${by + rr}V${by + h}Z`;
  };
  const cx = i => pad.l + slot * i + slot / 2;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || 'Balkendiagramm')}">
    <g class="grid">${ticks.slice(1).map(t => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`).join('')}</g>
    <g>${ticks.map(t => `<text x="${pad.l - 6}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${esc(vf(t))}</text>`).join('')}</g>
    <rect class="hl" y="${pad.t}" width="${slot.toFixed(1)}" height="${ih}" rx="6" visibility="hidden"/>
    ${bars.map((b, i) => {
      if (!(b.value > 0)) return '';
      const h = Math.max(2, ih - (y(b.value) - pad.t));
      return `<path class="bar" d="${barPath(+(cx(i) - bw / 2).toFixed(1), +(pad.t + ih - h).toFixed(1), +bw.toFixed(1), +h.toFixed(1))}"/>`;
    }).join('')}
    <line class="base" x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}"/>
    <g>${bars.map((b, i) => ((n - 1 - i) % every === 0 ? `<text x="${cx(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(b.label)}</text>` : '')).join('')}</g>
    <rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
  </svg><div class="tip" hidden></div>`;
  const t = makeTip(el), hl = $('.hl', el);
  bindPointer(el, ev => {
    const [px] = svgPoint(t.svg, ev, W);
    const i = clamp(Math.floor((px - pad.l) / slot), 0, n - 1);
    hl.setAttribute('x', (pad.l + slot * i).toFixed(1)); hl.setAttribute('visibility', 'visible');
    t.show(cx(i), Math.min(y(bars[i].value), pad.t + ih - 2), bars[i].tip);
  }, () => { t.hide(); hl.setAttribute('visibility', 'hidden'); });
}

/** Trainingskalender: Wochen als Spalten, Tage als Zeilen. */
function calendarChart(el, idx) {
  const W = Math.max(260, Math.round(el.clientWidth));
  const lab = 22, gap = 3, top = 18;
  const weeks = clamp(Math.floor((W - lab + gap) / (15 + gap)), 8, 26);
  const s = Math.min(22, (W - lab - gap * (weeks - 1)) / weeks);
  const today = todayISO(), start = addDays(weekStart(today), -7 * (weeks - 1));
  const H = Math.ceil(top + 7 * s + 6 * gap + 2);
  const rx = Math.min(4, s / 4).toFixed(1);
  const cid = uid();
  let cells = '', clips = '', active = 0;
  const labels = [];
  const pos = (w, d) => [lab + w * (s + gap), top + d * (s + gap)];
  for (let w = 0; w < weeks; w++) {
    const [x] = pos(w, 0);
    if (w === 0) labels.push({ x, iso: start });
    for (let d = 0; d < 7; d++) {
      const iso = addDays(start, w * 7 + d);
      if (w > 0 && iso.endsWith('-01') && iso <= today) labels.push({ x, iso });
      if (iso > today) continue;
      const [, y] = pos(w, d);
      const info = idx.get(iso), k = !!info?.sets.length, l = !!info?.runs.length;
      if (k || l) active++;
      const rect = cls => `<rect class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="${rx}"/>`;
      if (k && l) {
        const id = `c${cid}${w}_${d}`;
        clips += `<clipPath id="${id}">${rect('')}</clipPath>`;
        cells += rect('c-k') + `<path class="c-l" clip-path="url(#${id})" d="M${(x + s).toFixed(1)},${y.toFixed(1)}L${(x + s).toFixed(1)},${(y + s).toFixed(1)}L${x.toFixed(1)},${(y + s).toFixed(1)}Z"/>`;
      } else cells += rect(k ? 'c-k' : l ? 'c-l' : 'c-empty');
      if (iso === today) cells += `<rect class="c-today" x="${(x - 2).toFixed(1)}" y="${(y - 2).toFixed(1)}" width="${(s + 4).toFixed(1)}" height="${(s + 4).toFixed(1)}" rx="${(+rx + 2).toFixed(1)}"/>`;
    }
  }
  const monthLabels = labels.filter((m, i) => i === labels.length - 1 || labels[i + 1].x - m.x >= 30)
    .map(m => `<text x="${m.x.toFixed(1)}" y="11">${esc(parseISO(m.iso).toLocaleDateString('de-DE', { month: 'short' }))}</text>`).join('');
  const dayLabels = [[0, 'Mo'], [2, 'Mi'], [4, 'Fr']].map(([d, t]) => `<text x="0" y="${(top + d * (s + gap) + s / 2 + 4).toFixed(1)}">${t}</text>`).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trainingskalender der letzten ${weeks} Wochen">
    <defs>${clips}</defs>${monthLabels}${dayLabels}${cells}
    <rect class="c-hover" width="${(s + 4).toFixed(1)}" height="${(s + 4).toFixed(1)}" rx="${(+rx + 2).toFixed(1)}" visibility="hidden"/>
  </svg><div class="tip" hidden></div>`;
  const t = makeTip(el), hov = $('.c-hover', el);
  bindPointer(el, ev => {
    const [px, py] = svgPoint(t.svg, ev, W);
    const w = Math.floor((px - lab + gap / 2) / (s + gap)), d = Math.floor((py - top + gap / 2) / (s + gap));
    if (w < 0 || w >= weeks || d < 0 || d > 6) return;
    const iso = addDays(start, w * 7 + d);
    if (iso > today) return;
    const [x, y] = pos(w, d);
    hov.setAttribute('x', (x - 2).toFixed(1)); hov.setAttribute('y', (y - 2).toFixed(1)); hov.setAttribute('visibility', 'visible');
    const info = idx.get(iso);
    let body = 'Kein Training';
    if (info && (info.sets.length || info.runs.length)) {
      body = '';
      if (info.sets.length) {
        const names = [...new Set(info.sets.map(x2 => exName(x2.exerciseId)))];
        body += `<b>Kraft · ${plural(info.sets.length, 'Satz', 'Sätze')}</b>${esc(names.slice(0, 3).join(', ') + (names.length > 3 ? ' …' : ''))}`;
      }
      info.runs.forEach(r => { body += `<b>Lauf · ${esc(fmt(r.distance))} km</b>${esc(fmtDur(r.seconds) + ' · ' + fmtPace(runPace(r)) + ' min/km')}`; });
    }
    t.show(x + s / 2, y, `<span class="t-d">${esc(fmtWeekday(iso))}</span>${body}`);
  }, () => { t.hide(); hov.setAttribute('visibility', 'hidden'); });
  return { active, weeks };
}

function sparkline(vals, tone) {
  if (!vals.length) return '';
  const w = 70, h = 28, p = 3;
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const pts = vals.map((v, i) => [
    vals.length === 1 ? w - p : p + (i * (w - 2 * p)) / (vals.length - 1),
    max === min ? h / 2 : p + (1 - (v - min) / range) * (h - 2 * p),
  ]);
  const d = pts.map((c, i) => `${i ? 'L' : 'M'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join('');
  const [lx, ly] = pts[pts.length - 1];
  return `<svg class="spark ${tone}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${vals.length > 1 ? `<path d="${d}"/>` : ''}<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.8"/></svg>`;
}

const RANGES = [[30, '1 M'], [90, '3 M'], [180, '6 M'], [365, '1 J'], [0, 'Alle']];
const seg = (key, options, current, label) => `<div class="seg" role="group" aria-label="${esc(label)}">${options.map(([v, l]) => {
  const on = String(v) === String(current);
  return `<button type="button" data-seg="${key}" data-val="${v}" class="${on ? 'on' : ''}" aria-pressed="${on}">${esc(l)}</button>`;
}).join('')}</div>`;
const tile = (k, v, s = '') => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s || '&nbsp;'}</div></div>`;
function deltaHTML(first, last, lowerBetter) {
  if (!first) return '–';
  const pct = ((last - first) / first) * 100;
  const better = lowerBetter ? pct < 0 : pct > 0;
  const r = Math.round(pct);
  if (r === 0) return '±0 %';
  return `<span class="delta ${better ? 'up' : 'down'}">${r > 0 ? '▲' : '▼'} ${Math.abs(r)} %</span>`;
}

/* =========================================================
   Navigation
   ========================================================= */
const ROUTES = {
  home: { tab: 'home' },
  kraft: { tab: 'kraft' },
  laufen: { tab: 'laufen' },
  verlauf: { tab: 'verlauf' },
  uebung: { tab: 'kraft', back: 'kraft' },
  einstellungen: { tab: null, back: 'home' },
};
const state = {
  route: 'home', arg: null,
  kDate: todayISO(), lDate: todayISO(),
  exId: null, exMetric: {}, exRange: 0,
  runMetric: 'pace', runRange: 0, runsShown: 10,
  histFilter: 'all', histShown: 40,
};
let navigated = false;

function go(path) { navigated = true; location.hash = '#/' + path; }
function setHeader(overline, title) { $('#overline').textContent = overline; $('#title').textContent = title; }

function route() {
  const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  const r = ROUTES[name] ? name : 'home';
  const arg = rest.length ? decodeURIComponent(rest.join('/')) : null;
  if (r === 'uebung' && !exById(arg)) { location.replace('#/kraft'); return; }
  state.route = r; state.arg = arg;
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + r));
  $$('.tabbar a').forEach(a => {
    const on = a.dataset.tab === ROUTES[r].tab;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#btn-back').hidden = !ROUTES[r].back;
  $('#btn-settings').hidden = r === 'einstellungen';
  window.scrollTo(0, 0);
  render();
}
window.addEventListener('hashchange', route);
$('#btn-back').addEventListener('click', () => {
  if (navigated && history.length > 1) history.back();
  else location.hash = '#/' + ROUTES[state.route].back;
});
window.addEventListener('scroll', () => $('#topbar').classList.toggle('scrolled', window.scrollY > 4), { passive: true });

function render() {
  ({ home: renderHome, kraft: renderKraft, laufen: renderLaufen, verlauf: renderVerlauf, uebung: renderDetail, einstellungen: renderSettings })[state.route]();
}

/* =========================================================
   Übersicht
   ========================================================= */
function renderHome() {
  const today = todayISO();
  setHeader(fmtLong(today), greeting());
  const idx = dayIndex();
  const ws = weekStart(today);
  const cur = weekStats(ws, idx), prev = weekStats(addDays(ws, -7), idx);
  const streak = weekStreak(idx);
  const hasData = db.sets.length > 0 || db.runs.length > 0;

  const strip = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((label, i) => {
    const iso = addDays(ws, i), info = idx.get(iso);
    const k = !!info?.sets.length, l = !!info?.runs.length;
    const cls = ['wd', k || l ? 'on' : '', iso === today ? 'today' : '', iso > today ? 'future' : ''].join(' ');
    const inner = k || l
      ? (k ? `<span class="k">${ic('dumbbell')}</span>` : '') + (l ? `<span class="l">${ic('run')}</span>` : '')
      : parseISO(iso).getDate();
    const what = [k && 'Kraft', l && 'Lauf'].filter(Boolean).join(' + ') || 'kein Training';
    return `<div class="${cls}" title="${esc(fmtWeekday(iso))}: ${what}"><span class="dot${k && l ? ' two' : ''}">${inner}</span><span class="dl">${label}</span></div>`;
  }).join('');

  let html = `
    <div class="hero">
      <div class="hero-top"><span>Diese Woche</span>${streak ? `<span class="streak">${ic('flame')}${plural(streak, 'Woche', 'Wochen')} aktiv</span>` : ''}</div>
      <div class="hero-big"><b>${cur.days}</b><span>${cur.days === 1 ? 'Trainingstag' : 'Trainingstage'}</span></div>
      <div class="hero-sub">Letzte Woche: ${plural(prev.days, 'Tag', 'Tage')} · ${fmtMass(prev.volume)} · ${fmt1(prev.km)} km</div>
      <div class="hero-stats">
        <span class="hero-stat">${ic('dumbbell')}<b>${fmtMass(cur.volume)}</b>bewegt</span>
        <span class="hero-stat">${ic('run')}<b>${fmt1(cur.km)} km</b>gelaufen</span>
      </div>
      <div class="week">${strip}</div>
    </div>
    <div class="quick">
      <a class="qa kraft" href="#/kraft"><span class="qi">${ic('dumbbell')}</span><span><b>Kraft</b><small>Satz eintragen</small></span></a>
      <a class="qa lauf" href="#/laufen"><span class="qi">${ic('run')}</span><span><b>Laufen</b><small>Lauf eintragen</small></span></a>
    </div>`;

  if (!hasData) {
    html += `<div class="card welcome">
      <h2>Willkommen 👋</h2>
      <p>Trag dein erstes Training ein. Danach siehst du hier deinen Trainingskalender, die Entwicklung pro Woche und neue Bestleistungen.</p>
      <ol><li>Übung wählen</li><li>Gewicht &amp; Wiederholungen eingeben</li><li>Fortschritt verfolgen</li></ol>
    </div>`;
    $('#view-home').innerHTML = html;
    return;
  }

  const kSeries = weeklySeries(8, (a, b) => db.sets.filter(s => s.date >= a && s.date <= b).reduce((t, s) => t + s.weight * s.reps, 0));
  const lSeries = weeklySeries(8, (a, b) => db.runs.filter(r => r.date >= a && r.date <= b).reduce((t, r) => t + r.distance, 0));
  const recs = records(addDays(today, -30)).slice(0, 5);

  html += `
    <div class="card">
      <div class="card-head"><h2>Trainingskalender</h2><span class="aside" id="h-cal-sum"></span></div>
      <div class="chart" id="h-cal"></div>
      <div class="legend"><span><i class="sw kraft"></i>Kraft</span><span><i class="sw lauf"></i>Laufen</span><span><i class="sw both"></i>Beides</span></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Letzte 8 Wochen</h2><span class="aside">pro Woche</span></div>
      <div class="multiples">
        <div>
          <div class="m-head"><i class="sw kraft"></i>Kraft · Volumen</div>
          <div class="m-val">${fmtMass(kSeries[7].value)} <small>diese Woche</small></div>
          <div class="chart kraft" id="h-bars-k"></div>
        </div>
        <div>
          <div class="m-head"><i class="sw lauf"></i>Laufen · Distanz</div>
          <div class="m-val">${fmt1(lSeries[7].value)} km <small>diese Woche</small></div>
          <div class="chart lauf" id="h-bars-l"></div>
        </div>
      </div>
    </div>
    <div class="section-head"><h2>Neue Bestleistungen</h2><span class="aside">letzte 30 Tage</span></div>
    <div class="card list">${recs.length ? recs.map(r => `
      <button type="button" class="row-item" data-go="${esc(r.go)}">
        <span class="ri-icon gold">${ic('trophy')}</span>
        <span class="ri-main"><b>${esc(r.title)}</b><span>${esc(r.sub)} · ${esc(relDay(r.date))}</span></span>
        <span class="ri-value">${esc(r.value)}</span>
      </button>`).join('') : `<div class="empty">${ic('trophy')}<p>Noch keine neuen Rekorde in den letzten 30 Tagen – bleib dran!</p></div>`}
    </div>`;
  $('#view-home').innerHTML = html;

  const cal = calendarChart($('#h-cal'), idx);
  $('#h-cal-sum').textContent = `${plural(cal.active, 'Tag', 'Tage')} in ${cal.weeks} Wochen`;
  const thisWs = weekStart(today);
  const weekLbl = w => (w === thisWs ? 'Diese W.' : fmtDM(w));
  barChart($('#h-bars-k'), kSeries.map(b => ({
    label: weekLbl(b.ws), value: b.value / 1000,
    tip: `<span class="t-d">Woche ab ${esc(fmtShort(b.ws))}</span><b>${fmtMass(b.value)}</b>Volumen`,
  })), { format: v => fmt1(v) + ' t', label: 'Kraftvolumen pro Woche', height: 130 });
  barChart($('#h-bars-l'), lSeries.map(b => ({
    label: weekLbl(b.ws), value: b.value,
    tip: `<span class="t-d">Woche ab ${esc(fmtShort(b.ws))}</span><b>${fmt1(b.value)} km</b>gelaufen`,
  })), { format: v => fmt1(v), label: 'Laufkilometer pro Woche', height: 130 });
}

/* =========================================================
   Kraft
   ========================================================= */
const kWeight = $('#k-weight'), kReps = $('#k-reps');

function prefill() {
  const last = db.sets.filter(s => s.exerciseId === state.exId).sort((a, b) => b.ts - a.ts)[0];
  kWeight.value = last ? numIn(last.weight) : '';
  kReps.value = last ? last.reps : '';
}
function ensureExercise() {
  if (!state.exId || !exById(state.exId)) {
    state.exId = recentExercises()[0]?.id ?? null;
    prefill();
  }
}
function renderDatePill(p) {
  const iso = state[p + 'Date'], today = todayISO();
  const input = $(`#${p}-date`);
  input.value = iso; input.max = today;
  $(`#${p}-date-label`).textContent = iso === today ? 'Heute' : fmtWeekday(iso);
  $(`#${p}-date-pill`).classList.toggle('past', iso !== today);
}

function renderKraft() {
  setHeader(fmtLong(todayISO()), 'Krafttraining');
  ensureExercise();
  renderDatePill('k');

  // Übungs-Chips
  const chips = $('#k-chips');
  chips.innerHTML = recentExercises().map(e => {
    const on = e.id === state.exId;
    return `<button type="button" class="chip${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-ex="${e.id}">${esc(e.name)}</button>`;
  }).join('') + `<button type="button" class="chip add" data-new-ex>${ic('plus')}Neu</button>`;
  const sel = $('.chip.on', chips);
  if (sel) chips.scrollLeft = sel.offsetLeft - chips.clientWidth / 2 + sel.offsetWidth / 2;

  // Letztes Mal
  const prev = state.exId && lastSessionBefore(state.exId, state.kDate);
  $('#k-last').innerHTML = !state.exId ? '' : prev
    ? `${ic('clock')}<span>Zuletzt (${esc(relDay(prev.date))}): <b>${esc(setsLabel(prev.sets))}</b></span>`
    : `${ic('clock')}<span>Erstes Training dieser Übung</span>`;

  renderKraftDay();
  renderExerciseList();
}

function renderKraftDay() {
  const date = state.kDate, today = todayISO();
  const sets = db.sets.filter(s => s.date === date).sort(byTs);
  const volume = sets.reduce((a, s) => a + s.weight * s.reps, 0);
  // Bestwert-Satz je Übung (für das 🏆-Abzeichen)
  const bestSet = new Map();
  for (const exId of new Set(sets.map(s => s.exerciseId))) {
    const all = db.sets.filter(s => s.exerciseId === exId);
    if (all.length < 2) continue;
    const bw = isBodyweight(exId);
    bestSet.set(exId, all.reduce((a, s) => (setScore(s, bw) > setScore(a, bw) + 1e-9 ? s : a)).id);
  }
  let html = `<div class="section-head"><h2>${date === today ? 'Heute' : esc(fmtLong(date))}</h2>
    <span class="aside">${sets.length ? `${plural(sets.length, 'Satz', 'Sätze')} · ${fmtMass(volume)}` : ''}</span></div>`;
  if (!sets.length) {
    html += `<div class="card empty">${ic('dumbbell')}<p>${date === today ? 'Heute noch keine Sätze.' : 'An diesem Tag keine Sätze.'}</p></div>`;
  } else {
    for (const [exId, ss] of groupBy(sets, s => s.exerciseId)) {
      const vol = ss.reduce((a, s) => a + s.weight * s.reps, 0);
      html += `<div class="card">
        <div class="group-head">
          <button type="button" class="link-title" data-go="uebung/${exId}">${esc(exName(exId))}${ic('chev')}</button>
          <span class="aside">${fmtMass(vol)}</span>
        </div>
        <ol class="set-list">${ss.map((s, i) => `
          <li>
            <span class="set-no">${i + 1}</span>
            <span class="set-val">${s.weight ? `<b>${fmt(s.weight)}</b> kg × ` : 'Körpergew. × '}<b>${s.reps}</b></span>
            ${bestSet.get(exId) === s.id ? `<span class="badge">${ic('trophy')}Rekord</span>` : ''}
            <button type="button" class="icon-btn sm danger" data-del-set="${s.id}" aria-label="Satz löschen">${ic('trash')}</button>
          </li>`).join('')}
        </ol>
      </div>`;
    }
  }
  $('#k-day').innerHTML = html;
}

function renderExerciseList() {
  const rows = recentExercises().map(ex => {
    const ses = sessionsOf(ex.id);
    if (!ses.length) {
      return `<button type="button" class="row-item" data-go="uebung/${ex.id}">
        <span class="ri-main"><b>${esc(ex.name)}</b><span>Noch keine Einträge</span></span>${ic('chev', 'chev')}</button>`;
    }
    const bw = isBodyweight(ex.id);
    const val = ss => (bw ? Math.max(...ss.map(s => s.reps)) : Math.max(...ss.map(s => s.weight)));
    const vals = ses.map(s => val(s.sets));
    const best = Math.max(...vals);
    return `<button type="button" class="row-item" data-go="uebung/${ex.id}">
      <span class="ri-main"><b>${esc(ex.name)}</b><span>Bestwert ${bw ? best + ' Wdh.' : fmt(best) + ' kg'} · ${esc(relDay(ses[ses.length - 1].date))}</span></span>
      ${sparkline(vals.slice(-12), 'kraft')}${ic('chev', 'chev')}</button>`;
  }).join('');
  $('#k-list').innerHTML = `<div class="section-head"><h2>Deine Übungen</h2><a href="#/einstellungen">Verwalten</a></div>
    <div class="card list">${rows || `<div class="empty"><p>Noch keine Übungen angelegt.</p></div>`}</div>`;
}

$('#k-date').addEventListener('change', e => { state.kDate = e.target.value || todayISO(); renderKraft(); });

$('#k-form').addEventListener('submit', e => {
  e.preventDefault();
  if (!state.exId) { toast('Lege zuerst eine Übung an.'); return; }
  const weight = parseNum(kWeight.value || '0');
  const reps = parseInt(kReps.value, 10);
  if (!(weight >= 0) || !(reps >= 1)) { toast('Bitte Gewicht und Wiederholungen angeben.'); (reps >= 1 ? kWeight : kReps).focus(); return; }
  const pr = isKraftPR(state.exId, weight, reps);
  db.sets.push({ id: uid(), exerciseId: state.exId, date: state.kDate, weight, reps, ts: Date.now() });
  save();
  document.activeElement?.blur?.();
  navigator.vibrate?.(pr ? [15, 60, 25] : 12);
  renderKraft();
  const n = db.sets.filter(s => s.exerciseId === state.exId && s.date === state.kDate).length;
  if (pr) { toast('Neuer Bestwert!', null, 'trophy'); celebrate($('#k-save')); }
  else toast(`Satz ${n} gespeichert`, null, 'check');
});

/* =========================================================
   Übung (Detail)
   ========================================================= */
function renderDetail() {
  const ex = exById(state.arg);
  const bw = isBodyweight(ex.id);
  const all = sessionsOf(ex.id);
  setHeader(all.length ? `${plural(all.length, 'Einheit', 'Einheiten')} · ${plural(db.sets.filter(s => s.exerciseId === ex.id).length, 'Satz', 'Sätze')}` : 'Übung', ex.name);
  const view = $('#view-uebung');
  const trainBtn = `<button type="button" class="btn btn-kraft" data-train="${ex.id}">${ic('dumbbell')}Jetzt trainieren</button>`;
  if (!all.length) {
    view.innerHTML = `<div class="card empty">${ic('chart')}<b>Noch keine Daten</b><p>Sobald du Sätze einträgst, siehst du hier deine Entwicklung.</p></div>${trainBtn}`;
    return;
  }
  const mKey = state.exMetric[ex.id] || (bw ? 'reps' : 'max');
  const M = EX_METRICS[mKey];
  const since = state.exRange ? addDays(todayISO(), -state.exRange) : '';
  const ses = all.filter(s => s.date >= since);
  const pts = ses.map(s => ({ iso: s.date, value: Math.round(M.fn(s.sets) * 10) / 10, detail: setsLabel(s.sets) }));

  // Kacheln
  const bestVal = bw ? Math.max(...db.sets.filter(s => s.exerciseId === ex.id).map(s => s.reps)) : Math.max(...db.sets.filter(s => s.exerciseId === ex.id).map(s => s.weight));
  const bestDate = all.find(s => s.sets.some(x => (bw ? x.reps : x.weight) === bestVal))?.date;
  const setsInRange = ses.reduce((a, s) => a + s.sets.length, 0);
  const tiles = `<div class="tiles">
    ${tile('Bestwert', bw ? `${bestVal} <small>Wdh.</small>` : `${fmt(bestVal)} <small>kg</small>`, bestDate ? esc(relDay(bestDate)) : '')}
    ${tile('Entwicklung', pts.length > 1 ? deltaHTML(pts[0].value, pts[pts.length - 1].value) : '–', pts.length ? `seit ${esc(fmtShort(pts[0].iso))}` : '')}
    ${tile('Einheiten', String(ses.length), plural(setsInRange, 'Satz', 'Sätze'))}
  </div>`;

  // Verlauf-Liste mit Bestwert-Markierung
  let run = -Infinity;
  const prDates = new Set();
  all.forEach((s, i) => { const v = M.fn(s.sets); if (i > 0 && v > run + 1e-9) prDates.add(s.date); run = Math.max(run, v); });
  const list = [...all].reverse().map(s => {
    const d = parseISO(s.date);
    return `<button type="button" class="row-item" data-day="${s.date}" data-ex="${ex.id}">
      <span class="ri-date"><b>${d.getDate()}</b><span>${esc(d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', ''))}</span></span>
      <span class="ri-main"><b>${esc(setsLabel(s.sets))}</b><span>${esc(fmtLong(s.date))}</span></span>
      <span class="ri-value">${prDates.has(s.date) ? '🏆 ' : ''}${fmt1(M.fn(s.sets))} <small>${esc(M.unit)}</small></span>
    </button>`;
  }).join('');

  view.innerHTML = `${tiles}
    <div class="card">
      ${seg('exMetric', Object.entries(EX_METRICS).map(([k, m]) => [k, m.label]), mKey, 'Kennzahl')}
      ${pts.length ? '<div class="chart kraft" id="d-chart"></div>' : '<div class="chart-empty">Keine Einheiten in diesem Zeitraum.</div>'}
      ${seg('exRange', RANGES, state.exRange, 'Zeitraum')}
    </div>
    ${trainBtn}
    <div class="section-head"><h2>Alle Einheiten</h2><span class="aside">${esc(M.long)}</span></div>
    <div class="card list">${list}</div>`;
  if (pts.length) lineChart($('#d-chart'), pts, { unit: M.unit, format: fmt1, label: `${M.long} – ${ex.name}` });
}

/* =========================================================
   Laufen
   ========================================================= */
const lDist = $('#l-dist'), lH = $('#l-h'), lM = $('#l-m'), lS = $('#l-s');
function readRun() {
  const distance = parseNum(lDist.value);
  const seconds = (parseInt(lH.value, 10) || 0) * 3600 + (parseInt(lM.value, 10) || 0) * 60 + (parseInt(lS.value, 10) || 0);
  return { distance, seconds };
}
function updatePace() {
  const { distance, seconds } = readRun();
  const ok = distance > 0 && seconds > 0;
  $('#l-pace').textContent = ok ? fmtPace(seconds / distance) : '–:––';
  $('#l-speed').textContent = ok ? fmt1((distance / seconds) * 3600) : '–';
  $('.pace-preview').classList.toggle('empty', !ok);
}
[lDist, lH, lM, lS].forEach(i => i.addEventListener('input', updatePace));
$('#l-date').addEventListener('change', e => { state.lDate = e.target.value || todayISO(); renderDatePill('l'); });

$('#l-form').addEventListener('submit', e => {
  e.preventDefault();
  const { distance, seconds } = readRun();
  if (!(distance > 0)) { toast('Bitte die Distanz angeben.'); lDist.focus(); return; }
  if (!(seconds > 0)) { toast('Bitte die Zeit angeben.'); lM.focus(); return; }
  const prev = db.runs;
  const paceRuns = prev.filter(r => r.distance >= 1);
  const pacePR = distance >= 1 && paceRuns.length > 0 && seconds / distance < Math.min(...paceRuns.map(runPace)) - 1e-9;
  const distPR = prev.length > 0 && distance > Math.max(...prev.map(r => r.distance)) + 1e-9;
  db.runs.push({ id: uid(), date: state.lDate, distance, seconds, ts: Date.now() });
  save();
  [lDist, lH, lM, lS].forEach(i => { i.value = ''; });
  document.activeElement?.blur?.();
  updatePace();
  navigator.vibrate?.(pacePR || distPR ? [15, 60, 25] : 12);
  renderLaufen();
  if (pacePR || distPR) {
    toast(pacePR && distPR ? 'Schnellster & längster Lauf!' : pacePR ? 'Schnellste Pace bisher!' : 'Längster Lauf bisher!', null, 'trophy');
    celebrate($('#l-form .btn'));
  } else toast('Lauf gespeichert', null, 'check');
});

function renderLaufen() {
  setHeader(fmtLong(todayISO()), 'Laufen');
  renderDatePill('l');
  updatePace();
  const el = $('#l-stats');
  if (!db.runs.length) {
    el.innerHTML = `<div class="card empty">${ic('run')}<b>Noch keine Läufe</b><p>Hier erscheinen danach Pace-Verlauf, Wochenkilometer und deine Bestzeiten.</p></div>`;
    return;
  }
  const since = state.runRange ? addDays(todayISO(), -state.runRange) : '';
  const runs = db.runs.filter(r => r.date >= since).sort((a, b) => a.date.localeCompare(b.date) || a.ts - b.ts);
  const M = RUN_METRICS[state.runMetric];

  let html = '';
  if (runs.length) {
    const km = runs.reduce((a, r) => a + r.distance, 0), secs = runs.reduce((a, r) => a + r.seconds, 0);
    const paceRuns = runs.filter(r => r.distance >= 1);
    const bestPace = paceRuns.length ? Math.min(...paceRuns.map(runPace)) : Math.min(...runs.map(runPace));
    const longest = runs.reduce((a, r) => (r.distance > a.distance ? r : a));
    html += `<div class="tiles">
      ${tile('Gesamt', `${fmt1(km)} <small>km</small>`, plural(runs.length, 'Lauf', 'Läufe'))}
      ${tile('Beste Pace', fmtPace(bestPace), `Ø ${fmtPace(secs / km)} min/km`)}
      ${tile('Längster', `${fmt1(longest.distance)} <small>km</small>`, esc(relDay(longest.date)))}
    </div>`;
  }
  html += `<div class="card">
    ${seg('runMetric', Object.entries(RUN_METRICS).map(([k, m]) => [k, m.label]), state.runMetric, 'Kennzahl')}
    ${runs.length ? '<div class="chart lauf" id="l-chart"></div>' : '<div class="chart-empty">Keine Läufe in diesem Zeitraum.</div>'}
    ${seg('runRange', RANGES, state.runRange, 'Zeitraum')}
  </div>`;

  const weekly = weeklySeries(12, (a, b) => db.runs.filter(r => r.date >= a && r.date <= b).reduce((t, r) => t + r.distance, 0));
  const avg = weekly.reduce((a, w) => a + w.value, 0) / weekly.length;
  html += `<div class="card">
    <div class="card-head"><h2>Kilometer pro Woche</h2><span class="aside">Ø ${fmt1(avg)} km</span></div>
    <div class="chart lauf" id="l-bars"></div>
  </div>`;

  const allRuns = [...db.runs].sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  const shown = allRuns.slice(0, state.runsShown);
  html += `<div class="section-head"><h2>Alle Läufe</h2><span class="aside">${allRuns.length}</span></div>
    <div class="card list">${shown.map(r => `
      <div class="row-item">
        <span class="ri-icon lauf">${ic('run')}</span>
        <span class="ri-main"><b>${fmt(r.distance)} km · ${fmtDur(r.seconds)}</b><span>${esc(relDay(r.date))} · ${fmtPace(runPace(r))} min/km · ${fmt1(runSpeed(r))} km/h</span></span>
        <button type="button" class="icon-btn sm danger" data-del-run="${r.id}" aria-label="Lauf löschen">${ic('trash')}</button>
      </div>`).join('')}
      ${allRuns.length > shown.length ? `<button type="button" class="more" data-more="runsShown">Weitere ${Math.min(20, allRuns.length - shown.length)} anzeigen</button>` : ''}
    </div>`;
  el.innerHTML = html;

  if (runs.length) {
    lineChart($('#l-chart'), runs.map(r => ({ iso: r.date, value: M.fn(r), detail: `${fmt(r.distance)} km · ${fmtDur(r.seconds)} · ${fmtPace(runPace(r))} min/km` })),
      { unit: M.unit, format: M.format, invert: M.invert, lowerBetter: M.lowerBetter, steps: M.steps, label: `${M.label} pro Lauf` });
  }
  const thisWs = weekStart(todayISO());
  barChart($('#l-bars'), weekly.map(w => ({
    label: w.ws === thisWs ? 'Diese W.' : fmtDM(w.ws), value: w.value,
    tip: `<span class="t-d">Woche ab ${esc(fmtShort(w.ws))}</span><b>${fmt1(w.value)} km</b>`,
  })), { format: fmt1, label: 'Kilometer pro Woche', height: 170 });
}

/* =========================================================
   Verlauf
   ========================================================= */
function renderVerlauf() {
  const idx = dayIndex();
  const f = state.histFilter;
  const dates = [...idx.keys()]
    .filter(iso => f === 'all' || (f === 'kraft' ? idx.get(iso).sets.length : idx.get(iso).runs.length))
    .sort().reverse();
  setHeader(plural(idx.size, 'Trainingstag', 'Trainingstage'), 'Verlauf');
  let html = `<div class="filter-bar">${seg('histFilter', [['all', 'Alle'], ['kraft', 'Kraft'], ['laufen', 'Laufen']], f, 'Filter')}</div>`;
  if (!dates.length) {
    html += `<div class="card empty" style="margin-top:14px">${ic('cal')}<p>Noch keine Einträge.</p></div>`;
    $('#view-verlauf').innerHTML = html;
    return;
  }
  const shown = dates.slice(0, state.histShown);
  for (const [ym, days] of groupBy(shown, iso => iso.slice(0, 7))) {
    const total = dates.filter(d => d.startsWith(ym)).length;
    html += `<div class="section-head"><h2>${esc(fmtMonth(ym))}</h2><span class="aside">${plural(total, 'Tag', 'Tage')}</span></div>`;
    for (const iso of days) {
      const info = idx.get(iso);
      const d = parseISO(iso);
      let body = '';
      if (f !== 'kraft') {
        body += info.runs.sort(byTs).map(r => `<div class="entry"><span class="ei lauf">${ic('run')}</span>
          <span><b>Lauf · ${fmt(r.distance)} km</b><span>${fmtDur(r.seconds)} · ${fmtPace(runPace(r))} min/km</span></span></div>`).join('');
      }
      if (f !== 'laufen') {
        for (const [exId, ss] of groupBy(info.sets.sort(byTs), s => s.exerciseId)) {
          body += `<button type="button" class="entry" data-day="${iso}" data-ex="${exId}"><span class="ei kraft">${ic('dumbbell')}</span>
            <span><b>${esc(exName(exId))}</b><span>${esc(setsLabel(ss))}</span></span></button>`;
        }
      }
      html += `<div class="card day"><div class="day-date"><b>${d.getDate()}</b><span>${WD_SHORT[d.getDay()]}</span></div><div class="day-body">${body}</div></div>`;
    }
  }
  if (dates.length > shown.length) html += `<button type="button" class="btn btn-soft sm" data-more="histShown">Ältere Einträge laden</button>`;
  $('#view-verlauf').innerHTML = html;
}

/* =========================================================
   Einstellungen
   ========================================================= */
function getTheme() { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (_) { return 'auto'; } }
function applyTheme(t) {
  const r = document.documentElement;
  if (t === 'light' || t === 'dark') r.dataset.theme = t; else delete r.dataset.theme;
  syncThemeColor();
}
function setTheme(t) {
  try { if (t === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch (_) { /* egal */ }
  applyTheme(t);
}
function syncThemeColor() {
  requestAnimationFrame(() => {
    const c = getComputedStyle(document.body).backgroundColor;
    $$('meta[name="theme-color"]').forEach(m => m.setAttribute('content', c));
  });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeColor);

function renderSettings() {
  setHeader('Trainingslog', 'Einstellungen');
  const counts = new Map();
  db.sets.forEach(s => counts.set(s.exerciseId, (counts.get(s.exerciseId) || 0) + 1));
  const exs = [...db.exercises].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  $('#view-einstellungen').innerHTML = `
    <div class="section-head first"><h2>Darstellung</h2></div>
    <div class="card">${seg('theme', [['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']], getTheme(), 'Farbschema')}</div>

    <div class="section-head"><h2>Übungen</h2><span class="aside">${db.exercises.length}</span></div>
    <form class="card add-row" id="ex-form" autocomplete="off">
      <input class="input" id="ex-name" placeholder="Neue Übung" maxlength="60" aria-label="Name der neuen Übung">
      <button type="submit" class="btn btn-kraft sm">${ic('plus')}Hinzufügen</button>
    </form>
    <div class="card list">${exs.map(e => `
      <div class="row-item">
        <span class="ri-main"><b>${esc(e.name)}</b><span>${plural(counts.get(e.id) || 0, 'Satz', 'Sätze')}</span></span>
        <button type="button" class="icon-btn sm" data-rename="${e.id}" aria-label="${esc(e.name)} umbenennen">${ic('edit')}</button>
        <button type="button" class="icon-btn sm danger" data-del-ex="${e.id}" aria-label="${esc(e.name)} löschen">${ic('trash')}</button>
      </div>`).join('') || '<div class="empty"><p>Keine Übungen</p></div>'}
    </div>

    <div class="section-head"><h2>Daten &amp; Sicherung</h2></div>
    <div class="card">
      <p class="muted">${plural(db.sets.length, 'Satz', 'Sätze')} und ${plural(db.runs.length, 'Lauf', 'Läufe')} sind nur auf diesem Gerät gespeichert. Exportiere regelmäßig eine Sicherung – damit kannst du deine Daten auch auf ein anderes Gerät übertragen.</p>
      <div class="btn-row">
        <button type="button" class="btn btn-soft sm" data-act="export">${ic('download')}Exportieren</button>
        <label class="btn btn-soft sm file-btn">${ic('upload')}Importieren<input type="file" id="file-import" accept="application/json,.json"></label>
      </div>
    </div>
    <p class="foot">Trainingslog · funktioniert auch offline</p>`;
}

function addExercise(name) {
  name = name.trim();
  if (!name) return null;
  if (db.exercises.some(x => x.name.toLowerCase() === name.toLowerCase())) { toast('Diese Übung gibt es schon.'); return null; }
  const ex = { id: uid(), name };
  db.exercises.push(ex);
  save();
  return ex;
}

function exportData() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `trainingslog-${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Sicherung exportiert', null, 'check');
}
async function importData(file) {
  try {
    const d = normalize(JSON.parse(await file.text()));
    if (!d) throw new Error('format');
    if (!confirm(`Import: ${d.exercises.length} Übungen, ${d.sets.length} Sätze, ${d.runs.length} Läufe.\nDie aktuellen Daten werden ersetzt. Fortfahren?`)) return;
    db = d; save(); state.exId = null; render();
    toast('Import erfolgreich', null, 'check');
  } catch (_) { toast('Datei konnte nicht gelesen werden.'); }
}

/* =========================================================
   Globale Ereignisse
   ========================================================= */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-seg],[data-step],[data-day],[data-train],[data-go],[data-ex],[data-new-ex],[data-del-set],[data-del-run],[data-rename],[data-del-ex],[data-act],[data-more]');
  if (!t) return;
  const d = t.dataset;

  if (d.seg) {
    if (d.seg === 'theme') setTheme(d.val);
    else if (d.seg === 'exMetric') state.exMetric[state.arg] = d.val;
    else state[d.seg] = /^\d+$/.test(d.val) ? +d.val : d.val;
    if (d.seg === 'histFilter') state.histShown = 40;
    render();
  } else if (d.step) {
    const inp = $('#' + d.step);
    const min = d.step === 'k-reps' ? 1 : 0;
    const v = Math.max(min, (parseNum(inp.value) || 0) + parseFloat(d.delta));
    inp.value = numIn(v);
    navigator.vibrate?.(5);
  } else if (d.day) {
    state.kDate = d.day;
    if (d.ex) { state.exId = d.ex; prefill(); }
    go('kraft');
  } else if (d.train) {
    state.exId = d.train; state.kDate = todayISO(); prefill(); go('kraft');
  } else if (d.go) {
    go(d.go);
  } else if (d.ex) {
    if (state.exId !== d.ex) { state.exId = d.ex; prefill(); renderKraft(); }
  } else if ('newEx' in d) {
    const name = prompt('Name der neuen Übung:');
    const ex = name && addExercise(name);
    if (ex) { state.exId = ex.id; prefill(); renderKraft(); toast(`„${ex.name}“ hinzugefügt`, null, 'check'); }
  } else if (d.delSet) {
    const i = db.sets.findIndex(s => s.id === d.delSet);
    if (i < 0) return;
    const [removed] = db.sets.splice(i, 1);
    save(); render();
    toast('Satz gelöscht', { label: 'Rückgängig', fn: () => { db.sets.push(removed); save(); render(); } }, 'trash');
  } else if (d.delRun) {
    const i = db.runs.findIndex(r => r.id === d.delRun);
    if (i < 0) return;
    const [removed] = db.runs.splice(i, 1);
    save(); render();
    toast('Lauf gelöscht', { label: 'Rückgängig', fn: () => { db.runs.push(removed); save(); render(); } }, 'trash');
  } else if (d.rename) {
    const ex = exById(d.rename);
    const name = prompt('Neuer Name:', ex.name)?.trim();
    if (name && name !== ex.name) {
      if (db.exercises.some(x => x !== ex && x.name.toLowerCase() === name.toLowerCase())) { toast('Diese Übung gibt es schon.'); return; }
      ex.name = name; save(); render();
    }
  } else if (d.delEx) {
    const ex = exById(d.delEx);
    const n = db.sets.filter(s => s.exerciseId === ex.id).length;
    if (!confirm(`„${ex.name}“ löschen?` + (n ? `\nAuch ${plural(n, 'erfasster Satz wird', 'erfasste Sätze werden')} gelöscht.` : ''))) return;
    db.exercises = db.exercises.filter(x => x.id !== ex.id);
    db.sets = db.sets.filter(s => s.exerciseId !== ex.id);
    if (state.exId === ex.id) state.exId = null;
    save(); render();
  } else if (d.act === 'export') {
    exportData();
  } else if (d.more) {
    state[d.more] += d.more === 'runsShown' ? 20 : 40;
    render();
  }
});

document.addEventListener('submit', e => {
  if (e.target.id !== 'ex-form') return;
  e.preventDefault();
  const ex = addExercise($('#ex-name').value);
  if (ex) { renderSettings(); toast(`„${ex.name}“ hinzugefügt`, null, 'check'); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'file-import' && e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; }
});
// Tooltips schließen, wenn außerhalb eines Diagramms getippt wird
document.addEventListener('pointerdown', e => {
  $$('.chart').forEach(c => { if (!c.contains(e.target)) c._hide?.(); });
}, true);
// Diagramme bei Breitenänderung neu zeichnen
let lastWidth = window.innerWidth, resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (window.innerWidth !== lastWidth) { lastWidth = window.innerWidth; render(); } }, 150);
});
// Neuer Tag (App bleibt offen) → Datum aktualisieren
let lastDay = todayISO();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || todayISO() === lastDay) return;
  if (state.kDate === lastDay) state.kDate = todayISO();
  if (state.lDate === lastDay) state.lDate = todayISO();
  lastDay = todayISO();
  render();
});

/* ---------- Toast & Konfetti ---------- */
let toastTimer;
function toast(msg, action, icon) {
  const t = $('#toast');
  t.innerHTML = (icon ? ic(icon) : '') + `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.onclick = () => { action.fn(); t.hidden = true; };
    t.appendChild(b);
  }
  t.hidden = true; void t.offsetWidth; t.hidden = false; // Animation neu starten
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 5000 : 2400);
}

function celebrate(from) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = from.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = 'confetti';
  box.style.left = r.left + r.width / 2 + 'px';
  box.style.top = r.top + 'px';
  const colors = ['#2a78d6', '#eb6834', '#fab219', '#1baf7a', '#e87ba4', '#6250d6'];
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('i');
    const a = Math.random() * Math.PI - Math.PI; // nach oben
    const v = 90 + Math.random() * 160;
    p.style.setProperty('--c', colors[i % colors.length]);
    p.style.setProperty('--x', `${Math.cos(a) * v}px`);
    p.style.setProperty('--up', `${Math.sin(a) * v}px`);
    p.style.setProperty('--y', `${Math.sin(a) * v * 0.3 + 220}px`);
    p.style.setProperty('--r', `${(Math.random() - 0.5) * 900}deg`);
    p.style.setProperty('--d', `${Math.random() * 80}ms`);
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 1600);
}

/* ---------- Start ---------- */
applyTheme(getTheme());
if (!location.hash) history.replaceState(null, '', '#/home');
route();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
