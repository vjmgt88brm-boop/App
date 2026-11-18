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
  ziel: { tab: 'laufen', back: 'laufen' },
  einstellungen: { tab: null, back: 'home' },
};
const state = {
  route: 'home', arg: null,
  kDate: todayISO(), lDate: todayISO(),
  exId: null, exMetric: {}, exRange: 0,
  runMetric: 'pace', runRange: 0, runsShown: 10,
  histFilter: 'all', histShown: 40,
  goalEdit: false, goalDraft: null,
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
  if (r !== 'ziel') { state.goalEdit = false; state.goalDraft = null; }
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
  ({ home: renderHome, kraft: renderKraft, laufen: renderLaufen, verlauf: renderVerlauf, uebung: renderDetail, ziel: renderZiel, einstellungen: renderSettings })[state.route]();
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
  $('#l-pace').textContent = ok ? fmtPace(seconds / distance) : '–';
  $('#l-speed').textContent = ok ? fmt1((distance / seconds) * 3600) : '–';
  $('.pace-preview').classList.toggle('is-empty', !ok);
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
  renderGoalTeaser();
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
   Laufziel – Prognosen & Empfehlungen
   ========================================================= */
const RIEGEL = 1.06; // Riegel-Formel: t2 = t1 · (d2 / d1)^1.06
const GOAL_PRESETS = [[5, '5 km'], [10, '10 km'], [21.0975, 'Halbmarathon'], [42.195, 'Marathon']];
const isPresetDist = d => GOAL_PRESETS.some(([v]) => Math.abs(v - d) < 0.01);
const distName = d => GOAL_PRESETS.find(([v]) => Math.abs(v - d) < 0.01)?.[1] ?? `${fmt1(d)} km`;
function fmtTime(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}
const goalLabel = g => (g.time ? `${distName(g.distance)} in ${fmtTime(g.time)}` : `${distName(g.distance)} schaffen`);
const runScore = r => r.seconds / r.distance ** RIEGEL;
const predictTime = (F, d) => F * d ** RIEGEL;
const fmtRange = z => `${fmtPace(z[0])}–${fmtPace(z[1])}`;

/** Form = Mittel der zwei schnellsten (umgerechneten) Läufe im Zeitfenster. */
function fitnessAt(end, days = 42) {
  const from = addDays(end, -(days - 1));
  const s = db.runs.filter(r => r.distance >= 1 && r.date >= from && r.date <= end).map(runScore).sort((a, b) => a - b).slice(0, 2);
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
}

/** Aktuelle Form, Verlauf der letzten 12 Wochen und Hochrechnung bis zum Zieltag. */
function forecast(goal) {
  const today = todayISO(), D = goal.distance;
  let F = fitnessAt(today), stale = false;
  if (!F) { F = fitnessAt(today, 180); stale = !!F; }
  const hist = [];
  for (let k = 12; k >= 1; k--) {
    const end = addDays(today, -7 * k);
    const f = fitnessAt(end);
    if (f) hist.push({ iso: end, value: predictTime(f, D) });
  }
  if (!F) return { F: null, current: null, hist };
  const current = predictTime(F, D);
  hist.push({ iso: today, value: current });

  // Trend per linearer Regression – realistisch begrenzt
  let rate = -0.0025, estimated = true;
  const span = dayNum(today) - dayNum(hist[0].iso);
  const nRuns = db.runs.filter(r => r.distance >= 1 && r.date >= addDays(today, -83)).length;
  if (!stale && hist.length >= 3 && span >= 21 && nRuns >= 4) {
    const xs = hist.map(p => dayNum(p.iso)), ys = hist.map(p => p.value);
    const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    let sxx = 0, sxy = 0;
    xs.forEach((x, i) => { sxx += (x - mx) ** 2; sxy += (x - mx) * (ys[i] - my); });
    rate = clamp(((sxx ? sxy / sxx : 0) * 7) / current, -0.008, 0.004);
    estimated = false;
  }
  const W0 = 16; // Fortschritt flacht mit der Zeit ab
  const at = iso => {
    const w = Math.max(0, (dayNum(iso) - dayNum(today)) / 7);
    const mid = current * (1 + clamp(rate * W0 * (1 - Math.exp(-w / W0)), -0.12, 0.08));
    const spread = current * (0.012 + 0.0035 * w);
    return { mid, lo: mid - spread, hi: mid + spread };
  };
  return { F, current, hist, rate, estimated, stale, at };
}

function countdown(goal) {
  const d = dayNum(goal.date) - dayNum(todayISO());
  if (d < 0) return 'Termin vorbei';
  if (d === 0) return 'heute!';
  if (d === 1) return 'morgen';
  if (d < 14) return `noch ${d} Tage`;
  return `noch ${Math.round(d / 7)} Wochen`;
}

function goalStatus(goal, fc) {
  const today = todayISO();
  if (goal.date < today) return { cls: 'neutral', icon: 'flag', text: 'Termin vorbei' };
  if (!fc.current) return { cls: 'neutral', icon: 'bulb', text: 'Noch keine Daten' };
  if (goal.time) {
    const proj = fc.at(goal.date).mid;
    if (fc.current <= goal.time) return { cls: 'good', icon: 'check', text: 'Schon in Reichweite' };
    if (proj <= goal.time) return { cls: 'good', icon: 'check', text: 'Auf Kurs' };
    if (proj <= goal.time * 1.03) return { cls: 'warn', icon: 'trend', text: 'Knapp' };
    return { cls: 'warn', icon: 'alert', text: 'Ambitioniert' };
  }
  const need = goal.distance * (goal.distance <= 10 ? 0.9 : goal.distance <= 21.1 ? 0.75 : 0.7);
  const longest = Math.max(0, ...db.runs.filter(r => r.date >= addDays(today, -27)).map(r => r.distance));
  if (longest >= need) return { cls: 'good', icon: 'check', text: 'Ausdauer bereit' };
  return { cls: 'neutral', icon: 'route', text: `Ausdauer ${Math.round((longest / need) * 100)} %` };
}

/** Trainingstempos (Sekunden/km) aus der aktuellen Form – oder aus der Zielzeit geschätzt. */
function paceZones(F, goal) {
  let est = false;
  if (!F && goal.time) { F = (goal.time / goal.distance ** RIEGEL) * 1.04; est = true; }
  if (!F) return null;
  const p = d => predictTime(F, d) / d;
  const p10 = p(10), p5 = p(5);
  return {
    est, p10,
    easy: [p10 * 1.18, p10 * 1.3],
    long: [p10 * 1.15, p10 * 1.25],
    tempo: [p10 * 1.03, p10 * 1.06],
    interval: [p5 * 0.98, p5 * 1.01],
    goal: goal.time ? goal.time / goal.distance : null,
  };
}

const PHASES = {
  grundlage: ['Grundlage', 'Viel locker laufen und den Umfang behutsam steigern.'],
  aufbau: ['Aufbau', 'Eine fordernde Einheit pro Woche, der lange Lauf wächst.'],
  spezifisch: ['Zielspezifisch', 'Jetzt gezielt das Zieltempo trainieren.'],
  erholung: ['Erholungswoche', 'Bewusst weniger Umfang – jetzt passt sich dein Körper an.'],
  taper: ['Tapering', 'Umfang reduzieren, kurz und knackig bleiben, Frische tanken.'],
  race: ['Wettkampfwoche', 'Locker bleiben – am Zieltag zählt es.'],
};
const SESSION_META = {
  easy: { icon: 'run', level: 1 }, strides: { icon: 'run', level: 2 }, long: { icon: 'route', level: 2 },
  tempo: { icon: 'gauge', level: 3 }, goal: { icon: 'target', level: 4 }, interval: { icon: 'bolt', level: 5 }, race: { icon: 'flag', level: 5 },
};
const intensity = (lvl, label = 'Intensität') => `<span class="intensity" role="img" aria-label="${label} ${lvl} von 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('')}</span>`;

/** Wochenplan: Phase aus der Zeit bis zum Ziel, Umfang aus den letzten 4 Wochen (+10 %-Regel). */
function weekPlan(goal, Z) {
  const today = todayISO(), ws = weekStart(today), D = goal.distance;
  const weeksLeft = Math.floor((dayNum(weekStart(goal.date)) - dayNum(ws)) / 7) + 1; // 1 = Wettkampfwoche
  const inWeek = w => db.runs.filter(r => r.date >= w && r.date <= addDays(w, 6));
  const prev = [1, 2, 3, 4].map(k => inWeek(addDays(ws, -7 * k)));
  const V = prev.reduce((a, rs) => a + rs.reduce((t, r) => t + r.distance, 0), 0) / 4;
  const N = Math.round(prev.reduce((a, rs) => a + rs.length, 0) / 4);
  const peak = D <= 5 ? 35 : D <= 10 ? 45 : D <= 21.1 ? 55 : 70;
  const maxLong = D <= 5 ? 10 : D <= 10 ? 8 + D * 0.6 : D <= 21.1 ? D * 0.95 : Math.min(32, D * 0.76);
  const L = Math.max(0, ...db.runs.filter(r => r.date >= addDays(ws, -21) && r.date < ws).map(r => r.distance));
  const base = V > 0 ? V : clamp(D * 1.2, 8, 15);
  const weekIdx = Math.max(0, Math.floor((dayNum(ws) - dayNum(weekStart(goal.created || today))) / 7));

  let phase = weeksLeft <= 1 ? 'race' : weeksLeft === 2 ? 'taper' : weeksLeft <= 6 ? 'spezifisch' : weeksLeft <= 12 ? 'aufbau' : 'grundlage';
  if (V > 0 && ['grundlage', 'aufbau', 'spezifisch'].includes(phase) && weekIdx % 4 === 3) phase = 'erholung';
  const factor = { grundlage: 1.1, aufbau: 1.1, spezifisch: 1.05, erholung: 0.75, taper: 0.7, race: 0.5 }[phase];
  const target = Math.min(peak, base * factor);
  const n = clamp(N || 3, 3, 5);

  const r5 = x => Math.max(1, Math.round(x * 2) / 2);
  const paceOf = z => (Z && Z[z] ? `${Array.isArray(Z[z]) ? fmtRange(Z[z]) : fmtPace(Z[z])} min/km` : '');
  const mk = (type, title, km, detail, zone) => ({ type, title, km: r5(km), detail, pace: paceOf(zone) });
  const S = [];

  if (phase === 'race') {
    S.push(mk('strides', 'Lockerer Lauf', clamp(base * 0.15, 3, 6), 'mit 4 × 20 s Steigerungen am Ende', 'easy'));
    S.push(mk('easy', 'Kurzer lockerer Lauf', 3, '1–2 Tage vor dem Ziel, ganz entspannt', 'easy'));
    S.push({ ...mk('race', 'Zieltag', D, Z?.goal ? 'gleichmäßig im Zieltempo starten, nicht zu schnell loslaufen' : 'ruhig starten und das Tempo halten', 'goal'), km: Math.round(D * 100) / 100 });
  } else {
    let long = phase === 'taper' ? Math.min(maxLong * 0.6, Math.max(L, D * 0.5))
      : phase === 'erholung' ? Math.max(4, L * 0.8)
      : Math.min(maxLong, Math.max(L * 1.1, L + 1, target * 0.3));
    long = Math.min(long, Math.max(target * 0.5, 5));
    const longS = mk('long', 'Langer Lauf', long, 'ruhig und gleichmäßig – Ausdauer zählt, nicht Tempo', 'long');
    const reps = clamp(Math.round(target * 0.12), 3, 8);
    const tx = r5(clamp(target * 0.13, 2, 10));
    const [gk, gl] = D <= 5 ? [3, 1.5] : D <= 10 ? [3, 2] : D <= 21.1 ? [2, 4] : [1, 12];
    const Q = {
      interval: () => mk('interval', 'Intervalle', 3.5 + reps + (reps - 1) * 0.4, `2 km ein · ${reps} × 1 km zügig · je 400 m Trabpause · 1,5 km aus`, 'interval'),
      tempo: () => mk('tempo', 'Tempolauf', 3.5 + tx, `2 km ein · ${fmt(tx)} km im Tempo · 1,5 km aus`, 'tempo'),
      goal: () => mk('goal', 'Zieltempo-Lauf', 3.5 + gk * gl + (gk - 1) * 0.4, `2 km ein · ${gk > 1 ? `${gk} × ` : ''}${fmt(gl)} km im Zieltempo${gk > 1 ? ' · je 2 min Trabpause' : ''} · 1,5 km aus`, 'goal'),
      short: () => mk(Z?.goal ? 'goal' : 'tempo', 'Kurz & zügig', 7.3, `2 km ein · 3 × 1 km ${Z?.goal ? 'im Zieltempo' : 'im Tempo'} · je 2 min Trabpause · 1,5 km aus`, Z?.goal ? 'goal' : 'tempo'),
      strides: () => mk('strides', 'Lauf mit Steigerungen', 3, 'locker, am Ende 6 × 20 s zügig steigern', 'easy'),
    };
    const alt = weekIdx % 2 ? ['tempo', 'interval'] : ['interval', 'tempo'];
    const quality = {
      grundlage: ['strides', n >= 4 && 'tempo'],
      aufbau: [alt[0], n >= 5 && alt[1], n >= 4 && 'strides'],
      spezifisch: [Z?.goal ? 'goal' : 'tempo', n >= 4 && 'interval'],
      erholung: ['strides'],
      taper: ['short'],
    }[phase].filter(Boolean).map(k => Q[k]());
    const flex = quality.filter(q => q.type === 'strides');
    const easyN = Math.max(0, n - 1 - quality.length);
    const fixed = longS.km + quality.filter(q => q.type !== 'strides').reduce((a, q) => a + q.km, 0);
    const slots = easyN + flex.length;
    const each = slots ? r5(clamp((target - fixed) / slots, 3, Math.max(4, longS.km * 0.75))) : 0;
    flex.forEach(q => { q.km = each; });
    const easies = Array.from({ length: easyN }, () => mk('easy', 'Lockerer Lauf', each, 'entspannt – du kannst dich dabei unterhalten', 'easy'));
    while (easies.length || quality.length) {
      if (easies.length) S.push(easies.shift());
      if (quality.length) S.push(quality.shift());
    }
    S.push(longS);
  }
  return { phase, weeksLeft, weekIdx, sessions: S, total: S.reduce((a, s) => a + s.km, 0) };
}

/** Ordnet die Läufe dieser Woche den geplanten Einheiten zu. */
function markDone(sessions, goal) {
  const ws = weekStart(todayISO());
  const runs = db.runs.filter(r => r.date >= ws).sort((a, b) => a.date.localeCompare(b.date) || a.ts - b.ts);
  const done = sessions.map(() => null);
  const isBig = s => s.type === 'long' || s.type === 'race';
  for (const r of runs) {
    let i = sessions.findIndex((s, k) => !done[k] && s.type === 'race' && r.date >= goal.date && r.distance >= s.km * 0.9);
    if (i < 0) i = sessions.findIndex((s, k) => !done[k] && s.type === 'long' && r.distance >= s.km * 0.8);
    if (i < 0) i = sessions.findIndex((s, k) => !done[k] && !isBig(s));
    if (i < 0) i = sessions.findIndex((s, k) => !done[k] && s.type !== 'race');
    if (i >= 0) done[i] = r;
  }
  return { done, km: runs.reduce((a, r) => a + r.distance, 0), count: done.filter(Boolean).length };
}

function goalInsights(goal, fc, Z) {
  const out = [], today = todayISO(), D = goal.distance;
  const weeks = Math.max(1, Math.round((dayNum(goal.date) - dayNum(today)) / 7));
  if (!db.runs.length) {
    out.push(['bulb', 'info', 'Trag deine Läufe ein – ab dem ersten Lauf ab 1 km berechne ich eine Prognose, nach etwa drei Wochen auch deinen Trend.']);
    return out;
  }
  const last = db.runs.reduce((m, r) => (r.date > m ? r.date : m), '');
  const gap = dayNum(today) - dayNum(last);
  if (gap >= 8) out.push(['alert', 'warn', `Dein letzter Lauf ist ${gap} Tage her. Steig mit einem lockeren Lauf wieder ein – Regelmäßigkeit bringt am meisten.`]);
  if (db.runs.filter(r => r.date >= addDays(today, -41)).length < 3) out.push(['bulb', 'info', 'Mit mindestens 3 Läufen in 6 Wochen werden Prognose und Plan deutlich genauer.']);

  if (goal.time && fc.current && goal.date >= today) {
    const need = (fc.current - goal.time) / fc.current;
    const proj = fc.at(goal.date).mid;
    if (fc.current <= goal.time) out.push(['check', 'good', `Deine aktuelle Form reicht schon für ${fmtTime(goal.time)}. Halte sie bis zum Zieltag – oder setz dir ein schnelleres Ziel.`]);
    else if (proj <= goal.time) out.push(['check', 'good', `Bei deinem aktuellen Trend erreichst du ${fmtTime(goal.time)}. Jetzt zählt vor allem Regelmäßigkeit.`]);
    else if (need / weeks > 0.01) {
      const realistic = fc.current * (1 - Math.min(0.08, 0.006 * weeks));
      out.push(['alert', 'warn', `Sehr ambitioniert: ${fmt1(need * 100)} % schneller in ${plural(weeks, 'Woche', 'Wochen')}. Realistisch wären etwa ${fmtTime(realistic)} – oder ein späterer Termin.`]);
    } else out.push(['trend', 'info', `Dir fehlen noch ${fmtTime(fc.current - goal.time)} (${fmt1(need * 100)} %). Mit dem Wochenplan ist das machbar – bleib dran.`]);
  }

  if (Z && !Z.est) {
    const recent = db.runs.filter(r => r.date >= addDays(today, -27) && r.distance >= 1);
    if (recent.length >= 4) {
      const share = recent.filter(r => runPace(r) >= Z.p10 * 1.12).length / recent.length;
      if (share < 0.6) out.push(['bulb', 'info', `Nur ${Math.round(share * 100)} % deiner Läufe der letzten 4 Wochen waren wirklich locker. Ideal sind rund 80 %: Lauf die lockeren Einheiten ruhig langsamer (etwa ${fmtRange(Z.easy)} min/km) – so erholst du dich besser und wirst schneller.`]);
    }
  }

  const longest8 = Math.max(0, ...db.runs.filter(r => r.date >= addDays(today, -55)).map(r => r.distance));
  if (D >= 10 && longest8 < D * 0.6) out.push(['route', 'info', `Dein längster Lauf der letzten 8 Wochen war ${fmt(longest8)} km. Für ${distName(D)} den langen Lauf schrittweise verlängern – etwa 1 km pro Woche.`]);

  const ws = weekStart(today);
  const km = (a, b) => db.runs.filter(r => r.date >= a && r.date <= b).reduce((t, r) => t + r.distance, 0);
  const thisW = km(ws, today), lastW = km(addDays(ws, -7), addDays(ws, -1));
  if (lastW > 0 && thisW > lastW * 1.3 && thisW - lastW > 5) out.push(['alert', 'warn', `Diese Woche schon ${fmt1(thisW)} km – deutlich mehr als letzte Woche (${fmt1(lastW)} km). Steigere den Umfang lieber um höchstens 10 % pro Woche.`]);

  if (!out.length) out.push(['check', 'good', 'Alles im grünen Bereich – folge einfach dem Wochenplan.']);
  return out;
}

function goalResult(goal) {
  const D = goal.distance;
  const c = db.runs.filter(r => r.date >= addDays(goal.date, -3) && r.distance >= D * 0.97 && r.distance <= D * 1.1);
  return c.length ? c.reduce((a, r) => (r.seconds / r.distance < a.seconds / a.distance ? r : a)) : null;
}

/** Diagramm: Formverlauf (umgerechnet auf die Zieldistanz) + Hochrechnung bis zum Zieltag. */
function goalChart(el, fc, goal) {
  const W = Math.max(280, Math.round(el.clientWidth)), H = 240, D = goal.distance;
  const today = todayISO();
  const hist = fc.hist;
  const start = hist[0].iso, end = goal.date > today ? goal.date : today;
  const spanF = dayNum(end) - dayNum(today);
  const samples = Array.from({ length: 21 }, (_, i) => addDays(today, Math.round((spanF * i) / 20))).map(iso => ({ iso, ...fc.at(iso) }));
  const vals = [...hist.map(p => p.value), ...samples.flatMap(s => [s.lo, s.hi])];
  if (goal.time) vals.push(goal.time);
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals), 4, [5, 10, 15, 20, 30, 60, 120, 300, 600, 900, 1800, 3600]);
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const pad = { l: labelWidth(ticks.map(fmtTime)), r: 16, t: 26, b: 26 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const d0 = dayNum(start), d1 = dayNum(end);
  const x = iso => (d1 === d0 ? pad.l + iw / 2 : pad.l + ((dayNum(iso) - d0) / (d1 - d0)) * iw);
  const y = v => pad.t + ((v - yMin) / (yMax - yMin)) * ih; // schneller = weiter oben
  const P = (pts, key) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.iso).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');
  const band = `${P(samples, 'lo')}${[...samples].reverse().map(p => `L${x(p.iso).toFixed(1)},${y(p.hi).toFixed(1)}`).join('')}Z`;
  const last = samples[samples.length - 1];
  const tx = x(today), gx = x(end);
  const labels = [[start, fmtShort(start), 'start'], [today, 'Heute', 'middle'], [end, fmtShort(end), 'end']]
    .filter(([iso], i, arr) => i === 1 || (Math.abs(x(iso) - tx) > 46 && (i !== 0 || iso !== today)));
  const endAnchor = gx > W - pad.r - 30 ? 'end' : 'middle';

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Formverlauf und Prognose für ${esc(distName(D))}">
    <g class="grid">${ticks.map(t => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`).join('')}</g>
    <g>${ticks.map(t => `<text x="${pad.l - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${fmtTime(t)}</text>`).join('')}</g>
    <g>${labels.map(([iso, t, a]) => `<text x="${x(iso).toFixed(1)}" y="${H - 6}" text-anchor="${a}">${esc(t)}</text>`).join('')}</g>
    <line class="today" x1="${tx.toFixed(1)}" x2="${tx.toFixed(1)}" y1="${pad.t - 6}" y2="${pad.t + ih}"/>
    ${spanF > 0 ? `<path class="band" d="${band}"/>` : ''}
    ${goal.time ? `<line class="target" x1="${pad.l}" x2="${W - pad.r}" y1="${y(goal.time).toFixed(1)}" y2="${y(goal.time).toFixed(1)}"/>
      <text class="target-label" x="${pad.l + 4}" y="${(y(goal.time) - 6).toFixed(1)}">Ziel ${fmtTime(goal.time)}</text>` : ''}
    ${spanF > 0 ? `<path class="proj" d="${P(samples, 'mid')}"/>` : ''}
    ${hist.length > 1 ? `<path class="line" d="${P(hist, 'value')}"/>` : ''}
    <circle class="dot last" cx="${x(today).toFixed(1)}" cy="${y(fc.current).toFixed(1)}" r="5"/>
    ${spanF > 0 ? `<circle class="dot pr" cx="${gx.toFixed(1)}" cy="${y(last.mid).toFixed(1)}" r="5"/>
      <text class="end-label" x="${gx.toFixed(1)}" y="${(y(last.mid) - 11).toFixed(1)}" text-anchor="${endAnchor}">${fmtTime(last.mid)}</text>` : ''}
    <line class="cross" y1="${pad.t}" y2="${pad.t + ih}" visibility="hidden"/>
    <circle class="focus" r="6" visibility="hidden"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
  </svg><div class="tip" hidden></div>`;

  const t = makeTip(el), cross = $('.cross', el), focus = $('.focus', el);
  bindPointer(el, ev => {
    const [px] = svgPoint(t.svg, ev, W);
    const iso = addDays(start, Math.round(clamp((px - pad.l) / iw, 0, 1) * (d1 - d0)));
    let cx, cy, html;
    if (iso <= today || spanF === 0) {
      const p = hist.reduce((a, q) => (Math.abs(dayNum(q.iso) - dayNum(iso)) < Math.abs(dayNum(a.iso) - dayNum(iso)) ? q : a));
      cx = x(p.iso); cy = y(p.value);
      html = `<span class="t-d">Form · ${esc(fmtWeekday(p.iso))}</span><b>${fmtTime(p.value)}</b>${esc(distName(D))} · ${fmtPace(p.value / D)} min/km`;
    } else {
      const f = fc.at(iso);
      cx = x(iso); cy = y(f.mid);
      html = `<span class="t-d">Prognose · ${esc(fmtWeekday(iso))}</span><b>${fmtTime(f.mid)}</b>Spanne ${fmtTime(f.lo)} – ${fmtTime(f.hi)}`;
    }
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    focus.setAttribute('cx', cx); focus.setAttribute('cy', cy); focus.setAttribute('visibility', 'visible');
    t.show(cx, cy, html);
  }, () => { t.hide(); cross.setAttribute('visibility', 'hidden'); focus.setAttribute('visibility', 'hidden'); });
}

/** Kompakte Ziel-Karte auf der Laufen-Seite. */
function renderGoalTeaser() {
  const g = db.goal, el = $('#l-goal');
  if (!g) {
    el.innerHTML = `<a class="card goal-teaser empty-goal" href="#/ziel">
      <span class="ri-icon lauf">${ic('target')}</span>
      <span class="ri-main"><b>Setz dir ein Laufziel</b><span>Prognosen und ein Wochenplan, der dich hinführt</span></span>${ic('chev', 'chev')}</a>`;
    return;
  }
  const fc = forecast(g), Z = paceZones(fc.F, g), st = goalStatus(g, fc);
  const past = g.date < todayISO();
  let foot = '';
  if (!past) {
    const plan = weekPlan(g, Z), m = markDone(plan.sessions, g);
    const next = plan.sessions.find((s, i) => !m.done[i]);
    foot = `<div class="gt-foot"><span>Diese Woche <b>${fmt1(m.km)} / ${fmt1(plan.total)} km</b></span><span>${m.count} von ${plan.sessions.length} Einheiten</span></div>
      <div class="progress" role="progressbar" aria-label="Wochenumfang" aria-valuemin="0" aria-valuemax="${plan.total}" aria-valuenow="${Math.round(m.km * 10) / 10}"><i style="width:${clamp((m.km / plan.total) * 100, 0, 100).toFixed(0)}%"></i></div>
      <div class="gt-next">${next
        ? `${ic(SESSION_META[next.type].icon)}<span>Als Nächstes: <b>${esc(next.title)}</b> · ${fmt(next.km)} km${next.pace ? ` · ${esc(next.pace)}` : ''}</span>`
        : `${ic('check')}<span><b>Wochenplan erledigt</b> – stark!</span>`}</div>`;
  }
  el.innerHTML = `<a class="card goal-teaser" href="#/ziel">
    <div class="gt-top">
      <span class="ri-icon lauf">${ic('target')}</span>
      <span class="ri-main"><b>${esc(goalLabel(g))}</b>
        <span class="gt-sub"><span class="status ${st.cls}">${ic(st.icon)}${esc(st.text)}</span><span>${esc(past ? relDay(g.date) : countdown(g))}${fc.current && !past ? ` · Prognose ${fmtTime(fc.at(g.date).mid)}` : ''}</span></span>
      </span>
      ${ic('chev', 'chev')}
    </div>${foot}</a>`;
}

/** Seite „Ziel & Plan“. */
function renderZiel() {
  const g = db.goal;
  const view = $('#view-ziel');
  if (!g || state.goalEdit) {
    setHeader('Laufen', g ? 'Ziel ändern' : 'Laufziel');
    renderGoalForm();
    return;
  }
  setHeader('Laufen', 'Ziel & Plan');
  const today = todayISO(), D = g.distance;
  const fc = forecast(g), Z = paceZones(fc.F, g), st = goalStatus(g, fc);
  const past = g.date < today;
  const proj = fc.current ? fc.at(g.date).mid : null;

  // Hero
  let compare;
  if (past) {
    const res = goalResult(g);
    compare = res
      ? `<div><span>Dein Ergebnis</span><b>${fmtTime(res.seconds)}</b></div><div><span>${g.time ? 'Zielzeit' : 'Distanz'}</span><b>${g.time ? fmtTime(g.time) : esc(distName(D))}</b></div>`
      : `<div class="wide"><span>Zieltermin vorbei</span><b class="sm">Trag deinen Lauf ein oder setz dir ein neues Ziel.</b></div>`;
  } else {
    compare = `<div><span>Aktuelle Form</span><b>${fc.current ? fmtTime(fc.current) : '–'}</b></div>
      <div><span>Prognose am Zieltag</span><b>${proj ? fmtTime(proj) : '–'}</b></div>`;
  }
  const result = past ? goalResult(g) : null;
  const done = result && (!g.time || result.seconds <= g.time + 0.5);
  let html = `<div class="hero lauf-hero">
    <div class="hero-top"><span>Dein Ziel</span><span class="streak">${ic('flag')}${esc(past ? relDay(g.date) : countdown(g))}</span></div>
    <div class="goal-title">${esc(goalLabel(g))}</div>
    <div class="hero-sub">${esc(fmtLong(g.date))}${g.time ? ` · Zieltempo ${fmtPace(g.time / D)} min/km` : ''}</div>
    <div class="goal-compare">${compare}</div>
    <span class="status ${done ? 'good' : st.cls}">${ic(done ? 'trophy' : st.icon)}${done ? 'Ziel erreicht!' : esc(st.text)}</span>
  </div>`;

  // Prognose-Diagramm
  const trendText = !fc.current ? '' : fc.estimated
    ? 'Für einen Trend fehlen noch Läufe aus mindestens 3 Wochen – die Prognose geht von regelmäßigem Training aus.'
    : fc.rate < -0.0005 ? `Dein Trend: etwa ${fmt1(-fc.rate * 100)} % schneller pro Woche. Der Fortschritt flacht mit der Zeit ab.`
    : fc.rate > 0.0005 ? 'Dein Trend zeigt zuletzt leicht nach unten – mehr Regelmäßigkeit hilft.'
    : 'Deine Form ist zuletzt stabil.';
  html += `<div class="card">
    <div class="card-head"><h2>Prognose</h2><span class="aside">${esc(distName(D))}</span></div>
    ${fc.current ? '<div class="chart lauf" id="z-chart"></div>' : '<div class="chart-empty">Trag Läufe ab 1 km ein – dann berechne ich deine Prognose.</div>'}
    ${fc.current ? `<div class="legend"><span><i class="lg"></i>Form</span>${past ? '' : '<span><i class="lg dashed"></i>Prognose</span><span><i class="lg band"></i>Spanne</span>'}${g.time ? '<span><i class="lg target"></i>Ziel</span>' : ''}</div>
    <p class="note">${trendText} Die Form wird aus deinen zwei schnellsten Läufen der letzten 6 Wochen auf ${esc(distName(D))} umgerechnet.</p>` : ''}
  </div>`;

  // Prognosen für Standarddistanzen
  if (fc.current) {
    const dists = [...GOAL_PRESETS];
    if (!isPresetDist(D)) dists.push([D, `${fmt1(D)} km`]);
    dists.sort((a, b) => a[0] - b[0]);
    html += `<div class="section-head"><h2>Das kannst du aktuell laufen</h2></div>
      <div class="card list">${dists.map(([d, name]) => {
        const t = predictTime(fc.F, d), isGoal = Math.abs(d - D) < 0.01;
        return `<div class="row-item${isGoal ? ' hl-row' : ''}">
          <span class="ri-main"><b>${esc(name)}${isGoal ? ' <span class="badge lauf">Ziel</span>' : ''}</b><span>${fmtPace(t / d)} min/km</span></span>
          <span class="ri-value">${fmtTime(t)}</span></div>`;
      }).join('')}</div>`;
  }

  // Wochenplan
  if (!past) {
    const plan = weekPlan(g, Z), m = markDone(plan.sessions, g);
    const [pName, pDesc] = PHASES[plan.phase];
    html += `<div class="section-head"><h2>Empfehlung diese Woche</h2><span class="aside">${plan.weeksLeft > 1 ? `Woche ${plan.weekIdx + 1}` : 'Zielwoche'}</span></div>
      <div class="card plan">
        <div class="phase"><span class="phase-pill">${esc(pName)}</span><span>${esc(pDesc)}</span></div>
        <div class="wp">
          <div class="wp-top"><b>${fmt1(m.km)} / ${fmt1(plan.total)} km</b><span>${m.count} von ${plan.sessions.length} Einheiten</span></div>
          <div class="progress"><i style="width:${clamp((m.km / plan.total) * 100, 0, 100).toFixed(0)}%"></i></div>
        </div>
        <ol class="sessions">${plan.sessions.map((s, i) => {
          const meta = SESSION_META[s.type];
          const r = m.done[i];
          return `<li class="sess${r ? ' done' : ''}">
            <span class="ri-icon lauf">${ic(meta.icon)}</span>
            <span class="ri-main">
              <b>${esc(s.title)}</b>
              <span class="sess-detail">${esc(s.detail)}</span>
              ${s.pace ? `<span class="pace-tag">${esc(s.pace)}</span>` : ''}
              ${r ? `<span class="sess-done">${ic('check')}erledigt · ${fmt(r.distance)} km in ${fmtDur(r.seconds)}</span>` : ''}
            </span>
            <span class="sess-side"><span class="ri-value">${fmt(s.km)} km</span>${intensity(meta.level)}</span>
          </li>`;
        }).join('')}</ol>
        <p class="note">Reihenfolge frei wählbar. Zwischen zwei fordernden Einheiten mindestens ein lockerer Tag oder Ruhetag. Der Plan passt sich jede Woche an deine eingetragenen Läufe an.</p>
      </div>`;
  }

  // Trainingstempos
  if (Z) {
    const zones = [
      ['easy', 'Locker', 'Unterhaltung problemlos möglich', 1],
      ['long', 'Langer Lauf', 'ruhig und lange durchhaltbar', 2],
      ['tempo', 'Tempo', 'angenehm hart, ca. 1 Stunde haltbar', 3],
      ['goal', 'Zieltempo', 'dein Tempo für den Zieltag', 4],
      ['interval', 'Intervalle', 'hart, für 3–5 Minuten', 5],
    ].filter(([k]) => Z[k]);
    html += `<div class="section-head"><h2>Deine Trainingstempos</h2><span class="aside">${Z.est ? 'aus Zielzeit geschätzt' : 'aus aktueller Form'}</span></div>
      <div class="card list">${zones.map(([k, name, desc, lvl]) => `
        <div class="row-item">
          <span class="ri-main wrap"><b>${name}</b><span>${desc}</span></span>
          <span class="sess-side"><span class="ri-value">${Array.isArray(Z[k]) ? fmtRange(Z[k]) : fmtPace(Z[k])} <small>min/km</small></span>${intensity(lvl)}</span>
        </div>`).join('')}</div>`;
  }

  // Hinweise
  const tips = goalInsights(g, fc, Z);
  html += `<div class="section-head"><h2>Hinweise</h2></div>
    <div class="card list">${tips.map(([icon, kind, text]) => `
      <div class="row-item insight"><span class="ri-icon ${kind}">${ic(icon)}</span><span class="insight-text">${esc(text)}</span></div>`).join('')}</div>`;

  html += `<div class="btn-row">
    <button type="button" class="btn btn-soft sm" data-act="goal-edit">${ic('edit')}${past ? 'Neues Ziel' : 'Ziel ändern'}</button>
    <button type="button" class="btn btn-soft sm" data-act="goal-remove">${ic('trash')}Ziel löschen</button>
  </div>
  <p class="foot">Prognosen sind Schätzungen auf Basis deiner Daten (Riegel-Formel) – kein Ersatz für ärztlichen oder Trainer-Rat.</p>`;

  view.innerHTML = html;
  if (fc.current) goalChart($('#z-chart'), fc, g);
}

/** Formular zum Anlegen/Ändern des Ziels. */
function renderGoalForm() {
  const g = db.goal, today = todayISO();
  const draft = state.goalDraft || (state.goalDraft = { distance: g ? g.distance : 10 });
  const preset = isPresetDist(draft.distance);
  const t = g?.time && g.date >= today ? g.time : 0;
  const date = g && g.date > today ? g.date : addDays(today, 84);
  $('#view-ziel').innerHTML = `
    ${g ? '' : `<div class="card intro">${ic('target')}<p>Setz dir ein Ziel – ich berechne, wie schnell du am Zieltag voraussichtlich bist, und schlage dir jede Woche passende Läufe vor.</p></div>`}
    <form class="card goal-form" id="goal-form" novalidate autocomplete="off">
      <div class="form-sec">
        <span class="lbl">Distanz</span>
        <div class="chips wrap">${GOAL_PRESETS.map(([v, n]) => `<button type="button" class="chip lauf${Math.abs(v - draft.distance) < 0.01 ? ' on' : ''}" data-gdist="${v}">${n}</button>`).join('')}
          <button type="button" class="chip lauf${preset ? '' : ' on'}" data-gdist="custom">Eigene</button></div>
        <label class="field-box" id="g-custom-box"${preset ? ' hidden' : ''}>
          <span class="lbl">Eigene Distanz</span>
          <span class="dist-input"><input id="g-dist" type="text" inputmode="decimal" placeholder="0,0" value="${preset ? '' : numIn(draft.distance)}" aria-label="Eigene Distanz in Kilometern"><span>km</span></span>
        </label>
      </div>
      <div class="form-sec">
        <span class="lbl">Zielzeit <small>· optional</small></span>
        <div class="field-box"><div class="time-row">
          <label><input id="g-h" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" placeholder="0" value="${t ? Math.floor(t / 3600) : ''}" aria-label="Stunden"><span>h</span></label>
          <label><input id="g-m" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" placeholder="00" value="${t ? Math.floor((t % 3600) / 60) : ''}" aria-label="Minuten"><span>min</span></label>
          <label><input id="g-s" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" placeholder="00" value="${t ? Math.round(t % 60) : ''}" aria-label="Sekunden"><span>s</span></label>
        </div></div>
        <p class="hint-line" id="g-hint"></p>
      </div>
      <div class="form-sec">
        <span class="lbl">Zieldatum</span>
        <label class="field-box date-box">${ic('cal')}<input type="date" id="g-date" min="${addDays(today, 1)}" value="${date}" aria-label="Zieldatum"></label>
        <div class="chips wrap">${[8, 12, 16, 24].map(w => `<button type="button" class="chip small" data-gweeks="${w}">in ${w} Wochen</button>`).join('')}</div>
      </div>
      <div class="btn-row${g ? '' : ' single'}">
        ${g ? '<button type="button" class="btn btn-soft sm" data-act="goal-cancel">Abbrechen</button>' : ''}
        <button type="submit" class="btn btn-lauf sm">${ic('check')}Ziel speichern</button>
      </div>
    </form>`;
  updateGoalHint();
}

function readGoalDistance() {
  const box = $('#g-custom-box');
  return box && !box.hidden ? parseNum($('#g-dist').value) : state.goalDraft?.distance;
}
function updateGoalHint() {
  const el = $('#g-hint');
  if (!el) return;
  const D = readGoalDistance(), today = todayISO();
  const dateV = $('#g-date').value > today ? $('#g-date').value : addDays(today, 84);
  const fc = D > 0 ? forecast({ distance: D, date: dateV }) : { current: fitnessAt(today, 180) };
  if (!(D > 0) || !fc.current) {
    el.innerHTML = fc.current ? '' : 'Leer lassen, wenn du die Distanz einfach schaffen willst. Mit eingetragenen Läufen schlage ich dir eine passende Zeit vor.';
    return;
  }
  const proj = Math.min(fc.current, fc.at(dateV).mid);
  const roundTo = proj > 3600 ? 60 : 15;
  const suggest = Math.ceil(proj / roundTo) * roundTo;
  el.innerHTML = `Aktuell möglich: <b>${fmtTime(fc.current)}</b> · Prognose zum Termin: <b>${fmtTime(proj)}</b> · Vorschlag: <b>${fmtTime(suggest)}</b>
    <button type="button" class="link" data-act="goal-suggest" data-sec="${suggest}">übernehmen</button>`;
}

function saveGoal() {
  const today = todayISO();
  const distance = readGoalDistance();
  const time = (parseInt($('#g-h').value, 10) || 0) * 3600 + (parseInt($('#g-m').value, 10) || 0) * 60 + (parseInt($('#g-s').value, 10) || 0);
  const date = $('#g-date').value;
  if (!(distance > 0) || distance > 300) { toast('Bitte eine gültige Distanz angeben.'); return; }
  if (!date || date <= today) { toast('Das Zieldatum muss in der Zukunft liegen.'); return; }
  const old = db.goal;
  const keepCreated = old && old.date >= today && Math.abs(old.distance - distance) < 0.01;
  db.goal = { distance, time: time > 0 ? time : null, date, created: keepCreated ? old.created : today };
  save();
  state.goalEdit = false; state.goalDraft = null;
  renderZiel();
  window.scrollTo(0, 0);
  toast('Ziel gespeichert – los geht’s!', null, 'flag');
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
  const t = e.target.closest('[data-seg],[data-step],[data-day],[data-train],[data-go],[data-ex],[data-new-ex],[data-del-set],[data-del-run],[data-rename],[data-del-ex],[data-act],[data-more],[data-gdist],[data-gweeks]');
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
  } else if (d.gdist) {
    const custom = d.gdist === 'custom';
    $$('[data-gdist]').forEach(b => b.classList.toggle('on', b === t));
    $('#g-custom-box').hidden = !custom;
    if (custom) $('#g-dist').focus(); else state.goalDraft.distance = +d.gdist;
    updateGoalHint();
  } else if (d.gweeks) {
    $('#g-date').value = addDays(todayISO(), 7 * +d.gweeks);
    updateGoalHint();
  } else if (d.act === 'goal-suggest') {
    const sec = +d.sec;
    $('#g-h').value = sec >= 3600 ? Math.floor(sec / 3600) : '';
    $('#g-m').value = Math.floor((sec % 3600) / 60);
    $('#g-s').value = pad2(sec % 60);
  } else if (d.act === 'goal-edit') {
    state.goalEdit = true; state.goalDraft = null; renderZiel(); window.scrollTo(0, 0);
  } else if (d.act === 'goal-cancel') {
    state.goalEdit = false; state.goalDraft = null; renderZiel(); window.scrollTo(0, 0);
  } else if (d.act === 'goal-remove') {
    if (!confirm('Laufziel und Wochenplan entfernen? Deine Läufe bleiben erhalten.')) return;
    db.goal = null; save(); go('laufen');
  } else if (d.act === 'export') {
    exportData();
  } else if (d.more) {
    state[d.more] += d.more === 'runsShown' ? 20 : 40;
    render();
  }
});

document.addEventListener('submit', e => {
  if (e.target.id === 'goal-form') { e.preventDefault(); saveGoal(); return; }
  if (e.target.id !== 'ex-form') return;
  e.preventDefault();
  const ex = addExercise($('#ex-name').value);
  if (ex) { renderSettings(); toast(`„${ex.name}“ hinzugefügt`, null, 'check'); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'g-dist' || e.target.id === 'g-date') updateGoalHint();
});
document.addEventListener('change', e => {
  if (e.target.id === 'g-date') updateGoalHint();
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
