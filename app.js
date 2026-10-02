'use strict';
/* LiftOS — single-user workout memory system. All data stays on this device (localStorage). */
const KEY = 'liftos.v1';
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayIso = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const fmtDate = s => new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtLong = s => new Date(s + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const xk = n => String(n).trim().toLowerCase();
const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const r1 = n => Math.round(n * 10) / 10;
const cmpD = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/* ---------- storage ---------- */
function load() {
  try { const r = JSON.parse(localStorage.getItem(KEY)); if (r && r.programs) return r; } catch (e) {}
  return { programs: [], activeProgramId: null, sessions: [], draft: null, bodyweight: [], calories: [], goals: [], unit: 'lbs' };
}
let db = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(db));

/* ---------- derived data ---------- */
const done = () => db.sessions.filter(s => s.completed).sort(cmpD);
const top = sets => sets.reduce((m, x) => Math.max(m, x.weight), 0);
const prog = () => db.programs.find(p => p.id === db.activeProgramId) || null;

function history(name) { // newest first
  const k = xk(name);
  return done().map(s => ({ date: s.date, sets: s.logs[k] || [] })).filter(h => h.sets.length).reverse();
}
const best = name => history(name).reduce((m, h) => Math.max(m, top(h.sets)), 0);

function allExercises() {
  const m = {};
  done().forEach(s => Object.keys(s.logs).forEach(k => { m[k] = (s.names && s.names[k]) || k; }));
  return Object.keys(m).map(k => m[k]);
}

function countPRs(from, to) {
  const bestBy = {}; let n = 0;
  done().forEach(s => Object.keys(s.logs).forEach(k => {
    const t = top(s.logs[k]);
    if (s.date >= from && s.date <= to && bestBy[k] !== undefined && t > bestBy[k]) n++;
    bestBy[k] = Math.max(bestBy[k] || 0, t);
  }));
  return n;
}

function nextDay(p) {
  const last = done().filter(s => s.programId === p.id).pop();
  let i = 0;
  if (last) { const j = p.days.findIndex(d => d.id === last.dayId); i = (j + 1) % p.days.length; }
  return p.days[i];
}

function compliance(p) {
  const ss = done().filter(s => s.programId === p.id);
  if (!ss.length || !p.days.length) return null;
  const start = p.startDate || ss[0].date;
  const planned = Math.max(ss.length, Math.round(diffDays(start, todayIso()) / 7 * p.days.length));
  return Math.round(ss.length / planned * 100);
}

const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

/* ---------- parsing coach text ---------- */
function parseLines(text) {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    let sets = 3, reps = '10', name = l, notes = '', m;
    m = l.match(/^(.*?)[\s:\-–—]+(\d+)\s*[xX×]\s*(\d+(?:\s*-\s*\d+)?)\s*(.*)$/);
    if (m) { name = m[1]; sets = +m[2]; reps = m[3].replace(/\s/g, ''); notes = m[4]; }
    else {
      m = l.match(/^(.*?)[\s:\-–—]+(\d+(?:\s*[\/,]\s*\d+)+)\s*(.*)$/);
      if (m) { name = m[1]; const a = m[2].split(/[\/,]/).map(s => s.trim()); sets = a.length; reps = a.join('/'); notes = m[3]; }
    }
    name = name.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim() || l;
    return { id: uid(), name, sets, reps, notes: notes.trim() };
  });
}

/* ---------- charts ---------- */
function chart(pts, h) {
  h = h || 90;
  if (pts.length < 2) return '<p class="mute small">Log at least two entries to see a trend.</p>';
  const W = 320, P = 6, t0 = pts[0].d, span = Math.max(1, diffDays(t0, pts[pts.length - 1].d));
  const vs = pts.map(p => p.v), mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs), rg = (mx - mn) || 1;
  const xy = p => [P + (W - 2 * P) * diffDays(t0, p.d) / span, h - P - (h - 2 * P) * (p.v - mn) / rg];
  const line = pts.map(p => xy(p).map(n => n.toFixed(1)).join(',')).join(' ');
  const l = xy(pts[pts.length - 1]);
  return '<svg viewBox="0 0 ' + W + ' ' + h + '" class="chart" role="img" aria-label="Trend chart"><polyline points="' + line +
    '" fill="none" stroke="#D4FF3A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="' + l[0].toFixed(1) +
    '" cy="' + l[1].toFixed(1) + '" r="4" fill="#D4FF3A"/></svg><div class="row small mute"><span>' + fmtDate(t0) + ' · ' + r1(vs[0]) +
    '</span><span>' + fmtDate(pts[pts.length - 1].d) + ' · ' + r1(vs[vs.length - 1]) + '</span></div>';
}

/* ---------- navigation ---------- */
let route = { tab: 'home' };
function go(r) { route = r; render(); window.scrollTo(0, 0); }
const tabOf = () => ({ home: 'home', workout: 'home', programs: 'programs', program: 'programs', progress: 'progress', exercise: 'progress', reports: 'reports' }[route.tab]);
function render() {
  const views = { home: vHome, programs: vPrograms, program: vProgram, progress: vProgress, reports: vReports, workout: vWorkout, exercise: vExercise };
  let html;
  try { html = (views[route.tab] || vHome)(); } catch (e) { html = '<div class="card"><h3>Something went wrong</h3><p class="mute small">' + esc(e.message) + '</p></div>'; }
  $('#app').innerHTML = html;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tabOf()));
}
const backBtn = () => '<button class="link" data-act="back">‹ Back</button>';

/* ---------- views ---------- */
function vHome() {
  const p = prog();
  const bw = [...db.bodyweight].sort(cmpD);
  let h = '<header class="top"><h1>Lift<span class="lime">OS</span></h1><span class="mute small">' + fmtLong(todayIso()) + '</span></header>';

  if (!p || !p.days.length) {
    h += '<section class="card"><h3>Start here</h3><p class="mute">' + (p ? 'Add a workout day to ' + esc(p.name) + '.' : 'Create a program, then paste in the workouts your coach texts you.') +
      '</p><button class="btn" data-act="go" data-to="' + (p ? 'program' : 'programs') + '" data-id="' + (p ? p.id : '') + '">' + (p ? 'Open program' : 'Create a program') + '</button>' +
      (!db.programs.length && !db.sessions.length ? '<button class="btn dim" data-act="demo">Load sample data</button>' : '') + '</section>';
  } else {
    const day = (route.dayId && p.days.find(d => d.id === route.dayId)) || nextDay(p);
    const resume = db.draft && db.draft.programId === p.id;
    const shown = resume ? { id: db.draft.dayId, name: db.draft.dayName, exercises: db.draft.exercises } : day;
    h += '<section class="card hero"><h2>' + (resume ? 'Workout in progress' : "Today's workout") + '</h2><div class="big">' + esc(shown.name) + '</div><div class="small" style="margin-top:6px">' +
      esc(p.name) + ' · ' + shown.exercises.length + ' exercises</div>' +
      (resume ? '<button class="btn" data-act="go" data-to="workout">Resume workout</button>' :
        '<button class="btn" data-act="start" data-day="' + day.id + '">Start workout</button>' +
        (p.days.length > 1 ? '<label style="color:var(--bg)">Different day?</label><select data-act="pickday" aria-label="Choose workout day">' +
          p.days.map(d => '<option value="' + d.id + '"' + (d.id === day.id ? ' selected' : '') + '>' + esc(d.name) + '</option>').join('') + '</select>' : '')) + '</section>';
  }

  // bodyweight
  h += '<section class="card"><div class="row"><h2>Bodyweight</h2>' + (bw.length > 1 ? '<span class="lime small">' + (bw[bw.length - 1].weight - bw[0].weight >= 0 ? '+' : '') + r1(bw[bw.length - 1].weight - bw[0].weight) + ' ' + db.unit + '</span>' : '') + '</div>';
  if (bw.length) {
    h += '<div class="row"><span class="mute small">Started <b style="color:var(--text);font-size:18px">' + r1(bw[0].weight) + '</b></span><span class="mute small">Now <b style="color:var(--text);font-size:28px">' + r1(bw[bw.length - 1].weight) + '</b></span></div>' +
      chart(bw.map(b => ({ d: b.date, v: b.weight })), 70);
  } else h += '<p class="mute small">No weigh-ins yet.</p>';
  h += '<form class="inline" data-form="bw"><input name="weight" inputmode="decimal" placeholder="Weight (' + db.unit + ')" required aria-label="Bodyweight"><button class="btn sm">Log</button></form></section>';

  // stats
  const comp = p ? compliance(p) : null;
  h += '<div class="cols"><section class="card"><h2>Workouts</h2><div class="num">' + done().length + '</div></section><section class="card"><h2>Compliance</h2><div class="num">' + (comp == null ? '—' : comp + '%') + '</div></section></div>';

  // goals
  if (db.goals.length) {
    h += '<section class="card"><h2>Goals</h2>' + db.goals.slice(0, 3).map(g => {
      const cur = best(g.exercise), pct = Math.min(100, Math.round(cur / g.target * 100));
      return '<div style="margin-bottom:12px"><div class="row small"><span>' + esc(g.exercise) + '</span><span class="mute">' + cur + ' / ' + g.target + '</span></div><div class="bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></div><div class="small mute" style="margin-top:4px">' + pct + '% there' + (cur < g.target ? ', ' + (g.target - cur) + ' ' + db.unit + ' to go' : ' — goal reached') + '</div></div>';
    }).join('') + '</section>';
  }

  // calories
  const td = db.calories.find(c => c.date === todayIso());
  const wk = db.calories.filter(c => c.date > addDays(todayIso(), -7)).map(c => c.calories);
  h += '<section class="card"><div class="row"><h2>Calories</h2><span class="mute small">' + (wk.length ? '7-day avg ' + Math.round(avg(wk)) : '') + '</span></div>' +
    (td ? '<div class="num">' + td.calories + '</div><div class="mute small">logged today</div>' : '<p class="mute small">Nothing logged today.</p>') +
    '<form class="inline" data-form="cal"><input name="calories" inputmode="numeric" placeholder="Calories today" required aria-label="Calories"><button class="btn sm">Log</button></form></section>';

  h += '<button class="btn ghost" data-act="go" data-to="reports">Generate coach report</button>';
  return h;
}

function vWorkout() {
  const D = db.draft;
  if (!D) return '<div class="card"><p>No workout in progress.</p><button class="btn" data-act="go" data-to="home">Back to Today</button></div>';
  let h = '<header class="top"><div>' + backBtn() + '</div><span class="mute small">' + esc(D.dayName) + '</span></header>';
  D.exercises.forEach(ex => {
    const k = xk(ex.name), hs = history(ex.name), last = hs[0] ? hs[0].sets : [], prev = hs[1] ? hs[1].sets : [];
    const cur = D.logs[k] || [], rows = Math.max(ex.sets, cur.length);
    const delta = hs[0] && hs[1] ? top(last) - top(prev) : null;
    h += '<section class="card"><div class="row"><button class="link" data-act="go" data-to="exercise" data-name="' + esc(ex.name) + '" style="font-size:19px;color:var(--text)">' + esc(ex.name) + '</button>' +
      (delta != null ? '<span class="lime small">' + (delta >= 0 ? '+' : '') + delta + ' ' + db.unit + ' last time</span>' : '') + '</div>' +
      '<div class="small mute">Target ' + ex.sets + ' sets · ' + esc(ex.reps) + ' reps' + (ex.notes ? ' · ' + esc(ex.notes) : '') + '</div>';
    for (let i = 0; i < rows; i++) {
      const c = cur[i] || {};
      h += '<div class="set"><b>' + (i + 1) + '</b><span class="mute small">' + (last[i] ? last[i].reps + ' × ' + last[i].weight : (i === 0 ? 'No history' : '')) + '</span>' +
        '<input inputmode="decimal" aria-label="' + esc(ex.name) + ' set ' + (i + 1) + ' weight" data-ex="' + esc(k) + '" data-i="' + i + '" data-f="weight" placeholder="' + (last[i] ? last[i].weight : db.unit) + '" value="' + (c.weight == null ? '' : c.weight) + '">' +
        '<input inputmode="numeric" aria-label="' + esc(ex.name) + ' set ' + (i + 1) + ' reps" data-ex="' + esc(k) + '" data-i="' + i + '" data-f="reps" placeholder="' + (last[i] ? last[i].reps : 'reps') + '" value="' + (c.reps == null ? '' : c.reps) + '"></div>';
    }
    h += '<div class="row" style="margin-top:8px">' + (last.length ? '<button class="link" data-act="fill" data-k="' + esc(k) + '">Copy last time</button>' : '<span></span>') + '<button class="link" data-act="addset" data-k="' + esc(k) + '">+ Set</button></div></section>';
  });
  h += '<section class="card"><h2>How did it feel?</h2><div class="chips">' +
    ['Low energy', 'Food cravings', 'Dizziness', 'Excellent workout'].map(t => '<button class="chip" data-act="chip" data-t="' + t + '">' + t + '</button>').join('') +
    '</div><label for="wnotes">Notes</label><textarea id="wnotes" data-f="notes" placeholder="Anything your coach should know">' + esc(D.notes) + '</textarea></section>' +
    '<button class="btn" data-act="finish">Finish workout</button><button class="btn danger" data-act="discard">Discard workout</button>';
  return h;
}

function vExercise() {
  const name = route.name, hs = history(name);
  let h = '<header class="top">' + backBtn() + '</header><h1 style="margin-bottom:12px">' + esc(name) + '</h1>';
  if (!hs.length) return h + '<div class="card"><p class="mute">No completed sessions yet. Your history will show up here after your first workout.</p></div>';
  const d = hs[1] ? top(hs[0].sets) - top(hs[1].sets) : null;
  h += '<section class="card"><div class="row"><h2>Top weight</h2><span class="lime small">Best ' + best(name) + ' ' + db.unit + '</span></div>' +
    chart(hs.slice().reverse().map(x => ({ d: x.date, v: top(x.sets) })), 90) + '</section>';
  h += '<section class="card"><h2>Sessions</h2>' + hs.map((x, i) =>
    '<div class="item"><div><b>' + fmtLong(x.date) + '</b>' + (i === 0 ? '<span class="tag">LAST</span>' : '') + '<div class="mute small">' + x.sets.map(s => s.reps + ' × ' + s.weight).join(' · ') + '</div></div>' +
    (i === 0 && d != null ? '<span class="lime">' + (d >= 0 ? '+' : '') + d + '</span>' : '') + '</div>').join('') + '</section>';
  return h;
}

function vPrograms() {
  let h = '<header class="top"><h1>Programs</h1></header>';
  h += db.programs.length ? db.programs.map(p => '<section class="card"><div class="row"><div><h3>' + esc(p.name) + (p.id === db.activeProgramId ? '<span class="tag">ACTIVE</span>' : '') + '</h3><div class="mute small">' +
    esc(p.goal || '') + (p.startDate ? ' · ' + fmtDate(p.startDate) + (p.endDate ? ' – ' + fmtDate(p.endDate) : '') : '') + ' · ' + p.days.length + ' days</div></div></div>' +
    '<div class="cols"><button class="btn dim" data-act="go" data-to="program" data-id="' + p.id + '">Open</button>' + (p.id !== db.activeProgramId ? '<button class="btn" data-act="setactive" data-id="' + p.id + '">Make active</button>' : '') + '</div></section>').join('')
    : '<div class="card"><p class="mute">No programs yet. A program is a 4–8 week block from your coach, like "Fall Recomposition".</p></div>';
  h += '<section class="card"><h3>New program</h3><form data-form="newprog"><label>Name</label><input name="name" required placeholder="Mass Gain Block A"><label>Goal (optional)</label><input name="goal" placeholder="Add muscle, stay lean">' +
    '<div class="cols"><div><label>Start</label><input type="date" name="start" value="' + todayIso() + '"></div><div><label>End</label><input type="date" name="end" value="' + addDays(todayIso(), 56) + '"></div></div><button class="btn">Create program</button></form></section>';
  return h;
}

function vProgram() {
  const p = db.programs.find(x => x.id === route.id);
  if (!p) return backBtn() + '<p class="mute">Program not found.</p>';
  let h = '<header class="top">' + backBtn() + (p.id === db.activeProgramId ? '<span class="tag">ACTIVE</span>' : '') + '</header><h1>' + esc(p.name) + '</h1><p class="mute small">' + esc(p.goal || '') + '</p>';
  p.days.forEach(d => {
    h += '<section class="card"><div class="row"><h3>' + esc(d.name) + '</h3><button class="x" aria-label="Delete day" data-act="delday" data-id="' + p.id + '" data-day="' + d.id + '">×</button></div>' +
      d.exercises.map(e => '<div class="item"><div>' + esc(e.name) + '<div class="mute small">' + e.sets + ' sets · ' + esc(e.reps) + ' reps' + (e.notes ? ' · ' + esc(e.notes) : '') + '</div></div>' +
        '<button class="x" aria-label="Remove exercise" data-act="delex" data-id="' + p.id + '" data-day="' + d.id + '" data-ex="' + e.id + '">×</button></div>').join('') +
      '<form data-form="addex" data-id="' + p.id + '" data-day="' + d.id + '"><label>Add exercises (one per line, e.g. "Hack Squat 4x10" or "Incline Press 12/12/10/10")</label><textarea name="text" required></textarea><button class="btn dim">Add to ' + esc(d.name) + '</button></form></section>';
  });
  h += '<section class="card"><h3>Add a workout day</h3><form data-form="newday" data-id="' + p.id + '"><label>Day name</label><input name="name" required placeholder="Chest / Biceps"><label>Paste your coach\'s workout</label><textarea name="text" placeholder="Incline Smith Machine 12/12/10/10&#10;Cable Fly 3x12&#10;EZ Bar Curl 3x10"></textarea><button class="btn">Add day</button></form></section>';
  h += '<div class="gap">' + (p.id !== db.activeProgramId ? '<button class="btn" data-act="setactive" data-id="' + p.id + '">Make active</button>' : '') +
    '<button class="btn dim" data-act="dupprog" data-id="' + p.id + '">Duplicate as new version</button><button class="btn danger" data-act="delprog" data-id="' + p.id + '">Delete program</button></div>';
  return h;
}

function vProgress() {
  const bw = [...db.bodyweight].sort(cmpD), t = todayIso();
  let h = '<header class="top"><h1>Progress</h1></header><section class="card"><h2>Bodyweight</h2>';
  if (bw.length) {
    const a = avg(bw.filter(b => b.date > addDays(t, -7)).map(b => b.weight)), b = avg(bw.filter(x => x.date <= addDays(t, -7) && x.date > addDays(t, -14)).map(x => x.weight));
    h += '<div class="row"><div><div class="num">' + r1(bw[bw.length - 1].weight) + '</div><div class="mute small">latest</div></div><div style="text-align:right"><div>' + (a ? r1(a) : '—') + ' <span class="mute small">7-day avg</span></div>' +
      (a && b ? '<div class="lime small">' + (a - b >= 0 ? '+' : '') + r1(a - b) + ' vs week before</div>' : '') + '</div></div>' + chart(bw.map(x => ({ d: x.date, v: x.weight })), 100) +
      '<div style="margin-top:8px">' + bw.slice(-5).reverse().map(x => '<div class="row small" style="padding:4px 0"><span class="mute">' + fmtLong(x.date) + '</span><span>' + r1(x.weight) + ' ' + db.unit + '</span></div>').join('') + '</div>';
  } else h += '<p class="mute small">Log your weight from the Today tab.</p>';
  h += '</section>';

  const cs = db.calories.filter(c => c.date > addDays(t, -7)).map(c => c.calories);
  h += '<section class="card"><h2>Calories, last 7 days</h2>' + (cs.length ? '<div class="num">' + Math.round(avg(cs)) + '</div><div class="mute small">daily average over ' + cs.length + ' logged days</div>' : '<p class="mute small">No calories logged this week.</p>') + '</section>';

  const ex = allExercises();
  h += '<section class="card"><h2>Strength</h2>' + (ex.length ? ex.map(n => {
    const hs = history(n), a = top(hs[hs.length - 1].sets), z = top(hs[0].sets), d = z - a;
    return '<div class="item"><button class="link" data-act="go" data-to="exercise" data-name="' + esc(n) + '" style="color:var(--text)">' + esc(n) + '</button><span class="small"><span class="mute">' + a + ' → ' + z + '</span> <b class="' + (d > 0 ? 'lime' : 'mute') + '">' + (d >= 0 ? '+' : '') + d + '</b></span></div>';
  }).join('') : '<p class="mute small">Finish a workout to see strength trends.</p>') + '</section>';

  h += '<section class="card"><h2>Goals</h2>' + db.goals.map(g => {
    const cur = best(g.exercise), pct = Math.min(100, Math.round(cur / g.target * 100));
    return '<div style="margin-bottom:12px"><div class="row small"><span>' + esc(g.exercise) + '</span><span class="mute">' + cur + ' / ' + g.target + '</span><button class="x" style="min-width:32px;min-height:32px" aria-label="Delete goal" data-act="delgoal" data-id="' + g.id + '">×</button></div><div class="bar"><i style="width:' + pct + '%"></i></div></div>';
  }).join('') + '<form data-form="goal"><label>Exercise</label><input name="ex" list="exlist" required placeholder="Bench Press"><datalist id="exlist">' + ex.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist><label>Target weight (' + db.unit + ')</label><input name="target" inputmode="decimal" required placeholder="225"><button class="btn dim">Add goal</button></form></section>';
  return h;
}

function buildReport(from, to) {
  const p = prog(), ss = done().filter(s => s.date >= from && s.date <= to);
  const per = Math.max(ss.length, Math.round(diffDays(from, to) / 7 * (p ? p.days.length : ss.length)));
  const L = ['Training Report', '', 'Period: ' + fmtDate(from) + ' - ' + fmtDate(to), '', 'Workouts: ' + ss.length + ' / ' + per, 'Compliance: ' + (per ? Math.round(ss.length / per * 100) : 0) + '%'];
  const bw = db.bodyweight.filter(b => b.date >= from && b.date <= to).sort(cmpD);
  if (bw.length) L.push('', 'Bodyweight: ' + r1(bw[0].weight) + ' -> ' + r1(bw[bw.length - 1].weight));
  const cs = db.calories.filter(c => c.date >= from && c.date <= to).map(c => c.calories);
  if (cs.length) L.push('Avg calories: ' + Math.round(avg(cs)));
  const names = {}, first = {}, lastT = {};
  ss.forEach(s => Object.keys(s.logs).forEach(k => { names[k] = (s.names && s.names[k]) || k; const t = top(s.logs[k]); if (first[k] === undefined) first[k] = t; lastT[k] = t; }));
  const ks = Object.keys(names).sort((a, b) => (lastT[b] - first[b]) - (lastT[a] - first[a])).slice(0, 8);
  if (ks.length) { L.push('', 'Exercises (top weight):'); ks.forEach(k => L.push('  ' + names[k] + ': ' + first[k] + ' -> ' + lastT[k])); }
  L.push('', 'PRs: ' + countPRs(from, to));
  const nn = ss.filter(s => s.notes && s.notes.trim());
  if (nn.length) { L.push('', 'Notes:'); nn.forEach(s => L.push('  ' + fmtDate(s.date) + ': ' + s.notes.trim().replace(/\s+/g, ' '))); }
  return L.join('\n');
}

function vReports() {
  const to = route.to || todayIso(), from = route.from || addDays(to, -30);
  return '<header class="top"><h1>Reports</h1></header><section class="card"><h2>Coach report</h2><form class="inline" data-form="report" style="align-items:flex-end"><div style="flex:1"><label>From</label><input type="date" name="from" value="' + from + '"></div><div style="flex:1"><label>To</label><input type="date" name="to" value="' + to + '"></div><button class="btn sm">Update</button></form>' +
    '<pre class="report" id="report">' + esc(buildReport(from, to)) + '</pre>' +
    '<div class="cols" style="margin-top:10px"><button class="btn" data-act="share">Share text</button><button class="btn dim" data-act="copy">Copy</button></div>' +
    '<div class="cols"><button class="btn dim" data-act="png">Share image</button><button class="btn dim" data-act="pdf">Save as PDF</button></div></section>' +
    '<section class="card"><h2>Your data</h2><p class="small mute">Everything lives on this phone. Export a backup now and then, especially before deleting the app or clearing Safari data.</p>' +
    '<button class="btn dim" data-act="export">Export backup</button><label class="btn dim" for="imp" style="margin-top:10px">Import backup</label><input type="file" id="imp" accept="application/json,.json" style="display:none">' +
    '<label for="unit">Units</label><select id="unit" data-act="unit"><option' + (db.unit === 'lbs' ? ' selected' : '') + '>lbs</option><option' + (db.unit === 'kg' ? ' selected' : '') + '>kg</option></select>' +
    '<button class="btn danger" data-act="erase">Erase all data</button></section>';
}

/* ---------- actions ---------- */
const ACT = {
  go: d => go({ tab: d.to, id: d.id, name: d.name, back: route }),
  back: () => go(route.back || { tab: 'home' }),
  start: d => {
    const p = prog(), day = p && p.days.find(x => x.id === d.day); if (!day) return;
    db.draft = { id: uid(), programId: p.id, dayId: day.id, dayName: day.name, date: todayIso(), notes: '', logs: {}, exercises: day.exercises.map(x => Object.assign({}, x)) };
    save(); go({ tab: 'workout' });
  },
  pickday: (d, t) => { route.dayId = t.value; render(); },
  fill: d => { const ex = db.draft.exercises.find(x => xk(x.name) === d.k), h = history(ex.name)[0]; if (!h) return; db.draft.logs[d.k] = h.sets.map(s => ({ weight: s.weight, reps: s.reps })); save(); render(); },
  addset: d => { const ex = db.draft.exercises.find(x => xk(x.name) === d.k), L = db.draft.logs[d.k] = db.draft.logs[d.k] || []; while (L.length < ex.sets) L.push({ weight: null, reps: null }); L.push({ weight: null, reps: null }); save(); render(); },
  chip: d => { const n = db.draft.notes.trim(); db.draft.notes = n ? n + ', ' + d.t : d.t; save(); render(); },
  finish: () => {
    const D = db.draft; if (!D) return;
    const names = {}, logs = {}; let n = 0;
    D.exercises.forEach(x => { names[xk(x.name)] = x.name; });
    Object.keys(D.logs).forEach(k => { const s = D.logs[k].filter(x => x && x.reps != null).map(x => ({ weight: x.weight == null ? 0 : x.weight, reps: x.reps })); if (s.length) { logs[k] = s; n++; } });
    if (!n) { alert('Log at least one set first.'); return; }
    db.sessions.push({ id: D.id, programId: D.programId, dayId: D.dayId, dayName: D.dayName, date: D.date, notes: D.notes, completed: true, logs, names });
    db.draft = null; save(); go({ tab: 'home' });
  },
  discard: () => { if (confirm('Discard this workout? Nothing will be saved.')) { db.draft = null; save(); go({ tab: 'home' }); } },
  setactive: d => { db.activeProgramId = d.id; save(); render(); },
  dupprog: d => {
    const p = db.programs.find(x => x.id === d.id), c = JSON.parse(JSON.stringify(p)); c.id = uid(); c.name = p.name + ' (v2)'; c.startDate = todayIso();
    c.days.forEach(x => { x.id = uid(); x.exercises.forEach(e => { e.id = uid(); }); }); db.programs.push(c); save(); go({ tab: 'program', id: c.id });
  },
  delprog: d => { if (confirm('Delete this program? Past workout sessions are kept.')) { db.programs = db.programs.filter(x => x.id !== d.id); if (db.activeProgramId === d.id) db.activeProgramId = db.programs[0] ? db.programs[0].id : null; save(); go({ tab: 'programs' }); } },
  delday: d => { if (confirm('Delete this day?')) { const p = db.programs.find(x => x.id === d.id); p.days = p.days.filter(x => x.id !== d.day); save(); render(); } },
  delex: d => { const day = db.programs.find(x => x.id === d.id).days.find(x => x.id === d.day); day.exercises = day.exercises.filter(x => x.id !== d.ex); save(); render(); },
  delgoal: d => { db.goals = db.goals.filter(g => g.id !== d.id); save(); render(); },
  copy: () => { const t = $('#report').textContent; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => alert('Copied.'), () => alert('Press and hold the report text to copy it.')); },
  share: () => { const t = $('#report').textContent; if (navigator.share) navigator.share({ text: t }).catch(() => {}); else ACT.copy(); },
  pdf: () => window.print(),
  png: () => reportPng($('#report').textContent),
  export: () => {
    const f = new File([JSON.stringify(db, null, 1)], 'liftos-backup-' + todayIso() + '.json', { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f] }).catch(() => {});
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); }
  },
  unit: (d, t) => { db.unit = t.value; save(); render(); },
  erase: () => { if (confirm('Erase ALL LiftOS data on this device? This cannot be undone.') && confirm('Really erase everything?')) { localStorage.removeItem(KEY); db = load(); go({ tab: 'home' }); } },
  demo: () => { seedDemo(); go({ tab: 'home' }); }
};

const FORMS = {
  bw: f => { const w = num(f.get('weight')); if (w == null) return; db.bodyweight = db.bodyweight.filter(b => b.date !== todayIso()); db.bodyweight.push({ date: todayIso(), weight: w }); },
  cal: f => { const c = num(f.get('calories')); if (c == null) return; db.calories = db.calories.filter(x => x.date !== todayIso()); db.calories.push({ date: todayIso(), calories: Math.round(c) }); },
  goal: f => { const t = num(f.get('target')); if (t == null) return; db.goals.push({ id: uid(), exercise: f.get('ex').trim(), target: t }); },
  newprog: f => {
    const p = { id: uid(), name: f.get('name').trim(), goal: f.get('goal').trim(), startDate: f.get('start'), endDate: f.get('end'), days: [] };
    db.programs.push(p); if (!db.activeProgramId) db.activeProgramId = p.id; save(); go({ tab: 'program', id: p.id }); return 'nav';
  },
  newday: (f, el) => { const p = db.programs.find(x => x.id === el.dataset.id); p.days.push({ id: uid(), name: f.get('name').trim(), exercises: parseLines(f.get('text') || '') }); },
  addex: (f, el) => { const d = db.programs.find(x => x.id === el.dataset.id).days.find(x => x.id === el.dataset.day); d.exercises = d.exercises.concat(parseLines(f.get('text'))); },
  report: f => { route.from = f.get('from'); route.to = f.get('to'); }
};

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-tab]'); if (!t) return;
  if (t.dataset.tab) { go({ tab: t.dataset.tab }); return; }
  if (t.tagName === 'SELECT') return;
  if (ACT[t.dataset.act]) ACT[t.dataset.act](t.dataset, t);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.tagName === 'SELECT' && ACT[t.dataset.act]) ACT[t.dataset.act](t.dataset, t);
  if (t.id === 'imp' && t.files[0]) {
    const r = new FileReader();
    r.onload = () => { try { const x = JSON.parse(r.result); if (!x.programs || !x.sessions) throw 0; if (confirm('Replace everything on this device with the backup?')) { db = x; save(); go({ tab: 'home' }); } } catch (err) { alert('That file is not a LiftOS backup.'); } };
    r.readAsText(t.files[0]);
  }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  const el = e.target, fn = FORMS[el.dataset.form]; if (!fn) return;
  if (fn(new FormData(el), el) !== 'nav') { save(); render(); }
});
document.addEventListener('input', e => {
  const t = e.target; if (!db.draft) return;
  if (t.dataset.f === 'notes') { db.draft.notes = t.value; save(); }
  else if (t.dataset.ex !== undefined && t.dataset.f) {
    const L = db.draft.logs[t.dataset.ex] = db.draft.logs[t.dataset.ex] || [], i = +t.dataset.i;
    while (L.length <= i) L.push({ weight: null, reps: null });
    L[i][t.dataset.f] = num(t.value); save();
  }
});

/* ---------- PNG report ---------- */
function reportPng(text) {
  const W = 1080, P = 70, LH = 50, c = document.createElement('canvas'), x = c.getContext('2d');
  x.font = '34px -apple-system, Helvetica, Arial, sans-serif';
  const lines = [];
  text.split('\n').forEach(l => {
    if (!l) { lines.push(''); return; }
    let cur = '';
    l.split(' ').forEach(w => { const t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > W - 2 * P && cur) { lines.push(cur); cur = '  ' + w; } else cur = t; });
    lines.push(cur);
  });
  c.width = W; c.height = P * 2 + LH * (lines.length + 1);
  x.fillStyle = '#0E0F11'; x.fillRect(0, 0, c.width, c.height);
  lines.forEach((l, i) => {
    x.font = i === 0 ? 'bold 56px -apple-system, Helvetica, Arial, sans-serif' : '34px -apple-system, Helvetica, Arial, sans-serif';
    x.fillStyle = i === 0 ? '#D4FF3A' : '#F2EFE9';
    x.fillText(l, P, P + 40 + i * LH + (i ? 12 : 0));
  });
  x.font = '26px -apple-system, Helvetica, Arial, sans-serif'; x.fillStyle = '#A8A59E'; x.fillText('LiftOS', P, c.height - 40);
  c.toBlob(b => {
    const f = new File([b], 'training-report.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f] }).catch(() => {});
    else window.open(URL.createObjectURL(b), '_blank');
  });
}

/* ---------- sample data ---------- */
function seedDemo() {
  const mk = (n, s, r) => ({ id: uid(), name: n, sets: s, reps: r, notes: '' });
  const days = [
    { id: uid(), name: 'Chest / Biceps', exercises: [mk('Incline Smith Machine', 4, '12/12/10/10'), mk('Cable Fly', 3, '12'), mk('EZ Bar Curl', 3, '10')] },
    { id: uid(), name: 'Back / Triceps', exercises: [mk('Cable Row', 3, '12'), mk('Lat Pulldown', 4, '10'), mk('Rope Pushdown', 3, '12')] },
    { id: uid(), name: 'Legs', exercises: [mk('Hack Squat', 4, '10/10/8/8'), mk('Leg Curl', 3, '12')] }
  ];
  const start = addDays(todayIso(), -35);
  const p = { id: uid(), name: 'Fall Recomposition', goal: 'Add muscle, stay lean', startDate: start, endDate: addDays(start, 56), days };
  const base = { 'incline smith machine': 25, 'cable fly': 20, 'ez bar curl': 40, 'cable row': 80, 'lat pulldown': 90, 'rope pushdown': 40, 'hack squat': 45, 'leg curl': 60 };
  for (let w = 0; w < 5; w++) days.forEach((d, di) => {
    const date = addDays(start, w * 7 + di * 2 + 1); if (date >= todayIso()) return;
    const logs = {}, names = {};
    d.exercises.forEach(e => {
      const k = xk(e.name), rs = e.reps.indexOf('/') > -1 ? e.reps.split('/').map(Number) : Array(e.sets).fill(+e.reps);
      names[k] = e.name; logs[k] = rs.map((r, i) => ({ weight: base[k] + w * 5 + Math.min(i, 2) * 5, reps: r }));
    });
    db.sessions.push({ id: uid(), programId: p.id, dayId: d.id, dayName: d.name, date, notes: w === 2 && di === 0 ? 'Low energy' : '', completed: true, logs, names });
  });
  db.programs.push(p); db.activeProgramId = p.id;
  for (let k = 0; k < 9; k++) db.bodyweight.push({ date: addDays(start, k * 4), weight: r1(178.4 + k * 1.1) });
  for (let k = 0; k < 7; k++) db.calories.push({ date: addDays(todayIso(), -k), calories: 2850 + (k % 3) * 60 });
  db.goals.push({ id: uid(), exercise: 'Incline Smith Machine', target: 50 });
  save();
}

/* ---------- boot ---------- */
if (typeof document !== 'undefined' && $('#app')) {
  render();
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
